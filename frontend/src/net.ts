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
  ClientMessage, JoinError, ServerMessage as SharedServerMessage,
  type ClassId, type DebriefPayload, type DirectorPayload, type FxPayload,
  type JoinErrorCode, type JoinOptions, type MatchEvent, type MatchState, type UseAbilityPayload,
} from '@redbox/shared';

// TODO(voice): shared/src/messages.ts gains ServerMessage.BossVoice / DebriefVoice in
// a parallel track. Once it lands, delete this shim and import ServerMessage directly
// (drop the `as SharedServerMessage` alias). Spread first, so it still compiles
// after the merge (the reverse order is TS2783 once shared defines the same keys).
const ServerMessage = { ...SharedServerMessage, BossVoice: 'boss_voice', DebriefVoice: 'debrief_voice' } as const;

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
  /** Spoken Goblin King taunt: raw Ogg Opus bytes. Best-effort; the text is in state.director. */
  onBossVoice?(audio: Uint8Array): void;
  /** Spoken end-of-match recap: raw Ogg Opus bytes. Best-effort; the text arrives via onDebrief. */
  onDebriefVoice?(audio: Uint8Array): void;
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
    // Binary messages: colyseus.js hands these over as a Uint8Array VIEW into the
    // socket frame (non-zero byteOffset), so consumers must copy before detaching.
    // Registered even without a handler so colyseus.js doesn't warn per message,
    // and here in bind() so they survive a reconnect (which yields a new Room).
    room.onMessage(ServerMessage.BossVoice, (m: unknown) => {
      if (m instanceof Uint8Array && m.byteLength > 0) handlers.onBossVoice?.(m);
    });
    room.onMessage(ServerMessage.DebriefVoice, (m: unknown) => {
      if (m instanceof Uint8Array && m.byteLength > 0) handlers.onDebriefVoice?.(m);
    });
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

/** How long play() waits for a suspended AudioContext to resume before dropping the clip. */
const RESUME_WAIT_MS = 250;
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;

/**
 * Speaks the Goblin King's lines: plays the Ogg Opus clips from onBossVoice /
 * onDebriefVoice. Strictly a bonus on top of text that is already on screen, so
 * nothing here throws and failures cost at most one console.warn.
 *
 * Browsers block audio until the player interacts with the page: call unlock()
 * inside a click / keydown handler, or once call unlockOnGesture(). Clips that
 * arrive while audio is still blocked are dropped, never queued - a taunt about a
 * moment that has already passed is worse than silence.
 */
export class VoicePlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private current: AudioBufferSourceNode | null = null;
  /** Bumped by every play()/stop(); a clip that finishes decoding late sees it and bows out. */
  private seq = 0;
  private vol: number;
  private primed = false;
  private broken = false;
  private warned = false;

  constructor(volume = 1) { this.vol = clampVolume(volume); }

  /** 0 = muted, 1 = full. Also applies to the clip currently playing. */
  get volume(): number { return this.vol; }
  set volume(v: number) {
    this.vol = clampVolume(v);
    if (this.out) this.out.gain.value = this.vol;
  }

  /** True once the browser lets this page make sound. */
  get unlocked(): boolean { return this.ctx?.state === 'running'; }

  /**
   * Call synchronously from a user-gesture handler (click / keydown / touchend).
   * Cheap and idempotent. Resolves true once audio is allowed.
   */
  unlock(): Promise<boolean> {
    const ctx = this.context(true);
    if (!ctx) return Promise.resolve(false);
    if (!this.primed) {
      // iOS Safari only unlocks after a sound is started inside the gesture itself.
      this.primed = true;
      try {
        const blip = ctx.createBufferSource();
        blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        blip.connect(ctx.destination);
        blip.start();
      } catch { /* priming is only an iOS nicety */ }
    }
    if (ctx.state === 'running') return Promise.resolve(true);
    return ctx.resume().then(() => true, () => false);
  }

  /**
   * Unlocks on the player's first click / key press, and again after any later
   * suspension (iOS suspends audio on calls and app switches). Returns a disposer.
   */
  unlockOnGesture(target: EventTarget = globalThis): () => void {
    const onGesture = () => { if (!this.unlocked) void this.unlock(); };
    // Capture phase: still fires if game code stops propagation.
    for (const e of GESTURE_EVENTS) target.addEventListener(e, onGesture, { capture: true, passive: true });
    return () => { for (const e of GESTURE_EVENTS) target.removeEventListener(e, onGesture, true); };
  }

  /**
   * Decodes and plays one clip. A newer clip replaces the one playing: the boss
   * never talks over himself. Never rejects; resolves true if the clip started.
   */
  async play(bytes: Uint8Array): Promise<boolean> {
    const id = ++this.seq;
    if (this.vol === 0 || bytes.byteLength === 0) return false;
    // Without a prior gesture the context could only start suspended; don't create it yet.
    const ctx = this.context(hasUserActivation());
    if (!ctx) return false;

    let clip: AudioBuffer;
    try {
      // decodeAudioData DETACHES the buffer it is given, and colyseus.js hands us a
      // view into its socket frame: always decode a private copy of exactly these bytes.
      const copy = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(copy).set(bytes);
      clip = await ctx.decodeAudioData(copy);
    } catch (err) {
      // e.g. a Safari that can't decode Ogg Opus. The text is already on screen.
      this.warnOnce('could not decode a Goblin King voice clip; showing text only', err);
      return false;
    }
    if (id !== this.seq || !(await this.running(ctx)) || id !== this.seq) return false;

    this.stopCurrent();
    try {
      const src = ctx.createBufferSource();
      src.buffer = clip;
      src.connect(this.out!);
      src.onended = () => {
        src.disconnect();
        if (this.current === src) this.current = null;
      };
      src.start();
      this.current = src;
      return true;
    } catch (err) {
      this.warnOnce('could not play a Goblin King voice clip; showing text only', err);
      return false;
    }
  }

  /** Silences the current clip and drops any clip still decoding. */
  stop(): void {
    this.seq++;
    this.stopCurrent();
  }

  private stopCurrent() {
    const src = this.current;
    this.current = null;
    if (!src) return;
    try { src.stop(); } catch { /* already ended */ }
    src.disconnect();
  }

  /** Suspended = no gesture yet, a backgrounded tab, or an iOS interruption. */
  private async running(ctx: AudioContext): Promise<boolean> {
    if (ctx.state === 'running') return true;
    if (ctx.state === 'closed' || !hasUserActivation()) return false;
    // resume() only settles once the browser allows sound: give up quickly rather
    // than play this clip late.
    const resumed = ctx.resume().then(() => true, () => false);
    const late = new Promise<boolean>((r) => setTimeout(() => r(false), RESUME_WAIT_MS));
    return Promise.race([resumed, late]);
  }

  private context(create: boolean): AudioContext | null {
    if (this.ctx || !create || this.broken) return this.ctx;
    try {
      const Ctor = globalThis.AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio API unavailable');
      const ctx = new Ctor();
      const out = ctx.createGain();
      out.gain.value = this.vol;
      out.connect(ctx.destination);
      this.ctx = ctx;
      this.out = out;
    } catch (err) {
      this.broken = true;
      this.warnOnce('no Web Audio; the Goblin King stays text-only', err);
    }
    return this.ctx;
  }

  private warnOnce(message: string, err: unknown) {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[voice] ${message}:`, err);
  }
}

function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}

/** Sticky activation: has the player interacted with the page yet? Unknown -> assume yes. */
function hasUserActivation(): boolean {
  return globalThis.navigator?.userActivation?.hasBeenActive ?? true;
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
