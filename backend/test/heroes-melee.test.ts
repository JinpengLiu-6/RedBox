/** 08b: Axe Troll, Human Brawler, Dual-Blade Warrior skills through the real dispatcher. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, COMBAT, GOBLINS, PLAYER, TILE, tileCentre, type Vec2 } from '@redbox/shared';
import type { Player } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createAbilitySystem } from '../src/systems/abilities.js';
import { createMovementSystem } from '../src/systems/movement.js';

const TROLL = CLASSES.troll.abilities;
const BRAWLER = CLASSES.brawler.abilities;
const WARRIOR = CLASSES.warrior.abilities;

/** Open floor: tiles 16..36 x 25..30 have no walls (shared/src/map.ts). */
const OPEN = tileCentre(26, 27);
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

test('troll whirlwind hits every goblin around, nothing beyond the radius, never an ally', () => {
  const h = new Harness([createAbilitySystem()]);
  const troll = h.addPlayer('troll', OPEN);
  const ally = h.addPlayer('mage', { x: OPEN.x + 40, y: OPEN.y + 40 });
  h.start();
  const { damage, radius } = TROLL[0].params;
  const near = [[100, 0], [-100, 0], [0, 100], [0, -100]].map(([dx, dy]) =>
    h.world.spawnCreep({ x: OPEN.x + dx!, y: OPEN.y + dy! }));
  const far = h.world.spawnCreep({ x: OPEN.x + radius! + 70, y: OPEN.y });
  for (const g of near) assert.ok(h.world.distance(troll, g) < radius!, 'setup: goblin inside the radius');

  cast(h, troll, 0);

  for (const g of near) assert.equal(g.hp, g.maxHp - damage!, `goblin ${g.id} hit`);
  assert.equal(far.hp, far.maxHp, 'goblin beyond the radius untouched');
  assert.equal(ally.hp, ally.maxHp, 'no friendly fire');
  assert.ok(troll.cooldownReadyAtMs[0]! > 0, 'cooldown started');
  assert.ok(h.messages('fx').some((m) => m.kind === 'whirlwind'), 'whirlwind fx');
});

test('troll earth splitter stops at the first wall; rage buffs the troll', () => {
  const h = new Harness([createAbilitySystem()]);
  const start = tileCentre(7, 7);
  const troll = h.addPlayer('troll', start);
  h.start();
  unlockAll(troll);
  const { damage, slowMult } = TROLL[1].params;
  const front = h.world.spawnCreep(tileCentre(8, 7));
  front.maxHp = front.hp = damage! * 2;   // survives the hit, so the exact damage shows
  const behind = h.world.spawnCreep(tileCentre(5, 7));
  const pastWall = h.world.spawnCreep(tileCentre(16, 7));
  assert.ok(h.world.distance(troll, pastWall) < TROLL[1].range!, 'setup: in range but behind the wall');

  cast(h, troll, 1, { x: start.x + 300, y: start.y });

  assert.equal(front.hp, front.maxHp - damage!, 'goblin on the line hit');
  assert.equal(h.world.modifier(front.id, 'speedMult'), slowMult, 'and slowed');
  assert.equal(pastWall.hp, pastWall.maxHp, 'the wall stops the shockwave');
  assert.equal(behind.hp, behind.maxHp, 'nothing behind the troll');

  const rage = TROLL[2].params;
  cast(h, troll, 2);
  assert.equal(h.world.modifier(troll.id, 'attackCooldownMult'), rage.attackCooldownMult);
  assert.equal(h.world.damage(troll.id, 100, { sourceId: front.id }), Math.round(100 * rage.damageTakenMult!));
  h.seconds(rage.durationMs! / 1000 + 0.1);
  assert.equal(h.world.modifier(troll.id, 'attackCooldownMult'), 1, 'rage wears off');
});

test('brawler shoulder charge stops at a wall, hits and knocks goblins aside', () => {
  const h = new Harness([createAbilitySystem()]);
  const start = tileCentre(2, 7);
  const brawler = h.addPlayer('brawler', start);
  h.start();
  unlockAll(brawler);
  const { damage } = BRAWLER[0].params;
  assert.ok(start.x + BRAWLER[0].range! > WALL_X, 'setup: the wall is inside charge range');
  const gob = h.world.spawnCreep(tileCentre(5, 7));
  const gobAt = { x: gob.x, y: gob.y };

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
  cast(h, brawler, 2);
  assert.equal(h.world.modifier(brawler.id, 'knockbackImmune', 0), 1);
  cast(h, brawler, 0, { x: brawler.x - 500, y: brawler.y });
  assert.ok(pinned - brawler.x > BRAWLER[0].range! / 2, 'charges while Unstoppable');
});

test('brawler ground slam stuns goblins, but the boss is only slowed', () => {
  const h = new Harness([createAbilitySystem()]);
  const boss = h.state.boss;
  const at = { x: boss.x - 96, y: boss.y };
  const brawler = h.addPlayer('brawler', at);
  h.start();
  unlockAll(brawler);
  const { damage, radius, stunMs } = BRAWLER[1].params;
  const g1 = h.world.spawnCreep({ x: at.x, y: at.y - 64 });
  const g2 = h.world.spawnCreep({ x: at.x - 64, y: at.y });
  const far = h.world.spawnCreep({ x: at.x - radius! - 80, y: at.y });
  const bossHp = boss.hp;

  cast(h, brawler, 1);

  for (const g of [g1, g2]) {
    assert.equal(h.world.modifier(g.id, 'stunned', 0), 1, 'goblin stunned');
    assert.equal(g.hp, g.maxHp - damage!, 'goblin damaged');
  }
  assert.equal(h.world.modifier(far.id, 'stunned', 0), 0, 'out of radius: not stunned');
  assert.equal(h.world.modifier('boss', 'stunned', 0), 0, 'the boss is never stunned');
  assert.equal(h.world.modifier('boss', 'speedMult'), COMBAT.BOSS_CC_SLOW_MULT, 'the boss is slowed');
  assert.equal(boss.hp, bossHp - Math.round(damage! * h.state.bossDamageMult), 'the boss is damaged');

  h.seconds(stunMs! / 1000 + 0.1);
  assert.equal(h.world.modifier(g1.id, 'stunned', 0), 0, 'stun wears off');
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
  assert.equal(inPath.hp, inPath.maxHp - damage!, 'hit once');
  assert.equal(beside.hp, beside.maxHp - damage!, 'inside width/2 of the path: hit once');
  assert.equal(wide.hp, wide.maxHp, 'outside the path: untouched');
});
