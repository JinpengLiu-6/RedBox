/**
 * Synced match state.
 *
 * Built with the schema() builder, not @type decorators (decorators fight
 * Vite/esbuild). EVERY field declares a default: schema leaves undeclared fields
 * `undefined`, so `hp -= dmg` would produce NaN and poison the encoder.
 *
 * Integrity rule: a closed crate's identity is NEVER in this state until the
 * server reveals it: by opening it, or by a completed scan (`scan` reaches 100).
 * Every unscanned crate is identical on the wire (`mark` Unknown).
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
  /** DEV/SOLO seat filler, always labelled in the UI. */
  isBot: bool(),
  ready: bool(),

  x: num('float32'),
  y: num('float32'),
  /** Radians; also the aim direction for the local hero. */
  facing: num('float32'),
  moving: bool(),

  hp: num('uint16'),
  maxHp: num('uint16'),
  lives: num('uint8'),
  /** false = downed (waiting to respawn, or out of lives). */
  alive: bool(),
  respawnAtMs: num('uint32'),
  revivesLeft: num('uint8'),

  /** Empty when not carrying. Carrying disables attacks and skills. */
  carryingBoxId: str(),

  /** Per slot: 0 = locked, 1 = unlocked. Q is 1 from wave 1, E at wave 2, R at wave 3. */
  ranks: { array: 'uint8' },
  /** Elapsed-ms timestamps at which each slot becomes usable again. */
  cooldownReadyAtMs: { array: 'uint32' },
  /** Elapsed-ms timestamp of the next basic attack. */
  attackReadyAtMs: num('uint32'),

  /** Share of the boss's targeting pressure, for the AI intent panel. */
  threatShare: num('float32'),
}, 'Player');
export type Player = InstanceType<typeof Player>;

/** A crate. Unscanned closed crates look identical: only `id`, position, `state`, `scan`. */
export const Box = schema({
  id: str(),
  x: num('float32'),
  y: num('float32'),
  /** BoxMark. Unknown until opened or scanned. */
  mark: num('uint8'),
  /** Scan progress 0..100; the mark is revealed at 100. */
  scan: num('uint8'),
  /** BoxState. */
  state: num('uint8'),
  carriedBy: str(),
}, 'Box');
export type Box = InstanceType<typeof Box>;

/** A crystal tower. Each one destroyed raises the boss damage multiplier. */
export const Crystal = schema({
  id: str(), x: num('float32'), y: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'), destroyed: bool(),
}, 'Crystal');
export type Crystal = InstanceType<typeof Crystal>;

/** A red goblin. */
export const Creep = schema({
  id: str(), x: num('float32'), y: num('float32'), facing: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'),
  /** Wave the goblin belongs to (drives scaling). */
  tier: num('uint8'),
  targetId: str(),
  /** 'idle' | 'chase' | 'windup' | 'recover' | 'stunned' */
  behaviour: str('idle'),
  /** While > now the goblin is telegraphing a hit: draw "!". */
  windupUntilMs: num('uint32'),
}, 'Creep');
export type Creep = InstanceType<typeof Creep>;

export const Boss = schema({
  x: num('float32'), y: num('float32'), facing: num('float32'),
  hp: num('uint16'), maxHp: num('uint16'),
  /** false once defeated: gone for the rest of the wave. Does NOT clear the wave. */
  alive: bool(true),
  targetId: str(),
  /** 'idle' | 'chase' | 'windup' | 'recover' | 'returning' | 'defeated' */
  behaviour: str('idle'),
  /** Attack being telegraphed: '' | 'sweep' | 'slam' | 'charge'. */
  attack: str(),
  /** When the telegraphed attack lands. */
  attackAtMs: num('uint32'),
  /** Where it lands (centre for slam, aim point for sweep/charge). */
  attackX: num('float32'),
  attackY: num('float32'),
}, 'Boss');
export type Boss = InstanceType<typeof Boss>;

/**
 * A telegraphed area on the ground: meteor, grenade, mega bomb, mine. The client
 * draws `radius` and fills it until `detonateAtMs` (0 = armed, waits for a trigger).
 */
export const Hazard = schema({
  id: str(),
  /** Ability id or 'mine'. */
  kind: str(),
  x: num('float32'), y: num('float32'),
  radius: num('uint16'),
  detonateAtMs: num('uint32'),
  ownerId: str(),
}, 'Hazard');
export type Hazard = InstanceType<typeof Hazard>;

/** Optional AI layer made visible: taunt line + intent panel. */
export const Director = schema({
  focusClassIndex: num('int8', -1),
  taunt: str(),
  reasoning: str(),
  updatedAtMs: num('uint32'),
  /** 'llm' | 'fallback' | '' (layer off). */
  source: str(),
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

  /** Current wave, 1..3. HUD: "WAVE {stage} / 3". */
  stage: num('uint8', 1),
  /** Real crates delivered THIS wave. HUD: "CRATES {boxesDelivered} / {boxesRequired}". */
  boxesDelivered: num('uint8'),
  boxesRequired: num('uint8'),
  /** Towers destroyed this wave. */
  crystalsDestroyed: num('uint8'),
  /** 1.00 / 1.25 / 1.50 / 1.75 - authoritative, so every client shows the same value. */
  bossDamageMult: num('float32', 1),
  /** Final wave: the boss must be defeated too, deliveries alone do not win. */
  bossRequired: bool(),

  roomCode: str(),

  players: { map: Player },
  boxes: { map: Box },
  crystals: { map: Crystal },
  creeps: { map: Creep },
  hazards: { map: Hazard },
  revives: { map: ReviveResource },
  boss: Boss,
  director: Director,
}, 'MatchState');
export type MatchState = InstanceType<typeof MatchState>;
