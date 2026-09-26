# 04 — The Goblin King

**You own:** `backend/src/ai/boss.ts`, `backend/test/boss.test.ts`

A finite-state machine. Readable, telegraphed, dodgeable. No LLM in the loop.

## onWaveStart
- `alive = true`, hp = maxHp = `round(BOSS.HP * wavePlan(w.wave).bossMult)`, at
  `MAP.BOSS_ZONE`, behaviour `idle`, clear attack fields.

## Targeting
- Candidates: alive players within `BOSS.AGGRO_RADIUS` that `w.reachable`.
- Score = `PROXIMITY * (AGGRO_RADIUS - dist) + RECENT_DAMAGE * w.threatOf(id)
  + (carrying ? CARRIER_BONUS : 0)`, times `w.threatBias(classIdOf(p))` (optional AI).
- Decay: `w.scaleAllThreat(1 - TARGETING.DAMAGE_DECAY_PER_SEC * w.dt)`.
- Keep a target at least `BOSS.TARGET_COMMIT_MS` unless it dies/becomes unreachable.
- On change: `boss.targetId`, emit `boss_target_changed`.

## FSM: idle → chase → windup → (hit) → recover → chase …
- chase: `w.nextStep` at `BOSS.SPEED * w.modifier('boss', 'speedMult')`. Beyond
  `BOSS.LEASH_RADIUS` from the zone → `returning` home, drop target.
- In range → pick the next of **sweep → slam → charge** (cycle). Set `boss.attack`,
  `attackAtMs = now + windupMs`, `attackX/Y`, behaviour `windup`. Emit `boss_attack`.
  The client draws the telegraph from these fields — the windup IS the dodge window.
- On `attackAtMs`, resolve against whoever is in the area THEN (not at windup):
  - sweep: players within `range` inside `arcDeg` toward attackX/Y.
  - slam: players within `radius` of attackX/Y.
  - charge: boss moves up to `distance` toward attackX/Y (stop at walls via
    `w.walkable` steps); players within `width/2` of the path are hit.
  Damage × `wavePlan(w.wave).bossMult`, `w.damage(id, dmg, { sourceId: 'boss' })`,
  `w.fx('boss_<attack>')`. Then `recover` for `recoverMs`, min gap `ATTACK_INTERVAL_MS`.
- Never stun-locked (the World turns stun into a slow). Never reads player input.

## Defeat (you own boss death)
- `hp === 0` → `alive = false`, behaviour `defeated`, clear attack, `w.fx('boss_defeated')`,
  emit `boss_defeated`. Gone for the rest of the wave. **Does NOT clear the wave.**

## Test
Carrier is preferred over an equally close non-carrier. Target held ≥ commit time.
Player who leaves the slam area during windup takes no damage. hp 0 → alive false,
wave still Playing.
