# 08a — Hero skills: Elf Mage + Dwarf Demolitionist

**You own:** `backend/src/classes/mage.ts`, `backend/src/classes/dwarf.ts`,
`backend/test/heroes-ranged.test.ts`

The dispatcher already validated alive / not carrying / unlocked for this wave /
off cooldown, and starts the cooldown only if your handler returns `true`.
`ctx.params` = `CLASSES.<hero>.abilities[slot].params`, `ctx.aim` = mouse point,
`ctx.range` = max cast distance. Hostiles = goblins, towers, `'boss'` — never players.

Delayed effects use a **hazard** (`w.spawnHazard`) so the client can draw the
telegraph; detonate it in your module's `tick(w, player)` when
`now >= hazard.detonateAtMs` (filter `state.hazards` by `ownerId === player.id` and
`kind`), then `w.removeEntity('hazard', id)`. Hazards are cleared between waves.

**Elf Mage**
- `frost_wave` (Q): hostiles within `range` inside `arcDeg` toward aim: `damage`,
  plus slow via `addModifier(id, 'speedMult', slowMult, slowMs)` (boss too — slows are allowed).
- `blink` (E): teleport toward aim, capped at `range`, landing via
  `w.nearestWalkable`; refuse (return false) if no line of sight to the landing point.
- `meteor` (R): hazard at aim (clamped to range), `detonateAtMs = now + delayMs`,
  `radius`; on detonation `damage` to hostiles within radius, `w.fx('meteor')`.

**Dwarf Demolitionist**
- `grenade` (Q): hazard, `delayMs`, small `radius` explosion, `damage`.
- `mine` (E): hazard with `detonateAtMs = 0` (armed); in `tick`, a goblin within
  `triggerRadius` (or the boss) detonates it (`radius`, `damage`); expires after `lifetimeMs`.
- `mega_bomb` (R): hazard, long `delayMs`, large `radius`, big `damage`.
- Every explosion: `w.fx('explosion' | ability id, pos, { value: radius })`.

## Test
Frost wave damages + slows a goblin in the cone and misses one behind the mage.
Blink never lands in a wall. Meteor deals damage only after its delay. Mine
waits, then explodes when a goblin walks in.
