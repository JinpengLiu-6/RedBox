/** Owner: 09-ai-backend. Director stays silent with no env; debrief always arrives; mock URL decision is applied and clamped. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DIRECTOR, Outcome } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { createDirectorSystem } from '../src/ai/director.js';
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
