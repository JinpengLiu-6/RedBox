/**
 * Structured match log. This is the single input for every AI feature - the
 * Modal boss director, the on-screen intent panel and the post-match debrief all
 * read this and nothing else. Systems only ever `world.emit()` into it.
 */

import type { ClassId } from './classes.js';

export type MatchEventType =
  | 'match_start' | 'match_end'
  | 'box_picked' | 'box_delivered' | 'box_dropped'
  | 'fake_triggered'
  | 'scan_used'
  | 'crystal_destroyed' | 'stage_cleared'
  | 'boss_vulnerable' | 'boss_life_removed' | 'boss_target_changed'
  | 'player_died' | 'player_respawned' | 'player_revived'
  | 'wave_spawned'
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
  stage: number;
  bossLives: number;
  bossHpPct: number;
  bossVulnerable: boolean;
  crystalsDestroyed: number;
  boxesDelivered: number;
  carrierHasBox: boolean;
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
  /** Class the boss should prioritise, or null to keep pure threat targeting. */
  focus: ClassId | null;
  /** Per-class multiplier applied to threat. Clamped by DIRECTOR bounds. */
  threatBias: Partial<Record<ClassId, number>>;
  spawnHint: 'flank' | 'base' | 'choke' | 'none';
  /** Shown on screen. This is what makes the AI visible to a judge. */
  taunt: string;
  /** One line of plain-language justification, shown in the AI intent panel. */
  reasoning: string;
}

export const FALLBACK_DECISION: DirectorDecision = {
  focus: null,
  threatBias: {},
  spawnHint: 'none',
  taunt: '',
  reasoning: 'threat table only',
};
