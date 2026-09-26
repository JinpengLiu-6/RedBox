/**
 * Owned by the integrator. Moves every live, connected, unstunned player along
 * its intent, sliding along walls instead of sticking to them.
 */

import { PLAYER, effectiveSpeed, type System, type World } from '@redbox/shared';

/** A point is clear if the hero's body (not just its centre) stays out of walls. */
function clear(w: World, x: number, y: number) {
  const r = PLAYER.RADIUS;
  return w.walkable(x - r, y - r) && w.walkable(x + r, y - r) && w.walkable(x - r, y + r) && w.walkable(x + r, y + r);
}

/** The escape rule for a body that already overlaps a wall. */
function centreOnFloor(w: World, x: number, y: number) {
  return w.walkable(x, y);
}

export function createMovementSystem(): System {
  return {
    id: 'movement',
    update(w) {
      for (const p of w.alivePlayers()) {
        const intent = p.connected || p.isBot ? w.intentFor(p.id) : undefined;
        if (!intent || w.modifier(p.id, 'stunned', 0) > 0) { if (p.moving) p.moving = false; continue; }
        const step = effectiveSpeed(p) * w.modifier(p.id, 'speedMult') * w.dt;
        const nx = p.x + intent.x * step;
        const ny = p.y + intent.y * step;
        // A body already overlapping a wall (a teleport or push put it there)
        // would have every step refused and freeze for good: until it is
        // clear again, only its centre has to stay on the floor.
        const fits = clear(w, p.x, p.y) ? clear : centreOnFloor;
        if (fits(w, nx, ny)) { p.x = nx; p.y = ny; }
        else if (fits(w, nx, p.y)) p.x = nx;
        else if (fits(w, p.x, ny)) p.y = ny;
        p.facing = Math.atan2(intent.y, intent.x);
        p.moving = true;
      }
    },
  };
}
