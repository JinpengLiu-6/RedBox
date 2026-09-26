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
/** Crate positions ordered by spawn index (`w<wave>c<i>`). */
const layoutOf = (h: Harness) => crates(h)
  .sort((a, b) => Number(a.id.split('c')[1]) - Number(b.id.split('c')[1]))
  .map(key);
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
  assert.notDeepEqual(layoutOf(h), spotsOf('c').slice(0, 15).map(key), 'spots are shuffled, not taken in map order');
});

test('wave 2 gets its own plan: 14 crates, 2 real, nothing stale', () => {
  const { h } = setup('mage');
  const wave1 = layoutOf(h);
  h.state.boxesDelivered = wavePlan(1).requiredDeliveries;
  h.tick().seconds(4.5);
  assert.equal(h.state.stage, 2);
  const boxes = crates(h);
  assert.notDeepEqual(layoutOf(h), wave1.slice(0, boxes.length), 'the wave number is part of the placement seed');
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

    // A carried crate cannot be taken on a later tick either.
    h.command(second.id, 'interact', {}).tick();
    assert.equal(box.carriedBy, first.id);
    assert.equal(first.carryingBoxId, box.id);
    assert.equal(second.carryingBoxId, '');
    assert.equal(h.events('box_picked').length, 1);
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

test('carried crate follows its carrier; each delivery counts once; third delivery clears the wave once', () => {
  const { h, players: [p, q] } = setup('dwarf', 'mage');
  const reals = realCrates(h);
  assert.equal(reals.length, 3);

  // Follow.
  const first = reals[0]!;
  h.place(p!.id, first.x, first.y).command(p!.id, 'interact', {}).tick();
  assert.ok(h.messages('fx').some((m) => m.kind === 'pickup'));
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
  assert.ok(h.messages('fx').some((m) => m.kind === 'deliver'));
  h.tick(10);
  assert.equal(h.state.boxesDelivered, 1, 'counted exactly once');

  // Two carriers reach the base in the same tick, and one of them presses F on arrival.
  const [second, third] = reals.slice(1);
  h.place(p!.id, second!.x, second!.y).command(p!.id, 'interact', {});
  h.place(q!.id, third!.x, third!.y).command(q!.id, 'interact', {}).tick();
  assert.equal(p!.carryingBoxId, second!.id);
  assert.equal(q!.carryingBoxId, third!.id);
  h.place(p!.id, BASE.x + 20, BASE.y - 20).place(q!.id, BASE.x - 20, BASE.y + 20);
  h.command(q!.id, 'interact', {}).tick();

  assert.equal(h.events('box_dropped').length, 0, 'F inside the base delivers, it never drops');
  assert.equal(third!.state, BoxState.Delivered);
  assert.equal(q!.carryingBoxId, '');
  assert.equal(h.state.boxesDelivered, 3, 'one point per crate, even in the same tick');
  const delivered = h.events('box_delivered');
  assert.equal(delivered.length, 3);
  assert.equal(new Set(delivered.map((e) => e.boxId)).size, 3);
  assert.equal(h.events('wave_cleared').length, 1);
  assert.equal(h.state.phase, MatchPhase.WaveTransition);
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

test('a downed or disconnected player cannot interact: no trap, no pickup', () => {
  const h = new Harness([createBoxesSystem()]);
  const downed = h.addPlayer('mage');
  const gone = h.addPlayer('troll');
  h.start();
  downed.alive = false;
  gone.connected = false;
  const [t1, t2] = trapCrates(h);
  const [r1, r2] = realCrates(h);

  for (const [a, b] of [[t1!, t2!], [r1!, r2!]]) {
    h.place(downed.id, a.x, a.y).command(downed.id, 'interact', { targetId: a.id });
    h.place(gone.id, b.x, b.y).command(gone.id, 'interact', { targetId: b.id }).tick();
    for (const box of [a, b]) assert.equal(box.state, BoxState.Idle, `${box.id} untouched`);
  }
  assert.equal(h.state.creeps.size, 0);
  assert.equal(h.state.boxes.size, 15);
  assert.equal(downed.carryingBoxId, '');
  assert.equal(gone.carryingBoxId, '');
  for (const t of ['trap_triggered', 'box_picked', 'box_dropped'] as const) assert.equal(h.events(t).length, 0, t);
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

/**
 * A real crate dropped 40px from a closed trap (both inside PICKUP_RADIUS of the
 * gap between them). `at(d)` is the point d px from the trap toward the real crate.
 */
function realDroppedBesideTrap() {
  const { h, players } = setup('mage', 'troll', 'dwarf');
  const [dropper] = players;
  const real = realCrates(h)[0]!;
  const gap = 40;
  for (const trap of trapCrates(h))
    for (const u of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const at = (d: number) => ({ x: trap.x + u.x * d, y: trap.y + u.y * d });
      const spot = at(gap);
      if (!h.world.walkable(spot.x, spot.y) || !h.world.reachable(spot, BASE)) continue;
      if (crates(h).some((b) => b !== trap && h.world.distance(b, spot) <= CRATES.PICKUP_RADIUS * 2)) continue;
      h.place(dropper!.id, real.x, real.y).command(dropper!.id, 'interact', {}).tick();
      h.place(dropper!.id, spot.x, spot.y).command(dropper!.id, 'interact', {}).tick();
      assert.equal(real.state, BoxState.Dropped);
      assert.deepEqual({ x: real.x, y: real.y }, spot);
      assert.ok(h.world.distance(trap, real) <= CRATES.PICKUP_RADIUS);
      return { h, players, trap, real, at };
    }
  throw new Error('no trap with walkable ground beside it');
}

test('interact resolves the NEAREST crate in range', () => {
  {
    const { h, players: [, b], trap, real, at } = realDroppedBesideTrap();
    const p = at(38);                          // 2px from the dropped real crate, 38px from the trap
    h.place(b!.id, p.x, p.y).command(b!.id, 'interact', {}).tick();
    assert.equal(b!.carryingBoxId, real.id);
    assert.equal(trap.state, BoxState.Idle);
    assert.equal(h.events('trap_triggered').length, 0);
  }
  {
    const { h, players: [, b], trap, real, at } = realDroppedBesideTrap();
    const p = at(10);                          // 10px from the trap, 30px from the real crate
    h.place(b!.id, p.x, p.y).command(b!.id, 'interact', {}).tick();
    assert.equal(h.events('trap_triggered').length, 1);
    assert.equal(b!.carryingBoxId, '');
    assert.equal(real.state, BoxState.Dropped);
  }
});

test('losing a same-tick race does nothing: the press never falls through to another crate', () => {
  // Race for the real crate: the loser's nearest crate is taken, the trap behind it stays shut.
  for (const winnerFirst of [true, false]) {
    const { h, players: [, a, b], trap, real, at } = realDroppedBesideTrap();
    const pa = at(45), pb = at(28);            // both are nearest to the real crate
    h.place(a!.id, pa.x, pa.y).place(b!.id, pb.x, pb.y);
    const [x, y] = winnerFirst ? [a!, b!] : [b!, a!];
    h.command(x.id, 'interact', {}).command(y.id, 'interact', {}).tick();
    assert.equal(real.carriedBy, x.id);
    assert.equal(y.carryingBoxId, '');
    assert.equal(trap.state, BoxState.Idle, 'the loser did not open the trap');
    assert.equal(h.events('trap_triggered').length, 0);
    assert.equal(h.state.creeps.size, 0);
  }

  // Race for the trap: once it breaks, the loser does not grab the real crate beside it.
  const { h, players: [, a, b], trap, real, at } = realDroppedBesideTrap();
  const pa = at(-8), pb = at(15);              // both are nearest to the trap
  h.place(a!.id, pa.x, pa.y).place(b!.id, pb.x, pb.y);
  h.command(a!.id, 'interact', {}).command(b!.id, 'interact', {}).tick();
  assert.equal(trap.state, BoxState.Triggered);
  assert.equal(h.events('trap_triggered').length, 1);
  assert.equal(b!.carryingBoxId, '');
  assert.equal(real.state, BoxState.Dropped);
  assert.equal(h.events('box_picked').length, 1, 'only the setup pickup');
});
