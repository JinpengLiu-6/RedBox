import { createServer } from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_PORT, ROOM_NAME } from '@redbox/shared';
import { HeistRoom } from './room.js';
import { stubSystems } from './stub.js';
import { realSystems } from './systems/index.js';

const STUB = process.env.STUB === '1';
const port = Number(process.env.PORT ?? DEFAULT_PORT);

// Swap this for the real system list once the systems land. Nothing else changes.
HeistRoom.systemFactory = () => (STUB ? stubSystems() : realSystems());

const httpServer = createServer();
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, HeistRoom);

gameServer.listen(port).then(() => {
  console.log(`[redbox] ${STUB ? 'STUB' : 'live'} server on ws://localhost:${port} (room "${ROOM_NAME}")`);
});
