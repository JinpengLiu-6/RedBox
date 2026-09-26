/** Brief 04: the Goblin King FSM (targeting, telegraphed attacks, leash, defeat). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSS, MAP, MATCH, TICK_MS, TICK_RATE, TILE, MatchPhase, wavePlan, type Vec2 } from '@redbox/shared';
import { createBossSystem } from '../src/ai/boss.js';
import { Harness } from '../src/sim/harness.js';

const HOME = { x: MAP.BOSS_ZONE.x, y: MAP.BOSS_ZONE.y };   // (1040, 208), row 6 of the map
/** Far outside the King's aggro radius: extras wait here until a test places them. */
const FAR = { x: MAP.BASE.x, y: MAP.BASE.y };

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

/** Clears the current wave by delivery and ticks until the next wave has started. */
function nextWave(h: Harness) {
  const stage = h.state.stage;
  h.state.boxesDelivered = h.state.boxesRequired;
  tickUntil(h, () => h.state.stage === stage + 1, MATCH.WAVE_TRANSITION_MS / 1000 + 1, `wave ${stage + 1}`);
}

/** `boss_target_changed` log as [targetId, label] pairs. */
function targetLog(h: Harness) {
  return h.events('boss_target_changed').map((e) => [e.targetId, e.label]);
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

test('the director threatBias multiplies the targeting score', () => {
  const h = bossHarness();
  // Equal distance: without the bias the first player added wins the tie.
  const troll = h.addPlayer('troll', { x: HOME.x - 200, y: HOME.y });
  const mage = h.addPlayer('mage', { x: HOME.x + 200, y: HOME.y });
  h.start();
  h.world.setThreatBias('mage', 2);
  h.tick();
  assert.equal(h.state.boss.targetId, mage.id);
  assert.notEqual(h.state.boss.targetId, troll.id);
});

test('recent-damage threat decays by DAMAGE_DECAY_PER_SEC every tick', () => {
  const h = bossHarness();
  const p = h.addPlayer('mage', FAR);
  h.start();
  h.world.addThreat(p.id, 1000);
  h.seconds(2);
  const expected = 1000 * (1 - BOSS.TARGETING.DAMAGE_DECAY_PER_SEC / TICK_RATE) ** (2 * TICK_RATE);
  const t = h.world.threatOf(p.id);
  assert.ok(t < 1000, `threat fades (${t.toFixed(1)})`);
  assert.ok(Math.abs(t - expected) < 1e-6, `threat ${t.toFixed(3)}, expected ${expected.toFixed(3)}`);
});

test('every target change is logged, drops included', () => {
  const h = bossHarness();
  const p = h.addPlayer('mage', { x: HOME.x - 200, y: HOME.y });
  h.start().tick();
  assert.equal(h.state.boss.targetId, p.id);

  // The only hero goes down: nobody left to hunt.
  p.alive = false;
  h.tick();
  assert.equal(h.state.boss.targetId, '');
  assert.deepEqual(targetLog(h), [[p.id, undefined], ['', 'lost']]);
  h.seconds(1);
  assert.equal(h.events('boss_target_changed').length, 2, 'a drop is logged once, not every tick');
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
  const reacquiredAt = h.world.now;

  // B is back and still the most attractive, but A's fresh commit window holds...
  b.alive = true;
  h.tick();
  assert.equal(h.state.boss.targetId, a.id, 'commit window holds A');
  // ...until A becomes unreachable (inside a wall tile): released at once.
  h.place(a.id, 40 * TILE + TILE / 2, HOME.y);
  assert.equal(h.world.reachable(h.state.boss, a), false);
  h.tick();
  assert.equal(h.state.boss.targetId, b.id);
  assert.ok(h.world.now - reacquiredAt < BOSS.TARGET_COMMIT_MS, 'released inside the commit window');
});

test('slam resolves when it lands: leaving the area during windup dodges it', () => {
  const h = bossHarness();
  const stayer = h.addPlayer('troll', { x: HOME.x + 70, y: HOME.y });
  const dodger = h.addPlayer('warrior', { x: HOME.x + 70, y: HOME.y + TILE });
  const latecomer = h.addPlayer('mage', { x: HOME.x - 350, y: 48 });   // far away at windup
  const edger = h.addPlayer('dwarf', FAR);
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
  const hp = { stayer: stayer.hp, dodger: dodger.hp, latecomer: latecomer.hp, edger: edger.hp };

  // During the windup: one hero runs out, another runs in, a third stops just
  // outside the telegraphed circle (its body overlaps the edge, its centre does not).
  h.tick();
  h.place(dodger.id, HOME.x - 350, HOME.y);
  h.place(latecomer.id, centre.x, centre.y);
  h.place(edger.id, centre.x - (radius + 8), centre.y);
  assert.ok(h.world.lineOfSight(centre, edger));
  assert.equal(h.state.boss.attackX, centre.x, 'a telegraphed slam does not follow anyone');

  // Nothing lands before attackAtMs: the whole windup is the dodge window.
  tickUntil(h, () => h.world.now >= landsAt - TICK_MS, 2, 'last windup tick');
  assert.equal(h.world.now, landsAt - TICK_MS);
  assert.equal(h.state.boss.attack, 'slam');
  assert.equal(h.state.boss.behaviour, 'windup');
  assert.equal(stayer.hp, hp.stayer, 'no damage before the slam lands');
  assert.equal(latecomer.hp, hp.latecomer, 'no damage before the slam lands');

  h.tick();
  assert.equal(h.world.now, landsAt);
  const dmg = Math.round(BOSS.ATTACKS.slam.damage * wavePlan(1).bossMult);
  assert.equal(dodger.hp, hp.dodger, 'the dodger takes no damage');
  assert.equal(edger.hp, hp.edger, 'outside the drawn radius is outside the hit');
  assert.equal(stayer.hp, hp.stayer - dmg, 'whoever stayed is hit');
  assert.equal(latecomer.hp, hp.latecomer - dmg, 'whoever walked in is hit');
  assert.equal(h.state.boss.attack, '', 'telegraph cleared after the hit');
  assert.equal(h.state.boss.behaviour, 'recover');
  assert.ok(h.messages('fx').some((m) => m.kind === 'boss_slam'));
  assert.deepEqual(h.events('boss_attack').map((e) => e.label), ['sweep', 'slam']);
});

test('wave 2: the sweep hits only its range and arc, scaled by bossMult', () => {
  const h = bossHarness();
  const polar = (deg: number, r: number): Vec2 => ({
    x: HOME.x + r * Math.cos((deg * Math.PI) / 180), y: HOME.y + r * Math.sin((deg * Math.PI) / 180),
  });
  const { range, arcDeg } = BOSS.ATTACKS.sweep;
  // The sweep aims east (0 deg) at the closest hero.
  const layout: Record<string, Vec2> = {
    front: polar(0, 80),               // the target: in range, dead ahead
    edge: polar(arcDeg / 2 - 10, 100), // in range, inside the arc near its edge
    side: polar(90, 100),              // in range, outside the arc
    behind: polar(180, 100),           // in range, behind the King
    beyond: polar(0, range + 10),      // dead ahead, just past the range
  };
  const ids = { front: 'troll', edge: 'brawler', side: 'warrior', behind: 'mage', beyond: 'dwarf' } as const;
  for (const [role, at] of Object.entries(layout)) h.addPlayer(ids[role as keyof typeof ids], at);
  h.start().tick();
  assert.equal(h.state.boss.targetId, ids.front, 'the King had a target in wave 1');

  nextWave(h);
  const boss = h.state.boss;
  assert.equal(boss.targetId, '', 'the new wave starts with no target');
  assert.deepEqual(targetLog(h).at(-1), ['', 'wave_reset']);

  for (const [role, at] of Object.entries(layout)) h.place(ids[role as keyof typeof ids], at.x, at.y);
  tickUntil(h, () => boss.attack === 'sweep', 1, 'sweep windup');
  const landsAt = boss.attackAtMs;
  tickUntil(h, () => h.world.now >= landsAt, 2, 'sweep lands');

  const dmg = Math.round(BOSS.ATTACKS.sweep.damage * wavePlan(2).bossMult);
  assert.notEqual(dmg, BOSS.ATTACKS.sweep.damage, 'wave 2 really is scaled');
  const lost = (role: keyof typeof ids) => {
    const p = h.state.players.get(ids[role])!;
    return p.maxHp - p.hp;
  };
  assert.equal(lost('front'), dmg);
  assert.equal(lost('edge'), dmg);
  assert.equal(lost('side'), 0, 'outside the arc');
  assert.equal(lost('behind'), 0, 'behind the King');
  assert.equal(lost('beyond'), 0, 'past the range');
});

test('after a hit the King recovers in place; attacks are at least ATTACK_INTERVAL_MS apart', () => {
  const h = bossHarness();
  // Just past body contact, so the King wants to step in as soon as it may move.
  h.addPlayer('troll', { x: HOME.x + 80, y: HOME.y });
  h.start();
  const boss = h.state.boss;
  tickUntil(h, () => boss.attack === 'sweep', 1, 'sweep windup');
  const landedAt = boss.attackAtMs;
  tickUntil(h, () => h.world.now >= landedAt, 2, 'sweep lands');
  assert.equal(boss.behaviour, 'recover');

  const at = { x: boss.x, y: boss.y };
  const recoverEnds = landedAt + BOSS.ATTACKS.sweep.recoverMs;
  while (h.world.now + TICK_MS < recoverEnds) {
    h.tick();
    assert.equal(boss.behaviour, 'recover', `recovering at t=${h.world.now}`);
    assert.deepEqual({ x: boss.x, y: boss.y }, at, `standing still at t=${h.world.now}`);
  }
  h.tick();
  assert.notDeepEqual({ x: boss.x, y: boss.y }, at, 'moves again once recovered');

  tickUntil(h, () => h.events('boss_attack').length === 2, 3, 'second attack');
  const next = h.events('boss_attack')[1]!;
  assert.equal(next.label, 'slam');
  assert.ok(next.atMs >= landedAt + BOSS.ATTACK_INTERVAL_MS,
    `next windup at ${next.atMs}, min gap ends at ${landedAt + BOSS.ATTACK_INTERVAL_MS}`);
  assert.ok(next.atMs <= landedAt + BOSS.ATTACK_INTERVAL_MS + TICK_MS, 'and not needlessly later');
});

test('chase paths around walls to a target it cannot see', () => {
  const h = bossHarness();
  // Behind the column 40-41 wall block (rows 4-6): the straight line is blocked.
  const p = h.addPlayer('mage', { x: 43 * TILE + TILE / 2, y: 5 * TILE + TILE / 2 });
  h.start();
  const boss = h.state.boss;
  assert.equal(h.world.lineOfSight(boss, p), false);
  assert.equal(h.world.reachable(boss, p), true);
  tickUntil(h, () => {
    assert.ok(h.world.walkable(boss.x, boss.y), `never inside a wall (${boss.x.toFixed(0)}, ${boss.y.toFixed(0)})`);
    return h.events('boss_attack').length > 0;
  }, 4, 'an attack on the hidden target');
  assert.equal(h.events('boss_attack')[0]!.targetId, p.id);
  assert.ok(h.world.lineOfSight(boss, p));
});

test('the charge stops at walls and hits whoever is in its lane', () => {
  const h = bossHarness();
  // Column 40 (x >= 1280) is wall on row 6; a full 360 px charge would go through it.
  const wallX = 40 * TILE;
  const target = h.addPlayer('troll', { x: wallX - 30, y: HOME.y });
  const clipped = h.addPlayer('mage', FAR);
  const grazer = h.addPlayer('dwarf', FAR);
  const bystander = h.addPlayer('warrior', FAR);
  h.start();

  tickUntil(h, () => h.state.boss.attack === 'charge', 15, 'charge windup');
  const boss = h.state.boss;
  const from = { x: boss.x, y: boss.y };
  const end = { x: boss.attackX, y: boss.attackY };
  assert.ok(end.x < wallX && end.x > from.x, `telegraphed lane ends before the wall (${end.x.toFixed(0)})`);

  // Beside the middle of the lane: inside its half-width, just outside it, well clear.
  const half = BOSS.ATTACKS.charge.width / 2;
  const mid = { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 };
  const len = Math.hypot(end.x - from.x, end.y - from.y);
  const perp = { x: -(end.y - from.y) / len, y: (end.x - from.x) / len };
  const beside = (off: number) => ({ x: mid.x + perp.x * off, y: mid.y + perp.y * off });
  for (const [p, off] of [[clipped, -(half - 10)], [grazer, half + 10], [bystander, 100]] as const) {
    const at = beside(off);
    h.place(p.id, at.x, at.y);
    assert.ok(h.world.walkable(at.x, at.y) && h.world.lineOfSight(mid, at), `${p.id} placed in the open`);
  }
  const hpBefore = { target: target.hp, clipped: clipped.hp, grazer: grazer.hp, bystander: bystander.hp };

  tickUntil(h, () => h.state.boss.behaviour === 'recover', 2, 'charge lands');
  assert.ok(boss.x < wallX, `stopped before the wall, x=${boss.x.toFixed(0)}`);
  assert.ok(boss.x > from.x + 40, 'but it did charge');
  assert.ok(h.world.walkable(boss.x, boss.y));
  const dmg = Math.round(BOSS.ATTACKS.charge.damage * wavePlan(1).bossMult);
  assert.equal(target.hp, hpBefore.target - dmg);
  assert.equal(clipped.hp, hpBefore.clipped - dmg, 'inside the lane width');
  assert.equal(grazer.hp, hpBefore.grazer, 'just outside the telegraphed lane');
  assert.equal(bystander.hp, hpBefore.bystander, 'well clear of the lane');
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
  assert.deepEqual(targetLog(h), [[p.id, undefined], ['', 'leash']], 'the drop is logged');

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
  h.tick();
  assert.equal(boss.targetId, p.id);

  // Off its spawn when it falls, so the next wave's reset is visible.
  boss.x = HOME.x - 300;
  h.world.damage('boss', 1e6, { sourceId: p.id });
  assert.equal(boss.hp, 0);
  h.tick();
  assert.equal(boss.alive, false);
  assert.equal(boss.behaviour, 'defeated');
  assert.equal(boss.attack, '');
  assert.equal(boss.targetId, '');
  assert.deepEqual(targetLog(h), [[p.id, undefined], ['', 'defeated']], 'the drop is logged');
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
  nextWave(h);
  assert.equal(h.state.stage, 2);
  const hp2 = Math.round(BOSS.HP * wavePlan(2).bossMult);
  assert.equal(boss.alive, true);
  assert.equal(boss.maxHp, hp2);
  assert.equal(boss.hp, hp2);
  assert.equal(boss.x, HOME.x);
  assert.equal(boss.y, HOME.y);
});
