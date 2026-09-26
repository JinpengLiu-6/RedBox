/**
 * OWNER: see brief backend/tasks/09-ai-backend.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createDebriefSystem(): System {
  return {
    id: 'debrief',
    update(_w) {},
  };
}
