/**
 * Proves the backend/frontend seam end to end using the real client library.
 * If this passes, the frontend can be built against the stub server today.
 */
import { Client } from 'colyseus.js';
import {
  PROTOCOL_VERSION, ROOM_NAME, ClientMessage, ServerMessage,
  MatchPhase, classOf, isUnscanned, crystalsRemaining,
  type MatchState, type JoinOptions,
} from '@redbox/shared';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const client = new Client('ws://localhost:2567');
const opts: JoinOptions = { protocolVersion: PROTOCOL_VERSION, name: 'judge', classId: 'scanner' };
const room = await client.joinOrCreate<MatchState>(ROOM_NAME, opts);

const seen = { fx: 0, events: 0 };
room.onMessage(ServerMessage.Fx, () => seen.fx++);
room.onMessage(ServerMessage.Event, () => seen.events++);

await sleep(300);
const s = room.state as any;
check('joined room', !!room.sessionId, `code ${s.roomCode}`);
check('starts in lobby', s.phase === MatchPhase.Lobby);

const me = s.players.get(room.sessionId);
check('player exists in state', !!me, me ? `${me.name} / ${classOf(me).name}` : '');
check('requested class honoured', classOf(me).id === 'scanner');
check('shared selectors work on client state', me.maxHp === classOf(me).maxHp);

room.send(ClientMessage.Ready, {});
await sleep(4200);
check('bots filled empty seats', s.players.size === 5, `${s.players.size} players`);
check('match is playing', s.phase === MatchPhase.Playing, `phase=${s.phase}`);
check('timer counting down', s.timeRemainingMs > 0 && s.timeRemainingMs < 420_000,
  `${Math.round(s.timeRemainingMs / 1000)}s left`);
check('boxes spawned, none pre-revealed', s.boxes.size > 0 && [...s.boxes.values()].every(isUnscanned),
  `${s.boxes.size} visible boxes`);
check('camouflaged boxes withheld from state', s.boxes.size < 12, `${12 - s.boxes.size} hidden`);
check('crystals spawned', s.crystals.size === 9, `need ${crystalsRemaining(s)} this stage`);

const before = { x: me.x, y: me.y };
room.send(ClientMessage.Move, { dx: 1, dy: 0 });
await sleep(600);
room.send(ClientMessage.Move, { dx: 0, dy: 0 });
check('server moved me from my intent', me.x > before.x, `x ${before.x.toFixed(0)} -> ${me.x.toFixed(0)}`);

const bossBefore = { x: s.boss.x, y: s.boss.y };
await sleep(600);
check('boss is simulated', s.boss.x !== bossBefore.x || s.boss.y !== bossBefore.y);

await sleep(4000);
check('director speaks', s.director.taunt !== '', JSON.stringify(s.director.taunt));
check('director exposes its reasoning', s.director.reasoning !== '');
check('events reach the client', seen.events > 0, `${seen.events} events`);

await room.leave();
console.log(failures === 0 ? '\nSEAM OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
