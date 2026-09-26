/**
 * The real room: real schema, real join handling, real message routing.
 * The SIMULATION is pluggable - pass a list of Systems. Stub mode passes a fake
 * one so the frontend has a live server before any gameplay exists; swapping in
 * real systems changes nothing the client can observe.
 */

import { Room, type Client } from 'colyseus';
import {
  BOSS, BOXES, CLASSES, CLASS_BY_INDEX, CLASS_IDS, CRYSTALS, MAP, MATCH,
  PATCH_RATE, PLAYER, PROGRESSION, PROTOCOL_VERSION, ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH, TICK_MS,
  MatchPhase, Outcome,
  ClientMessage, ServerMessage, JoinError,
  type ClassId, type JoinOptions, type MatchEvent, type System, type World,
  type UseAbilityPayload, type MovePayload, type PickClassPayload,
  type SpendSkillPointPayload, type AttackPayload, type InteractPayload,
} from '@redbox/shared';
import { Creep, MatchState, Player, ReviveResource } from '@redbox/shared/schema';
import type { Box, Boss, Crystal } from '@redbox/shared/schema';

export type SystemFactory = (room: HeistRoom) => System[];

interface Intent { dx: number; dy: number; atMs: number; }

export class HeistRoom extends Room<MatchState> {
  maxClients = MATCH.TEAM_SIZE;

  /** Server-only truth. Deliberately never in MatchState. */
  private boxIsReal = new Map<string, boolean>();
  private boxIsCamouflaged = new Map<string, boolean>();
  private threat = new Map<string, number>();
  private intents = new Map<string, Intent>();
  private eventLog: MatchEvent[] = [];
  private systems: System[] = [];
  private matchStartedAt = 0;

  static systemFactory: SystemFactory = () => [];

  onCreate(options: { roomCode?: string } = {}) {
    const state = new MatchState();
    state.phase = MatchPhase.Lobby;
    state.outcome = Outcome.None;
    state.stage = 1;
    state.crystalsRequired = CRYSTALS.PER_STAGE[0]!;
    state.timeRemainingMs = MATCH.DURATION_MS;
    state.roomCode = options.roomCode ?? randomRoomCode();
    state.boss.x = MAP.BOSS_ZONE.x;
    state.boss.y = MAP.BOSS_ZONE.y;
    state.boss.hp = BOSS.HP_PER_LIFE;
    state.boss.maxHp = BOSS.HP_PER_LIFE;
    state.boss.lives = BOSS.LIVES;
    state.boss.vulnerable = false;
    state.boss.behaviour = 'shielded';
    state.director.focusClassIndex = -1;
    state.director.source = 'fallback';
    this.setState(state);

    this.setMetadata({ roomCode: state.roomCode });
    this.setPatchRate(1000 / PATCH_RATE);

    this.registerMessageHandlers();
    this.systems = HeistRoom.systemFactory(this);

    // 0.16 has no fixed-timestep helper; clamp the measured delta ourselves
    // so a GC hitch can never teleport entities across the map.
    this.setSimulationInterval((deltaMs) => this.step(Math.min(deltaMs, TICK_MS * 3) / 1000), TICK_MS);
  }

  // ---------------------------------------------------------------- lifecycle

  onJoin(client: Client, options: JoinOptions) {
    if (options?.protocolVersion !== PROTOCOL_VERSION) {
      client.send(ServerMessage.Error, {
        code: JoinError.ProtocolMismatch,
        message: `server speaks v${PROTOCOL_VERSION}, client sent v${options?.protocolVersion}`,
      });
      throw new Error(JoinError.ProtocolMismatch);
    }
    const classId = this.assignClass(options?.classId);
    this.addPlayer(client.sessionId, options?.name || 'player', classId, false);
  }

  onLeave(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    // Hand the seat to a bot rather than dropping the role mid-match.
    if (this.state.phase === MatchPhase.Playing) p.isBot = true;
    else this.state.players.delete(client.sessionId);
  }

  // ----------------------------------------------------------------- messages

  private registerMessageHandlers() {
    this.onMessage(ClientMessage.Move, (client, msg: MovePayload) => {
      const len = Math.hypot(msg?.dx ?? 0, msg?.dy ?? 0);
      const dx = len > 1 ? msg.dx / len : (msg?.dx ?? 0);
      const dy = len > 1 ? msg.dy / len : (msg?.dy ?? 0);
      this.intents.set(client.sessionId, { dx, dy, atMs: this.state.elapsedMs });
    });

    this.onMessage(ClientMessage.PickClass, (client, msg: PickClassPayload) => {
      if (this.state.phase !== MatchPhase.Lobby) return;
      const p = this.state.players.get(client.sessionId);
      if (!p || !CLASS_IDS.includes(msg?.classId)) return;
      if (this.classTaken(msg.classId, client.sessionId)) return;
      applyClass(p, msg.classId);
    });

    this.onMessage(ClientMessage.Ready, (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = true;
      this.maybeStart();
    });

    this.onMessage(ClientMessage.SpendSkillPoint, (client, msg: SpendSkillPointPayload) => {
      const p = this.state.players.get(client.sessionId);
      const slot = msg?.slot;
      if (!p || slot === undefined || slot < 0 || slot > 2) return;
      if (p.skillPoints <= 0) return;
      const rank = p.ranks[slot] ?? 0;
      if (rank >= PROGRESSION.MAX_RANK) return;
      p.ranks[slot] = rank + 1;
      p.skillPoints -= 1;
    });

    // Routed to systems; the stub ignores them.
    this.onMessage(ClientMessage.Attack, (client, msg: AttackPayload) => {
      this.dispatch('attack', client.sessionId, msg);
    });
    this.onMessage(ClientMessage.UseAbility, (client, msg: UseAbilityPayload) => {
      this.dispatch('ability', client.sessionId, msg);
    });
    this.onMessage(ClientMessage.Interact, (client, msg: InteractPayload) => {
      this.dispatch('interact', client.sessionId, msg);
    });
  }

  private pending: Array<{ kind: string; sessionId: string; msg: unknown }> = [];
  private dispatch(kind: string, sessionId: string, msg: unknown) {
    this.pending.push({ kind, sessionId, msg });
  }
  /** Systems drain this each tick. Exposed on World as `world.inbox`. */
  drainInbox() {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  // --------------------------------------------------------------------- tick

  private step(dtSeconds: number) {
    const dtMs = dtSeconds * 1000;
    const s = this.state;

    if (s.phase === MatchPhase.Lobby) { this.maybeStart(); return; }

    s.elapsedMs += dtMs;

    if (s.phase === MatchPhase.Countdown) {
      if (s.elapsedMs - this.matchStartedAt >= MATCH.COUNTDOWN_MS) {
        s.phase = MatchPhase.Playing;
        s.elapsedMs = 0;
        this.emit({ type: 'match_start', atMs: 0 });
        for (const sys of this.systems) sys.init?.(this.world(dtSeconds));
      }
      return;
    }

    if (s.phase !== MatchPhase.Playing) return;

    s.timeRemainingMs = Math.max(0, MATCH.DURATION_MS - s.elapsedMs);
    if (s.timeRemainingMs === 0) { this.endMatch(Outcome.Timeout); return; }

    const w = this.world(dtSeconds);
    for (const sys of this.systems) sys.update(w);
  }

  // -------------------------------------------------------------------- world

  private world(dtSeconds: number): World {
    const room = this;
    const s = this.state;
    return {
      state: s,
      now: s.elapsedMs,
      dt: dtSeconds,

      isBoxReal: (id) => room.boxIsReal.get(id) === true,
      revealBox: (id, byPlayerId) => {
        const box = s.boxes.get(id);
        if (!box) return;
        box.mark = room.boxIsReal.get(id) ? 1 : 2;
        room.emit({ type: 'scan_used', atMs: s.elapsedMs, playerId: byPlayerId, boxId: id });
      },

      query: (centre, radius, opts) => {
        const r2 = radius * radius;
        const hit: any[] = [];
        const near = (e: { x: number; y: number }) =>
          (e.x - centre.x) ** 2 + (e.y - centre.y) ** 2 <= r2;
        const alive = opts.aliveOnly !== false;
        if (opts.kinds.includes('player'))
          for (const [, p] of s.players) if ((!alive || p.alive) && p.id !== opts.excludeId && near(p)) hit.push(p);
        if (opts.kinds.includes('creep'))
          for (const [, c] of s.creeps) if (c.id !== opts.excludeId && near(c)) hit.push(c);
        if (opts.kinds.includes('crystal'))
          for (const [, c] of s.crystals) if ((!alive || !c.destroyed) && near(c)) hit.push(c);
        if (opts.kinds.includes('box'))
          for (const [, b] of s.boxes) if (near(b)) hit.push(b);
        if (opts.kinds.includes('revive'))
          for (const [, rv] of s.revives) if (!rv.claimed && near(rv)) hit.push(rv);
        if (opts.kinds.includes('boss') && near(s.boss)) hit.push(s.boss);
        return hit;
      },

      walkable: (x, y) => x >= 0 && y >= 0 && x < MAP.WIDTH_PX && y < MAP.HEIGHT_PX,

      damage: (targetId, amount) => amount, // real impl lands with the combat system
      heal: (targetId, amount) => amount,
      addThreat: (pid, amt) => room.threat.set(pid, (room.threat.get(pid) ?? 0) + amt),
      setThreatTop: (pid, overshoot) => {
        const top = Math.max(0, ...room.threat.values());
        room.threat.set(pid, top * (1 + overshoot) + 1);
      },

      spawnCreep: (pos, tier) => {
        const c = new Creep();
        c.id = 'c' + Math.random().toString(36).slice(2, 8);
        c.x = pos.x; c.y = pos.y; c.tier = tier;
        c.hp = 80; c.maxHp = 80;
        s.creeps.set(c.id, c);
        return c;
      },
      spawnRevive: (pos) => {
        const rv = new ReviveResource();
        rv.id = 'rv' + Math.random().toString(36).slice(2, 8);
        rv.x = pos.x; rv.y = pos.y;
        s.revives.set(rv.id, rv);
        return rv;
      },
      removeEntity: (kind, id) => {
        if (kind === 'creep') s.creeps.delete(id);
        else if (kind === 'box') s.boxes.delete(id);
        else if (kind === 'crystal') s.crystals.delete(id);
        else if (kind === 'revive') s.revives.delete(id);
      },

      emit: (e) => room.emit(e),
      fx: (kind, pos, opts) => room.broadcast(ServerMessage.Fx, { kind, x: pos.x, y: pos.y, ...opts }),

      applyDebuff: (pid, debuff, durationMs) => {
        const p = s.players.get(pid);
        if (!p) return;
        const until = s.elapsedMs + durationMs;
        if (debuff === 'damageAmp') p.damageAmpUntilMs = until;
        else if (debuff === 'slow') p.slowUntilMs = until;
        else p.phasedUntilMs = until;
      },
      clearDebuffs: (pid) => {
        const p = s.players.get(pid);
        if (!p) return;
        p.damageAmpUntilMs = 0; p.slowUntilMs = 0;
      },

      awardSkillPoint: (pid, amount) => {
        const p = s.players.get(pid);
        if (p) p.skillPoints += amount;
      },
      endMatch: (outcome) => room.endMatch(outcome),

      playersOfClass: (classId) =>
        [...s.players.values()].filter((p) => CLASS_BY_INDEX[p.classIndex] === classId),
      alivePlayers: () => [...s.players.values()].filter((p) => p.alive),
    };
  }

  // ------------------------------------------------------------------ helpers

  /** Systems and stubs both read intents through this. */
  intentFor(playerId: string): Intent | undefined {
    const i = this.intents.get(playerId);
    if (!i) return undefined;
    if (this.state.elapsedMs - i.atMs > PLAYER.INPUT_MAX_AGE_MS) return undefined;
    return i;
  }

  emit(e: MatchEvent) {
    this.eventLog.push(e);
    this.broadcast(ServerMessage.Event, { event: e });
  }

  recentEvents(n = 15) { return this.eventLog.slice(-n); }
  allEvents() { return this.eventLog; }
  threatOf(playerId: string) { return this.threat.get(playerId) ?? 0; }

  registerBox(id: string, isReal: boolean, camouflaged: boolean) {
    this.boxIsReal.set(id, isReal);
    this.boxIsCamouflaged.set(id, camouflaged);
  }
  isCamouflaged(id: string) { return this.boxIsCamouflaged.get(id) === true; }

  private classTaken(classId: ClassId, exceptSessionId: string) {
    for (const [sid, p] of this.state.players)
      if (sid !== exceptSessionId && CLASS_BY_INDEX[p.classIndex] === classId) return true;
    return false;
  }

  private assignClass(preferred?: ClassId): ClassId {
    if (preferred && !this.classTaken(preferred, '')) return preferred;
    return CLASS_IDS.find((c) => !this.classTaken(c, '')) ?? 'tank';
  }

  addPlayer(id: string, name: string, classId: ClassId, isBot: boolean) {
    const p = new Player();
    p.id = id;
    p.name = name;
    p.isBot = isBot;
    p.connected = !isBot;
    p.x = MAP.BASE.x + (Math.random() - 0.5) * 80;
    p.y = MAP.BASE.y + (Math.random() - 0.5) * 80;
    p.lives = PLAYER.LIVES;
    p.alive = true;
    p.reviveCharges = PLAYER.REVIVE_CHARGES;
    p.skillPoints = PROGRESSION.STARTING_SKILL_POINTS;
    p.carryingBoxId = '';
    p.ranks.push(0, 0, 0);
    p.cooldownReadyAtMs.push(0, 0, 0);
    applyClass(p, classId);
    this.state.players.set(id, p);
    return p;
  }

  /** Bots fill every empty seat so one judge can play a full match alone. */
  fillWithBots() {
    for (const classId of CLASS_IDS) {
      if (this.classTaken(classId, '')) continue;
      this.addPlayer('bot_' + classId, CLASSES[classId].name + ' (bot)', classId, true);
    }
  }

  private maybeStart() {
    if (this.state.phase !== MatchPhase.Lobby) return;
    const humans = [...this.state.players.values()].filter((p) => !p.isBot);
    if (humans.length === 0 || !humans.every((p) => p.ready)) return;
    this.fillWithBots();
    this.state.phase = MatchPhase.Countdown;
    this.matchStartedAt = this.state.elapsedMs;
  }

  private endMatch(outcome: number) {
    if (this.state.phase === MatchPhase.Ended) return;
    this.state.phase = MatchPhase.Ended;
    this.state.outcome = outcome;
    this.emit({ type: 'match_end', atMs: this.state.elapsedMs, value: outcome });
  }
}

function applyClass(p: Player, classId: ClassId) {
  const spec = CLASSES[classId];
  p.classIndex = CLASS_IDS.indexOf(classId);
  p.maxHp = spec.maxHp;
  p.hp = spec.maxHp;
}

export function randomRoomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    out += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  return out;
}
