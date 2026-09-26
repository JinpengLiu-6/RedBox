/** Lives, respawn, revival, defeat: see backend/tasks/06-lives.md */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP, PLAYER, MatchPhase, Outcome, spotsOf } from '@redbox/shared';
import { Harness } from '../src/sim/harness.js';
import { createLivesSystem } from '../src/systems/lives.js';
import { createBoxesSystem } from '../src/systems/boxes.js';

const BASE = { x: MAP.BASE.x, y: MAP.BASE.y };

function kill(h: Harness, id: string) {
  const p = h.state.players.get(id)!;
  h.world.damage(id, p.hp, { sourceId: 'boss' });
}

/** Burn every life of a hero: kill, let the respawn fire, repeat. */
function exhaust(h: Harness, id: string) {
  const p = h.state.players.get(id)!;
  while (p.lives > 0) {
    if (!p.alive) h.seconds(PLAYER.RESPAWN_MS / 1000);
    kill(h, id);
    h.tick();
  }
}

test('hp 0 -> downed, one life lost, respawns at base after RESPAWN_MS', () => {
  const h = new Harness([createLivesSystem()]);
  const p = h.addPlayer('dwarf', { x: 500, y: 400 });
  h.start();
  h.world.addModifier(p.id, 'speedMult', 0.5, 60_000);
  h.world.addThreat(p.id, 100);
  h.move(p.id, 1, 0);

  kill(h, p.id);
  assert.equal(p.alive, true, 'damage() alone never kills: lives owns the transition');
  h.tick();

  assert.equal(p.alive, false);
  assert.equal(p.lives, PLAYER.LIVES - 1);
  assert.equal(p.moving, false);
  assert.equal(h.world.threatOf(p.id), 0, 'threat cleared');
  assert.equal(h.world.modifier(p.id, 'speedMult', 1), 1, 'modifiers cleared');
  assert.equal(h.events('player_died').length, 1);
  assert.equal(h.messages('fx').filter((f) => f.kind === 'death').length, 1);
  const diedAt = h.world.now;
  assert.equal(p.respawnAtMs, diedAt + PLAYER.RESPAWN_MS);

  // Still down just before the timer, up right after.
  h.seconds((PLAYER.RESPAWN_MS - 200) / 1000);
  assert.equal(p.alive, false, 'not up early');
  assert.equal(h.events('player_respawned').length, 0);
  h.seconds(0.3);

  assert.equal(p.alive, true);
  assert.equal(p.hp, p.maxHp);
  assert.equal(p.respawnAtMs, 0);
  assert.ok(h.world.walkable(p.x, p.y), 'respawned on walkable ground');
  assert.ok(h.world.distance(p, BASE) <= MAP.BASE.radius, `at base, ${h.world.distance(p, BASE).toFixed(0)}px away`);
  const respawned = h.events('player_respawned');
  assert.equal(respawned.length, 1);
  assert.equal(respawned[0]!.playerId, p.id);
});

test('death is detected once; a second hit on a downed hero costs nothing', () => {
  const h = new Harness([createLivesSystem()]);
  const p = h.addPlayer('mage', { x: 500, y: 400 });
  h.start();
  kill(h, p.id);
  h.tick();
  assert.equal(p.lives, PLAYER.LIVES - 1);
  h.world.damage(p.id, 50, { sourceId: 'boss' });
  h.tick(3);
  assert.equal(p.lives, PLAYER.LIVES - 1);
  assert.equal(h.events('player_died').length, 1);
});

test('one revive pickup per wave on an R spot', () => {
  const h = new Harness([createLivesSystem()]);
  h.addPlayer('dwarf');
  h.start();
  assert.equal(h.state.revives.size, 1);
  const r = [...h.state.revives.values()][0]!;
  assert.ok(spotsOf('R').some((s) => s.x === r.x && s.y === r.y), 'on an R tile');
  assert.equal(r.claimed, false);
});

test('out of lives -> teammate takes the pickup -> back with 1 life; no second revival', () => {
  const h = new Harness([createLivesSystem()]);
  const r = spotsOf('R')[0]!;
  const victim = h.addPlayer('dwarf', { x: 500, y: 400 });
  const rescuer = h.addPlayer('mage', { x: r.x + 10, y: r.y });
  h.start();
  const pickup = [...h.state.revives.values()][0]!;
  h.place(rescuer.id, pickup.x + 10, pickup.y);

  // Nobody to revive: the pickup is left alone.
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(h.state.revives.size, 1, 'pickup untouched while nobody needs it');
  assert.equal(h.events('player_revived').length, 0);

  exhaust(h, victim.id);
  assert.equal(victim.lives, 0);
  assert.equal(victim.alive, false);
  assert.equal(victim.respawnAtMs, 0, 'no respawn pending when out of lives');
  h.seconds(PLAYER.RESPAWN_MS / 1000 + 1);
  assert.equal(victim.alive, false, 'never respawns on its own');
  assert.equal(h.state.phase, MatchPhase.Playing, 'rescuer alive -> not defeat');

  // Too far: nothing happens.
  h.place(rescuer.id, pickup.x + PLAYER.REVIVE_PICKUP_RADIUS + 40, pickup.y);
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(victim.alive, false);
  assert.equal(h.state.revives.size, 1);

  // Downed rescuer cannot claim it either.
  h.place(rescuer.id, pickup.x + 10, pickup.y);
  kill(h, rescuer.id);
  h.tick();
  assert.equal(rescuer.alive, false);
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(victim.alive, false, 'downed hero cannot revive');
  h.seconds(PLAYER.RESPAWN_MS / 1000);
  assert.equal(rescuer.alive, true);
  h.place(rescuer.id, pickup.x + 10, pickup.y);

  // Carrying disables the pickup too.
  rescuer.carryingBoxId = 'somebox';
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(victim.alive, false, 'carrier cannot revive');
  rescuer.carryingBoxId = '';

  // The real thing.
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(victim.alive, true);
  assert.equal(victim.lives, 1);
  assert.equal(victim.hp, victim.maxHp);
  assert.equal(victim.revivesLeft, PLAYER.REVIVES_PER_HERO - 1);
  assert.ok(h.world.distance(victim, BASE) <= MAP.BASE.radius, 'revived at base');
  assert.ok(h.world.walkable(victim.x, victim.y));
  assert.equal(h.state.revives.size, 0, 'pickup claimed and removed');
  const ev = h.events('player_revived');
  assert.equal(ev.length, 1);
  assert.equal(ev[0]!.playerId, victim.id);
  assert.equal(ev[0]!.targetId, rescuer.id);
  assert.equal(h.messages('fx').filter((f) => f.kind === 'revive').length, 1);

  // Second revival of the same hero is impossible, even with a fresh pickup.
  kill(h, victim.id);
  h.tick();
  assert.equal(victim.lives, 0);
  const again = h.world.spawnRevive(r);
  h.place(rescuer.id, again.x + 10, again.y);
  h.command(rescuer.id, 'interact', {}).tick();
  assert.equal(victim.alive, false, 'revivesLeft exhausted');
  assert.equal(h.state.revives.size, 1, 'pickup left alone');
  assert.equal(h.events('player_revived').length, 1);
});

test('everyone out of lives -> Defeat', () => {
  const h = new Harness([createLivesSystem()]);
  const a = h.addPlayer('dwarf', { x: 500, y: 400 });
  const b = h.addPlayer('mage', { x: 520, y: 400 });
  h.start();
  exhaust(h, a.id);
  assert.equal(h.state.phase, MatchPhase.Playing, 'one hero still alive');
  exhaust(h, b.id);
  assert.equal(h.state.phase, MatchPhase.Ended);
  assert.equal(h.state.outcome, Outcome.Defeat);
  assert.equal(h.events('match_end').length, 1);
});

test('one downed with a respawn pending -> not Defeat', () => {
  const h = new Harness([createLivesSystem()]);
  const a = h.addPlayer('dwarf', { x: 500, y: 400 });
  const b = h.addPlayer('mage', { x: 520, y: 400 });
  h.start();
  exhaust(h, a.id);
  kill(h, b.id);
  h.tick();
  assert.equal(h.world.alivePlayers().length, 0);
  assert.equal(b.lives, PLAYER.LIVES - 1);
  assert.equal(h.state.phase, MatchPhase.Playing, 'respawn pending keeps the match going');
  h.seconds(PLAYER.RESPAWN_MS / 1000);
  assert.equal(b.alive, true);
  assert.equal(h.state.phase, MatchPhase.Playing);
});

test('full stack: death drops nothing weird and the match keeps running', () => {
  const h = Harness.full();
  const p = h.addPlayer('dwarf', { x: 500, y: 400 });
  h.start();
  kill(h, p.id);
  h.tick();
  assert.equal(p.alive, false);
  assert.equal(p.lives, PLAYER.LIVES - 1);
  assert.equal(h.state.phase, MatchPhase.Playing);
});

test('one interact opens a crate OR claims the revive pickup, never both', () => {
  const h = new Harness([createBoxesSystem(), createLivesSystem()]);
  const rescuer = h.addPlayer('mage', { id: 'rescuer' });
  const victim = h.addPlayer('troll', { id: 'victim' });
  h.start();
  exhaust(h, victim.id);
  assert.equal(victim.lives, 0);

  // Revive pickup dropped right on top of a closed crate, rescuer standing on both.
  const crate = [...h.state.boxes.values()][0]!;
  const pickup = h.world.spawnRevive({ x: crate.x, y: crate.y });
  h.place(rescuer.id, crate.x, crate.y);

  h.command(rescuer.id, 'interact', {}).tick();
  const resolved = h.events('box_picked').length + h.events('trap_triggered').length;
  assert.equal(resolved, 1, 'crates.ts resolved the press');
  assert.equal(victim.alive, false, 'the same press did not also revive');
  assert.equal(h.state.revives.has(pickup.id), true, 'pickup untouched');
  assert.equal(h.events('player_revived').length, 0);
});
