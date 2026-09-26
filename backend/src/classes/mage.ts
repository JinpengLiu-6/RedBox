/**
 * OWNER: see brief backend/tasks/08a-heroes-ranged.md
 * The three mage skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.mage.abilities[n].params), never literals.
 */

import { CLASSES } from '@redbox/shared';
import type { AbilityHandler, ClassModule, Entity, EntityKind, Vec2, World } from '@redbox/shared';
import type { Hazard, Player } from '@redbox/shared/schema';

const HOSTILE_KINDS: EntityKind[] = ['creep', 'crystal', 'boss'];
const METEOR = CLASSES.mage.abilities[2];

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

const blink: AbilityHandler = ({ world: w, caster, range, aim }) => {
  const target = clampToRange(caster, aim, range);
  const landing = w.nearestWalkable(target);
  if (!w.walkable(landing.x, landing.y)) return false;
  if (!w.lineOfSight(caster, landing)) return false;
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
