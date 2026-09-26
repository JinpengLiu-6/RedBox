import { test } from 'node:test';
import assert from 'node:assert';
import { Harness } from '../src/sim/harness.js';
import { createGoblinsSystem } from '../src/systems/goblins.js';
import { GOBLINS, TICK_RATE, spotsOf } from '@redbox/shared';

test('goblins - scaling, combat, death', () => {
  const sys = createGoblinsSystem();
  const h = new Harness([sys]);
  
  const p1 = spotsOf('T')[0];
  const p2 = spotsOf('c')[0];
  
  const p = h.addPlayer('dwarf', p1);
  h.start();
  
  h.state.creeps.clear();
  h.state.stage = 2;
  sys.onWaveStart!(h.world);
  
  const creeps = Array.from(h.state.creeps.values());
  assert.equal(creeps.length > 0, true, 'guards spawned');
  const goblin = creeps[0];
  assert.equal(goblin.tier, 2, 'spawned with tier 2');
  
  goblin.x = p2.x;
  goblin.y = p2.y;
  
  let windupSeen = false;
  let initialX = goblin.x;
  for (let i = 0; i < 500; i++) { // wait up to 25s
    h.tick();
    if (goblin.behaviour === 'windup') {
      windupSeen = true;
      break;
    }
  }
  assert.equal(windupSeen, true, 'goblin pathfinds and reaches player');
  assert.equal(Math.abs(goblin.x - initialX) > 10, true, 'goblin moved');
  
  // Step out
  p.x = 1000; p.y = 1000;
  const hpBefore = p.hp;
  
  h.seconds(GOBLINS.WINDUP_MS / 1000 + 0.2);
  assert.equal(p.hp, hpBefore, 'stepping out during windup avoids hit');
  
  // Move back to take hit
  p.x = goblin.x; p.y = goblin.y;
  h.seconds(GOBLINS.RECOVER_MS / 1000 + 0.5);
  
  for (let i = 0; i < 100; i++) {
    h.tick();
    if (goblin.behaviour === 'windup') break;
  }
  assert.equal(goblin.behaviour, 'windup', 'starts windup again');
  
  h.seconds(GOBLINS.WINDUP_MS / 1000 + 0.2);
  assert.equal(p.hp < hpBefore, true, 'staying in range takes damage');
  
  // Death
  goblin.hp = 0;
  h.tick();
  assert.equal(h.state.creeps.has(goblin.id), false, 'hp 0 removes goblin');
});
