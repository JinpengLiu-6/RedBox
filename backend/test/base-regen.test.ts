/**
 * Base regeneration (lives.ts): the base zone is the only place a hero heals.
 * Before it existed a hurt hero stayed hurt for the rest of the wave, and a
 * retreating bot could idle at base forever waiting for HP that never came.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxMark, BoxState, CLASS_IDS, MAP, PLAYER, tileCentre } from '@redbox/shared';
import { Box } from '@redbox/shared/schema';
import { Harness } from '../src/sim/harness.js';
import { BASE_REGEN_PCT_PER_SEC, BASE_REGEN_PULSE_MS, createLivesSystem } from '../src/systems/lives.js';

const BASE = { x: MAP.BASE.x, y: MAP.BASE.y };

function heals(h: Harness, x: number, y: number) {
  return h.messages('fx').filter((f) => f.kind === 'heal' && f.x === x && f.y === y);
}

test('a hurt hero standing in the base heals BASE_REGEN_PCT_PER_SEC of max hp per second, up to full', () => {
  const h = new Harness([createLivesSystem()]);
  const p = h.addPlayer('troll', BASE);
  h.start();
  p.hp = Math.floor(p.maxHp * 0.2);
  const start = p.hp;

  h.seconds(2);
  const expected = p.maxHp * BASE_REGEN_PCT_PER_SEC * 2;
  const pulse = p.maxHp * BASE_REGEN_PCT_PER_SEC * (BASE_REGEN_PULSE_MS / 1000);
  assert.ok(Math.abs(p.hp - start - expected) <= pulse + 1,
    `healed ${p.hp - start} in 2 s, expected about ${expected.toFixed(0)}`);

  h.seconds(1 / BASE_REGEN_PCT_PER_SEC);
  assert.equal(p.hp, p.maxHp, 'topped up, never past max');
  h.seconds(2);
  assert.equal(p.hp, p.maxHp);
});

test('regen is paid in pulses: about one heal fx per hero per pulse, not one per tick', () => {
  const h = new Harness([createLivesSystem()]);
  const p = h.addPlayer('troll', BASE);
  h.start();
  p.hp = 1;
  h.seconds(5);
  const n = heals(h, p.x, p.y).length;
  const pulses = 5000 / BASE_REGEN_PULSE_MS;
  assert.ok(n >= pulses - 1 && n <= pulses + 1, `${n} heal fx in 5 s, ~${pulses} pulses expected`);
  assert.equal(heals(h, p.x, p.y).reduce((a, f) => a + f.value, 0), p.hp - 1, 'fx values add up to the hp healed');
});

test('no regen outside the base zone, and no fx for a hero already at full hp', () => {
  const h = new Harness([createLivesSystem()]);
  const out = h.addPlayer('troll', { id: 'out', x: BASE.x + MAP.BASE.radius + 20, y: BASE.y });
  const full = h.addPlayer('mage', { id: 'full', ...BASE });
  h.start();
  out.hp = 100;
  h.seconds(5);
  assert.equal(out.hp, 100, 'just outside the zone: no healing');
  assert.equal(full.hp, full.maxHp);
  assert.equal(h.messages('fx').filter((f) => f.kind === 'heal').length, 0, 'nothing to heal, no fx');

  // Walking into the zone starts it; walking back out stops it.
  h.place(out.id, BASE.x, BASE.y);
  h.seconds(1);
  assert.ok(out.hp > 100, 'heals once inside');
  h.place(out.id, BASE.x + MAP.BASE.radius + 20, BASE.y);
  h.tick();
  const left = out.hp;
  h.seconds(3);
  assert.equal(out.hp, left, 'stops on leaving');
});

test('death wins over regen: a hero at 0 hp in the base is downed, not healed', () => {
  const h = new Harness([createLivesSystem()]);
  const p = h.addPlayer('dwarf', BASE);
  h.start();
  h.seconds(BASE_REGEN_PULSE_MS / 1000 - 0.05);   // land the kill on a pulse tick
  h.world.damage(p.id, p.hp, { sourceId: 'boss' });
  h.tick();
  assert.equal(p.alive, false);
  assert.equal(p.hp, 0);
  assert.equal(p.lives, PLAYER.LIVES - 1);
  h.seconds(PLAYER.RESPAWN_MS / 1000 - 0.5);
  assert.equal(p.hp, 0, 'a downed hero does not heal while waiting to respawn');
  assert.equal(h.messages('fx').filter((f) => f.kind === 'heal').length, 0);
});

test('full stack: bots at 20% hp collect a dropped real crate near base and recover at home', () => {
  const h = Harness.full();
  for (const c of CLASS_IDS) h.addPlayer(c, { id: 'bot_' + c, bot: true });
  h.start();
  // Quiet board: no crates, towers, boss or goblins to fight.
  for (const b of [...h.state.boxes.values()]) h.world.removeEntity('box', b.id);
  for (const t of h.state.crystals.values()) t.hp = 0;
  h.state.boss.hp = 0;
  h.state.creeps.clear();
  h.tick();
  const bots = [...h.state.players.values()];
  for (const p of bots) p.hp = Math.floor(p.maxHp * 0.2);

  const pos = tileCentre(10, 26);
  const b = new Box();
  b.id = 'dropped'; b.x = pos.x; b.y = pos.y; b.state = BoxState.Dropped; b.mark = BoxMark.Real;
  h.world.addBox(b, { isReal: true });

  h.seconds(10);
  assert.equal(h.events('box_picked').length, 1, 'the dropped crate was re-collected');
  assert.equal(h.events('box_delivered').length, 1, 'and delivered');

  h.seconds(15);
  for (const p of bots) {
    assert.ok(p.alive, `${p.id} alive`);
    assert.ok(h.world.distance(p, BASE) <= MAP.BASE.radius, `${p.id} waits at base`);
    assert.equal(p.hp, p.maxHp, `${p.id} healed at base (${p.hp}/${p.maxHp})`);
  }
});
