/**
 * OWNER: see brief backend/tasks/04-boss.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 * Reset your own entities in onWaveStart; the integrator already cleared the board.
 */

import type { System } from '@redbox/shared';

export function createBossSystem(): System {
  return {
    id: 'boss',
    update(_w) {},
  };
}
