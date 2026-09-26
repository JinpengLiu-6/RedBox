/**
 * Owned by the integrator. Validates skill commands on the server - alive, not
 * carrying, unlocked for this wave, off cooldown - calls the hero's handler and
 * starts the cooldown only if the handler returns true. Hero agents never touch
 * cooldowns, locks or carrying rules.
 */

import { classIdOf, isAbilityReady, type System } from '@redbox/shared';
import { CLASS_MODULES } from '../classes/index.js';
import { CLASSES } from '@redbox/shared';

export function createAbilitySystem(): System {
  return {
    id: 'abilities',
    update(w) {
      for (const cmd of w.commands('ability')) {
        const p = w.state.players.get(cmd.playerId);
        const slot = cmd.payload?.slot;
        if (!p || (slot !== 0 && slot !== 1 && slot !== 2)) continue;
        if (!isAbilityReady(p, slot, w.now)) continue;

        const classId = classIdOf(p);
        const spec = CLASSES[classId].abilities[slot];
        const hasAim = Number.isFinite(cmd.payload.x) && Number.isFinite(cmd.payload.y);
        const reach = spec.range ?? 200;
        const aim = hasAim
          ? { x: cmd.payload.x!, y: cmd.payload.y! }
          : { x: p.x + Math.cos(p.facing) * reach, y: p.y + Math.sin(p.facing) * reach };
        if (hasAim) p.facing = Math.atan2(aim.y - p.y, aim.x - p.x);

        const ok = CLASS_MODULES[classId].abilities[slot]({
          world: w, caster: p, params: spec.params, range: reach, aim, targetId: cmd.payload.targetId,
        });
        if (!ok) continue;
        p.cooldownReadyAtMs[slot] = w.now + spec.cooldownMs;
        w.emit({ type: 'ability_used', atMs: w.now, playerId: p.id, classId, label: spec.id, value: slot });
      }

      // Hero upkeep runs for everyone alive: detonating hazards, channelled skills.
      for (const p of w.alivePlayers()) CLASS_MODULES[classIdOf(p)].tick?.(w, p);
    },
  };
}
