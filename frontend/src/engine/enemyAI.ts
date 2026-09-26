/**
 * Goblin King Heist - Enemy AI & State Machines (Red Goblins, Spearmen & Goblin King)
 */

import { Enemy, Hero, Particle, FloatingText, RectCollider } from '../types/game';
import { BOSS_CONFIG } from '../config/gameConfig';
import { checkCircleWallCollision } from './mapData';
import { sound } from '../audio/soundEngine';

export function updateEnemyAI(
  dt: number,
  enemies: Enemy[],
  heroes: Hero[],
  colliders: RectCollider[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  waveNumber: number,
  enemyMultiplier: number
) {
  // Find alive heroes
  const aliveHeroes = heroes.filter(h => !h.isDead);

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.isDead) continue;

    // Cooldown reductions
    if (enemy.currentAttackCooldown > 0) enemy.currentAttackCooldown -= dt;
    if (enemy.specialCooldown > 0) enemy.specialCooldown -= dt;

    // Handle stun
    if (enemy.state === 'stunned') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'chase';
      }
      continue;
    }

    // Find closest target hero
    let targetHero: Hero | null = null;
    let minDist = Infinity;

    for (const hero of aliveHeroes) {
      // If hero is in smoke veil (stealthed), skip unless no other choice
      if (hero.stealthedTimer > 0 && aliveHeroes.length > 1) continue;

      const d = Math.hypot(hero.x - enemy.x, hero.y - enemy.y);
      if (d < minDist) {
        minDist = d;
        targetHero = hero;
      }
    }

    if (!targetHero) {
      // All heroes dead or unreachable - wander around
      enemy.vx *= 0.85;
      enemy.vy *= 0.85;
      continue;
    }

    enemy.targetHeroId = targetHero.id;
    const dx = targetHero.x - enemy.x;
    const dy = targetHero.y - enemy.y;
    const angle = Math.atan2(dy, dx);
    enemy.angle = angle;

    // ------------------------------------
    // GOBLIN KING SPECIAL AI
    // ------------------------------------
    if (enemy.type === 'goblin_king') {
      updateGoblinKingAI(dt, enemy, targetHero, minDist, aliveHeroes, enemies, particles, floatingTexts, waveNumber, enemyMultiplier);
    } else {
      // ------------------------------------
      // REGULAR RED GOBLIN & SPEARMAN AI
      // ------------------------------------
      if (minDist <= enemy.attackRange) {
        // In attack range
        enemy.vx = 0;
        enemy.vy = 0;

        if (enemy.currentAttackCooldown <= 0) {
          enemy.currentAttackCooldown = enemy.attackCooldown;
          // Execute attack on hero
          performEnemyAttack(enemy, targetHero, particles, floatingTexts);
        }
      } else {
        // Chase hero
        enemy.vx = Math.cos(angle) * enemy.speed;
        enemy.vy = Math.sin(angle) * enemy.speed;
      }
    }

    // Apply movement with friction & knockback decay
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    // Wall collision resolution
    const wallCheck = checkCircleWallCollision(enemy.x, enemy.y, enemy.radius, colliders);
    if (wallCheck.collided) {
      enemy.x += wallCheck.pushX;
      enemy.y += wallCheck.pushY;
    }
  }
}

function updateGoblinKingAI(
  dt: number,
  boss: Enemy,
  targetHero: Hero,
  distToHero: number,
  aliveHeroes: Hero[],
  allEnemies: Enemy[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  waveNumber: number,
  enemyMultiplier: number
) {
  const dx = targetHero.x - boss.x;
  const dy = targetHero.y - boss.y;
  const angle = Math.atan2(dy, dx);

  // 1. Check if King should trigger Royal Shockwave
  if (boss.specialCooldown <= 0 && distToHero < 220) {
    boss.specialCooldown = BOSS_CONFIG.shockwaveCooldown;
    boss.state = 'windup';
    boss.stateTimer = 0.5;

    sound.playBossRoar();

    floatingTexts.push({
      id: `boss_sw_${Date.now()}`,
      x: boss.x,
      y: boss.y - 60,
      text: '⚠️ ROYAL SHOCKWAVE!',
      color: '#f59e0b',
      duration: 1.8,
      maxDuration: 1.8,
      size: 17,
    });

    // Shockwave particle ring
    for (let p = 0; p < 36; p++) {
      const a = (p / 36) * Math.PI * 2;
      particles.push({
        x: boss.x,
        y: boss.y,
        vx: Math.cos(a) * 200,
        vy: Math.sin(a) * 200,
        life: 0.65,
        maxLife: 0.65,
        size: 5,
        color: '#f59e0b',
        type: 'spark',
      });
    }

    // Damage all heroes within shockwave
    aliveHeroes.forEach(h => {
      const d = Math.hypot(h.x - boss.x, h.y - boss.y);
      if (d <= 220) {
        applyDamageToHero(h, Math.round(boss.damage * 0.9), particles, floatingTexts);
        // Knock hero back
        const knockAngle = Math.atan2(h.y - boss.y, h.x - boss.x);
        h.x += Math.cos(knockAngle) * 50;
        h.y += Math.sin(knockAngle) * 50;
      }
    });

    return;
  }

  // 2. King Basic Melee Swing
  if (distToHero <= boss.attackRange) {
    boss.vx = 0;
    boss.vy = 0;

    if (boss.currentAttackCooldown <= 0) {
      boss.currentAttackCooldown = boss.attackCooldown;
      sound.playAttack('cleave');
      performEnemyAttack(boss, targetHero, particles, floatingTexts);
    }
  } else {
    // Chase target
    boss.vx = Math.cos(angle) * boss.speed;
    boss.vy = Math.sin(angle) * boss.speed;
  }
}

function performEnemyAttack(
  enemy: Enemy,
  hero: Hero,
  particles: Particle[],
  floatingTexts: FloatingText[]
) {
  // Apply damage to hero
  applyDamageToHero(hero, enemy.damage, particles, floatingTexts);

  // Hit sound & animation
  if (enemy.type === 'goblin_king') {
    sound.playAttack('cleave');
  } else {
    sound.playAttack('dagger');
  }
}

export function applyDamageToHero(
  hero: Hero,
  amount: number,
  particles: Particle[],
  floatingTexts: FloatingText[]
) {
  if (hero.isDead || hero.invulnerableTimer > 0) return;

  let damageLeft = amount;

  // Absorb with shield first
  if (hero.shieldHp > 0) {
    if (hero.shieldHp >= damageLeft) {
      hero.shieldHp -= damageLeft;
      floatingTexts.push({
        id: `shield_${Date.now()}_${Math.random()}`,
        x: hero.x,
        y: hero.y - 30,
        text: `🛡️ -${damageLeft}`,
        color: '#60a5fa',
        duration: 0.6,
        maxDuration: 0.6,
      });
      return;
    } else {
      damageLeft -= hero.shieldHp;
      hero.shieldHp = 0;
    }
  }

  hero.hp -= damageLeft;

  floatingTexts.push({
    id: `hp_dmg_${Date.now()}_${Math.random()}`,
    x: hero.x,
    y: hero.y - 25,
    text: `-${damageLeft}`,
    color: '#ef4444',
    duration: 0.7,
    maxDuration: 0.7,
    size: 14,
  });

  // Blood particles
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: hero.x,
      y: hero.y,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      life: 0.3,
      maxLife: 0.3,
      size: 3,
      color: '#dc2626',
      type: 'blood',
    });
  }

  if (hero.hp <= 0 && !hero.isDead) {
    hero.hp = 0;
    hero.isDead = true;
    hero.respawnTimer = 6.0; // 6s respawn timer
    hero.actionState = 'dead';

    floatingTexts.push({
      id: `hero_down_${Date.now()}_${hero.id}`,
      x: hero.x,
      y: hero.y - 45,
      text: `💀 ${hero.title} DOWN!`,
      color: '#ef4444',
      duration: 2.5,
      maxDuration: 2.5,
      size: 16,
    });
  }
}
