/** Owned by the integrator. Moves every live, unstunned player along its intent. */

import { MAP, effectiveSpeed, type System } from '@redbox/shared';

export function createMovementSystem(): System {
  return {
    id: 'movement',
    update(w) {
      for (const p of w.alivePlayers()) {
        const intent = w.intentFor(p.id);
        if (!intent || w.modifier(p.id, 'stunned', 0) > 0) { if (p.moving) p.moving = false; continue; }
        const speed = effectiveSpeed(p, w.now) * w.modifier(p.id, 'speedMult');
        const nx = Math.min(MAP.WIDTH_PX, Math.max(0, p.x + intent.x * speed * w.dt));
        const ny = Math.min(MAP.HEIGHT_PX, Math.max(0, p.y + intent.y * speed * w.dt));
        if (w.walkable(nx, ny)) { p.x = nx; p.y = ny; }
        p.facing = Math.atan2(intent.y, intent.x);
        p.moving = true;
      }
    },
  };
}
