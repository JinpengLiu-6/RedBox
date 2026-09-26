# 03 — Crystal towers

**You own:** `backend/src/systems/towers.ts`, `backend/test/towers.test.ts`

## onWaveStart
- One `new Crystal()` on each of `spotsOf('T')` (3), hp = maxHp = `TOWERS.HP`.

## every tick
- Tower `hp === 0 && !destroyed` → `destroyed = true`, `state.crystalsDestroyed += 1`,
  `state.bossDamageMult = bossDamageMultiplier(state.crystalsDestroyed)`
  (1.00 / 1.25 / 1.50 / 1.75), `w.fx('crystal_break')`, emit `crystal_destroyed`.
- Towers ONLY affect boss damage received. The boss is damageable from the start.
- Every hero can damage towers (combat/skills target them as hostiles).

## Test
Destroy towers one by one → multiplier 1.25, 1.5, 1.75; a destroyed tower never
counts twice. `onWaveStart` again → 3 fresh towers, multiplier 1.0 (integrator resets it).
