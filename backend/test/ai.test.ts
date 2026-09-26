/** Owner: 09-ai-backend. Director stays silent with no env; debrief always arrives; mock URL decision is applied and clamped. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DIRECTOR, Outcome, type DirectorSnapshot } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { createDirectorSystem } from '../src/ai/director.js';
import { createDebriefSystem } from '../src/ai/debrief.js';

/**
 * Real-time bound for one localhost round trip. It only exists so a genuinely
 * broken director fails with a message instead of hanging; it is longer than
 * the director's own abort (TIMEOUT_MS), so machine load alone can't trip it.
 * The first fetch in a process also lazy-loads undici, which is slow under load.
 */
const ROUND_TRIP_BOUND_MS = DIRECTOR.TIMEOUT_MS + 4_000;
/** The director sends its first snapshot this far into the match. */
const FIRST_CALL_AT_MS = 8_000;

/** Waits for an out-of-band HTTP round trip instead of guessing a fixed delay. */
async function until(what: string, cond: () => boolean, timeoutMs = ROUND_TRIP_BOUND_MS) {
  const deadline = Date.now() + timeoutMs;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
  assert.ok(cond(), `timed out after ${timeoutMs} ms waiting for ${what}`);
}

/** One request received by the mock; its response is held until the test sends it. */
interface HeldCall { snap: DirectorSnapshot; respond(): Promise<void>; }

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
  // Timing is driven by the test, not by how fast this machine is: each call
  // records the game time it was sent at (snapshot.elapsedMs) and its response
  // is held until the test releases it.
  const calls: HeldCall[] = [];
  const decision = JSON.stringify({
    focus: 'mage',
    threatBias: { mage: 99, troll: 0.01 },
    taunt: '  ' + 'X'.repeat(200),
    reasoning: 'squish the mage',
  });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({
        snap: JSON.parse(body) as DirectorSnapshot,
        respond: () => new Promise<void>((r) => {
          if (res.writableEnded) { r(); return; }
          res.setHeader('content-type', 'application/json');
          res.end(decision, () => r());
        }),
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.DIRECTOR_URL = `http://127.0.0.1:${port}/director`;

  try {
    const h = new Harness([createDirectorSystem()]);
    h.addPlayer('mage'); h.addPlayer('troll');
    h.start();
    h.seconds(8.1);
    await until('the first director request', () => calls.length >= 1);
    const first = calls[0].snap;
    assert.equal(first.elapsedMs, FIRST_CALL_AT_MS, 'first call is at 8s, not before');
    assert.equal(first.wave, 1);
    assert.ok(Array.isArray(first.players) && first.players.length === 2);

    // In flight: the tick never waits and nothing is applied, however long the LLM takes.
    h.seconds(1);
    assert.equal(h.messages('director').length, 0, 'nothing applied while the call is in flight');

    await calls[0].respond();
    assert.equal(h.messages('director').length, 0, 'nothing applied until the next tick');

    // The answer lands between ticks, so tick until the system picks it up.
    await until('the decision to be applied', () => {
      h.tick();
      return h.messages('director').length > 0;
    });
    const appliedAtMs = h.state.director.updatedAtMs;
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
    await until('the second director request', () => calls.length >= 2);
    // Repeats INTERVAL_MS after the previous call was sent: exactly then, or on
    // the apply tick if that answer was picked up later than that.
    assert.equal(
      calls[1].snap.elapsedMs,
      Math.max(first.elapsedMs + DIRECTOR.INTERVAL_MS, appliedAtMs),
      'repeats every INTERVAL_MS',
    );
  } finally {
    // Release anything still held so the server can close.
    for (const c of calls) await c.respond();
    delete process.env.DIRECTOR_URL;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
