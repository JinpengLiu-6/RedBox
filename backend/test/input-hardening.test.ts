/**
 * Hostile or broken client input (NaN / Infinity survive msgpack) must never
 * crash the tick or put NaN into synced state.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWallTile, tileAt } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { finiteOr0 } from '../src/room.js';

test('the Move handler sanitiser turns NaN / Infinity / junk into 0', () => {
  assert.equal(finiteOr0(Infinity), 0);
  assert.equal(finiteOr0(-Infinity), 0);
  assert.equal(finiteOr0(NaN), 0);
  assert.equal(finiteOr0(undefined), 0);
  assert.equal(finiteOr0({}), 0);
  assert.equal(finiteOr0('0.5'), 0.5);
  assert.equal(finiteOr0(-1), -1);
});

test('a non-finite move intent is ignored instead of teleporting the hero to NaN', () => {
  for (const [dx, dy] of [[Infinity, 0], [Infinity, Infinity], [NaN, 1], [0, -Infinity]]) {
    const h = Harness.full();
    const p = h.addPlayer('mage', { id: 'h' });
    h.start();
    h.move('h', dx!, dy!);
    assert.doesNotThrow(() => h.tick(5));
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `position finite after move(${dx},${dy})`);
    assert.ok(Number.isFinite(p.facing));
  }
});

test('attack / ability aims of NaN never throw or leave the facing NaN', () => {
  for (const cls of ['mage', 'dwarf', 'troll', 'brawler', 'warrior'] as const) {
    const h = Harness.full();
    const p = h.addPlayer(cls, { id: 'h' });
    h.start();
    h.world.spawnCreep({ x: p.x + 60, y: p.y });
    h.command('h', 'attack', { x: NaN, y: 0 });
    assert.doesNotThrow(() => h.tick());
    h.command('h', 'attack', { x: Infinity, y: NaN });
    assert.doesNotThrow(() => h.tick());
    h.command('h', 'ability', { slot: 0 } as never);   // no aim: falls back to the facing
    assert.doesNotThrow(() => h.tick());
    assert.ok(Number.isFinite(p.facing), `${cls} facing finite`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
});

test('walkable / tileAt treat NaN as off the map instead of throwing', () => {
  const h = Harness.full();
  assert.equal(h.world.walkable(NaN, 100), false);
  assert.equal(h.world.walkable(100, NaN), false);
  assert.equal(tileAt(NaN, NaN), '#');
  assert.equal(isWallTile(NaN, 3), true);
  assert.doesNotThrow(() => h.world.nextStep({ x: NaN, y: NaN }, { x: 100, y: 100 }));
});
