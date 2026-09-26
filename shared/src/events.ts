/**
 * Structured match log. This is the single input for every AI feature - the
 * Modal boss director, the on-screen intent panel and the post-match debrief all
 * read this and nothing else. Systems only ever `world.emit()` into it.
 */

import type { ClassId } from './classes.js';

export type MatchEventType =
  | 'match_start' | 'match_end'
  | 'wave_start' | 'wave_cleared'
  | 'box_picked' | 'box_delivered' | 'box_dropped'
  | 'trap_triggered'
  | 'crystal_destroyed'
  | 'boss_target_changed' | 'boss_attack' | 'boss_defeated'
  | 'player_died' | 'player_respawned' | 'player_revived'
  | 'goblins_spawned'
  | 'ability_used'
  | 'director_decision';

export interface MatchEventBase {
  type: MatchEventType;
  /** Milliseconds since match start, not wall clock. */
  atMs: number;
}

export type MatchEvent = MatchEventBase & {
  playerId?: string;
  classId?: ClassId;
  targetId?: string;
  boxId?: string;
  crystalId?: string;
  /** Generic payload: damage dealt, wave size, stage number, effect name. */
  value?: number;
  label?: string;
};

/** Compact snapshot handed to the Modal director. Keep it small - it is a prompt. */
export interface DirectorSnapshot {
  elapsedMs: number;
  timeRemainingMs: number;
  wave: number;
  bossAlive: boolean;
  bossHpPct: number;
  bossDamageMult: number;
  towersDestroyed: number;
  cratesDelivered: number;
  cratesRequired: number;
  /** Ids of players currently carrying a crate. */
  carriers: string[];
  players: Array<{
    id: string;
    classId: ClassId;
    hpPct: number;
    lives: number;
    alive: boolean;
    distanceToBoss: number;
    threatShare: number;
    carrying: boolean;
  }>;
  /** Last ~15 events, newest last. */
  recent: MatchEvent[];
}

/** What the director is allowed to return. Anything else is rejected. */
export interface DirectorDecision {
  /** Hero the boss should prioritise, or null to keep normal targeting. */
  focus: ClassId | null;
  /** Per-hero multiplier on boss targeting score. Clamped by DIRECTOR bounds. */
  threatBias: Partial<Record<ClassId, number>>;
  /** Shown on screen. This is what makes the AI visible to a judge. */
  taunt: string;
  /** One line of plain-language justification, shown in the AI intent panel. */
  reasoning: string;
}

export const FALLBACK_DECISION: DirectorDecision = {
  focus: null,
  threatBias: {},
  taunt: '',
  reasoning: 'threat table only',
};

/** Body POSTed to the debrief endpoint when the match ends. */
export interface DebriefRequest {
  outcome: number;
  outcomeLabel: string;
  durationMs: number;
  players: Array<{ id: string; name: string; classId: ClassId; isBot: boolean }>;
  events: MatchEvent[];
}
