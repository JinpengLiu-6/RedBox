# Backend + AI fan-out

Launch one agent per brief, each in its own workspace. Prompt for each:

> Read `backend/tasks/00-RULES.md`, then `backend/tasks/NN-*.md`, and do it.

| # | Brief | Owns | Depends on |
|---|---|---|---|
| 01 | boxes | `systems/boxes.ts` | — |
| 02 | combat | `systems/combat.ts` | — |
| 03 | crystals | `systems/crystals.ts` | — |
| 04 | boss | `ai/boss.ts` | — |
| 05 | waves | `systems/waves.ts` | — |
| 06 | lives | `systems/lives.ts` | — |
| 07 | bots | `ai/bots.ts` | — |
| 08 | classes | `classes/*.ts` | — |
| 09 | AI backend | `ai/director.ts`, `ai/debrief.ts` | — |
| 10 | AI Modal | `ai/modal/**` | — |

"Depends on: —" everywhere is the point: every agent codes against `World` and
tests in the headless harness, so nobody waits for anybody.

Integrator-owned (agents never edit): `shared/**`, `backend/src/world.ts`,
`room.ts`, `index.ts`, `stub.ts`, `systems/index.ts`, `systems/movement.ts`,
`systems/abilities.ts`, `classes/index.ts`, `sim/harness.ts`.

## Integration (after merges)
```bash
npm run typecheck && npm test          # every agent's test + core
npm run server                          # real systems (not the stub)
npm run client                          # play it
DIRECTOR_URL=… DEBRIEF_URL=… npm run server   # with Modal
```
