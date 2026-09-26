/**
 * OWNER: classes agent. Brief: backend/tasks/08-classes.md
 * Implements the three tank abilities. Handlers return true when the ability
 * fired (cooldown starts) and false when it could not (no cooldown).
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const tankModule: ClassModule = {
  classId: 'tank',
  abilities: [notYet, notYet, notYet],
};
