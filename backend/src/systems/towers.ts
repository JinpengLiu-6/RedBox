/**
 * OWNER: see brief backend/tasks/03-towers.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 * Reset your own entities in onWaveStart; the integrator already cleared the board.
 */

import type { System } from '@redbox/shared';

export function createTowersSystem(): System {
  return {
    id: 'towers',
    update(_w) {},
  };
}
