/**
 * Synced match state.
 *
 * Built with the schema() builder rather than @type decorators: decorators need
 * experimentalDecorators + useDefineForClassFields:false, which fights Vite and
 * esbuild defaults. The builder produces an identical wire format without it.
 *
 * EVERY field declares an explicit default. Schema leaves undeclared fields
 * `undefined`, so `player.hp -= damage` would silently produce NaN and poison
 * the encoder for the rest of the match. Do not add a field without a default.
 *
 * Integrity rule: a box's true identity is NEVER in this state. Only `mark`,
 * which the server sets once a scan reveals it, is synced, and camouflaged boxes
 * are absent from `boxes` entirely until revealed. Otherwise devtools defeats
 * the Scanner role in ten seconds.
 */

import { schema } from '@colyseus/schema';

const num = (type: 'uint8' | 'uint16' | 'uint32' | 'int8' | 'float32', d = 0) =>
  ({ type, default: d }) as const;
const str = (d = '') => ({ type: 'string', default: d }) as const;
const bool = (d = false) => ({ type: 'boolean', default: d }) as const;

export const Player = schema({
  id: str(),
  name: str(),
  classIndex: num('uint8'),
  connected: bool(),
  isBot: bool(),
  ready: bool(),

  x: num('float32'),
  y: num('float32'),
  facing: num('float32'),
  moving: bool(),

  hp: num('uint16'),
  maxHp: num('uint16'),
  shield: num('uint16'),
  lives: num('uint8'),
  alive: bool(),
  respawnAtMs: num('uint32'),
  reviveCharges: num('uint8'),

  /** Empty string when not carrying. Nobody can attack while this is set. */
  carryingBoxId: str(),

  skillPoints: num('uint8'),
  /** Rank per ability slot, 0 = locked. */
  ranks: { array: 'uint8' },
  /** Elapsed-ms timestamps at which each slot becomes usable again. */
  cooldownReadyAtMs: { array: 'uint32' },

  /** Fake-box debuffs as elapsed-ms expiry stamps. 0 = inactive. */
  damageAmpUntilMs: num('uint32'),
  slowUntilMs: num('uint32'),
  phasedUntilMs: num('uint32'),

  /** Surfaced so the AI intent panel can show why the boss picked a target. */
  threatShare: num('float32'),
}, 'Player');
export type Player = InstanceType<typeof Player>;

export const Box = schema({
  id: str(),
  x: num('float32'),
  y: num('float32'),
  /** BoxMark. Unknown until a Scanner reveals it. Never leaks the truth. */
  mark: num('uint8'),
  /** BoxState. */
  state: num('uint8'),
  carriedBy: str(),
}, 'Box');
export type Box = InstanceType<typeof Box>;

export const Crystal = schema({
  id: str(), x: num('float32'), y: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'), destroyed: bool(),
}, 'Crystal');
export type Crystal = InstanceType<typeof Crystal>;

export const Creep = schema({
  id: str(), x: num('float32'), y: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'), tier: num('uint8'), targetId: str(),
}, 'Creep');
export type Creep = InstanceType<typeof Creep>;

export const Boss = schema({
  x: num('float32'), y: num('float32'), facing: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'), lives: num('uint8'),
  /** False while crystals shield it - all damage is ignored. */
  vulnerable: bool(),
  vulnerableUntilMs: num('uint32'),
  targetId: str(),
  /** 'shielded' | 'chase' | 'attack' | 'enraged' */
  behaviour: str('shielded'),
}, 'Boss');
export type Boss = InstanceType<typeof Boss>;

/** The AI made visible: the boss voice line plus the intent panel. */
export const Director = schema({
  focusClassIndex: num('int8', -1),
  spawnHint: str('none'),
  taunt: str(),
  reasoning: str(),
  updatedAtMs: num('uint32'),
  /** 'llm' when Modal answered, 'fallback' when the state machine is driving. */
  source: str('fallback'),
}, 'Director');
export type Director = InstanceType<typeof Director>;

export const ReviveResource = schema({
  id: str(), x: num('float32'), y: num('float32'), claimed: bool(),
}, 'ReviveResource');
export type ReviveResource = InstanceType<typeof ReviveResource>;

export const MatchState = schema({
  phase: num('uint8'),
  outcome: num('uint8'),
  /** Milliseconds since match start. Every other timestamp is relative to this. */
  elapsedMs: num('uint32'),
  timeRemainingMs: num('uint32'),

  /** 1..3. Drives crystal requirement and wave strength. */
  stage: num('uint8', 1),
  crystalsDestroyed: num('uint8'),
  crystalsRequired: num('uint8'),
  boxesDelivered: num('uint8'),

  roomCode: str(),

  players: { map: Player },
  boxes: { map: Box },
  crystals: { map: Crystal },
  creeps: { map: Creep },
  revives: { map: ReviveResource },
  boss: Boss,
  director: Director,
}, 'MatchState');
export type MatchState = InstanceType<typeof MatchState>;
