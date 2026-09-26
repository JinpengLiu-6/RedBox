/**
 * OWNER: see brief backend/tasks/04-boss.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createBossSystem(): System {
  return {
    id: 'boss',
    update(_w) {},
  };
}
