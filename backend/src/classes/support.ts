/**
 * OWNER: classes agent. Brief: backend/tasks/08-classes.md
 * Implements the three support abilities. Handlers return true when the ability
 * fired (cooldown starts) and false when it could not (no cooldown).
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const supportModule: ClassModule = {
  classId: 'support',
  abilities: [notYet, notYet, notYet],
};
