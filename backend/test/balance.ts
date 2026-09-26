/**
 * Not a test: `npx tsx backend/test/balance.ts [runs]` plays bot matches with
 * several party compositions and prints balance statistics (per-wave time,
 * deaths per class, boss kills, towers) plus a peak-load tick profile.
 */
import { CLASS_IDS, GOBLINS, MatchPhase, Outcome, TICK_RATE, type ClassId } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';

const RUNS = Number(process.argv[2] ?? 30);
const MAX_TICKS = 460 * TICK_RATE;

const COMPS: Record<string, ClassId[]> = {
  'mixed x5': [...CLASS_IDS],
  'mixed x4': CLASS_IDS.slice(0, 4),
  'mixed x3': CLASS_IDS.slice(0, 3),
};
for (const c of CLASS_IDS) COMPS[`${c} x5`] = [c, c, c, c, c];

const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const f = (n: number, d = 1) => n.toFixed(d);

function play(comp: ClassId[]) {
  const h = Harness.full();
  comp.forEach((c, i) => h.addPlayer(c, { id: `bot${i}_${c}`, bot: true }));
  h.start();
  const s = h.state;
  let ticks = 0;
  while (s.phase !== MatchPhase.Ended && ticks < MAX_TICKS) { h.tick(); ticks++; }
  const ev = h.events();
  const waveStart = new Map<number, number>();
  const waveMs: number[] = [];
  for (const e of ev) {
    if (e.type === 'wave_start') waveStart.set(e.value ?? 0, e.atMs);
    if (e.type === 'wave_cleared') waveMs.push(e.atMs - (waveStart.get(e.value ?? 0) ?? 0));
  }
  const deathsBy = new Map<ClassId, number>();
  for (const e of ev) if (e.type === 'player_died' && e.classId) deathsBy.set(e.classId, (deathsBy.get(e.classId) ?? 0) + 1);
  return {
    outcome: s.outcome,
    durationMs: s.elapsedMs,
    stage: s.stage,
    waveMs,
    deaths: ev.filter((e) => e.type === 'player_died').length,
    deathsBy,
    revives: ev.filter((e) => e.type === 'player_revived').length,
    bossKills: ev.filter((e) => e.type === 'boss_defeated').length,
    towers: ev.filter((e) => e.type === 'crystal_destroyed').length,
    traps: ev.filter((e) => e.type === 'trap_triggered').length,
    livesLeft: [...s.players.values()].reduce((a, p) => a + p.lives, 0),
  };
}

const classDeaths = new Map<ClassId, number[]>();
for (const [name, comp] of Object.entries(COMPS)) {
  const rs = Array.from({ length: RUNS }, () => play(comp));
  const wins = rs.filter((r) => r.outcome === Outcome.Victory).length;
  const w = (i: number) => rs.map((r) => r.waveMs[i]).filter((x): x is number => x !== undefined);
  console.log(
    `${name.padEnd(12)} win ${String(wins).padStart(2)}/${RUNS}` +
    `  dur p50 ${f(pct(rs.map((r) => r.durationMs), 0.5) / 1000, 0)}s p90 ${f(pct(rs.map((r) => r.durationMs), 0.9) / 1000, 0)}s` +
    `  waves ${[0, 1, 2].map((i) => f(mean(w(i)) / 1000, 0) + 's').join('/')}` +
    `  deaths ${f(mean(rs.map((r) => r.deaths)))}/match  livesLeft ${f(mean(rs.map((r) => r.livesLeft)))}` +
    `  revives ${f(mean(rs.map((r) => r.revives)))}  boss ${f(mean(rs.map((r) => r.bossKills)))}  towers ${f(mean(rs.map((r) => r.towers)))}  traps ${f(mean(rs.map((r) => r.traps)))}`,
  );
  if (name === 'mixed x5') for (const r of rs) for (const c of CLASS_IDS) classDeaths.set(c, [...(classDeaths.get(c) ?? []), r.deathsBy.get(c) ?? 0]);
}
console.log('deaths per class in mixed x5:', [...classDeaths].map(([c, d]) => `${c} ${f(mean(d), 2)}`).join('  '));

// Peak-load tick profile: full party, goblins pinned at MAX_ALIVE, boss awake.
{
  const h = Harness.full();
  for (const c of CLASS_IDS) h.addPlayer(c, { id: 'bot_' + c, bot: true });
  h.start();
  const s = h.state;
  const times: number[] = [];
  let peakCreeps = 0;
  for (let t = 0; t < 60 * TICK_RATE && s.phase !== MatchPhase.Ended; t++) {
    while (s.creeps.size < GOBLINS.MAX_ALIVE) {
      const p = [...s.players.values()][t % 5]!;
      h.world.spawnCreep({ x: p.x + 60, y: p.y });
    }
    peakCreeps = Math.max(peakCreeps, s.creeps.size);
    const t0 = performance.now();
    h.tick();
    times.push(performance.now() - t0);
  }
  console.log(
    `peak load (${peakCreeps} goblins + boss + 5 bots): ticks=${times.length}` +
    ` p50=${f(pct(times, 0.5), 3)}ms p95=${f(pct(times, 0.95), 3)}ms p99=${f(pct(times, 0.99), 3)}ms max=${f(Math.max(...times), 2)}ms`,
  );
}
