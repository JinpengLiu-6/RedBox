/** Brief 04: the Goblin King FSM (targeting, telegraphed attacks, leash, defeat). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, MAP, MATCH, TICK_MS, TILE, MatchPhase, wavePlan } from '@redbox/shared';
import { createBossSystem } from '../src/ai/boss.js';
import { Harness } from '../src/sim/harness.js';

const HOME = { x: MAP.BOSS_ZONE.x, y: MAP.BOSS_ZONE.y };   // (1040, 208), row 6 of the map

function bossHarness() {
  return new Harness([createBossSystem()]);
}

/** Tick until `pred` holds; fails the test if it never does. */
function tickUntil(h: Harness, pred: () => boolean, maxSeconds: number, what: string) {
  const maxTicks = Math.round((maxSeconds * 1000) / TICK_MS);
  for (let i = 0; i < maxTicks; i++) {
    if (pred()) return;
    h.tick();
  }
  assert.ok(pred(), `timed out waiting for: ${what}`);
}

test('a crate carrier is preferred over an equally close non-carrier', () => {
  const h = bossHarness();
  // Same distance (200 px) on either side of the King. The non-carrier is added
  // first, so without the carrier bonus it would win the tie.
  const walker = h.addPlayer('troll', { x: HOME.x - 200, y: HOME.y });
  const carrier = h.addPlayer('dwarf', { x: HOME.x + 200, y: HOME.y });
  h.start();
  carrier.carryingBoxId = 'crate-1';
  h.tick();

  assert.equal(h.state.boss.targetId, carrier.id);
  assert.notEqual(h.state.boss.targetId, walker.id);
  const changed = h.events('boss_target_changed');
  assert.equal(changed.length, 1);
  assert.equal(changed[0]!.targetId, carrier.id);
  assert.equal(changed[0]!.classId, 'dwarf');
});

test('downed and unreachable heroes are never targeted, however tempting', () => {
  const h = bossHarness();
  const live = h.addPlayer('troll', { x: HOME.x - 200, y: HOME.y });
  const downed = h.addPlayer('mage', { x: HOME.x + 100, y: HOME.y });
  const walled = h.addPlayer('dwarf', { x: 40 * TILE + TILE / 2, y: HOME.y });   // inside a wall tile
  h.start();
  assert.equal(h.world.reachable(h.state.boss, walled), false);
  downed.alive = false;
  for (const p of [downed, walled]) {
    p.carryingBoxId = 'crate-' + p.id;
    h.world.addThreat(p.id, 5000);
  }
  h.tick();
  assert.equal(h.state.boss.targetId, live.id);
});

test('a target is held for at least TARGET_COMMIT_MS, but dropped at once if it dies', () => {
  const h = bossHarness();
  const a = h.addPlayer('warrior', { x: HOME.x - 160, y: HOME.y });   // closer: picked first
  const b = h.addPlayer('mage', { x: HOME.x + 200, y: HOME.y });
  h.start().tick();
  assert.equal(h.state.boss.targetId, a.id);
  const acquiredAt = h.events('boss_target_changed')[0]!.atMs;

  // B suddenly becomes by far the most attractive target.
  h.world.addThreat(b.id, 3000);
  let switchedAt = -1;
  for (let i = 0; i < 200 && switchedAt < 0; i++) {
    h.tick();
    if (h.state.boss.targetId === b.id) switchedAt = h.world.now;
    else assert.equal(h.state.boss.targetId, a.id, `held A at t=${h.world.now}`);
  }
  assert.ok(switchedAt >= acquiredAt + BOSS.TARGET_COMMIT_MS,
    `switched at ${switchedAt}, commit window ends at ${acquiredAt + BOSS.TARGET_COMMIT_MS}`);
  assert.ok(switchedAt <= acquiredAt + BOSS.TARGET_COMMIT_MS + 2 * TICK_MS, 'switched as soon as the window ended');

  // A dead target is released immediately, commit window or not.
  b.alive = false;
  h.tick();
  assert.equal(h.state.boss.targetId, a.id);
});

test('slam resolves when it lands: leaving the area during windup dodges it', () => {
  const h = bossHarness();
  const stayer = h.addPlayer('troll', { x: HOME.x + 70, y: HOME.y });
  const dodger = h.addPlayer('warrior', { x: HOME.x + 70, y: HOME.y + TILE });
  const latecomer = h.addPlayer('mage', { x: HOME.x - 350, y: 48 });   // far away at windup
  h.start();

  // The cycle is sweep -> slam -> charge: wait for the slam telegraph.
  tickUntil(h, () => h.state.boss.attack === 'slam', 10, 'slam windup');
  const boss = h.state.boss;
  assert.equal(boss.behaviour, 'windup');
  const centre = { x: boss.attackX, y: boss.attackY };
  const landsAt = boss.attackAtMs;
  assert.equal(landsAt - h.world.now, BOSS.ATTACKS.slam.windupMs, 'the windup is the dodge window');
  const radius = BOSS.ATTACKS.slam.radius;
  assert.ok(h.world.distance(dodger, centre) <= radius, 'dodger stood in the slam area at windup');
  assert.ok(h.world.distance(latecomer, centre) > radius, 'latecomer was outside at windup');
  const hp = { stayer: stayer.hp, dodger: dodger.hp, latecomer: latecomer.hp };

  // During the windup: one hero runs out, another runs in.
  h.tick();
  h.place(dodger.id, HOME.x - 350, HOME.y);
  h.place(latecomer.id, centre.x, centre.y);
  assert.equal(h.state.boss.attackX, centre.x, 'a telegraphed slam does not follow anyone');

  tickUntil(h, () => h.world.now >= landsAt, 2, 'slam lands');
  const dmg = Math.round(BOSS.ATTACKS.slam.damage * wavePlan(1).bossMult);
  assert.equal(dodger.hp, hp.dodger, 'the dodger takes no damage');
  assert.equal(stayer.hp, hp.stayer - dmg, 'whoever stayed is hit');
  assert.equal(latecomer.hp, hp.latecomer - dmg, 'whoever walked in is hit');
  assert.equal(h.state.boss.attack, '', 'telegraph cleared after the hit');
  assert.equal(h.state.boss.behaviour, 'recover');
  assert.ok(h.messages('fx').some((m) => m.kind === 'boss_slam'));
  assert.deepEqual(h.events('boss_attack').map((e) => e.label), ['sweep', 'slam']);
});

test('the charge stops at walls and hits whoever is in its lane', () => {
  const h = bossHarness();
  // Column 40 (x >= 1280) is wall on row 6; a full 360 px charge would go through it.
  const wallX = 40 * TILE;
  const target = h.addPlayer('troll', { x: wallX - 30, y: HOME.y });
  h.start();

  tickUntil(h, () => h.state.boss.attack === 'charge', 15, 'charge windup');
  const boss = h.state.boss;
  const from = { x: boss.x, y: boss.y };
  const end = { x: boss.attackX, y: boss.attackY };
  assert.ok(end.x < wallX && end.x > from.x, `telegraphed lane ends before the wall (${end.x.toFixed(0)})`);
  const hpBefore = target.hp;

  tickUntil(h, () => h.state.boss.behaviour === 'recover', 2, 'charge lands');
  assert.ok(boss.x < wallX, `stopped before the wall, x=${boss.x.toFixed(0)}`);
  assert.ok(boss.x > from.x + 40, 'but it did charge');
  assert.ok(h.world.walkable(boss.x, boss.y));
  assert.equal(target.hp, hpBefore - Math.round(BOSS.ATTACKS.charge.damage * wavePlan(1).bossMult));
});

test('leash: beyond LEASH_RADIUS the King drops its target and walks home around walls', () => {
  const h = bossHarness();
  // 650 px from home (a valid target) but the King is dragged out past the leash.
  const p = h.addPlayer('brawler', { x: HOME.x - 650, y: HOME.y });
  h.start();
  const boss = h.state.boss;
  boss.x = HOME.x - 720; boss.y = HOME.y;
  h.tick();
  assert.equal(boss.behaviour, 'returning');
  assert.equal(boss.targetId, '');

  const hpBefore = p.hp;
  tickUntil(h, () => boss.behaviour === 'idle', 15, 'back home');
  assert.equal(boss.x, HOME.x);
  assert.equal(boss.y, HOME.y);
  assert.equal(p.hp, hpBefore, 'no attacks while leashed');
  h.seconds(1);
  assert.equal(boss.targetId, '', 'target out of aggro range from home');
});

test('speed respects the speedMult modifier; a stun only slows the King', () => {
  const run = (setup: (h: Harness) => void) => {
    const h = bossHarness();
    h.addPlayer('mage', { x: HOME.x - 380, y: HOME.y });
    h.start();
    setup(h);
    h.seconds(1);
    return HOME.x - h.state.boss.x;
  };
  const normal = run(() => {});
  const slowed = run((h) => h.world.addModifier('boss', 'speedMult', 0.5, 5000));
  const stunned = run((h) => h.world.addModifier('boss', 'stunned', 1, 5000));
  assert.ok(Math.abs(normal - BOSS.SPEED) <= BOSS.SPEED * 0.1, `moved ${normal.toFixed(0)} px in 1 s`);
  assert.ok(Math.abs(slowed - normal * 0.5) <= 10, `slowed moved ${slowed.toFixed(0)}`);
  assert.ok(stunned > 0 && stunned < normal, `stunned still moves, slower (${stunned.toFixed(0)})`);
});

test('hp 0: defeated for the rest of the wave, wave keeps playing; next wave resets with bossMult', () => {
  const h = bossHarness();
  const p = h.addPlayer('dwarf', { x: HOME.x + 70, y: HOME.y });
  h.start();
  const boss = h.state.boss;
  assert.equal(boss.maxHp, Math.round(BOSS.HP * wavePlan(1).bossMult));
  assert.equal(h.world.damage('boss', 100, { sourceId: p.id }), 100, 'damageable from the start');

  h.world.damage('boss', 1e6, { sourceId: p.id });
  assert.equal(boss.hp, 0);
  h.tick();
  assert.equal(boss.alive, false);
  assert.equal(boss.behaviour, 'defeated');
  assert.equal(boss.attack, '');
  const defeated = h.events('boss_defeated');
  assert.equal(defeated.length, 1);
  assert.equal(defeated[0]!.playerId, p.id, 'killing blow credited');
  assert.ok(h.messages('fx').some((m) => m.kind === 'boss_defeated'));

  // Boss defeat does NOT clear the wave, and a defeated King does nothing.
  const hpBefore = p.hp;
  h.seconds(5);
  assert.equal(h.state.phase, MatchPhase.Playing);
  assert.equal(h.state.stage, 1);
  assert.equal(boss.alive, false);
  assert.equal(p.hp, hpBefore, 'no attacks from a defeated King');
  assert.equal(h.events('boss_defeated').length, 1);

  // Deliveries clear the wave; the next wave brings the King back, scaled.
  h.state.boxesDelivered = h.state.boxesRequired;
  h.tick().seconds(MATCH.WAVE_TRANSITION_MS / 1000 + 0.2);
  assert.equal(h.state.stage, 2);
  const hp2 = Math.round(BOSS.HP * wavePlan(2).bossMult);
  assert.equal(boss.alive, true);
  assert.equal(boss.maxHp, hp2);
  assert.equal(boss.hp, hp2);
  assert.equal(boss.x, HOME.x);
  assert.equal(boss.y, HOME.y);
});
