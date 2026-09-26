/**
 * Contract validation. Run with `npm run validate` after any change to shared/.
 * Proves the schema round-trips on the wire and that box identity never leaks.
 */
import { Encoder, Decoder } from '@colyseus/schema';
import { MatchState, Player, Box, BoxMark, BoxState, MatchPhase } from '../src/schema.js';
import { CLASSES, CLASS_INDEX, CLASS_IDS, MATCH, CRYSTALS, PROGRESSION } from '../src/index.js';

let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const state = new MatchState();
state.phase = MatchPhase.Playing;
state.roomCode = 'RBX1';
state.timeRemainingMs = MATCH.DURATION_MS;
state.stage = 1;
state.crystalsRequired = CRYSTALS.PER_STAGE[0]!;

CLASS_IDS.forEach((classId, i) => {
  const spec = CLASSES[classId];
  const p = new Player();
  p.id = 'p' + i; p.name = classId; p.classIndex = CLASS_INDEX[classId];
  p.x = 240 + i * 40; p.y = 1680;
  p.hp = spec.maxHp; p.maxHp = spec.maxHp;
  p.lives = 3; p.alive = true;
  p.skillPoints = PROGRESSION.STARTING_SKILL_POINTS;
  p.ranks.push(0, 0, 0);
  p.cooldownReadyAtMs.push(0, 0, 0);
  state.players.set(p.id, p);
});

const box = new Box();
box.id = 'b1'; box.x = 1400; box.y = 380;
box.mark = BoxMark.Unknown; box.state = BoxState.Idle;
state.boxes.set(box.id, box);

state.boss.hp = 1000; state.boss.maxHp = 1000; state.boss.lives = 3;
state.boss.behaviour = 'shielded';
state.director.focusClassIndex = -1; state.director.source = 'fallback';

const encoder = new Encoder(state);
const decoder = new Decoder(new MatchState());
const mirror = decoder.state as any;

const full = encoder.encodeAll();
decoder.decode(full);
encoder.discardChanges();

check('full state round-trips', mirror.players.size === 5 && mirror.roomCode === 'RBX1', `${full.byteLength}B`);
check('class stats mirrored', mirror.players.get('p0').maxHp === CLASSES.tank.maxHp);
check('carrier has no weapon', CLASSES.carrier.attackDamage === 0);
check('box identity hidden by default', mirror.boxes.get('b1').mark === BoxMark.Unknown);
check('no isReal field on the wire', !('isReal' in mirror.boxes.get('b1')));

box.mark = BoxMark.Real;
const afterScan = encoder.encode();
decoder.decode(afterScan);
encoder.discardChanges();
check('scan reveals box', mirror.boxes.get('b1').mark === BoxMark.Real, `${afterScan.byteLength}B delta`);

for (const [, p] of state.players) { p.x += 3; }
state.boss.x = 1440;
const tick = encoder.encode();
decoder.decode(tick);
encoder.discardChanges();
check('movement tick is small', tick.byteLength < 200, `${tick.byteLength}B -> ${(tick.byteLength * 20 / 1024).toFixed(1)} KB/s @20Hz`);
check('idle tick sends nothing', !encoder.hasChanges);

check('every class has 3 abilities', CLASS_IDS.every((c) => CLASSES[c].abilities.length === 3));
check('cooldowns defined for every rank', CLASS_IDS.every((c) => CLASSES[c].abilities.every((a) => a.cooldownMs.length === PROGRESSION.MAX_RANK)));
check('crystal stages defined', CRYSTALS.PER_STAGE.length === 3);

console.log(failures === 0 ? '\ncontract OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
