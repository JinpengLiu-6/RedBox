/** Owner: 09-ai-backend. Director stays silent with no env; debrief always arrives; mock URL decision is applied and clamped. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DIRECTOR, Outcome } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { createDirectorSystem, validateDecision } from '../src/ai/director.js';
import { createDebriefSystem } from '../src/ai/debrief.js';

const flush = () => new Promise<void>((r) => setTimeout(r, 30));

test('no env: director never speaks, state untouched; ending broadcasts a local debrief', () => {
  delete process.env.DIRECTOR_URL;
  delete process.env.DEBRIEF_URL;
  const h = new Harness([createDirectorSystem(), createDebriefSystem()]);
  const p = h.addPlayer('dwarf');
  h.start();
  h.world.emit({ type: 'box_delivered', atMs: h.world.now, playerId: p.id });
  h.seconds(30);

  assert.equal(h.messages('director').length, 0);
  assert.equal(h.events('director_decision').length, 0);
  assert.equal(h.state.director.source, '');
  assert.equal(h.state.director.focusClassIndex, -1);
  assert.equal(h.world.threatBias('dwarf'), 1);

  h.world.endMatch(Outcome.Defeat);
  const debriefs = h.messages('debrief');
  assert.equal(debriefs.length, 1);
  assert.match(debriefs[0].summary, /Defeat/);
  assert.match(debriefs[0].summary, /1 crate/);
  assert.equal(debriefs[0].mvpPlayerId, p.id);
  assert.ok(debriefs[0].highlights.length > 0);
});

test('a malformed decision is dropped whole, a sane one is normalised', () => {
  for (const bad of [
    null, 'nope', 42,
    { focus: 'necromancer' },
    { threatBias: { mage: Number.NaN } },
    { threatBias: { mage: -2 } },
    { threatBias: { mage: 0 } },
    { threatBias: { wizard: 1.5 } },
    { threatBias: 'heavy' },
    { taunt: 17 },
    { reasoning: { why: 'no' } },
  ]) {
    assert.equal(validateDecision(bad), null, `rejected: ${JSON.stringify(bad)}`);
  }

  const ok = validateDecision({ threatBias: { dwarf: 1.4 }, reasoning: 'R'.repeat(500) });
  assert.ok(ok);
  assert.equal(ok.focus, null, 'focus is optional');
  assert.deepEqual(ok.threatBias, { dwarf: 1.4 });
  assert.equal(ok.taunt, '');
  assert.ok(ok.reasoning.length <= 240 && ok.reasoning.length > 0, 'reasoning is capped');
});

test('a decision that comes back after the wave moved on is discarded', async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ focus: 'mage', threatBias: { mage: 1.8 } }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.DIRECTOR_URL = `http://127.0.0.1:${port}/director`;

  try {
    const h = new Harness([createDirectorSystem()]);
    h.addPlayer('mage');
    h.start();
    h.seconds(8.1);
    await flush();
    h.state.stage = 2;                    // the wave rolled over while the call was out
    h.tick();
    assert.equal(h.messages('director').length, 0, 'stale decision ignored');
    assert.equal(h.world.threatBias('mage'), 1, 'threat untouched');
  } finally {
    delete process.env.DIRECTOR_URL;
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('DEBRIEF_URL: a valid recap is broadcast, a bogus one falls back to the local recap', async () => {
  let reply: unknown = null;
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.DEBRIEF_URL = `http://127.0.0.1:${port}/debrief`;
  delete process.env.DIRECTOR_URL;

  try {
    reply = {
      summary: '  The heist held together.  ',
      highlights: ['Clutch revive.', '', 7, 'H'.repeat(500), 'a', 'b', 'c', 'd', 'e', 'f'],
      mvpPlayerId: 'mage',
    };
    const h = new Harness([createDebriefSystem()]);
    h.addPlayer('mage');
    h.start();
    h.world.endMatch(Outcome.Victory);
    await flush();
    const [remote] = h.messages('debrief');
    assert.equal(remote.summary, 'The heist held together.');
    assert.equal(remote.mvpPlayerId, 'mage');
    assert.ok(remote.highlights.length <= 6, 'highlight list capped');
    assert.ok(remote.highlights.every((s: string) => s.length > 0 && s.length <= 120));

    reply = { summary: 'Great run!', mvpPlayerId: 'ghost' };   // unknown player
    const h2 = new Harness([createDebriefSystem()]);
    h2.addPlayer('mage');
    h2.start();
    h2.world.endMatch(Outcome.Defeat);
    await flush();
    const [local] = h2.messages('debrief');
    assert.match(local.summary, /Defeat/, 'fell back to the local recap');
  } finally {
    delete process.env.DEBRIEF_URL;
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('with a mock DIRECTOR_URL: a decision is applied on a later tick and clamped', async () => {
  let calls = 0;
  const server = http.createServer((req, res) => {
    calls++;
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const snap = JSON.parse(body);
      assert.equal(snap.wave, 1);
      assert.ok(Array.isArray(snap.players) && snap.players.length === 2);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        focus: 'mage',
        threatBias: { mage: 99, troll: 0.01 },
        taunt: '  ' + 'X'.repeat(200),
        reasoning: 'squish the mage',
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.DIRECTOR_URL = `http://127.0.0.1:${port}/director`;

  try {
    const h = new Harness([createDirectorSystem()]);
    h.addPlayer('mage'); h.addPlayer('troll');
    h.start();
    h.seconds(7.9);
    assert.equal(calls, 0, 'first call is at 8s');
    h.seconds(0.2);
    await flush();
    assert.equal(calls, 1);
    assert.equal(h.messages('director').length, 0, 'nothing applied until the next tick');

    h.tick();
    const msgs = h.messages('director');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].source, 'llm');
    assert.equal(msgs[0].focus, 'mage');
    assert.equal(msgs[0].taunt.length, DIRECTOR.TAUNT_MAX_CHARS);
    assert.equal(h.state.director.source, 'llm');
    assert.equal(h.state.director.focusClassIndex, 0);
    assert.equal(h.state.director.reasoning, 'squish the mage');
    assert.equal(h.world.threatBias('mage'), DIRECTOR.MAX_THREAT_BIAS);
    assert.equal(h.world.threatBias('troll'), DIRECTOR.MIN_THREAT_BIAS);
    assert.equal(h.world.threatBias('dwarf'), 1);
    assert.equal(h.events('director_decision').length, 1);

    h.seconds(DIRECTOR.INTERVAL_MS / 1000 + 0.1);
    await flush();
    assert.equal(calls, 2, 'repeats every INTERVAL_MS');
  } finally {
    delete process.env.DIRECTOR_URL;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
