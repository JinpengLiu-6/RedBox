/**
 * Pure read helpers over synced state, used by BOTH halves. Anything the client
 * derives (cooldown sweeps, whether you can attack, skill locks) lives here so
 * the HUD and the server can never disagree about a rule.
 */

import { CRATES, bossDamageMultiplier } from './constants.js';
import { CLASSES, CLASS_BY_INDEX, type AbilitySpec, type ClassId, type ClassSpec } from './classes.js';
import { BoxMark, BoxState } from './enums.js';
import type { Box, MatchState, Player } from './schema.js';

export function classIdOf(player: Pick<Player, 'classIndex'>): ClassId {
  return CLASS_BY_INDEX[player.classIndex] ?? 'mage';
}

export function classOf(player: Pick<Player, 'classIndex'>): ClassSpec {
  return CLASSES[classIdOf(player)];
}

export function abilitySpec(player: Pick<Player, 'classIndex'>, slot: number): AbilitySpec | undefined {
  return classOf(player).abilities[slot];
}

export function isCarrying(player: Pick<Player, 'carryingBoxId'>): boolean {
  return player.carryingBoxId !== '';
}

export function isAbilityUnlocked(player: Player, slot: number): boolean {
  return (player.ranks[slot] ?? 0) > 0;
}

/** Server and HUD agree: alive, unlocked, off cooldown, and not carrying a crate. */
export function isAbilityReady(player: Player, slot: number, nowMs: number): boolean {
  if (!player.alive || isCarrying(player) || !isAbilityUnlocked(player, slot)) return false;
  return nowMs >= (player.cooldownReadyAtMs[slot] ?? 0);
}

/** 0..1 for drawing a radial cooldown sweep. 1 means ready. */
export function abilityCooldownProgress(player: Player, slot: number, nowMs: number): number {
  const readyAt = player.cooldownReadyAtMs[slot] ?? 0;
  if (nowMs >= readyAt) return 1;
  const total = abilitySpec(player, slot)?.cooldownMs ?? 0;
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (readyAt - nowMs) / total));
}

/** Everyone has a weapon; nobody can swing while carrying a crate. */
export function canAttack(player: Player, nowMs: number): boolean {
  return player.alive && !isCarrying(player) && nowMs >= player.attackReadyAtMs;
}

export function effectiveSpeed(player: Player): number {
  const speed = classOf(player).speed;
  return isCarrying(player) ? speed * CRATES.CARRY_SPEED_MULT : speed;
}

export function hpPct(entity: { hp: number; maxHp: number }): number {
  return entity.maxHp > 0 ? Math.max(0, Math.min(1, entity.hp / entity.maxHp)) : 0;
}

export function isOutOfLives(player: Player): boolean {
  return player.lives <= 0 && !player.alive;
}

export function respawnProgress(player: Player, nowMs: number, respawnMs: number): number {
  if (player.alive || player.respawnAtMs <= 0) return 1;
  const remaining = player.respawnAtMs - nowMs;
  return remaining <= 0 ? 1 : Math.max(0, Math.min(1, 1 - remaining / respawnMs));
}

/** Closed crates on the map, scanned or not. Only `mark` may tell real from trap. */
export function isClosedCrate(box: Pick<Box, 'state'>): boolean {
  return box.state === BoxState.Idle;
}

export function scanSpeedOf(player: Pick<Player, 'classIndex'>): number {
  return classOf(player).scanSpeed ?? 1;
}

/** A scanned trap: still closed, still breaks if opened. */
export function isKnownTrap(box: Pick<Box, 'mark'>): boolean {
  return box.mark === BoxMark.Fake;
}

/** Carried (dropped) or scanned real: safe to grab. */
export function isKnownReal(box: Pick<Box, 'mark'>): boolean {
  return box.mark === BoxMark.Real;
}

export function cratesRemaining(state: MatchState): number {
  return Math.max(0, state.boxesRequired - state.boxesDelivered);
}

export function towersStanding(state: MatchState): number {
  let n = 0;
  for (const [, c] of state.crystals) if (!c.destroyed) n++;
  return n;
}

export { bossDamageMultiplier };

export function livePlayers(state: MatchState): Player[] {
  return [...state.players.values()].filter((p) => p.alive);
}
