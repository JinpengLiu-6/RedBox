# Goblin King AI on Modal (optional)

The optional AI showcase layer for **Goblin King Heist**. It is never needed to
play: the game server only calls these endpoints when `DIRECTOR_URL` /
`DEBRIEF_URL` are set, and it falls back to its own FSM and a local recap on
any timeout or non-200 answer.

| Endpoint | In (`shared/src/events.ts`) | Out | Model (env override) |
|---|---|---|---|
| `director` (POST) | `DirectorSnapshot` | `DirectorDecision` `{focus, threatBias, taunt, reasoning}` | `gpt-6-luna`, reasoning effort `none` (`DIRECTOR_MODEL`), kept warm (`min_containers=1`) |
| `debrief` (POST) | `DebriefRequest` | `DebriefPayload` `{summary, highlights[3], mvpPlayerId}` (`shared/src/messages.ts`) | `gpt-6-sol`, reasoning effort `low` (`DEBRIEF_MODEL`) |

## Models

Both calls use the official OpenAI Python SDK and the Responses API
(`client.responses.create`). The defaults were checked against OpenAI's docs on
2026-09-26:

- **Director: `gpt-6-luna`**:
  https://developers.openai.com/api/docs/models/gpt-6-luna ("Our most efficient
  model for focused, high-volume tasks"; supports Structured Outputs, the
  Responses API and `reasoning.effort: "none"`). It runs with effort `none`,
  which https://developers.openai.com/api/docs/guides/reasoning describes as the
  setting for "latency-critical tasks that do not benefit from any reasoning".
  The game server gives up after 2.5 s, so the director has no time to think.
- **Debrief: `gpt-6-sol`**:
  https://developers.openai.com/api/docs/models/gpt-6-sol (supports Structured
  Outputs and the Responses API). OpenAI's model guidance
  (https://developers.openai.com/api/docs/guides/latest-model) puts Sol at
  "strong reasoning on demanding tasks" and Luna at "efficient, repeatable work
  at scale". The debrief runs once per match with a 15 s budget, so it gets the
  stronger model with effort `low`. `gpt-6-astra` is stronger still, but it has
  no `none` effort and costs 5x as much as Sol, and the debrief does not need it.
- **Structured Outputs**:
  https://developers.openai.com/api/docs/guides/structured-outputs
  (`text.format = {"type": "json_schema", "name", "schema", "strict": true}`).

Override any of them with non-secret env vars in the shell that runs
`modal deploy`. `app.py` copies exactly these four keys into the container
image and nothing else:

| Variable | Default | Notes |
|---|---|---|
| `DIRECTOR_MODEL` | `gpt-6-luna` | keep it small: 2.5 s budget |
| `DIRECTOR_REASONING_EFFORT` | `none` | `none`, `minimal`, `low`, ... as the model supports; `omit` drops the parameter |
| `DEBRIEF_MODEL` | `gpt-6-sol` | |
| `DEBRIEF_REASONING_EFFORT` | `low` | same values as above |

```bash
DEBRIEF_MODEL=gpt-6-astra DEBRIEF_REASONING_EFFORT=low modal deploy ai/modal/app.py
```

Choose an effort the model accepts. `gpt-6-astra` rejects `none`, for
example. A rejected request is a 503 here, and the game just plays without AI.
Every log line names the model that answered.

## Output guarantees

The response format is **strict Structured Outputs**, so the model can only
return JSON of the contract's shape. Strict mode requires every property to be
required, so `threatBias` always lists all five classes, with `null` meaning
"leave unchanged". Those nulls are dropped before the answer leaves Modal. Every
answer is then validated and clamped again:

- `focus`: a `ClassId` (`mage`, `troll`, `brawler`, `dwarf`, `warrior`) of a hero
  who is in the snapshot and alive, else `null`. Hero names and player ids from
  the model are mapped to the class id.
- `threatBias`: `ClassId` keys only, finite numbers clamped to 0.5 - 2.0.
- `taunt`: one English line in the Goblin King's voice, at most 90 characters,
  cut on a word boundary, pictographs removed. It is checked against the
  snapshot (`taunt_is_grounded`). It must name a hero who is in the match or
  state a number the snapshot backs (towers down/standing, crates `N of M`,
  `wave N`, lives, HP %, time left). It must not claim anything false: a wrong
  count, an absent hero, or a crate pinned on a hero who neither carries nor
  recently touched one. Generic words such as "wave", "base" or "one" do not
  count as facts. A taunt that fails is replaced by a fact-based line built from
  the snapshot.
- `reasoning`: one line, at most 140 characters.
- Debrief `summary`: 3 to 5 sentences, at most 900 characters. Extra sentences
  are cut. A shorter summary is padded with true fact sentences from the event
  log (502 if even that cannot reach 3). `highlights`: exactly 3 distinct lines
  of at most 120 characters, padded with true facts. `mvpPlayerId`: an id from
  `players` (the model's pick if valid, else the stat leader).

The schemas avoid numeric, length and item constraints, so they are valid for
any model the env points at. Those bounds are enforced by the validation above.

The debrief digest reads the event log as the backend really emits it. Trap
goblins come from `trap_triggered.value` (`CRATES.TRAP_GOBLINS`), not from the
once-per-wave `goblins_spawned`. A per-hero stat such as towers destroyed is
only listed when the log credits it to a hero. `towers.ts` emits
`crystal_destroyed` without a `playerId`, so towers stay a team total.

Status codes:

- `200`: contract JSON.
- `422`: the body is not a JSON object. FastAPI rejects it before our code runs.
- `502`: no usable structured answer: a refusal, an `incomplete` response
  (token cap or content filter), or text that is not a JSON object.
- `503`: OpenAI was unreachable, timed out, had no credentials, or rejected the
  request (for example an unknown model id or an unsupported reasoning effort).

Unknown or malformed fields inside a valid object are coerced or dropped, never
forwarded. The game server treats every non-200 as "no AI this time".

## Files

| File | What |
|---|---|
| `app.py` | Modal app `redbox-ai`: image, secret, model env, the two web endpoints |
| `goblin_king.py` | Pure logic: response schemas, prompts, input normalisation, output validation (no network) |
| `fixtures/snapshot.json` | A realistic mid-wave-2 `DirectorSnapshot` (all five heroes) |
| `fixtures/debrief.json` | A full 3-wave victory `DebriefRequest` consistent with the snapshot; event shapes match `backend/src/systems` |
| `tests/` | Offline pytest suite: a fake OpenAI client, plus the real SDK over an in-process mock transport. Network is disabled and no key is read |

## Test locally (no keys, no network)

```bash
python3 -m venv /tmp/redbox-modal-venv
/tmp/redbox-modal-venv/bin/pip install -r ai/modal/requirements-dev.txt
/tmp/redbox-modal-venv/bin/python -m pytest ai/modal/tests -q     # from the repo root
```

The tests compare the response schemas, class ids, event types and DIRECTOR
bounds with `shared/src/*.ts` directly, so a contract change on either side
fails here first. They also check each schema against OpenAI's strict-mode rules
(all properties required, `additionalProperties: false`).

## Deploy (you, when ready)

Everything below runs from the repo root with the venv above
(`source /tmp/redbox-modal-venv/bin/activate`).

**1. Log in to YOUR Modal workspace.** Deploying bills the workspace of the
active profile.

```bash
modal token new --activate      # browser login; saves a profile and makes it active
modal profile current           # the one `modal deploy` will use
modal profile list              # all profiles; `modal profile activate <name>` to switch
```

**2. Create the secret** `openai` with your key in `OPENAI_API_KEY`. The app
refuses to deploy without it. `read -s` prompts without echoing: paste the key
and press Enter. The key never lands in your shell history:

```bash
read -s OPENAI_API_KEY && modal secret create openai OPENAI_API_KEY="$OPENAI_API_KEY"; unset OPENAI_API_KEY
modal secret list               # confirm it exists (values are never shown)
```

Add `--force` after `create` to replace an existing secret. The code never
reads the key. The OpenAI SDK picks it up from the container environment.

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

**4. Point the game server at them.** On Railway, open the game server service,
go to **Variables**, add `DIRECTOR_URL` and `DEBRIEF_URL` with the two URLs, and
deploy the change. From the CLI:

```bash
railway variables --set "DIRECTOR_URL=https://<workspace>--redbox-ai-director.modal.run" \
                  --set "DEBRIEF_URL=https://<workspace>--redbox-ai-debrief.modal.run"
```

The backend reads them as plain environment variables
(`backend/src/ai/director.ts` / `debrief.ts`). To run the server locally:

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
# {"focus":"dwarf","threatBias":{"troll":0.7,"dwarf":1.8},
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

Logs print one line per request with the endpoint, model, status and latency.
They never contain prompts or keys. Read them with `modal app logs redbox-ai`.

## Cost and safety notes

- `min_containers=1` keeps one director container running (and billed) for as
  long as the app is deployed. After the demo: `modal app stop redbox-ai`.
- The endpoints are public URLs. Spend is bounded by `max_containers` (3 for the
  director, 2 for the debrief) and `max_output_tokens` (800 / 4000, reasoning
  included), but do not publish the URLs. Modal proxy auth
  (`requires_proxy_auth=True`) would lock them down, but then the game server
  would have to send `Modal-Key` / `Modal-Secret` headers, which brief 09 does
  not do.
- Requests are sent with `store: false`, so OpenAI does not keep match logs for
  later retrieval through the API.
- The debrief container is not kept warm. A cold start adds a few seconds
  against the 15 s budget, and `scaledown_window=300` keeps it alive between
  back-to-back matches.
- Player names in the debrief request are chosen by users. They are sanitised
  and quoted as data in the prompt, and they cannot change the output shape.
