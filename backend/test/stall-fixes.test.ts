/**
 * Regression tests for the solo-demo stalls: heroes wedged on wall corners,
 * Blink leaving the body in a wall, dropped crates nobody fetched, claims held
 * by a bot that cannot move, a goblin stuck in a wall, and the match clock
 * running out between waves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_H, ARENA_W, BoxState, CLASS_IDS, MAP, MATCH, MatchPhase, Outcome, PLAYER, TICK_RATE,
  isWallTile, tileCentre, type Vec2, type World,
} from '@redbox/shared';
import { Box } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createMovementSystem } from '../src/systems/movement.js';
import { createAbilitySystem } from '../src/systems/abilities.js';
import { createGoblinsSystem } from '../src/systems/goblins.js';

/** The hero's body square is clear of walls, exactly as movement.ts tests it. */
function bodyClear(w: World, x: number, y: number) {
  const r = PLAYER.RADIUS;
  return w.walkable(x - r, y - r) && w.walkable(x + r, y - r) && w.walkable(x - r, y + r) && w.walkable(x + r, y + r);
}

function addBox(h: Harness, id: string, pos: Vec2, state: number, real: boolean, carriedBy = '') {
  const b = new Box();
  b.id = id; b.x = pos.x; b.y = pos.y; b.state = state; b.carriedBy = carriedBy;
  h.world.addBox(b, { isReal: real });
  return b;
}

/** Steers a hero with nothing but `nextStep` + movement; returns ticks taken or -1. */
function steerHome(h: Harness, id: string, to: Vec2, maxTicks: number): number {
  const p = h.state.players.get(id)!;
  for (let t = 0; t < maxTicks; t++) {
    if (h.world.distance(p, to) <= 20) return t;
    const d = h.world.nextStep(p, to);
    h.move(id, d.x, d.y);
    h.tick();
  }
  return -1;
}

test('nextStep gets a hero past the wall corner east of base (the ~390px carrier freeze)', () => {
  for (const cls of ['mage', 'dwarf', 'troll'] as const) {
    const h = new Harness([createMovementSystem()]);
    const s = tileCentre(19, 25);
    h.addPlayer(cls, { id: 'p', ...s });
    h.start();
    const ticks = steerHome(h, 'p', MAP.BASE, 10 * TICK_RATE);
    assert.ok(ticks >= 0, `${cls} reached base (stuck at ${h.state.players.get('p')!.x.toFixed(0)},${h.state.players.get('p')!.y.toFixed(0)})`);
  }
});

test('nextStep reaches base from every body-clear start within 700px (no corner deadlocks)', () => {
  const h = new Harness([createMovementSystem()]);
  const p = h.addPlayer('mage', { id: 'p' });
  h.start();
  const stuck: string[] = [];
  let starts = 0;
  for (let ty = 0; ty < ARENA_H; ty++) for (let tx = 0; tx < ARENA_W; tx++) {
    if (isWallTile(tx, ty)) continue;
    for (const [ox, oy] of [[0, 0], [9, 9], [-9, -9], [9, -9], [-9, 9]] as const) {
      const c = tileCentre(tx, ty);
      const s = { x: c.x + ox, y: c.y + oy };
      if (h.world.distance(s, MAP.BASE) > 700 || !bodyClear(h.world, s.x, s.y) || !h.world.reachable(s, MAP.BASE)) continue;
      starts++;
      h.state.elapsedMs = 0;   // many trips: keep the match clock from running out
      p.x = s.x; p.y = s.y;
      if (steerHome(h, 'p', MAP.BASE, 15 * TICK_RATE) < 0) stuck.push(`(${tx},${ty})${ox},${oy}`);
    }
  }
  assert.ok(starts > 500, `swept ${starts} starts`);
  assert.deepEqual(stuck, [], `wedged starts: ${stuck.slice(0, 10).join(' ')}`);
});

test('a bot carrier next to the corner east of base delivers', () => {
  const h = Harness.full();
  const bot = h.addPlayer('troll', { id: 'bot', bot: true, x: 620, y: 830 });
  h.start();
  h.state.creeps.clear();
  h.state.boxes.clear();   // only the carried crate: nothing else to deliver afterwards
  h.state.boss.alive = false;
  const b = addBox(h, 'held', bot, BoxState.Carried, true, bot.id);
  bot.carryingBoxId = b.id;
  h.seconds(8);
  assert.equal(h.state.boxesDelivered, 1, `delivered (carrier at ${bot.x.toFixed(0)},${bot.y.toFixed(0)})`);
});

test('goblins chasing around corners never clip into walls', () => {
  const h = new Harness([createMovementSystem(), createGoblinsSystem()]);
  const hero = h.addPlayer('troll', { id: 'hero', ...tileCentre(16, 25) });
  h.start();
  h.state.creeps.clear();
  const gobs = [tileCentre(12, 30), tileCentre(16, 30), tileCentre(20, 20), tileCentre(8, 24)].map((s) => h.world.spawnCreep(s));
  for (let t = 0; t < 6 * TICK_RATE; t++) {
    hero.hp = hero.maxHp;
    h.tick();
    for (const g of gobs) assert.ok(h.world.walkable(g.x, g.y), `goblin in a wall at ${g.x.toFixed(1)},${g.y.toFixed(1)}`);
  }
});

test('a goblin found inside a wall is put back on the floor and hunts again', () => {
  const h = new Harness([createMovementSystem(), createGoblinsSystem()]);
  const hero = h.addPlayer('troll', { x: tileCentre(40, 16).x, y: tileCentre(40, 16).y + 64 });
  h.start();
  h.state.creeps.clear();
  const c = h.world.spawnCreep({ x: hero.x, y: hero.y - 150 });
  c.x = tileCentre(40, 15).x; c.y = 15 * 32 + 32 - 0.1;   // 0.1px inside the wall block's bottom edge
  assert.equal(h.world.walkable(c.x, c.y), false);
  h.seconds(5);
  assert.equal(h.world.walkable(c.x, c.y), true, 'back on the floor');
  assert.equal(c.targetId, hero.id, 'and chasing the hero');
});

test('Blink next to a wall lands with the whole body clear, and the mage can walk away', () => {
  for (const [from, aim] of [
    [{ x: 300, y: 848 }, { x: 447, y: 848 }],   // wall tile (14,26) starts at x=448
    [{ x: 560, y: 400 }, { x: 560, y: 444 }],   // wall row 14 starts at y=448
    [tileCentre(4, 3), { x: 34, y: tileCentre(4, 3).y }],   // 2px right of the outer wall
  ] as const) {
    const h = new Harness([createMovementSystem(), createAbilitySystem()]);
    const m = h.addPlayer('mage', { id: 'm', ...from });
    h.start();
    m.ranks[1] = 1;   // Blink, normally unlocked in wave 2
    h.command('m', 'ability', { slot: 1, x: aim.x, y: aim.y });
    h.tick();
    assert.ok(h.events('ability_used').length === 1, 'blink fired');
    assert.ok(h.world.distance(m, from) > 20, 'and moved the mage');
    assert.ok(bodyClear(h.world, m.x, m.y), `body clear at ${m.x.toFixed(1)},${m.y.toFixed(1)}`);
    const landed = { x: m.x, y: m.y };
    h.walk('m', from.x < aim.x ? -1 : from.x > aim.x ? 1 : 0, from.y < aim.y ? -1 : from.y > aim.y ? 1 : 0, 1);
    assert.ok(h.world.distance(m, landed) > 100, `walked away: ${h.world.distance(m, landed).toFixed(0)}px`);
  }
});

test('a hero whose body overlaps a wall can still walk out, in any direction', () => {
  for (const [dx, dy] of [[-1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1]] as const) {
    const h = new Harness([createMovementSystem()]);
    const p = h.addPlayer('mage', { id: 'p', x: 447, y: 848 });   // body 13px into tile (14,26)
    h.start();
    assert.equal(bodyClear(h.world, p.x, p.y), false);
    h.walk('p', dx, dy, 1);
    assert.ok(h.world.distance(p, { x: 447, y: 848 }) > 100, `moved ${dx},${dy}`);
    assert.ok(h.world.walkable(p.x, p.y), 'never through a wall');
  }
});

test('a dropped real crate far from every bot is still fetched once nothing else is left', () => {
  const h = Harness.full();
  for (const c of CLASS_IDS) h.addPlayer(c, { id: c, bot: true });
  h.start();
  h.state.boxes.clear();
  h.state.creeps.clear();
  for (const t of h.state.crystals.values()) { t.hp = 0; t.destroyed = true; }
  const at = tileCentre(36, 30);
  addBox(h, 'far', at, BoxState.Dropped, true);
  assert.ok(Math.min(...[...h.state.players.values()].map((p) => h.world.distance(p, at))) > 600, 'out of the old 600px reach');
  h.seconds(60);
  assert.equal(h.state.boxesDelivered, 1);
});

test('the bot nearest a far dropped crate fetches it before opening closed crates', () => {
  const h = Harness.full();
  const near = h.addPlayer('troll', { id: 'near', bot: true, ...tileCentre(30, 25) });
  h.addPlayer('brawler', { id: 'far', bot: true, ...tileCentre(5, 25) });
  h.start();
  h.state.boxes.clear();
  h.state.creeps.clear();
  h.state.boss.alive = false;
  addBox(h, 'closed', tileCentre(28, 20), BoxState.Idle, false);
  const at = tileCentre(55, 20);
  addBox(h, 'dropped', at, BoxState.Dropped, true);
  assert.ok(h.world.distance(near, at) > 600);
  h.seconds(12);
  const picks = h.events('box_picked');
  assert.equal(picks[0]?.playerId, near.id, 'the nearest bot went for the known-real crate first');
});

test('a retreating bot still grabs a dropped crate it passes on the way home', () => {
  const h = Harness.full();
  const pos = tileCentre(30, 25);
  const bot = h.addPlayer('troll', { id: 'bot', bot: true, ...pos });
  h.start();
  h.state.boxes.clear();
  h.state.creeps.clear();
  h.state.boss.alive = false;
  bot.hp = Math.floor(bot.maxHp * 0.2);
  h.world.spawnCreep({ x: pos.x + 120, y: pos.y });   // a threat: the bot retreats
  addBox(h, 'onTheWay', { x: pos.x - 60, y: pos.y }, BoxState.Dropped, true);
  h.seconds(3);
  assert.equal(bot.carryingBoxId, 'onTheWay');
});

test('a bot that cannot move gives up its claim, so another bot takes the last crate', () => {
  const h = Harness.full();
  const stuck = h.addPlayer('mage', { id: 'stuck', bot: true, x: 400, y: 848 });
  h.addPlayer('troll', { id: 'other', bot: true, x: 200, y: 850 });
  h.start();
  h.state.creeps.clear();
  h.state.boxes.clear();
  h.state.boss.alive = false;
  for (const t of h.state.crystals.values()) { t.hp = 0; t.destroyed = true; }
  addBox(h, 'last', { x: 592, y: 848 }, BoxState.Idle, true);
  h.world.addModifier(stuck.id, 'stunned', 1, 120_000);   // frozen in place: it claims the nearest crate
  h.seconds(40);
  assert.equal(h.events('box_picked')[0]?.playerId, 'other');
});

test('the 7-minute cap holds between waves: no new wave after time is up', () => {
  const h = Harness.full();
  const a = h.addPlayer('troll', { id: 'a' });
  h.start();
  while (h.world.now < MATCH.DURATION_MS - 1000) { a.hp = a.maxHp; h.tick(); }
  h.state.boxesDelivered = h.state.boxesRequired;   // the last delivery lands 1s before the cap
  h.tick();
  assert.equal(h.state.phase, MatchPhase.WaveTransition);
  while (h.state.phase !== MatchPhase.Ended) h.tick();
  assert.equal(h.state.outcome, Outcome.Timeout);
  assert.equal(h.world.now, MATCH.DURATION_MS, 'ends on the cap');
  assert.equal(h.events('wave_start').length, 1, 'wave 2 never opened');
});
