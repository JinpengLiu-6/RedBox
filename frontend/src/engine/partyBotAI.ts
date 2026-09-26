/**
 * Goblin King Heist - Cooperative Bot AI for Uncontrolled Party Heroes
 * Allows a solo player or partial squad to lead a full 5-hero team.
 */

import { Hero, Enemy, Crate, Tower, Projectile, Turret, Particle, FloatingText, RectCollider, SquadOrder } from '../types/game';
import { WORLD_CONFIG, TEAM_CONFIG } from '../config/gameConfig';
import { executeHeroAttack, executeHeroSkill } from './combatSystem';
import { handleCrateInteraction } from './crateSystem';
import { checkCircleWallCollision } from './mapData';

export function updatePartyBotAI(
  dt: number,
  botHero: Hero,
  leaderHero: Hero,
  allHeroes: Hero[],
  enemies: Enemy[],
  crates: Crate[],
  towers: Tower[],
  projectiles: Projectile[],
  turrets: Turret[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  colliders: RectCollider[],
  currentWave: number,
  squadOrder: SquadOrder,
  destroyedTowersCount: number,
  enemyMultiplier: number
) {
  if (botHero.isDead || !botHero.isBot) return;

  // 1. If carrying a crate, high priority is to deliver it to base!
  if (botHero.carryingCrateId) {
    const base = WORLD_CONFIG.baseZone;
    const targetX = base.x + base.width / 2;
    const targetY = base.y + base.height / 2;

    moveToward(botHero, targetX, targetY, dt, colliders, true);

    // Defend self if enemies are close
    const nearestEnemy = findNearestEnemy(botHero.x, botHero.y, enemies, 180);
    if (nearestEnemy) {
      botHero.angle = Math.atan2(nearestEnemy.y - botHero.y, nearestEnemy.x - botHero.x);
      executeHeroAttack(
        botHero, nearestEnemy.x, nearestEnemy.y, projectiles, enemies, towers, particles, floatingTexts, destroyedTowersCount
      );
    }
    return;
  }

  // 2. Behavior based on Squad Order
  switch (squadOrder) {
    case 'DEFEND_BASE': {
      const base = WORLD_CONFIG.baseZone;
      const targetX = base.x + base.width / 2;
      const targetY = base.y + base.height / 2;
      const distToBase = Math.hypot(botHero.x - targetX, botHero.y - targetY);

      const nearestEnemy = findNearestEnemy(targetX, targetY, enemies, 380);
      if (nearestEnemy) {
        engageEnemy(
          botHero, nearestEnemy, dt, colliders, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
        );
      } else if (distToBase > 140) {
        moveToward(botHero, targetX, targetY, dt, colliders);
      }
      break;
    }

    case 'GATHER_CRATES': {
      // Find nearest unopened or revealed real crate
      let nearestCrate: Crate | null = null;
      let minCrateDist = Infinity;

      for (const crate of crates) {
        if (crate.isDelivered || crate.isDestroyed || crate.isCarried) continue;
        const d = Math.hypot(crate.x - botHero.x, crate.y - botHero.y);
        if (d < minCrateDist) {
          minCrateDist = d;
          nearestCrate = crate;
        }
      }

      if (nearestCrate) {
        if (minCrateDist <= TEAM_CONFIG.interactRadius) {
          // Interact with crate!
          handleCrateInteraction(
            botHero, crates, currentWave, particles, floatingTexts, enemyMultiplier
          );
        } else {
          moveToward(botHero, nearestCrate.x, nearestCrate.y, dt, colliders);
        }
      } else {
        // Fall back to following leader
        followLeader(botHero, leaderHero, dt, colliders);
      }
      break;
    }

    case 'FOCUS_BOSS': {
      const boss = enemies.find(e => e.type === 'goblin_king' && !e.isDead);
      const activeTower = towers.find(t => !t.isDestroyed);

      // Prioritize towers if any stand, otherwise boss
      const target = activeTower || boss;
      if (target) {
        const dist = Math.hypot(target.x - botHero.x, target.y - botHero.y);
        const desiredDist = botHero.heroClass === 'elf_mage' || botHero.heroClass === 'dwarf_demolitionist' ? 240 : 60;

        if (dist > desiredDist) {
          moveToward(botHero, target.x, target.y, dt, colliders);
        }
        botHero.angle = Math.atan2(target.y - botHero.y, target.x - botHero.x);

        // Attack target
        executeHeroAttack(
          botHero, target.x, target.y, projectiles, enemies, towers, particles, floatingTexts, destroyedTowersCount
        );
        tryUseBotSkills(
          botHero, target.x, target.y, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
        );
      } else {
        followLeader(botHero, leaderHero, dt, colliders);
      }
      break;
    }

    case 'FOLLOW':
    default: {
      // Check for immediate threats around bot or leader
      const nearestEnemy = findNearestEnemy(botHero.x, botHero.y, enemies, 260);

      if (nearestEnemy) {
        engageEnemy(
          botHero, nearestEnemy, dt, colliders, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
        );
      } else {
        followLeader(botHero, leaderHero, dt, colliders);
      }
      break;
    }
  }
}

function followLeader(bot: Hero, leader: Hero, dt: number, colliders: RectCollider[]) {
  const dist = Math.hypot(bot.x - leader.x, bot.y - leader.y);
  if (dist > 90) {
    moveToward(bot, leader.x, leader.y, dt, colliders);
  } else {
    bot.vx = 0;
    bot.vy = 0;
  }
}

function engageEnemy(
  bot: Hero,
  enemy: Enemy,
  dt: number,
  colliders: RectCollider[],
  currentWave: number,
  projectiles: Projectile[],
  turrets: Turret[],
  enemies: Enemy[],
  towers: Tower[],
  allHeroes: Hero[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number
) {
  const dist = Math.hypot(enemy.x - bot.x, enemy.y - bot.y);
  const desiredRange = (bot.heroClass === 'elf_mage' || bot.heroClass === 'dwarf_demolitionist') ? 220 : 55;

  if (dist > desiredRange) {
    moveToward(bot, enemy.x, enemy.y, dt, colliders);
  } else {
    bot.vx = 0;
    bot.vy = 0;
  }

  bot.angle = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);

  // Attack
  executeHeroAttack(
    bot, enemy.x, enemy.y, projectiles, enemies, towers, particles, floatingTexts, destroyedTowersCount
  );

  // Try skills
  tryUseBotSkills(
    bot, enemy.x, enemy.y, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
  );
}

function tryUseBotSkills(
  bot: Hero,
  targetX: number,
  targetY: number,
  currentWave: number,
  projectiles: Projectile[],
  turrets: Turret[],
  enemies: Enemy[],
  towers: Tower[],
  allHeroes: Hero[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number
) {
  // Wave 1+: Q skill
  if (currentWave >= 1 && bot.skills.q.currentCooldown <= 0) {
    executeHeroSkill(
      bot, 'Q', targetX, targetY, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
    );
  }

  // Wave 2+: E skill
  if (currentWave >= 2 && bot.skills.e.currentCooldown <= 0) {
    executeHeroSkill(
      bot, 'E', targetX, targetY, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
    );
  }

  // Wave 3: R skill
  if (currentWave >= 3 && bot.skills.r.currentCooldown <= 0) {
    executeHeroSkill(
      bot, 'R', targetX, targetY, currentWave, projectiles, turrets, enemies, towers, allHeroes, particles, floatingTexts, destroyedTowersCount
    );
  }
}

function moveToward(
  bot: Hero,
  targetX: number,
  targetY: number,
  dt: number,
  colliders: RectCollider[],
  isCarrying: boolean = false
) {
  const dx = targetX - bot.x;
  const dy = targetY - bot.y;
  const dist = Math.hypot(dx, dy) || 1;
  const baseSpeed = bot.speed * (isCarrying ? TEAM_CONFIG.crateSpeedPenalty : 1.0);

  bot.vx = (dx / dist) * baseSpeed;
  bot.vy = (dy / dist) * baseSpeed;
  bot.angle = Math.atan2(dy, dx);

  bot.x += bot.vx * dt;
  bot.y += bot.vy * dt;

  // Collision with walls
  const wallCheck = checkCircleWallCollision(bot.x, bot.y, 18, colliders);
  if (wallCheck.collided) {
    bot.x += wallCheck.pushX;
    bot.y += wallCheck.pushY;
  }
}

function findNearestEnemy(x: number, y: number, enemies: Enemy[], maxRadius: number): Enemy | null {
  let nearest: Enemy | null = null;
  let minDist = maxRadius;

  for (const enemy of enemies) {
    if (enemy.isDead) continue;
    const d = Math.hypot(enemy.x - x, enemy.y - y);
    if (d < minDist) {
      minDist = d;
      nearest = enemy;
    }
  }

  return nearest;
}
