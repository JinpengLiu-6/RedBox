/**
 * OWNER: see brief backend/tasks/08a-heroes-ranged.md
 * The three dwarf skills. Handlers return true when the skill fired (cooldown
 * starts) and false when it could not (no cooldown). Numbers come from
 * `ctx.params` (CLASSES.dwarf.abilities[n].params), never literals.
 */

import { CLASSES } from '@redbox/shared';
import type { AbilityHandler, ClassModule, Entity, EntityKind, Vec2, World } from '@redbox/shared';
import type { Hazard, Player } from '@redbox/shared/schema';

const HOSTILE_KINDS: EntityKind[] = ['creep', 'crystal', 'boss'];
const [GRENADE, MINE, MEGA_BOMB] = CLASSES.dwarf.abilities;
/** Planting time of armed mines (detonateAtMs 0 carries no timestamp). Keyed by entity, so nothing outlives the hazard. */
const minePlantedAt = new WeakMap<Hazard, number>();

/** Mines stay armed for `lifetimeMs` after the cast, then quietly disappear. */
function mineExpired(w: World, hz: Hazard): boolean {
  const planted = minePlantedAt.get(hz) ?? w.now;
  return w.now - planted >= MINE.params.lifetimeMs!;
}

/** Id used by `w.damage` for a hostile returned by `query`. */
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

function explode(w: World, owner: Player, hz: Hazard, damage: number) {
  for (const e of w.query(hz, hz.radius, { kinds: HOSTILE_KINDS })) {
    w.damage(hostileId(w, e), damage, { sourceId: owner.id });
  }
  w.fx('explosion', hz, { sourceId: owner.id, value: hz.radius });
  w.removeEntity('hazard', hz.id);
}

const grenade: AbilityHandler = ({ world: w, caster, params, range, aim }) => {
  const pos = w.nearestWalkable(clampToRange(caster, aim, range));
  w.spawnHazard({ kind: GRENADE.id, pos, radius: params.radius!, detonateAtMs: w.now + params.delayMs!, ownerId: caster.id });
  w.fx('grenade', pos, { sourceId: caster.id, value: params.radius! });
  return true;
};

const mine: AbilityHandler = ({ world: w, caster, params, range, aim }) => {
  const pos = w.nearestWalkable(clampToRange(caster, aim, range));
  const hz = w.spawnHazard({ kind: MINE.id, pos, radius: params.radius!, detonateAtMs: 0, ownerId: caster.id });
  minePlantedAt.set(hz, w.now);
  w.fx('mine', pos, { sourceId: caster.id, value: params.radius! });
  return true;
};

const megaBomb: AbilityHandler = ({ world: w, caster, params, range, aim }) => {
  const pos = w.nearestWalkable(clampToRange(caster, aim, range));
  w.spawnHazard({ kind: MEGA_BOMB.id, pos, radius: params.radius!, detonateAtMs: w.now + params.delayMs!, ownerId: caster.id });
  w.fx('mega_bomb', pos, { sourceId: caster.id, value: params.radius! });
  return true;
};

export const dwarfModule: ClassModule = {
  classId: 'dwarf',
  abilities: [grenade, mine, megaBomb],
  tick(w, player) {
    const due: Array<[Hazard, number]> = [];
    const expired: Hazard[] = [];
    for (const [, hz] of w.state.hazards) {
      if (hz.ownerId !== player.id) continue;
      if (hz.kind === GRENADE.id && w.now >= hz.detonateAtMs) due.push([hz, GRENADE.params.damage!]);
      else if (hz.kind === MEGA_BOMB.id && w.now >= hz.detonateAtMs) due.push([hz, MEGA_BOMB.params.damage!]);
      else if (hz.kind === MINE.id) {
        if (mineExpired(w, hz)) { expired.push(hz); continue; }
        const triggered = w.query(hz, MINE.params.triggerRadius!, { kinds: ['creep', 'boss'] }).length > 0;
        if (triggered) due.push([hz, MINE.params.damage!]);
      }
    }
    for (const hz of expired) w.removeEntity('hazard', hz.id);
    for (const [hz, dmg] of due) explode(w, player, hz, dmg);
  },
};
