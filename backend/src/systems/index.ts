/**
 * Owned by the integrator. EVERY system is pre-registered here in execution
 * order, so no agent ever edits this file. Order matters:
 *   bots produce intents/commands first; movement and actions consume them;
 *   owners of hp detect deaths after all damage for the tick has landed;
 *   AI reads the settled state last.
 */

import type { System } from '@redbox/shared';
import { createBossSystem } from '../ai/boss.js';
import { createBotsSystem } from '../ai/bots.js';
import { createDebriefSystem } from '../ai/debrief.js';
import { createDirectorSystem } from '../ai/director.js';
import { createAbilitySystem } from './abilities.js';
import { createBoxesSystem } from './boxes.js';
import { createCombatSystem } from './combat.js';
import { createCrystalsSystem } from './crystals.js';
import { createLivesSystem } from './lives.js';
import { createMovementSystem } from './movement.js';
import { createWavesSystem } from './waves.js';

export function realSystems(): System[] {
  return [
    createBotsSystem(),
    createMovementSystem(),
    createAbilitySystem(),
    createCombatSystem(),
    createBoxesSystem(),
    createCrystalsSystem(),
    createBossSystem(),
    createWavesSystem(),
    createLivesSystem(),
    createDirectorSystem(),
    createDebriefSystem(),
  ];
}
