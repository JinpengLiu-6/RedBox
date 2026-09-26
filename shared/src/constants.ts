/**
 * Single source of truth for balance. Agents read from here and never hardcode
 * numbers in systems. Tuning the match to its 5-7 minute budget happens in this
 * file only.
 */

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const PATCH_RATE = 20;
/** Client renders this far in the past so it always interpolates, never extrapolates. */
export const INTERP_DELAY_MS = 100;

export const MATCH = {
  /** Hard cap. Timer hitting zero is a loss, so a demo run can never overrun. */
  DURATION_MS: 420_000,
  TEAM_SIZE: 5,
  BOXES_TO_WIN: 3,
  COUNTDOWN_MS: 3_000,
} as const;

export const MAP = {
  TILE: 32,
  WIDTH_TILES: 60,
  HEIGHT_TILES: 60,
  get WIDTH_PX() { return MAP.WIDTH_TILES * MAP.TILE; },
  get HEIGHT_PX() { return MAP.HEIGHT_TILES * MAP.TILE; },
  /** Delivery zone. Also the respawn point. */
  BASE: { x: 240, y: 1680, radius: 160 },
  /** Boss arena centre; crystals ring its edge. */
  BOSS_ZONE: { x: 1440, y: 400, radius: 560 },
} as const;

export const PLAYER = {
  LIVES: 3,
  RESPAWN_MS: 5_000,
  /** One self-revive resource pickup per player per match (GDD 14). */
  REVIVE_CHARGES: 1,
  REVIVE_PICKUP_RADIUS: 56,
  /** Movement intents older than this are dropped as stale. */
  INPUT_MAX_AGE_MS: 500,
} as const;

export const BOXES = {
  TOTAL: 12,
  REAL: 5,
  FAKE: 7,
  /** Of the real ones, how many are invisible until a scan reveals them. */
  CAMOUFLAGED: 2,
  PICKUP_RADIUS: 48,
  DELIVER_RADIUS: 96,
  /** Carrier speed multiplier while hauling. */
  CARRY_SPEED_MULT: 0.62,
  /** Dropped on death; anyone may re-haul it. */
  DROP_ON_DEATH: true,
} as const;

export const SCAN = {
  RADIUS: 260,
  /** Reveal is team-wide and permanent once found - that is the Scanner's value. */
  PERMANENT: true,
  COOLDOWN_MS: 8_000,
} as const;

export const CRYSTALS = {
  /** Crystals required per stage. Tuned down from the GDD's 3/5/7 for the time budget. */
  PER_STAGE: [2, 3, 4],
  HP: 220,
  /** Only the Ranged class can damage crystals (GDD 4). */
  RANGED_ONLY: true,
  RESPAWN_RING_RADIUS: 520,
} as const;

export const BOSS = {
  LIVES: 3,
  HP_PER_LIFE: 1000,
  SPEED: 170,
  DAMAGE: 45,
  ATTACK_RANGE: 90,
  ATTACK_COOLDOWN_MS: 1_400,
  /** Window during which the boss can be damaged after a crystal set falls. */
  VULNERABLE_MS: 20_000,
  /** HP carries across windows - progress is never lost, which is kinder on a 6 min match. */
  HP_PERSISTS_BETWEEN_WINDOWS: true,
  THREAT: {
    PER_DAMAGE: 1.0,
    PER_HEAL: 0.5,
    /** Taunt sets the caster above the current leader by this fraction. */
    TAUNT_OVERSHOOT: 0.3,
    DECAY_PER_SEC: 0.02,
    /** Hysteresis: only switch target if the challenger leads by this much. */
    SWITCH_MARGIN: 0.15,
  },
} as const;

export const WAVES = {
  FIRST_SPAWN_MS: 30_000,
  INTERVAL_MS: 25_000,
  /** Wave size and strength both key off total crystals destroyed. */
  BASE_COUNT: 3,
  COUNT_PER_CRYSTAL: 1,
  CREEP_HP: 80,
  CREEP_HP_PER_CRYSTAL: 20,
  CREEP_DAMAGE: 10,
  CREEP_DAMAGE_PER_CRYSTAL: 2,
  CREEP_SPEED: 160,
  MAX_ALIVE: 24,
} as const;

export const FAKE_BOX = {
  DAMAGE_AMP_MULT: 2.0,
  DAMAGE_AMP_MS: 12_000,
  SLOW_MULT: 0.7,
  SLOW_MS: 10_000,
  AMBUSH_COUNT: 4,
} as const;

export const PROGRESSION = {
  STARTING_SKILL_POINTS: 1,
  MAX_RANK: 2,
  /** Skill points awarded per objective completed. */
  POINTS: {
    BOX_DELIVERED: 1,
    CRYSTAL_SET_CLEARED: 1,
    BOSS_LIFE_REMOVED: 1,
  },
} as const;

export const DIRECTOR = {
  /** How often the Modal boss director is consulted. Never blocks the tick. */
  INTERVAL_MS: 12_000,
  TIMEOUT_MS: 2_500,
  /** Clamp on how hard the LLM may bias threat, so it can never break the Tank fantasy. */
  MAX_THREAT_BIAS: 2.0,
  MIN_THREAT_BIAS: 0.5,
  TAUNT_MAX_CHARS: 90,
} as const;

export const BOTS = {
  /** Empty slots are filled so a single judge can play a full match solo. */
  FILL_EMPTY_SLOTS: true,
  FOLLOW_DISTANCE: 140,
  REACTION_MS: 250,
} as const;
