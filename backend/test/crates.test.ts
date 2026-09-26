/** 01-crates: layout, atomic pickup, traps once, delivery once, drops never lose a real crate. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CRATES, MAP, BoxMark, BoxState, MatchPhase, spotsOf, tileCentre, wavePlan,
} from '@redbox/shared';
import type { Box } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createBoxesSystem } from '../src/systems/boxes.js';

const BASE = { x: MAP.BASE.x, y: MAP.BASE.y };
const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

function setup(...classes: Array<'mage' | 'troll' | 'brawler' | 'dwarf' | 'warrior'>) {
  const h = new Harness([createBoxesSystem()]);
  const players = classes.map((c) => h.addPlayer(c));
  h.start();
  return { h, players };
}
const crates = (h: Harness) => [...h.state.boxes.values()] as Box[];
const realCrates = (h: Harness) => crates(h).filter((b) => h.world.isBoxReal(b.id));
const trapCrates = (h: Harness) => crates(h).filter((b) => !h.world.isBoxReal(b.id));

test('wave 1: 15 identical closed crates on distinct seeded spots, exactly 3 real', () => {
  const { h } = setup('mage');
  const boxes = crates(h);
  assert.equal(boxes.length, 15);
  assert.equal(realCrates(h).length, 3);
  assert.equal(trapCrates(h).length, 12);

  const spots = new Set(spotsOf('c').map(key));
  assert.equal(new Set(boxes.map(key)).size, 15, 'one crate per spot');
  for (const b of boxes) {
    assert.ok(spots.has(key(b)), `crate ${b.id} sits on a 'c' spot`);
    assert.equal(b.mark, BoxMark.Unknown);
    assert.equal(b.state, BoxState.Idle);
    assert.equal(b.carriedBy, '');
    assert.ok(h.world.reachable(b, BASE), `crate ${b.id} reachable from base`);
  }
  // On the wire every closed crate is identical apart from id and position.
  const wire = new Set(boxes.map((b) => {
    const { id: _id, x: _x, y: _y, ...rest } = b.toJSON() as Record<string, unknown>;
    return JSON.stringify(rest);
  }));
  assert.equal(wire.size, 1, 'no field distinguishes real from trap');

  // Layout is seeded (same spots every match), truth is random.
  const layout = new Map(boxes.map((b) => [b.id, key(b)]));
  const realSets = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const other = setup('mage').h;
    assert.deepEqual(new Map(crates(other).map((b) => [b.id, key(b)])), layout, 'reproducible placement');
    realSets.add(realCrates(other).map((b) => b.id).sort().join());
  }
  assert.ok(realSets.size > 1, 'real/trap identities are not fixed by the seed');
});

test('wave 2 gets its own plan: 14 crates, 2 real, nothing stale', () => {
  const { h } = setup('mage');
  h.state.boxesDelivered = wavePlan(1).requiredDeliveries;
  h.tick().seconds(4.5);
  assert.equal(h.state.stage, 2);
  const boxes = crates(h);
  assert.equal(boxes.length, wavePlan(2).realCrates + wavePlan(2).trapCrates);
  assert.equal(realCrates(h).length, 2);
  assert.ok(boxes.every((b) => b.id.startsWith('w2') && b.mark === BoxMark.Unknown && b.state === BoxState.Idle));
});

test('two players interact on the same crate in one tick: first command wins, one owner', () => {
  for (const firstIdx of [0, 1]) {
    const { h, players } = setup('mage', 'troll');
    const box = realCrates(h)[0]!;
    h.place(players[0]!.id, box.x - 10, box.y);
    h.place(players[1]!.id, box.x + 10, box.y);
    const first = players[firstIdx]!, second = players[1 - firstIdx]!;
    h.command(first.id, 'interact', {}).command(second.id, 'interact', {}).tick();

    assert.equal(box.state, BoxState.Carried);
    assert.equal(box.mark, BoxMark.Real);
    assert.equal(box.carriedBy, first.id);
    assert.equal(first.carryingBoxId, box.id);
    assert.equal(second.carryingBoxId, '', 'the loser owns nothing');
    assert.equal(h.events('box_picked').length, 1);
    assert.equal(h.events('box_picked')[0]!.playerId, first.id);
    assert.equal(h.events('box_dropped').length, 0);
  }
});

test('a player spamming interact in one tick grabs exactly one crate and keeps it', () => {
  const { h, players: [p] } = setup('brawler');
  const box = realCrates(h)[0]!;
  h.place(p!.id, box.x, box.y);
  h.command(p!.id, 'interact', {}).command(p!.id, 'interact', {}).command(p!.id, 'interact', {}).tick();
  assert.equal(p!.carryingBoxId, box.id);
  assert.equal(box.state, BoxState.Carried);
  assert.equal(h.events('box_picked').length, 1);
  assert.equal(h.events('box_dropped').length, 0, 'the extra presses did not toggle a drop');
});

test('a trap triggers exactly once, spawns 2 goblins and never becomes inventory', () => {
  const { h, players: [a, b] } = setup('mage', 'troll');
  const trap = trapCrates(h)[0]!;
  h.place(a!.id, trap.x - 8, trap.y);
  h.place(b!.id, trap.x + 8, trap.y);
  h.command(a!.id, 'interact', {}).command(b!.id, 'interact', {}).tick();

  assert.equal(h.state.creeps.size, CRATES.TRAP_GOBLINS);
  for (const [, c] of h.state.creeps) {
    assert.ok(h.world.walkable(c.x, c.y));
    assert.ok(h.world.distance(c, trap) < 64, 'goblins burst out of the crate');
  }
  assert.equal(h.events('trap_triggered').length, 1);
  assert.equal(h.events('trap_triggered')[0]!.playerId, a!.id);
  assert.equal(h.state.boxes.has(trap.id), false, 'broken crate removed');
  assert.equal(trap.mark, BoxMark.Fake);
  assert.equal(trap.state, BoxState.Triggered);
  assert.equal(a!.carryingBoxId, '');
  assert.equal(b!.carryingBoxId, '');
  assert.ok(h.messages('fx').some((m) => m.kind === 'trap'));

  h.command(a!.id, 'interact', {}).command(b!.id, 'interact', { targetId: trap.id }).tick(2);
  assert.equal(h.state.creeps.size, CRATES.TRAP_GOBLINS, 'second interact does nothing');
  assert.equal(h.events('trap_triggered').length, 1);
  assert.equal(h.events('box_picked').length, 0);
});

test('carried crate follows its carrier; delivery counts once; third delivery clears the wave once', () => {
  const { h, players: [p] } = setup('dwarf');
  const reals = realCrates(h);
  assert.equal(reals.length, 3);

  // Follow.
  const first = reals[0]!;
  h.place(p!.id, first.x, first.y).command(p!.id, 'interact', {}).tick();
  const elsewhere = tileCentre(5, 20);
  h.place(p!.id, elsewhere.x, elsewhere.y).tick();
  assert.deepEqual({ x: first.x, y: first.y }, elsewhere);

  // Deliver.
  h.place(p!.id, BASE.x, BASE.y).tick();
  assert.equal(h.state.boxesDelivered, 1);
  assert.equal(first.state, BoxState.Delivered);
  assert.equal(h.state.boxes.has(first.id), false);
  assert.equal(p!.carryingBoxId, '');
  assert.equal(h.events('box_delivered').length, 1);
  h.tick(10);
  assert.equal(h.state.boxesDelivered, 1, 'counted exactly once');

  for (const box of reals.slice(1)) {
    h.place(p!.id, box.x, box.y).command(p!.id, 'interact', {}).tick();
    assert.equal(p!.carryingBoxId, box.id);
    h.place(p!.id, BASE.x + 20, BASE.y - 20).tick();
  }
  assert.equal(h.state.boxesDelivered, 3);
  assert.equal(h.events('box_delivered').length, 3);
  assert.equal(h.events('wave_cleared').length, 1);
  assert.equal(h.state.phase, MatchPhase.WaveTransition);
  h.tick(5);
  assert.equal(h.events('wave_cleared').length, 1, 'wave advances exactly once');
});

test('carrier dies inside a wall: crate dropped on reachable ground, never lost, can be recovered', () => {
  const { h, players: [carrier, mate] } = setup('warrior', 'mage');
  const box = realCrates(h)[0]!;
  h.place(carrier!.id, box.x, box.y).command(carrier!.id, 'interact', {}).tick();
  assert.equal(carrier!.carryingBoxId, box.id);

  const wall = tileCentre(10, 7);                  // row 7, cols 9..14 are wall
  assert.equal(h.world.walkable(wall.x, wall.y), false);
  h.place(carrier!.id, wall.x, wall.y);
  carrier!.alive = false;
  h.tick();

  assert.equal(h.state.boxes.get(box.id), box, 'real crate is never destroyed');
  assert.equal(box.state, BoxState.Dropped);
  assert.equal(box.mark, BoxMark.Real);
  assert.equal(box.carriedBy, '');
  assert.equal(carrier!.carryingBoxId, '');
  assert.ok(h.world.walkable(box.x, box.y), `dropped on walkable ground (${box.x},${box.y})`);
  assert.ok(h.world.reachable(box, BASE), 'dropped crate reachable from base');
  assert.equal(h.events('box_dropped').length, 1);
  assert.equal(h.events('box_dropped')[0]!.label, 'downed');

  h.place(mate!.id, box.x, box.y).command(mate!.id, 'interact', {}).tick();
  assert.equal(box.state, BoxState.Carried);
  assert.equal(mate!.carryingBoxId, box.id);
});

test('disconnected human drops the crate; a bot (connected=false) keeps carrying', () => {
  const h = new Harness([createBoxesSystem()]);
  const human = h.addPlayer('troll');
  const bot = h.addPlayer('dwarf', { bot: true });
  h.start();
  const [c1, c2] = realCrates(h);
  h.place(human.id, c1!.x, c1!.y).command(human.id, 'interact', {});
  h.place(bot.id, c2!.x, c2!.y).command(bot.id, 'interact', {}).tick();
  assert.equal(human.carryingBoxId, c1!.id);
  assert.equal(bot.carryingBoxId, c2!.id);

  human.connected = false;
  h.tick(3);
  assert.equal(c1!.state, BoxState.Dropped);
  assert.equal(human.carryingBoxId, '');
  assert.ok(h.world.walkable(c1!.x, c1!.y));
  assert.equal(h.events('box_dropped')[0]!.label, 'disconnected');
  assert.equal(c2!.state, BoxState.Carried, 'bots are never "disconnected"');
  assert.equal(bot.carryingBoxId, c2!.id);
});

test('F while carrying drops it; the dropped crate cannot be stolen the same tick, only after', () => {
  const { h, players: [a, b] } = setup('mage', 'brawler');
  const box = realCrates(h)[0]!;
  h.place(a!.id, box.x, box.y).command(a!.id, 'interact', {}).tick();
  h.place(b!.id, box.x + 5, box.y);
  h.command(a!.id, 'interact', {}).command(b!.id, 'interact', {}).tick();
  assert.equal(box.state, BoxState.Dropped);
  assert.equal(a!.carryingBoxId, '');
  assert.equal(b!.carryingBoxId, '', 'resolved once per tick');
  assert.ok(h.messages('fx').some((m) => m.kind === 'drop'));

  h.command(b!.id, 'interact', {}).tick();
  assert.equal(b!.carryingBoxId, box.id);
  assert.equal(box.carriedBy, b!.id);

  // Nothing in range: interact is ignored (revive pickups belong to lives.ts).
  const before = h.events().length;
  h.place(a!.id, BASE.x, BASE.y).command(a!.id, 'interact', {}).tick();
  assert.equal(a!.carryingBoxId, '');
  assert.equal(h.events().length, before);
});
