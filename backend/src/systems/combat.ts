/**
 * OWNER: see brief backend/tasks/02-combat.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 */

import type { System } from '@redbox/shared';

export function createCombatSystem(): System {
  return {
    id: 'combat',
    update(_w) {},
  };
}
