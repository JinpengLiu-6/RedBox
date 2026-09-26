/**
 * Fake simulation so the frontend has a live, believable server before the
 * real systems land. It mutates exactly the same state the real systems will,
 * so every client concern - walls, camera, HUD, crate pickup, boss telegraphs,
 * hazards, wave transitions, the end screen - can be built today.
 *
 * Real rules where they are cheap (walls, pickup, delivery, waves); scripted
 * where they are not (bots orbit, boss telegraphs on a timer).
 */

import {
  BOSS, CRATES, MAP, TOWERS, BoxMark, BoxState, CLASSES, classIdOf,
  bossDamageMultiplier, spotsOf, wavePlan,
  type System,
} from '@redbox/shared';
import { Box, Crystal } from '@redbox/shared/schema';
import { createMovementSystem } from './systems/movement.js';

const TAUNTS = [
  'The dwarf is carrying my crate. Crush him.',
  'Your troll cannot protect all of you.',
  'That crate was full of goblins. Enjoy.',
  'Two towers left. I can count.',
  'Run back to your little flag.',
];

export function stubSystems(): System[] {
  return [boardStub(), botStub(), createMovementSystem(), crateStub(), bossStub(), directorStub(), towerStub()];
}

/** Crates, towers, guards, boss reset - exactly what the real systems do per wave. */
function boardStub(): System {
  return {
    id: 'stub:board',
    onWaveStart(w) {
      const plan = wavePlan(w.wave);
      const spots = spotsOf('c');
      const total = plan.realCrates + plan.trapCrates;
      const ids = shuffle([...Array(total).keys()]);
      const real = new Set(ids.slice(0, plan.realCrates));
      for (let i = 0; i < total; i++) {
        const spot = spots[i % spots.length]!;
        const box = Object.assign(new Box(), { id: `w${w.wave}c${i}`, x: spot.x, y: spot.y, state: BoxState.Idle });
        w.addBox(box, { isReal: real.has(i) });
      }
      spotsOf('T').slice(0, TOWERS.COUNT).forEach((t, i) => {
        w.state.crystals.set(`tower${i}`, Object.assign(new Crystal(), {
          id: `tower${i}`, x: t.x, y: t.y, hp: TOWERS.HP, maxHp: TOWERS.HP,
        }));
      });
      for (const g of spotsOf('g').slice(0, 4)) w.spawnCreep(g);
      const boss = w.state.boss;
      boss.alive = true;
      boss.maxHp = boss.hp = Math.round(BOSS.HP * plan.bossMult);
      boss.x = MAP.BOSS_ZONE.x; boss.y = MAP.BOSS_ZONE.y;
    },
    update() {},
  };
}

function botStub(): System {
  return {
    id: 'stub:bots',
    update(w) {
      for (const p of w.alivePlayers()) {
        if (!p.isBot) continue;
        const t = w.now / 1000 + p.classIndex * 1.3;
        w.setIntent(p.id, Math.cos(t * 0.5), Math.sin(t * 0.5));
      }
    },
  };
}

/** Real pickup/delivery rules so the frontend can build the whole crate loop. */
function crateStub(): System {
  return {
    id: 'stub:crates',
    update(w) {
      const s = w.state;
      for (const cmd of w.commands('interact')) {
        const p = s.players.get(cmd.playerId);
        if (!p?.alive) continue;
        if (p.carryingBoxId) {
          const b = s.boxes.get(p.carryingBoxId);
          if (b) { b.state = BoxState.Dropped; b.carriedBy = ''; w.fx('drop', b); }
          p.carryingBoxId = '';
          continue;
        }
        const box = w.query(p, CRATES.PICKUP_RADIUS, { kinds: ['box'] })
          .find((b) => (b as Box).state === BoxState.Idle || (b as Box).state === BoxState.Dropped) as Box | undefined;
        if (!box) continue;
        if (w.isBoxReal(box.id)) {
          box.mark = BoxMark.Real; box.state = BoxState.Carried; box.carriedBy = p.id;
          p.carryingBoxId = box.id;
          w.fx('pickup', box);
        } else {
          box.mark = BoxMark.Fake; box.state = BoxState.Triggered;
          w.fx('trap', box);
          for (let i = 0; i < CRATES.TRAP_GOBLINS; i++) w.spawnCreep({ x: box.x + (i ? 20 : -20), y: box.y });
          w.removeEntity('box', box.id);
        }
      }
      for (const p of w.alivePlayers()) {
        const b = p.carryingBoxId ? s.boxes.get(p.carryingBoxId) : undefined;
        if (!b) continue;
        b.x = p.x; b.y = p.y;
        if (w.distance(p, MAP.BASE) <= MAP.BASE.radius) {
          b.state = BoxState.Delivered; p.carryingBoxId = '';
          s.boxesDelivered += 1;
          w.fx('deliver', MAP.BASE);
          w.removeEntity('box', b.id);
        }
      }
    },
  };
}

/** Boss wanders and telegraphs sweep / slam / charge on a timer. */
function bossStub(): System {
  let nextAttackAt = 3000;
  const cycle = ['sweep', 'slam', 'charge'] as const;
  let i = 0;
  return {
    id: 'stub:boss',
    onWaveStart(w) { nextAttackAt = w.now + 3000; },
    update(w) {
      const boss = w.state.boss;
      if (!boss.alive) return;
      const t = w.now / 1000;
      boss.x = MAP.BOSS_ZONE.x + Math.cos(t * 0.3) * 160;
      boss.y = MAP.BOSS_ZONE.y + Math.sin(t * 0.3) * 80;
      boss.facing = t * 0.3 + Math.PI / 2;
      if (boss.attack && w.now >= boss.attackAtMs) {
        w.fx(`boss_${boss.attack}` as 'boss_slam', { x: boss.attackX, y: boss.attackY });
        boss.attack = '';
        boss.behaviour = 'recover';
      }
      if (!boss.attack && w.now >= nextAttackAt) {
        const kind = cycle[i++ % cycle.length]!;
        boss.attack = kind;
        boss.attackAtMs = w.now + BOSS.ATTACKS[kind].windupMs;
        boss.attackX = boss.x + Math.cos(boss.facing) * 100;
        boss.attackY = boss.y + Math.sin(boss.facing) * 100;
        boss.behaviour = 'windup';
        nextAttackAt = w.now + 3500;
      }
    },
  };
}

/** Towers lose HP slowly so the boss damage multiplier visibly climbs. */
function towerStub(): System {
  let nextAt = 10_000;
  return {
    id: 'stub:towers',
    onWaveStart(w) { nextAt = w.now + 10_000; },
    update(w) {
      if (w.now < nextAt) return;
      nextAt = w.now + 12_000;
      const standing = [...w.state.crystals.values()].find((c) => !c.destroyed);
      if (!standing) return;
      standing.hp = 0; standing.destroyed = true;
      w.state.crystalsDestroyed += 1;
      w.state.bossDamageMult = bossDamageMultiplier(w.state.crystalsDestroyed);
      w.fx('crystal_break', standing);
    },
  };
}

function directorStub(): System {
  let nextAt = 5000;
  let n = 0;
  return {
    id: 'stub:director',
    update(w) {
      if (w.now < nextAt) return;
      nextAt = w.now + 12_000;
      const target = w.alivePlayers()[n % Math.max(1, w.alivePlayers().length)];
      const d = w.state.director;
      d.taunt = TAUNTS[n++ % TAUNTS.length]!;
      d.reasoning = target ? `most recent damage came from the ${CLASSES[classIdOf(target)].name}` : 'no targets';
      d.focusClassIndex = target ? target.classIndex : -1;
      d.updatedAtMs = w.now;
      d.source = 'fallback';
    },
  };
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
