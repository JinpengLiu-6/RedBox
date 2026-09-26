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
        if (clear(w, nx, ny)) { p.x = nx; p.y = ny; }
        else if (clear(w, nx, p.y)) p.x = nx;
        else if (clear(w, p.x, ny)) p.y = ny;
        p.facing = Math.atan2(intent.y, intent.x);
        p.moving = true;
      }
    },
  };
}
