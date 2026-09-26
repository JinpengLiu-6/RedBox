/**
 * Verifies a running game server the way itch.io / Vercel clients will use it.
 *   local:     PORT=4000 npm start   then   SERVER=http://localhost:4000 npm run check:deploy
 *   railway:   SERVER=https://<app>.up.railway.app npm run check:deploy
 */
import { Client } from 'colyseus.js';
import { PROTOCOL_VERSION, ROOM_NAME, normalizeRoomCode, type JoinOptions, type MatchState } from '@redbox/shared';

const base = (process.env.SERVER ?? 'http://localhost:2567').replace(/\/$/, '');
const ws = base.replace(/^http/, 'ws');
const ITCH_ORIGIN = 'https://html-classic.itch.zone';
let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const health = await fetch(`${base}/health`).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
check('/health responds 200', health.status === 200, JSON.stringify(health.body));
check('server speaks this client\'s protocol', health.body?.protocol === PROTOCOL_VERSION, `server v${health.body?.protocol}, client v${PROTOCOL_VERSION}`);

const pre = await fetch(`${base}/matchmake/joinOrCreate/${ROOM_NAME}`, {
  method: 'OPTIONS', headers: { Origin: ITCH_ORIGIN, 'Access-Control-Request-Method': 'POST' },
});
const allow = pre.headers.get('access-control-allow-origin');
check('CORS allows the itch.io origin', allow === ITCH_ORIGIN || allow === '*', `allow-origin: ${allow}`);

const opts = (name: string): JoinOptions => ({ protocolVersion: PROTOCOL_VERSION, name });
const host = await new Client(ws).create<MatchState>(ROOM_NAME, { ...opts('host'), private: true });
await new Promise((r) => setTimeout(r, 300));
const code = (host.state as any).roomCode as string;
check('private room gets a 4-char code', /^[A-Z2-9]{4}$/.test(code), code);
check('room id equals the code', host.roomId === code, host.roomId);

// Typed sloppily, normalised exactly like net.ts does.
const friend = await new Client(ws).joinById<MatchState>(normalizeRoomCode(` ${code.toLowerCase()} `), opts('friend'));
check('friend joins by code (typed in lower case)', friend.roomId === code);
await new Promise((r) => setTimeout(r, 300));
check('both players in the same match', (host.state as any).players.size === 2);

const stranger = await new Client(ws).joinOrCreate<MatchState>(ROOM_NAME, opts('stranger'));
check('quick-match never lands in a private room', stranger.roomId !== code, stranger.roomId);

await Promise.all([host.leave(), friend.leave(), stranger.leave()]);
console.log(failures === 0 ? '\nDEPLOY OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
