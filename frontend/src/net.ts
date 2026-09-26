/**
 * The frontend's entire contact surface with the backend.
 *
 * Nothing else in the client should import colyseus.js. If you need something
 * from the server that isn't here, it is a contract change - talk to the backend
 * developer rather than reaching around this file.
 */

import { Client, Room } from 'colyseus.js';
import {
  INTERP_DELAY_MS, PROTOCOL_VERSION, ROOM_NAME, normalizeRoomCode, resolveEndpoint,
  ClientMessage, JoinError, ServerMessage,
  type ClassId, type DebriefPayload, type DirectorPayload, type FxPayload,
  type JoinErrorCode, type JoinOptions, type MatchEvent, type MatchState, type UseAbilityPayload,
} from '@redbox/shared';

/** Waits between reconnect attempts after a dropped connection (the server holds the seat 30 s). */
const RECONNECT_DELAYS_MS = [500, 1_500, 3_000, 6_000, 10_000];
/** Close codes that mean "left on purpose": no reconnect. */
const CLOSE_NORMAL = 1000;
const CLOSE_CONSENTED = 4000;

export interface NetHandlers {
  onFx?(fx: FxPayload): void;
  onEvent?(event: MatchEvent): void;
  onDirector?(d: DirectorPayload): void;
  onDebrief?(d: DebriefPayload): void;
  onError?(code: string, message: string): void;
  /** The connection is gone for good (after any reconnect attempts). */
  onLeave?(code: number): void;
  /** The connection dropped and is being re-established; the seat is held meanwhile. */
  onReconnecting?(): void;
  onReconnected?(): void;
}

/** A failed join, mapped onto the JoinError contract with a readable message. */
export class JoinFailure extends Error {
  constructor(readonly code: JoinErrorCode | 'unknown', message: string) {
    super(message);
    this.name = 'JoinFailure';
  }
}

const JOIN_ERROR_TEXT: Record<JoinErrorCode, string> = {
  [JoinError.ProtocolMismatch]: 'This page is out of date for the game server. Reload to update.',
  [JoinError.RoomFull]: 'That room is full, or its match has already started.',
  [JoinError.MatchInProgress]: 'That match has already started.',
  [JoinError.RoomNotFound]: 'No room with that code.',
};

/** Colyseus rejects joins with its own codes and texts; translate them. */
export function toJoinFailure(err: unknown): JoinFailure {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { code?: unknown })?.code;
  let code: JoinErrorCode | 'unknown' = 'unknown';
  if (raw.includes(JoinError.ProtocolMismatch)) code = JoinError.ProtocolMismatch;
  else if (raw.includes(JoinError.MatchInProgress)) code = JoinError.MatchInProgress;
  else if (/locked|already full/i.test(raw)) code = JoinError.RoomFull;
  else if (/not found|disposed/i.test(raw)) code = JoinError.RoomNotFound;
  const text = code === 'unknown' ? raw : JOIN_ERROR_TEXT[code];
  return new JoinFailure(code, typeof status === 'number' ? `${text} (${code}, ${status})` : `${text} (${code})`);
}

export class Net {
  room!: Room<MatchState>;
  private interp = new Interpolator();
  private client?: Client;
  private handlers: NetHandlers = {};
  /** The direction currently held, re-sent after a reconnect (the server reset it). */
  private held = { dx: 0, dy: 0 };
  private leaving = false;

  get state(): MatchState { return this.room.state; }
  get sessionId(): string { return this.room.sessionId; }
  get me() { return this.state.players.get(this.sessionId); }

  /**
   * mode 'quick'  - join any open lobby or create one (default)
   * mode 'create' - new PRIVATE room; share `net.state.roomCode` with friends
   * mode 'join'   - join a friend's room by its 4-character code
   *
   * Rejects with a `JoinFailure` whose message is fit to show the player.
   */
  async connect(opts: { name: string; classId?: ClassId; mode?: 'quick' | 'create' | 'join'; roomCode?: string; endpoint?: string },
                handlers: NetHandlers = {}) {
    const client = new Client(resolveEndpoint(opts.endpoint ?? import.meta.env?.VITE_GAME_SERVER));
    const join: JoinOptions = { protocolVersion: PROTOCOL_VERSION, name: opts.name, classId: opts.classId };
    const mode = opts.mode ?? (opts.roomCode ? 'join' : 'quick');
    if (mode === 'join' && !opts.roomCode) throw new Error('roomCode is required to join a room');
    try {
      if (mode === 'join') {
        this.room = await client.joinById<MatchState>(normalizeRoomCode(opts.roomCode!), join);
      } else if (mode === 'create') {
        this.room = await client.create<MatchState>(ROOM_NAME, { ...join, private: true });
      } else {
        this.room = await client.joinOrCreate<MatchState>(ROOM_NAME, join);
      }
    } catch (err) {
      throw toJoinFailure(err);
    }
    this.client = client;
    this.handlers = handlers;
    this.leaving = false;
    this.bind(this.room);
    return this;
  }

  /** Wires a (re)joined room to the handlers. A reconnect yields a new Room object. */
  private bind(room: Room<MatchState>) {
    const handlers = this.handlers;
    room.onStateChange(() => this.sample());
    room.onMessage(ServerMessage.Fx, (m: FxPayload) => handlers.onFx?.(m));
    room.onMessage(ServerMessage.Event, (m: { event: MatchEvent }) => handlers.onEvent?.(m.event));
    room.onMessage(ServerMessage.Director, (m: DirectorPayload) => handlers.onDirector?.(m));
    room.onMessage(ServerMessage.Debrief, (m: DebriefPayload) => handlers.onDebrief?.(m));
    room.onMessage(ServerMessage.Error, (m: { code: string; message: string }) =>
      handlers.onError?.(m.code, m.message));
    room.onLeave((code) => {
      if (room !== this.room) return;
      if (this.leaving || code === CLOSE_NORMAL || code === CLOSE_CONSENTED) {
        handlers.onLeave?.(code);
      } else {
        void this.reconnect(code);
      }
    });
  }

  /** A dropped connection: take the held seat back before the server gives it away. */
  private async reconnect(code: number) {
    const token = this.room.reconnectionToken;
    this.handlers.onReconnecting?.();
    for (const wait of RECONNECT_DELAYS_MS) {
      await new Promise((r) => setTimeout(r, wait));
      if (this.leaving) return;
      try {
        this.room = await this.client!.reconnect<MatchState>(token);
        this.bind(this.room);
        this.sendHeld();
        this.handlers.onReconnected?.();
        return;
      } catch {
        // Server still unreachable, or the seat is gone: try again, then give up.
      }
    }
    this.handlers.onLeave?.(code);
  }

  // ---- intents. Every one of these is a request, never an assertion. --------

  /** Send only when the direction CHANGES, not every frame: the server holds it until the next one. */
  move(dx: number, dy: number) {
    this.held = { dx, dy };
    this.sendHeld();
  }

  private sendHeld() {
    if (this.room?.connection?.isOpen) this.room.send(ClientMessage.Move, this.held);
  }

  /** Left click. x/y = mouse aim point in WORLD pixels (convert from screen via the camera). */
  attack(x: number, y: number) { this.room.send(ClientMessage.Attack, { x, y }); }
  /** Q/E/R = slot 0/1/2, aimed at the mouse in world pixels. */
  useAbility(slot: 0 | 1 | 2, x: number, y: number) {
    this.room.send(ClientMessage.UseAbility, { slot, x, y } satisfies UseAbilityPayload);
  }
  /** F: pick up / drop a crate, or grab a revival pickup. */
  interact() { this.room.send(ClientMessage.Interact, {}); }
  pickClass(classId: ClassId) { this.room.send(ClientMessage.PickClass, { classId }); }
  ready() { this.room.send(ClientMessage.Ready, {}); }
  /** From the end screen: back to the lobby with the same party. */
  restart() { this.room.send(ClientMessage.Restart, {}); }

  // ---- rendering positions -------------------------------------------------

  /** Call once per patch. */
  sample() { this.interp.sample(this.state); }
  /** Call once per frame. Returns the smoothed position for an entity. */
  positionOf(id: string, fallback: { x: number; y: number }) {
    return this.interp.positionOf(id, fallback);
  }

  leave() {
    this.leaving = true;
    return this.room.leave();
  }
}

/**
 * Renders INTERP_DELAY_MS in the past so motion is always interpolated between
 * two known snapshots rather than extrapolated past the newest one. Without this
 * every entity visibly stutters at the patch rate.
 */
export class Interpolator {
  private buf = new Map<string, Array<{ t: number; x: number; y: number }>>();

  sample(state: MatchState) {
    const t = performance.now();
    const push = (id: string, x: number, y: number) => {
      let arr = this.buf.get(id);
      if (!arr) this.buf.set(id, (arr = []));
      arr.push({ t, x, y });
      while (arr.length > 2 && arr[1]!.t < t - INTERP_DELAY_MS * 3) arr.shift();
    };
    for (const [id, p] of state.players) push(id, p.x, p.y);
    for (const [id, c] of state.creeps) push(id, c.x, c.y);
    push('boss', state.boss.x, state.boss.y);
  }

  positionOf(id: string, fallback: { x: number; y: number }) {
    const arr = this.buf.get(id);
    if (!arr || arr.length < 2) return fallback;
    const target = performance.now() - INTERP_DELAY_MS;
    for (let i = arr.length - 1; i > 0; i--) {
      const b = arr[i]!, a = arr[i - 1]!;
      if (a.t <= target && target <= b.t) {
        const k = b.t === a.t ? 1 : (target - a.t) / (b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    const last = arr[arr.length - 1]!;
    return { x: last.x, y: last.y };
  }
}
