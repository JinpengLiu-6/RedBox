/** Integrator-owned: lobby/disconnect/restart bookkeeping of the networked shell. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchPhase } from '@redbox/shared';
import type { MatchState } from '@redbox/shared/schema';
import { HeistRoom, addPlayer, createMatchState, fillWithBots, resetForRestart } from '../src/room.js';

/** A room without the Colyseus server around it: state and world are injected. */
function room(state: MatchState): HeistRoom {
  const r = new HeistRoom();
  const seat = r as unknown as { state: MatchState; world: { setIntent(id: string, dx: number, dy: number): void } };
  seat.state = state;
  seat.world = { setIntent() {} };
  return r;
}

const client = (sessionId: string) => ({ sessionId }) as never;

test('leaving the lobby frees the seat and the hero', () => {
  const s = createMatchState('TEST');
  const r = room(s);
  addPlayer(s, 'sess1', 'andrii', 'mage', false);
  r.onLeave(client('sess1'));
  assert.equal(s.players.size, 0);
});

test('a mid-match disconnect hands the hero to a bot instead of leaving a statue', () => {
  const s = createMatchState('TEST');
  const r = room(s);
  const p = addPlayer(s, 'sess1', 'andrii', 'mage', false);
  s.phase = MatchPhase.Playing;
  r.onLeave(client('sess1'));
  assert.equal(s.players.get('sess1'), p, 'the hero stays in the match');
  assert.equal(p.connected, false);
  assert.equal(p.isBot, true, 'and is driven by the bot brain from now on');
});

test('restart keeps the connected party and drops bots and quitters', () => {
  const s = createMatchState('TEST');
  const r = room(s);
  const stays = addPlayer(s, 'sess1', 'andrii', 'mage', false);
  addPlayer(s, 'sess2', 'quitter', 'troll', false);
  fillWithBots(s);
  s.phase = MatchPhase.Playing;
  r.onLeave(client('sess2'));
  stays.hp = 1;
  stays.lives = 0;
  stays.ready = true;

  resetForRestart(s);
  assert.deepEqual([...s.players.keys()], ['sess1']);
  assert.equal(s.phase, MatchPhase.Lobby);
  assert.equal(stays.hp, stays.maxHp);
  assert.equal(stays.ready, false);
});
