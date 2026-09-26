/**
 * OWNER: see brief backend/tasks/04-boss.md
 *
 * The Goblin King. A plain finite-state machine: readable, telegraphed,
 * dodgeable. No LLM in the loop, and it never reads player input.
 *
 *   idle -> chase -> windup -> (hit lands) -> recover -> chase -> ...
 *   chase beyond the leash -> returning (target dropped) -> idle
 *   hp 0 -> defeated (for the rest of the wave; the wave is NOT cleared)
 *
 * The windup IS the dodge window: `attack`, `attackAtMs` and `attackX/Y` are
 * synced so the client draws the telegraph, and damage is resolved against
 * whoever stands in the area when the hit LANDS, never at windup.
 *
 * Per-match state lives inside the factory closure.
 */

import {
  BOSS, MAP, PLAYER, classIdOf, isCarrying, tileCentre, toTile, wavePlan,
  type MatchEvent, type System, type Vec2, type World,
} from '@redbox/shared';
import type { Boss, Player } from '@redbox/shared/schema';

type AttackKind = keyof typeof BOSS.ATTACKS;

/** Attacks are cycled in this order. */
const CYCLE: readonly AttackKind[] = ['sweep', 'slam', 'charge'];

/** Start a sweep once the target is within this fraction of its range. */
const SWEEP_ENGAGE_FRAC = 0.75;
/** The slam lands up to this far in front of the King, toward the target. */
const SLAM_REACH_PX = 100;
/** Start a slam once the target is this close. */
const SLAM_ENGAGE_PX = 140;
/** Start a charge once the target is within this fraction of the charge distance. */
const CHARGE_ENGAGE_FRAC = 0.75;
/** Stop closing in at body contact. */
const HOLD_DISTANCE_PX = BOSS.RADIUS + PLAYER.RADIUS;
/**
 * A charge that hits a wall stops this far short of it, so the King visibly
 * slams into the wall instead of sinking into it.
 */
const CHARGE_WALL_BACKOFF_PX = 12;
/** Resolution of the wall check along a charge path. */
const CHARGE_STEP_PX = 4;
/** A wall slide shorter than this fraction of the step counts as wedged. */
const MIN_SLIDE_FRAC = 0.25;
/** Close enough to home to count as home. */
const HOME_EPSILON_PX = 8;
/** Facing on spawn: south, toward the base. */
const SPAWN_FACING = Math.PI / 2;

const HOME: Vec2 = { x: MAP.BOSS_ZONE.x, y: MAP.BOSS_ZONE.y };

/**
 * Moves the boss up to `dist` along `dir` (from `w.nextStep`), sliding along
 * walls. The centre point collides, like the tile pathfinder that steers it, so
 * every path the pathfinder finds is one the King can actually walk.
 */
function stepBoss(w: World, b: Boss, dir: Vec2, dist: number) {
  if (dist <= 0 || (dir.x === 0 && dir.y === 0)) return;
  const nx = b.x + dir.x * dist;
  const ny = b.y + dir.y * dist;
  const minSlide = dist * MIN_SLIDE_FRAC;
  if (w.walkable(nx, ny)) { b.x = nx; b.y = ny; }
  else if (Math.abs(dir.x) * dist >= minSlide && w.walkable(nx, b.y)) b.x = nx;
  else if (Math.abs(dir.y) * dist >= minSlide && w.walkable(b.x, ny)) b.y = ny;
  else {
    // Wedged on a wall corner: re-centre on the current (walkable) tile, from
    // where the pathfinder's next step is always clean.
    const { tx, ty } = toTile(b.x, b.y);
    const c = tileCentre(tx, ty);
    const d = w.distance(b, c);
    if (d > 1e-3) {
      const k = Math.min(1, dist / d);
      b.x += (c.x - b.x) * k;
      b.y += (c.y - b.y) * k;
    }
  }
  b.facing = Math.atan2(dir.y, dir.x);
}

/** Where a charge from `from` along `dir` stops: after `maxDist`, or just short of the first wall. */
function chargeEnd(w: World, from: Vec2, dir: Vec2, maxDist: number): Vec2 {
  let moved = 0;
  let blocked = false;
  while (moved < maxDist) {
    const next = Math.min(maxDist, moved + CHARGE_STEP_PX);
    const px = from.x + dir.x * moved, py = from.y + dir.y * moved;
    const nx = from.x + dir.x * next, ny = from.y + dir.y * next;
    // Both L-corners too, so a diagonal charge never slips between two walls touching at a corner.
    if (!w.walkable(nx, ny) || !w.walkable(nx, py) || !w.walkable(px, ny)) { blocked = true; break; }
    moved = next;
  }
  if (blocked) moved = Math.max(0, moved - CHARGE_WALL_BACKOFF_PX);
  return { x: from.x + dir.x * moved, y: from.y + dir.y * moved };
}

/** Closest point to `p` on segment a-b. */
function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Smallest absolute difference between two angles, in radians. */
function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function engageRange(kind: AttackKind): number {
  if (kind === 'sweep') return BOSS.ATTACKS.sweep.range * SWEEP_ENGAGE_FRAC;
  if (kind === 'slam') return SLAM_ENGAGE_PX;
  return BOSS.ATTACKS.charge.distance * CHARGE_ENGAGE_FRAC;
}

function clearAttack(b: Boss) {
  b.attack = '';
  b.attackAtMs = 0;
  b.attackX = 0;
  b.attackY = 0;
}

export function createBossSystem(): System {
  // ---- per-match state (reset every wave) ----------------------------------
  let targetSince = 0;
  let cycleIdx = 0;
  /** Earliest time the next windup may start (min gap between attacks). */
  let nextAttackAt = 0;
  let recoverUntil = 0;
  /** True while walking home after breaking the leash: ignores everyone until home. */
  let leashed = false;
  /** Direction locked at charge windup (the telegraphed lane may be zero-length at a wall). */
  let chargeDir: Vec2 = { x: 1, y: 0 };
  /** Threat snapshot after last tick's decay: the biggest jump since is the likely killing blow. */
  const lastThreat = new Map<string, number>();

  const speed = (w: World) => BOSS.SPEED * w.modifier('boss', 'speedMult');

  // ---- targeting -----------------------------------------------------------

  /** Targeting score, or undefined if the player is not a valid candidate. */
  function score(w: World, b: Boss, p: Player): number | undefined {
    if (!p.alive) return undefined;
    const d = w.distance(b, p);
    if (d > BOSS.AGGRO_RADIUS) return undefined;
    // Never pick someone the leash would make us abandon straight away.
    if (w.distance(HOME, p) > BOSS.LEASH_RADIUS) return undefined;
    if (!w.reachable(b, p)) return undefined;
    const T = BOSS.TARGETING;
    const raw = T.PROXIMITY * (BOSS.AGGRO_RADIUS - d)
      + T.RECENT_DAMAGE * w.threatOf(p.id)
      + (isCarrying(p) ? T.CARRIER_BONUS : 0);
    return raw * w.threatBias(classIdOf(p));
  }

  function setTarget(w: World, b: Boss, p: Player | undefined) {
    b.targetId = p ? p.id : '';
    targetSince = w.now;
    if (p) {
      w.emit({ type: 'boss_target_changed', atMs: w.now, targetId: p.id, playerId: p.id, classId: classIdOf(p) });
    }
  }

  /** Current target after applying the commit window, or undefined. */
  function retarget(w: World, b: Boss): Player | undefined {
    const cur = b.targetId ? w.state.players.get(b.targetId) : undefined;
    const curValid = !!cur && cur.alive && w.reachable(b, cur);
    if (curValid && w.now - targetSince < BOSS.TARGET_COMMIT_MS) return cur;

    // Re-evaluate. The current target wins ties, so equal scores never flip-flop.
    let best: Player | undefined;
    let bestScore = -Infinity;
    if (curValid) {
      const s = score(w, b, cur!);
      if (s !== undefined) { best = cur; bestScore = s; }
    }
    for (const [, p] of w.state.players) {
      if (p === cur) continue;
      const s = score(w, b, p);
      if (s !== undefined && s > bestScore) { best = p; bestScore = s; }
    }
    if (best !== cur || (!best && b.targetId !== '')) setTarget(w, b, best);
    return best;
  }

  // ---- movement ------------------------------------------------------------

  /** Walks home. Arriving flips to idle and releases the leash. */
  function goHome(w: World, b: Boss) {
    const d = w.distance(b, HOME);
    const step = speed(w) * w.dt;
    if (d <= Math.max(HOME_EPSILON_PX, step)) {
      b.x = HOME.x; b.y = HOME.y;
      b.behaviour = 'idle';
      leashed = false;
      return;
    }
    b.behaviour = 'returning';
    stepBoss(w, b, w.nextStep(b, HOME), step);
  }

  function breakLeash(w: World, b: Boss) {
    leashed = true;
    if (b.targetId !== '') setTarget(w, b, undefined);
    goHome(w, b);
  }

  // ---- attacks -------------------------------------------------------------

  function startWindup(w: World, b: Boss, kind: AttackKind, target: Player) {
    const d = w.distance(b, target);
    const dir = d > 1e-3 ? w.directionTo(b, target) : { x: Math.cos(b.facing), y: Math.sin(b.facing) };
    let aim: Vec2;
    if (kind === 'sweep') {
      const r = BOSS.ATTACKS.sweep.range;
      aim = { x: b.x + dir.x * r, y: b.y + dir.y * r };
    } else if (kind === 'slam') {
      const reach = Math.min(d, SLAM_REACH_PX);
      aim = { x: b.x + dir.x * reach, y: b.y + dir.y * reach };
    } else {
      chargeDir = dir;
      // The telegraphed lane already stops at the wall, exactly like the charge will.
      aim = chargeEnd(w, b, dir, BOSS.ATTACKS.charge.distance);
    }
    const windupMs = BOSS.ATTACKS[kind].windupMs;
    b.attack = kind;
    b.attackAtMs = w.now + windupMs;
    b.attackX = aim.x;
    b.attackY = aim.y;
    b.behaviour = 'windup';
    b.facing = Math.atan2(dir.y, dir.x);
    cycleIdx = (cycleIdx + 1) % CYCLE.length;
    w.emit({
      type: 'boss_attack', atMs: w.now, label: kind, value: windupMs,
      targetId: target.id, playerId: target.id, classId: classIdOf(target),
    });
  }

  /** The hit lands: resolve against whoever is in the area NOW. */
  function land(w: World, b: Boss) {
    const kind = b.attack as AttackKind;
    const aim: Vec2 = { x: b.attackX, y: b.attackY };
    const hits: Player[] = [];
    let fxPos: Vec2 = { x: b.x, y: b.y };
    let angle = b.facing;

    if (kind === 'sweep') {
      const spec = BOSS.ATTACKS.sweep;
      const half = (spec.arcDeg / 2) * (Math.PI / 180);
      angle = Math.atan2(aim.y - b.y, aim.x - b.x);
      for (const p of w.alivePlayers()) {
        const d = w.distance(b, p);
        if (d > spec.range + PLAYER.RADIUS) continue;
        if (d > 1e-3 && angleDiff(Math.atan2(p.y - b.y, p.x - b.x), angle) > half) continue;
        if (!w.lineOfSight(b, p)) continue;
        hits.push(p);
      }
    } else if (kind === 'slam') {
      const spec = BOSS.ATTACKS.slam;
      fxPos = aim;
      for (const p of w.alivePlayers()) {
        if (w.distance(aim, p) > spec.radius + PLAYER.RADIUS) continue;
        if (!w.lineOfSight(aim, p)) continue;
        hits.push(p);
      }
    } else if (kind === 'charge') {
      const spec = BOSS.ATTACKS.charge;
      const from: Vec2 = { x: b.x, y: b.y };
      const to = chargeEnd(w, from, chargeDir, spec.distance);
      angle = Math.atan2(chargeDir.y, chargeDir.x);
      for (const p of w.alivePlayers()) {
        const q = closestOnSegment(p, from, to);
        if (w.distance(q, p) > spec.width / 2 + PLAYER.RADIUS) continue;
        if (!w.lineOfSight(q, p)) continue;
        hits.push(p);
      }
      b.x = to.x; b.y = to.y;
      fxPos = to;
    }

    if (kind in BOSS.ATTACKS) {
      const spec = BOSS.ATTACKS[kind];
      const dmg = spec.damage * wavePlan(w.wave).bossMult;
      for (const p of hits) w.damage(p.id, dmg, { sourceId: 'boss' });
      w.fx(`boss_${kind}`, fxPos, { sourceId: 'boss', angle });
      recoverUntil = w.now + spec.recoverMs;
    } else {
      recoverUntil = w.now;
    }
    nextAttackAt = w.now + BOSS.ATTACK_INTERVAL_MS;
    clearAttack(b);
    b.behaviour = 'recover';
  }

  // ---- defeat --------------------------------------------------------------

  /** Player whose threat jumped the most since last tick: best guess at the killing blow. */
  function likelyKiller(w: World): Player | undefined {
    let best: string | undefined;
    let bestDelta = 0;
    for (const [id, t] of w.threatEntries()) {
      const delta = t - (lastThreat.get(id) ?? 0);
      if (delta > bestDelta) { best = id; bestDelta = delta; }
    }
    return best ? w.state.players.get(best) : undefined;
  }

  function defeat(w: World, b: Boss) {
    const killer = likelyKiller(w);
    b.hp = 0;
    b.alive = false;
    b.behaviour = 'defeated';
    b.targetId = '';
    clearAttack(b);
    w.fx('boss_defeated', b, killer ? { sourceId: killer.id } : {});
    const e: MatchEvent = { type: 'boss_defeated', atMs: w.now, value: w.wave };
    if (killer) { e.playerId = killer.id; e.classId = classIdOf(killer); }
    w.emit(e);
  }

  // ---- system ----------------------------------------------------------------

  return {
    id: 'boss',

    onWaveStart(w) {
      const b = w.state.boss;
      const hp = Math.round(BOSS.HP * wavePlan(w.wave).bossMult);
      b.alive = true;
      b.hp = hp;
      b.maxHp = hp;
      b.x = HOME.x;
      b.y = HOME.y;
      b.facing = SPAWN_FACING;
      b.behaviour = 'idle';
      b.targetId = '';
      clearAttack(b);
      targetSince = 0;
      cycleIdx = 0;
      nextAttackAt = 0;
      recoverUntil = 0;
      leashed = false;
      chargeDir = { x: 1, y: 0 };
      lastThreat.clear();
    },

    update(w) {
      const b = w.state.boss;

      // Death first: damage from earlier systems this tick has already landed.
      if (b.alive && b.hp <= 0) defeat(w, b);

      // Recent damage fades, whether or not the King is still standing.
      w.scaleAllThreat(Math.max(0, 1 - BOSS.TARGETING.DAMAGE_DECAY_PER_SEC * w.dt));
      lastThreat.clear();
      for (const [id, t] of w.threatEntries()) lastThreat.set(id, t);

      if (!b.alive) return;
      if (leashed) { goHome(w, b); return; }

      // Targeting runs in every state so the intent panel stays truthful; a
      // telegraphed attack is already locked to its area and does not follow.
      const target = retarget(w, b);

      if (b.behaviour === 'windup') {
        if (w.now >= b.attackAtMs) land(w, b);
        return;
      }
      if (b.behaviour === 'recover' && w.now < recoverUntil) return;

      if (!target) { goHome(w, b); return; }

      if (w.distance(b, HOME) > BOSS.LEASH_RADIUS) { breakLeash(w, b); return; }

      const d = w.distance(b, target);
      const next = CYCLE[cycleIdx]!;
      if (w.now >= nextAttackAt && d <= engageRange(next) && w.lineOfSight(b, target)) {
        startWindup(w, b, next, target);
        return;
      }

      b.behaviour = 'chase';
      // Hold at body contact, unless a wall is in between: then path around it.
      if (d > HOLD_DISTANCE_PX || !w.lineOfSight(b, target)) {
        stepBoss(w, b, w.nextStep(b, target), speed(w) * w.dt);
      } else {
        b.facing = Math.atan2(target.y - b.y, target.x - b.x);
      }
    },
  };
}
