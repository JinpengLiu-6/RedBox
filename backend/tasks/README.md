# Backend fan-out — Goblin King Heist

One agent per brief, each in its own workspace off `main`. Prompt:

> Read `backend/tasks/00-RULES.md`, then `backend/tasks/<brief>.md`, and do it.

| Brief | Owns | Priority |
|---|---|---|
| 01-crates | `systems/boxes.ts` | **critical** — the wave objective |
| 02-combat | `systems/combat.ts` | **critical** |
| 04-boss | `ai/boss.ts` | **critical** |
| 05-goblins | `systems/goblins.ts` | **critical** |
| 06-lives | `systems/lives.ts` | **critical** |
| 03-towers | `systems/towers.ts` | high (small) |
| 08a-heroes-ranged | `classes/mage.ts`, `classes/dwarf.ts` | high |
| 08b-heroes-melee | `classes/troll.ts`, `brawler.ts`, `warrior.ts` | high |
| 07-bots | `ai/bots.ts` | solo/dev mode |
| 09-ai-backend | `ai/director.ts`, `ai/debrief.ts` | optional showcase |
| 10-ai-modal | `ai/modal/**` | optional showcase |

No brief depends on another: everyone codes against `World` and tests in the
headless harness.

Integrator-owned (never edited by agents): `shared/**`, `backend/src/world.ts`
(walls, pathfinding, damage rules, **wave flow**), `room.ts` (lobby, restart,
disconnect), `index.ts`, `stub.ts`, `systems/{index,movement,abilities}.ts`,
`classes/index.ts`, `sim/harness.ts`.

## Integration
```bash
npm run typecheck && npm test && npm run validate
npm run server        # real systems
npm run client        # play (5 tabs = 5 players; fewer = bots fill)
```
