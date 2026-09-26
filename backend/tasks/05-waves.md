# 05 — Creep waves (goblins)

**You own:** `backend/src/systems/waves.ts`, `backend/test/waves.test.ts`

## Spawning
- First wave at `WAVES.FIRST_SPAWN_MS`, then every `WAVES.INTERVAL_MS`.
- `totalCrystals` = sum of `CRYSTALS.PER_STAGE` for finished stages + `state.crystalsDestroyed`.
- Count = `BASE_COUNT + COUNT_PER_CRYSTAL * totalCrystals`, capped so live creeps ≤ `MAX_ALIVE`.
- `w.spawnCreep(pos, state.stage)`, then set `hp = maxHp = CREEP_HP + CREEP_HP_PER_CRYSTAL * totalCrystals`.
- Spawn points: 4 fixed points on map edges away from base. Honour
  `state.director.spawnHint`: `flank` → side points, `base` → the point nearest base,
  `choke` → mid-map, otherwise random. This is how the AI director shapes waves.
- Emit `wave_spawned` with `value` = count.

## Creep AI (every tick, every creep)
- Stunned (`w.modifier(c.id, 'stunned', 0) > 0`) → skip.
- Target: nearest alive, non-phased player within 700px; none → drift toward `MAP.BOSS_ZONE`.
- Move with `w.nextStep` at `WAVES.CREEP_SPEED`, set `creep.targetId`.
- Melee within 36px, per-creep cooldown 1000ms:
  `w.damage(player, CREEP_DAMAGE + CREEP_DAMAGE_PER_CRYSTAL * totalCrystals)`.

## Deaths (you own creeps)
- `hp === 0` → `w.fx('explosion', c)`, `w.removeEntity('creep', c.id)`.
  Note: boxes.ts also spawns ambush creeps — they are yours to run once spawned.

## Test
After FIRST_SPAWN_MS creeps exist; a creep near a player closes in and damages
it; a creep at hp 0 is removed next tick.
