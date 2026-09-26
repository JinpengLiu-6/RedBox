/**
 * The networked shell's failure paths: an AFK lobby, a dropped connection
 * mid-match, and async output from a world a Restart already replaced.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchPhase, TICK_MS } from '@redbox/shared';
import type { MatchState } from '@redbox/shared/schema';
import { HeistRoom, addPlayer, createMatchState, resetForRestart } from '../src/room.js';
import type { WorldImpl } from '../src/world.js';

interface Seat {
  state: MatchState;
  world: WorldImpl;
  tick(dtMs: number): void;
  newWorld(): WorldImpl;
  lock(): Promise<void>;
  broadcast(type: string, payload: unknown): void;
  allowReconnection(client: unknown, seconds: number): Promise<unknown>;
}

/** A room without the Colyseus server around it: state and world are injected. */
function room(state: MatchState) {
  const r = new HeistRoom();
  const seat = r as unknown as Seat;
  seat.state = state;
  seat.world = seat.newWorld();
  seat.lock = async () => {};
  return { r, seat };
}

const client = (sessionId: string, reconnectionToken?: string) => ({ sessionId, reconnectionToken }) as never;

function lobbyFor(seat: Seat, ms: number) {
  for (let t = 0; t < ms && seat.state.phase === MatchPhase.Lobby; t += TICK_MS) seat.tick(TICK_MS);
}

test('everyone ready starts the countdown at once', () => {
  const s = createMatchState('TEST');
  const { seat } = room(s);
  addPlayer(s, 'a', 'a', 'mage', false).ready = true;
  seat.tick(TICK_MS);
  assert.equal(s.phase, MatchPhase.Countdown);
});

test('one AFK human no longer blocks the lobby: the match starts 15 s after someone is ready', () => {
  const s = createMatchState('TEST');
  const { seat } = room(s);
  addPlayer(s, 'a', 'a', 'mage', false).ready = true;
  const afk = addPlayer(s, 'afk', 'afk', 'troll', false);
  lobbyFor(seat, 10_000);
  assert.equal(s.phase, MatchPhase.Lobby, 'still waiting after 10 s');
  lobbyFor(seat, 6_000);
  assert.equal(s.phase, MatchPhase.Countdown, 'started anyway');
  assert.equal(afk.ready, true, 'the AFK human plays too');
  assert.equal(s.players.size, 5, 'bots filled the rest');
});

test('nobody ready: the lobby waits, and the auto-start clock restarts from zero', () => {
  const s = createMatchState('TEST');
  const { r, seat } = room(s);
  addPlayer(s, 'a', 'a', 'mage', false).ready = true;
  addPlayer(s, 'b', 'b', 'troll', false);
  lobbyFor(seat, 10_000);
  r.onLeave(client('a'));   // the only ready player leaves the lobby
  lobbyFor(seat, 60_000);
  assert.equal(s.phase, MatchPhase.Lobby);
  s.players.get('b')!.ready = true;
  addPlayer(s, 'c', 'c', 'dwarf', false);
  lobbyFor(seat, 10_000);
  assert.equal(s.phase, MatchPhase.Lobby, 'a fresh 15 s for the new ready player');
});

test('a dropped connection mid-match gets its hero back on reconnect; a bot holds it meanwhile', async () => {
  const s = createMatchState('TEST');
  const { r, seat } = room(s);
  const p = addPlayer(s, 'sess1', 'andrii', 'mage', false);
  s.phase = MatchPhase.Playing;
  let back!: () => void;
  const asked: number[] = [];
  seat.allowReconnection = (_c, seconds) => { asked.push(seconds); return new Promise((res) => { back = () => res({}); }); };
  const leaving = r.onLeave(client('sess1', 'tok'), false);
  assert.equal(p.isBot, true, 'a bot drives the hero while the player is away');
  assert.equal(p.connected, false);
  assert.equal(asked.length, 1, 'the seat is held for a reconnect');
  back();
  await leaving;
  assert.equal(p.isBot, false, 'the player drives again');
  assert.equal(p.connected, true);
});

test('no reconnect after a deliberate leave, and the bot keeps the seat if the window expires', async () => {
  const s = createMatchState('TEST');
  const { r, seat } = room(s);
  const quitter = addPlayer(s, 'q', 'q', 'mage', false);
  const dropped = addPlayer(s, 'd', 'd', 'troll', false);
  s.phase = MatchPhase.Playing;
  let asked = 0;
  seat.allowReconnection = () => { asked++; return Promise.reject(new Error('expired')); };
  await r.onLeave(client('q', 'tok-q'), true);
  assert.equal(asked, 0, 'consented leave: no seat held');
  assert.equal(quitter.isBot, true);
  await r.onLeave(client('d', 'tok-d'), false);
  assert.equal(asked, 1);
  assert.equal(dropped.isBot, true, 'still the bot after the window');
  assert.equal(dropped.connected, false);
});

test('reconnecting after a Restart dropped the seat gives a fresh lobby seat', async () => {
  const s = createMatchState('TEST');
  const { r, seat } = room(s);
  addPlayer(s, 'host', 'host', 'troll', false);
  addPlayer(s, 'sess1', 'andrii', 'mage', false);
  s.phase = MatchPhase.Playing;
  let back!: () => void;
  seat.allowReconnection = () => new Promise((res) => { back = () => res({}); });
  const leaving = r.onLeave(client('sess1', 'tok'), false);
  s.phase = MatchPhase.Ended;
  resetForRestart(s);   // the host restarts while sess1 is away: disconnected seats are dropped
  assert.equal(s.players.has('sess1'), false);
  back();
  await leaving;
  const again = s.players.get('sess1');
  assert.ok(again, 'back in the lobby with a seat');
  assert.equal(again.isBot, false);
  assert.equal(again.connected, true);
});

test('output from a world replaced by Restart (a late debrief) is dropped', () => {
  const s = createMatchState('TEST');
  const { seat } = room(s);
  const sent: Array<[string, unknown]> = [];
  seat.broadcast = (type, payload) => { sent.push([type, payload]); };
  const old = seat.world;
  old.broadcast('debrief', 'current');
  seat.world = seat.newWorld();   // what the Restart handler does
  old.broadcast('debrief', 'late, from the previous match');
  seat.world.broadcast('debrief', 'new');
  assert.deepEqual(sent.map(([, p]) => p), ['current', 'new']);
});
