/**
 * OWNER: classes agent. Brief: backend/tasks/08-classes.md
 * Implements the three carrier abilities. Handlers return true when the ability
 * fired (cooldown starts) and false when it could not (no cooldown).
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const carrierModule: ClassModule = {
  classId: 'carrier',
  abilities: [notYet, notYet, notYet],
};
