/**
 * OWNER: see brief backend/tasks/02-combat.md
 * Basic attacks (left click). Keep per-match state INSIDE the factory closure.
 */

import type { Entity, System, Vec2, World } from '@redbox/shared';
import { canAttack, classOf } from '@redbox/shared';
import type { Creep, Crystal, Player } from '@redbox/shared/schema';

/** How far along the aim ray a bolt is sampled for a hit (px). */
const BOLT_STEP_PX = 8;
/** Hit radius around each ray sample for bolts (px). */
const BOLT_HIT_RADIUS = 18;

interface Hostile { id: string; pos: Vec2; }

function hostilesNear(w: World, centre: Vec2, radius: number): Hostile[] {
  const out: Hostile[] = [];
  const found: Entity[] = w.query(centre, radius, { kinds: ['creep', 'crystal', 'boss'] });
  for (const e of found) {
    if ('tier' in e) { const c = e as Creep; if (c.hp > 0) out.push({ id: c.id, pos: c }); continue; }
    if ('destroyed' in e) { const t = e as Crystal; if (!t.destroyed && t.hp > 0) out.push({ id: t.id, pos: t }); continue; }
    if ('attackAtMs' in e) { if (w.state.boss.alive && w.state.boss.hp > 0) out.push({ id: 'boss', pos: w.state.boss }); }
  }
  return out;
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function inArc(p: Vec2, facing: number, target: Vec2, arcDeg: number): boolean {
  const ang = Math.atan2(target.y - p.y, target.x - p.x);
  return angleDelta(ang, facing) <= (arcDeg * Math.PI / 180) / 2;
}

function firstAlongRay(w: World, p: Player, angle: number, range: number): Hostile | undefined {
  const candidates = hostilesNear(w, p, range + BOLT_HIT_RADIUS);
  if (candidates.length === 0) return undefined;
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  for (let d = BOLT_STEP_PX; d <= range; d += BOLT_STEP_PX) {
    const pt = { x: p.x + dir.x * d, y: p.y + dir.y * d };
    if (!w.walkable(pt.x, pt.y)) return undefined;
    let best: Hostile | undefined; let bestDist = Infinity;
    for (const h of candidates) {
      const dist = w.distance(pt, h.pos);
      if (dist <= BOLT_HIT_RADIUS && dist < bestDist) { best = h; bestDist = dist; }
    }
    if (best && w.lineOfSight(p, best.pos)) return best;
  }
  return undefined;
}

export function createCombatSystem(): System {
  return {
    id: 'combat',
    update(w) {
      for (const cmd of w.commands('attack')) {
        const p = w.state.players.get(cmd.playerId);
        if (!p || !canAttack(p, w.now)) continue;
        if (w.modifier(p.id, 'stunned', 0) > 0) continue;
        const spec = classOf(p);

        const { x, y } = cmd.payload;
        if (typeof x === 'number' && typeof y === 'number' && (x !== p.x || y !== p.y)) {
          p.facing = Math.atan2(y - p.y, x - p.x);
        }
        const angle = p.facing;

        p.attackReadyAtMs = w.now + spec.attackCooldownMs * w.modifier(p.id, 'attackCooldownMult', 1);

        const targets: Hostile[] = [];
        if (spec.attackKind === 'bolt') {
          const hit = firstAlongRay(w, p, angle, spec.attackRange);
          if (hit) targets.push(hit);
        } else {
          const inRange = hostilesNear(w, p, spec.attackRange)
            .filter((h) => inArc(p, angle, h.pos, spec.attackArcDeg));
          if (spec.attackKind === 'swing') targets.push(...inRange);
          else if (inRange.length > 0) {
            targets.push(inRange.reduce((a, b) => (w.distance(p, a.pos) <= w.distance(p, b.pos) ? a : b)));
          }
        }

        for (const t of targets) w.damage(t.id, spec.attackDamage, { sourceId: p.id });
        w.fx('attack', p, { sourceId: p.id, angle });
      }
    },
  };
}
