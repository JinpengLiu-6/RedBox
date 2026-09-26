# 10 — Optional AI on Modal: Goblin King voice + debrief

**You own:** everything under `ai/modal/` (new directory). Python only.

**Scope note:** optional showcase layer on top of an FSM game (see 09). It must
never be required for play.

## Contract (fixed — read `shared/src/events.ts`)
- `POST director`: `DirectorSnapshot` → `DirectorDecision` (`focus`, `threatBias`,
  `taunt`, `reasoning`).
- `POST debrief`: `DebriefRequest` → `DebriefPayload` (`summary`, `highlights[3]`,
  `mvpPlayerId`).
Exact field names/types — the server silently ignores anything else.

## Build
- `ai/modal/app.py`: Modal app `redbox-ai`, two POST web endpoints (check the
  current decorator in Modal docs: `@modal.fastapi_endpoint`; older: `web_endpoint`).
- Claude via the Anthropic SDK; key from Modal secret `anthropic`
  (`ANTHROPIC_API_KEY`). Director: `claude-haiku-4-5-20251001` (server timeout is
  2.5s). Debrief: `claude-sonnet-5`. Force the schema with tool use / structured
  output. Use the `claude-api` skill for exact SDK usage.
- Director warm (`min_containers=1`) so the demo never hits a cold start.
- `ai/modal/fixtures/{snapshot,debrief}.json`, `ai/modal/README.md` (deploy + curl).

## Voice
The **Goblin King**. **English.** Taunts ≤ 90 chars, menacing and funny, naming
concrete facts from the snapshot (who carries a crate, who is low, how many
towers fell). Heroes: Elf Mage, Axe Troll, Human Brawler, Dwarf Demolitionist,
Dual-Blade Warrior. Bias 0.5–2.0, focus carriers when crates are in play.
`reasoning` = one plain line for the "AI intent" panel. Debrief: 3–5 sentence
heist recap in his voice, 3 highlights, MVP from `players`.

## Done when
`modal deploy ai/modal/app.py` works; curl with both fixtures returns valid JSON;
warm director p50 < 1.5s over 5 calls. Report both URLs (→ backend env
`DIRECTOR_URL` / `DEBRIEF_URL`).
