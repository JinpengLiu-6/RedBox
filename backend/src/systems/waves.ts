/**
 * OWNER: see brief backend/tasks/05-waves.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createWavesSystem(): System {
  return {
    id: 'waves',
    update(_w) {},
  };
}
