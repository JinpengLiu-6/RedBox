/**
 * Goblin King Heist - Authoritative Crate System
 * Guarantees exact wave crate distribution, authoritative reveals, anti-cheat & carrier safety.
 */

import { Crate, Hero, Enemy, Particle, FloatingText } from '../types/game';
import { WAVE_CONFIGS, WORLD_CONFIG, TEAM_CONFIG } from '../config/gameConfig';
import { sound } from '../audio/soundEngine';

export interface CrateInteractionResult {
  cratePickedUp?: Crate;
  crateDropped?: Crate;
  trapTriggered?: boolean;
  spawnedEnemies?: Enemy[];
  crateDelivered?: boolean;
}

// Tactical spawn areas for crates to ensure good distribution away from base
const SPAWN_ZONES = [
  { x: 340, y: 340 },   // NW room
  { x: 580, y: 220 },
  { x: 740, y: 440 },
  { x: 1980, y: 300 },  // NE room
  { x: 1760, y: 260 },
  { x: 2160, y: 520 },
  { x: 980, y: 640 },   // Mid north
  { x: 1420, y: 640 },
  { x: 1200, y: 780 },  // Center hall
  { x: 620, y: 880 },   // Mid west
  { x: 1780, y: 880 },  // Mid east
  { x: 920, y: 1080 },  // South mid
  { x: 1360, y: 1080 },
  { x: 1960, y: 1360 }, // SE alcove
  { x: 2180, y: 1140 },
  { x: 740, y: 1440 },  // South hall
  { x: 1200, y: 1380 },
  { x: 1540, y: 1440 },
  { x: 380, y: 800 },   // Near west
];

export function spawnWaveCrates(waveNumber: number): Crate[] {
  const config = WAVE_CONFIGS[waveNumber] || WAVE_CONFIGS[1];
  const total = config.totalCrates;
  const realCount = config.realCrates;
  const trapCount = config.trapCrates;

  // Build shuffled array of crate types
  const types: ('real' | 'trap')[] = [];
  for (let i = 0; i < realCount; i++) types.push('real');
  for (let i = 0; i < trapCount; i++) types.push('trap');

  // Fisher-Yates shuffle
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  // Shuffle candidate spawn locations
  const positions = [...SPAWN_ZONES];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const crates: Crate[] = [];
  for (let i = 0; i < total; i++) {
    const pos = positions[i % positions.length];
    // Add small random jitter so they aren't on rigid points
    const jitterX = (Math.random() - 0.5) * 60;
    const jitterY = (Math.random() - 0.5) * 60;

    crates.push({
      id: `crate_w${waveNumber}_${i + 1}`,
      x: Math.round(pos.x + jitterX),
      y: Math.round(pos.y + jitterY),
      type: types[i], // Secret authoritative type!
      isRevealed: false,
      isCarried: false,
      carriedByHeroId: null,
      isDelivered: false,
      isDestroyed: false,
    });
  }

  return crates;
}

/**
 * Handle hero pressing Interact [F] near a crate or base
 */
export function handleCrateInteraction(
  hero: Hero,
  crates: Crate[],
  waveNumber: number,
  particles: Particle[],
  floatingTexts: FloatingText[],
  enemyMultiplier: number
): CrateInteractionResult {
  const result: CrateInteractionResult = {};

  // Case 1: Hero is already carrying a crate -> DROP IT
  if (hero.carryingCrateId) {
    const carriedCrate = crates.find(c => c.id === hero.carryingCrateId);
    if (carriedCrate) {
      carriedCrate.isCarried = false;
      carriedCrate.carriedByHeroId = null;
      carriedCrate.x = hero.x;
      carriedCrate.y = hero.y;
      hero.carryingCrateId = null;
      result.crateDropped = carriedCrate;

      sound.playCrateInteract();
      floatingTexts.push({
        id: `ft_drop_${Date.now()}_${Math.random()}`,
        x: hero.x,
        y: hero.y - 40,
        text: 'Crate Dropped [F]',
        color: '#facc15',
        duration: 1.2,
        maxDuration: 1.2,
      });

      return result;
    }
    hero.carryingCrateId = null;
  }

  // Case 2: Hero is not carrying anything -> Look for nearest unopened or real crate on ground
  const interactRadiusSq = TEAM_CONFIG.interactRadius * TEAM_CONFIG.interactRadius;
  let nearestCrate: Crate | null = null;
  let nearestDistSq = Infinity;

  for (const crate of crates) {
    if (crate.isDelivered || crate.isDestroyed || crate.isCarried) continue;
    const dx = crate.x - hero.x;
    const dy = crate.y - hero.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= interactRadiusSq && distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestCrate = crate;
    }
  }

  if (!nearestCrate) {
    return result;
  }

  // Authoritative evaluation of the crate!
  if (!nearestCrate.isRevealed) {
    nearestCrate.isRevealed = true;

    if (nearestCrate.type === 'trap') {
      // It's a TRAP! Explode crate into splinter particles and spawn Red Goblins!
      nearestCrate.isDestroyed = true;
      result.trapTriggered = true;

      sound.playTrapAlert();
      sound.playExplosion();

      // Splinter explosion particles
      for (let p = 0; p < 25; p++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 140;
        particles.push({
          x: nearestCrate.x,
          y: nearestCrate.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.7,
          maxLife: 0.7,
          size: 4 + Math.random() * 5,
          color: Math.random() > 0.4 ? '#854d0e' : '#dc2626',
          type: 'wood',
        });
      }

      floatingTexts.push({
        id: `ft_trap_${Date.now()}_${Math.random()}`,
        x: nearestCrate.x,
        y: nearestCrate.y - 45,
        text: '⚠️ TRAP! GOBLIN AMBUSH!',
        color: '#ef4444',
        duration: 2.2,
        maxDuration: 2.2,
        size: 16,
      });

      // Spawn 2-3 aggressive Red Goblins right around the trap
      const goblinCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
      const newEnemies: Enemy[] = [];

      for (let g = 0; g < goblinCount; g++) {
        const offsetAngle = (g / goblinCount) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 35 + Math.random() * 25;
        const spawnX = nearestCrate.x + Math.cos(offsetAngle) * dist;
        const spawnY = nearestCrate.y + Math.sin(offsetAngle) * dist;

        const baseHp = 65;
        const baseDmg = 12;
        const scaledHp = Math.round(baseHp * enemyMultiplier);
        const scaledDmg = Math.round(baseDmg * enemyMultiplier);

        newEnemies.push({
          id: `goblin_trap_w${waveNumber}_${Date.now()}_${g}`,
          type: 'red_goblin',
          x: spawnX,
          y: spawnY,
          vx: 0,
          vy: 0,
          angle: offsetAngle,
          hp: scaledHp,
          maxHp: scaledHp,
          speed: 135,
          damage: scaledDmg,
          attackRange: 42,
          attackCooldown: 1.1,
          currentAttackCooldown: 0.3,
          isDead: false,
          targetHeroId: hero.id,
          state: 'chase',
          stateTimer: 0,
          specialCooldown: 0,
          radius: 18,
        });
      }

      result.spawnedEnemies = newEnemies;
      return result;
    } else {
      // It's a REAL crate!
      sound.playCrateInteract();

      // Golden sparkle particles
      for (let p = 0; p < 18; p++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 90;
        particles.push({
          x: nearestCrate.x,
          y: nearestCrate.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          life: 0.8,
          maxLife: 0.8,
          size: 3 + Math.random() * 4,
          color: '#fbbf24',
          type: 'magic',
        });
      }

      floatingTexts.push({
        id: `ft_real_${Date.now()}_${Math.random()}`,
        x: nearestCrate.x,
        y: nearestCrate.y - 45,
        text: '✨ REAL TREASURE CRATE!',
        color: '#34d399',
        duration: 2.0,
        maxDuration: 2.0,
        size: 16,
      });

      // Pick up the crate!
      nearestCrate.isCarried = true;
      nearestCrate.carriedByHeroId = hero.id;
      hero.carryingCrateId = nearestCrate.id;
      result.cratePickedUp = nearestCrate;
      return result;
    }
  } else {
    // Already revealed as real (e.g. was dropped previously)
    if (nearestCrate.type === 'real' && !nearestCrate.isDelivered) {
      sound.playCrateInteract();
      nearestCrate.isCarried = true;
      nearestCrate.carriedByHeroId = hero.id;
      hero.carryingCrateId = nearestCrate.id;
      result.cratePickedUp = nearestCrate;

      floatingTexts.push({
        id: `ft_pickup_${Date.now()}_${Math.random()}`,
        x: hero.x,
        y: hero.y - 40,
        text: 'Carrying Treasure Crate',
        color: '#34d399',
        duration: 1.2,
        maxDuration: 1.2,
      });

      return result;
    }
  }

  return result;
}

/**
 * Check if any carrying hero entered the base zone to deliver crate
 */
export function checkBaseDelivery(
  heroes: Hero[],
  crates: Crate[],
  particles: Particle[],
  floatingTexts: FloatingText[]
): { deliveredCount: number; deliveringHero: Hero | null } {
  let deliveredCount = 0;
  let deliveringHero: Hero | null = null;
  const base = WORLD_CONFIG.baseZone;

  for (const hero of heroes) {
    if (!hero.carryingCrateId || hero.isDead) continue;

    // Check if inside base boundary
    if (
      hero.x >= base.x &&
      hero.x <= base.x + base.width &&
      hero.y >= base.y &&
      hero.y <= base.y + base.height
    ) {
      const crate = crates.find(c => c.id === hero.carryingCrateId);
      if (crate && !crate.isDelivered) {
        crate.isDelivered = true;
        crate.isCarried = false;
        crate.carriedByHeroId = null;
        crate.x = base.x + base.width / 2 + (Math.random() - 0.5) * 80;
        crate.y = base.y + base.height / 2 + (Math.random() - 0.5) * 80;

        hero.carryingCrateId = null;
        hero.cratesDelivered += 1;
        deliveredCount += 1;
        deliveringHero = hero;

        sound.playDeliverySuccess();

        // Celebration confetti particles
        const colors = ['#34d399', '#facc15', '#60a5fa', '#f43f5e', '#a855f7'];
        for (let p = 0; p < 40; p++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = 60 + Math.random() * 180;
          particles.push({
            x: hero.x,
            y: hero.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 60,
            life: 1.5,
            maxLife: 1.5,
            size: 4 + Math.random() * 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            type: 'confetti',
          });
        }

        floatingTexts.push({
          id: `ft_deliv_${Date.now()}_${Math.random()}`,
          x: hero.x,
          y: hero.y - 50,
          text: '★ CRATE SECURED! ★',
          color: '#10b981',
          duration: 2.5,
          maxDuration: 2.5,
          size: 18,
        });
      }
    }
  }

  return { deliveredCount, deliveringHero };
}

/**
 * Ensures safe drop if a carrier dies or disconnects
 */
export function dropCarriedCrateOnDeath(hero: Hero, crates: Crate[]) {
  if (hero.carryingCrateId) {
    const crate = crates.find(c => c.id === hero.carryingCrateId);
    if (crate) {
      crate.isCarried = false;
      crate.carriedByHeroId = null;
      crate.x = hero.x;
      crate.y = hero.y;
    }
    hero.carryingCrateId = null;
  }
}
