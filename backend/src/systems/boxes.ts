/**
 * OWNER: see brief backend/tasks/01-boxes.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createBoxesSystem(): System {
  return {
    id: 'boxes',
    update(_w) {},
  };
}
