/**
 * Goblin King Heist - Game Types & Interfaces
 */

export type HeroClass = 
  | 'elf_mage'
  | 'axe_troll'
  | 'human_brawler'
  | 'dwarf_demolitionist'
  | 'dual_blade_warrior';

export interface HeroSkill {
  id: string;
  name: string;
  key: 'Q' | 'E' | 'R';
  unlockedWave: number; // 1 for Q, 2 for E, 3 for R
  cooldown: number; // in seconds
  currentCooldown: number; // seconds remaining
  description: string;
  icon: string;
  range?: number;
}

export interface Hero {
  id: string; // 'player_1' ... 'player_5'
  heroClass: HeroClass;
  name: string;
  title: string;
  color: string;
  accentColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // facing angle in radians
  maxHp: number;
  hp: number;
  speed: number;
  isDead: boolean;
  respawnTimer: number;
  isBot: boolean;
  carryingCrateId: string | null;
  skills: {
    q: HeroSkill;
    e: HeroSkill;
    r: HeroSkill;
  };
  attackCooldown: number;
  shieldHp: number;
  invulnerableTimer: number;
  stealthedTimer: number;
  actionState: 'idle' | 'moving' | 'attacking' | 'whirlwind' | 'casting' | 'dead';
  actionTimer: number;
  kills: number;
  damageDealt: number;
  cratesDelivered: number;
}

export type CrateType = 'real' | 'trap';

export interface Crate {
  id: string;
  x: number;
  y: number;
  type: CrateType; // Authoritative only - client cannot see type before opening!
  isRevealed: boolean;
  isCarried: boolean;
  carriedByHeroId: string | null;
  isDelivered: boolean;
  isDestroyed: boolean; // if trap exploded
}

export type EnemyType = 'red_goblin' | 'goblin_spearman' | 'goblin_king';

export interface Enemy {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  currentAttackCooldown: number;
  isDead: boolean;
  targetHeroId: string | null;
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'windup' | 'stunned';
  stateTimer: number;
  specialCooldown: number; // For king shockwaves/minion call
  radius: number;
}

export interface Tower {
  id: string;
  x: number;
  y: number;
  name: string;
  hp: number;
  maxHp: number;
  isDestroyed: boolean;
  radius: number;
}

export interface Projectile {
  id: string;
  sourceHeroId?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: string;
  type: 'bolt' | 'pellet' | 'dynamite' | 'meteor' | 'turret_bullet' | 'king_shockwave';
  duration: number;
  maxDuration: number;
  aoeRadius?: number;
  splitsOnHit?: boolean;
}

export interface Turret {
  id: string;
  x: number;
  y: number;
  heroId: string;
  duration: number;
  shootCooldown: number;
  range: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'spark' | 'smoke' | 'wood' | 'blood' | 'magic' | 'confetti';
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  duration: number;
  maxDuration: number;
  size?: number;
}

export interface BaseZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RectCollider {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GameStatus = 'TITLE' | 'HERO_SELECT' | 'PLAYING' | 'WAVE_CLEAR' | 'VICTORY' | 'DEFEAT' | 'PAUSED';

export type SquadOrder = 'FOLLOW' | 'DEFEND_BASE' | 'GATHER_CRATES' | 'FOCUS_BOSS';

export interface GameState {
  status: GameStatus;
  wave: number; // 1, 2, 3
  maxWaves: number;
  requiredDeliveries: number;
  cratesDelivered: number;
  totalCratesInWave: number;
  realCratesInWave: number;
  trapCratesInWave: number;
  enemyStatMultiplier: number; // 1.0 for W1, 1.2 for W2, 1.3 for W3
  teamLives: number;
  maxTeamLives: number;
  activeHeroId: string; // The hero controlled by this client
  squadOrder: SquadOrder;
  matchStartTime: number;
  elapsedTime: number;
}
