/** OWNER: brief 08a — Elf Mage + Dwarf Demolitionist skills, headless. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, GOBLINS, TILE, tileCentre } from '@redbox/shared';
import type { AbilityContext } from '@redbox/shared';
import { CLASS_MODULES } from '../src/classes/index.js';
import { Harness } from '../src/sim/harness.js';
import { createAbilitySystem } from '../src/systems/abilities.js';

/** Row 30 is open floor from x=1..62. */
const OPEN = tileCentre(20, 30);

/** Calls a locked-slot handler directly (E/R unlock in later waves; the dispatcher is integrator-owned). */
function cast(h: Harness, playerId: string, slot: 0 | 1 | 2, aim: { x: number; y: number }) {
  const p = h.state.players.get(playerId)!;
  const spec = CLASSES[CLASS_MODULES[p.classIndex === 0 ? 'mage' : 'dwarf'].classId].abilities[slot];
  const ctx: AbilityContext = { world: h.world, caster: p, params: spec.params, range: spec.range ?? 200, aim };
  return CLASS_MODULES[p.classIndex === 0 ? 'mage' : 'dwarf'].abilities[slot](ctx);
}

test('frost wave damages + slows the goblin in the cone and misses the one behind', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('mage', OPEN);
  h.start();
  const front = h.world.spawnCreep({ x: OPEN.x + 150, y: OPEN.y });
  const behind = h.world.spawnCreep({ x: OPEN.x - 150, y: OPEN.y });
  const { damage, slowMult } = CLASSES.mage.abilities[0].params;
  h.command(p.id, 'ability', { slot: 0, x: OPEN.x + 200, y: OPEN.y }).tick();
  assert.equal(front.hp, front.maxHp - damage!, 'goblin in the cone took damage');
  assert.equal(h.world.modifier(front.id, 'speedMult'), slowMult, 'goblin in the cone is slowed');
  assert.equal(behind.hp, behind.maxHp, 'goblin behind the mage untouched');
  assert.equal(h.world.modifier(behind.id, 'speedMult', 1), 1);
  assert.equal(p.hp, p.maxHp, 'no self damage');
  assert.ok(p.cooldownReadyAtMs[0]! > 0, 'cooldown started');
  assert.equal(h.messages('fx').some((f) => f.kind === 'frost_wave'), true);
});

test('blink never lands in a wall', () => {
  const h = new Harness([]);
  // Row 7 has a wall from x=9..14; stand left of it and aim into / across it.
  const start = tileCentre(7, 7);
  const p = h.addPlayer('mage', start);
  h.start();
  for (const aim of [tileCentre(11, 7), tileCentre(16, 7), { x: start.x + 5000, y: start.y }, { x: -100, y: -100 }]) {
    const before = { x: p.x, y: p.y };
    const ok = cast(h, p.id, 1, aim);
    assert.ok(h.world.walkable(p.x, p.y), `landing walkable after aiming at ${aim.x},${aim.y}`);
    if (ok) {
      assert.ok(h.world.lineOfSight(before, p), 'landing point visible from the start');
      assert.ok(h.world.distance(before, p) <= CLASSES.mage.abilities[1].range! + 1, 'capped at range');
    } else {
      assert.deepEqual({ x: p.x, y: p.y }, before, 'refused blink does not move');
    }
    p.x = start.x; p.y = start.y;
  }
  // Clear ground: the blink lands.
  const p2 = h.addPlayer('mage', { id: 'm2', ...OPEN });
  const moved = cast(h, p2.id, 1, { x: OPEN.x + 100, y: OPEN.y });
  assert.equal(moved, true);
  assert.ok(Math.abs(p2.x - (OPEN.x + 100)) < TILE, 'landed near the aim');
});

test('meteor deals damage only after its delay', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('mage', OPEN);
  h.start();
  const target = { x: OPEN.x + 200, y: OPEN.y };
  const gob = h.world.spawnCreep(target);
  const { damage, delayMs } = CLASSES.mage.abilities[2].params;
  assert.equal(cast(h, p.id, 2, target), true);
  assert.equal(h.state.hazards.size, 1, 'telegraph hazard spawned');
  h.tick(Math.floor(delayMs! / 50) - 2);
  assert.equal(gob.hp, gob.maxHp, 'no damage before the delay');
  assert.equal(h.state.hazards.size, 1);
  h.seconds(0.3);
  assert.equal(gob.hp, Math.max(0, gob.maxHp - damage!), 'damage after the delay');
  assert.equal(h.state.hazards.size, 0, 'hazard removed');
  assert.equal(h.messages('fx').some((f) => f.kind === 'meteor'), true);
});

test('mine waits, then explodes when a goblin walks in', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('dwarf', OPEN);
  h.start();
  const minePos = { x: OPEN.x + 100, y: OPEN.y };
  assert.equal(cast(h, p.id, 1, minePos), true);
  const mine = [...h.state.hazards.values()][0]!;
  assert.equal(mine.detonateAtMs, 0, 'armed');
  const { damage, triggerRadius } = CLASSES.dwarf.abilities[1].params;
  const gob = h.world.spawnCreep({ x: minePos.x + triggerRadius! + 60, y: minePos.y });
  h.seconds(2);
  assert.equal(h.state.hazards.size, 1, 'mine still waiting');
  assert.equal(gob.hp, gob.maxHp);
  gob.x = minePos.x + triggerRadius! - 5;   // goblin steps in
  h.tick();
  assert.equal(h.state.hazards.size, 0, 'mine gone');
  assert.equal(gob.hp, Math.max(0, gob.maxHp - damage!), 'goblin blasted');
  assert.equal(p.hp, p.maxHp, 'no friendly fire');
  assert.equal(h.messages('fx').some((f) => f.kind === 'explosion'), true);
});

test('grenade explodes after its fuse; goblins spawn at full wave-1 hp', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('dwarf', OPEN);
  h.start();
  const target = { x: OPEN.x + 150, y: OPEN.y };
  const gob = h.world.spawnCreep(target);
  assert.equal(gob.maxHp, GOBLINS.HP);
  const { damage, delayMs } = CLASSES.dwarf.abilities[0].params;
  h.command(p.id, 'ability', { slot: 0, ...target }).tick();
  assert.equal(gob.hp, gob.maxHp, 'not yet');
  h.tick(Math.ceil(delayMs! / 50) + 1);
  assert.equal(gob.hp, gob.maxHp - damage!);
  assert.equal(h.state.hazards.size, 0);
});

test('a grenade thrown just before the dwarf goes down still detonates', () => {
  const h = new Harness([createAbilitySystem()]);
  const p = h.addPlayer('dwarf', OPEN);
  h.start();
  const target = { x: OPEN.x + 150, y: OPEN.y };
  const gob = h.world.spawnCreep(target);
  const { damage, delayMs } = CLASSES.dwarf.abilities[0].params;
  h.command(p.id, 'ability', { slot: 0, ...target }).tick();
  p.alive = false;   // lives.ts downs the thrower mid-fuse
  h.tick(Math.ceil(delayMs! / 50) + 1);
  assert.equal(gob.hp, gob.maxHp - damage!, 'the fuse does not care about its owner');
  assert.equal(h.state.hazards.size, 0, 'hazard cleaned up');
});
