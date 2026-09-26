/**
 * OWNER: see brief backend/tasks/07-bots.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 * Reset your own entities in onWaveStart; the integrator already cleared the board.
 *
 * DEV / SOLO seat fillers. One generic brain, hero-flavoured: melee heroes close
 * in, ranged heroes hold at a fraction of their attack range with line of sight.
 * Bots act ONLY through `w.setIntent` and `w.command`; they never read crate truth,
 * only the public `mark`: they scan a crate before opening it unless under fire,
 * skip scanned traps, and in the final wave go for the boss once the crates are in.
 */

import {
  BOTS, BoxMark, BoxState, CRATES, MAP, PLAYER,
  classOf, cratesRemaining, isAbilityReady, isCarrying, isClosedCrate, isKnownReal, isKnownTrap, tileCentre, toTile,
  type Box, type Creep, type Crystal, type Player, type System, type Vec2, type World,
} from '@redbox/shared';

/** Hostiles closer than this are fought before anything else. */
const FIGHT_RADIUS_PX = 250;
/** Known-real dropped crates this close are picked up before hunting new ones. */
const DROPPED_CRATE_RADIUS_PX = 600;
/** A retreating bot still grabs a dropped crate this close: delivering it is a trip home too. */
const RETREAT_PICKUP_RADIUS_PX = 150;
/** Melee heroes stop closing in at this distance. */
const MELEE_STANDOFF_PX = 40;
/** Ranged heroes hold at this fraction of their attack range. */
const RANGED_STANDOFF_FRAC = 0.8;
/** Ranged heroes back off when a hostile comes closer than this fraction of range. */
const RANGED_TOO_CLOSE_FRAC = 0.5;
/** Retreat to base below this HP fraction. */
const RETREAT_HP_FRAC = 0.25;
/** Retreat is over once HP is back above this fraction (hysteresis). */
const RETREAT_RECOVER_HP_FRAC = 0.5;
/** Close enough to a point to stop steering toward it. */
const ARRIVE_PX = 12;
/** Interact when within this fraction of the pickup radius (safety margin). */
const INTERACT_FRAC = 0.8;
/**
 * Wall-corner unsticking. `w.nextStep` steers the bot's centre, movement moves
 * its body: on a corner the body is blocked while the path field flips between
 * two tiles, so the bot grinds in place forever: not moving UNSTICK_PROGRESS_PX
 * within UNSTICK_AFTER_MS means wedged, so sidestep for UNSTICK_MS.
 */
const UNSTICK_PROGRESS_PX = 8;
const UNSTICK_AFTER_MS = 400;
const UNSTICK_MS = 500;
/**
 * Oscillating between two tiles still looks like movement, so a second, slower
 * check gives up on a goal that neither gets closer (GOAL_PROGRESS_PX) nor takes
 * the bot anywhere new (ROAM_PROGRESS_PX, which a detour around a wall clears)
 * within GIVE_UP_AFTER_MS.
 */
const GOAL_PROGRESS_PX = 8;
const ROAM_PROGRESS_PX = 150;
const OSCILLATION_MS = 1_500;
const GIVE_UP_AFTER_MS = 6_000;
/** How long a bot ignores a goal it could not reach. */
const GIVE_UP_COOLDOWN_MS = 15_000;
/** A retreating bot is safe again once nothing hostile is this close. */
const RETREAT_SAFE_RADIUS_PX = 400;
/** A retreating bot that has not been hit for this long is in a standoff, not in danger. */
const RETREAT_STANDOFF_MS = 5_000;
/** Hit this recently, a bot opens a crate instead of standing there to scan it. */
const SCAN_UNDER_FIRE_MS = 1_500;
/** How far ahead a sidestep is tested for room. */
const SIDESTEP_PROBE_PX = PLAYER.RADIUS * 2;

const MELEE_CLASSES = new Set(['troll', 'brawler', 'warrior']);

type Goal =
  | { kind: 'deliver' }
  | { kind: 'pickup'; boxId: string }
  | { kind: 'fight'; targetId: string }
  | { kind: 'crate'; boxId: string }
  | { kind: 'tower'; towerId: string }
  | { kind: 'retreat' }
  | { kind: 'idle' };

interface Brain {
  goal: Goal;
  nextDecisionAt: number;
  retreating: boolean;
  lastHp: number;
  hurtAtMs: number;
  /** Where the bot was when it last physically moved, for the sidestep timer. */
  moveAnchor: Vec2;
  movedAtMs: number;
  /** Steering target, plus how well the bot is doing at getting there. */
  steerTarget: Vec2;
  roamAnchor: Vec2;
  bestDist: number;
  progressAtMs: number;
  sidestep: Vec2;
  sidestepUntilMs: number;
  /** Goals this bot failed to reach, by subject id, until the given time. */
  unreachableUntil: Map<string, number>;
  /** Set by steering when the current goal has been unreachable for too long. */
  wedged: boolean;
}

interface Hostile { id: string; pos: Vec2; }

export function createBotsSystem(): System {
  const brains = new Map<string, Brain>();

  function brainOf(id: string): Brain {
    let b = brains.get(id);
    if (!b) {
      b = {
        goal: { kind: 'idle' }, nextDecisionAt: 0, retreating: false, lastHp: NaN, hurtAtMs: 0,
        moveAnchor: { x: NaN, y: NaN }, movedAtMs: 0,
        steerTarget: { x: NaN, y: NaN }, roamAnchor: { x: NaN, y: NaN },
        bestDist: Infinity, progressAtMs: 0,
        sidestep: { x: 0, y: 0 }, sidestepUntilMs: 0,
        unreachableUntil: new Map(), wedged: false,
      };
      brains.set(id, b);
    }
    return b;
  }

  /** The hero's whole body clears walls here, as movement.ts checks it. */
  function bodyClear(w: World, x: number, y: number): boolean {
    const r = PLAYER.RADIUS;
    return w.walkable(x - r, y - r) && w.walkable(x + r, y - r)
      && w.walkable(x - r, y + r) && w.walkable(x + r, y + r);
  }

  /** The perpendicular to `dir` with room for the body; left when both or neither fit. */
  function sidestepFor(w: World, p: Player, dir: Vec2): Vec2 {
    const left = { x: -dir.y, y: dir.x };
    const right = { x: dir.y, y: -dir.x };
    const fits = (d: Vec2) => bodyClear(w, p.x + d.x * SIDESTEP_PROBE_PX, p.y + d.y * SIDESTEP_PROBE_PX);
    if (fits(left)) return left;
    if (fits(right)) return right;
    return left;
  }

  /**
   * `nextStep` returns a tile-to-tile direction, which clips corners once the
   * body is taken into account. When the body does not fit straight ahead, aim
   * at the centre of the tile the path points at instead: that lines the hero up
   * with the corridor rather than grinding along its edge.
   */
  function aimAround(w: World, p: Player, dir: Vec2): Vec2 {
    const ahead = { x: p.x + dir.x * SIDESTEP_PROBE_PX, y: p.y + dir.y * SIDESTEP_PROBE_PX };
    if (bodyClear(w, ahead.x, ahead.y)) return dir;
    const { tx, ty } = toTile(ahead.x, ahead.y);
    const c = tileCentre(tx, ty);
    if (!bodyClear(w, c.x, c.y)) return dir;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-3 ? { x: dx / len, y: dy / len } : dir;
  }

  function hostilesNear(w: World, p: Player, radius: number): Hostile[] {
    const out: Hostile[] = [];
    for (const e of w.query(p, radius, { kinds: ['creep'] })) {
      const c = e as Creep;
      out.push({ id: c.id, pos: { x: c.x, y: c.y } });
    }
    const boss = w.state.boss;
    if (boss.alive && boss.hp > 0 && w.distance(p, boss) <= radius) {
      out.push({ id: 'boss', pos: { x: boss.x, y: boss.y } });
    }
    return out;
  }

  function nearest<T extends Vec2>(w: World, from: Vec2, items: T[], ok: (t: T) => boolean = () => true): T | undefined {
    let best: T | undefined;
    let bestD = Infinity;
    for (const it of items) {
      if (!ok(it)) continue;
      const d = w.distance(from, it);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /** The living bot closest to `to` that is free to fetch it (not carrying, not retreating). */
  function nearestFreeBot(w: World, to: Vec2): string | undefined {
    let best: string | undefined;
    let bestD = Infinity;
    for (const q of w.state.players.values()) {
      if (!q.isBot || !q.alive || isCarrying(q) || brains.get(q.id)?.retreating) continue;
      const d = w.distance(q, to);
      if (d < bestD) { bestD = d; best = q.id; }
    }
    return best;
  }

  function reachableFrom(w: World, p: Player, to: Vec2): boolean {
    return w.reachable(p, to);
  }

  function reachableGoal(brain: Brain, w: World, id: string): boolean {
    const until = brain.unreachableUntil.get(id);
    if (until === undefined) return true;
    if (w.now >= until) { brain.unreachableUntil.delete(id); return true; }
    return false;
  }

  function decide(w: World, p: Player, claimed: Set<string>, brain: Brain): Goal {
    const hpFrac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    // Heroes never regenerate, so a retreat that waits for HP would last the
    // whole wave: being out of danger is enough to go back to work.
    if (p.hp < brain.lastHp) brain.hurtAtMs = w.now;
    brain.lastHp = p.hp;
    const threatened = hostilesNear(w, p, RETREAT_SAFE_RADIUS_PX).length > 0
      && w.now - brain.hurtAtMs < RETREAT_STANDOFF_MS;
    if (brain.retreating && (hpFrac >= RETREAT_RECOVER_HP_FRAC || !threatened)) brain.retreating = false;
    else if (!brain.retreating && hpFrac < RETREAT_HP_FRAC && threatened) brain.retreating = true;

    // 1. Carrying: deliver, never fight.
    if (isCarrying(p)) return { kind: 'deliver' };

    const boxes = [...w.state.boxes.values()];
    /** Nearest known-real dropped crate nobody claimed, within `radius`. */
    const droppedWithin = (radius: number, ok: (b: Box) => boolean = () => true) => nearest(w, p, boxes, (b) =>
      b.state === BoxState.Dropped && !claimed.has(b.id) && reachableGoal(brain, w, b.id) &&
      w.distance(p, b) <= radius && ok(b) && reachableFrom(w, p, b));
    const pickup = (b: Box): Goal => { claimed.add(b.id); return { kind: 'pickup', boxId: b.id }; };

    // Hurt: run home, grabbing a dropped crate on the way (its delivery is a
    // trip home too).
    if (brain.retreating) {
      const onTheWay = droppedWithin(RETREAT_PICKUP_RADIUS_PX);
      return onTheWay ? pickup(onTheWay) : { kind: 'retreat' };
    }

    // 2. A dropped (known real) crate nearby.
    const dropped = droppedWithin(DROPPED_CRATE_RADIUS_PX);
    if (dropped) return pickup(dropped);

    // 3. Hostile in range: fight it.
    const hostiles = hostilesNear(w, p, FIGHT_RADIUS_PX);
    const target = nearest(w, p, hostiles.map((h) => ({ ...h.pos, id: h.id })),
      (h) => reachableGoal(brain, w, h.id) && reachableFrom(w, p, h));
    if (target) return { kind: 'fight', targetId: target.id };

    // A known-real crate anywhere beats opening another possible trap, but only
    // the bot closest to it goes, so the whole team is not pulled across the map.
    const farDropped = droppedWithin(Infinity, (b) => nearestFreeBot(w, b) === p.id);
    if (farDropped) return pickup(farDropped);

    // 4. Nearest closed crate nobody else claimed this tick: a scanned real one
    // first, never a scanned trap. Once the wave's quota is in, crates are done.
    const needCrates = cratesRemaining(w.state) > 0;
    const closedOk = (b: Box) => isClosedCrate(b) && !isKnownTrap(b) && !claimed.has(b.id)
      && reachableGoal(brain, w, b.id) && reachableFrom(w, p, b);
    const crate = needCrates
      ? nearest(w, p, boxes, (b) => closedOk(b) && isKnownReal(b)) ?? nearest(w, p, boxes, closedOk)
      : undefined;
    if (crate) { claimed.add(crate.id); return { kind: 'crate', boxId: crate.id }; }

    // Nothing else left to open: any dropped crate, however far, before towers
    // or idling. It is the objective, and nobody else is coming for it.
    const anyDropped = droppedWithin(Infinity);
    if (anyDropped) return pickup(anyDropped);

    // 5. Nearest standing tower.
    const towers = [...w.state.crystals.values()].filter((c) => !c.destroyed);
    const tower = nearest(w, p, towers, (t) => reachableGoal(brain, w, t.id) && reachableFrom(w, p, t));
    if (tower) return { kind: 'tower', towerId: tower.id };

    // 6. Final wave with the crates in: the King stands between us and victory.
    const boss = w.state.boss;
    if (w.state.bossRequired && !needCrates && boss.alive && boss.hp > 0
      && reachableGoal(brain, w, 'boss') && reachableFrom(w, p, boss)) {
      return { kind: 'fight', targetId: 'boss' };
    }

    return { kind: 'idle' };
  }

  /** Current position of a goal's subject, or undefined when it no longer applies. */
  function goalStillValid(w: World, p: Player, goal: Goal): boolean {
    switch (goal.kind) {
      case 'deliver': return isCarrying(p);
      case 'retreat': return true;
      case 'idle': return false;
      case 'pickup': {
        const b = w.state.boxes.get(goal.boxId);
        return !!b && b.state === BoxState.Dropped;
      }
      case 'crate': {
        const b = w.state.boxes.get(goal.boxId);
        return !!b && isClosedCrate(b) && !isKnownTrap(b) && (isKnownReal(b) || cratesRemaining(w.state) > 0);
      }
      case 'fight': {
        if (goal.targetId === 'boss') return w.state.boss.alive && w.state.boss.hp > 0;
        const c = w.state.creeps.get(goal.targetId);
        return !!c && c.hp > 0;
      }
      case 'tower': {
        const t = w.state.crystals.get(goal.towerId);
        return !!t && !t.destroyed;
      }
    }
  }

  function steerTo(w: World, p: Player, to: Vec2) {
    const brain = brainOf(p.id);
    const dist = w.distance(p, to);

    if (brain.steerTarget.x !== to.x || brain.steerTarget.y !== to.y) {
      brain.steerTarget = { x: to.x, y: to.y };
      brain.roamAnchor = { x: p.x, y: p.y };
      brain.bestDist = dist;
      brain.progressAtMs = w.now;
      brain.sidestepUntilMs = 0;
    }

    if (!Number.isFinite(brain.moveAnchor.x) || w.distance(p, brain.moveAnchor) >= UNSTICK_PROGRESS_PX) {
      brain.moveAnchor = { x: p.x, y: p.y };
      brain.movedAtMs = w.now;
    }

    if (dist <= brain.bestDist - GOAL_PROGRESS_PX || w.distance(p, brain.roamAnchor) >= ROAM_PROGRESS_PX) {
      brain.roamAnchor = { x: p.x, y: p.y };
      brain.bestDist = Math.min(brain.bestDist, dist);
      brain.progressAtMs = w.now;
    }

    if (dist <= ARRIVE_PX) {
      w.setIntent(p.id, 0, 0);
      brain.bestDist = dist;
      brain.progressAtMs = w.now;
      brain.movedAtMs = w.now;
      brain.sidestepUntilMs = 0;
      return;
    }

    if (w.now - brain.progressAtMs >= GIVE_UP_AFTER_MS) brain.wedged = true;

    if (w.now < brain.sidestepUntilMs) {
      w.setIntent(p.id, brain.sidestep.x, brain.sidestep.y);
      return;
    }

    const d = w.nextStep(p, to);
    if (w.now - brain.movedAtMs >= UNSTICK_AFTER_MS || w.now - brain.progressAtMs >= OSCILLATION_MS) {
      brain.sidestep = sidestepFor(w, p, d);
      brain.sidestepUntilMs = w.now + UNSTICK_MS;
      w.setIntent(p.id, brain.sidestep.x, brain.sidestep.y);
      return;
    }

    const aim = aimAround(w, p, d);
    w.setIntent(p.id, aim.x, aim.y);
  }

  function goToCrate(w: World, p: Player, box: Box) {
    if (w.distance(p, box) <= CRATES.PICKUP_RADIUS * INTERACT_FRAC) {
      w.setIntent(p.id, 0, 0);
      // Unknown crate and nobody shooting at us: stand still and let the scan finish.
      const underFire = w.now - brainOf(p.id).hurtAtMs < SCAN_UNDER_FIRE_MS;
      if (box.state === BoxState.Idle && box.mark === BoxMark.Unknown && !underFire) return;
      w.command(p.id, 'interact', { targetId: box.id });
    } else {
      steerTo(w, p, box);
    }
  }

  function fight(w: World, p: Player, targetId: string, targetPos: Vec2) {
    const spec = classOf(p);
    const dist = w.distance(p, targetPos);
    const melee = MELEE_CLASSES.has(spec.id);
    const aim = { x: targetPos.x, y: targetPos.y };

    if (melee) {
      if (dist > MELEE_STANDOFF_PX) steerTo(w, p, targetPos);
      else w.setIntent(p.id, 0, 0);
    } else {
      const hold = spec.attackRange * RANGED_STANDOFF_FRAC;
      const los = w.lineOfSight(p, targetPos);
      if (!los || dist > hold) {
        steerTo(w, p, targetPos);
      } else if (dist < spec.attackRange * RANGED_TOO_CLOSE_FRAC) {
        const away = w.directionTo(targetPos, p);
        const back = { x: p.x + away.x * MAP.TILE, y: p.y + away.y * MAP.TILE };
        if (w.walkable(back.x, back.y)) w.setIntent(p.id, away.x, away.y);
        else w.setIntent(p.id, 0, 0);
      } else {
        w.setIntent(p.id, 0, 0);
      }
    }

    const inRange = melee ? dist <= spec.attackRange : dist <= spec.attackRange && w.lineOfSight(p, targetPos);
    if (!inRange) return;

    if (w.now >= p.attackReadyAtMs) w.command(p.id, 'attack', { x: aim.x, y: aim.y, targetId });
    // R, E, then Q: the strongest unlocked skill first. Self-targeted skills
    // still carry the aim so direction-based effects face the target.
    for (const slot of [2, 1, 0] as const) {
      if (!isAbilityReady(p, slot, w.now)) continue;
      const ab = spec.abilities[slot];
      if (ab.range !== undefined && dist > ab.range) continue;
      w.command(p.id, 'ability', { slot, x: aim.x, y: aim.y, targetId });
      break;
    }
  }

  function towerAttack(w: World, p: Player, tower: Crystal) {
    fight(w, p, tower.id, { x: tower.x, y: tower.y });
  }

  /** The entity a goal is about, if any: what gets parked when it proves unreachable. */
  function subjectOf(goal: Goal): string | undefined {
    switch (goal.kind) {
      case 'pickup': case 'crate': return goal.boxId;
      case 'fight': return goal.targetId;
      case 'tower': return goal.towerId;
      default: return undefined;
    }
  }

  function act(w: World, p: Player, goal: Goal) {
    switch (goal.kind) {
      case 'deliver':
      case 'retreat':
        steerTo(w, p, MAP.BASE);
        return;
      case 'pickup':
      case 'crate': {
        const box = w.state.boxes.get(goal.boxId);
        if (box) goToCrate(w, p, box);
        return;
      }
      case 'fight': {
        if (goal.targetId === 'boss') {
          fight(w, p, 'boss', { x: w.state.boss.x, y: w.state.boss.y });
        } else {
          const c = w.state.creeps.get(goal.targetId);
          if (c) fight(w, p, c.id, { x: c.x, y: c.y });
        }
        return;
      }
      case 'tower': {
        const t = w.state.crystals.get(goal.towerId);
        if (t) towerAttack(w, p, t);
        return;
      }
      case 'idle':
        w.setIntent(p.id, 0, 0);
        return;
    }
  }

  return {
    id: 'bots',

    onWaveStart() {
      for (const b of brains.values()) {
        b.goal = { kind: 'idle' };
        b.nextDecisionAt = 0;
        b.retreating = false;
        b.progressAtMs = 0;
        b.movedAtMs = 0;
        b.sidestepUntilMs = 0;
        b.steerTarget = { x: NaN, y: NaN };
        b.moveAnchor = { x: NaN, y: NaN };
        b.roamAnchor = { x: NaN, y: NaN };
        b.bestDist = Infinity;
        b.unreachableUntil.clear();
        b.wedged = false;
      }
    },

    update(w) {
      const claimed = new Set<string>();
      const bots = [...w.state.players.values()].filter((p) => p.isBot);

      // Goals kept from earlier decisions stay claimed so two bots never converge
      // on one crate; the claim set is rebuilt every tick from live goals.
      for (const p of bots) {
        const g = brains.get(p.id)?.goal;
        if (g && (g.kind === 'crate' || g.kind === 'pickup') && p.alive) claimed.add(g.boxId);
      }

      for (const p of bots) {
        const brain = brainOf(p.id);
        if (!p.alive) {
          brain.goal = { kind: 'idle' };
          brain.nextDecisionAt = 0;
          brain.sidestepUntilMs = 0;
          brain.progressAtMs = w.now;
          brain.movedAtMs = w.now;
          brain.moveAnchor = { x: NaN, y: NaN };
          brain.steerTarget = { x: NaN, y: NaN };
          brain.wedged = false;
          continue;
        }

        const carryingNow = isCarrying(p);
        const goalChanged = (brain.goal.kind === 'deliver') !== carryingNow;
        if (w.now >= brain.nextDecisionAt || goalChanged || !goalStillValid(w, p, brain.goal)) {
          if (brain.goal.kind === 'crate' || brain.goal.kind === 'pickup') claimed.delete(brain.goal.boxId);
          brain.goal = decide(w, p, claimed, brain);
          brain.nextDecisionAt = w.now + BOTS.REACTION_MS;
        }
        act(w, p, brain.goal);

        // Steering gave up: park the subject for a while so this bot stops
        // grinding a corner and another one can claim the crate.
        if (brain.wedged) {
          const subject = subjectOf(brain.goal);
          if (subject) brain.unreachableUntil.set(subject, w.now + GIVE_UP_COOLDOWN_MS);
          if (brain.goal.kind === 'crate' || brain.goal.kind === 'pickup') claimed.delete(brain.goal.boxId);
          brain.goal = { kind: 'idle' };
          brain.nextDecisionAt = 0;
          brain.wedged = false;
          brain.steerTarget = { x: NaN, y: NaN };
          w.setIntent(p.id, 0, 0);
        }
      }
    },
  };
}
