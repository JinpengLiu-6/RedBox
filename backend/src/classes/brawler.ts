/**
 * OWNER: see brief backend/tasks/08b-heroes-melee.md
 * The three brawler skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.brawler.abilities[n].params), never literals.
 *
 * Human Brawler: clears routes by displacement. Only hostiles are hit - goblins,
 * standing towers and the living boss - never players, and never through walls.
 */

import {
  GOBLINS, MOD, PLAYER,
  type AbilityContext, type AbilityHandler, type ClassModule, type Player, type Vec2, type World,
} from '@redbox/shared';

/** The charge connects with anything whose body touches the brawler's body along the path. */
const CHARGE_HALF_WIDTH_PX = PLAYER.RADIUS + GOBLINS.RADIUS;
/** The dash advances in steps this long so it stops flush against walls. */
const DASH_STEP_PX = 4;

interface Hostile { id: string; kind: 'creep' | 'crystal' | 'boss'; pos: Vec2; }

const param = (ctx: AbilityContext, key: string): number => ctx.params[key] ?? 0;

/** Goblins, standing towers and the living boss within `radius` of `centre`. Never players. */
function hostilesWithin(w: World, centre: Vec2, radius: number): Hostile[] {
  const out: Hostile[] = [];
  for (const e of w.query(centre, radius, { kinds: ['creep', 'crystal', 'boss'] })) {
    if (e === w.state.boss) { out.push({ id: 'boss', kind: 'boss', pos: e }); continue; }
    const id = (e as { id: string }).id;
    out.push({ id, kind: w.state.creeps.has(id) ? 'creep' : 'crystal', pos: e });
  }
  return out;
}

/** Hostiles whose centre lies within `halfWidth` of the path segment ahead of `from` (each once). */
function hostilesAlongPath(w: World, from: Vec2, dir: Vec2, length: number, halfWidth: number): Hostile[] {
  const mid = { x: from.x + dir.x * length / 2, y: from.y + dir.y * length / 2 };
  return hostilesWithin(w, mid, length / 2 + halfWidth).filter((h) => {
    const along = (h.pos.x - from.x) * dir.x + (h.pos.y - from.y) * dir.y;
    if (along < 0) return false;
    const t = Math.min(along, length);
    const foot = { x: from.x + dir.x * t, y: from.y + dir.y * t };
    return w.distance(foot, h.pos) <= halfWidth && w.lineOfSight(foot, h.pos);
  });
}

/** Unit direction from the caster toward the aim; falls back to its facing. */
function aimDirection(w: World, ctx: AbilityContext): Vec2 {
  const d = w.directionTo(ctx.caster, ctx.aim);
  if (d.x !== 0 || d.y !== 0) return d;
  return { x: Math.cos(ctx.caster.facing), y: Math.sin(ctx.caster.facing) };
}

/** The hero's whole body (not just its centre) is clear of walls, as movement.ts checks. */
function bodyClear(w: World, x: number, y: number): boolean {
  const r = PLAYER.RADIUS;
  return w.walkable(x - r, y - r) && w.walkable(x + r, y - r) && w.walkable(x - r, y + r) && w.walkable(x + r, y + r);
}

/**
 * Moves the caster up to `distance` along `dir`, stopping flush before its body
 * would touch a wall. Private instead of `w.push(caster.id, ...)`: push is a
 * no-op while Unstoppable (KnockbackImmune) is active and only checks the
 * centre point, which can leave the hero's body inside a wall where movement
 * refuses every step. Returns the distance actually travelled.
 */
function dash(w: World, caster: Player, dir: Vec2, distance: number): number {
  // Already overlapping a wall (shoved there by something else)? Fall back to a centre check.
  const fits = bodyClear(w, caster.x, caster.y)
    ? (x: number, y: number) => bodyClear(w, x, y)
    : (x: number, y: number) => w.walkable(x, y);
  let moved = 0;
  while (moved < distance) {
    const step = Math.min(DASH_STEP_PX, distance - moved);
    const nx = caster.x + dir.x * step, ny = caster.y + dir.y * step;
    if (!fits(nx, ny)) break;
    caster.x = nx; caster.y = ny; moved += step;
  }
  return moved;
}

/**
 * Q - Shoulder Charge: dash toward the aim up to `range`, stopping at walls.
 * Hostiles the brawler runs into take `damage`; goblins are knocked
 * `knockbackPx` forward and to the side they were on. No room to dash = no cast.
 */
const shoulderCharge: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const dir = aimDirection(w, ctx);
  const from = { x: caster.x, y: caster.y };
  const moved = dash(w, caster, dir, ctx.range);
  if (moved <= 0) return false;

  const damage = param(ctx, 'damage');
  const knockbackPx = param(ctx, 'knockbackPx');
  const side = { x: -dir.y, y: dir.x };
  for (const h of hostilesAlongPath(w, from, dir, moved, CHARGE_HALF_WIDTH_PX)) {
    w.damage(h.id, damage, { sourceId: caster.id });
    const gob = h.kind === 'creep' ? w.state.creeps.get(h.id) : undefined;
    if (!gob || gob.hp <= 0) continue;
    const s = (h.pos.x - from.x) * side.x + (h.pos.y - from.y) * side.y < 0 ? -1 : 1;
    w.push(h.id, { x: dir.x + side.x * s, y: dir.y + side.y * s }, knockbackPx);
  }
  w.fx('shoulder_charge', from, { sourceId: caster.id, angle: Math.atan2(dir.y, dir.x), value: moved });
  return true;
};

/**
 * E - Ground Slam: hostiles within `radius` take `damage`; goblins are stunned
 * for `stunMs`. The boss gets the same stun call, which the World turns into a slow.
 */
const groundSlam: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const radius = param(ctx, 'radius');
  const damage = param(ctx, 'damage');
  const stunMs = param(ctx, 'stunMs');
  for (const h of hostilesWithin(w, caster, radius)) {
    if (!w.lineOfSight(caster, h.pos)) continue;
    w.damage(h.id, damage, { sourceId: caster.id });
    if (h.kind === 'crystal') continue;
    w.addModifier(h.id, MOD.Stunned, 1, stunMs);
    if (h.kind === 'creep') w.fx('stun', h.pos, { sourceId: caster.id, value: stunMs });
  }
  w.fx('ground_slam', caster, { sourceId: caster.id, value: radius });
  return true;
};

/** R - Unstoppable: immune to knockback and `damageDealtMult` harder hits for `durationMs`. */
const unstoppable: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const durationMs = param(ctx, 'durationMs');
  w.addModifier(caster.id, MOD.KnockbackImmune, 1, durationMs);
  w.addModifier(caster.id, MOD.DamageDealtMult, param(ctx, 'damageDealtMult'), durationMs);
  w.fx('unstoppable', caster, { sourceId: caster.id, value: durationMs });
  return true;
};

export const brawlerModule: ClassModule = {
  classId: 'brawler',
  abilities: [shoulderCharge, groundSlam, unstoppable],
};
