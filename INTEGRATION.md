# Backend / Frontend contract — Goblin King Heist

Two halves, one seam. Everything both sides must agree on lives in `shared/`.

## Run it

```bash
npm install
npm run check        # typecheck + contract validation (plan numbers, map reachability)
npm run stub         # terminal 1 - fake simulation, real protocol   :2567
npm run client       # terminal 2 - debug view                       :5173
npm run seam         # terminal 3 - asserts the seam end to end
```

`npm run stub` is the real room, schema and message routing with a scripted
simulation: waves, 15 crates, real pickup/delivery, trap goblins, towers falling,
boss telegraphs, goblins, director lines. Build the whole client against it; the
real systems change nothing the client can observe. `npm run server` = real systems.

## Ownership

| Area | Owner |
|---|---|
| `shared/src/**` | **both** — tell the other side before changing |
| `backend/src/**` | backend |
| `frontend/src/**` except `net.ts` | frontend |
| `frontend/src/net.ts`, `e2e/seam-check.ts` | **both** |

## The arena: `shared/src/map.ts`

ONE ASCII grid (`ARENA_ROWS`, 64×32 tiles of 32px) that the server collides and
pathfinds against and the client renders. `#` wall, `.` floor, `,` grass, `B`
base, `T` towers, `c` crate spots, `K` boss, `R` revival, `g` goblin guards.
Draw walls from it — if the client draws walls the grid doesn't have, heroes
walk through them. To change the layout, edit the grid; `npm run validate`
proves everything stays reachable.

## Client API (`net.ts`) — the only thing that talks to the server

| Input | Call |
|---|---|
| WASD | `net.move(dx, dy)` — only when the direction changes |
| Left click | `net.attack(worldX, worldY)` — mouse aim in WORLD px |
| Q / E / R | `net.useAbility(0 \| 1 \| 2, worldX, worldY)` |
| F | `net.interact()` — pick up / drop crate, grab revival |
| End screen | `net.restart()` — back to lobby, same party |
| Lobby | `net.pickClass(id)`, `net.ready()` |

Positions: `net.positionOf(id, fallback)` (interpolated, 100ms behind). Never
render raw `x/y`. Guard the first frames: state is empty until the first patch.

## What the HUD reads (all authoritative, never computed client-side)

| HUD | State |
|---|---|
| `WAVE n / 3` | `state.stage` |
| `CRATES a / b` | `state.boxesDelivered` / `state.boxesRequired` |
| Boss bar | `boss.hp / boss.maxHp`; `boss.alive === false` → "Defeated" |
| Tower icons | `state.crystals` (3), `destroyed` |
| Boss damage bonus | `state.bossDamageMult` (1.00 / 1.25 / 1.50 / 1.75) |
| Party | `players`: name, `hp/maxHp`, `lives`, `alive`, `connected`, `isBot` ("(bot)") |
| Skill locks | `player.ranks[slot] === 0` → label `SLOT_UNLOCK_LABEL[slot]` ("Wave 2"/"Wave 3") |
| Cooldowns | `abilityCooldownProgress(player, slot, state.elapsedMs)` |
| Carrying | `player.carryingBoxId !== ''` (attacks and skills disabled, slower) |
| Crate scan | `box.scan` (0..100), `box.mark` once revealed |
| Final objective | `state.bossRequired` → "Defeat the Goblin King" once crates are in |

Heroes (`CLASSES`): Elf Mage, Axe Troll, Human Brawler, Dwarf Demolitionist,
Dual-Blade Warrior. Ring colours are in `ClassSpec.color`. UI text is English.

## Telegraphs and effects

- **Boss**: `boss.attack` (`sweep`/`slam`/`charge`), lands at `boss.attackAtMs` at
  `(attackX, attackY)`. Fill the danger area from now until then — that is the
  dodge window. Sizes: `BOSS.ATTACKS`.
- **Goblins**: `creep.windupUntilMs > state.elapsedMs` → draw "!".
- **Hazards** (`state.hazards`): meteor, grenade, mine, mega bomb. Circle of
  `radius`, filling until `detonateAtMs` (0 = armed mine).
- **One-shot FX**: `fx` messages, `FxKind` in `messages.ts` (closed union; ability
  effects use the ability id). `angle` is set for attacks.

## The integrity rule

**Unscanned closed crates are identical.** Real vs trap exists only on the
server until someone presses F or finishes a scan. A hero standing still next to
a closed crate scans it: `box.scan` 0..100 is the progress bar, and at 100
`box.mark` becomes `Real` or `Fake` (the crate stays closed; a scanned trap still
breaks if opened). Damage resets the scan; the dwarf scans 2x faster
(`ClassSpec.scanSpeed`, `CRATES.SCAN_MS`). `state = Dropped` means someone
carried it, so it is known real. Nothing else may differ between crates.

**Final wave.** `state.bossRequired` is true in wave 3: the match is won only
when the crates are delivered AND the boss is down. Carriers move at
`CRATES.CARRY_SPEED_MULT` speed.

## Version pins — do not casually upgrade

| Package | Pin | Why |
|---|---|---|
| `colyseus` | `0.16.5` | server 0.18 returns a seat reservation `colyseus.js` cannot parse |
| `colyseus.js` | `0.16.22` | newest released browser client; there is no 0.18 client |
| `@colyseus/schema` | `^3.0.0` | required peer of colyseus 0.16 |

## Traps already paid for

- Schema fields have no implicit default → every field declares one.
- `schema.ts` is server-only at runtime; the client imports types only, runtime
  enums live in `enums.ts`.
- `PROTOCOL_VERSION` is **3** (crate scan, final-wave boss). Bump it whenever the wire shape
  changes; the server then rejects stale clients with a clear error.

## Changing the contract

1. Say what and why. 2. Edit `shared/src/**`. 3. Bump `PROTOCOL_VERSION` if the
wire changed. 4. `npm run check` and `npm run seam` pass.
