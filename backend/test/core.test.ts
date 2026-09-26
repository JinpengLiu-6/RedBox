/** Integrator-owned: proves World, walls, pathfinding, wave flow, dispatch. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP, MATCH, TILE, GOBLINS, MatchPhase, Outcome, tileCentre,
} from '@redbox/shared';
import { isAbilityReady } from '@redbox/shared';
import { Crystal } from '@redbox/shared/schema';
import { CLASS_MODULES } from '../src/classes/index.js';
import { Harness } from '../src/sim/harness.js';
import { createMovementSystem } from '../src/systems/movement.js';
import { createAbilitySystem } from '../src/systems/abilities.js';

const BASE = { x: MAP.BASE.x, y: MAP.BASE.y };

test('movement follows intent and cannot enter walls', () => {
  const h = new Harness([createMovementSystem()]);
  // Row 7 has a wall from x=9..14; stand just left of it and walk right.
  const start = tileCentre(7, 7);
  const p = h.addPlayer('mage', start);
  h.start().walk(p.id, 1, 0, 3);
  assert.ok(p.x < 9 * TILE, `stopped at wall, x=${p.x.toFixed(0)}`);
  assert.ok(p.x > start.x, 'still moved up to the wall');
});

test('nextStep walks around a wall to reach the other side', () => {
  const h = new Harness([createMovementSystem()]);
  const from = tileCentre(7, 8), to = tileCentre(16, 8);   // wall x=9..14 between them
  const p = h.addPlayer('mage', from);
  h.start();
  assert.equal(h.world.lineOfSight(from, to), false);
  assert.equal(h.world.reachable(from, to), true);
  for (let i = 0; i < 200 && h.world.distance(p, to) > 20; i++) {
    const d = h.world.nextStep(p, to);
    h.move(p.id, d.x, d.y).tick();
  }
  assert.ok(h.world.distance(p, to) <= 20, `arrived, distance ${h.world.distance(p, to).toFixed(0)}`);
});

test('no friendly fire; rage-style damage reduction; parry counters', () => {
  const h = new Harness([]);
  const troll = h.addPlayer('troll');
  const mage = h.addPlayer('mage');
  h.start();
  assert.equal(h.world.damage(troll.id, 50, { sourceId: mage.id }), 0, 'no friendly fire');
  h.world.addModifier(troll.id, 'damageTakenMult', 0.5, 5000);
  assert.equal(h.world.damage(troll.id, 40, { sourceId: 'boss' }), 20);
  const gob = h.world.spawnCreep(tileCentre(10, 20));
  h.world.addModifier(mage.id, 'parry', 30, 800);
  assert.equal(h.world.damage(mage.id, 99, { sourceId: gob.id }), 0, 'parry blocks');
  assert.equal(gob.hp, gob.maxHp - 30, 'parry counters the attacker');
});

test('towers raise boss damage taken via bossDamageMult', () => {
  const h = new Harness([]);
  const p = h.addPlayer('dwarf');
  h.start();
  const before = h.state.boss.hp;
  assert.equal(h.world.damage('boss', 100, { sourceId: p.id }), 100);
  h.state.bossDamageMult = 1.75;
  assert.equal(h.world.damage('boss', 100, { sourceId: p.id }), 175);
  assert.equal(h.state.boss.hp, before - 275);
  assert.ok(h.world.threatOf(p.id) > 0, 'damage builds boss targeting pressure');
});

test('the boss is never stunned: stun becomes a slow', () => {
  const h = new Harness([]);
  h.start();
  h.world.addModifier('boss', 'stunned', 1, 2000);
  assert.equal(h.world.modifier('boss', 'stunned', 0), 0);
  assert.ok(h.world.modifier('boss', 'speedMult') < 1);
});

test('goblins scale 1.00 / 1.20 / 1.30 by wave, never compounded', () => {
  const h = new Harness([]);
  h.start();
  const hp = [1, 2, 3].map((w) => h.world.spawnCreep(BASE, w).maxHp);
  assert.deepEqual(hp, [GOBLINS.HP, Math.round(GOBLINS.HP * 1.2), Math.round(GOBLINS.HP * 1.3)]);
});

test('wave flow: deliveries clear the wave, next skill unlocks, board resets; wave 3 wins', () => {
  const h = new Harness([]);
  const p = h.addPlayer('warrior');
  h.start();
  assert.equal(h.state.boxesRequired, 3);
  assert.deepEqual([...p.ranks], [1, 0, 0], 'only Q in wave 1');

  h.state.boss.alive = false;          // boss defeat alone must not clear the wave
  h.tick(5);
  assert.equal(h.state.stage, 1);
  assert.equal(h.state.phase, MatchPhase.Playing);

  h.state.crystals.set('t', Object.assign(new Crystal(), { id: 't' }));
  h.state.boxesDelivered = 3;
  h.tick();
  assert.equal(h.state.phase, MatchPhase.WaveTransition);
  h.seconds(MATCH.WAVE_TRANSITION_MS / 1000 + 0.2);
  assert.equal(h.state.stage, 2);
  assert.equal(h.state.boxesRequired, 2);
  assert.equal(h.state.crystals.size, 0, 'board cleared for the new wave');
  assert.deepEqual([...p.ranks], [1, 1, 0], 'E unlocks at wave 2');
  assert.equal(p.lives, 3, 'lives preserved');

  h.state.boxesDelivered = 2; h.tick(); h.seconds(MATCH.WAVE_TRANSITION_MS / 1000 + 0.2);
  assert.equal(h.state.stage, 3);
  assert.deepEqual([...p.ranks], [1, 1, 1], 'R unlocks at wave 3');

  h.state.boxesDelivered = 3; h.tick();
  assert.equal(h.state.phase, MatchPhase.Ended);
  assert.equal(h.state.outcome, Outcome.Victory);
});

test('skills: locked by wave and blocked while carrying, server-side', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('mage');
  h.start();
  assert.equal(isAbilityReady(p, 0, h.world.now), true, 'Q open in wave 1');
  assert.equal(isAbilityReady(p, 1, h.world.now), false, 'E locked in wave 1');
  assert.equal(isAbilityReady(p, 2, h.world.now), false, 'R locked in wave 1');
  p.carryingBoxId = 'x';
  assert.equal(isAbilityReady(p, 0, h.world.now), false, 'no skills while carrying');
  // A forged E from a client must not reach the handler.
  let reached = false;
  const original = CLASS_MODULES.mage.abilities;
  (CLASS_MODULES.mage as { abilities: unknown }).abilities = [() => { reached = true; return true; }, () => { reached = true; return true; }, () => { reached = true; return true; }];
  try {
    p.carryingBoxId = '';
    h.command(p.id, 'ability', { slot: 1, x: 0, y: 0 }).tick();
    assert.equal(reached, false, 'locked slot rejected before the handler');
    h.command(p.id, 'ability', { slot: 0, x: 0, y: 0 }).tick();
    assert.equal(reached, true, 'open slot reaches the handler');
    assert.ok(p.cooldownReadyAtMs[0]! > 0, 'cooldown started on success');
  } finally {
    (CLASS_MODULES.mage as { abilities: unknown }).abilities = original;
  }
});

test('match times out into a loss', () => {
  const h = new Harness([]);
  h.start();
  h.seconds(MATCH.DURATION_MS / 1000 + 1);
  assert.equal(h.state.outcome, Outcome.Timeout);
});

