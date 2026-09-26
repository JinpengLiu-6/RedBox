/** Integrator-owned: proves the World facade, movement and ability dispatch. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxMark, MatchPhase, Outcome } from '@redbox/shared';
import { Box, Crystal } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createMovementSystem } from '../src/systems/movement.js';
import { createAbilitySystem } from '../src/systems/abilities.js';

test('movement follows intent at class speed', () => {
  const h = new Harness([createMovementSystem()]);
  const p = h.addPlayer('scanner', { x: 100, y: 100 });
  h.start().walk(p.id, 1, 0, 1);
  assert.ok(p.x > 300 && p.x < 340, `moved to ${p.x}`); // scanner speed 225
});

test('damage respects shield, amp and phase; never goes below zero', () => {
  const h = new Harness([]);
  const p = h.addPlayer('tank');
  h.start();
  p.shield = 50;
  assert.equal(h.world.damage(p.id, 80), 30);
  assert.equal(p.shield, 0);
  h.world.applyDebuff(p.id, 'damageAmp', 5000);
  assert.equal(h.world.damage(p.id, 10), 20);
  h.world.applyDebuff(p.id, 'phase', 5000);
  assert.equal(h.world.damage(p.id, 999), 0);
  h.world.clearDebuffs(p.id); p.phasedUntilMs = 0;
  h.world.damage(p.id, 99999);
  assert.equal(p.hp, 0);
});

test('shielded boss takes no damage but still records threat', () => {
  const h = new Harness([]);
  const tank = h.addPlayer('tank');
  h.start();
  assert.equal(h.world.damage('boss', 40, { sourceId: tank.id }), 0);
  assert.ok(h.world.threatOf(tank.id) > 0);
});

test('crystals ignore non-ranged damage', () => {
  const h = new Harness([]);
  h.start();
  h.state.crystals.set('c1', Object.assign(new Crystal(), { id: 'c1', hp: 100, maxHp: 100 }));
  assert.equal(h.world.damage('c1', 30), 0);
  assert.equal(h.world.damage('c1', 30, { fromRanged: true }), 30);
});

test('scan reveals camouflaged boxes and never leaks truth before', () => {
  const h = new Harness([]);
  const s = h.addPlayer('scanner', { x: 500, y: 500 });
  h.start();
  const mk = (id: string, x: number) => Object.assign(new Box(), { id, x, y: 500 });
  h.world.addBox(mk('real', 520), { isReal: true, camouflaged: true });
  h.world.addBox(mk('fake', 560), { isReal: false, camouflaged: false });
  assert.equal(h.state.boxes.has('real'), false, 'camouflaged box must be absent from state');
  assert.equal(h.state.boxes.get('fake')!.mark, BoxMark.Unknown);
  h.world.scan(s, 200, s.id);
  assert.equal(h.state.boxes.get('real')!.mark, BoxMark.Real);
  assert.equal(h.state.boxes.get('fake')!.mark, BoxMark.Fake);
});

test('ability dispatch: locked slot ignored, stub handler starts no cooldown', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('tank');
  h.start();
  h.command(p.id, 'ability', { slot: 1 }).tick();       // rank 0: locked
  h.command(p.id, 'ability', { slot: 0 }).tick();       // stub returns false
  assert.equal(p.cooldownReadyAtMs[0], 0);
  assert.equal(h.events('ability_used').length, 0);
});

test('match times out into a loss', () => {
  const h = new Harness([]);
  h.start();
  h.seconds(421);
  assert.equal(h.state.phase, MatchPhase.Ended);
  assert.equal(h.state.outcome, Outcome.Timeout);
});
