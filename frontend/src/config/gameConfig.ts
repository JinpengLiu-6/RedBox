/**
 * Goblin King Heist - Game Configuration & Authoritative Tuning
 */

import { HeroClass, HeroSkill } from '../types/game';

export interface WaveConfig {
  wave: number;
  totalCrates: number;
  realCrates: number;
  trapCrates: number;
  requiredDeliveries: number;
  enemyMultiplier: number; // 1.0, 1.20, 1.30 (not compounded)
  roamingGoblins: number;
  spearmenCount: number;
}

export const WAVE_CONFIGS: Record<number, WaveConfig> = {
  1: {
    wave: 1,
    totalCrates: 15,
    realCrates: 3,
    trapCrates: 12,
    requiredDeliveries: 3,
    enemyMultiplier: 1.0,
    roamingGoblins: 6,
    spearmenCount: 2,
  },
  2: {
    wave: 2,
    totalCrates: 10,
    realCrates: 2,
    trapCrates: 8,
    requiredDeliveries: 2,
    enemyMultiplier: 1.20, // +20% over Wave 1
    roamingGoblins: 9,
    spearmenCount: 4,
  },
  3: {
    wave: 3,
    totalCrates: 12,
    realCrates: 3,
    trapCrates: 9,
    requiredDeliveries: 3,
    enemyMultiplier: 1.30, // +30% over Wave 1 (NOT 1.2 * 1.3 = 1.56)
    roamingGoblins: 12,
    spearmenCount: 6,
  },
};

export const WORLD_CONFIG = {
  // World dimensions: Area ~ 3x standard viewport (approx 2400 x 1600 px)
  width: 2400,
  height: 1600,
  tileSize: 64,
  baseZone: {
    x: 80,
    y: 1180,
    width: 320,
    height: 320,
  },
};

export const TEAM_CONFIG = {
  initialLives: 5,
  respawnTimeSeconds: 6,
  reviveRadius: 70,
  crateSpeedPenalty: 0.85, // 15% slower when carrying crate
  interactRadius: 65,
};

export const TOWER_CONFIG = {
  maxHp: 280,
  radius: 36,
  towers: [
    { id: 'tower_nw', name: 'Northwest Runic Spire', x: 420, y: 380 },
    { id: 'tower_ne', name: 'Northeast Runic Spire', x: 1980, y: 380 },
    { id: 'tower_se', name: 'Southeast Runic Spire', x: 1950, y: 1220 },
  ],
  // Damage multiplier to boss based on destroyed count (0 to 3)
  getBossDamageMultiplier: (destroyedCount: number) => {
    switch (destroyedCount) {
      case 0: return 0.25; // 75% damage reduction
      case 1: return 0.50; // 50% damage reduction
      case 2: return 0.75; // 25% damage reduction
      case 3:
      default:
        return 1.00; // 100% full damage (vulnerable)
    }
  },
};

export const BOSS_CONFIG = {
  baseHp: 1600,
  baseDamage: 28,
  speed: 105,
  radius: 46,
  spawnX: 1200,
  spawnY: 450,
  shockwaveCooldown: 9,
  summonMinionCooldown: 16,
};

export const HERO_TEMPLATES: Record<HeroClass, {
  name: string;
  title: string;
  color: string;
  accentColor: string;
  maxHp: number;
  speed: number;
  attackDmg: number;
  attackRange: number;
  attackRate: number; // shots/swings per second
  description: string;
  skills: {
    q: Omit<HeroSkill, 'currentCooldown'>;
    e: Omit<HeroSkill, 'currentCooldown'>;
    r: Omit<HeroSkill, 'currentCooldown'>;
  };
}> = {
  elf_mage: {
    name: 'Lyra Moonwhisper',
    title: 'Elf Mage',
    color: '#a855f7',
    accentColor: '#c084fc',
    maxHp: 130,
    speed: 195,
    attackDmg: 28,
    attackRange: 380,
    attackRate: 1.4,
    description: 'Master of arcane arts. Casts Frost Wave projectiles, blinks through danger, and calls down cosmic blasts.',
    skills: {
      q: {
        id: 'frost_wave',
        name: 'Frost Wave',
        key: 'Q',
        unlockedWave: 1,
        cooldown: 4.5,
        description: 'Blasts 5 piercing icy shards in a frontal arc, freezing and damaging all enemies.',
        icon: 'Sparkles',
        range: 320,
      },
      e: {
        id: 'blink_ward',
        name: 'Mystic Blink',
        key: 'E',
        unlockedWave: 2,
        cooldown: 8.0,
        description: 'Teleports 160px toward the target and grants 40 shield to self and adjacent squad members.',
        icon: 'Zap',
        range: 160,
      },
      r: {
        id: 'astral_meteor',
        name: 'Astral Meteor',
        key: 'R',
        unlockedWave: 3,
        cooldown: 18.0,
        description: 'Calls a cataclysmic meteor from the heavens, dealing 140 damage in a vast crater and searing enemies.',
        icon: 'Flame',
        range: 450,
      },
    },
  },

  axe_troll: {
    name: 'Grimjaw Ironhide',
    title: 'Axe Troll',
    color: '#16a34a',
    accentColor: '#4ade80',
    maxHp: 220,
    speed: 180,
    attackDmg: 38,
    attackRange: 80,
    attackRate: 1.1,
    description: 'Mighty bruiser wielding a colossal greataxe. Cleaves goblin swarms and roars to bolster party defenses.',
    skills: {
      q: {
        id: 'axe_whirlwind',
        name: 'Whirlwind',
        key: 'Q',
        unlockedWave: 1,
        cooldown: 6.5,
        description: 'Spins into an unstoppable cyclone for 1.8s, shredding surrounding enemies for 70 total damage.',
        icon: 'RotateCw',
        range: 110,
      },
      e: {
        id: 'berserker_roar',
        name: 'Berserker Roar',
        key: 'E',
        unlockedWave: 2,
        cooldown: 11.0,
        description: 'Unleashes a blood-curdling roar, boosting squad movement speed by 40% and adding 50 temporary armor.',
        icon: 'ShieldAlert',
        range: 220,
      },
      r: {
        id: 'earthshaker_leap',
        name: 'Earthshaker Slam',
        key: 'R',
        unlockedWave: 3,
        cooldown: 19.0,
        description: 'Leaps high into the air and crashes down, fracturing the dungeon floor for 150 damage and stunning for 2.2s.',
        icon: 'TrendingDown',
        range: 320,
      },
    },
  },

  human_brawler: {
    name: 'Marcus Steelist',
    title: 'Human Brawler',
    color: '#2563eb',
    accentColor: '#60a5fa',
    maxHp: 185,
    speed: 195,
    attackDmg: 26,
    attackRange: 75,
    attackRate: 1.9,
    description: 'Disciplined pit fighter with brass-plated gauntlets. Stuns foes with rocket haymakers and counters attacks.',
    skills: {
      q: {
        id: 'rocket_haymaker',
        name: 'Rocket Haymaker',
        key: 'Q',
        unlockedWave: 1,
        cooldown: 5.0,
        description: 'Dashes forward with explosive force, dealing 55 damage and knocking target enemies backwards.',
        icon: 'Crosshair',
        range: 140,
      },
      e: {
        id: 'iron_aegis',
        name: 'Iron Aegis',
        key: 'E',
        unlockedWave: 2,
        cooldown: 9.5,
        description: 'Raises spiked guards, deflecting 60% of incoming damage and dealing half back to attackers for 4s.',
        icon: 'Shield',
        range: 0,
      },
      r: {
        id: 'seismic_uppercut',
        name: 'Flurry of Blows',
        key: 'R',
        unlockedWave: 3,
        cooldown: 16.0,
        description: 'Unleashes a rapid barrage of shockwave punches in a frontal cone, inflicting 160 total damage.',
        icon: 'Activity',
        range: 130,
      },
    },
  },

  dwarf_demolitionist: {
    name: 'Brokk Powderkeg',
    title: 'Dwarf Demolitionist',
    color: '#ea580c',
    accentColor: '#fb923c',
    maxHp: 160,
    speed: 185,
    attackDmg: 32,
    attackRange: 280,
    attackRate: 1.2,
    description: 'Sapper engineer carrying high-grade explosives and an automated deployable bullet turret.',
    skills: {
      q: {
        id: 'cluster_dynamite',
        name: 'Cluster Dynamite',
        key: 'Q',
        unlockedWave: 1,
        cooldown: 6.0,
        description: 'Lobs a bundle of dynamite that detonates for 60 damage and splits into 3 shrapnel bursts.',
        icon: 'Bomb',
        range: 300,
      },
      e: {
        id: 'automated_turret',
        name: 'Auto-Sentry Turret',
        key: 'E',
        unlockedWave: 2,
        cooldown: 13.0,
        description: 'Constructs an automated brass turret that rapidly fires at incoming enemies for 10 seconds.',
        icon: 'Radio',
        range: 80,
      },
      r: {
        id: 'mega_bofors',
        name: 'Mega Bofors Bomb',
        key: 'R',
        unlockedWave: 3,
        cooldown: 21.0,
        description: 'Calls in a tactical mortar strike, blowing a massive crater for 180 devastating damage.',
        icon: 'Radioactive',
        range: 420,
      },
    },
  },

  dual_blade_warrior: {
    name: 'Kaelen Shadowveil',
    title: 'Dual-Blade Warrior',
    color: '#0d9488',
    accentColor: '#2dd4bf',
    maxHp: 150,
    speed: 215,
    attackDmg: 34,
    attackRange: 85,
    attackRate: 1.8,
    description: 'Swift assassin wielding twin enchanted short-swords. Dashes through enemy ranks with supreme agility.',
    skills: {
      q: {
        id: 'shadow_dash',
        name: 'Blade Dash',
        key: 'Q',
        unlockedWave: 1,
        cooldown: 4.5,
        description: 'Slices instantly through enemies in a line, dealing 50 damage and increasing movement speed.',
        icon: 'Wind',
        range: 180,
      },
      e: {
        id: 'smoke_parry',
        name: 'Smoke Veil',
        key: 'E',
        unlockedWave: 2,
        cooldown: 10.0,
        description: 'Disappears into shadowy smoke for 2 seconds. The next basic attack deals guaranteed 100% critical strike.',
        icon: 'Cloud',
        range: 0,
      },
      r: {
        id: 'thousand_cuts',
        name: 'Thousand Slashes',
        key: 'R',
        unlockedWave: 3,
        cooldown: 17.0,
        description: 'Flashes between all surrounding foes in the blink of an eye, striking 8 times for 25 damage each (200 total).',
        icon: 'Scissors',
        range: 220,
      },
    },
  },
};
