import { createServer } from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_PORT, PROTOCOL_VERSION, ROOM_NAME } from '@redbox/shared';
import { HeistRoom } from './room.js';
import { stubSystems } from './stub.js';
import { realSystems } from './systems/index.js';

const STUB = process.env.STUB === '1';
const port = Number(process.env.PORT ?? DEFAULT_PORT);

HeistRoom.systemFactory = () => (STUB ? stubSystems() : realSystems());

// Colyseus handles /matchmake/* itself (with permissive CORS) and forwards every
// other request here. /health is the Railway healthcheck.
const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      mode: STUB ? 'stub' : 'live',
      protocol: PROTOCOL_VERSION,
      // Which commit is actually running (Railway sets this), and whether the
      // optional AI layer is configured - booleans only, never the URLs.
      commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
      ai: {
        director: Boolean(process.env.DIRECTOR_URL),
        debrief: Boolean(process.env.DEBRIEF_URL),
        voice: Boolean(process.env.VOICE_URL && process.env.VOICE_TOKEN),
      },
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Goblin King Heist game server');
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, HeistRoom);

gameServer.listen(port).then(() => {
  console.log(`[redbox] ${STUB ? 'STUB' : 'live'} server listening on :${port} (room "${ROOM_NAME}", protocol v${PROTOCOL_VERSION}, ` +
    `commit ${(process.env.RAILWAY_GIT_COMMIT_SHA ?? 'local').slice(0, 7)}, AI director ${process.env.DIRECTOR_URL ? 'on' : 'off'}, ` +
    `voice ${process.env.VOICE_URL && process.env.VOICE_TOKEN ? 'on' : 'off'})`);
});
