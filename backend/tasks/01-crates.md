# 01 — Crates: the heist

**You own:** `backend/src/systems/boxes.ts`, `backend/test/crates.test.ts`

## onWaveStart
- Plan = `wavePlan(w.wave)`: `realCrates` real + `trapCrates` traps (wave 1: 3 + 12 = 15).
- Positions: seeded shuffle (`CRATES.PLACEMENT_SEED + wave`) of `spotsOf('c')`, take
  the first N. Identities: `Math.random()` — reproducible layout, random truth.
- `new Box()` (from `@redbox/shared/schema`), state `Idle`, then
  `w.addBox(box, { isReal })`. That call is the ONLY place truth is stored.

## interact (`w.commands('interact')`, in arrival order — first command wins)
- Alive, carrying → **drop** at `w.nearestWalkable(player)`: state `Dropped`, clear
  both sides, `w.fx('drop')`, emit `box_dropped`.
- Alive, not carrying, crate with state `Idle` or `Dropped` within
  `CRATES.PICKUP_RADIUS` (nearest), and nobody else resolved it this tick:
  - **Trap** (`!w.isBoxReal`): state `Triggered`, mark `Fake`, spawn
    `CRATES.TRAP_GOBLINS` via `w.spawnCreep(pos)` (already wave-scaled), remove the
    crate, `w.fx('trap')`, emit `trap_triggered`. Exactly once — a triggered crate
    can never trigger again. A trap never becomes inventory.
  - **Real**: mark `Real`, state `Carried`, `carriedBy`, `player.carryingBoxId`,
    `w.fx('pickup')`, emit `box_picked`.
- Ignore interacts near a revive pickup when no crate is in range (lives.ts owns those).

## every tick
- Carried crate follows its carrier.
- Carrier downed (`!alive`) or disconnected (`!connected && !isBot`) → drop at
  `w.nearestWalkable` (reachable, never inside a wall). Real crates are never destroyed.
- Carrier within `MAP.BASE.radius` of `MAP.BASE` → state `Delivered`, remove crate,
  clear carry, `state.boxesDelivered += 1`, `w.fx('deliver')`, emit `box_delivered`.
  Count each crate exactly once (guard on state). The integrator advances the wave.

## Test
15 crates, 3 real, all Unknown on the wire. Two players interact on the same
crate in one tick → one owner. Trap → 2 goblins, second interact does nothing.
Deliver → count 1; carrier dies → crate dropped on walkable ground.
