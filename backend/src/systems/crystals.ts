/**
 * OWNER: see brief backend/tasks/03-crystals.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createCrystalsSystem(): System {
  return {
    id: 'crystals',
    update(_w) {},
  };
}
