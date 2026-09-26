/** Bots (07): seat fillers act only via setIntent / command and steer with nextStep. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, BoxState, MAP, TILE, tileCentre, type System, type World } from '@redbox/shared';
import { Box, Crystal } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createBotsSystem } from '../src/ai/bots.js';
import { createMovementSystem } from '../src/systems/movement.js';

const BASE = { x: MAP.BASE.x, y: MAP.BASE.y };

/** Records what the bots injected this tick; runs right after bots, like movement would. */
function spy() {
  const seen: Array<{ tick: number; kind: string; playerId: string; payload: any }> = [];
  let tick = 0;
  const sys: System = {
    id: 'spy',
    update(w: World) {
      tick++;
      for (const kind of ['attack', 'ability', 'interact'] as const) {
        for (const c of w.commands(kind)) seen.push({ tick, kind, playerId: c.playerId, payload: c.payload });
      }
    },
  };
  return { sys, seen };
}

function addBox(h: Harness, id: string, pos: { x: number; y: number }, state = BoxState.Idle, real = false) {
  const b = new Box();
  b.id = id; b.x = pos.x; b.y = pos.y; b.state = state;
  h.world.addBox(b, { isReal: real });
  return b;
}

function make() {
  const s = spy();
  const h = new Harness([createBotsSystem(), s.sys, createMovementSystem()]);
  return { h, seen: s.seen };
}

test('bot next to a closed crate issues interact for it', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('troll', { ...pos, bot: true });
  h.start();
  addBox(h, 'crate1', { x: pos.x + 20, y: pos.y });
  h.tick();
  const inter = seen.filter((c) => c.kind === 'interact' && c.playerId === bot.id);
  assert.equal(inter.length, 1);
  assert.equal(inter[0]!.payload.targetId, 'crate1');
});

test('bot walks toward the nearest closed crate, re-issuing intent every tick', () => {
  const { h } = make();
  const start = tileCentre(30, 20);
  const bot = h.addPlayer('brawler', { ...start, bot: true });
  h.start();
  const target = tileCentre(36, 20);
  addBox(h, 'far', target);
  const d0 = h.world.distance(bot, target);
  h.tick(10);
  assert.ok(h.world.distance(bot, target) < d0 - 50, 'moved toward the crate');
  assert.ok(h.world.intentFor(bot.id) !== undefined, 'intent is fresh on the latest tick');
});

test('carrying bot moves toward base and does not fight or interact', () => {
  const { h, seen } = make();
  const start = tileCentre(40, 20);
  const bot = h.addPlayer('warrior', { ...start, bot: true });
  h.start();
  const box = addBox(h, 'held', start, BoxState.Carried, true);
  box.carriedBy = bot.id; bot.carryingBoxId = box.id;
  h.world.spawnCreep({ x: start.x + 30, y: start.y });
  const d0 = h.world.distance(bot, BASE);
  h.tick(20);
  assert.ok(h.world.distance(bot, BASE) < d0 - 100, `closer to base: ${d0.toFixed(0)} -> ${h.world.distance(bot, BASE).toFixed(0)}`);
  assert.equal(seen.filter((c) => c.playerId === bot.id).length, 0, 'no commands while carrying');
});

test('bot next to a goblin attacks with an aim point at the goblin', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('troll', { ...pos, bot: true });
  h.start();
  const gob = h.world.spawnCreep({ x: pos.x + 30, y: pos.y });
  h.tick();
  const atk = seen.filter((c) => c.kind === 'attack' && c.playerId === bot.id);
  assert.equal(atk.length, 1);
  assert.equal(atk[0]!.payload.x, gob.x);
  assert.equal(atk[0]!.payload.y, gob.y);
  assert.equal(atk[0]!.payload.targetId, gob.id);
  const q = seen.filter((c) => c.kind === 'ability' && c.playerId === bot.id);
  assert.equal(q.length, 1, 'Q is used too');
  assert.equal(q[0]!.payload.slot, 0);
  assert.equal(q[0]!.payload.x, gob.x);
});

test('locked / cooling abilities are never issued', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('brawler', { ...pos, bot: true });
  h.start();
  h.world.spawnCreep({ x: pos.x + 30, y: pos.y });
  bot.cooldownReadyAtMs[0] = 999_999;
  h.tick(5);
  assert.equal(seen.filter((c) => c.kind === 'ability').length, 0);
});

test('ranged bot holds at ~0.8 x range instead of closing to melee', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('mage', { ...pos, bot: true });          // range 380
  h.start();
  const gob = h.world.spawnCreep({ x: pos.x + 200, y: pos.y });
  h.tick(10);
  const dist = h.world.distance(bot, gob);
  assert.ok(dist > 150 && dist < 380 * 0.8 + 5, `held at range: ${dist.toFixed(0)}`);
  assert.ok(seen.some((c) => c.kind === 'attack' && c.playerId === bot.id), 'still shooting');
});

test('melee bot closes in on a goblin that is out of reach but inside fight radius', () => {
  const { h } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('brawler', { ...pos, bot: true });
  h.start();
  const gob = h.world.spawnCreep({ x: pos.x + 200, y: pos.y });
  h.tick(10);
  assert.ok(h.world.distance(bot, gob) < 100, `closed in: ${h.world.distance(bot, gob).toFixed(0)}`);
});

test('dropped crate is preferred over a fight and a closed crate', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('dwarf', { ...pos, bot: true });
  h.start();
  addBox(h, 'closed', { x: pos.x + 20, y: pos.y });
  addBox(h, 'dropped', { x: pos.x - 20, y: pos.y }, BoxState.Dropped, true);
  h.world.spawnCreep({ x: pos.x, y: pos.y + 30 });
  h.tick();
  const mine = seen.filter((c) => c.playerId === bot.id);
  assert.deepEqual(mine.map((c) => c.kind), ['interact']);
  assert.equal(mine[0]!.payload.targetId, 'dropped');
});

test('two bots never claim the same closed crate', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const a = h.addPlayer('troll', { id: 'a', ...pos, bot: true });
  const b = h.addPlayer('brawler', { id: 'b', x: pos.x + 10, y: pos.y, bot: true });
  h.start();
  addBox(h, 'c1', { x: pos.x + 20, y: pos.y });
  addBox(h, 'c2', { x: pos.x + 300, y: pos.y });
  h.tick();
  const inter = seen.filter((c) => c.kind === 'interact');
  assert.equal(inter.length, 1, 'only one bot interacts with the near crate');
  const other = inter[0]!.playerId === a.id ? b : a;
  const step = h.world.intentFor(other.id);
  assert.ok(step && step.x > 0.9, 'the other bot heads to the far crate');
});

test('low-hp bot retreats to base instead of fighting', () => {
  const { h, seen } = make();
  const pos = tileCentre(40, 20);
  const bot = h.addPlayer('troll', { ...pos, bot: true });
  h.start();
  bot.hp = Math.floor(bot.maxHp * 0.2);
  h.world.spawnCreep({ x: pos.x + 30, y: pos.y });
  const d0 = h.world.distance(bot, BASE);
  h.tick(10);
  assert.ok(h.world.distance(bot, BASE) < d0 - 50, 'heading home');
  assert.equal(seen.filter((c) => c.kind === 'attack').length, 0, 'not fighting');
});

test('with nothing else to do the bot attacks the nearest standing tower', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('troll', { x: pos.x + 30, y: pos.y, bot: true });
  h.start();
  for (const id of [...h.state.boxes.keys()]) h.state.boxes.delete(id);
  const tower = new Crystal();
  tower.id = 'tower1'; tower.x = pos.x; tower.y = pos.y; tower.hp = tower.maxHp = 450;
  h.state.crystals.set(tower.id, tower);
  h.tick();
  const atk = seen.filter((c) => c.kind === 'attack' && c.playerId === bot.id);
  assert.equal(atk.length, 1);
  assert.equal(atk[0]!.payload.targetId, tower.id);
});

test('bot steers around a wall via nextStep to reach a crate', () => {
  const { h } = make();
  const from = tileCentre(7, 8), to = tileCentre(16, 8);   // wall x=9..14 between them
  const bot = h.addPlayer('brawler', { ...from, bot: true });
  h.start();
  for (const id of [...h.state.boxes.keys()]) h.state.boxes.delete(id);
  addBox(h, 'behind', to);
  assert.equal(h.world.lineOfSight(from, to), false);
  h.seconds(6);
  assert.ok(h.world.distance(bot, to) < TILE * 1.5, `arrived: ${h.world.distance(bot, to).toFixed(0)}`);
});

test('unreachable crates are ignored', () => {
  const { h } = make();
  const pos = tileCentre(30, 20);
  const bot = h.addPlayer('brawler', { ...pos, bot: true });
  h.start();
  for (const id of [...h.state.boxes.keys()]) h.state.boxes.delete(id);
  addBox(h, 'inwall', tileCentre(10, 7));   // inside the ###### block
  h.tick(5);
  assert.equal(h.world.intentFor(bot.id), undefined, 'idle: no path');
});

test('humans and dead bots are left alone; goals re-decide within REACTION_MS', () => {
  const { h, seen } = make();
  const pos = tileCentre(30, 20);
  const human = h.addPlayer('troll', { id: 'human', ...pos });
  const dead = h.addPlayer('mage', { id: 'dead', ...pos, bot: true });
  h.start();
  dead.alive = false;
  h.world.spawnCreep({ x: pos.x + 30, y: pos.y });
  h.tick(Math.ceil(BOTS.REACTION_MS / 50) + 1);
  assert.equal(seen.length, 0, 'nobody acted');
  assert.equal(h.world.intentFor(human.id), undefined);
  assert.equal(h.world.intentFor(dead.id), undefined);
});

test('a bot wedged on a wall corner sidesteps instead of pushing into it forever', () => {
  // (1392,976) sits in a corner where the path direction is blocked for a full body.
  const { h } = make();
  const start = { x: 1392, y: 976 };
  const bot = h.addPlayer('troll', { id: 'bot_wedge', ...start, bot: true });
  h.start();
  h.place(bot.id, start.x, start.y);
  for (const id of [...h.state.boxes.keys()]) h.state.boxes.delete(id);
  const crate = addBox(h, 'drop', { x: 1424, y: 496 }, BoxState.Dropped, true);
  h.seconds(6);
  assert.ok(h.world.distance(bot, start) > 100, `bot got moving (moved ${h.world.distance(bot, start).toFixed(0)}px)`);
  assert.ok(h.world.distance(bot, crate) < h.world.distance(start, crate), 'and made progress toward the crate');
});
