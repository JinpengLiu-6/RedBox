/**
 * OWNER: see brief backend/tasks/06-lives.md
 *
 * Lives, respawn, revival and defeat. This system owns player death: `damage()`
 * only subtracts HP, we detect `alive && hp === 0` and perform the transition.
 *
 * Invariants:
 *  - a death costs exactly one life and schedules a respawn only while lives remain;
 *  - a downed hero with lives respawns at base, full hp, on walkable ground;
 *  - one shared revive pickup per wave; claiming it needs a hero out of lives
 *    with `revivesLeft > 0`, otherwise the pickup is left alone;
 *  - a revived hero comes back with exactly 1 life and one fewer revive;
 *  - the base zone is the only place a hero heals (BASE_REGEN_PCT_PER_SEC);
 *  - Defeat only when nobody is alive AND nobody can still respawn.
 */

import {
  MAP, PLAYER, Outcome, classIdOf, spotsOf,
  type MatchEventType, type Player, type System, type Vec2, type World,
} from '@redbox/shared';
import type { ReviveResource } from '@redbox/shared/schema';

/** What a crate press looks like in the log once crates.ts has resolved it. */
const CRATE_RESOLUTIONS = new Set<MatchEventType>([
  'box_picked', 'box_delivered', 'box_dropped', 'trap_triggered',
]);

/** Respawn/revive scatter around the base centre, so heroes do not stack. */
const BASE_SCATTER_PX = 50;

/**
 * TUNING (candidate for PLAYER.BASE_REGEN_PCT_PER_SEC): the only healing in the
 * game. An alive hero inside the base zone recovers this fraction of max HP per
 * second: 25% -> 50% in ~3 s, empty -> full in ~12.5 s. Without it a hurt hero
 * stays hurt until the wave ends or it dies (spending a life).
 */
export const BASE_REGEN_PCT_PER_SEC = 0.08;
/**
 * Regen is paid in pulses, not per tick: heal() rounds and emits a 'heal' fx on
 * every call, so per-tick healing would be 20 fx/s per hero and lose fractions.
 */
export const BASE_REGEN_PULSE_MS = 500;

function basePoint(w: World): Vec2 {
  return w.nearestWalkable({
    x: MAP.BASE.x + (Math.random() * 2 - 1) * BASE_SCATTER_PX,
    y: MAP.BASE.y + (Math.random() * 2 - 1) * BASE_SCATTER_PX,
  });
}

function placeAtBase(w: World, p: Player) {
  const spot = basePoint(w);
  p.x = spot.x;
  p.y = spot.y;
  p.alive = true;
  p.hp = p.maxHp;
  p.respawnAtMs = 0;
  p.moving = false;
}

/**
 * Heroes whose interact crates.ts already spent this tick. It runs before us, so
 * one press must not both open a crate and claim the revive pickup next to it.
 */
function spentOnCrate(w: World): Set<string> {
  const spent = new Set<string>();
  const log = w.allEvents();
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.atMs !== w.now) break;
    if (e.playerId && CRATE_RESOLUTIONS.has(e.type)) spent.add(e.playerId);
  }
  return spent;
}

/** A hero that cannot respawn on its own and has a revive left. Downed first, then arrival order. */
function revivable(w: World): Player | undefined {
  for (const [, p] of w.state.players) {
    if (!p.alive && p.lives === 0 && p.revivesLeft > 0) return p;
  }
  return undefined;
}

export function createLivesSystem(): System {
  /** Pickup spawned this wave, if any. */
  let pickupId = '';
  /** Fractional HP each hero in the base has earned since its last pulse. */
  const regenOwed = new Map<string, number>();
  let nextRegenPulseAtMs = 0;

  function resetRegen(w: World) {
    regenOwed.clear();
    nextRegenPulseAtMs = w.now + BASE_REGEN_PULSE_MS;
  }

  function spawnPickup(w: World) {
    pickupId = '';
    const spots = spotsOf('R');
    if (spots.length === 0) return;
    const spot = spots[Math.floor(Math.random() * spots.length)]!;
    pickupId = w.spawnRevive(spot).id;
  }

  function die(w: World, p: Player) {
    p.alive = false;
    p.moving = false;
    p.lives = Math.max(0, p.lives - 1);
    p.respawnAtMs = p.lives > 0 ? w.now + PLAYER.RESPAWN_MS : 0;
    w.clearThreat(p.id);
    w.clearModifiers(p.id);
    w.fx('death', { x: p.x, y: p.y }, { sourceId: p.id });
    w.emit({ type: 'player_died', atMs: w.now, playerId: p.id, classId: classIdOf(p), value: p.lives });
  }

  function respawn(w: World, p: Player) {
    placeAtBase(w, p);
    w.emit({ type: 'player_respawned', atMs: w.now, playerId: p.id, classId: classIdOf(p), value: p.lives });
  }

  function revive(w: World, target: Player, rescuer: Player, pickup: ReviveResource) {
    pickup.claimed = true;
    w.removeEntity('revive', pickup.id);
    if (pickup.id === pickupId) pickupId = '';
    target.revivesLeft -= 1;
    target.lives = 1;
    placeAtBase(w, target);
    w.fx('revive', { x: target.x, y: target.y }, { sourceId: rescuer.id });
    w.emit({
      type: 'player_revived', atMs: w.now,
      playerId: target.id, classId: classIdOf(target), targetId: rescuer.id,
    });
  }

  function resolveDeaths(w: World) {
    for (const [, p] of w.state.players) {
      if (p.alive && p.hp <= 0) die(w, p);
    }
  }

  function resolveRespawns(w: World) {
    for (const [, p] of w.state.players) {
      if (!p.alive && p.lives > 0 && p.respawnAtMs > 0 && w.now >= p.respawnAtMs) respawn(w, p);
    }
  }

  /**
   * Alive heroes inside the base zone heal. HP accrues every tick and is paid out
   * in whole points once per pulse; leaving the zone, dying or topping up
   * forfeits the unpaid fraction. Runs after deaths so a hero at 0 hp is never
   * pulled back up.
   */
  function regenerateAtBase(w: World) {
    const pulse = w.now >= nextRegenPulseAtMs;
    if (pulse) nextRegenPulseAtMs = w.now + BASE_REGEN_PULSE_MS;
    for (const [id, p] of w.state.players) {
      if (!p.alive || p.hp >= p.maxHp || w.distance(p, MAP.BASE) > MAP.BASE.radius) {
        regenOwed.delete(id);
        continue;
      }
      let owed = (regenOwed.get(id) ?? 0) + p.maxHp * BASE_REGEN_PCT_PER_SEC * w.dt;
      if (pulse && owed >= 1) {
        const paid = Math.floor(owed);
        w.heal(id, paid);
        owed -= paid;
      }
      regenOwed.set(id, owed);
    }
  }

  function resolveRevives(w: World) {
    const handled = spentOnCrate(w);
    for (const cmd of w.commands('interact')) {
      if (handled.has(cmd.playerId)) continue;
      handled.add(cmd.playerId);
      const rescuer = w.state.players.get(cmd.playerId);
      if (!rescuer || !rescuer.alive || rescuer.carryingBoxId !== '') continue;
      const pickup = w
        .query(rescuer, PLAYER.REVIVE_PICKUP_RADIUS, { kinds: ['revive'] })
        .find((e): e is ReviveResource => !(e as ReviveResource).claimed);
      if (!pickup) continue;
      const target = revivable(w);
      if (!target) continue;
      revive(w, target, rescuer, pickup);
    }
  }

  function checkDefeat(w: World) {
    if (w.state.players.size === 0) return;
    for (const [, p] of w.state.players) {
      if (p.alive) return;
      if (p.lives > 0) return;   // respawn pending
    }
    w.endMatch(Outcome.Defeat);
  }

  return {
    id: 'lives',
    init(w) {
      pickupId = '';
      resetRegen(w);
    },
    onWaveStart(w) {
      spawnPickup(w);
      resetRegen(w);
    },
    update(w) {
      resolveRevives(w);
      resolveDeaths(w);
      resolveRespawns(w);
      regenerateAtBase(w);
      checkDefeat(w);
    },
  };
}
