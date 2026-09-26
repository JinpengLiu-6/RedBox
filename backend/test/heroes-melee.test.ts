/** 08b: Axe Troll, Human Brawler, Dual-Blade Warrior skills through the real dispatcher. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, COMBAT, GOBLINS, PLAYER, TILE, TOWERS, tileCentre, type Vec2 } from '@redbox/shared';
import { Crystal, type Player } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createAbilitySystem } from '../src/systems/abilities.js';
import { createMovementSystem } from '../src/systems/movement.js';

const TROLL = CLASSES.troll.abilities;
const BRAWLER = CLASSES.brawler.abilities;
const WARRIOR = CLASSES.warrior.abilities;

/** Open floor: tiles 16..36 x 25..30 have no walls (shared/src/map.ts). */
const OPEN = tileCentre(26, 27);
/** Line-skill lane: tiles 24..36 x 24..30 are open, so 400px of floor east and 100px either side. */
const LANE = tileCentre(24, 27);
/** Row 7: walls on tiles 9..14, so x = 9 * TILE is the first wall pixel east of tiles 1..8. */
const WALL_X = 9 * TILE;

function cast(h: Harness, p: Player, slot: 0 | 1 | 2, aim?: Vec2) {
  h.command(p.id, 'ability', { slot, ...(aim ?? {}) }).tick();
}

/** Opens E and R as if waves 2 and 3 had been reached. */
function unlockAll(p: Player) {
  p.ranks[1] = 1;
  p.ranks[2] = 1;
}

function bodyClear(h: Harness, p: Vec2) {
  const r = PLAYER.RADIUS;
  return [[-r, -r], [r, -r], [-r, r], [r, r]].every(([dx, dy]) => h.world.walkable(p.x + dx!, p.y + dy!));
}

/** `along` px east of `from` and `lateral` px south of it (south is the charge's +side). */
function east(from: Vec2, along: number, lateral = 0): Vec2 {
  return { x: from.x + along, y: from.y + lateral };
}

const posOf = (e: Vec2): Vec2 => ({ x: e.x, y: e.y });

/** A goblin exactly at `pos` that survives any one skill, so the exact damage shows. */
function goblin(h: Harness, pos: Vec2) {
  assert.ok(h.world.walkable(pos.x, pos.y), `setup: (${pos.x}, ${pos.y}) is open floor`);
  const g = h.world.spawnCreep(pos);
  g.maxHp = g.hp = 1000;
  return g;
}

/** A standing tower. The towers system is not in these harnesses, so it is placed by hand (after start()). */
function tower(h: Harness, pos: Vec2) {
  const c = new Crystal();
  c.id = `tower-${h.state.crystals.size}`;
  c.x = pos.x; c.y = pos.y;
  c.maxHp = c.hp = TOWERS.HP;
  h.state.crystals.set(c.id, c);
  return c;
}

/**
 * A friendly hero caught in a skill: not stunned, slowed or shoved. (Its hp is
 * also guarded by World, which drops player-on-player damage, so hp alone
 * proves nothing about the skill.)
 */
function assertUntouched(h: Harness, p: Player, at: Vec2, label: string) {
  assert.equal(h.world.modifier(p.id, 'stunned', 0), 0, `${label}: not stunned`);
  assert.equal(h.world.modifier(p.id, 'speedMult'), 1, `${label}: not slowed`);
  assert.deepEqual(posOf(p), at, `${label}: not moved`);
  assert.equal(p.hp, p.maxHp, `${label}: no damage`);
}

test('troll whirlwind hits every goblin and tower around, nothing beyond the radius, never an ally', () => {
  const h = new Harness([createAbilitySystem()]);
  const troll = h.addPlayer('troll', OPEN);
  const ally = h.addPlayer('mage', { x: OPEN.x + 40, y: OPEN.y + 40 });
  h.start();
  const { damage, radius } = TROLL[0].params;
  const near = [[100, 0], [-100, 0], [0, 100], [0, -100], [radius! - 5, 0]].map(([dx, dy]) =>
    goblin(h, { x: OPEN.x + dx!, y: OPEN.y + dy! }));
  const far = goblin(h, { x: OPEN.x + radius! + 5, y: OPEN.y });
  const tw = tower(h, { x: OPEN.x - 60, y: OPEN.y + 40 });
  const allyAt = posOf(ally);

  cast(h, troll, 0);

  for (const g of near) assert.equal(g.hp, g.maxHp - damage!, `goblin ${g.id} hit`);
  assert.equal(far.hp, far.maxHp, 'goblin just beyond the radius untouched');
  assert.equal(tw.hp, tw.maxHp - damage!, 'towers are hostiles too');
  assertUntouched(h, ally, allyAt, 'ally in the radius');
  assert.ok(troll.cooldownReadyAtMs[0]! > 0, 'cooldown started');
  assert.ok(h.messages('fx').some((m) => m.kind === 'whirlwind'), 'whirlwind fx');
});

test('troll earth splitter stops at the first wall, no cast facing into it; rage lasts its duration', () => {
  const h = new Harness([createAbilitySystem()]);
  const start = tileCentre(7, 7);
  const troll = h.addPlayer('troll', start);
  h.start();
  unlockAll(troll);
  const { damage, slowMult } = TROLL[1].params;
  const front = goblin(h, tileCentre(8, 7));
  const behind = goblin(h, tileCentre(5, 7));
  const pastWall = goblin(h, tileCentre(16, 7));
  assert.ok(h.world.distance(troll, pastWall) < TROLL[1].range!, 'setup: in range but behind the wall');

  cast(h, troll, 1, { x: start.x + 300, y: start.y });

  assert.equal(front.hp, front.maxHp - damage!, 'goblin on the line hit');
  assert.equal(h.world.modifier(front.id, 'speedMult'), slowMult, 'and slowed');
  assert.equal(pastWall.hp, pastWall.maxHp, 'the wall stops the shockwave');
  assert.equal(behind.hp, behind.maxHp, 'nothing behind the troll');
  assert.equal(h.world.modifier(troll.id, 'speedMult'), 1, 'the troll never slows itself');

  // Pressed against the wall (next tile, or body flush) the line cannot get
  // past the troll's own body: no cast, no cooldown, nothing hit.
  for (const x of [tileCentre(8, 7).x, WALL_X - PLAYER.RADIUS]) {
    troll.cooldownReadyAtMs[1] = 0;
    h.place(troll.id, x, start.y);
    cast(h, troll, 1, { x: x + 300, y: start.y });
    assert.equal(troll.cooldownReadyAtMs[1], 0, `facing into the wall from x=${x}: E stays ready`);
  }
  assert.equal(front.hp, front.maxHp - damage!, 'failed casts hit nothing');

  const rage = TROLL[2].params;
  cast(h, troll, 2);
  assert.equal(h.world.modifier(troll.id, 'attackCooldownMult'), rage.attackCooldownMult);
  assert.equal(h.world.damage(troll.id, 100, { sourceId: front.id }), Math.round(100 * rage.damageTakenMult!));
  h.seconds(rage.durationMs! / 1000 - 0.3);
  assert.equal(h.world.modifier(troll.id, 'attackCooldownMult'), rage.attackCooldownMult, 'still raging near the end');
  assert.equal(h.world.modifier(troll.id, 'damageTakenMult'), rage.damageTakenMult, 'still tough near the end');
  h.seconds(0.4);
  assert.equal(h.world.modifier(troll.id, 'attackCooldownMult'), 1, 'rage wears off');
  assert.equal(h.world.damage(troll.id, 100, { sourceId: front.id }), 100, 'full damage taken again');
});

test('troll earth splitter on open floor: range long, width wide, hits towers, never slows allies; slow lasts slowMs', () => {
  const h = new Harness([createAbilitySystem()]);
  const troll = h.addPlayer('troll', LANE);
  const ally = h.addPlayer('brawler', east(LANE, 100));
  h.start();
  unlockAll(troll);
  const range = TROLL[1].range!;
  const { damage, width, slowMult, slowMs } = TROLL[1].params;
  const half = width! / 2;
  const hit = [east(LANE, 200, half - 5), east(LANE, 200, -(half - 5)), east(LANE, range - 10)].map((p) => goblin(h, p));
  // Inside `width` but outside `width / 2`; and just past the far end of the line.
  const missed = [east(LANE, 200, half + 15), east(LANE, range + 10)].map((p) => goblin(h, p));
  const tw = tower(h, east(LANE, 250, -20));
  const allyAt = posOf(ally);

  cast(h, troll, 1, east(LANE, 500));

  assert.equal(h.messages('fx').find((m) => m.kind === 'earth_splitter')?.value, range, 'open floor: the line runs exactly range');
  for (const g of hit) {
    assert.equal(g.hp, g.maxHp - damage!, `goblin at (${g.x - LANE.x}, ${g.y - LANE.y}) hit`);
    assert.equal(h.world.modifier(g.id, 'speedMult'), slowMult, 'and slowed');
  }
  for (const g of missed) {
    assert.equal(g.hp, g.maxHp, `goblin at (${g.x - LANE.x}, ${g.y - LANE.y}) untouched`);
    assert.equal(h.world.modifier(g.id, 'speedMult'), 1, 'and not slowed');
  }
  assert.equal(tw.hp, tw.maxHp - damage!, 'towers on the line are hit');
  assert.equal(h.world.modifier(tw.id, 'speedMult'), 1, 'towers are not slowed');
  assertUntouched(h, ally, allyAt, 'ally on the line');
  assert.equal(h.world.modifier(troll.id, 'speedMult'), 1, 'the troll never slows itself');

  h.seconds(slowMs! / 1000 - 0.2);
  assert.equal(h.world.modifier(hit[0]!.id, 'speedMult'), slowMult, 'still slowed near the end');
  h.seconds(0.3);
  assert.equal(h.world.modifier(hit[0]!.id, 'speedMult'), 1, 'the slow lasts slowMs');
});

test('brawler shoulder charge stops at a wall, hits and knocks goblins aside; unstoppable lasts its duration', () => {
  const h = new Harness([createAbilitySystem()]);
  const start = tileCentre(2, 7);
  const brawler = h.addPlayer('brawler', start);
  h.start();
  unlockAll(brawler);
  const { damage } = BRAWLER[0].params;
  assert.ok(start.x + BRAWLER[0].range! > WALL_X, 'setup: the wall is inside charge range');
  const gob = goblin(h, tileCentre(5, 7));
  const gobAt = posOf(gob);

  cast(h, brawler, 0, { x: start.x + 500, y: start.y });

  assert.ok(brawler.x <= WALL_X - PLAYER.RADIUS, `stopped at the wall, x=${brawler.x}`);
  assert.ok(brawler.x > WALL_X - PLAYER.RADIUS - 8, `charged up to the wall, x=${brawler.x}`);
  assert.equal(brawler.y, start.y, 'straight line');
  assert.ok(bodyClear(h, brawler), 'body never ends inside a wall');
  assert.equal(gob.hp, gob.maxHp - damage!, 'goblin in the path hit');
  assert.ok(h.world.distance(gob, gobAt) > GOBLINS.RADIUS, 'goblin knocked aside');
  assert.ok(brawler.cooldownReadyAtMs[0]! > 0, 'cooldown started');

  // Flush against the wall there is no room to charge: no cast, no cooldown.
  brawler.cooldownReadyAtMs[0] = 0;
  const pinned = brawler.x;
  cast(h, brawler, 0, { x: brawler.x + 500, y: brawler.y });
  assert.equal(brawler.x, pinned);
  assert.equal(brawler.cooldownReadyAtMs[0], 0, 'failed charge keeps Q ready');

  // Unstoppable (knockback immunity) must not cancel the brawler's own charge.
  const { durationMs, damageDealtMult } = BRAWLER[2].params;
  cast(h, brawler, 2);
  assert.equal(h.world.modifier(brawler.id, 'knockbackImmune', 0), 1);
  cast(h, brawler, 0, { x: brawler.x - 500, y: brawler.y });
  assert.ok(pinned - brawler.x > BRAWLER[0].range! / 2, 'charges while Unstoppable');
  const punch = 10;
  assert.equal(h.world.damage(gob.id, punch, { sourceId: brawler.id }), Math.round(punch * damageDealtMult!), 'punches harder');
  h.seconds(durationMs! / 1000 - 0.3);
  assert.equal(h.world.modifier(brawler.id, 'knockbackImmune', 0), 1, 'still unstoppable near the end');
  h.seconds(0.4);
  assert.equal(h.world.modifier(brawler.id, 'knockbackImmune', 0), 0, 'unstoppable wears off');
  assert.equal(h.world.damage(gob.id, punch, { sourceId: brawler.id }), punch, 'normal punches again');
});

test('brawler shoulder charge on open floor: stops at range, knocks goblins knockbackPx to their own side, spares allies', () => {
  const h = new Harness([createAbilitySystem()]);
  const brawler = h.addPlayer('brawler', LANE);
  const ally = h.addPlayer('troll', east(LANE, 70));
  h.start();
  const range = BRAWLER[0].range!;
  const { damage, knockbackPx } = BRAWLER[0].params;
  const south = goblin(h, east(LANE, 40, 10));
  const north = goblin(h, east(LANE, 100, -10));
  const off = goblin(h, east(LANE, 150, 40));
  const beyond = goblin(h, east(LANE, range + 40));
  const tw = tower(h, east(LANE, 200, 15));
  const [southAt, northAt, offAt, allyAt] = [south, north, off, ally].map(posOf);

  cast(h, brawler, 0, east(LANE, 500));

  assert.equal(brawler.x - LANE.x, range, 'open floor: charges exactly range');
  assert.equal(brawler.y, LANE.y, 'straight line');
  for (const [g, at, sign] of [[south, southAt!, 1], [north, northAt!, -1]] as const) {
    assert.equal(g.hp, g.maxHp - damage!, `${g.id} hit`);
    const moved = h.world.distance(g, at);
    assert.ok(Math.abs(moved - knockbackPx!) <= 4, `${g.id} knocked knockbackPx, moved ${moved}`);
    assert.ok(g.x > at.x, `${g.id} knocked forward`);
    assert.ok((g.y - LANE.y) * sign > Math.abs(at.y - LANE.y), `${g.id} knocked out to its own side, y=${g.y}`);
  }
  assert.equal(off.hp, off.maxHp, 'beside the path: untouched');
  assert.deepEqual(posOf(off), offAt, 'and not moved');
  assert.equal(beyond.hp, beyond.maxHp, 'past the range: untouched');
  assert.equal(tw.hp, tw.maxHp - damage!, 'towers in the path are hit');
  assertUntouched(h, ally, allyAt!, 'ally in the path');
});

test('brawler ground slam stuns goblins, the boss is only slowed; towers hit, allies never stunned', () => {
  const h = new Harness([createAbilitySystem()]);
  const boss = h.state.boss;
  const at = { x: boss.x - 96, y: boss.y };
  const brawler = h.addPlayer('brawler', at);
  const ally = h.addPlayer('warrior', { x: at.x, y: at.y + 64 });
  h.start();
  unlockAll(brawler);
  const { damage, radius, stunMs } = BRAWLER[1].params;
  const g1 = goblin(h, { x: at.x, y: at.y - 64 });
  const g2 = goblin(h, { x: at.x - 64, y: at.y });
  const edge = goblin(h, { x: at.x - radius! + 10, y: at.y });
  const far = goblin(h, { x: at.x - radius! - 10, y: at.y });
  const tw = tower(h, { x: at.x - 100, y: at.y + 20 });
  const allyAt = posOf(ally);
  const bossHp = boss.hp;

  cast(h, brawler, 1);

  for (const g of [g1, g2, edge]) {
    assert.equal(h.world.modifier(g.id, 'stunned', 0), 1, `${g.id} stunned`);
    assert.equal(g.hp, g.maxHp - damage!, `${g.id} damaged`);
  }
  assert.equal(h.world.modifier(far.id, 'stunned', 0), 0, 'just out of radius: not stunned');
  assert.equal(far.hp, far.maxHp, 'just out of radius: not damaged');
  assert.equal(h.world.modifier('boss', 'stunned', 0), 0, 'the boss is never stunned');
  assert.equal(h.world.modifier('boss', 'speedMult'), COMBAT.BOSS_CC_SLOW_MULT, 'the boss is slowed');
  assert.equal(boss.hp, bossHp - Math.round(damage! * h.state.bossDamageMult), 'the boss is damaged');
  assert.equal(tw.hp, tw.maxHp - damage!, 'towers are damaged');
  assert.equal(h.world.modifier(tw.id, 'stunned', 0), 0, 'towers are not stunned');
  assertUntouched(h, ally, allyAt, 'ally in the radius');
  assert.equal(h.world.modifier(brawler.id, 'stunned', 0), 0, 'the brawler never stuns itself');

  h.seconds(stunMs! / 1000 - 0.2);
  assert.equal(h.world.modifier(g1.id, 'stunned', 0), 1, 'still stunned near the end');
  h.seconds(0.3);
  assert.equal(h.world.modifier(g1.id, 'stunned', 0), 0, 'stun wears off after stunMs');
});

test('warrior parry blocks a goblin hit and counters it', () => {
  const h = new Harness([createAbilitySystem()]);
  const warrior = h.addPlayer('warrior', OPEN);
  h.start();
  unlockAll(warrior);
  const { counterDamage, windowMs } = WARRIOR[1].params;
  const gob = h.world.spawnCreep({ x: OPEN.x + 30, y: OPEN.y });
  gob.maxHp = gob.hp = counterDamage! * 2;   // survives the counter, so the exact damage shows

  cast(h, warrior, 1);
  assert.equal(h.world.damage(warrior.id, GOBLINS.DAMAGE, { sourceId: gob.id }), 0, 'blocked');
  assert.equal(warrior.hp, warrior.maxHp);
  assert.equal(gob.hp, gob.maxHp - counterDamage!, 'attacker countered');
  assert.ok(h.messages('fx').some((m) => m.kind === 'parry' && m.value === windowMs), 'parry cast fx');

  h.seconds(windowMs! / 1000 + 0.1);
  const next = h.world.spawnCreep({ x: OPEN.x - 30, y: OPEN.y });
  assert.equal(h.world.damage(warrior.id, GOBLINS.DAMAGE, { sourceId: next.id }), GOBLINS.DAMAGE, 'window closed');
});

test('warrior blade dance ticks repeatedly over its duration, then stops; rooms never share a dance', () => {
  const h = new Harness([createAbilitySystem()]);
  const boss = h.state.boss;
  const warrior = h.addPlayer('warrior', { x: boss.x - 80, y: boss.y });
  h.start();
  unlockAll(warrior);
  // A second room with the same player id (bot ids repeat across rooms). It
  // started a second earlier, so its clock runs ahead, as real rooms' clocks do.
  const other = new Harness([createAbilitySystem()]);
  const otherWarrior = other.addPlayer('warrior', { x: other.state.boss.x - 80, y: other.state.boss.y });
  other.start().seconds(1);
  unlockAll(otherWarrior);

  const { durationMs, tickMs, damagePerTick } = WARRIOR[2].params;
  const hits = Math.ceil(durationMs! / tickMs!);
  const perHit = Math.round(damagePerTick! * h.state.bossDamageMult);
  const bossHp = boss.hp;

  cast(h, warrior, 2);
  other.tick();
  assert.equal(boss.hp, bossHp - perHit, 'first hit on cast');
  h.seconds(tickMs! / 1000); other.seconds(tickMs! / 1000);
  assert.equal(boss.hp, bossHp - 2 * perHit, 'second hit tickMs later');

  h.seconds(durationMs! / 1000); other.seconds(durationMs! / 1000);
  assert.ok(hits > 2, 'setup: several ticks per dance');
  assert.equal(boss.hp, bossHp - hits * perHit, `exactly ${hits} hits over the duration`);
  h.seconds(1);
  assert.equal(boss.hp, bossHp - hits * perHit, 'stops after the duration');
  assert.equal(other.state.boss.hp, other.state.boss.maxHp, 'the other room never danced');
});

test('warrior blade dance ends when the warrior picks up a crate or is downed, with no catch-up burst', () => {
  const h = new Harness([createAbilitySystem()]);
  const boss = h.state.boss;
  const warrior = h.addPlayer('warrior', { x: boss.x - 80, y: boss.y });
  h.start();
  unlockAll(warrior);
  const { tickMs, damagePerTick } = WARRIOR[2].params;
  const perHit = Math.round(damagePerTick! * h.state.bossDamageMult);

  // Carrying disables attacks AND skills: picking up a crate ends a running dance.
  const hp0 = boss.hp;
  cast(h, warrior, 2);
  h.seconds(tickMs! / 1000);
  assert.equal(boss.hp, hp0 - 2 * perHit, 'setup: dancing');
  warrior.carryingBoxId = 'crate-1';
  h.seconds(1);
  assert.equal(boss.hp, hp0 - 2 * perHit, 'carrying a crate: no more hits');
  warrior.carryingBoxId = '';
  h.seconds(1);
  assert.equal(boss.hp, hp0 - 2 * perHit, 'dropping the crate does not resume the dance');

  // Downed mid-dance: the dance ends, and getting up does not replay the missed hits.
  warrior.cooldownReadyAtMs[2] = 0;
  const hp1 = boss.hp;
  cast(h, warrior, 2);
  assert.equal(boss.hp, hp1 - perHit, 'setup: dancing again');
  warrior.alive = false;
  h.seconds(1);
  warrior.alive = true;
  h.seconds(3);
  assert.equal(boss.hp, hp1 - perHit, 'downed: the dance ended, no catch-up burst');
});

test('warrior blade dance follows the moving warrior; slashing dash cuts each hostile once and stops at walls', () => {
  const h = new Harness([createMovementSystem(), createAbilitySystem()]);
  const warrior = h.addPlayer('warrior', OPEN);
  h.start();
  unlockAll(warrior);
  const { radius } = WARRIOR[2].params;
  const ahead = h.world.spawnCreep({ x: OPEN.x + radius! + 100, y: OPEN.y });
  const left = h.world.spawnCreep({ x: OPEN.x - radius! - 100, y: OPEN.y });

  cast(h, warrior, 2);
  assert.equal(ahead.hp, ahead.maxHp, 'setup: out of reach at the start');
  h.walk(warrior.id, 1, 0, WARRIOR[2].params.durationMs! / 1000);
  assert.ok(ahead.hp < ahead.maxHp, 'the dance moved with the warrior');
  assert.equal(left.hp, left.maxHp, 'left behind: untouched');

  const d = new Harness([createAbilitySystem()]);
  const start = tileCentre(2, 7);
  const w2 = d.addPlayer('warrior', start);
  d.start();
  const { damage } = WARRIOR[0].params;
  const inPath = d.world.spawnCreep(tileCentre(4, 7));
  const beside = d.world.spawnCreep({ x: tileCentre(6, 7).x, y: start.y + WARRIOR[0].params.width! / 2 - 4 });
  const wide = d.world.spawnCreep(tileCentre(5, 5));

  cast(d, w2, 0, { x: start.x + 500, y: start.y });
  assert.ok(w2.x <= WALL_X - PLAYER.RADIUS && w2.x > start.x + TILE * 4, `dashed up to the wall, x=${w2.x}`);
  assert.ok(bodyClear(d, w2), 'body never ends inside a wall');
  assert.equal(inPath.hp, inPath.maxHp - damage!, 'hit once');
  assert.equal(beside.hp, beside.maxHp - damage!, 'inside width/2 of the path: hit once');
  assert.equal(wide.hp, wide.maxHp, 'outside the path: untouched');

  // Flush against the wall there is no room to dash: no cast, no cooldown.
  w2.cooldownReadyAtMs[0] = 0;
  const pinned = w2.x;
  cast(d, w2, 0, { x: w2.x + 500, y: w2.y });
  assert.equal(w2.x, pinned);
  assert.equal(w2.cooldownReadyAtMs[0], 0, 'failed dash keeps Q ready');
});

test('warrior slashing dash on open floor: stops at range, cuts everything within width/2 of the path, towers too', () => {
  const h = new Harness([createAbilitySystem()]);
  const warrior = h.addPlayer('warrior', LANE);
  const ally = h.addPlayer('mage', east(LANE, 60, 10));
  h.start();
  const range = WARRIOR[0].range!;
  const { damage, width } = WARRIOR[0].params;
  const half = width! / 2;
  const hit = [
    east(LANE, 110, half - 4),          // beside the path
    east(LANE, 110, -(half - 4)),       // the other side
    east(LANE, -4, 20),                 // crowding the warrior's flank as the dash starts
    east(LANE, range + half - 6),       // just past the end, still within width/2 of it
  ].map((p) => goblin(h, p));
  const missed = [
    east(LANE, 110, half + 10),         // inside `width`, outside `width / 2`
    east(LANE, -(half + 10)),           // behind the start
    east(LANE, range + half + 6),       // past the end
  ].map((p) => goblin(h, p));
  const tw = tower(h, east(LANE, 150, -10));
  const allyAt = posOf(ally);

  cast(h, warrior, 0, east(LANE, 500));

  assert.equal(warrior.x - LANE.x, range, 'open floor: dashes exactly range');
  assert.equal(warrior.y, LANE.y, 'straight line');
  for (const g of hit) assert.equal(g.hp, g.maxHp - damage!, `goblin at (${g.x - LANE.x}, ${g.y - LANE.y}) cut once`);
  for (const g of missed) assert.equal(g.hp, g.maxHp, `goblin at (${g.x - LANE.x}, ${g.y - LANE.y}) untouched`);
  assert.equal(tw.hp, tw.maxHp - damage!, 'towers on the path are cut');
  assertUntouched(h, ally, allyAt, 'ally on the path');
});
