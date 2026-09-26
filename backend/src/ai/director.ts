/**
 * OWNER: see brief backend/tasks/09-ai-backend.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 * Reset your own entities in onWaveStart; the integrator already cleared the board.
 */

import type { System } from '@redbox/shared';

export function createDirectorSystem(): System {
  return {
    id: 'director',
    update(_w) {},
  };
}
