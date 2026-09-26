# 06 — Lives, respawn, revival, defeat

**You own:** `backend/src/systems/lives.ts`, `backend/test/lives.test.ts`

## Death (you own player death)
- Alive with `hp === 0` → `alive = false`, `lives -= 1`, `moving = false`,
  `w.clearThreat(id)`, `w.clearModifiers(id)`, emit `player_died`, `w.fx('death')`.
  `lives > 0` → `respawnAtMs = now + PLAYER.RESPAWN_MS`. (crates.ts drops the crate.)

## Respawn
- Downed, `lives > 0`, `now >= respawnAtMs` → alive, full hp, at
  `w.nearestWalkable(MAP.BASE ± 50px)`, emit `player_respawned`.

## Revival — one shared pickup per wave
- `onWaveStart`: `w.spawnRevive` on one of `spotsOf('R')`.
- `interact` from an alive, non-carrying hero within `PLAYER.REVIVE_PICKUP_RADIUS`
  of an unclaimed pickup — only if some hero is out of lives with `revivesLeft > 0`:
  claim + remove it, revive that hero: `revivesLeft -= 1`, `lives = 1`, alive, full
  hp, at base. Emit `player_revived` (playerId = revived, targetId = rescuer),
  `w.fx('revive')`. Nobody to revive → leave the pickup alone.

## Defeat
- No player alive AND no respawn pending (every downed hero has `lives === 0`)
  → `w.endMatch(Outcome.Defeat)`.

## Test
hp 0 → lives 2, respawns at base after RESPAWN_MS on walkable ground. Out of lives
→ teammate takes the pickup → back with 1 life, second revival of the same hero
impossible. Everyone out → Defeat. One downed with a respawn pending → not Defeat.
