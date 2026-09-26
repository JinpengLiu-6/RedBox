/**
 * OWNER: see brief backend/tasks/08b-heroes-melee.md
 * The three brawler skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.brawler.abilities[n].params), never literals.
 */

import type { AbilityHandler, ClassModule } from '@redbox/shared';

const notYet: AbilityHandler = () => false;

export const brawlerModule: ClassModule = {
  classId: 'brawler',
  abilities: [notYet, notYet, notYet],
};
