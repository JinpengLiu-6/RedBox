/**
 * The frontend's entire contact surface with the backend.
 *
 * Nothing else in the client should import colyseus.js. If you need something
 * from the server that isn't here, it is a contract change - talk to the backend
 * developer rather than reaching around this file.
 */

import { Client, Room } from 'colyseus.js';
import {
  INTERP_DELAY_MS, PROTOCOL_VERSION, ROOM_NAME, resolveEndpoint,
  ClientMessage, ServerMessage,
  type ClassId, type DebriefPayload, type DirectorPayload, type FxPayload,
  type JoinOptions, type MatchEvent, type MatchState, type UseAbilityPayload,
} from '@redbox/shared';

export interface NetHandlers {
  onFx?(fx: FxPayload): void;
  onEvent?(event: MatchEvent): void;
  onDirector?(d: DirectorPayload): void;
  onDebrief?(d: DebriefPayload): void;
  onError?(code: string, message: string): void;
  onLeave?(code: number): void;
}

export class Net {
  room!: Room<MatchState>;
  private interp = new Interpolator();

  get state(): MatchState { return this.room.state; }
  get sessionId(): string { return this.room.sessionId; }
  get me() { return this.state.players.get(this.sessionId); }

  async connect(opts: { name: string; classId?: ClassId; roomCode?: string; endpoint?: string },
                handlers: NetHandlers = {}) {
    const client = new Client(resolveEndpoint(opts.endpoint ?? import.meta.env?.VITE_GAME_SERVER));
    const join: JoinOptions = {
      protocolVersion: PROTOCOL_VERSION,
      name: opts.name,
      classId: opts.classId,
      roomCode: opts.roomCode,
    };
    this.room = opts.roomCode
      ? await client.joinById<MatchState>(opts.roomCode, join)
      : await client.joinOrCreate<MatchState>(ROOM_NAME, join);

    this.room.onMessage(ServerMessage.Fx, (m: FxPayload) => handlers.onFx?.(m));
    this.room.onMessage(ServerMessage.Event, (m: { event: MatchEvent }) => handlers.onEvent?.(m.event));
    this.room.onMessage(ServerMessage.Director, (m: DirectorPayload) => handlers.onDirector?.(m));
    this.room.onMessage(ServerMessage.Debrief, (m: DebriefPayload) => handlers.onDebrief?.(m));
    this.room.onMessage(ServerMessage.Error, (m: { code: string; message: string }) =>
      handlers.onError?.(m.code, m.message));
    this.room.onLeave((code) => handlers.onLeave?.(code));

    return this;
  }

  // ---- intents. Every one of these is a request, never an assertion. --------

  /** Send only when the direction CHANGES, not every frame. */
  move(dx: number, dy: number) { this.room.send(ClientMessage.Move, { dx, dy }); }
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

  leave() { return this.room.leave(); }
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
