/**
 * The delegation boundary. Server agents implement `System` / `ClassModule` and
 * touch the match ONLY through `World`. No system imports another system.
 *
 * Ownership of death: `damage()` only subtracts HP (never below 0). The owner
 * detects hp === 0 and performs the transition:
 *   players -> lives.ts   goblins -> goblins.ts   towers -> towers.ts   boss -> boss.ts
 *
 * Wave lifecycle: `onWaveStart` runs for wave 1 when the match starts and again
 * after every wave transition. Each system resets ONLY its own entities there.
 */

import type { ClassId } from './classes.js';
import type { MatchEvent } from './events.js';
import type { AttackPayload, FxKind, InteractPayload, UseAbilityPayload } from './messages.js';
import type {
  Box, Boss, Creep, Crystal, Hazard, MatchState, Player, ReviveResource,
} from './schema.js';

export interface Vec2 { x: number; y: number; }

export type EntityKind = 'player' | 'creep' | 'boss' | 'crystal' | 'box' | 'revive' | 'hazard';
export type Entity = Player | Creep | Crystal | Box | Boss | ReviveResource | Hazard;

export interface QueryOptions {
  kinds: EntityKind[];
  /** Skip downed players, dead goblins, destroyed towers, defeated boss, claimed revives. Default true. */
  aliveOnly?: boolean;
  excludeId?: string;
}

export interface DamageOptions {
  /** Attacker entity id: a player id, a goblin id, or 'boss'. Drives targeting, parry counters, debrief. */
  sourceId?: string;
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
 * Server-only timed modifiers, keyed by entity id ('boss' for the boss). Not
 * synced: the client sees the effect via fx, not the number.
 */
export const MOD = {
  /** Multiplies movement speed. Slows (< 1), buffs (> 1). */
  SpeedMult: 'speedMult',
  /** Multiplies incoming damage. Rage. */
  DamageTakenMult: 'damageTakenMult',
  /** Multiplies outgoing damage. Unstoppable. */
  DamageDealtMult: 'damageDealtMult',
  /** Multiplies basic-attack cooldown. Rage. */
  AttackCooldownMult: 'attackCooldownMult',
  /** 1 while stunned: no move, no attack. Stunning the boss becomes a slow automatically. */
  Stunned: 'stunned',
  /** 1 while immune to `push`. Unstoppable. */
  KnockbackImmune: 'knockbackImmune',
  /** While active, damage to this player is blocked and `value` is dealt back to the attacker. Parry. */
  Parry: 'parry',
} as const;
export type ModKey = (typeof MOD)[keyof typeof MOD];

export interface World {
  readonly state: MatchState;
  /** Milliseconds since match start. Use this, never Date.now(). */
  readonly now: number;
  /** Seconds since last tick. */
  readonly dt: number;
  /** Current wave, 1..3 (= state.stage). */
  readonly wave: number;

  // ---- input -------------------------------------------------------------
  /** This tick's commands of one kind. Every system sees the same list, in arrival order. */
  commands<K extends CommandKind>(kind: K): Command<K>[];
  /** Inject a command for this tick. Bots use this; they run first. */
  command<K extends CommandKind>(playerId: string, kind: K, payload: CommandPayloadMap[K]): void;
  /** Normalised movement direction, or undefined when stale / idle. */
  intentFor(playerId: string): Vec2 | undefined;
  setIntent(playerId: string, dx: number, dy: number): void;

  // ---- crates: truth lives here, never in state ---------------------------
  addBox(box: Box, truth: { isReal: boolean }): void;
  isBoxReal(boxId: string): boolean;

  // ---- space: walls come from shared/src/map.ts ---------------------------
  query(centre: Vec2, radius: number, opts: QueryOptions): Entity[];
  findEntity(id: string): { kind: EntityKind; entity: Entity } | undefined;
  /** False inside walls and outside the arena. */
  walkable(x: number, y: number): boolean;
  /** True if no wall tile lies on the segment. Ranged attacks and skills need it. */
  lineOfSight(a: Vec2, b: Vec2): boolean;
  distance(a: Vec2, b: Vec2): number;
  /**
   * Unit direction to steer from `from` toward `to` around walls (grid
   * pathfinding, straight line when clear). EVERY chaser uses this.
   */
  nextStep(from: Vec2, to: Vec2): Vec2;
  /** True if a walkable path exists. Never chase an unreachable target. */
  reachable(from: Vec2, to: Vec2): boolean;
  /** Nearest walkable point to `p` (for drops and teleports). */
  nearestWalkable(p: Vec2): Vec2;
  /**
   * Moves an entity up to `distance` px along `dir`, stopping at walls.
   * Respects KnockbackImmune. Returns the distance actually moved.
   */
  push(entityId: string, dir: Vec2, distance: number): number;
  /** Direction from a to b as a unit vector. */
  directionTo(a: Vec2, b: Vec2): Vec2;

  // ---- combat ------------------------------------------------------------
  /**
   * Target is a player/goblin/tower id or 'boss'. Returns damage actually dealt.
   * Applies DamageTakenMult, parry, and the tower bonus on the boss. No friendly
   * fire is enforced by the CALLER choosing hostile targets.
   */
  damage(targetId: string, amount: number, opts?: DamageOptions): number;
  heal(targetId: string, amount: number): number;

  // ---- boss targeting pressure -------------------------------------------
  /** Recent damage a player dealt to the boss (decays; boss.ts decays it). */
  addThreat(playerId: string, amount: number): void;
  threatOf(playerId: string): number;
  threatEntries(): Array<[playerId: string, threat: number]>;
  scaleAllThreat(factor: number): void;
  clearThreat(playerId: string): void;
  /** Optional AI director writes, boss reads. Clamped to DIRECTOR bounds. Default 1. */
  setThreatBias(classId: ClassId, mult: number): void;
  threatBias(classId: ClassId): number;

  // ---- modifiers ---------------------------------------------------------
  addModifier(entityId: string, key: ModKey, value: number, durationMs: number): void;
  modifier(entityId: string, key: ModKey, fallback?: number): number;
  clearModifiers(entityId: string): void;

  // ---- entities ----------------------------------------------------------
  /** Goblin with HP already scaled for `wave` (default: current wave). */
  spawnCreep(pos: Vec2, wave?: number): Creep;
  spawnRevive(pos: Vec2): ReviveResource;
  /** A telegraphed ground area. detonateAtMs 0 = armed until triggered. */
  spawnHazard(opts: { kind: string; pos: Vec2; radius: number; detonateAtMs: number; ownerId: string }): Hazard;
  removeEntity(kind: EntityKind, id: string): void;

  // ---- output ------------------------------------------------------------
  emit(event: MatchEvent): void;
  /** Transient VFX to all clients. */
  fx(kind: FxKind, pos: Vec2, opts?: { sourceId?: string; value?: number; angle?: number }): void;
  /** Raw server message to all clients (director, debrief). */
  broadcast(type: string, payload: unknown): void;
  recentEvents(n?: number): MatchEvent[];
  allEvents(): MatchEvent[];

  // ---- match -------------------------------------------------------------
  endMatch(outcome: number): void;
  playersOfClass(classId: ClassId): Player[];
  alivePlayers(): Player[];
}

export interface System {
  readonly id: string;
  /** Once per match, before wave 1. */
  init?(w: World): void;
  /** Wave 1 at match start, then after each transition. Reset YOUR entities only. */
  onWaveStart?(w: World): void;
  /** Every tick at TICK_RATE while a wave is being played. Must not block or await. */
  update(w: World): void;
  /** Once when the match ends (any outcome). */
  onEnd?(w: World): void;
}

export interface AbilityContext {
  world: World;
  caster: Player;
  /** From ClassSpec: ability.params. */
  params: Readonly<Record<string, number>>;
  range: number;
  /** Mouse aim point. Always set: falls back to a point along `caster.facing`. */
  aim: Vec2;
  targetId?: string;
}

/** Return false to NOT start the cooldown (e.g. blink into a wall). */
export type AbilityHandler = (ctx: AbilityContext) => boolean;

export interface ClassModule {
  classId: ClassId;
  abilities: readonly [AbilityHandler, AbilityHandler, AbilityHandler];
  /** Per-tick upkeep for this hero: detonating own hazards, channelled skills. */
  tick?(w: World, player: Player): void;
}
