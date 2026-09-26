/** Crate scanning, carrier slowdown and the final-wave boss requirement. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASSES, CRATES, BoxMark, BoxState, MatchPhase, MATCH, Outcome, effectiveSpeed,
} from '@redbox/shared';
import type { Box } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { createBoxesSystem } from '../src/systems/boxes.js';
import { createMovementSystem } from '../src/systems/movement.js';

function atCrate(classId: 'mage' | 'dwarf', real: boolean) {
  const h = new Harness([createBoxesSystem()]);
  const p = h.addPlayer(classId);
  h.start();
  const box = [...h.state.boxes.values()].find((b) => h.world.isBoxReal(b.id) === real) as Box;
  p.x = box.x; p.y = box.y;
  return { h, p, box };
}

const scanSeconds = (classId: 'mage' | 'dwarf') => CRATES.SCAN_MS / 1000 / (CLASSES[classId].scanSpeed ?? 1);

test('standing still at a closed crate reveals a trap without breaking it', () => {
  const { h, box } = atCrate('mage', false);
  h.seconds(scanSeconds('mage') / 2);
  assert.equal(box.mark, BoxMark.Unknown, 'half a scan reveals nothing');
  assert.ok(box.scan > 40 && box.scan < 60, `progress ${box.scan}`);
  h.seconds(scanSeconds('mage') / 2 + 0.1);
  assert.equal(box.mark, BoxMark.Fake);
  assert.equal(box.state, BoxState.Idle, 'still closed');
  assert.equal(h.state.creeps.size, 0, 'no goblins released');
  assert.equal(h.events('box_scanned')[0]?.label, 'trap');
});

test('a real crate scans as real and the dwarf scans faster', () => {
  const dwarf = atCrate('dwarf', true);
  dwarf.h.seconds(scanSeconds('dwarf') + 0.1);
  assert.equal(dwarf.box.mark, BoxMark.Real);
  const mage = atCrate('mage', true);
  mage.h.seconds(scanSeconds('dwarf') + 0.1);
  assert.equal(mage.box.mark, BoxMark.Unknown, 'the mage needs longer');
});

test('taking damage resets the scan', () => {
  const { h, p, box } = atCrate('mage', false);
  h.seconds(scanSeconds('mage') * 0.8);
  h.world.damage(p.id, 1);
  h.tick(2);
  assert.ok(box.scan < 10, `reset to ${box.scan}`);
  h.seconds(scanSeconds('mage') * 0.5);
  assert.equal(box.mark, BoxMark.Unknown);
});

test('carrying a crate slows the hero down', () => {
  const h = new Harness([createMovementSystem()]);
  const p = h.addPlayer('mage');
  h.start();
  const free = effectiveSpeed(p);
  p.carryingBoxId = 'x';
  assert.equal(effectiveSpeed(p), free * CRATES.CARRY_SPEED_MULT);
  assert.ok(CRATES.CARRY_SPEED_MULT < 1);
});

test('final wave: deliveries alone do not win while the boss stands', () => {
  const h = new Harness([]);
  h.addPlayer('warrior');
  h.start();
  for (let wave = 1; wave < 3; wave++) {
    assert.equal(h.state.bossRequired, false);
    h.state.boxesDelivered = h.state.boxesRequired; h.tick();
    h.seconds(MATCH.WAVE_TRANSITION_MS / 1000 + 0.2);
  }
  assert.equal(h.state.stage, 3);
  assert.equal(h.state.bossRequired, true);
  h.state.boxesDelivered = h.state.boxesRequired;
  h.seconds(2);
  assert.equal(h.state.phase, MatchPhase.Playing, 'the King still stands');
  h.state.boss.alive = false;
  h.tick();
  assert.equal(h.state.outcome, Outcome.Victory);
});
