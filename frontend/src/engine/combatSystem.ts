/**
 * Goblin King Heist - Combat System, Projectiles, Skills & Damage Processing
 */

import { Hero, Enemy, Tower, Projectile, Turret, Particle, FloatingText } from '../types/game';
import { TOWER_CONFIG } from '../config/gameConfig';
import { sound } from '../audio/soundEngine';

export interface CombatUpdateResult {
  towersDestroyedThisFrame: Tower[];
  enemiesKilledThisFrame: Enemy[];
  bossDefeated: boolean;
}

export function executeHeroAttack(
  hero: Hero,
  targetX: number,
  targetY: number,
  projectiles: Projectile[],
  enemies: Enemy[],
  towers: Tower[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number
) {
  if (hero.attackCooldown > 0 || hero.isDead) return;

  const dx = targetX - hero.x;
  const dy = targetY - hero.y;
  const angle = Math.atan2(dy, dx);
  hero.angle = angle;

  // Set attack cooldown based on class
  switch (hero.heroClass) {
    case 'elf_mage': {
      hero.attackCooldown = 0.65;
      sound.playAttack('bolt');

      // Shoot Arcane Bolt
      const speed = 480;
      projectiles.push({
        id: `bolt_${Date.now()}_${Math.random()}`,
        sourceHeroId: hero.id,
        x: hero.x + Math.cos(angle) * 20,
        y: hero.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        damage: 28,
        radius: 10,
        color: '#c084fc',
        type: 'bolt',
        duration: 0.8,
        maxDuration: 0.8,
        aoeRadius: 28,
      });
      break;
    }

    case 'axe_troll': {
      hero.attackCooldown = 0.85;
      sound.playAttack('cleave');

      // Wide frontal cleave
      performMeleeHit(
        hero,
        hero.x + Math.cos(angle) * 45,
        hero.y + Math.sin(angle) * 45,
        70,
        38,
        enemies,
        towers,
        particles,
        floatingTexts,
        destroyedTowersCount,
        '#22c55e'
      );
      break;
    }

    case 'human_brawler': {
      hero.attackCooldown = 0.45;
      sound.playAttack('punch');

      // Rapid punch strike
      performMeleeHit(
        hero,
        hero.x + Math.cos(angle) * 35,
        hero.y + Math.sin(angle) * 35,
        55,
        26,
        enemies,
        towers,
        particles,
        floatingTexts,
        destroyedTowersCount,
        '#3b82f6'
      );
      break;
    }

    case 'dwarf_demolitionist': {
      hero.attackCooldown = 0.8;
      sound.playAttack('shotgun');

      // Blunderbuss 3 pellets spread
      const spread = [-0.18, 0, 0.18];
      const speed = 420;
      spread.forEach(offset => {
        const a = angle + offset;
        projectiles.push({
          id: `pellet_${Date.now()}_${Math.random()}`,
          sourceHeroId: hero.id,
          x: hero.x + Math.cos(a) * 22,
          y: hero.y + Math.sin(a) * 22,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          damage: 14,
          radius: 6,
          color: '#fb923c',
          type: 'pellet',
          duration: 0.65,
          maxDuration: 0.65,
        });
      });
      break;
    }

    case 'dual_blade_warrior': {
      hero.attackCooldown = 0.5;
      sound.playAttack('dagger');

      const isCrit = hero.stealthedTimer > 0;
      const dmg = isCrit ? 68 : 34;
      if (isCrit) hero.stealthedTimer = 0;

      // Double slash
      performMeleeHit(
        hero,
        hero.x + Math.cos(angle) * 40,
        hero.y + Math.sin(angle) * 40,
        60,
        dmg,
        enemies,
        towers,
        particles,
        floatingTexts,
        destroyedTowersCount,
        '#2dd4bf',
        isCrit
      );
      break;
    }
  }
}

export function executeHeroSkill(
  hero: Hero,
  skillKey: 'Q' | 'E' | 'R',
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
  if (hero.isDead) return;

  const skill = hero.skills[skillKey.toLowerCase() as 'q' | 'e' | 'r'];
  if (!skill) return;

  // Verify wave requirement
  if (currentWave < skill.unlockedWave) {
    floatingTexts.push({
      id: `ft_locked_${Date.now()}_${Math.random()}`,
      x: hero.x,
      y: hero.y - 40,
      text: `${skillKey} Unlocks in Wave ${skill.unlockedWave}`,
      color: '#94a3b8',
      duration: 1.0,
      maxDuration: 1.0,
    });
    return;
  }

  // Check cooldown
  if (skill.currentCooldown > 0) {
    floatingTexts.push({
      id: `ft_cd_${Date.now()}_${Math.random()}`,
      x: hero.x,
      y: hero.y - 35,
      text: `${skill.name} on Cooldown (${skill.currentCooldown.toFixed(1)}s)`,
      color: '#f87171',
      duration: 0.8,
      maxDuration: 0.8,
    });
    return;
  }

  // Trigger skill
  skill.currentCooldown = skill.cooldown;
  sound.playSkill(skill.id);

  const dx = targetX - hero.x;
  const dy = targetY - hero.y;
  const angle = Math.atan2(dy, dx);
  hero.angle = angle;

  // --- Q SKILLS (Available Wave 1+) ---
  if (skillKey === 'Q') {
    switch (hero.heroClass) {
      case 'elf_mage': {
        // Frost Wave: shoot 5 freezing ice shards in forward fan
        const shardCount = 5;
        const fanSpread = 0.55; // total spread angle in radians
        const baseSpeed = 480;
        for (let s = 0; s < shardCount; s++) {
          const shardAngle = angle - fanSpread / 2 + (s / (shardCount - 1)) * fanSpread;
          projectiles.push({
            id: `frost_shard_${Date.now()}_${s}`,
            sourceHeroId: hero.id,
            x: hero.x + Math.cos(shardAngle) * 25,
            y: hero.y + Math.sin(shardAngle) * 25,
            vx: Math.cos(shardAngle) * baseSpeed,
            vy: Math.sin(shardAngle) * baseSpeed,
            damage: 32,
            radius: 8,
            color: '#38bdf8',
            type: 'bolt',
            duration: 0.75,
            maxDuration: 0.75,
            aoeRadius: 24,
          });
        }
        floatingTexts.push({
          id: `ft_q_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '❄️ FROST WAVE / ЛЕДЯНАЯ ВОЛНА',
          color: '#38bdf8',
          duration: 1.2, maxDuration: 1.2,
        });
        break;
      }
      case 'axe_troll': {
        // Whirlwind
        hero.actionState = 'whirlwind';
        hero.actionTimer = 1.8;
        createAoEImpact(
          hero.x, hero.y, 120, 65, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#16a34a'
        );
        floatingTexts.push({
          id: `ft_q_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '★ WHIRLWIND! ★',
          color: '#4ade80',
          duration: 1.2, maxDuration: 1.2,
        });
        break;
      }
      case 'human_brawler': {
        // Rocket Haymaker dash
        hero.x += Math.cos(angle) * 130;
        hero.y += Math.sin(angle) * 130;
        createAoEImpact(
          hero.x, hero.y, 90, 55, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#2563eb'
        );
        floatingTexts.push({
          id: `ft_q_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '★ HAYMAKER! ★',
          color: '#60a5fa',
          duration: 1.2, maxDuration: 1.2,
        });
        break;
      }
      case 'dwarf_demolitionist': {
        // Cluster Dynamite
        const speed = 360;
        projectiles.push({
          id: `dynamite_${Date.now()}`,
          sourceHeroId: hero.id,
          x: hero.x,
          y: hero.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          damage: 60,
          radius: 12,
          color: '#ea580c',
          type: 'dynamite',
          duration: 0.65,
          maxDuration: 0.65,
          aoeRadius: 110,
          splitsOnHit: true,
        });
        break;
      }
      case 'dual_blade_warrior': {
        // Blade Dash
        hero.x += Math.cos(angle) * 170;
        hero.y += Math.sin(angle) * 170;
        createAoEImpact(
          hero.x, hero.y, 85, 50, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#0d9488'
        );
        floatingTexts.push({
          id: `ft_q_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '★ BLADE DASH ★',
          color: '#2dd4bf',
          duration: 1.2, maxDuration: 1.2,
        });
        break;
      }
    }
  }

  // --- E SKILLS (Unlocks in Wave 2+) ---
  if (skillKey === 'E') {
    switch (hero.heroClass) {
      case 'elf_mage': {
        // Mystic Blink
        hero.x += Math.cos(angle) * 160;
        hero.y += Math.sin(angle) * 160;
        // Shield nearby allies
        allHeroes.forEach(h => {
          const d = Math.hypot(h.x - hero.x, h.y - hero.y);
          if (d < 180 && !h.isDead) {
            h.shieldHp = Math.min(h.shieldHp + 45, 80);
          }
        });
        floatingTexts.push({
          id: `ft_e_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '🛡️ MYSTIC BLINK + WARD',
          color: '#c084fc',
          duration: 1.4, maxDuration: 1.4,
        });
        break;
      }
      case 'axe_troll': {
        // Berserker Roar: +40% speed and +50 armor to squad
        allHeroes.forEach(h => {
          if (!h.isDead) {
            h.shieldHp = Math.min(h.shieldHp + 50, 90);
          }
        });
        sound.playBossRoar();
        floatingTexts.push({
          id: `ft_e_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '🦁 BERSERKER ROAR! +SHIELD',
          color: '#4ade80',
          duration: 1.5, maxDuration: 1.5,
        });
        break;
      }
      case 'human_brawler': {
        // Iron Aegis
        hero.shieldHp = 80;
        hero.invulnerableTimer = 3.5;
        floatingTexts.push({
          id: `ft_e_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '🛡️ IRON AEGIS!',
          color: '#60a5fa',
          duration: 1.5, maxDuration: 1.5,
        });
        break;
      }
      case 'dwarf_demolitionist': {
        // Deploy Auto-Sentry Turret
        turrets.push({
          id: `turret_${Date.now()}`,
          x: hero.x + Math.cos(angle) * 40,
          y: hero.y + Math.sin(angle) * 40,
          heroId: hero.id,
          duration: 10.0,
          shootCooldown: 0.3,
          range: 260,
        });
        floatingTexts.push({
          id: `ft_e_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '🔧 AUTO-TURRET DEPLOYED',
          color: '#fb923c',
          duration: 1.5, maxDuration: 1.5,
        });
        break;
      }
      case 'dual_blade_warrior': {
        // Smoke Veil & stealth
        hero.stealthedTimer = 2.5;
        floatingTexts.push({
          id: `ft_e_${Date.now()}`,
          x: hero.x, y: hero.y - 45,
          text: '💨 SMOKE VEIL (STEALTH)',
          color: '#2dd4bf',
          duration: 1.5, maxDuration: 1.5,
        });
        break;
      }
    }
  }

  // --- R SKILLS (Unlocks in Wave 3) ---
  if (skillKey === 'R') {
    switch (hero.heroClass) {
      case 'elf_mage': {
        // Astral Meteor
        createAoEImpact(
          targetX, targetY, 220, 140, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#a855f7'
        );
        sound.playExplosion();
        floatingTexts.push({
          id: `ft_r_${Date.now()}`,
          x: targetX, y: targetY - 60,
          text: '☄️ ASTRAL METEOR!',
          color: '#c084fc',
          duration: 2.2, maxDuration: 2.2,
          size: 20,
        });
        break;
      }
      case 'axe_troll': {
        // Earthshaker Leap
        hero.x = targetX;
        hero.y = targetY;
        createAoEImpact(
          targetX, targetY, 180, 150, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#16a34a'
        );
        // Stun enemies hit
        enemies.forEach(e => {
          const d = Math.hypot(e.x - targetX, e.y - targetY);
          if (d <= 180 && !e.isDead) {
            e.state = 'stunned';
            e.stateTimer = 2.2;
          }
        });
        sound.playExplosion();
        floatingTexts.push({
          id: `ft_r_${Date.now()}`,
          x: targetX, y: targetY - 60,
          text: '💥 EARTHSHAKER SLAM!',
          color: '#4ade80',
          duration: 2.2, maxDuration: 2.2,
          size: 20,
        });
        break;
      }
      case 'human_brawler': {
        // Flurry of Blows
        createAoEImpact(
          hero.x + Math.cos(angle) * 60, hero.y + Math.sin(angle) * 60, 140, 160,
          hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#2563eb'
        );
        sound.playAttack('punch');
        floatingTexts.push({
          id: `ft_r_${Date.now()}`,
          x: hero.x, y: hero.y - 60,
          text: '👊 FLURRY OF BLOWS!',
          color: '#60a5fa',
          duration: 2.0, maxDuration: 2.0,
          size: 20,
        });
        break;
      }
      case 'dwarf_demolitionist': {
        // Mega Bofors Bomb
        createAoEImpact(
          targetX, targetY, 240, 180, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#ea580c'
        );
        sound.playExplosion();
        floatingTexts.push({
          id: `ft_r_${Date.now()}`,
          x: targetX, y: targetY - 60,
          text: '💣 MEGA BOFORS STRIKE!',
          color: '#fb923c',
          duration: 2.2, maxDuration: 2.2,
          size: 20,
        });
        break;
      }
      case 'dual_blade_warrior': {
        // Thousand Slashes
        createAoEImpact(
          hero.x, hero.y, 190, 200, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, '#0d9488'
        );
        sound.playAttack('dagger');
        floatingTexts.push({
          id: `ft_r_${Date.now()}`,
          x: hero.x, y: hero.y - 60,
          text: '⚔️ THOUSAND SLASHES!',
          color: '#2dd4bf',
          duration: 2.2, maxDuration: 2.2,
          size: 20,
        });
        break;
      }
    }
  }
}

function performMeleeHit(
  hero: Hero,
  hitX: number,
  hitY: number,
  radius: number,
  damage: number,
  enemies: Enemy[],
  towers: Tower[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number,
  color: string,
  isCrit: boolean = false
) {
  // Hit enemies
  for (const enemy of enemies) {
    if (enemy.isDead) continue;
    const dist = Math.hypot(enemy.x - hitX, enemy.y - hitY);
    if (dist <= radius + enemy.radius) {
      applyDamageToEnemy(hero, enemy, damage, particles, floatingTexts, destroyedTowersCount, isCrit);
    }
  }

  // Hit towers
  for (const tower of towers) {
    if (tower.isDestroyed) continue;
    const dist = Math.hypot(tower.x - hitX, tower.y - hitY);
    if (dist <= radius + tower.radius) {
      applyDamageToTower(hero, tower, damage, particles, floatingTexts);
    }
  }

  // Hit slash visual particles
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: hitX + (Math.random() - 0.5) * 20,
      y: hitY + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      life: 0.25,
      maxLife: 0.25,
      size: 3,
      color,
      type: 'spark',
    });
  }
}

export function createAoEImpact(
  x: number,
  y: number,
  radius: number,
  damage: number,
  hero: Hero,
  enemies: Enemy[],
  towers: Tower[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number,
  color: string
) {
  // Hit enemies
  for (const enemy of enemies) {
    if (enemy.isDead) continue;
    const dist = Math.hypot(enemy.x - x, enemy.y - y);
    if (dist <= radius + enemy.radius) {
      // Knockback away from explosion center
      const angle = Math.atan2(enemy.y - y, enemy.x - x);
      enemy.vx += Math.cos(angle) * 160;
      enemy.vy += Math.sin(angle) * 160;
      applyDamageToEnemy(hero, enemy, damage, particles, floatingTexts, destroyedTowersCount, false);
    }
  }

  // Hit towers
  for (const tower of towers) {
    if (tower.isDestroyed) continue;
    const dist = Math.hypot(tower.x - x, tower.y - y);
    if (dist <= radius + tower.radius) {
      applyDamageToTower(hero, tower, damage, particles, floatingTexts);
    }
  }

  // Visual particles ring
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const spd = 70 + Math.random() * 90;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 0.5,
      maxLife: 0.5,
      size: 4 + Math.random() * 4,
      color,
      type: 'magic',
    });
  }
}

export function applyDamageToEnemy(
  hero: Hero,
  enemy: Enemy,
  baseDamage: number,
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number,
  isCrit: boolean = false
) {
  let finalDamage = baseDamage;

  // Boss armor & tower multiplier rules
  if (enemy.type === 'goblin_king') {
    const towerMultiplier = TOWER_CONFIG.getBossDamageMultiplier(destroyedTowersCount);
    finalDamage = Math.round(baseDamage * towerMultiplier);
  }

  enemy.hp -= finalDamage;
  hero.damageDealt += finalDamage;
  sound.playGoblinHurt();

  // Floating damage number
  floatingTexts.push({
    id: `dmg_${Date.now()}_${Math.random()}`,
    x: enemy.x + (Math.random() - 0.5) * 16,
    y: enemy.y - 25,
    text: `${isCrit ? '💥 ' : ''}-${finalDamage}`,
    color: isCrit ? '#f43f5e' : (enemy.type === 'goblin_king' ? '#fbbf24' : '#ffffff'),
    duration: 0.75,
    maxDuration: 0.75,
    size: isCrit ? 16 : 13,
  });

  // Blood / hit particles
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: enemy.x,
      y: enemy.y,
      vx: (Math.random() - 0.5) * 80,
      vy: (Math.random() - 0.5) * 80,
      life: 0.35,
      maxLife: 0.35,
      size: 3,
      color: enemy.type === 'goblin_king' ? '#e11d48' : '#991b1b',
      type: 'blood',
    });
  }

  if (enemy.hp <= 0 && !enemy.isDead) {
    enemy.isDead = true;
    hero.kills += 1;

    if (enemy.type === 'goblin_king') {
      sound.playBossRoar();
      floatingTexts.push({
        id: `boss_down_${Date.now()}`,
        x: enemy.x,
        y: enemy.y - 50,
        text: '👑 GOBLIN KING DEFEATED!',
        color: '#fbbf24',
        duration: 3.0,
        maxDuration: 3.0,
        size: 18,
      });
    }
  }
}

export function applyDamageToTower(
  hero: Hero,
  tower: Tower,
  damage: number,
  particles: Particle[],
  floatingTexts: FloatingText[]
) {
  tower.hp -= damage;
  hero.damageDealt += damage;

  floatingTexts.push({
    id: `tower_dmg_${Date.now()}_${Math.random()}`,
    x: tower.x + (Math.random() - 0.5) * 20,
    y: tower.y - 30,
    text: `-${damage}`,
    color: '#a78bfa',
    duration: 0.7,
    maxDuration: 0.7,
    size: 13,
  });

  if (tower.hp <= 0 && !tower.isDestroyed) {
    tower.isDestroyed = true;
    tower.hp = 0;
    sound.playTowerDestroyed();

    floatingTexts.push({
      id: `tower_destroyed_${Date.now()}`,
      x: tower.x,
      y: tower.y - 45,
      text: `⚡ ${tower.name.toUpperCase()} SHATTERED!`,
      color: '#c084fc',
      duration: 2.5,
      maxDuration: 2.5,
      size: 16,
    });
  }
}

/**
 * Updates all flying projectiles and active sentry turrets
 */
export function updateProjectilesAndTurrets(
  dt: number,
  projectiles: Projectile[],
  turrets: Turret[],
  heroes: Hero[],
  enemies: Enemy[],
  towers: Tower[],
  particles: Particle[],
  floatingTexts: FloatingText[],
  destroyedTowersCount: number
) {
  // 1. Update Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.duration -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    let hit = false;
    const hero = heroes.find(h => h.id === p.sourceHeroId) || heroes[0];

    // Check hit against enemies
    for (const enemy of enemies) {
      if (enemy.isDead) continue;
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d <= p.radius + enemy.radius) {
        hit = true;
        if (p.aoeRadius) {
          createAoEImpact(
            p.x, p.y, p.aoeRadius, p.damage, hero, enemies, towers, particles, floatingTexts, destroyedTowersCount, p.color
          );
        } else {
          applyDamageToEnemy(hero, enemy, p.damage, particles, floatingTexts, destroyedTowersCount);
        }
        break;
      }
    }

    // Check hit against towers
    if (!hit) {
      for (const tower of towers) {
        if (tower.isDestroyed) continue;
        const d = Math.hypot(tower.x - p.x, tower.y - p.y);
        if (d <= p.radius + tower.radius) {
          hit = true;
          applyDamageToTower(hero, tower, p.damage, particles, floatingTexts);
          break;
        }
      }
    }

    if (hit || p.duration <= 0) {
      // Split dynamite effect
      if (p.splitsOnHit) {
        for (let s = 0; s < 3; s++) {
          const a = (s / 3) * Math.PI * 2;
          projectiles.push({
            id: `shrapnel_${Date.now()}_${s}`,
            sourceHeroId: p.sourceHeroId,
            x: p.x,
            y: p.y,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            damage: 20,
            radius: 5,
            color: '#f97316',
            type: 'pellet',
            duration: 0.35,
            maxDuration: 0.35,
          });
        }
      }
      projectiles.splice(i, 1);
    }
  }

  // 2. Update Turrets
  for (let tIdx = turrets.length - 1; tIdx >= 0; tIdx--) {
    const turret = turrets[tIdx];
    turret.duration -= dt;
    turret.shootCooldown -= dt;

    if (turret.shootCooldown <= 0) {
      // Target nearest enemy
      let nearestEnemy: Enemy | null = null;
      let minDist = turret.range;

      for (const enemy of enemies) {
        if (enemy.isDead) continue;
        const d = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
        if (d < minDist) {
          minDist = d;
          nearestEnemy = enemy;
        }
      }

      if (nearestEnemy) {
        turret.shootCooldown = 0.28;
        const a = Math.atan2(nearestEnemy.y - turret.y, nearestEnemy.x - turret.x);
        projectiles.push({
          id: `turret_bullet_${Date.now()}_${Math.random()}`,
          sourceHeroId: turret.heroId,
          x: turret.x,
          y: turret.y,
          vx: Math.cos(a) * 500,
          vy: Math.sin(a) * 500,
          damage: 16,
          radius: 5,
          color: '#facc15',
          type: 'turret_bullet',
          duration: 0.6,
          maxDuration: 0.6,
        });
      }
    }

    if (turret.duration <= 0) {
      turrets.splice(tIdx, 1);
    }
  }
}
