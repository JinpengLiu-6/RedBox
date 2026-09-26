/**
 * Owned by the integrator. EVERY system is pre-registered here in execution
 * order, so no agent ever edits this file. Order matters:
 *   bots produce intents/commands first; movement and actions consume them;
 *   crates resolve interactions before lives (revive pickups);
 *   owners of hp detect deaths after all damage for the tick has landed;
 *   the optional AI layer reads the settled state last.
 */

import type { System } from '@redbox/shared';
import { createBossSystem } from '../ai/boss.js';
import { createBotsSystem } from '../ai/bots.js';
import { createDebriefSystem } from '../ai/debrief.js';
import { createDirectorSystem } from '../ai/director.js';
import { createVoiceSystem } from '../ai/voice.js';
import { createAbilitySystem } from './abilities.js';
import { createBoxesSystem } from './boxes.js';
import { createCombatSystem } from './combat.js';
import { createGoblinsSystem } from './goblins.js';
import { createLivesSystem } from './lives.js';
import { createMovementSystem } from './movement.js';
import { createTowersSystem } from './towers.js';

export function realSystems(): System[] {
  return [
    createBotsSystem(),
    createMovementSystem(),
    createAbilitySystem(),
    createCombatSystem(),
    createBoxesSystem(),
    createBossSystem(),
    createGoblinsSystem(),
    createTowersSystem(),
    createLivesSystem(),
    createDirectorSystem(),
    // Right after the director: speaks the taunt it just wrote (optional, off without VOICE_URL/VOICE_TOKEN).
    createVoiceSystem(),
    createDebriefSystem(),
  ];
}
