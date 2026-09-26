/**
 * OWNER: see brief backend/tasks/08a-heroes-ranged.md
 * The three mage skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.mage.abilities[n].params), never literals.
 */

import { CLASSES, PLAYER } from '@redbox/shared';
import type { AbilityHandler, ClassModule, Entity, EntityKind, Vec2, World } from '@redbox/shared';
import type { Hazard, Player } from '@redbox/shared/schema';

const HOSTILE_KINDS: EntityKind[] = ['creep', 'crystal', 'boss'];
const METEOR = CLASSES.mage.abilities[2];
/** Blink backs off from a landing the body does not fit in by this much per try. */
const BLINK_BACKOFF_STEP_PX = 4;

/** Id used by `w.damage` / `addModifier` for a hostile returned by `query`. */
function hostileId(w: World, e: Entity): string {
  if (e === w.state.boss) return 'boss';
  return (e as { id: string }).id;
}

function clampToRange(from: Vec2, aim: Vec2, range: number): Vec2 {
  const dx = aim.x - from.x, dy = aim.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= range || d === 0) return { x: aim.x, y: aim.y };
  const k = range / d;
  return { x: from.x + dx * k, y: from.y + dy * k };
}

const frostWave: AbilityHandler = ({ world: w, caster, params, range, aim }) => {
  const dir = Math.atan2(aim.y - caster.y, aim.x - caster.x);
  const halfArc = (params.arcDeg! * Math.PI / 180) / 2;
  for (const e of w.query(caster, range, { kinds: HOSTILE_KINDS })) {
    const ang = Math.atan2(e.y - caster.y, e.x - caster.x);
    let diff = Math.abs(ang - dir);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > halfArc) continue;
    if (!w.lineOfSight(caster, e)) continue;
    const id = hostileId(w, e);
    w.damage(id, params.damage!, { sourceId: caster.id });
    w.addModifier(id, 'speedMult', params.slowMult!, params.slowMs!);
    w.fx('hit', e, { sourceId: caster.id });
  }
  w.fx('frost_wave', caster, { sourceId: caster.id, value: range, angle: dir });
  return true;
};

/** The hero's whole body clears walls here, as movement.ts checks it. */
function bodyClear(w: World, x: number, y: number): boolean {
  const r = PLAYER.RADIUS;
  return w.walkable(x - r, y - r) && w.walkable(x + r, y - r) && w.walkable(x - r, y + r) && w.walkable(x + r, y + r);
}

/**
 * The first spot from `to` back toward `from` where the whole body fits, so a
 * landing a few px from a wall never leaves the hero overlapping it (movement
 * refuses every step from there). Undefined when no such spot exists short of
 * the caster.
 */
function bodyFitToward(w: World, from: Vec2, to: Vec2): Vec2 | undefined {
  const d = w.distance(from, to);
  const back = w.directionTo(to, from);
  for (let k = 0; k < d; k += BLINK_BACKOFF_STEP_PX) {
    const x = to.x + back.x * k, y = to.y + back.y * k;
    if (bodyClear(w, x, y)) return { x, y };
  }
  return d === 0 && bodyClear(w, to.x, to.y) ? { x: to.x, y: to.y } : undefined;
}

const blink: AbilityHandler = ({ world: w, caster, range, aim }) => {
  const target = clampToRange(caster, aim, range);
  const spot = w.nearestWalkable(target);
  if (!w.walkable(spot.x, spot.y)) return false;
  if (!w.lineOfSight(caster, spot)) return false;
  const landing = bodyFitToward(w, caster, spot);
  if (!landing) return false;
  w.fx('blink', caster, { sourceId: caster.id });
  caster.x = landing.x; caster.y = landing.y;
  w.fx('blink', landing, { sourceId: caster.id });
  return true;
};

const meteor: AbilityHandler = ({ world: w, caster, params, range, aim }) => {
  const pos = clampToRange(caster, aim, range);
  w.spawnHazard({
    kind: METEOR.id, pos, radius: params.radius!,
    detonateAtMs: w.now + params.delayMs!, ownerId: caster.id,
  });
  return true;
};

function detonateMeteor(w: World, player: Player, hz: Hazard) {
  for (const e of w.query(hz, hz.radius, { kinds: HOSTILE_KINDS })) {
    w.damage(hostileId(w, e), METEOR.params.damage!, { sourceId: player.id });
  }
  w.fx('meteor', hz, { sourceId: player.id, value: hz.radius });
  w.removeEntity('hazard', hz.id);
}

export const mageModule: ClassModule = {
  classId: 'mage',
  abilities: [frostWave, blink, meteor],
  tick(w, player) {
    const due: Hazard[] = [];
    for (const [, hz] of w.state.hazards) {
      if (hz.ownerId === player.id && hz.kind === METEOR.id && w.now >= hz.detonateAtMs) due.push(hz);
    }
    for (const hz of due) detonateMeteor(w, player, hz);
  },
};
