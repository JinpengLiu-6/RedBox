/**
 * Proves the backend/frontend seam end to end with the real client library,
 * against the stub server (`npm run stub`).
 */
import { Client } from 'colyseus.js';
import {
  PROTOCOL_VERSION, ROOM_NAME, ClientMessage, ServerMessage, MatchPhase, BoxMark,
  WAVE_PLAN, classOf, isClosedCrate, isWalkablePx,
  type MatchState, type JoinOptions,
} from '@redbox/shared';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const client = new Client(`ws://localhost:${process.env.PORT ?? 2567}`);
const opts: JoinOptions = { protocolVersion: PROTOCOL_VERSION, name: 'judge', classId: 'dwarf' };
const room = await client.joinOrCreate<MatchState>(ROOM_NAME, opts);
let fx = 0;
room.onMessage(ServerMessage.Fx, () => fx++);
room.onMessage(ServerMessage.Event, () => {});

await sleep(300);
const s = room.state as any;
const me = () => s.players.get(room.sessionId);
check('joined room', !!room.sessionId, `code ${s.roomCode}`);
check('starts in lobby', s.phase === MatchPhase.Lobby);
check('requested hero honoured', classOf(me()).id === 'dwarf', classOf(me()).name);

room.send(ClientMessage.Ready, {});
await sleep(4000);
check('five heroes in the match', s.players.size === 5, `${s.players.size}`);
check('wave 1 is playing', s.phase === MatchPhase.Playing && s.stage === 1);
check('wave 1 has exactly 15 crates', s.boxes.size === WAVE_PLAN[0].realCrates + WAVE_PLAN[0].trapCrates, `${s.boxes.size}`);
check('every closed crate is Unknown', [...s.boxes.values()].every((b: any) => isClosedCrate(b) && b.mark === BoxMark.Unknown));
check('three towers', s.crystals.size === 3);
check('crates required = 3', s.boxesRequired === 3);
check('only Q unlocked', [...me().ranks].join() === '1,0,0');
check('hero spawned on walkable ground', isWalkablePx(me().x, me().y));

const before = { x: me().x, y: me().y };
room.send(ClientMessage.Move, { dx: 1, dy: -1 });
await sleep(700);
room.send(ClientMessage.Move, { dx: 0, dy: 0 });
check('server moved me from my intent', me().x !== before.x || me().y !== before.y,
  `(${before.x.toFixed(0)},${before.y.toFixed(0)}) -> (${me().x.toFixed(0)},${me().y.toFixed(0)})`);
check('still on walkable ground', isWalkablePx(me().x, me().y));

await sleep(3500);
check('boss telegraphs an attack', ['sweep', 'slam', 'charge', ''].includes(s.boss.attack) && s.boss.alive);
check('goblins present', s.creeps.size > 0, `${s.creeps.size}`);
check('boss damage multiplier synced', s.bossDamageMult >= 1, `x${s.bossDamageMult}`);
check('director line visible', s.director.taunt !== '', JSON.stringify(s.director.taunt));
check('fx reach the client', fx > 0, `${fx}`);


await room.leave();
console.log(failures === 0 ? '\nSEAM OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
