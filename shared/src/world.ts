/**
 * The delegation boundary. Server agents implement `System` / `ClassModule` and
 * touch the match ONLY through `World`. No system imports another system.
 *
 * Ownership of death: `damage()` only subtracts HP (never below 0). The system
 * that owns an entity detects hp === 0 and performs the transition:
 *   players -> lives.ts   creeps -> waves.ts   crystals -> crystals.ts   boss -> boss.ts
 */

import type { ClassId } from './classes.js';
import type { MatchEvent } from './events.js';
import type { AttackPayload, FxKind, InteractPayload, UseAbilityPayload } from './messages.js';
import type { Box, Boss, Creep, Crystal, MatchState, Player, ReviveResource } from './schema.js';

export interface Vec2 { x: number; y: number; }

export type EntityKind = 'player' | 'creep' | 'boss' | 'crystal' | 'box' | 'revive';
export type Entity = Player | Creep | Crystal | Box | Boss | ReviveResource;

export interface QueryOptions {
  kinds: EntityKind[];
  /** Skip dead players, destroyed crystals, claimed revives. Defaults to true. */
  aliveOnly?: boolean;
  excludeId?: string;
}

export interface DamageOptions {
  /** Player id. Drives boss threat and the debrief. */
  sourceId?: string;
  /** Crystals ignore damage unless this is set (CRYSTALS.RANGED_ONLY). */
  fromRanged?: boolean;
  ignoreShield?: boolean;
}

/** Player actions arrive as commands, drained once per tick. */
export type CommandKind = 'attack' | 'ability' | 'interact';
export interface CommandPayloadMap {
  attack: AttackPayload;
  ability: UseAbilityPayload;
  interact: InteractPayload;
}
export interface Command<K extends CommandKind = CommandKind> {
  kind: K;
  playerId: string;
  payload: CommandPayloadMap[K];
}

/**
 * Server-only timed modifiers, keyed by entity id. Not synced - the client sees
 * the effect, not the number. Default when absent is `fallback` (usually 1).
 */
export const MOD = {
  /** Multiplies movement speed. Sprint, slows. */
  SpeedMult: 'speedMult',
  /** Multiplies incoming damage. Bulwark. */
  DamageTakenMult: 'damageTakenMult',
  /** Multiplies basic-attack cooldown. Focus. */
  AttackCooldownMult: 'attackCooldownMult',
  /** 1 while stunned: the entity does not move or attack. Decoy, Shockwave. */
  Stunned: 'stunned',
} as const;
export type ModKey = (typeof MOD)[keyof typeof MOD];

export interface World {
  readonly state: MatchState;
  /** Milliseconds since match start. Use this, never Date.now(). */
  readonly now: number;
  /** Seconds since last tick. */
  readonly dt: number;

  // ---- input -------------------------------------------------------------
  /** This tick's commands of one kind. Every system sees the same list. */
  commands<K extends CommandKind>(kind: K): Command<K>[];
  /** Inject a command for this tick. Bots use this; they run first. */
  command<K extends CommandKind>(playerId: string, kind: K, payload: CommandPayloadMap[K]): void;
  /** Normalised movement direction, or undefined when stale / idle. */
  intentFor(playerId: string): Vec2 | undefined;
  /** Bots steer through the same path humans do. */
  setIntent(playerId: string, dx: number, dy: number): void;

  // ---- boxes: the truth lives here and never in state ---------------------
  addBox(box: Box, truth: { isReal: boolean; camouflaged: boolean }): void;
  isBoxReal(boxId: string): boolean;
  /** Reveals every box in radius, including camouflaged ones. Returns count newly revealed. */
  scan(centre: Vec2, radius: number, byPlayerId: string): number;

  // ---- spatial -----------------------------------------------------------
  query(centre: Vec2, radius: number, opts: QueryOptions): Entity[];
  findEntity(id: string): { kind: EntityKind; entity: Entity } | undefined;
  walkable(x: number, y: number): boolean;
  distance(a: Vec2, b: Vec2): number;
  /**
   * Unit direction to steer from `from` toward `to`. EVERY chaser (bots, creeps,
   * boss) must steer through this. Today it is a straight line; when walls land
   * it becomes grid pathfinding for everyone at once, with no change to callers.
   */
  nextStep(from: Vec2, to: Vec2): Vec2;

  // ---- combat ------------------------------------------------------------
  /** Target id is a player/creep/crystal id, or 'boss'. Returns damage actually dealt. */
  damage(targetId: string, amount: number, opts?: DamageOptions): number;
  heal(targetId: string, amount: number, sourceId?: string): number;

  // ---- boss threat -------------------------------------------------------
  addThreat(playerId: string, amount: number): void;
  setThreatTop(playerId: string, overshoot: number): void;
  threatOf(playerId: string): number;
  /** Raw threat entries. Boss AI applies bias itself when choosing. */
  threatEntries(): Array<[playerId: string, threat: number]>;
  scaleAllThreat(factor: number): void;
  clearThreat(playerId: string): void;
  /** Director writes, boss reads. Clamped to DIRECTOR bounds. */
  setThreatBias(classId: ClassId, mult: number): void;
  threatBias(classId: ClassId): number;

  // ---- modifiers ---------------------------------------------------------
  addModifier(entityId: string, key: ModKey, value: number, durationMs: number): void;
  modifier(entityId: string, key: ModKey, fallback?: number): number;
  applyDebuff(playerId: string, debuff: 'damageAmp' | 'slow' | 'phase', durationMs: number): void;
  clearDebuffs(playerId: string): void;

  // ---- entities ----------------------------------------------------------
  spawnCreep(pos: Vec2, tier: number): Creep;
  spawnRevive(pos: Vec2): ReviveResource;
  removeEntity(kind: EntityKind, id: string): void;

  // ---- output ------------------------------------------------------------
  emit(event: MatchEvent): void;
  /** Transient VFX to all clients. */
  fx(kind: FxKind, pos: Vec2, opts?: { sourceId?: string; value?: number }): void;
  /** Raw server message to all clients (director, debrief). */
  broadcast(type: string, payload: unknown): void;
  recentEvents(n?: number): MatchEvent[];
  allEvents(): MatchEvent[];

  // ---- progression / match -----------------------------------------------
  awardSkillPoint(playerId: string, amount: number): void;
  awardTeamSkillPoint(amount: number): void;
  endMatch(outcome: number): void;

  playersOfClass(classId: ClassId): Player[];
  alivePlayers(): Player[];
}

export interface System {
  readonly id: string;
  /** Called once when the match enters Playing. */
  init?(w: World): void;
  /** Called every tick at TICK_RATE while Playing. Must not block or await. */
  update(w: World): void;
  /** Called once when the match ends (any outcome). Debrief hooks in here. */
  onEnd?(w: World): void;
}

/** Systems are created per match. Keep per-match state inside the factory closure. */
export type SystemFactory = () => System;

export interface AbilityContext {
  world: World;
  caster: Player;
  /** 1-based, >= 1 when called. */
  rank: number;
  /** Rank-resolved magnitude from ClassSpec. */
  magnitude: number;
  targetId?: string;
  point?: Vec2;
}

/** Return false to NOT start the cooldown (invalid target, out of range). */
export type AbilityHandler = (ctx: AbilityContext) => boolean;

export interface ClassModule {
  classId: ClassId;
  abilities: readonly [AbilityHandler, AbilityHandler, AbilityHandler];
  /** Optional per-tick passive. */
  tick?(w: World, player: Player): void;
}
