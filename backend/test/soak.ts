/** Not a test: `npx tsx backend/test/soak.ts [runs]` plays full bot matches and reports anomalies. */
import { MatchPhase, Outcome, TICK_RATE, CLASS_IDS, MAP } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';

const RUNS = Number(process.argv[2] ?? 50);
const tally = new Map<string, number>();
const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);
const problems = new Map<string, number>();
const problem = (k: string) => problems.set(k, (problems.get(k) ?? 0) + 1);

let worstTickMs = 0;
let totalTickMs = 0;
let totalTicks = 0;

for (let run = 0; run < RUNS; run++) {
  const h = Harness.full();
  for (const c of CLASS_IDS) h.addPlayer(c, { id: 'bot_' + c, bot: true });
  h.start();
  const w = h.world;
  const s = h.state;

  for (let t = 0; t < TICK_RATE * 460; t++) {
    const t0 = performance.now();
    h.tick();
    const took = performance.now() - t0;
    worstTickMs = Math.max(worstTickMs, took);
    totalTickMs += took;
    totalTicks++;

    for (const [, p] of s.players) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) problem('player NaN position');
      if (p.alive && !w.walkable(p.x, p.y)) problem('player inside a wall');
      if (p.hp > p.maxHp || p.hp < 0) problem('player hp out of range');
      if (p.lives < 0) problem('negative lives');
      if (p.carryingBoxId && !s.boxes.has(p.carryingBoxId)) problem('carrying a missing crate');
    }
    for (const [, c] of s.creeps) if (!w.walkable(c.x, c.y)) problem('goblin inside a wall');
    if (s.boss.alive && !w.walkable(s.boss.x, s.boss.y)) problem('boss inside a wall');
    if (s.boss.hp > s.boss.maxHp || s.boss.hp < 0) problem('boss hp out of range');
    if (s.crystals.size > 3) problem('towers accumulate across waves');
    if (s.boxesDelivered > s.boxesRequired) problem('over-delivered');
    if (s.phase === MatchPhase.Ended) break;
  }

  if (s.phase !== MatchPhase.Ended) { problem('match never ended in 460s'); bump('hung'); continue; }
  bump(s.outcome === Outcome.Victory ? 'victory' : s.outcome === Outcome.Defeat ? 'defeat' : 'timeout');
  if (s.outcome === Outcome.Timeout) {
    const idle = [...s.boxes.values()].filter((b) => b.state === 0).length;
    problem(idle > 0 ? `timeout with ${idle > 3 ? 'many' : 'few'} crates left` : 'timeout with no crates left');
  }
  if (w.distance(s.boss, MAP.BOSS_ZONE) > 2000) problem('boss wandered off the map');
}

console.log('runs', RUNS, Object.fromEntries(tally));
console.log('problems', Object.fromEntries(problems));
console.log(`tick avg ${(totalTickMs / totalTicks).toFixed(3)}ms worst ${worstTickMs.toFixed(1)}ms over ${totalTicks} ticks`);
