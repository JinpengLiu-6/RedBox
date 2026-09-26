# 05 — Red goblins

**You own:** `backend/src/systems/goblins.ts`, `backend/test/goblins.test.ts`

Goblins come from trap crates (crates.ts spawns them via `w.spawnCreep`) and from
guards you place. Once spawned, every goblin is yours to run.

## onWaveStart
- `GOBLINS.GUARDS_PER_WAVE` guards on `spotsOf('g')` via `w.spawnCreep(pos)`
  (HP already scaled 1.00/1.20/1.30 for the wave). Emit `goblins_spawned`.

## FSM per goblin: idle → chase → windup → attack → recover → (retarget)
- Stunned (`w.modifier(id, 'stunned', 0) > 0`) → behaviour `stunned`, do nothing.
- Target: nearest alive player within `AGGRO_RADIUS` that `w.reachable`; re-evaluate
  every `RETARGET_MS` and when the target dies. None → idle.
- chase: `w.nextStep` at `GOBLINS.SPEED * w.modifier(id, 'speedMult')`. Set `facing`.
- Within `ATTACK_RANGE` → `windup` for `WINDUP_MS`, set `windupUntilMs` (client shows "!").
- Land the hit only if the target is STILL in range: `w.damage(target,
  round(GOBLINS.DAMAGE * wavePlan(creep.tier).enemyMult), { sourceId: goblin.id })`.
  (Speed and attack rate are never scaled.)
- `recover` for `RECOVER_MS`, then retarget.
- Keep live goblins ≤ `MAX_ALIVE`.

## Deaths (you own goblins)
- `hp === 0` → `w.fx('death', c)`, `w.removeEntity('creep', c.id)`.

## Test
Guard spawns scaled for wave 2. Goblin paths around a wall to a player and hits
after the windup; stepping out during windup avoids the hit. hp 0 → removed.
