/**
 * The connection seam between backend and frontend.
 *
 * Everything here is what the two halves must agree on to talk at all: room
 * name, join options, lifecycle order and endpoint resolution. If you are
 * changing something in this file, the other developer needs to know.
 */

import type { ClassId } from './classes.js';

/** Registered with gameServer.define(). The client calls joinOrCreate(ROOM_NAME). */
export const ROOM_NAME = 'heist';

/** Bumped whenever shared/ changes shape. Server rejects a mismatched client. */
export const PROTOCOL_VERSION = 2;

export interface JoinOptions {
  protocolVersion: number;
  name: string;
  /** Preferred class. Server may assign a different one if taken. */
  classId?: ClassId;
  /** Join a specific room by its 4-character code; omit to create or match one. */
  roomCode?: string;
}

export const JoinError = {
  ProtocolMismatch: 'protocol_mismatch',
  RoomFull: 'room_full',
  MatchInProgress: 'match_in_progress',
  RoomNotFound: 'room_not_found',
} as const;
export type JoinErrorCode = (typeof JoinError)[keyof typeof JoinError];

/**
 * Lifecycle, in order. The client renders off `state.phase` and never tracks its
 * own copy of where the match is.
 *
 *   Lobby     players join, pick classes, toggle ready. Bots fill empty slots.
 *   Countdown all ready (or host forced start). Locked in, MATCH.COUNTDOWN_MS.
 *   Playing   simulation runs. elapsedMs advances, timeRemainingMs counts down.
 *   Ended     outcome is set. Debrief message arrives separately and may lag
 *             behind the phase change by a second or two - render a spinner.
 */
export const PHASE_ORDER = ['Lobby', 'Countdown', 'Playing', 'Ended'] as const;

/** Server default. Override with VITE_GAME_SERVER on the client, PORT on the server. */
export const DEFAULT_PORT = 2567;

/**
 * Resolve the websocket endpoint. Local dev talks to DEFAULT_PORT; in production
 * the client is served from the same origin behind TLS.
 */
export function resolveEndpoint(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof window === 'undefined') return `ws://localhost:${DEFAULT_PORT}`;
  const { protocol, hostname, port } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal) return `ws://${hostname}:${DEFAULT_PORT}`;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${hostname}${port ? ':' + port : ''}`;
}

/** Room codes are 4 chars from an alphabet with no look-alikes, for reading aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

/** What players type ("  ab3k ") -> the room id ("AB3K"). The code IS the Colyseus room id. */
export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
