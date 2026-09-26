/**
 * Fake simulation so the frontend has a live, believable server on day one.
 *
 * It mutates exactly the same state the real systems will, at the same rate, so
 * every client-side concern - interpolation, HUD, cooldown sweeps, box marks,
 * boss voice lines, the end screen - can be built and tuned before a single real
 * system exists. Delete this file on the day the real systems land; the client
 * will not notice.
 */

import {
  BOSS, BOXES, CRYSTALS, MAP, MATCH, CLASS_BY_INDEX, CLASS_IDS,
  BoxMark, BoxState, MatchPhase, Outcome,
  type System, type World,
} from '@redbox/shared';
import { Box, Crystal } from '@redbox/shared/schema';
import { createMovementSystem } from './systems/movement.js';

const TAUNTS = [
  'The one in green is carrying. Take him.',
  'Your tank is all that is keeping you alive.',
  'That box was never real.',
  'Two towers left. I can count.',
  'Healer first. Then the rest of you.',
];

export function stubSystems(): System[] {
  return [spawnStub(), createMovementSystem(), motionStub(), directorStub(), objectiveStub()];
}

/** Lays out boxes and crystals exactly as the real spawner will. */
function spawnStub(): System {
  return {
    id: 'stub:spawn',
    init(w) {
      const realIds = new Set<number>();
      while (realIds.size < BOXES.REAL) realIds.add(Math.floor(Math.random() * BOXES.TOTAL));

      for (let i = 0; i < BOXES.TOTAL; i++) {
        const angle = (i / BOXES.TOTAL) * Math.PI * 2;
        const radius = 180 + Math.random() * (MAP.BOSS_ZONE.radius - 220);
        const box = new Box();
        box.id = 'box' + i;
        box.x = MAP.BOSS_ZONE.x + Math.cos(angle) * radius;
        box.y = MAP.BOSS_ZONE.y + Math.sin(angle) * radius;
        box.mark = BoxMark.Unknown;
        box.state = BoxState.Idle;
        box.carriedBy = '';

        const isReal = realIds.has(i);
        const camouflaged = isReal && realIds.size - [...realIds].indexOf(i) <= BOXES.CAMOUFLAGED;
        // Camouflaged boxes stay out of state until a scan reveals them.
        w.addBox(box, { isReal, camouflaged });
      }

      const total = CRYSTALS.PER_STAGE.reduce((a, b) => a + b, 0);
      for (let i = 0; i < total; i++) {
        const angle = (i / total) * Math.PI * 2;
        const c = new Crystal();
        c.id = 'cry' + i;
        c.x = MAP.BOSS_ZONE.x + Math.cos(angle) * CRYSTALS.RESPAWN_RING_RADIUS;
        c.y = MAP.BOSS_ZONE.y + Math.sin(angle) * CRYSTALS.RESPAWN_RING_RADIUS;
        c.hp = CRYSTALS.HP; c.maxHp = CRYSTALS.HP; c.destroyed = false;
        w.state.crystals.set(c.id, c);
      }
    },
    update() {},
  };
}

/** Bots and the boss on a lazy orbit. Humans move through the real movement system. */
function motionStub(): System {
  return {
    id: 'stub:motion',
    update(w: World) {
      const s = w.state;
      for (const [, p] of s.players) {
        if (!p.alive || !p.isBot) continue;
        const t = s.elapsedMs / 1000 + p.classIndex;
        p.x = MAP.BASE.x + Math.cos(t * 0.4) * 220;
        p.y = MAP.BASE.y + Math.sin(t * 0.4) * 220;
        p.moving = true;
        p.facing = Math.atan2(Math.cos(t * 0.4), -Math.sin(t * 0.4));
      }
      const t = s.elapsedMs / 1000;
      s.boss.x = MAP.BOSS_ZONE.x + Math.cos(t * 0.25) * 260;
      s.boss.y = MAP.BOSS_ZONE.y + Math.sin(t * 0.25) * 260;
      s.boss.facing = t * 0.25 + Math.PI / 2;
    },
  };
}

/** Fires believable boss voice lines on the real director cadence. */
function directorStub(): System {
  let nextAt = 4000;
  let i = 0;
  return {
    id: 'stub:director',
    update(w) {
      if (w.now < nextAt) return;
      nextAt = w.now + 12_000;
      const d = w.state.director;
      const victim = w.alivePlayers()[i % Math.max(1, w.alivePlayers().length)];
      d.taunt = TAUNTS[i % TAUNTS.length]!;
      d.reasoning = victim ? `highest threat share is ${victim.name}` : 'no live targets';
      d.focusClassIndex = victim ? victim.classIndex : -1;
      d.spawnHint = 'flank';
      d.updatedAtMs = w.now;
      d.source = 'fallback';
      w.emit({ type: 'director_decision', atMs: w.now, label: d.taunt });
      i++;
    },
  };
}

/** Advances objectives on a timer so the client can build every end state. */
function objectiveStub(): System {
  let nextTickAt = 15_000;
  return {
    id: 'stub:objectives',
    update(w) {
      const s = w.state;
      if (w.now < nextTickAt) return;
      nextTickAt = w.now + 15_000;

      const live = [...s.crystals.values()].filter((c) => !c.destroyed);
      if (live.length > 0) {
        const c = live[0]!;
        c.destroyed = true;
        c.hp = 0;
        s.crystalsDestroyed += 1;
        w.emit({ type: 'crystal_destroyed', atMs: w.now, crystalId: c.id });
        w.fx('crystal_break', { x: c.x, y: c.y });

        if (s.crystalsDestroyed >= s.crystalsRequired) {
          s.boss.vulnerable = true;
          s.boss.behaviour = 'enraged';
          s.boss.vulnerableUntilMs = w.now + BOSS.VULNERABLE_MS;
          w.emit({ type: 'boss_vulnerable', atMs: w.now, value: s.stage });
          s.stage = Math.min(3, s.stage + 1);
          s.crystalsDestroyed = 0;
          s.crystalsRequired = CRYSTALS.PER_STAGE[s.stage - 1]!;
          for (const [, p] of s.players) p.skillPoints += 1;
        }
      }

      if (s.boss.vulnerable && w.now > s.boss.vulnerableUntilMs) {
        s.boss.vulnerable = false;
        s.boss.behaviour = 'shielded';
      }

      // Deliver a box every other objective tick so the win screen is reachable.
      const carried = [...s.boxes.values()].find((b) => b.state === BoxState.Idle && b.mark !== BoxMark.Fake);
      if (carried && s.crystalsDestroyed === 0) {
        carried.state = BoxState.Delivered;
        carried.mark = BoxMark.Real;
        s.boxesDelivered += 1;
        w.emit({ type: 'box_delivered', atMs: w.now, boxId: carried.id });
        if (s.boxesDelivered >= MATCH.BOXES_TO_WIN) w.endMatch(Outcome.BoxVictory);
      }
    },
  };
}
