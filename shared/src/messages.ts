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
  /** F: pick up / drop a crate, or grab a revival pickup. */
  Interact: 'interact',
  /** From the end screen: back to the lobby with the same party. */
  Restart: 'restart',
} as const;
export type ClientMessageType = (typeof ClientMessage)[keyof typeof ClientMessage];

export interface JoinPayload { name: string; }
export interface PickClassPayload { classId: ClassId; }
export interface MovePayload { dx: number; dy: number; }
/** Mouse aim point in world pixels. Left click. */
export interface AttackPayload { x?: number; y?: number; targetId?: string; }
export interface UseAbilityPayload {
  /** 0 = Q, 1 = E, 2 = R. */
  slot: 0 | 1 | 2;
  /** Mouse aim point in world pixels. */
  x?: number;
  y?: number;
  targetId?: string;
}
/** Context-sensitive: pick up a box, drop it, grab a revive resource. */
export interface InteractPayload { targetId?: string; }

export interface ClientMessageMap {
  [ClientMessage.Join]: JoinPayload;
  [ClientMessage.PickClass]: PickClassPayload;
  [ClientMessage.Ready]: Record<string, never>;
  [ClientMessage.Move]: MovePayload;
  [ClientMessage.Attack]: AttackPayload;
  [ClientMessage.UseAbility]: UseAbilityPayload;
  [ClientMessage.Interact]: InteractPayload;
  [ClientMessage.Restart]: Record<string, never>;
}

export const ServerMessage = {
  /** Transient feedback the client renders as VFX; not part of synced state. */
  Fx: 'fx',
  Event: 'event',
  Director: 'director',
  Debrief: 'debrief',
  /**
   * Binary (Ogg Opus bytes): the latest LLM taunt spoken by the Goblin King.
   * Optional and best-effort: the taunt text is always shown first via
   * `state.director` / `Director`; audio may arrive later or never.
   */
  BossVoice: 'boss_voice',
  /** Binary (Ogg Opus bytes): the end-of-match `Debrief.summary`, spoken. Same best-effort rules. */
  DebriefVoice: 'debrief_voice',
  Error: 'error',
} as const;
export type ServerMessageType = (typeof ServerMessage)[keyof typeof ServerMessage];

/**
 * Every transient effect the server can fire. Ability effects use the ability id
 * from classes.ts. Telegraphs that last (meteor, bombs, boss attacks) live in
 * state (`hazards`, `boss.attack`), not here.
 */
export type FxKind =
  | 'hit' | 'heal' | 'attack' | 'death' | 'explosion' | 'stun'
  | 'crystal_break' | 'pickup' | 'drop' | 'deliver' | 'trap' | 'scan'
  | 'boss_sweep' | 'boss_slam' | 'boss_charge' | 'boss_defeated'
  | 'frost_wave' | 'blink' | 'meteor'
  | 'whirlwind' | 'earth_splitter' | 'rage'
  | 'shoulder_charge' | 'ground_slam' | 'unstoppable'
  | 'grenade' | 'mine' | 'mega_bomb'
  | 'slashing_dash' | 'parry' | 'blade_dance'
  | 'revive' | 'wave_cleared';

export interface FxPayload {
  kind: FxKind;
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
  /** Sent as a Colyseus binary message; colyseus.js hands `onMessage` a Uint8Array. */
  [ServerMessage.BossVoice]: Uint8Array;
  [ServerMessage.DebriefVoice]: Uint8Array;
  [ServerMessage.Error]: ErrorPayload;
}
