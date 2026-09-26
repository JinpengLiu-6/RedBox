/** 02-combat: basic attacks via the headless Harness. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, tileCentre } from '@redbox/shared';
import { Crystal } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createCombatSystem } from '../src/systems/combat.js';

test('mage bolt hits a goblin in range and is blocked by a wall', () => {
  const h = new Harness([createCombatSystem()]);
  const p = h.addPlayer('mage', { x: 500, y: 400 });
  h.start();
  const gob = h.world.spawnCreep({ x: 700, y: 400 });
  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.equal(gob.hp, gob.maxHp - CLASSES.mage.attackDamage, 'bolt hit');
  assert.ok(p.attackReadyAtMs > h.world.now - 1, 'cooldown started');
  assert.equal(h.messages('fx').filter((m) => (m as { kind: string }).kind === 'attack').length, 1);

  // Row 7 has a wall from x=9..14: shoot across it.
  const from = tileCentre(7, 7), to = tileCentre(16, 7);
  h.place(p.id, from.x, from.y);
  const behindWall = h.world.spawnCreep(to);
  assert.equal(h.world.lineOfSight(from, to), false);
  p.attackReadyAtMs = 0;
  h.command(p.id, 'attack', { x: to.x, y: to.y }).tick();
  assert.equal(behindWall.hp, behindWall.maxHp, 'wall blocks the bolt');
});

test('troll swing hits two goblins in the arc; carrying blocks attacks; players never damaged', () => {
  const h = new Harness([createCombatSystem()]);
  const troll = h.addPlayer('troll', { x: 500, y: 400 });
  const mage = h.addPlayer('mage', { x: 550, y: 400 });
  h.start();
  const a = h.world.spawnCreep({ x: 560, y: 380 });
  const b = h.world.spawnCreep({ x: 560, y: 420 });
  const behind = h.world.spawnCreep({ x: 440, y: 400 });
  h.command(troll.id, 'attack', { x: 600, y: 400 }).tick();
  assert.equal(a.hp, a.maxHp - CLASSES.troll.attackDamage);
  assert.equal(b.hp, b.maxHp - CLASSES.troll.attackDamage);
  assert.equal(behind.hp, behind.maxHp, 'outside the arc');
  assert.equal(mage.hp, mage.maxHp, 'players never damaged');

  troll.attackReadyAtMs = 0;
  troll.carryingBoxId = 'crate';
  h.command(troll.id, 'attack', { x: 600, y: 400 }).tick();
  assert.equal(a.hp, a.maxHp - CLASSES.troll.attackDamage, 'carrying player cannot attack');
});

test('warrior strike hits only the nearest goblin in the arc and the cooldown gates the next swing', () => {
  const h = new Harness([createCombatSystem()]);
  const p = h.addPlayer('warrior', { x: 500, y: 400 });
  h.start();
  const near = h.world.spawnCreep({ x: 530, y: 400 });
  const far = h.world.spawnCreep({ x: 500 + CLASSES.warrior.attackRange - 5, y: 400 });
  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.equal(near.hp, near.maxHp - CLASSES.warrior.attackDamage, 'nearest goblin struck');
  assert.equal(far.hp, far.maxHp, 'strike hits a single target');

  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.equal(near.hp, near.maxHp - CLASSES.warrior.attackDamage, 'second swing inside the cooldown does nothing');

  h.seconds(CLASSES.warrior.attackCooldownMs / 1000 + 0.1);
  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.equal(near.hp, Math.max(0, near.maxHp - 2 * CLASSES.warrior.attackDamage), 'swings again once ready');
});

test('stun blocks the swing and an attack-speed buff shortens the cooldown', () => {
  const h = new Harness([createCombatSystem()]);
  const p = h.addPlayer('troll', { x: 500, y: 400 });
  h.start();
  const g = h.world.spawnCreep({ x: 550, y: 400 });

  h.world.addModifier(p.id, 'stunned', 1, 1000);
  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.equal(g.hp, g.maxHp, 'stunned players cannot attack');
  assert.equal(p.attackReadyAtMs, 0, 'a blocked swing does not start the cooldown');

  h.seconds(1.1);
  h.world.addModifier(p.id, 'attackCooldownMult', 0.5, 5000);
  h.command(p.id, 'attack', { x: 700, y: 400 }).tick();
  assert.ok(g.hp < g.maxHp, 'swings once the stun expires');
  assert.equal(
    p.attackReadyAtMs, h.world.now + CLASSES.troll.attackCooldownMs * 0.5,
    'cooldown scaled by the modifier',
  );
});

test('a swing with no aim follows facing, misses harmlessly and still plays the attack fx', () => {
  const h = new Harness([createCombatSystem()]);
  const p = h.addPlayer('mage', { x: 500, y: 400 });
  h.start();
  p.facing = Math.PI;                              // aiming left
  const behind = h.world.spawnCreep({ x: 700, y: 400 });
  h.command(p.id, 'attack', {}).tick();
  assert.equal(behind.hp, behind.maxHp, 'nothing in the aimed direction');
  assert.equal(p.facing, Math.PI, 'facing untouched without an aim point');
  assert.equal(h.messages('fx').filter((m) => (m as { kind: string }).kind === 'attack').length, 1, 'fx on a miss');
});

test('attacks reach the boss and standing towers', () => {
  const h = new Harness([createCombatSystem()]);
  const p = h.addPlayer('mage', { x: 500, y: 400 });
  h.start();
  const tower = Object.assign(new Crystal(), {
    id: 'tower-1', x: 500, y: 300, hp: 400, maxHp: 400, destroyed: false,
  });
  h.state.crystals.set(tower.id, tower);
  h.command(p.id, 'attack', { x: tower.x, y: tower.y }).tick();
  assert.equal(tower.hp, tower.maxHp - CLASSES.mage.attackDamage, 'standing towers are hostile');

  tower.destroyed = true;
  p.attackReadyAtMs = 0;
  const rubbleHp = tower.hp;
  h.command(p.id, 'attack', { x: tower.x, y: tower.y }).tick();
  assert.equal(tower.hp, rubbleHp, 'a destroyed tower is not a target');

  const boss = h.state.boss;
  h.place(p.id, boss.x - 100, boss.y);
  p.attackReadyAtMs = 0;
  h.command(p.id, 'attack', { x: boss.x, y: boss.y }).tick();
  assert.ok(boss.hp < boss.maxHp, 'boss takes bolt damage');

  const bossHp = boss.hp;
  boss.alive = false;
  p.attackReadyAtMs = 0;
  h.command(p.id, 'attack', { x: boss.x, y: boss.y }).tick();
  assert.equal(boss.hp, bossHp, 'a dead boss is not a target');
});
