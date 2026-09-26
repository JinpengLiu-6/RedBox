/**
 * Class and ability definitions. One agent owns one class file on the server and
 * implements `AbilityHandler` for each of its three abilities; nothing else in
 * the codebase needs to know a class exists.
 */

export const CLASS_IDS = ['tank', 'ranged', 'carrier', 'support', 'scanner'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Wire representation - schema fields use the index, not the string. */
export const CLASS_INDEX: Record<ClassId, number> = {
  tank: 0, ranged: 1, carrier: 2, support: 3, scanner: 4,
};
export const CLASS_BY_INDEX = CLASS_IDS;

export type AbilityTargeting = 'self' | 'point' | 'ally' | 'enemy';

export interface AbilitySpec {
  id: string;
  name: string;
  targeting: AbilityTargeting;
  /** Cooldown per rank, index 0 = rank 1. Length must be MAX_RANK. */
  cooldownMs: readonly number[];
  /** Free-form per-rank magnitudes; each ability file reads its own keys. */
  magnitude: readonly number[];
  range?: number;
  description: string;
}

export interface ClassSpec {
  id: ClassId;
  name: string;
  maxHp: number;
  speed: number;
  /** 0 means the class has no weapon at all (Carrier). */
  attackDamage: number;
  attackRange: number;
  attackCooldownMs: number;
  /** Used by the client for role-legible colour coding. */
  color: number;
  abilities: readonly [AbilitySpec, AbilitySpec, AbilitySpec];
}

export const CLASSES: Record<ClassId, ClassSpec> = {
  tank: {
    id: 'tank', name: 'Tank',
    maxHp: 900, speed: 190, attackDamage: 12, attackRange: 60, attackCooldownMs: 800,
    color: 0x3b82f6,
    abilities: [
      { id: 'taunt', name: 'Taunt', targeting: 'self', cooldownMs: [12000, 9000], magnitude: [1, 1], range: 500,
        description: 'Forces the boss onto you by spiking threat above the current leader.' },
      { id: 'bulwark', name: 'Bulwark', targeting: 'self', cooldownMs: [18000, 14000], magnitude: [0.5, 0.35],
        description: 'Incoming damage multiplier for 4s.' },
      { id: 'shockwave', name: 'Shockwave', targeting: 'self', cooldownMs: [20000, 16000], magnitude: [160, 220], range: 200,
        description: 'Knocks back nearby enemies and generates threat.' },
    ],
  },
  ranged: {
    id: 'ranged', name: 'Ranged',
    maxHp: 380, speed: 210, attackDamage: 34, attackRange: 420, attackCooldownMs: 700,
    color: 0xf59e0b,
    abilities: [
      { id: 'piercing_shot', name: 'Piercing Shot', targeting: 'enemy', cooldownMs: [8000, 6000], magnitude: [2.0, 2.75], range: 460,
        description: 'Damage multiplier against crystal towers.' },
      { id: 'volley', name: 'Volley', targeting: 'point', cooldownMs: [14000, 11000], magnitude: [40, 60], range: 420,
        description: 'Area damage at a point.' },
      { id: 'focus', name: 'Focus', targeting: 'self', cooldownMs: [20000, 16000], magnitude: [0.6, 0.45],
        description: 'Attack cooldown multiplier for 5s.' },
    ],
  },
  carrier: {
    id: 'carrier', name: 'Carrier',
    maxHp: 220, speed: 280, attackDamage: 0, attackRange: 0, attackCooldownMs: 0,
    color: 0x22c55e,
    abilities: [
      { id: 'blink', name: 'Blink', targeting: 'point', cooldownMs: [9000, 7000], magnitude: [300, 380], range: 380,
        description: 'Short teleport. Usable while carrying.' },
      { id: 'phase', name: 'Phase', targeting: 'self', cooldownMs: [20000, 16000], magnitude: [3000, 4000],
        description: 'Untargetable and invisible to AI for a few seconds.' },
      { id: 'sprint', name: 'Sprint', targeting: 'self', cooldownMs: [14000, 11000], magnitude: [1.6, 1.8],
        description: 'Speed multiplier for 3s. Cancels the carry penalty.' },
    ],
  },
  support: {
    id: 'support', name: 'Support',
    maxHp: 420, speed: 215, attackDamage: 14, attackRange: 300, attackCooldownMs: 900,
    color: 0xec4899,
    abilities: [
      { id: 'mend', name: 'Mend', targeting: 'ally', cooldownMs: [6000, 4500], magnitude: [200, 280], range: 340,
        description: 'Heals an ally. Healing generates boss threat.' },
      { id: 'barrier', name: 'Barrier', targeting: 'ally', cooldownMs: [15000, 12000], magnitude: [150, 220], range: 340,
        description: 'Absorbs damage until spent.' },
      { id: 'cleanse', name: 'Cleanse', targeting: 'self', cooldownMs: [18000, 14000], magnitude: [1, 1], range: 300,
        description: 'Clears fake-box debuffs from the team.' },
    ],
  },
  scanner: {
    id: 'scanner', name: 'Scanner',
    maxHp: 480, speed: 225, attackDamage: 22, attackRange: 240, attackCooldownMs: 750,
    color: 0xa855f7,
    abilities: [
      { id: 'scan', name: 'Scan', targeting: 'self', cooldownMs: [8000, 6000], magnitude: [260, 330],
        description: 'Reveals real and fake boxes in a radius, permanently, for the whole team.' },
      { id: 'ping', name: 'Ping', targeting: 'point', cooldownMs: [15000, 12000], magnitude: [1, 1], range: 600,
        description: 'Marks a location on every teammate screen.' },
      { id: 'decoy', name: 'Decoy', targeting: 'point', cooldownMs: [22000, 18000], magnitude: [6000, 8000], range: 300,
        description: 'Drops a decoy that pulls creep aggro.' },
    ],
  },
};

export function classByIndex(i: number): ClassSpec {
  return CLASSES[CLASS_BY_INDEX[i] ?? 'tank'];
}
