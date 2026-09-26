/**
 * Headless match: the real WorldImpl and real systems, no network, no clock.
 * Every agent verifies its system here in milliseconds.
 *
 *   const h = new Harness([createBoxesSystem()]);
 *   const carrier = h.addPlayer('carrier', { x: 1400, y: 400 });
 *   h.start();
 *   h.command(carrier.id, 'interact', {});
 *   h.tick();
 *   assert.equal(carrier.carryingBoxId !== '', true);
 */

import {
  TICK_RATE,
  type ClassId, type CommandKind, type CommandPayloadMap, type MatchEventType, type System,
} from '@redbox/shared';
import type { Player } from '@redbox/shared/schema';
import { addPlayer, createMatchState } from '../room.js';
import { realSystems } from '../systems/index.js';
import { WorldImpl } from '../world.js';

export class Harness {
  readonly state = createMatchState('TEST');
  readonly sent: Array<{ type: string; payload: any }> = [];
  readonly world: WorldImpl;

  constructor(systems: System[]) {
    this.world = new WorldImpl(this.state, (type, payload) => this.sent.push({ type, payload }), systems);
  }

  /** Every registered system, in production order. */
  static full() { return new Harness(realSystems()); }

  addPlayer(classId: ClassId, opts: { id?: string; x?: number; y?: number; bot?: boolean } = {}): Player {
    const p = addPlayer(this.state, opts.id ?? classId, classId, classId, opts.bot ?? false);
    this.pinned.set(p.id, opts);
    if (opts.x !== undefined) p.x = opts.x;
    if (opts.y !== undefined) p.y = opts.y;
    return p;
  }

  private pinned = new Map<string, { x?: number; y?: number }>();

  /** Runs init + wave 1. Explicit x/y given to addPlayer survive the wave-start reset. */
  start() {
    this.world.start();
    for (const [id, o] of this.pinned) {
      const p = this.state.players.get(id);
      if (p && o.x !== undefined) p.x = o.x;
      if (p && o.y !== undefined) p.y = o.y;
    }
    return this;
  }

  /** Put a player somewhere mid-test. */
  place(playerId: string, x: number, y: number) {
    const p = this.state.players.get(playerId)!;
    p.x = x; p.y = y;
    return this;
  }

  tick(n = 1) {
    for (let i = 0; i < n; i++) this.world.step(1 / TICK_RATE);
    return this;
  }

  seconds(s: number) { return this.tick(Math.round(s * TICK_RATE)); }

  /** Queued for the NEXT tick, exactly like a client message. */
  command<K extends CommandKind>(playerId: string, kind: K, payload: CommandPayloadMap[K]) {
    this.world.enqueue(playerId, kind, payload);
    return this;
  }

  move(playerId: string, dx: number, dy: number) {
    this.world.setIntent(playerId, dx, dy);
    return this;
  }

  /** Keeps a player's intent fresh across many ticks. */
  walk(playerId: string, dx: number, dy: number, seconds: number) {
    const ticks = Math.round(seconds * TICK_RATE);
    for (let i = 0; i < ticks; i++) { this.world.setIntent(playerId, dx, dy); this.tick(); }
    return this;
  }

  events(type?: MatchEventType) {
    const all = this.world.allEvents();
    return type ? all.filter((e) => e.type === type) : all;
  }

  messages(type: string) { return this.sent.filter((m) => m.type === type).map((m) => m.payload); }
}
