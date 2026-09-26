/**
 * Regressions where lives.ts (downed state, revive pickup) meets other systems:
 *  - timed hazards of a downed owner resolve on schedule, lives left or not;
 *  - one F press is one action: dropping a crate never also claims the revive.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, PLAYER, tileCentre } from '@redbox/shared';
import { Box } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createAbilitySystem } from '../src/systems/abilities.js';
import { createBoxesSystem } from '../src/systems/boxes.js';
import { createLivesSystem } from '../src/systems/lives.js';

/** Row 30 is open floor from x=1..62. */
const OPEN = tileCentre(20, 30);

function ownedHazards(h: Harness, ownerId: string) {
  return [...h.state.hazards.values()].filter((hz) => hz.ownerId === ownerId);
}

for (const lives of [PLAYER.LIVES, 1]) {
  test(`grenade, mega bomb and meteor of an owner downed mid-fuse land on time (${lives === 1 ? 'out of lives' : 'respawn pending'})`, () => {
    const h = new Harness([createAbilitySystem(), createLivesSystem()]);
    const dwarf = h.addPlayer('dwarf', { id: 'dwarf', ...OPEN });
    const mage = h.addPlayer('mage', { id: 'mage', x: OPEN.x, y: OPEN.y + 64 });
    h.addPlayer('troll', { id: 'witness', x: OPEN.x - 200, y: OPEN.y });   // keeps the match out of Defeat
    h.start();
    dwarf.ranks[2] = 1; mage.ranks[2] = 1;   // mega bomb and meteor unlock in wave 3
    dwarf.lives = lives; mage.lives = lives;

    h.command('dwarf', 'ability', { slot: 0, x: OPEN.x + 150, y: OPEN.y });
    h.command('mage', 'ability', { slot: 2, x: OPEN.x + 150, y: OPEN.y + 64 });
    h.tick();
    h.command('dwarf', 'ability', { slot: 2, x: OPEN.x + 250, y: OPEN.y });
    h.tick();
    assert.equal(ownedHazards(h, 'dwarf').length, 2, 'grenade + mega bomb armed');
    assert.equal(ownedHazards(h, 'mage').length, 1, 'meteor armed');

    h.world.damage('dwarf', dwarf.hp, { sourceId: 'boss' });
    h.world.damage('mage', mage.hp, { sourceId: 'boss' });
    h.tick();
    assert.equal(dwarf.alive, false);
    assert.equal(mage.alive, false);

    const longestFuseMs = Math.max(
      CLASSES.dwarf.abilities[0].params.delayMs!,
      CLASSES.dwarf.abilities[2].params.delayMs!,
      CLASSES.mage.abilities[2].params.delayMs!,
    );
    assert.ok(longestFuseMs + 200 < PLAYER.RESPAWN_MS, 'fuses end before any respawn');
    h.seconds((longestFuseMs + 200) / 1000);
    assert.equal(dwarf.alive, false, 'still down');
    assert.equal(ownedHazards(h, 'dwarf').length, 0, 'grenade and mega bomb went off without their owner');
    assert.equal(ownedHazards(h, 'mage').length, 0, 'meteor landed without its owner');
    const fx = h.messages('fx').map((f) => f.kind);
    assert.ok(fx.includes('meteor'), 'meteor impact shown');
  });
}

test('a mine planted by a dwarf who is out of lives still ages out', () => {
  const h = new Harness([createAbilitySystem(), createLivesSystem()]);
  const dwarf = h.addPlayer('dwarf', { id: 'dwarf', ...OPEN });
  h.addPlayer('troll', { id: 'witness', x: OPEN.x - 200, y: OPEN.y });
  h.start();
  dwarf.ranks[1] = 1;   // mine unlocks in wave 2
  dwarf.lives = 1;
  h.command('dwarf', 'ability', { slot: 1, x: OPEN.x + 80, y: OPEN.y }).tick();
  assert.equal(ownedHazards(h, 'dwarf').length, 1, 'mine planted');

  h.world.damage('dwarf', dwarf.hp, { sourceId: 'boss' });
  h.tick();
  assert.equal(dwarf.alive, false);
  assert.equal(dwarf.lives, 0, 'out of lives: no respawn will ever tick it');

  h.seconds(CLASSES.dwarf.abilities[1].params.lifetimeMs! / 1000 + 1);
  assert.equal(ownedHazards(h, 'dwarf').length, 0, 'mine expired');
});

test('one F press by a carrier standing on the revive pickup drops the crate and does not also revive', () => {
  const h = new Harness([createBoxesSystem(), createLivesSystem()]);
  const a = h.addPlayer('troll', { id: 'a' });
  const dead = h.addPlayer('mage', { id: 'dead' });
  h.start();
  const rv = [...h.state.revives.values()][0]!;
  dead.lives = 1;
  h.world.damage('dead', dead.hp, { sourceId: 'boss' });
  h.tick();
  assert.equal(dead.lives, 0, 'teammate out of lives: the pickup has work to do');

  h.state.boxes.clear();
  const b = new Box();
  b.id = 'r1'; b.x = rv.x; b.y = rv.y;
  h.world.addBox(b, { isReal: true });
  h.place('a', rv.x, rv.y);
  h.command('a', 'interact', { targetId: 'r1' }).tick();
  assert.equal(a.carryingBoxId, 'r1', 'picked the crate up (and nothing else)');
  assert.equal(h.events('player_revived').length, 0);

  h.command('a', 'interact', {}).tick();
  assert.equal(h.events('box_dropped').length, 1, 'the press dropped the crate');
  assert.equal(h.events('player_revived').length, 0, 'and did not also claim the revive');
  assert.equal(dead.alive, false);
  assert.equal(h.state.revives.has(rv.id), true, 'pickup untouched');
});
