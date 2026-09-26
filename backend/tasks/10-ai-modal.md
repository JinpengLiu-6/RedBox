# 10 — AI on Modal: Goblin King director + debrief endpoints

**You own:** everything under `ai/modal/` (new directory). Python only. You do
not touch TypeScript.

## Contract (fixed — read `shared/src/events.ts`)
- `POST director`: body `DirectorSnapshot` → `DirectorDecision` JSON.
- `POST debrief`: body `DebriefRequest` → `DebriefPayload` JSON
  (`summary`, `highlights[3]`, `mvpPlayerId`).
Field names and types must match exactly; the server rejects anything else and
silently falls back to its heuristic.

## Build
- `ai/modal/app.py`: Modal app `redbox-ai`, two POST web endpoints (check the
  current decorator name in Modal docs — `@modal.fastapi_endpoint`, older code
  says `web_endpoint`).
- LLM: Claude through the Anthropic SDK, key from Modal secret `anthropic`
  (`ANTHROPIC_API_KEY`). Director: `claude-haiku-4-5-20251001` (must answer in
  well under the server's 2.5s timeout). Debrief: `claude-sonnet-5`.
  Force the schema with tool use / structured output — no free-text JSON parsing.
  Use the `claude-api` skill for exact SDK usage.
- Keep the director warm (`min_containers=1`) — a cold start during the demo is a
  silent fallback.
- `ai/modal/fixtures/snapshot.json`, `debrief.json`: realistic sample bodies.
- `ai/modal/README.md`: deploy command, the two URLs, curl examples.

## Voice
The boss is **Король гоблинов (the Goblin King)**. All text is **Russian** (the UI is
Russian). Taunts ≤ 90 chars, menacing and funny, and they MUST reference concrete
facts from the snapshot (who carries the box, who is low, who hides behind the
tank). Strategy: focus the carrier when a box is in play, punish a support whose
healing draws threat, bias values 0.5–2.0. `reasoning` = one plain line for the
on-screen "AI intent" panel.

Debrief: 3–5 sentence heist recap narrated by the Goblin King, 3 highlights, MVP
chosen from `players`.

## Done when
`modal deploy ai/modal/app.py` succeeds; curl with both fixtures returns valid
JSON; warm director p50 < 1.5s (measure 5 calls). Report both URLs in your final
message — they go into the backend env as `DIRECTOR_URL` / `DEBRIEF_URL`.
