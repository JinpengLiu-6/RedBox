/**
 * Boss voice (Gradium TTS via Modal). Silent without env; each new LLM taunt is
 * voiced once within a per-match budget; stale audio is dropped; fresh audio and
 * the recap reach a real colyseus.js client as Uint8Array; failures are logged
 * without the token; redirects are never followed; oversized bodies are never
 * buffered; the recap is not billed when nobody is left to hear it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Client } from 'colyseus.js';
import {
  MatchPhase, Outcome, PROTOCOL_VERSION, ROOM_NAME, ServerMessage, type System,
} from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { HeistRoom, resetForRestart } from '../src/room.js';
import { realSystems } from '../src/systems/index.js';
import { createDebriefSystem } from '../src/ai/debrief.js';
import { createDirectorSystem } from '../src/ai/director.js';
import { createVoiceSystem } from '../src/ai/voice.js';
import {
  MAX_AUDIO_BYTES, VOICE_TAUNT_TIMEOUT_MS, fetchVoice, resetVoiceFailureLog,
} from '../src/ai/voiceClient.js';

const TOKEN = 'test-voice-token-7f3a9c2e';
const ENV_KEYS = ['VOICE_URL', 'VOICE_TOKEN', 'VOICE_MAX_LINES', 'VOICE_RECAP', 'DIRECTOR_URL', 'DEBRIEF_URL'] as const;

/** Fake Ogg Opus: the magic plus bytes unique to the text, so every payload is traceable. */
const oggFor = (text: string) => Buffer.concat([Buffer.from('OggS'), Buffer.from(text, 'utf8'), Buffer.from([0, 1, 254, 255])]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for a localhost response to be read and handled (or dropped). */
const settle = () => sleep(120);

async function until(what: string, cond: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!cond() && Date.now() < deadline) await sleep(5);
  assert.ok(cond(), `timed out waiting for ${what}`);
}

interface VoiceCall { headers: http.IncomingHttpHeaders; body: { text: string; kind: string } }
interface Reply { status: number; body: Buffer | string; contentType?: string; headers?: Record<string, string> }

/** Local stand-in for the Modal voice endpoint. `hold` parks replies until release(text). */
async function mockVoice() {
  const calls: VoiceCall[] = [];
  const held: Array<{ text: string; send: () => void }> = [];
  const m = {
    calls,
    hold: false,
    respond: (c: VoiceCall): Reply => ({ status: 200, body: oggFor(c.body.text), contentType: 'audio/ogg' }),
    url: '',
    texts: () => calls.map((c) => c.body.text),
    release(text: string) {
      const i = held.findIndex((x) => x.text === text);
      assert.ok(i >= 0, `no held reply for ${JSON.stringify(text)}`);
      held.splice(i, 1)[0]!.send();
    },
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const call: VoiceCall = { headers: req.headers, body: JSON.parse(raw) };
      calls.push(call);
      const send = () => {
        const r = m.respond(call);
        res.writeHead(r.status, { 'content-type': r.contentType ?? 'audio/ogg', ...r.headers });
        res.end(r.body);
      };
      if (m.hold) held.push({ text: call.body.text, send }); else send();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  m.url = `http://127.0.0.1:${(server.address() as { port: number }).port}/voice`;
  return m;
}
type MockVoice = Awaited<ReturnType<typeof mockVoice>>;

function setEnv(vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) process.env[k] = v;
}

/** Runs `fn` against a fresh mock with VOICE_URL/VOICE_TOKEN pointing at it (plus extra env). */
async function withVoice(fn: (m: MockVoice) => Promise<void>, extra: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  const m = await mockVoice();
  setEnv({ VOICE_URL: m.url, VOICE_TOKEN: TOKEN, ...extra });
  try { await fn(m); } finally { setEnv({}); await m.close(); }
}

function match(systems: System[] = [createVoiceSystem()]) {
  const h = new Harness(systems);
  h.addPlayer('mage');
  h.start();
  return h;
}

/** What the director system does when an LLM decision lands, then one tick. */
function say(h: Harness, taunt: string, source: 'llm' | 'fallback' = 'llm') {
  const d = h.state.director;
  d.taunt = taunt;
  d.source = source;
  d.updatedAtMs = h.world.now;
  h.tick();
}

const voices = (h: Harness) => h.messages(ServerMessage.BossVoice) as Uint8Array[];
const recaps = (h: Harness) => h.messages(ServerMessage.DebriefVoice) as Uint8Array[];

function assertBytes(actual: unknown, expected: Buffer) {
  assert.ok(actual instanceof Uint8Array, 'payload is a Uint8Array');
  assert.ok(Buffer.from(actual).equals(expected), 'payload equals the bytes served');
}

// ---------------------------------------------------------------------------

test('registered right after the director in production order', () => {
  const ids = realSystems().map((s) => s.id);
  assert.equal(ids.indexOf('voice'), ids.indexOf('director') + 1);
});

test('no env (or only half of it): nothing is ever requested or broadcast', async () => {
  const m = await mockVoice();
  try {
    for (const env of [{}, { VOICE_URL: m.url }, { VOICE_TOKEN: TOKEN }]) {
      setEnv(env);
      const h = match([createVoiceSystem(), createDebriefSystem()]);
      say(h, 'Your crates are mine.');
      h.seconds(2);
      say(h, 'Run, little thieves.');
      h.world.endMatch(Outcome.Defeat);
      await settle();
      assert.equal(m.calls.length, 0, `no call with env ${JSON.stringify(Object.keys(env))}`);
      assert.equal(voices(h).length, 0);
      assert.equal(recaps(h).length, 0);
      assert.equal(h.messages(ServerMessage.Debrief).length, 1, 'the text debrief still arrives');
    }
  } finally {
    setEnv({});
    await m.close();
  }
});

test('an llm taunt is voiced exactly once and broadcast as the served bytes', () => withVoice(async (m) => {
  const h = match();
  const line = 'Your crates are mine, little thieves.';
  say(h, line);
  await until('the voice request', () => m.calls.length === 1);

  const call = m.calls[0]!;
  assert.deepEqual(call.body, { text: line, kind: 'taunt' });
  assert.equal(call.headers['x-voice-token'], TOKEN);
  assert.match(String(call.headers['content-type']), /application\/json/);

  await until('the BossVoice broadcast', () => voices(h).length === 1);
  assertBytes(voices(h)[0], oggFor(line));
  assert.equal(h.state.director.taunt, line, 'the text on screen is untouched');

  // Same taunt: more ticks, a re-issue with a new timestamp, or extra whitespace.
  h.seconds(3);
  say(h, line);
  say(h, `  ${line}  `);
  await settle();
  assert.equal(m.calls.length, 1, 'the same taunt is never voiced twice');
  assert.equal(voices(h).length, 1);
}));

test('fallback and empty taunts are never voiced', () => withVoice(async (m) => {
  const h = match();
  say(h, 'The Goblin King is watching.', 'fallback');
  say(h, '');
  say(h, '   ');
  await settle();
  assert.equal(m.calls.length, 0);

  say(h, 'Now I am awake.');
  await until('the llm taunt to be voiced', () => m.calls.length === 1);
  assert.deepEqual(m.texts(), ['Now I am awake.']);
}));

test('VOICE_MAX_LINES caps calls per match; skipped taunts do not spend the budget', async () => {
  await withVoice(async (m) => {
    const h = match();
    const log = console.log;
    console.log = () => {};
    try {
      say(h, 'A');
      say(h, 'A');
      say(h, 'B', 'fallback');
      say(h, 'C');
      say(h, 'D');
      say(h, 'E');
      await until('two calls', () => m.calls.length === 2);
      await settle();
    } finally { console.log = log; }
    assert.deepEqual(m.texts(), ['A', 'C']);

    // A new match gets a fresh budget.
    const next = match();
    say(next, 'F');
    await until('the next match to be voiced', () => m.calls.length === 3);
  }, { VOICE_MAX_LINES: '2' });

  await withVoice(async (m) => {
    const h = match();
    const log = console.log;
    console.log = () => {};
    try {
      for (let i = 0; i < 25; i++) say(h, `line ${i}`);
      await until('the default budget', () => m.calls.length === 20);
      await settle();
    } finally { console.log = log; }
    assert.equal(m.calls.length, 20, 'default budget is 20 lines');
  });
});

test('stale audio is dropped: a newer taunt replaced it', () => withVoice(async (m) => {
  m.hold = true;
  const h = match();
  say(h, 'First.');
  say(h, 'Second.');
  await until('both requests', () => m.calls.length === 2);

  m.release('First.');
  await settle();
  assert.equal(voices(h).length, 0, 'the older line never plays');

  m.release('Second.');
  await until('the newest line', () => voices(h).length === 1);
  await settle();
  assert.equal(voices(h).length, 1);
  assertBytes(voices(h)[0], oggFor('Second.'));

  // The director comes back to an earlier line: only the newest call may play,
  // even though the older reply carries the text now on screen.
  say(h, 'Again.');
  say(h, 'Other.');
  say(h, 'Again.');
  await until('three more requests', () => m.calls.length === 5);
  m.release('Again.');
  m.release('Other.');
  await settle();
  assert.equal(voices(h).length, 1, 'superseded replies never play');
  m.release('Again.');
  await until('the newest reply', () => voices(h).length === 2);
  await settle();
  assert.equal(voices(h).length, 2);
}));

test('stale audio is dropped: a newer taunt is on screen even though it was not voiced', () => withVoice(async (m) => {
  m.hold = true;
  const h = match();
  const log = console.log;
  console.log = () => {};
  try {
    say(h, 'Only one.');
    say(h, 'Over budget.');
  } finally { console.log = log; }
  await until('the one request', () => m.calls.length === 1);
  m.release('Only one.');
  await settle();
  assert.equal(m.calls.length, 1);
  assert.equal(voices(h).length, 0, 'audio must match the text players are reading');
}, { VOICE_MAX_LINES: '1' }));

test('stale audio is dropped: it arrived more than 9 s (match time) after its taunt', () => withVoice(async (m) => {
  m.hold = true;
  const h = match();
  say(h, 'Slow but in time.');
  await until('the first request', () => m.calls.length === 1);
  h.seconds(8.5);
  m.release('Slow but in time.');
  await until('the in-time line', () => voices(h).length === 1);

  say(h, 'Too late.');
  await until('the second request', () => m.calls.length === 2);
  h.seconds(9.5);
  m.release('Too late.');
  await settle();
  assert.equal(voices(h).length, 1, 'the late line is dropped');
}));

test('stale audio is dropped: the wave changed or the match ended', () => withVoice(async (m) => {
  m.hold = true;

  // Next wave already playing (and well within 9 s).
  const a = match();
  say(a, 'Wave one line.');
  await until('request a', () => m.calls.length === 1);
  a.state.boxesDelivered = a.state.boxesRequired;
  a.tick();
  assert.equal(a.state.phase, MatchPhase.WaveTransition);
  a.seconds(4.2);
  assert.equal(a.state.phase, MatchPhase.Playing);
  assert.equal(a.state.stage, 2);
  m.release('Wave one line.');

  // Still in the transition between waves.
  const b = match();
  say(b, 'Transition line.');
  await until('request b', () => m.calls.length === 2);
  b.state.boxesDelivered = b.state.boxesRequired;
  b.tick();
  assert.equal(b.state.phase, MatchPhase.WaveTransition);
  m.release('Transition line.');

  // Match over, and the room (same state object) is already back in play after a
  // restart with the same line on screen: the ended match's audio still never plays.
  const c = match();
  say(c, 'Last words.');
  await until('request c', () => m.calls.length === 3);
  c.world.endMatch(Outcome.Victory);
  c.state.phase = MatchPhase.Playing;
  m.release('Last words.');

  await settle();
  assert.equal(voices(a).length, 0, 'wave changed');
  assert.equal(voices(b).length, 0, 'wave transition');
  assert.equal(voices(c).length, 0, 'match ended');
}));

test('with the real director: its llm taunt is the one voiced', async () => {
  const director = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ focus: null, taunt: 'Crates? Mine.', reasoning: 'r' }));
    });
  });
  await new Promise<void>((r) => director.listen(0, '127.0.0.1', r));
  const port = (director.address() as { port: number }).port;
  try {
    await withVoice(async (m) => {
      const h = match([createDirectorSystem(), createVoiceSystem()]);
      h.seconds(8.1);
      await until('the director decision and its voice call', () => {
        h.tick();
        return m.calls.length === 1;
      });
      assert.deepEqual(m.calls[0]!.body, { text: 'Crates? Mine.', kind: 'taunt' });
      await until('the BossVoice broadcast', () => voices(h).length === 1);
      assertBytes(voices(h)[0], oggFor('Crates? Mine.'));
    }, { DIRECTOR_URL: `http://127.0.0.1:${port}/director` });
  } finally {
    await new Promise<void>((r) => director.close(() => r()));
  }
});

test('recap: spoken after the debrief text, skipped with VOICE_RECAP=0, dropped after a restart', async () => {
  await withVoice(async (m) => {
    const h = match([createVoiceSystem(), createDebriefSystem()]);
    h.world.emit({ type: 'box_delivered', atMs: h.world.now, playerId: 'mage' });
    h.world.endMatch(Outcome.Defeat);
    const [debrief] = h.messages(ServerMessage.Debrief);
    assert.ok(debrief, 'text debrief first');

    await until('the recap request', () => m.calls.length === 1);
    assert.deepEqual(m.calls[0]!.body, { text: debrief.summary, kind: 'recap' });
    assert.equal(m.calls[0]!.headers['x-voice-token'], TOKEN);
    await until('the DebriefVoice broadcast', () => recaps(h).length === 1);
    assertBytes(recaps(h)[0], oggFor(debrief.summary));
    const order = h.sent.map((s) => s.type);
    assert.ok(order.indexOf(ServerMessage.Debrief) < order.indexOf(ServerMessage.DebriefVoice));

    // Party pressed restart while the recap was being synthesised.
    m.hold = true;
    const r = match([createDebriefSystem()]);
    r.world.endMatch(Outcome.Victory);
    await until('the second recap request', () => m.calls.length === 2);
    r.state.phase = MatchPhase.Lobby;
    m.release(r.messages(ServerMessage.Debrief)[0].summary);
    await settle();
    assert.equal(recaps(r).length, 0);
  });

  await withVoice(async (m) => {
    const h = match([createVoiceSystem(), createDebriefSystem()]);
    h.world.endMatch(Outcome.Defeat);
    await settle();
    assert.equal(h.messages(ServerMessage.Debrief).length, 1);
    assert.equal(m.calls.length, 0);
    assert.equal(recaps(h).length, 0);
  }, { VOICE_RECAP: '0' });

  // The LLM debrief path speaks the LLM summary.
  const llm = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ summary: 'The King kept his gold.', highlights: [] }));
    });
  });
  await new Promise<void>((r) => llm.listen(0, '127.0.0.1', r));
  try {
    await withVoice(async (m) => {
      const h = match([createDebriefSystem()]);
      h.world.endMatch(Outcome.Timeout);
      await until('the LLM recap to be voiced', () => recaps(h).length === 1);
      assert.deepEqual(m.calls[0]!.body, { text: 'The King kept his gold.', kind: 'recap' });
      assertBytes(recaps(h)[0], oggFor('The King kept his gold.'));
    }, { DEBRIEF_URL: `http://127.0.0.1:${(llm.address() as { port: number }).port}/debrief` });
  } finally {
    await new Promise<void>((r) => llm.close(() => r()));
  }
});

test('failures are logged (first, then every 10th) without the token, and nothing plays', () => withVoice(async (m) => {
  const warn = console.warn;
  const warns: string[] = [];
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    // Upstream error whose body even echoes the token back.
    resetVoiceFailureLog();
    m.respond = () => ({ status: 401, body: `{"detail":"bad token ${TOKEN}"}`, contentType: 'application/json' });
    const h = match();
    say(h, 'Denied.');
    await until('the first failure log', () => warns.length === 1);
    assert.match(warns[0]!, /^\[voice\] taunt call failed \(1 so far\): HTTP 401/);

    // 200 but not audio.
    resetVoiceFailureLog();
    m.respond = () => ({ status: 200, body: '<html>oops</html>', contentType: 'text/html' });
    say(h, 'Not audio.');
    await until('the non-Ogg failure log', () => warns.length === 2);
    assert.match(warns[1]!, /not Ogg audio/);

    // Nobody listening at all.
    resetVoiceFailureLog();
    process.env.VOICE_URL = 'http://127.0.0.1:1/voice';
    say(h, 'Unreachable.');
    await until('the network failure log', () => warns.length === 3);
    assert.match(warns[2]!, /\[voice\] taunt call failed/);
    process.env.VOICE_URL = m.url;

    // Throttled: 10 more failures log only the 10th.
    resetVoiceFailureLog();
    m.respond = () => ({ status: 502, body: '{"detail":"upstream failed"}', contentType: 'application/json' });
    const t = match();
    const before = m.calls.length;
    for (let i = 0; i < 10; i++) say(t, `fail ${i}`);
    await until('ten failed calls', () => m.calls.length === before + 10);
    await settle();
    assert.equal(warns.length, 5, `first and 10th only: ${JSON.stringify(warns.slice(3))}`);
    assert.match(warns[3]!, /\(1 so far\): HTTP 502/);
    assert.match(warns[4]!, /\(10 so far\)/);

    for (const w of warns) assert.ok(!w.includes(TOKEN), `token leaked into: ${w}`);
    assert.equal(voices(h).length + voices(t).length, 0);
  } finally {
    console.warn = warn;
  }
}));

/** Collects console.warn lines while `fn` runs. */
async function captureWarns(fn: (warns: string[]) => Promise<void>): Promise<string[]> {
  const warn = console.warn;
  const warns: string[] = [];
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try { await fn(warns); } finally { console.warn = warn; }
  return warns;
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

test('an error body echoing the token across the log cut never leaks any of it', () => withVoice(async (m) => {
  // The logged detail is cut at 160 chars; put the token right across that cut.
  const pads = Array.from({ length: 40 }, (_, i) => 125 + i);
  const warns = await captureWarns(async () => {
    for (const pad of pads) {
      m.respond = () => ({ status: 401, body: `${'x'.repeat(pad)} header was ${TOKEN}`, contentType: 'text/plain' });
      resetVoiceFailureLog();
      assert.equal(await fetchVoice('taunt', 'hi', VOICE_TAUNT_TIMEOUT_MS), null);
    }
  });
  assert.equal(warns.length, pads.length);
  for (const w of warns) {
    assert.match(w, /HTTP 401 x+/);
    assert.ok(!w.includes(TOKEN.slice(0, 4)), `part of the token leaked into: ${w}`);
  }
}));

test('a redirect is never followed, so the token and text never reach another host', async () => {
  const stolen: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const thief = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      stolen.push({ headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'audio/ogg' });
      res.end(oggFor('stolen'));
    });
  });
  const thiefUrl = `${await listen(thief)}/steal`;
  try {
    await withVoice(async (m) => {
      const statuses = [301, 302, 303, 307, 308];
      const warns = await captureWarns(async () => {
        for (const status of statuses) {
          m.respond = () => ({ status, body: '', headers: { location: thiefUrl } });
          resetVoiceFailureLog();
          assert.equal(await fetchVoice('taunt', 'hello', VOICE_TAUNT_TIMEOUT_MS), null);
        }
        // Through the system too: nothing plays.
        m.respond = () => ({ status: 307, body: '', headers: { location: thiefUrl } });
        const h = match();
        say(h, 'Follow me.');
        await until('the voice request', () => m.calls.length === statuses.length + 1);
        await settle();
        assert.equal(voices(h).length, 0);
      });
      statuses.forEach((status, i) => assert.match(warns[i]!, new RegExp(`HTTP ${status} redirect not followed`)));
    });
    assert.deepEqual(stolen, [], 'the redirect target was contacted');
  } finally {
    thief.closeAllConnections();
    await new Promise<void>((r) => thief.close(() => r()));
  }
});

test('recap: never requested when nobody will hear it (restart or everyone left before the debrief resolved)', async () => {
  // A slow LLM debrief whose replies are released by hand.
  const pending: Array<() => void> = [];
  const llm = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => pending.push(() => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ summary: `The King kept his gold. ${'Gold. '.repeat(90)}`, highlights: [] }));
    }));
  });
  const debriefUrl = `${await listen(llm)}/debrief`;
  try {
    await withVoice(async (m) => {
      // Party pressed restart while the LLM was still writing the recap.
      const r = match([createDebriefSystem()]);
      r.world.endMatch(Outcome.Defeat);
      await until('the debrief request', () => pending.length === 1);
      resetForRestart(r.state);
      assert.equal(r.state.phase, MatchPhase.Lobby);
      pending.shift()!();
      await until('the debrief text', () => r.messages(ServerMessage.Debrief).length === 1);

      // Every player left the end screen (onLeave marks them disconnected bots).
      const g = match([createDebriefSystem()]);
      g.world.endMatch(Outcome.Timeout);
      await until('the debrief request', () => pending.length === 1);
      for (const p of g.state.players.values()) { p.connected = false; p.isBot = true; }
      pending.shift()!();
      await until('the debrief text', () => g.messages(ServerMessage.Debrief).length === 1);

      await settle();
      assert.equal(m.calls.length, 0, 'no billed recap call');
      assert.equal(recaps(r).length + recaps(g).length, 0);

      // Control: someone is still on the end screen, so it is spoken.
      const k = match([createDebriefSystem()]);
      k.world.endMatch(Outcome.Victory);
      await until('the debrief request', () => pending.length === 1);
      pending.shift()!();
      await until('the recap', () => recaps(k).length === 1);
      assert.equal(m.calls.length, 1);
    }, { DEBRIEF_URL: debriefUrl });
  } finally {
    llm.closeAllConnections();
    await new Promise<void>((r) => llm.close(() => r()));
  }
});

/** 200 with an Ogg-looking body of `total` bytes, streamed with backpressure; counts what it managed to write. */
async function bigAudio(total: number, declareLength: boolean) {
  const stats = { written: 0, closed: false, sent: [] as Buffer[] };
  const chunk = Buffer.alloc(64 * 1024, 7);
  chunk.write('OggS', 0);
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'audio/ogg', ...(declareLength ? { 'content-length': String(total) } : {}) });
      res.on('close', () => { stats.closed = true; });
      const pump = () => {
        while (!stats.closed && stats.written < total) {
          const c = chunk.subarray(0, Math.min(chunk.length, total - stats.written));
          stats.written += c.length;
          stats.sent.push(c);
          if (!res.write(c)) { res.once('drain', pump); return; }
        }
        if (!stats.closed) res.end();
      };
      pump();
    });
  });
  const url = await listen(server);
  return {
    url,
    stats,
    close: () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}

test('oversized audio is refused without buffering it, whether its length is declared or streamed', async () => {
  const MiB = 1024 * 1024;
  for (const declareLength of [true, false]) {
    const big = await bigAudio(64 * MiB, declareLength);
    try {
      const warns = await captureWarns(async () => {
        resetVoiceFailureLog();
        assert.equal(await fetchVoice('taunt', 'hi', VOICE_TAUNT_TIMEOUT_MS, { url: big.url, token: TOKEN }), null);
      });
      assert.equal(warns.length, 1);
      assert.match(warns[0]!, /audio too large/);
      await until('the connection to be dropped', () => big.stats.closed);
      assert.ok(big.stats.written < 16 * MiB,
        `read ${big.stats.written} bytes of a 64 MiB body (length ${declareLength ? 'declared' : 'streamed'})`);
    } finally {
      await big.close();
    }
  }

  // Exactly at the cap, in many chunks: delivered intact.
  for (const declareLength of [true, false]) {
    const ok = await bigAudio(MAX_AUDIO_BYTES, declareLength);
    try {
      const audio = await fetchVoice('recap', 'hi', VOICE_TAUNT_TIMEOUT_MS, { url: ok.url, token: TOKEN });
      assert.ok(audio, 'audio at the cap is accepted');
      assert.equal(audio.length, MAX_AUDIO_BYTES);
      assert.ok(Buffer.from(audio).equals(Buffer.concat(ok.stats.sent)));
    } finally {
      await ok.close();
    }
  }
});

test('a real colyseus.js client receives BossVoice and DebriefVoice as Uint8Array', async () => {
  const rooms: HeistRoom[] = [];
  class VoiceRoom extends HeistRoom {
    override onCreate(options: { roomCode?: string; private?: boolean } = {}) {
      super.onCreate(options);
      rooms.push(this);
    }
  }
  const factory = HeistRoom.systemFactory;
  HeistRoom.systemFactory = () => [createVoiceSystem(), createDebriefSystem()];

  const httpServer = http.createServer();
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
    greet: false,
    gracefullyShutdown: false,
  });
  gameServer.define(ROOM_NAME, VoiceRoom);
  await gameServer.listen(0, '127.0.0.1');
  const port = (httpServer.address() as { port: number }).port;

  try {
    await withVoice(async (m) => {
      const client = new Client(`ws://127.0.0.1:${port}`);
      const room = await client.joinOrCreate(ROOM_NAME, { protocolVersion: PROTOCOL_VERSION, name: 'ears', classId: 'mage' });
      const got: Record<string, unknown[]> = { [ServerMessage.BossVoice]: [], [ServerMessage.DebriefVoice]: [], [ServerMessage.Debrief]: [] };
      for (const type of Object.keys(got)) room.onMessage(type, (msg: unknown) => got[type]!.push(msg));
      for (const type of [ServerMessage.Event, ServerMessage.Fx, ServerMessage.Director]) room.onMessage(type, () => {});

      await until('the room to exist', () => rooms.length === 1);
      const r = rooms[0]!;
      r.world.start();
      const d = r.state.director;
      d.taunt = 'I hear you breathing.';
      d.source = 'llm';
      d.updatedAtMs = r.world.now;

      await until('BossVoice on the client', () => got[ServerMessage.BossVoice]!.length === 1);
      assert.deepEqual(m.calls[0]!.body, { text: 'I hear you breathing.', kind: 'taunt' });
      assertBytes(got[ServerMessage.BossVoice]![0], oggFor('I hear you breathing.'));

      r.world.endMatch(Outcome.Defeat);
      await until('DebriefVoice on the client', () => got[ServerMessage.DebriefVoice]!.length === 1);
      const summary = (got[ServerMessage.Debrief]![0] as { summary: string }).summary;
      assertBytes(got[ServerMessage.DebriefVoice]![0], oggFor(summary));

      await room.leave();
    });
  } finally {
    HeistRoom.systemFactory = factory;
    await gameServer.gracefullyShutdown(false);
  }
});
