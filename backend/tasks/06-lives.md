# 06 — Lives, respawn, revive resources, wipe

**You own:** `backend/src/systems/lives.ts`, `backend/test/lives.test.ts`

## Death (you own player death)
- Alive player with `hp === 0` → `alive = false`, `lives--`, `moving = false`,
  `shield = 0`, `w.clearThreat(id)`, `w.clearDebuffs(id)`, emit `player_died`,
  `w.fx('death', p)`. If `lives > 0` → `respawnAtMs = now + PLAYER.RESPAWN_MS`.
  (boxes.ts drops a carried box on its own when it sees `!alive`.)

## Respawn
- Dead, `lives > 0`, `now >= respawnAtMs` → `alive = true`, `hp = maxHp`, position =
  `MAP.BASE` ± 60px jitter, emit `player_respawned`.

## Revive resource (GDD §14)
- When a player is permanently dead (`lives === 0`, `reviveCharges > 0`) and no
  unclaimed revive exists → `w.spawnRevive(pos)` at one of 3 fixed map points
  (define them; mid-map, away from base so it is a risk to fetch).
- `interact` command from an alive player NOT carrying, within
  `PLAYER.REVIVE_PICKUP_RADIUS` of an unclaimed revive (or `targetId` starting `rv`):
  claim it, `w.removeEntity('revive', id)`, pick the first permanently-dead player
  with `reviveCharges > 0`: `reviveCharges--`, `lives = 1`, `alive = true`,
  `hp = maxHp`, at base. Emit `player_revived` (playerId = revived, targetId = rescuer).

## Wipe
- Every player `!alive && lives === 0` → `w.endMatch(Outcome.Wipe)`.

## Test
hp → 0: lives 2, respawns at base after RESPAWN_MS. Out of lives → revive spawns;
teammate interacts on it → back with 1 life. Everyone permanently dead → Wipe.
