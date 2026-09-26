/**
 * The browser client's net layer: after a dropped connection it reconnects and
 * restores the held direction (the server zeroes a returning hero's intent),
 * and join failures come back as readable JoinError codes instead of raw
 * Colyseus errors.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JoinError } from '@redbox/shared';
import { Net, toJoinFailure } from '../../frontend/src/net.js';

/** Just enough of a colyseus.js Room for Net: sends are recorded, onLeave can be fired. */
function fakeRoom(token = 'tok') {
  const sent: Array<{ type: string; msg: unknown }> = [];
  let leave: (code: number) => void = () => {};
  const room = {
    reconnectionToken: token,
    connection: { isOpen: true },
    send: (type: string, msg: unknown) => { sent.push({ type, msg }); },
    onStateChange: () => {},
    onMessage: () => {},
    onLeave: (cb: (code: number) => void) => { leave = cb; },
  };
  return { room, sent, drop: (code: number) => leave(code) };
}

test('a dropped connection reconnects with the token and re-sends the held direction', async () => {
  const net = new Net();
  const first = fakeRoom('tok-1');
  const second = fakeRoom('tok-2');
  const tokens: string[] = [];
  let reconnected = false;
  const seat = net as unknown as { room: unknown; client: unknown; handlers: object; bind(room: unknown): void };
  seat.client = { reconnect: async (t: string) => { tokens.push(t); return second.room; } };
  seat.handlers = { onReconnected: () => { reconnected = true; } };
  seat.room = first.room;
  seat.bind(first.room);
  net.move(0, -1);
  assert.deepEqual(first.sent.at(-1), { type: 'move', msg: { dx: 0, dy: -1 } });

  first.room.connection.isOpen = false;
  first.drop(1006);   // abnormal close: not a deliberate leave
  for (let i = 0; i < 100 && !reconnected; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(reconnected, true);
  assert.deepEqual(tokens, ['tok-1']);
  assert.equal(net.room, second.room as never);
  assert.deepEqual(second.sent.at(-1), { type: 'move', msg: { dx: 0, dy: -1 } }, 'still walking north');
});

test('a deliberate leave never reconnects', async () => {
  const net = new Net();
  const { room, drop } = fakeRoom();
  let left = -1;
  let tried = 0;
  const seat = net as unknown as { room: unknown; client: unknown; handlers: object; bind(room: unknown): void };
  seat.client = { reconnect: async () => { tried++; return room; } };
  seat.handlers = { onLeave: (code: number) => { left = code; } };
  seat.room = room;
  seat.bind(room);
  drop(4000);
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(left, 4000);
  assert.equal(tried, 0);
});

test('Colyseus join errors map onto the JoinError contract', () => {
  const err = (code: number, message: string) => Object.assign(new Error(message), { code });
  assert.equal(toJoinFailure(err(4212, 'room "J97M" is locked')).code, JoinError.RoomFull);
  assert.equal(toJoinFailure(err(4213, 'AMPA is already full.')).code, JoinError.RoomFull);
  assert.equal(toJoinFailure(err(4212, 'room "ZZZZ" not found')).code, JoinError.RoomNotFound);
  assert.equal(toJoinFailure(err(4212, 'room "LMYH" has been disposed.')).code, JoinError.RoomNotFound);
  assert.equal(toJoinFailure(err(4216, 'match_in_progress')).code, JoinError.MatchInProgress);
  const old = toJoinFailure(err(4216, 'protocol_mismatch: server v2, client v1'));
  assert.equal(old.code, JoinError.ProtocolMismatch);
  assert.match(old.message, /reload/i, 'tells the player what to do');
  assert.equal(toJoinFailure(new Error('socket hang up')).code, 'unknown');
});
