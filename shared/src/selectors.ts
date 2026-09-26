/**
 * Pure read helpers over synced state, used by BOTH halves.
 *
 * Anything the client needs to derive - cooldown readiness, whether a player can
 * attack, effective speed - lives here rather than being reimplemented in the UI.
 * That is what stops the HUD and the server disagreeing about the same rule.
 */

import { BOXES, FAKE_BOX, PLAYER } from './constants.js';
import { CLASSES, CLASS_BY_INDEX, type AbilitySpec, type ClassId, type ClassSpec } from './classes.js';
import { BoxMark } from './enums.js';
import type { Box, MatchState, Player } from './schema.js';

export function classIdOf(player: Pick<Player, 'classIndex'>): ClassId {
  return CLASS_BY_INDEX[player.classIndex] ?? 'tank';
}

export function classOf(player: Pick<Player, 'classIndex'>): ClassSpec {
  return CLASSES[classIdOf(player)];
}

export function abilitySpec(player: Pick<Player, 'classIndex'>, slot: number): AbilitySpec | undefined {
  return classOf(player).abilities[slot];
}

/** Rank is 1-based for lookups; rank 0 means the ability is still locked. */
export function abilityCooldownMs(player: Player, slot: number): number {
  const spec = abilitySpec(player, slot);
  const rank = player.ranks[slot] ?? 0;
  if (!spec || rank === 0) return Infinity;
  return spec.cooldownMs[rank - 1] ?? spec.cooldownMs[0] ?? Infinity;
}

export function abilityMagnitude(player: Player, slot: number): number {
  const spec = abilitySpec(player, slot);
  const rank = player.ranks[slot] ?? 0;
  if (!spec || rank === 0) return 0;
  return spec.magnitude[rank - 1] ?? spec.magnitude[0] ?? 0;
}

export function isAbilityUnlocked(player: Player, slot: number): boolean {
  return (player.ranks[slot] ?? 0) > 0;
}

export function isAbilityReady(player: Player, slot: number, nowMs: number): boolean {
  if (!isAbilityUnlocked(player, slot)) return false;
  return nowMs >= (player.cooldownReadyAtMs[slot] ?? 0);
}

/** 0..1 for drawing a radial cooldown sweep. 1 means ready. */
export function abilityCooldownProgress(player: Player, slot: number, nowMs: number): number {
  const readyAt = player.cooldownReadyAtMs[slot] ?? 0;
  if (nowMs >= readyAt) return 1;
  const total = abilityCooldownMs(player, slot);
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (readyAt - nowMs) / total));
}

export function isCarrying(player: Pick<Player, 'carryingBoxId'>): boolean {
  return player.carryingBoxId !== '';
}

/** Carriers have no weapon at all, and nobody can swing while hauling a box. */
export function canAttack(player: Player): boolean {
  if (!player.alive) return false;
  if (isCarrying(player)) return false;
  return classOf(player).attackDamage > 0;
}

export function effectiveSpeed(player: Player, nowMs: number): number {
  let speed = classOf(player).speed;
  if (isCarrying(player)) speed *= BOXES.CARRY_SPEED_MULT;
  if (player.slowUntilMs > nowMs) speed *= FAKE_BOX.SLOW_MULT;
  return speed;
}

export function incomingDamageMultiplier(player: Player, nowMs: number): number {
  return player.damageAmpUntilMs > nowMs ? FAKE_BOX.DAMAGE_AMP_MULT : 1;
}

export function isPhased(player: Player, nowMs: number): boolean {
  return player.phasedUntilMs > nowMs;
}

export function hpPct(entity: { hp: number; maxHp: number }): number {
  return entity.maxHp > 0 ? Math.max(0, Math.min(1, entity.hp / entity.maxHp)) : 0;
}

export function isPermanentlyDead(player: Player): boolean {
  return player.lives <= 0 && !player.alive && player.reviveCharges <= 0;
}

export function canBeRevived(player: Player): boolean {
  return player.lives <= 0 && !player.alive && player.reviveCharges > 0;
}

export function respawnProgress(player: Player, nowMs: number): number {
  if (player.alive || player.respawnAtMs <= 0) return 1;
  const remaining = player.respawnAtMs - nowMs;
  if (remaining <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - remaining / PLAYER.RESPAWN_MS));
}

/** Only boxes the team has actually scanned. Unknown boxes render as neutral. */
export function isKnownReal(box: Pick<Box, 'mark'>): boolean {
  return box.mark === BoxMark.Real;
}
export function isKnownFake(box: Pick<Box, 'mark'>): boolean {
  return box.mark === BoxMark.Fake;
}
export function isUnscanned(box: Pick<Box, 'mark'>): boolean {
  return box.mark === BoxMark.Unknown;
}

export function crystalsRemaining(state: MatchState): number {
  return Math.max(0, state.crystalsRequired - state.crystalsDestroyed);
}

export function livePlayers(state: MatchState): Player[] {
  return [...state.players.values()].filter((p) => p.alive);
}
