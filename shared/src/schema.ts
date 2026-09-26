/**
 * Synced match state. Built with the schema() / t.* builder API rather than
 * decorators: decorators require experimentalDecorators + useDefineForClassFields
 * false, which conflicts with Vite/esbuild on the client.
 *
 * Integrity rule: a box's true identity is NEVER in this state. Only `mark`,
 * which the server sets once a scan reveals it, is synced. Camouflaged boxes are
 * not inserted into `boxes` at all until revealed. Otherwise devtools defeats
 * the Scanner role in ten seconds.
 */

import { schema, t, type SchemaType } from '@colyseus/schema';

export const MatchPhase = { Lobby: 0, Countdown: 1, Playing: 2, Ended: 3 } as const;
export const Outcome = { None: 0, BoxVictory: 1, BossVictory: 2, Timeout: 3, Wipe: 4 } as const;
export const BoxMark = { Unknown: 0, Real: 1, Fake: 2 } as const;
export const BoxState = { Idle: 0, Carried: 1, Delivered: 2, Consumed: 3 } as const;

export const Player = schema({
  id: t.string(),
  name: t.string(),
  classIndex: t.uint8(),
  connected: t.boolean(),
  isBot: t.boolean(),
  ready: t.boolean(),

  x: t.float32(),
  y: t.float32(),
  facing: t.float32(),
  moving: t.boolean(),

  hp: t.uint16(),
  maxHp: t.uint16(),
  shield: t.uint16(),
  lives: t.uint8(),
  alive: t.boolean(),
  respawnAtMs: t.uint32(),
  reviveCharges: t.uint8(),

  /** Empty string when not carrying. Carriers cannot attack while non-empty. */
  carryingBoxId: t.string(),

  skillPoints: t.uint8(),
  /** Rank per ability slot, 0 = locked. */
  ranks: t.array('uint8'),
  /** Absolute elapsed-ms timestamps when each slot becomes usable again. */
  cooldownReadyAtMs: t.array('uint32'),

  /** Fake-box debuffs, as elapsed-ms expiry timestamps. 0 = inactive. */
  damageAmpUntilMs: t.uint32(),
  slowUntilMs: t.uint32(),
  /** Carrier's Phase: untargetable by AI. */
  phasedUntilMs: t.uint32(),

  /** Exposed for the AI intent panel so judges can see why the boss chose a target. */
  threatShare: t.float32(),
}, 'Player');
export type Player = SchemaType<typeof Player>;

export const Box = schema({
  id: t.string(),
  x: t.float32(),
  y: t.float32(),
  /** BoxMark. Unknown until a Scanner reveals it. Never leaks the truth. */
  mark: t.uint8(),
  /** BoxState. */
  state: t.uint8(),
  carriedBy: t.string(),
}, 'Box');
export type Box = SchemaType<typeof Box>;

export const Crystal = schema({
  id: t.string(),
  x: t.float32(),
  y: t.float32(),
  hp: t.uint16(),
  maxHp: t.uint16(),
  destroyed: t.boolean(),
}, 'Crystal');
export type Crystal = SchemaType<typeof Crystal>;

export const Creep = schema({
  id: t.string(),
  x: t.float32(),
  y: t.float32(),
  hp: t.uint16(),
  maxHp: t.uint16(),
  tier: t.uint8(),
  targetId: t.string(),
}, 'Creep');
export type Creep = SchemaType<typeof Creep>;

export const Boss = schema({
  x: t.float32(),
  y: t.float32(),
  facing: t.float32(),
  hp: t.uint16(),
  maxHp: t.uint16(),
  lives: t.uint8(),
  /** False while crystals still shield it - all damage is ignored. */
  vulnerable: t.boolean(),
  vulnerableUntilMs: t.uint32(),
  targetId: t.string(),
  /** 'idle' | 'chase' | 'attack' | 'enraged' | 'shielded' */
  behaviour: t.string(),
}, 'Boss');
export type Boss = SchemaType<typeof Boss>;

/** The AI made visible. Rendered as the boss voice line plus the intent panel. */
export const Director = schema({
  focusClassIndex: t.int8(),
  spawnHint: t.string(),
  taunt: t.string(),
  reasoning: t.string(),
  updatedAtMs: t.uint32(),
  /** 'llm' when Modal answered, 'fallback' when the state machine is driving. */
  source: t.string(),
}, 'Director');
export type Director = SchemaType<typeof Director>;

export const ReviveResource = schema({
  id: t.string(),
  x: t.float32(),
  y: t.float32(),
  claimed: t.boolean(),
}, 'ReviveResource');
export type ReviveResource = SchemaType<typeof ReviveResource>;

export const MatchState = schema({
  phase: t.uint8(),
  outcome: t.uint8(),
  /** Milliseconds since match start. Every other timestamp is relative to this. */
  elapsedMs: t.uint32(),
  timeRemainingMs: t.uint32(),

  /** 1..3, drives crystal requirement and wave strength. */
  stage: t.uint8(),
  crystalsDestroyed: t.uint8(),
  crystalsRequired: t.uint8(),
  boxesDelivered: t.uint8(),

  roomCode: t.string(),

  players: t.map(Player),
  boxes: t.map(Box),
  crystals: t.map(Crystal),
  creeps: t.map(Creep),
  revives: t.map(ReviveResource),
  boss: Boss,
  director: Director,
}, 'MatchState');
export type MatchState = SchemaType<typeof MatchState>;
