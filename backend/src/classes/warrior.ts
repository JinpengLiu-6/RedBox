/**
 * OWNER: see brief backend/tasks/08b-heroes-melee.md
 * The three warrior skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.warrior.abilities[n].params), never literals.
 *
 * Dual-Blade Warrior: rewards timing. Only hostiles are hit - goblins, standing
 * towers and the living boss - never players, and never through walls.
 */

import {
  MOD, PLAYER, TICK_MS, isCarrying,
  type AbilityContext, type AbilityHandler, type ClassModule, type Player, type Vec2, type World,
} from '@redbox/shared';

/** The dash advances in steps this long so it stops flush against walls. */
const DASH_STEP_PX = 4;
/**
 * Longer than any real gap between two server ticks (the room clamps a tick to
 * 3 x TICK_MS). A bigger gap means the warrior was not ticked, i.e. downed.
 */
const DOWNED_GAP_MS = TICK_MS * 4;

interface Hostile { id: string; kind: 'creep' | 'crystal' | 'boss'; pos: Vec2; }

/** A running Blade Dance. Numbers are captured from `ctx.params` at cast time. */
interface Channel {
  wave: number;
  /** Last tick this channel was upkept; a gap means the warrior was downed. */
  lastSeenMs: number;
  endsAtMs: number;
  nextHitAtMs: number;
  tickMs: number;
  damagePerTick: number;
  radius: number;
}

/**
 * Per-match channel state. ClassModules are process-wide singletons shared by
 * every room, so channels are keyed by the match's World first (one per room,
 * and a fresh one on restart) and then by player id. Bot ids repeat across
 * rooms, so a player-id-only key would leak one room's dance into another.
 * The WeakMap lets a finished match's entries be collected with its World.
 */
const channelsByWorld = new WeakMap<World, Map<string, Channel>>();

function channelsOf(w: World): Map<string, Channel> {
  let m = channelsByWorld.get(w);
  if (!m) channelsByWorld.set(w, (m = new Map()));
  return m;
}

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

/**
 * Hostiles whose centre lies within `halfWidth` of the path segment from `from`
 * to its end (each once). A capsule: both ends count, so a goblin crowding the
 * warrior's flank when the dash starts is cut too, not only what lies ahead.
 */
function hostilesAlongPath(w: World, from: Vec2, dir: Vec2, length: number, halfWidth: number): Hostile[] {
  const mid = { x: from.x + dir.x * length / 2, y: from.y + dir.y * length / 2 };
  return hostilesWithin(w, mid, length / 2 + halfWidth).filter((h) => {
    const along = (h.pos.x - from.x) * dir.x + (h.pos.y - from.y) * dir.y;
    const t = Math.max(0, Math.min(along, length));
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
 * would touch a wall. Private instead of `w.push(caster.id, ...)`: push only
 * checks the centre point, which can leave the hero's body inside a wall where
 * movement refuses every step. Returns the distance actually travelled.
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
 * Q - Slashing Dash: dash toward the aim up to `range`, stopping at walls.
 * Every hostile within `width / 2` of the path (start and end included) takes
 * `damage` once. No room to dash = no cast.
 */
const slashingDash: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const dir = aimDirection(w, ctx);
  const from = { x: caster.x, y: caster.y };
  const moved = dash(w, caster, dir, ctx.range);
  if (moved <= 0) return false;

  const damage = param(ctx, 'damage');
  for (const h of hostilesAlongPath(w, from, dir, moved, param(ctx, 'width') / 2)) {
    w.damage(h.id, damage, { sourceId: caster.id });
  }
  w.fx('slashing_dash', from, { sourceId: caster.id, angle: Math.atan2(dir.y, dir.x), value: moved });
  return true;
};

/**
 * E - Parry: for `windowMs` the World blocks all damage to the warrior and
 * deals `counterDamage` back to each attacker.
 */
const parry: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const windowMs = param(ctx, 'windowMs');
  w.addModifier(caster.id, MOD.Parry, param(ctx, 'counterDamage'), windowMs);
  w.fx('parry', caster, { sourceId: caster.id, value: windowMs });
  return true;
};

/**
 * R - Blade Dance: for `durationMs`, every `tickMs` (first hit on cast) hostiles
 * within `radius` of the warrior take `damagePerTick`. The warrior keeps moving;
 * the hits run in `tick()`.
 */
const bladeDance: AbilityHandler = (ctx) => {
  const { world: w, caster } = ctx;
  const tickMs = param(ctx, 'tickMs');
  const durationMs = param(ctx, 'durationMs');
  if (!(tickMs > 0) || !(durationMs > 0)) return false;
  channelsOf(w).set(caster.id, {
    wave: w.wave,
    lastSeenMs: w.now,
    endsAtMs: w.now + durationMs,
    nextHitAtMs: w.now,
    tickMs,
    damagePerTick: param(ctx, 'damagePerTick'),
    radius: param(ctx, 'radius'),
  });
  return true;
};

/** Blade Dance upkeep. Called every tick for every living warrior. */
function tick(w: World, player: Player) {
  const channels = channelsByWorld.get(w);
  const ch = channels?.get(player.id);
  if (!channels || !ch) return;
  // Skipped ticks mean the warrior was downed (only living heroes are ticked).
  const wasDowned = w.now - ch.lastSeenMs > DOWNED_GAP_MS;
  ch.lastSeenMs = w.now;
  // Being downed, picking up a crate or a new wave ends the dance.
  if (wasDowned || isCarrying(player) || ch.wave !== w.wave) {
    channels.delete(player.id);
    return;
  }

  // Exact hit count however the server ticks land: every hit due before the end.
  while (ch.nextHitAtMs <= w.now && ch.nextHitAtMs < ch.endsAtMs) {
    for (const h of hostilesWithin(w, player, ch.radius)) {
      if (w.lineOfSight(player, h.pos)) w.damage(h.id, ch.damagePerTick, { sourceId: player.id });
    }
    w.fx('blade_dance', player, { sourceId: player.id, value: ch.radius });
    ch.nextHitAtMs += ch.tickMs;
  }
  if (ch.nextHitAtMs >= ch.endsAtMs) channels.delete(player.id);
}

export const warriorModule: ClassModule = {
  classId: 'warrior',
  abilities: [slashingDash, parry, bladeDance],
  tick,
};
