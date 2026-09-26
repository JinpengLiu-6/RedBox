# Goblin King AI on Modal (optional)

The optional AI showcase layer for **Goblin King Heist**. It is never needed to
play: the game server only calls these endpoints when `DIRECTOR_URL` /
`DEBRIEF_URL` / `VOICE_URL` are set, and it falls back to its own FSM, a local
recap and text-only taunts on any timeout or non-200 answer.

| Endpoint | In (`shared/src/events.ts`) | Out | Model (env override) |
|---|---|---|---|
| `director` (POST) | `DirectorSnapshot` | `DirectorDecision` `{focus, threatBias, taunt, reasoning}` | `gpt-6-luna`, reasoning effort `none` (`DIRECTOR_MODEL`), kept warm (`min_containers=1`) |
| `debrief` (POST) | `DebriefRequest` | `DebriefPayload` `{summary, highlights[3], mvpPlayerId}` (`shared/src/messages.ts`) | `gpt-6-luna`, reasoning effort `low` (`DEBRIEF_MODEL`) |
| `voice` (POST, needs header `x-voice-token`) | `{text, kind: "taunt" \| "recap"}` | raw Ogg Opus bytes (`audio/ogg`) | Gradium TTS, voice "Garrett" (`GRADIUM_VOICE_ID`) |

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
  The game server gives up after 6 s (measured warm round trip 2.2-2.9 s), so the director has no time to think.
- **Debrief: `gpt-6-luna`** too, effort `low`. The model never sees the raw
  event log: `goblin_king.debrief_prompt` turns it into a ~600-token fact sheet
  (1,500 events still produce ~600 tokens), so the cheapest model writes a good
  recap. `gpt-6-sol` also works (`DEBRIEF_MODEL=gpt-6-sol modal deploy ...`) but
  costs 20x as much: $2.00 / $10.00 vs $0.10 / $0.50 per 1M input / output tokens
  (https://developers.openai.com/api/docs/pricing). Estimated cost per match with
  Luna: well under one US cent for ~35 director calls plus one debrief.
- **Structured Outputs**:
  https://developers.openai.com/api/docs/guides/structured-outputs
  (`text.format = {"type": "json_schema", "name", "schema", "strict": true}`).

Override any of them with non-secret env vars in the shell that runs
`modal deploy`. `app.py` copies exactly these four keys into the container
image and nothing else:

| Variable | Default | Notes |
|---|---|---|
| `DIRECTOR_MODEL` | `gpt-6-luna` | keep it small: 6 s budget, measured 2.2-2.9 s |
| `DIRECTOR_REASONING_EFFORT` | `none` | `none`, `minimal`, `low`, ... as the model supports; `omit` drops the parameter |
| `DEBRIEF_MODEL` | `gpt-6-luna` | Sol works too, at 20x the price |
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

## Voice (Gradium text-to-speech)

The game server sends each new LLM taunt (and the end-of-match recap) to
`voice` and broadcasts the audio to every browser. Text is always shown first.
The audio is a bonus, and any non-200 answer just means "no voice this time".
All logic lives in `voice.py`; `app.py` only wires it to the endpoint.

**Request.** `POST` JSON `{"text": string, "kind": "taunt" | "recap"}` with the
header `x-voice-token: <VOICE_TOKEN>`. The endpoint turns text into billed audio,
so it is never open. The token is compared in constant time
(`hmac.compare_digest`). A missing or wrong token gets `401` before the body is
even read, and an empty `VOICE_TOKEN` in the container rejects everyone.

**Sanitising.** The text is NFKC-normalised. `<` and `>` are removed, including
their full-width look-alikes, which blocks Gradium tag injection such as
`<break time="9s"/>`. Control and format characters are dropped, and whitespace
collapses to single spaces. The text is then capped at **120 characters for a
taunt** and **600 for a recap**. The cut falls at a sentence end or word
boundary when one exists in the second half of the budget. Text that ends up
empty is a `422`.

**Upstream.** `POST https://api.gradium.ai/api/post/speech/tts` with headers
`x-api-key` and `Content-Type: application/json`, and the body

```json
{"text": "...", "voice_id": "POBHtemksfWQbng0", "output_format": "opus",
 "only_audio": true, "model_name": "default", "json_config": "{\"padding_bonus\": 0.5}"}
```

`json_config` is a JSON document inside a string, as Gradium expects. The answer
is raw Ogg Opus. Anything other than a `200` whose body starts with `OggS` is a
failure. Redirects are not followed, because they would carry `x-api-key`
somewhere else.

**Deadline.** One wall-clock deadline covers the whole upstream call: connect,
response headers and the full body download. It is **6 s for a taunt and 18 s
for a recap**. The game server aborts after 8 s / 22 s, which leaves about
2 s / 4 s for Modal routing on a warm container. That is the only guarantee: the
deadline starts inside the function, so a cold start can push the answer past
the game server's abort (see "Cost and safety notes"). httpx's own timeouts
apply per read, so a body that trickles in a piece every few hundred ms never
trips them. `fetch_speech` wraps the whole call in `asyncio.timeout` instead. A
test shows the difference over a real socket.

**Responses.**

- `200`: the Ogg Opus bytes, `Content-Type: audio/ogg`, and
  `x-voice-chars: <n>`, the number of characters sent to Gradium (the billed amount).
- `401`: missing or wrong `x-voice-token`.
- `422`: the body is not `{"text": string, "kind": "taunt" | "recap"}`, is over
  16 KB, or the text is empty after sanitising.
- `502`: Gradium was unreachable, answered non-200, or sent something that is
  not Ogg. `detail` is a short reason such as `status_429`, `not_ogg` or
  `ConnectError`.
- `503`: `GRADIUM_API_KEY` is empty in the container.
- `504`: the deadline passed.

Errors are JSON `{"error", "detail"}`. Neither the key nor the token ever
appears in a response, an error detail or a log line. Failures carry status
codes and exception type names only. Each request logs one line, for example
`voice kind=taunt status=200 chars=57 bytes=21874 ms=812`. The text is never
logged.

**Voice.** The default is Gradium's "Garrett" (`POBHtemksfWQbng0`), a smooth,
low US male. To pick another voice, set `GRADIUM_VOICE_ID` in the shell that
deploys. It is baked into the image like the model overrides. Only letters,
digits, `_` and `-` are accepted; anything else falls back to the default.

```bash
GRADIUM_VOICE_ID=<voice id> modal deploy ai/modal/app.py
```

**Cost.** Gradium bills **1 credit per character** sent, and the free plan is
about 45,000 credits a month. A taunt costs at most 120 credits (director
taunts are at most 90 characters). A recap costs at most 600. The game server
voices at most `VOICE_MAX_LINES` taunts per match (default 20), so a full match
costs at most about 20 x 90 + 600 = 2,400 credits. That is roughly 18 matches a
month on the free plan. Set `VOICE_RECAP=0` on the game server to skip the
recap. Use `x-voice-chars` and the log line to track spend.

## Files

| File | What |
|---|---|
| `app.py` | Modal app `redbox-ai`: image, secrets, model/voice env, the three web endpoints |
| `goblin_king.py` | Pure logic: response schemas, prompts, input normalisation, output validation (no network) |
| `voice.py` | Voice logic: token check, sanitising, the Gradium request, the deadline-bounded download and the Ogg check. The HTTP client is injected |
| `fixtures/snapshot.json` | A realistic mid-wave-2 `DirectorSnapshot` (all five heroes) |
| `fixtures/debrief.json` | A full 3-wave victory `DebriefRequest` consistent with the snapshot; event shapes match `backend/src/systems` |
| `tests/` | Offline pytest suite: a fake OpenAI client, the real SDK over an in-process mock transport, and a fake Gradium on `httpx.MockTransport`. Network is disabled and no key is read. One voice test allows loopback connections to a server it starts on 127.0.0.1 |

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

**2. Create the secrets.** The app refuses to deploy unless both secrets exist
with these keys. The check covers the whole app, so create them before the next
deploy even if you do not want voice yet:

| Secret | Keys | Used by |
|---|---|---|
| `openai` | `OPENAI_API_KEY`, `GRADIUM_API_KEY` | director and debrief (OpenAI), voice (Gradium) |
| `redbox-voice` | `VOICE_TOKEN` | voice: the value callers must send in `x-voice-token` |

`read -s` prompts without echoing: paste each value and press Enter. Nothing
lands in your shell history. `--force` replaces the WHOLE secret, so give
`openai` both keys in one command:

```bash
read -s OPENAI_API_KEY && read -s GRADIUM_API_KEY && \
  modal secret create --force openai OPENAI_API_KEY="$OPENAI_API_KEY" GRADIUM_API_KEY="$GRADIUM_API_KEY"
unset OPENAI_API_KEY GRADIUM_API_KEY

VOICE_TOKEN=$(openssl rand -hex 32)                 # a fresh random token
modal secret create redbox-voice VOICE_TOKEN="$VOICE_TOKEN"
railway variables --set "VOICE_TOKEN=$VOICE_TOKEN"  # the game server sends the same value (step 4)
unset VOICE_TOKEN

modal secret list               # confirm both exist (values are never shown)
```

The code never reads the OpenAI key; the OpenAI SDK picks it up from the
container environment. `voice.py` reads `GRADIUM_API_KEY` and `VOICE_TOKEN` from
the environment on each request, only to call Gradium and to check the header.
Mounting the `openai` secret also puts `OPENAI_API_KEY` into the voice
container's environment, but the voice code never reads it.

To rotate the voice token, run `modal secret create --force redbox-voice ...`
with a new value and set the same value on Railway. Running containers keep the
old value, so run `modal app stop redbox-ai` and deploy again.

**3. Deploy.**

```bash
modal deploy ai/modal/app.py
```

The output ends with three web endpoint URLs, of the form

```
https://<workspace>--redbox-ai-director.modal.run
https://<workspace>--redbox-ai-debrief.modal.run
https://<workspace>--redbox-ai-voice.modal.run
```

(`<workspace>-<env>--...` if you deploy to a non-default environment.) For a
throwaway dev URL that hot-reloads instead, use `modal serve ai/modal/app.py`.

**4. Point the game server at them.** On Railway, open the game server service,
go to **Variables**, add `DIRECTOR_URL`, `DEBRIEF_URL` and `VOICE_URL` with the
three URLs (plus `VOICE_TOKEN` from step 2), and deploy the change. From the CLI:

```bash
railway variables --set "DIRECTOR_URL=https://<workspace>--redbox-ai-director.modal.run" \
                  --set "DEBRIEF_URL=https://<workspace>--redbox-ai-debrief.modal.run" \
                  --set "VOICE_URL=https://<workspace>--redbox-ai-voice.modal.run"
```

Voice is on only when both `VOICE_URL` and `VOICE_TOKEN` are set. Two optional
variables: `VOICE_MAX_LINES` (taunts voiced per match, default 20) and
`VOICE_RECAP=0` (do not voice the recap).

The backend reads them as plain environment variables
(`backend/src/ai/director.ts` / `debrief.ts` / `voice.ts`). To run the server locally:

```bash
export DIRECTOR_URL=https://<workspace>--redbox-ai-director.modal.run
export DEBRIEF_URL=https://<workspace>--redbox-ai-debrief.modal.run
export VOICE_URL=https://<workspace>--redbox-ai-voice.modal.run
read -s VOICE_TOKEN && export VOICE_TOKEN      # the value stored in redbox-voice
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
gives up after 6 s):

```bash
for i in 1 2 3 4 5; do
  curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' -X POST "$DIRECTOR_URL" \
    -H 'content-type: application/json' --data @ai/modal/fixtures/snapshot.json
done
```

Voice (every call spends Gradium credits, one per character):

```bash
export VOICE_URL=https://<workspace>--redbox-ai-voice.modal.run
read -s VOICE_TOKEN          # paste the value stored in the redbox-voice secret

curl -sS -X POST "$VOICE_URL" -D - -o taunt.ogg \
  -H 'content-type: application/json' -H "x-voice-token: $VOICE_TOKEN" \
  --data '{"text": "Drop my crate, Dwarf! Two towers down and you still waddle.", "kind": "taunt"}'
# HTTP/2 200
# content-type: audio/ogg
# x-voice-chars: 59
file taunt.ogg               # taunt.ogg: Ogg data, Opus audio
open taunt.ogg               # macOS; or: ffplay -autoexit taunt.ogg

# Without the token: 401, and nothing is billed.
curl -sS -X POST "$VOICE_URL" -H 'content-type: application/json' \
  --data '{"text": "Hello", "kind": "taunt"}'
# {"error":"unauthorized","detail":""}
unset VOICE_TOKEN
```

Logs print one line per request with the endpoint, the model (or, for voice,
the kind and character count), the status and the latency. They never contain
prompts, taunt text, keys or the voice token. Read them with
`modal app logs redbox-ai`.

## Cost and safety notes

- `min_containers=1` keeps one director container running (and billed) for as
  long as the app is deployed. After the demo: `modal app stop redbox-ai`.
- The director and debrief endpoints are public URLs. Spend is bounded by
  `max_containers` (3 for the director, 2 for the debrief) and
  `max_output_tokens` (800 / 4000, reasoning included), but do not publish the
  URLs. Modal proxy auth
  (`requires_proxy_auth=True`) would lock them down, but then the game server
  would have to send `Modal-Key` / `Modal-Secret` headers, which brief 09 does
  not do.
- Requests are sent with `store: false`, so OpenAI does not keep match logs for
  later retrieval through the API.
- The voice endpoint requires `x-voice-token` because every call spends Gradium
  credits. Keep `VOICE_TOKEN` only in the `redbox-voice` secret and the Railway
  variables, and rotate it if it leaks. Spend is further bounded by the 120 / 600
  character caps, `max_containers=2`, and `VOICE_MAX_LINES` on the game server.
- The voice container is not kept warm (`scaledown_window=300`). The first taunt
  after a quiet spell pays a cold start, which can push it past the game
  server's 8 s abort. That taunt then stays text-only, and Gradium still bills
  its characters because the upstream call ran to completion.
- The debrief container is not kept warm. A cold start adds a few seconds
  against the 15 s budget, and `scaledown_window=300` keeps it alive between
  back-to-back matches.
- Player names in the debrief request are chosen by users. They are sanitised
  and quoted as data in the prompt, and they cannot change the output shape.
