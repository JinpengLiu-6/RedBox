/**
 * OWNER: see brief backend/tasks/08b-heroes-melee.md
 * The three troll skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.troll.abilities[n].params), never literals.
 *
 * Axe Troll: slow, sweeping. Only hostiles are hit - goblins, standing towers
 * and the living boss - never players, and never through walls.
 */

import {
  MOD, PLAYER, TILE,
  type AbilityContext, type AbilityHandler, type ClassModule, type Vec2, type World,
} from '@redbox/shared';

/** Earth Splitter advances in steps this long while looking for the first wall. */
const SPLITTER_STEP_PX = TILE / 4;
/**
 * The shockwave has to get past the troll's own body. Movement keeps the body
 * clear of walls, so a troll pressed against a wall still has a step or two of
 * floor under its own radius; a line that short is "facing into a wall" = no cast.
 */
const SPLITTER_MIN_REACH_PX = PLAYER.RADIUS;

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

/** Unit direction from the caster toward the aim; falls back to its facing. */
function aimDirection(w: World, ctx: AbilityContext): Vec2 {
  const d = w.directionTo(ctx.caster, ctx.aim);
  if (d.x !== 0 || d.y !== 0) return d;
  return { x: Math.cos(ctx.caster.facing), y: Math.sin(ctx.caster.facing) };
}

/** How far a line from `from` along `dir` travels (up to `range`) before the first wall. */
function reachBeforeWall(w: World, from: Vec2, dir: Vec2, range: number): number {
  let reach = 0;
  for (let d = Math.min(SPLITTER_STEP_PX, range); d > reach; d = Math.min(d + SPLITTER_STEP_PX, range)) {
    const pt = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (!w.walkable(pt.x, pt.y) || !w.lineOfSight(from, pt)) break;
    reach = d;
  }
  return reach;
}

/** Q - Whirlwind: `damage` to every hostile within `radius`. */
const whirlwind: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const radius = param(ctx, 'radius');
  const damage = param(ctx, 'damage');
  for (const h of hostilesWithin(w, caster, radius)) {
    if (w.lineOfSight(caster, h.pos)) w.damage(h.id, damage, { sourceId: caster.id });
  }
  w.fx('whirlwind', caster, { sourceId: caster.id, value: radius });
  return true;
};

/**
 * E - Earth Splitter: a line toward the aim, `range` long and `width` wide,
 * cut short by the first wall. Hostiles on it take `damage`; goblins and the
 * boss are slowed to `slowMult` for `slowMs`. Facing straight into a wall (the
 * line cannot get past the troll's own body) = no cast.
 */
const earthSplitter: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const dir = aimDirection(w, ctx);
  const from = { x: caster.x, y: caster.y };
  const reach = reachBeforeWall(w, from, dir, ctx.range);
  if (reach <= SPLITTER_MIN_REACH_PX) return false;

  const halfWidth = param(ctx, 'width') / 2;
  const damage = param(ctx, 'damage');
  const slowMult = param(ctx, 'slowMult');
  const slowMs = param(ctx, 'slowMs');
  for (const h of hostilesWithin(w, from, reach + halfWidth)) {
    const along = (h.pos.x - from.x) * dir.x + (h.pos.y - from.y) * dir.y;
    if (along < 0 || along > reach) continue;
    const foot = { x: from.x + dir.x * along, y: from.y + dir.y * along };
    if (w.distance(foot, h.pos) > halfWidth || !w.lineOfSight(foot, h.pos)) continue;
    w.damage(h.id, damage, { sourceId: caster.id });
    if (h.kind !== 'crystal') w.addModifier(h.id, MOD.SpeedMult, slowMult, slowMs);
  }
  w.fx('earth_splitter', from, { sourceId: caster.id, angle: Math.atan2(dir.y, dir.x), value: reach });
  return true;
};

/** R - Rage: faster swings (`attackCooldownMult`) and less damage taken for `durationMs`. */
const rage: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const durationMs = param(ctx, 'durationMs');
  w.addModifier(caster.id, MOD.AttackCooldownMult, param(ctx, 'attackCooldownMult'), durationMs);
  w.addModifier(caster.id, MOD.DamageTakenMult, param(ctx, 'damageTakenMult'), durationMs);
  w.fx('rage', caster, { sourceId: caster.id, value: durationMs });
  return true;
};

export const trollModule: ClassModule = {
  classId: 'troll',
  abilities: [whirlwind, earthSplitter, rage],
};
