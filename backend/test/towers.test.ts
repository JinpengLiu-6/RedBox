import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Harness } from '../src/sim/harness.js';
import { createTowersSystem } from '../src/systems/towers.js';

test('Towers are spawned on wave start and increase boss damage mult when destroyed', () => {
  const sys = createTowersSystem();
  const h = new Harness([sys]);
  h.start();
  
  assert.equal(h.state.crystals.size, 3, '3 towers spawned');
  assert.equal(h.state.bossDamageMult, 1.0, 'Initial mult 1.0');
  
  const towers = Array.from(h.state.crystals.values());
  
  // Destroy 1st tower
  towers[0]!.hp = 0;
  h.tick();
  assert.equal(h.state.bossDamageMult, 1.25);
  
  // Tick again, should not count twice
  h.tick();
  assert.equal(h.state.bossDamageMult, 1.25);
  
  // Destroy 2nd tower
  towers[1]!.hp = 0;
  h.tick();
  assert.equal(h.state.bossDamageMult, 1.5);
  
  // Destroy 3rd tower
  towers[2]!.hp = 0;
  h.tick();
  assert.equal(h.state.bossDamageMult, 1.75);
  
  // Simulate wave start by clearing the board and triggering onWaveStart
  h.state.crystals.clear();
  h.state.crystalsDestroyed = 0; // The integrator resets it
  h.state.bossDamageMult = 1.0; // The integrator resets it
  
  // Simulate wave start
  sys.onWaveStart!(h.world);
  
  assert.equal(h.state.crystals.size, 3, '3 fresh towers on new wave');
  assert.equal(h.state.bossDamageMult, 1.0, 'Multiplier reset to 1.0');
});
