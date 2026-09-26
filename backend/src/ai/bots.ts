/**
 * OWNER: see brief backend/tasks/07-bots.md
 * Keep per-match state INSIDE the factory closure, never at module level.
 * Reset your own entities in onWaveStart; the integrator already cleared the board.
 *
 * DEV / SOLO seat fillers. One generic brain, hero-flavoured: melee heroes close
 * in, ranged heroes hold at a fraction of their attack range with line of sight.
 * Bots act ONLY through `w.setIntent` and `w.command`; they never read crate truth.
 */

import {
  BOTS, BoxState, CRATES, MAP, PLAYER,
  classOf, isAbilityReady, isCarrying, isClosedCrate,
  type Box, type Creep, type Crystal, type Player, type System, type Vec2, type World,
} from '@redbox/shared';

/** Hostiles closer than this are fought before anything else. */
const FIGHT_RADIUS_PX = 250;
/** Known-real dropped crates this close are picked up before hunting new ones. */
const DROPPED_CRATE_RADIUS_PX = 600;
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
 * two tiles, so the bot grinds in place forever. Moving this little over
 * UNSTICK_AFTER_MS of steering means wedged; sidestep for UNSTICK_MS.
 */
const UNSTICK_PROGRESS_PX = 8;
const UNSTICK_AFTER_MS = 400;
const UNSTICK_MS = 500;
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
  /** Where the bot stood when it last made headway, and when that was. */
  lastPos: Vec2;
  progressAtMs: number;
  sidestep: Vec2;
  sidestepUntilMs: number;
}

interface Hostile { id: string; pos: Vec2; }

export function createBotsSystem(): System {
  const brains = new Map<string, Brain>();

  function brainOf(id: string): Brain {
    let b = brains.get(id);
    if (!b) {
      b = {
        goal: { kind: 'idle' }, nextDecisionAt: 0, retreating: false,
        lastPos: { x: 0, y: 0 }, progressAtMs: 0, sidestep: { x: 0, y: 0 }, sidestepUntilMs: 0,
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

  function reachableFrom(w: World, p: Player, to: Vec2): boolean {
    return w.reachable(p, to);
  }

  function decide(w: World, p: Player, claimed: Set<string>, brain: Brain): Goal {
    const hpFrac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    if (brain.retreating && hpFrac >= RETREAT_RECOVER_HP_FRAC) brain.retreating = false;
    if (!brain.retreating && hpFrac < RETREAT_HP_FRAC) brain.retreating = true;

    // 1. Carrying: deliver, never fight.
    if (isCarrying(p)) return { kind: 'deliver' };

    // Hurt: run home (also a delivery when carrying, handled above).
    if (brain.retreating) return { kind: 'retreat' };

    const boxes = [...w.state.boxes.values()];

    // 2. A dropped (known real) crate nearby.
    const dropped = nearest(w, p, boxes, (b) =>
      b.state === BoxState.Dropped && !claimed.has(b.id) &&
      w.distance(p, b) <= DROPPED_CRATE_RADIUS_PX && reachableFrom(w, p, b));
    if (dropped) { claimed.add(dropped.id); return { kind: 'pickup', boxId: dropped.id }; }

    // 3. Hostile in range: fight it.
    const hostiles = hostilesNear(w, p, FIGHT_RADIUS_PX);
    const target = nearest(w, p, hostiles.map((h) => ({ ...h.pos, id: h.id })), (h) => reachableFrom(w, p, h));
    if (target) return { kind: 'fight', targetId: target.id };

    // 4. Nearest closed crate nobody else claimed this tick.
    const crate = nearest(w, p, boxes, (b) => isClosedCrate(b) && !claimed.has(b.id) && reachableFrom(w, p, b));
    if (crate) { claimed.add(crate.id); return { kind: 'crate', boxId: crate.id }; }

    // 5. Nearest standing tower.
    const towers = [...w.state.crystals.values()].filter((c) => !c.destroyed);
    const tower = nearest(w, p, towers, (t) => reachableFrom(w, p, t));
    if (tower) return { kind: 'tower', towerId: tower.id };

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
        return !!b && isClosedCrate(b);
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
    if (w.distance(p, to) <= ARRIVE_PX) {
      w.setIntent(p.id, 0, 0);
      brain.progressAtMs = w.now;
      brain.lastPos = { x: p.x, y: p.y };
      brain.sidestepUntilMs = 0;
      return;
    }

    if (w.distance(p, brain.lastPos) > UNSTICK_PROGRESS_PX) {
      brain.lastPos = { x: p.x, y: p.y };
      brain.progressAtMs = w.now;
    }

    if (w.now < brain.sidestepUntilMs) {
      w.setIntent(p.id, brain.sidestep.x, brain.sidestep.y);
      return;
    }

    const d = w.nextStep(p, to);
    if (w.now - brain.progressAtMs >= UNSTICK_AFTER_MS) {
      brain.sidestep = sidestepFor(w, p, d);
      brain.sidestepUntilMs = w.now + UNSTICK_MS;
      brain.progressAtMs = w.now;
      brain.lastPos = { x: p.x, y: p.y };
      w.setIntent(p.id, brain.sidestep.x, brain.sidestep.y);
      return;
    }

    w.setIntent(p.id, d.x, d.y);
  }

  function goToCrate(w: World, p: Player, box: Box) {
    if (w.distance(p, box) <= CRATES.PICKUP_RADIUS * INTERACT_FRAC) {
      w.setIntent(p.id, 0, 0);
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
        b.sidestepUntilMs = 0;
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
          brain.lastPos = { x: p.x, y: p.y };
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
      }
    },
  };
}
