/**
 * Does the Goblin King actually speak? Joins a PRIVATE room on an already
 * running server, readies up, and waits for a spoken taunt: a ServerMessage.BossVoice
 * binary message that colyseus.js delivers as a Uint8Array of Ogg Opus ("OggS...").
 * Starts nothing itself. The server needs DIRECTOR_URL (which writes the taunts)
 * plus VOICE_URL and VOICE_TOKEN (which speak them).
 *
 *   local:    SERVER=ws://localhost:2567 npx tsx e2e/voice-check.ts
 *   railway:  SERVER=wss://<app>.up.railway.app npx tsx e2e/voice-check.ts
 *
 * SERVER accepts ws(s):// or http(s):// (default ws://localhost:2567).
 * VOICE_WAIT_MS overrides the 60 s wait. VOICE_SAVE=/tmp/boss.ogg writes the
 * first clip to disk so you can listen to it.
 * Exit 0 = a valid clip arrived in time.
 */
import { writeFileSync } from 'node:fs';
import { Client } from 'colyseus.js';
import {
  PROTOCOL_VERSION, ROOM_NAME, ClientMessage, MatchPhase, PHASE_LABEL,
  ServerMessage as SharedServerMessage,
  type DirectorPayload, type JoinOptions, type MatchState,
} from '@redbox/shared';

// TODO(voice): delete once shared/src/messages.ts exports ServerMessage.BossVoice /
// DebriefVoice (parallel track), and import ServerMessage directly.
const ServerMessage = { ...SharedServerMessage, BossVoice: 'boss_voice', DebriefVoice: 'debrief_voice' } as const;

const raw = (process.env.SERVER ?? 'ws://localhost:2567').replace(/\/+$/, '');
const wsUrl = raw.replace(/^http/, 'ws');
const httpUrl = wsUrl.replace(/^ws/, 'http');
const WAIT_MS = Number(process.env.VOICE_WAIT_MS ?? 60_000);

let failures = 0;
const check = (label: string, cond: boolean, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};
const note = (label: string, detail = '') => console.log(`--    ${label}${detail ? '  ' + detail : ''}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const head = (b: Uint8Array) => String.fromCharCode(...b.subarray(0, 4));

console.log(`voice check against ${wsUrl} (waiting up to ${secs(WAIT_MS)} for a spoken taunt)\n`);

// Informational only: older servers have no "voice" flag, and /health may be unreachable locally.
try {
  const res = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(5_000) });
  const body = (await res.json().catch(() => null)) as { voice?: boolean; ai?: Record<string, boolean>; commit?: string } | null;
  note('/health', `HTTP ${res.status}  voice=${body?.voice ?? '?'}  ai=${JSON.stringify(body?.ai ?? null)}  commit=${body?.commit ?? '?'}`);
  if (body?.voice === false) note('server reports voice OFF (VOICE_URL / VOICE_TOKEN unset): expect no clips');
  if (body?.ai && body.ai.director === false) note('server reports the AI director OFF: no LLM taunts, so nothing to speak');
} catch (err) {
  note('/health unreachable', err instanceof Error ? err.message : String(err));
}

interface Clip { atMs: number; isUint8Array: boolean; bytes: number; head: string; data: Uint8Array | null; }
const describe = (m: unknown, t0: number): Clip => {
  const u8 = m instanceof Uint8Array ? m : null;
  return {
    atMs: Date.now() - t0, isUint8Array: !!u8, bytes: u8?.byteLength ?? 0,
    head: u8 ? head(u8) : '', data: u8 ? u8.slice() : null,
  };
};

const opts: JoinOptions & { private: true } = { protocolVersion: PROTOCOL_VERSION, name: 'voice-check', private: true };
const room = await new Client(wsUrl).create<MatchState>(ROOM_NAME, opts).catch((err: unknown) => {
  const why = err instanceof Error ? err.message || `${err.name}${'code' in err ? ' ' + String(err.code) : ''}` : String(err);
  check('joined a private room', false, `${why}  (is a server running at ${wsUrl}?)`);
  console.log('\n1 FAILURE(S)');
  process.exit(1);
});
const s = () => room.state as MatchState | undefined;

let t0 = Date.now();
const taunts = { llm: 0, fallback: 0, lastLlmAtMs: -1, lastLlmText: '' };
let bossClips = 0;
let firstBoss: Clip | null = null;
let firstRecap: Clip | null = null;
let leftWith: number | null = null;
let wake: () => void = () => {};
const arrived = new Promise<void>((r) => { wake = r; });

room.onMessage(ServerMessage.BossVoice, (m: unknown) => {
  bossClips++;
  if (!firstBoss) { firstBoss = describe(m, t0); wake(); }
});
room.onMessage(ServerMessage.DebriefVoice, (m: unknown) => { firstRecap ??= describe(m, t0); });
room.onMessage(ServerMessage.Director, (d: DirectorPayload) => {
  if (d.source === 'llm') { taunts.llm++; taunts.lastLlmAtMs = Date.now() - t0; taunts.lastLlmText = d.taunt; }
  else taunts.fallback++;
});
room.onMessage('*', () => {}); // fx, events, ... are irrelevant here
room.onLeave((code) => { leftWith = code; wake(); });

await new Promise((r) => setTimeout(r, 300));
check('joined a private room', !!room.sessionId, `code ${s()?.roomCode ?? '?'}`);

room.send(ClientMessage.Ready, {});
t0 = Date.now();
await Promise.race([arrived, new Promise((r) => setTimeout(r, WAIT_MS))]);

const phase = s()?.phase;
note('match phase now', `${phase !== undefined ? PHASE_LABEL[phase] ?? phase : '?'}  wave ${s()?.stage ?? '?'}`);
note('director taunts seen', `${taunts.llm} from the LLM, ${taunts.fallback} fallback` +
  (taunts.lastLlmText ? `  last: ${JSON.stringify(taunts.lastLlmText)}` : ''));
if (leftWith !== null) note('room closed early', `code ${leftWith}`);

const clip = firstBoss as Clip | null;
check(`a BossVoice message arrived within ${secs(WAIT_MS)}`, !!clip,
  clip ? `after ${secs(clip.atMs)} (clips so far: ${bossClips})` : taunts.llm === 0
    ? 'no LLM taunt either: is DIRECTOR_URL set and the director reachable?'
    : 'LLM taunts arrived but none was spoken: check VOICE_URL / VOICE_TOKEN and the server logs ([voice])');
if (clip) {
  check('delivered as a Uint8Array (binary message)', clip.isUint8Array);
  check('payload is Ogg ("OggS" magic)', clip.head === 'OggS', `${clip.bytes} bytes, starts ${JSON.stringify(clip.head)}`);
  check('payload is a plausible clip size', clip.bytes > 200 && clip.bytes < 2_000_000, `${clip.bytes} bytes`);
  if (taunts.lastLlmAtMs >= 0 && taunts.lastLlmAtMs <= clip.atMs) {
    note('voice lag after the latest LLM taunt', secs(clip.atMs - taunts.lastLlmAtMs));
  }
  if (process.env.VOICE_SAVE && clip.data) {
    writeFileSync(process.env.VOICE_SAVE, clip.data);
    note('first clip written to', process.env.VOICE_SAVE);
  }
}
const recap = firstRecap as Clip | null;
if (recap) note('bonus: DebriefVoice also arrived', `${recap.bytes} bytes, starts ${JSON.stringify(recap.head)}`);

if (leftWith === null) await room.leave().catch(() => {});
console.log(failures === 0 ? '\nVOICE OK' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
