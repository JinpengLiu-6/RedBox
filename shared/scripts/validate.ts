/**
 * Contract validation. Run with `npm run validate` after any change to shared/.
 * Checks the plan's hard numbers, the map, and that crate identity never leaks.
 */
import { Encoder, Decoder } from '@colyseus/schema';
import { MatchState, Player, Box } from '../src/schema.js';
import { BoxMark, BoxState, MatchPhase } from '../src/enums.js';
import {
  ARENA_H, ARENA_ROWS, ARENA_W, CLASSES, CLASS_IDS, CLASS_INDEX, WAVE_PLAN,
  bossDamageMultiplier, isWallTile, spotsOf, toTile,
} from '../src/index.js';

let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

// ---- the plan's hard numbers ------------------------------------------------
check('wave 1: exactly 3 real + 12 trap = 15 crates', WAVE_PLAN[0].realCrates === 3 && WAVE_PLAN[0].trapCrates === 12);
check('required deliveries are 3 / 2 / 3', WAVE_PLAN.map((w) => w.requiredDeliveries).join() === '3,2,3');
check('enemy scaling 1.00 / 1.20 / 1.30 of wave 1 (not compounded)', WAVE_PLAN.map((w) => w.enemyMult).join() === '1,1.2,1.3');
check('every wave has enough real crates to finish', WAVE_PLAN.every((w) => w.realCrates >= w.requiredDeliveries));
check('tower bonus 1.00 / 1.25 / 1.50 / 1.75', [0, 1, 2, 3].map(bossDamageMultiplier).join() === '1,1.25,1.5,1.75');
check('five heroes', CLASS_IDS.length === 5);
check('each hero: Q/E/R in slot order', CLASS_IDS.every((c) => CLASSES[c].abilities.every((a, i) => a.slot === i)));
check('every hero has a weapon', CLASS_IDS.every((c) => CLASSES[c].attackDamage > 0));

// ---- the map ----------------------------------------------------------------
check('arena rows are rectangular', ARENA_ROWS.every((r) => r.length === ARENA_W), `${ARENA_W}x${ARENA_H}`);
check('arena border is solid wall', ARENA_ROWS[0]!.split('').every((c) => c === '#') && ARENA_ROWS.every((r) => r[0] === '#'));
const maxCrates = Math.max(...WAVE_PLAN.map((w) => w.realCrates + w.trapCrates));
check('enough crate spots for the biggest wave', spotsOf('c').length >= maxCrates, `${spotsOf('c').length} spots, need ${maxCrates}`);
check('3 tower spots, 1 boss spawn, 1 player spawn', spotsOf('T').length === 3 && spotsOf('K').length === 1 && spotsOf('S').length === 1);
{
  const spawn = toTile(spotsOf('S')[0]!.x, spotsOf('S')[0]!.y);
  const seen = new Set([spawn.ty * ARENA_W + spawn.tx]);
  const q = [[spawn.tx, spawn.ty]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x! + dx!, ny = y! + dy!;
      if (isWallTile(nx, ny) || seen.has(ny * ARENA_W + nx)) continue;
      seen.add(ny * ARENA_W + nx); q.push([nx, ny]);
    }
  }
  const specials = (['c', 'T', 'K', 'R', 'g', 'B'] as const).flatMap((k) => spotsOf(k));
  const unreachable = specials.filter((p) => { const t = toTile(p.x, p.y); return !seen.has(t.ty * ARENA_W + t.tx); });
  check('base, crates, towers, boss, revives all reachable', unreachable.length === 0, `${specials.length} special tiles`);
}

// ---- the wire ---------------------------------------------------------------
const state = new MatchState();
state.phase = MatchPhase.Playing;
state.roomCode = 'RBX1';
CLASS_IDS.forEach((classId, i) => {
  const p = Object.assign(new Player(), { id: 'p' + i, name: classId, classIndex: CLASS_INDEX[classId],
    hp: CLASSES[classId].maxHp, maxHp: CLASSES[classId].maxHp, alive: true, lives: 3 });
  p.ranks.push(1, 0, 0); p.cooldownReadyAtMs.push(0, 0, 0);
  state.players.set(p.id, p);
});
const real = Object.assign(new Box(), { id: 'b1', x: 100, y: 100, state: BoxState.Idle });
const trap = Object.assign(new Box(), { id: 'b2', x: 140, y: 100, state: BoxState.Idle });
state.boxes.set(real.id, real); state.boxes.set(trap.id, trap);

const encoder = new Encoder(state);
const decoder = new Decoder(new MatchState());
const mirror = decoder.state as any;
decoder.decode(encoder.encodeAll()); encoder.discardChanges();

check('state round-trips', mirror.players.size === 5 && mirror.roomCode === 'RBX1');
const fields = (b: any) => JSON.stringify(Object.keys(b.toJSON()).sort());
check('real and trap crates are identical on the wire', fields(mirror.boxes.get('b1')) === fields(mirror.boxes.get('b2'))
  && mirror.boxes.get('b1').mark === BoxMark.Unknown && mirror.boxes.get('b2').mark === BoxMark.Unknown);
check('no truth field on crates', !('isReal' in mirror.boxes.get('b1').toJSON()));

for (const [, p] of state.players) p.x += 3;
const tick = encoder.encode(); decoder.decode(tick); encoder.discardChanges();
check('movement tick is small', tick.byteLength < 200, `${tick.byteLength}B`);
check('idle tick sends nothing', !encoder.hasChanges);

console.log(failures === 0 ? '\ncontract OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
