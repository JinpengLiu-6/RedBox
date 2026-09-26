/**
 * Single source of truth for balance. Systems read from here and never hardcode
 * numbers. Values marked DEFAULT are the MVP plan's "proposed defaults" - they
 * are configurable, not approved requirements.
 */

import { ARENA_H, ARENA_W, TILE, spotsOf } from './map.js';

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const PATCH_RATE = 20;
/** Client renders this far in the past so it always interpolates, never extrapolates. */
export const INTERP_DELAY_MS = 100;

/**
 * The three waves. Enemy multipliers are relative to WAVE 1 (1.20 and 1.30),
 * never compounded. Required deliveries are 3 / 2 / 3.
 */
export const WAVE_PLAN = [
  { realCrates: 3, trapCrates: 12, requiredDeliveries: 3, enemyMult: 1.0, bossMult: 1.0 },
  { realCrates: 2, trapCrates: 12, requiredDeliveries: 2, enemyMult: 1.2, bossMult: 1.2 },
  { realCrates: 3, trapCrates: 12, requiredDeliveries: 3, enemyMult: 1.3, bossMult: 1.3 },
] as const;
export type WavePlan = (typeof WAVE_PLAN)[number];
export const WAVE_COUNT = WAVE_PLAN.length;

export function wavePlan(wave: number): WavePlan {
  return WAVE_PLAN[Math.min(WAVE_COUNT, Math.max(1, wave)) - 1]!;
}

export const MATCH = {
  TEAM_SIZE: 5,
  COUNTDOWN_MS: 3_000,
  /** Pause between waves: board resets, next skill unlocks. */
  WAVE_TRANSITION_MS: 4_000,
  /**
   * Not in the plan - the team's own 5-7 minute demo cap. Hitting it is a loss
   * (Outcome.Timeout). 0 disables it. 8 deliveries across 3 waves may not fit:
   * tune after the first playtest.
   */
  DURATION_MS: 420_000,
} as const;

export const MAP = {
  TILE,
  WIDTH_TILES: ARENA_W,
  HEIGHT_TILES: ARENA_H,
  WIDTH_PX: ARENA_W * TILE,
  HEIGHT_PX: ARENA_H * TILE,
  /** Delivery zone and respawn point: centre of the spawn tile, radius covers the B tiles. */
  BASE: { ...spotsOf('S')[0]!, radius: 110 },
  /** The boss spawns here and leashes back here. */
  BOSS_ZONE: { ...spotsOf('K')[0]!, radius: 420 },
} as const;

export const PLAYER = {
  LIVES: 3,
  RESPAWN_MS: 5_000,
  /** Collision radius for movement against walls. */
  RADIUS: 14,
  /** Movement intents older than this are dropped as stale. */
  INPUT_MAX_AGE_MS: 500,
  REVIVE_PICKUP_RADIUS: 56,
  /** DEFAULT: each hero may be revived once per match. */
  REVIVES_PER_HERO: 1,
} as const;

export const CRATES = {
  PICKUP_RADIUS: 52,
  /** DEFAULT: one crate per player; carrying disables attacks AND skills. */
  MAX_CARRIED: 1,
  /** DEFAULT: no movement penalty while carrying. */
  CARRY_SPEED_MULT: 1.0,
  /** DEFAULT: a trap breaks and releases this many goblins, exactly once. */
  TRAP_GOBLINS: 2,
  /** Placement is seeded per wave (reproducible); identities are random. */
  PLACEMENT_SEED: 1337,
} as const;

export const TOWERS = {
  COUNT: 3,
  HP: 450,
  /** DEFAULT: each destroyed tower adds this to boss damage taken: 1.00, 1.25, 1.50, 1.75. */
  BOSS_DAMAGE_BONUS_PER_TOWER: 0.25,
} as const;

export function bossDamageMultiplier(towersDestroyed: number): number {
  return 1 + TOWERS.BOSS_DAMAGE_BONUS_PER_TOWER * towersDestroyed;
}

export const BOSS = {
  /** Scaled by WAVE_PLAN[wave].bossMult. */
  HP: 2400,
  SPEED: 150,
  RADIUS: 46,
  /** DEFAULT: once a target is picked it is kept at least this long (no jitter). */
  TARGET_COMMIT_MS: 3_000,
  /** Leash: farther than this from BOSS_ZONE and it walks home. */
  LEASH_RADIUS: 700,
  AGGRO_RADIUS: 600,
  /** Targeting score weights: proximity, recent damage dealt to the boss, carrying a crate. */
  TARGETING: { PROXIMITY: 1.0, RECENT_DAMAGE: 1.0, CARRIER_BONUS: 250, DAMAGE_DECAY_PER_SEC: 0.15 },
  /**
   * Three telegraphed attacks, cycled. windupMs is the dodge window the client
   * shows as a filling red area. Damage is scaled by bossMult.
   */
  ATTACKS: {
    sweep: { damage: 55, range: 120, arcDeg: 160, windupMs: 700, recoverMs: 600 },
    slam: { damage: 80, radius: 150, windupMs: 1000, recoverMs: 900 },
    charge: { damage: 60, distance: 360, width: 80, windupMs: 800, recoverMs: 1000 },
  },
  /** Minimum pause between attacks. */
  ATTACK_INTERVAL_MS: 1_200,
} as const;

export const GOBLINS = {
  /** Scaled by WAVE_PLAN[wave].enemyMult. Speed and attack rate are NOT scaled. */
  HP: 80,
  DAMAGE: 12,
  SPEED: 160,
  RADIUS: 14,
  ATTACK_RANGE: 40,
  /** Telegraph before the hit lands (client shows "!"). */
  WINDUP_MS: 450,
  RECOVER_MS: 700,
  AGGRO_RADIUS: 520,
  /** Re-evaluate target at least this often. */
  RETARGET_MS: 1_000,
  /** DEFAULT: guards placed on 'g' tiles at the start of every wave. */
  GUARDS_PER_WAVE: 4,
  MAX_ALIVE: 40,
} as const;

export const COMBAT = {
  /** DEFAULT: no friendly fire. */
  FRIENDLY_FIRE: false,
  /** Boss is never stun-locked; hard CC only slows it by this much instead. */
  BOSS_CC_SLOW_MULT: 0.7,
} as const;

/** Optional AI layer. Off unless DIRECTOR_URL / DEBRIEF_URL are set. Never in the gameplay loop. */
export const DIRECTOR = {
  INTERVAL_MS: 12_000,
  TIMEOUT_MS: 2_500,
  /** Clamp on how hard the LLM may bias boss targeting. */
  MAX_THREAT_BIAS: 2.0,
  MIN_THREAT_BIAS: 0.5,
  TAUNT_MAX_CHARS: 90,
} as const;

export const BOTS = {
  /** DEV/SOLO mode only, labelled "(bot)". Five humans is the real mode. */
  FILL_EMPTY_SLOTS: true,
  REACTION_MS: 250,
} as const;
