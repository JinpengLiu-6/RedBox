/**
 * The five heroes (MVP plan: "Proposed hero kits"). Everything here is tuning
 * data - damage, ranges, cooldowns, durations - so balancing never touches code.
 *
 * Every hero fights and every hero can carry crates; any hero can scan a crate,
 * the dwarf fastest. Slot 0 (Q) is open in wave 1, slot 1 (E) unlocks in
 * wave 2, slot 2 (R) in wave 3.
 */

export const CLASS_IDS = ['mage', 'troll', 'brawler', 'dwarf', 'warrior'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** Wire representation - schema fields use the index, not the string. */
export const CLASS_INDEX: Record<ClassId, number> = {
  mage: 0, troll: 1, brawler: 2, dwarf: 3, warrior: 4,
};
export const CLASS_BY_INDEX = CLASS_IDS;

/**
 * How the basic attack resolves (combat.ts):
 *   bolt   - hits the first enemy along the aim ray within range, needs line of sight
 *   swing  - hits every enemy inside an arc in front of the hero
 *   strike - hits the single nearest enemy inside a narrow arc (fast combos)
 */
export type AttackKind = 'bolt' | 'swing' | 'strike';

export type AbilityTargeting = 'self' | 'point' | 'direction';

export interface AbilitySpec {
  id: string;
  name: string;
  /** 0 = Q, 1 = E, 2 = R. Equals the wave index that unlocks it. */
  slot: 0 | 1 | 2;
  targeting: AbilityTargeting;
  cooldownMs: number;
  /** Max cast distance for point/direction abilities. */
  range?: number;
  /** Named numbers the ability handler reads. Units are in the key name. */
  params: Readonly<Record<string, number>>;
  description: string;
}

export interface ClassSpec {
  id: ClassId;
  name: string;
  maxHp: number;
  speed: number;
  attackKind: AttackKind;
  attackDamage: number;
  attackRange: number;
  /** Full arc in degrees for swing/strike. Ignored for bolt. */
  attackArcDeg: number;
  attackCooldownMs: number;
  /** Crate scan speed multiplier (default 1). */
  scanSpeed?: number;
  /** Ring colour in the target art. */
  color: number;
  abilities: readonly [AbilitySpec, AbilitySpec, AbilitySpec];
}

export const CLASSES: Record<ClassId, ClassSpec> = {
  mage: {
    id: 'mage', name: 'Elf Mage',
    maxHp: 420, speed: 215,
    attackKind: 'bolt', attackDamage: 28, attackRange: 380, attackArcDeg: 0, attackCooldownMs: 700,
    color: 0xa855f7,
    abilities: [
      { id: 'frost_wave', name: 'Frost Wave', slot: 0, targeting: 'direction', cooldownMs: 6000, range: 260,
        params: { damage: 60, arcDeg: 70, slowMult: 0.5, slowMs: 2500 },
        description: 'Cone of frost: damages and slows enemies in front.' },
      { id: 'blink', name: 'Blink', slot: 1, targeting: 'point', cooldownMs: 8000, range: 320,
        params: {},
        description: 'Short teleport toward the cursor. Cannot pass through walls.' },
      { id: 'meteor', name: 'Meteor', slot: 2, targeting: 'point', cooldownMs: 14000, range: 420,
        params: { damage: 220, radius: 140, delayMs: 1200 },
        description: 'Marks an area; a meteor lands after a delay.' },
    ],
  },
  troll: {
    id: 'troll', name: 'Axe Troll',
    maxHp: 950, speed: 185,
    attackKind: 'swing', attackDamage: 40, attackRange: 85, attackArcDeg: 140, attackCooldownMs: 1100,
    color: 0x22c55e,
    abilities: [
      { id: 'whirlwind', name: 'Whirlwind', slot: 0, targeting: 'self', cooldownMs: 7000,
        params: { damage: 55, radius: 150 },
        description: 'Spins the axe, hitting everything around.' },
      { id: 'earth_splitter', name: 'Earth Splitter', slot: 1, targeting: 'direction', cooldownMs: 10000, range: 380,
        params: { damage: 90, width: 70, slowMult: 0.5, slowMs: 2500 },
        description: 'A forward shockwave line that damages and slows.' },
      { id: 'rage', name: 'Rage', slot: 2, targeting: 'self', cooldownMs: 20000,
        params: { durationMs: 6000, attackCooldownMult: 0.6, damageTakenMult: 0.6 },
        description: 'Faster swings and less damage taken for a while.' },
    ],
  },
  brawler: {
    id: 'brawler', name: 'Human Brawler',
    maxHp: 700, speed: 210,
    attackKind: 'strike', attackDamage: 18, attackRange: 55, attackArcDeg: 70, attackCooldownMs: 420,
    color: 0xef4444,
    abilities: [
      { id: 'shoulder_charge', name: 'Shoulder Charge', slot: 0, targeting: 'direction', cooldownMs: 7000, range: 260,
        params: { damage: 45, knockbackPx: 120 },
        description: 'Dashes forward, knocking goblins aside.' },
      { id: 'ground_slam', name: 'Ground Slam', slot: 1, targeting: 'self', cooldownMs: 11000,
        params: { damage: 40, radius: 170, stunMs: 1800 },
        description: 'Stuns nearby goblins. The boss is damaged, not stunned.' },
      { id: 'unstoppable', name: 'Unstoppable', slot: 2, targeting: 'self', cooldownMs: 20000,
        params: { durationMs: 6000, damageDealtMult: 1.7 },
        description: 'Immune to knockback and punches much harder.' },
    ],
  },
  dwarf: {
    id: 'dwarf', name: 'Dwarf Demolitionist',
    maxHp: 600, speed: 195,
    attackKind: 'bolt', attackDamage: 34, attackRange: 320, attackArcDeg: 0, attackCooldownMs: 950,
    scanSpeed: 2,
    color: 0x3b82f6,
    abilities: [
      { id: 'grenade', name: 'Grenade', slot: 0, targeting: 'point', cooldownMs: 6000, range: 360,
        params: { damage: 75, radius: 100, delayMs: 600 },
        description: 'Lobs a grenade that explodes on landing.' },
      { id: 'mine', name: 'Mine', slot: 1, targeting: 'point', cooldownMs: 9000, range: 120,
        params: { damage: 140, radius: 110, triggerRadius: 50, lifetimeMs: 30000 },
        description: 'Plants a mine that explodes when a goblin steps near.' },
      { id: 'mega_bomb', name: 'Mega Bomb', slot: 2, targeting: 'point', cooldownMs: 18000, range: 300,
        params: { damage: 320, radius: 220, delayMs: 2000 },
        description: 'A huge bomb with a long fuse.' },
    ],
  },
  warrior: {
    id: 'warrior', name: 'Dual-Blade Warrior',
    maxHp: 620, speed: 225,
    attackKind: 'strike', attackDamage: 16, attackRange: 60, attackArcDeg: 80, attackCooldownMs: 360,
    color: 0xf59e0b,
    abilities: [
      { id: 'slashing_dash', name: 'Slashing Dash', slot: 0, targeting: 'direction', cooldownMs: 6000, range: 220,
        params: { damage: 55, width: 60 },
        description: 'Dashes forward, cutting everything along the path.' },
      { id: 'parry', name: 'Parry', slot: 1, targeting: 'self', cooldownMs: 9000,
        params: { windowMs: 800, counterDamage: 80 },
        description: 'Blocks all damage briefly and counters each attacker.' },
      { id: 'blade_dance', name: 'Blade Dance', slot: 2, targeting: 'self', cooldownMs: 18000,
        params: { durationMs: 3000, damagePerTick: 22, radius: 120, tickMs: 250 },
        description: 'Spins while moving, hitting everything around repeatedly.' },
    ],
  },
};

export function classByIndex(i: number): ClassSpec {
  return CLASSES[CLASS_BY_INDEX[i] ?? 'mage'];
}
