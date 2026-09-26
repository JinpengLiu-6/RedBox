/**
 * The delegation boundary. Server agents implement `System` and touch the match
 * only through `World`. No system imports another system - that is what keeps
 * ~20 agents out of each other's files.
 */

import type { ClassId } from './classes.js';
import type { MatchEvent } from './events.js';
import type { Box, Boss, Creep, Crystal, MatchState, Player, ReviveResource } from './schema.js';

export interface Vec2 { x: number; y: number; }

export type EntityKind = 'player' | 'creep' | 'boss' | 'crystal' | 'box' | 'revive';

export interface QueryOptions {
  kinds: EntityKind[];
  /** Skip dead players and destroyed crystals. Defaults to true. */
  aliveOnly?: boolean;
  excludeId?: string;
}

export interface DamageOptions {
  /** Attributed for threat and for the debrief. */
  sourceId?: string;
  /** Crystals ignore damage unless this is set (CRYSTALS.RANGED_ONLY). */
  fromRanged?: boolean;
  ignoreShield?: boolean;
}

export interface World {
  readonly state: MatchState;
  /** Milliseconds since match start. Use this, never Date.now(). */
  readonly now: number;
  readonly dt: number;

  /** Server-side truth about a box. Deliberately absent from MatchState. */
  isBoxReal(boxId: string): boolean;
  revealBox(boxId: string, byPlayerId: string): void;

  query(centre: Vec2, radius: number, opts: QueryOptions): Array<Player | Creep | Crystal | Box | Boss | ReviveResource>;
  walkable(x: number, y: number): boolean;

  damage(targetId: string, amount: number, opts?: DamageOptions): number;
  heal(targetId: string, amount: number, sourceId?: string): number;
  addThreat(playerId: string, amount: number): void;
  setThreatTop(playerId: string, overshoot: number): void;

  spawnCreep(pos: Vec2, tier: number): Creep;
  spawnRevive(pos: Vec2): ReviveResource;
  removeEntity(kind: EntityKind, id: string): void;

  emit(event: MatchEvent): void;
  /** Transient VFX. Not stored in state; fire and forget. */
  fx(kind: string, pos: Vec2, opts?: { sourceId?: string; value?: number }): void;

  /** Ability files use these instead of writing to Player directly. */
  applyDebuff(playerId: string, debuff: 'damageAmp' | 'slow' | 'phase', durationMs: number): void;
  clearDebuffs(playerId: string): void;

  awardSkillPoint(playerId: string, amount: number): void;
  endMatch(outcome: number): void;

  playersOfClass(classId: ClassId): Player[];
  alivePlayers(): Player[];
}

export interface System {
  readonly id: string;
  /** Called once when the match enters Playing. */
  init?(w: World): void;
  /** Called every tick at TICK_RATE. Must not block or await. */
  update(w: World): void;
}

export interface AbilityContext {
  world: World;
  caster: Player;
  rank: number;
  targetId?: string;
  point?: Vec2;
}

/** One file per class implements three of these. Return false to refund the cooldown. */
export type AbilityHandler = (ctx: AbilityContext) => boolean;

export interface ClassModule {
  classId: ClassId;
  abilities: readonly [AbilityHandler, AbilityHandler, AbilityHandler];
  /** Optional per-tick passive, e.g. the Carrier's carry speed penalty. */
  tick?(w: World, player: Player): void;
}
