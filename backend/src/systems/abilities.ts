/**
 * Owned by the integrator. Validates ability commands (alive, unlocked, off
 * cooldown), calls the class module's handler, and starts the cooldown only if
 * the handler returns true. Class agents never touch cooldowns or ranks.
 */

import {
  abilityCooldownMs, abilityMagnitude, classIdOf, isAbilityReady, type System,
} from '@redbox/shared';
import { CLASS_MODULES } from '../classes/index.js';

export function createAbilitySystem(): System {
  return {
    id: 'abilities',
    update(w) {
      for (const cmd of w.commands('ability')) {
        const p = w.state.players.get(cmd.playerId);
        const slot = cmd.payload?.slot;
        if (!p || !p.alive || (slot !== 0 && slot !== 1 && slot !== 2)) continue;
        if (!isAbilityReady(p, slot, w.now)) continue;

        const classId = classIdOf(p);
        const handler = CLASS_MODULES[classId].abilities[slot];
        const ok = handler({
          world: w,
          caster: p,
          rank: p.ranks[slot] ?? 1,
          magnitude: abilityMagnitude(p, slot),
          targetId: cmd.payload.targetId,
          point: cmd.payload.x !== undefined && cmd.payload.y !== undefined
            ? { x: cmd.payload.x, y: cmd.payload.y } : undefined,
        });
        if (!ok) continue;
        p.cooldownReadyAtMs[slot] = w.now + abilityCooldownMs(p, slot);
        w.emit({ type: 'ability_used', atMs: w.now, playerId: p.id, classId, value: slot });
      }

      for (const p of w.alivePlayers()) CLASS_MODULES[classIdOf(p)].tick?.(w, p);
    },
  };
}
