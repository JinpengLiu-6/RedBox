/**
 * OWNER: see brief backend/tasks/08b-heroes-melee.md
 * The three warrior skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.warrior.abilities[n].params), never literals.
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const warriorModule: ClassModule = {
  classId: 'warrior',
  abilities: [notYet, notYet, notYet],
};
