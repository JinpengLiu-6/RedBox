# Goblin King AI on Modal (optional)

The optional AI showcase layer for **Goblin King Heist**. It is never needed to
play: the game server only calls these endpoints when `DIRECTOR_URL` /
`DEBRIEF_URL` are set, and it falls back to its own FSM and a local recap on
any timeout or non-200 answer.

| Endpoint | In (`shared/src/events.ts`) | Out | Model |
|---|---|---|---|
| `director` (POST) | `DirectorSnapshot` | `DirectorDecision` `{focus, threatBias, taunt, reasoning}` | `claude-haiku-4-5-20251001`, kept warm (`min_containers=1`) |
| `debrief` (POST) | `DebriefRequest` | `DebriefPayload` `{summary, highlights[3], mvpPlayerId}` (`shared/src/messages.ts`) | `claude-sonnet-5` |

Both calls use **strict tool use with a forced `tool_choice`**, so Claude can
only return JSON of the contract's shape. Every answer is then validated and
clamped again before it leaves Modal:

- `focus`: a `ClassId` (`mage`, `troll`, `brawler`, `dwarf`, `warrior`) of a hero
  who is in the snapshot and alive, else `null`. Hero names and player ids from
  the model are mapped to the class id.
- `threatBias`: `ClassId` keys only, finite numbers clamped to 0.5 - 2.0.
- `taunt`: one English line, at most 90 characters, cut on a word boundary,
  pictographs removed. It is checked against the snapshot (`taunt_is_grounded`):
  it must name a hero who is in the match or state a number the snapshot backs
  (towers down/standing, crates `N of M`, `wave N`, lives, HP %, time left), and
  it must not claim anything false (a wrong count, an absent hero, a crate pinned
  on a hero who neither carries nor recently touched one). Generic words such as
  "wave", "base" or "one" ground nothing. A taunt that fails is replaced by a
  fact-based line built from the snapshot.
- `reasoning`: one line, at most 140 characters.
- Debrief `summary`: 3 to 5 sentences, at most 900 characters. Extra sentences
  are cut; a shorter summary is padded with true fact sentences from the event
  log (502 if even that cannot reach 3). `highlights`: exactly 3 distinct lines of
  at most 120 characters (padded with true facts). `mvpPlayerId`: an id from
  `players` (the model's pick if valid, else the stat leader).

The debrief digest reads the event log as the backend really emits it: trap
goblins come from `trap_triggered.value` (`CRATES.TRAP_GOBLINS`, not from the
once-per-wave `goblins_spawned`), and a per-hero stat such as towers destroyed
is only listed when the log credits it to a hero (`towers.ts` emits
`crystal_destroyed` without a `playerId`, so towers stay a team total).

Status codes: `200` contract JSON; `422` body is not a JSON object (FastAPI
rejects it before our code runs); `502` the model gave no usable tool call;
`503` Anthropic unreachable, timed out or no credentials. Unknown or malformed
fields inside a valid object are coerced or dropped, never forwarded. The game
server treats every non-200 as "no AI this time".

## Files

| File | What |
|---|---|
| `app.py` | Modal app `redbox-ai`: image, secret, the two web endpoints |
| `goblin_king.py` | Pure logic: tool schemas, prompts, input normalisation, output validation (no network) |
| `fixtures/snapshot.json` | A realistic mid-wave-2 `DirectorSnapshot` (all five heroes) |
| `fixtures/debrief.json` | A full 3-wave victory `DebriefRequest` consistent with the snapshot; event shapes match `backend/src/systems` |
| `tests/` | Offline pytest suite (fake Anthropic client, network disabled) |

## Test locally (no keys, no network)

```bash
python3 -m venv /tmp/redbox-modal-venv
/tmp/redbox-modal-venv/bin/pip install -r ai/modal/requirements-dev.txt
/tmp/redbox-modal-venv/bin/python -m pytest ai/modal/tests -q     # from the repo root
```

The tests diff the tool schemas, class ids, event types and DIRECTOR bounds
against `shared/src/*.ts` directly, so a contract change on either side fails
here first.

## Deploy (you, when ready)

Everything below runs from the repo root with the venv above
(`source /tmp/redbox-modal-venv/bin/activate`).

**1. Pick the Modal workspace on purpose.** Deploying bills the workspace of the
active profile.

```bash
modal profile list              # all profiles; the active one is highlighted
modal profile current           # the one `modal deploy` will use
modal profile activate <name>   # switch if needed
# no profile yet?  modal token new --profile <name>
```

Every command below also accepts `--profile <name>` if you prefer not to switch.

**2. Create the secret** `anthropic` with your key in `ANTHROPIC_API_KEY`
(the app refuses to deploy without it). Either in the dashboard
(Secrets -> Create new secret -> Anthropic, name it `anthropic`), or from a shell
where the key is already exported, so it never lands in your history:

```bash
modal secret create anthropic ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"
modal secret list               # confirm it exists (values are never shown)
```

Use `--force` to replace an existing secret.

**3. Deploy.**

```bash
modal deploy ai/modal/app.py
```

The output ends with two web endpoint URLs, of the form

```
https://<workspace>--redbox-ai-director.modal.run
https://<workspace>--redbox-ai-debrief.modal.run
```

(`<workspace>-<env>--...` if you deploy to a non-default environment.) For a
throwaway dev URL that hot-reloads instead, use `modal serve ai/modal/app.py`.

**4. Point the game server at them.** The backend reads plain environment
variables (brief 09, `backend/src/ai/director.ts` / `debrief.ts`):

```bash
export DIRECTOR_URL=https://<workspace>--redbox-ai-director.modal.run
export DEBRIEF_URL=https://<workspace>--redbox-ai-debrief.modal.run
npm run server
```

Unset them (or stop the app) and the game plays exactly the same without AI.

## Smoke test with curl

```bash
export DIRECTOR_URL=https://<workspace>--redbox-ai-director.modal.run
export DEBRIEF_URL=https://<workspace>--redbox-ai-debrief.modal.run

curl -sS -X POST "$DIRECTOR_URL" \
  -H 'content-type: application/json' \
  --data @ai/modal/fixtures/snapshot.json
# {"focus":"dwarf","threatBias":{"dwarf":1.8,"troll":0.7},
#  "taunt":"Drop my crate, Dwarf! Two towers down and you still waddle.","reasoning":"..."}

curl -sS -X POST "$DEBRIEF_URL" \
  -H 'content-type: application/json' \
  --data @ai/modal/fixtures/debrief.json
# {"summary":"...","highlights":["...","...","..."],"mvpPlayerId":"Xk3fQ9aLm"}
```

Warm director latency (target: p50 under 1.5 s over 5 calls; the game server
gives up after 2.5 s):

```bash
for i in 1 2 3 4 5; do
  curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' -X POST "$DIRECTOR_URL" \
    -H 'content-type: application/json' --data @ai/modal/fixtures/snapshot.json
done
```

Logs (one line per request: endpoint, status, latency; never prompts or keys):
`modal app logs redbox-ai`.

## Cost and safety notes

- `min_containers=1` keeps one director container running (and billed) for as
  long as the app is deployed. After the demo: `modal app stop redbox-ai`.
- The endpoints are public URLs. Spend is bounded by `max_containers` (3 for the
  director, 2 for the debrief) and small `max_tokens`, but do not publish the
  URLs. Modal proxy auth (`requires_proxy_auth=True`) would lock them down, but
  the game server would then have to send `Modal-Key` / `Modal-Secret` headers,
  which brief 09 does not do.
- The debrief container is not kept warm; a cold start adds a few seconds
  against the 15 s budget, and `scaledown_window=300` keeps it alive between
  back-to-back matches.
- Player names in the debrief request are user-chosen; they are sanitised,
  quoted as data in the prompt, and cannot change the output shape.
