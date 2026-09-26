/**
 * OWNER: see brief backend/tasks/08a-heroes-ranged.md
 * The three mage skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.mage.abilities[n].params), never literals.
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const mageModule: ClassModule = {
  classId: 'mage',
  abilities: [notYet, notYet, notYet],
};
