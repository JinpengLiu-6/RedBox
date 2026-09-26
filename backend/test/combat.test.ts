/** 02-combat: basic attacks via the headless Harness. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, tileCentre } from '@redbox/shared';
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
