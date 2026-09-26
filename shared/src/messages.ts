/**
 * Client to server intents, and server to client one-off signals. The client is
 * a renderer: it sends intent and never asserts outcome.
 */

import type { ClassId } from './classes.js';
import type { DirectorDecision, MatchEvent } from './events.js';

export const ClientMessage = {
  Join: 'join',
  PickClass: 'pick_class',
  Ready: 'ready',
  /** Normalised direction vector, resent whenever it changes. */
  Move: 'move',
  Attack: 'attack',
  UseAbility: 'use_ability',
  Interact: 'interact',
  SpendSkillPoint: 'spend_point',
} as const;
export type ClientMessageType = (typeof ClientMessage)[keyof typeof ClientMessage];

export interface JoinPayload { name: string; }
export interface PickClassPayload { classId: ClassId; }
export interface MovePayload { dx: number; dy: number; }
export interface AttackPayload { targetId?: string; x?: number; y?: number; }
export interface UseAbilityPayload {
  /** 0, 1 or 2 - index into the class's ability list. */
  slot: 0 | 1 | 2;
  targetId?: string;
  x?: number;
  y?: number;
}
/** Context-sensitive: pick up a box, drop it, grab a revive resource. */
export interface InteractPayload { targetId?: string; }
export interface SpendSkillPointPayload { slot: 0 | 1 | 2; }

export interface ClientMessageMap {
  [ClientMessage.Join]: JoinPayload;
  [ClientMessage.PickClass]: PickClassPayload;
  [ClientMessage.Ready]: Record<string, never>;
  [ClientMessage.Move]: MovePayload;
  [ClientMessage.Attack]: AttackPayload;
  [ClientMessage.UseAbility]: UseAbilityPayload;
  [ClientMessage.Interact]: InteractPayload;
  [ClientMessage.SpendSkillPoint]: SpendSkillPointPayload;
}

export const ServerMessage = {
  /** Transient feedback the client renders as VFX; not part of synced state. */
  Fx: 'fx',
  Event: 'event',
  Director: 'director',
  Debrief: 'debrief',
  Error: 'error',
} as const;
export type ServerMessageType = (typeof ServerMessage)[keyof typeof ServerMessage];

export interface FxPayload {
  kind: 'hit' | 'heal' | 'scan' | 'blink' | 'explosion' | 'crystal_break' | 'pickup' | 'fake_trigger';
  x: number;
  y: number;
  sourceId?: string;
  value?: number;
}
export interface DirectorPayload extends DirectorDecision { source: 'llm' | 'fallback'; }
export interface DebriefPayload {
  /** LLM-written recap of the match, shown on the end screen. */
  summary: string;
  mvpPlayerId?: string;
  highlights: string[];
}
export interface EventPayload { event: MatchEvent; }
export interface ErrorPayload { code: string; message: string; }

export interface ServerMessageMap {
  [ServerMessage.Fx]: FxPayload;
  [ServerMessage.Event]: EventPayload;
  [ServerMessage.Director]: DirectorPayload;
  [ServerMessage.Debrief]: DebriefPayload;
  [ServerMessage.Error]: ErrorPayload;
}
