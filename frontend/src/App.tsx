/**
 * Goblin King Heist - Main Application Entry & Authoritative Game Controller
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Hero, 
  Enemy, 
  Crate, 
  Tower, 
  Projectile, 
  Turret, 
  Particle, 
  FloatingText, 
  GameState, 
  HeroClass, 
  SquadOrder 
} from './types/game';
import { 
  WAVE_CONFIGS, 
  WORLD_CONFIG, 
  TEAM_CONFIG, 
  BOSS_CONFIG, 
  HERO_TEMPLATES, 
  TOWER_CONFIG 
} from './config/gameConfig';
import { generateMapData, MapData, checkCircleWallCollision } from './engine/mapData';
import { spawnWaveCrates, handleCrateInteraction, checkBaseDelivery, dropCarriedCrateOnDeath } from './engine/crateSystem';
import { executeHeroAttack, executeHeroSkill, updateProjectilesAndTurrets } from './engine/combatSystem';
import { updateEnemyAI } from './engine/enemyAI';
import { updatePartyBotAI } from './engine/partyBotAI';
import { netSync, PlayerNetMessage } from './network/multiplayerSync';
import { sound } from './audio/soundEngine';

import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { MainMenuModal } from './components/Modals/MainMenuModal';
import { HeroSelectModal } from './components/Modals/HeroSelectModal';
import { WaveSummaryModal } from './components/Modals/WaveSummaryModal';
import { VictoryModal } from './components/Modals/VictoryModal';
import { DefeatModal } from './components/Modals/DefeatModal';
import { ConfigTuningModal } from './components/Modals/ConfigTuningModal';
import { MultiplayerModal } from './components/Modals/MultiplayerModal';
import { HelpModal } from './components/Modals/HelpModal';

export default function App() {
  // Game Lifecycle State
  const [gameState, setGameState] = useState<GameState>({
    status: 'TITLE',
    wave: 1,
    maxWaves: 3,
    requiredDeliveries: 3,
    cratesDelivered: 0,
    totalCratesInWave: 15,
    realCratesInWave: 3,
    trapCratesInWave: 12,
    enemyStatMultiplier: 1.0,
    teamLives: TEAM_CONFIG.initialLives,
    maxTeamLives: TEAM_CONFIG.initialLives,
    activeHeroId: 'player_1',
    squadOrder: 'FOLLOW',
    matchStartTime: Date.now(),
    elapsedTime: 0,
  });

  // Modal Dialog Controls
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isMultiplayerOpen, setIsMultiplayerOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeRoomCode, setActiveRoomCode] = useState('HEIST-ALPHA');
  const [isMultiplayerSession, setIsMultiplayerSession] = useState(false);
  const [selectedClass, setSelectedClass] = useState<HeroClass>('elf_mage');

  // Authoritative Game Entities stored in Refs for 60fps physics & simulation
  const mapDataRef = useRef<MapData>(generateMapData());
  const heroesRef = useRef<Hero[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const cratesRef = useRef<Crate[]>([]);
  const towersRef = useRef<Tower[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const turretsRef = useRef<Turret[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const keysPressedRef = useRef<Record<string, boolean>>({});
  const mousePosRef = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 });
  const lastTimeRef = useRef<number>(performance.now());
  const bossDefeatedRef = useRef(false);

  // Synchronized state for React HUD rendering
  const [hudState, setHudState] = useState<{
    heroes: Hero[];
    enemies: Enemy[];
    crates: Crate[];
    towers: Tower[];
  }>({
    heroes: [],
    enemies: [],
    crates: [],
    towers: [],
  });

  // -------------------------------------------------------------
  // INITIALIZE HEROES & MATCH
  // -------------------------------------------------------------
  const initHeroes = useCallback((chosenClass: HeroClass) => {
    const classes: HeroClass[] = [
      'elf_mage',
      'axe_troll',
      'human_brawler',
      'dwarf_demolitionist',
      'dual_blade_warrior',
    ];

    // Put chosen class in slot 1 (active player)
    const sortedClasses = [
      chosenClass,
      ...classes.filter(c => c !== chosenClass),
    ];

    const baseZone = WORLD_CONFIG.baseZone;
    const initialHeroes: Hero[] = sortedClasses.map((cls, idx) => {
      const tmpl = HERO_TEMPLATES[cls];
      const offsetX = (idx % 3) * 60 + 50;
      const offsetY = Math.floor(idx / 3) * 60 + 50;

      return {
        id: `player_${idx + 1}`,
        heroClass: cls,
        name: tmpl.name,
        title: tmpl.title,
        color: tmpl.color,
        accentColor: tmpl.accentColor,
        x: baseZone.x + offsetX,
        y: baseZone.y + offsetY,
        vx: 0,
        vy: 0,
        angle: 0,
        maxHp: tmpl.maxHp,
        hp: tmpl.maxHp,
        speed: tmpl.speed,
        isDead: false,
        respawnTimer: 0,
        isBot: idx !== 0, // First hero is human, rest are bot companions
        carryingCrateId: null,
        skills: {
          q: { ...tmpl.skills.q, currentCooldown: 0 },
          e: { ...tmpl.skills.e, currentCooldown: 0 },
          r: { ...tmpl.skills.r, currentCooldown: 0 },
        },
        attackCooldown: 0,
        shieldHp: 0,
        invulnerableTimer: 0,
        stealthedTimer: 0,
        actionState: 'idle',
        actionTimer: 0,
        kills: 0,
        damageDealt: 0,
        cratesDelivered: 0,
      };
    });

    heroesRef.current = initialHeroes;
  }, []);

  // -------------------------------------------------------------
  // INITIALIZE WAVE
  // -------------------------------------------------------------
  const initWave = useCallback((waveNum: number) => {
    const config = WAVE_CONFIGS[waveNum] || WAVE_CONFIGS[1];
    bossDefeatedRef.current = false;

    // 1. Authoritative Crates
    cratesRef.current = spawnWaveCrates(waveNum);

    // 2. Towers (repaired and energized for each wave)
    towersRef.current = mapDataRef.current.initialTowers.map(t => ({
      ...t,
      hp: t.maxHp,
      isDestroyed: false,
    }));

    // 3. Clear transient entities
    projectilesRef.current = [];
    turretsRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];

    // 4. Reset hero positions to base extraction area
    const baseZone = WORLD_CONFIG.baseZone;
    heroesRef.current.forEach((h, idx) => {
      h.hp = h.maxHp;
      h.isDead = false;
      h.respawnTimer = 0;
      h.carryingCrateId = null;
      h.shieldHp = 0;
      h.invulnerableTimer = 0;
      h.stealthedTimer = 0;
      h.skills.q.currentCooldown = 0;
      h.skills.e.currentCooldown = 0;
      h.skills.r.currentCooldown = 0;
      const offsetX = (idx % 3) * 60 + 50;
      const offsetY = Math.floor(idx / 3) * 60 + 50;
      h.x = baseZone.x + offsetX;
      h.y = baseZone.y + offsetY;
    });

    // 5. Enemies (Scaled according to wave rules)
    const mult = config.enemyMultiplier;
    const enemies: Enemy[] = [];

    // Goblin King Boss
    const bossScaledHp = Math.round(BOSS_CONFIG.baseHp * mult);
    const bossScaledDmg = Math.round(BOSS_CONFIG.baseDamage * mult);
    enemies.push({
      id: `boss_king_w${waveNum}`,
      type: 'goblin_king',
      x: BOSS_CONFIG.spawnX,
      y: BOSS_CONFIG.spawnY,
      vx: 0,
      vy: 0,
      angle: Math.PI / 2,
      hp: bossScaledHp,
      maxHp: bossScaledHp,
      speed: BOSS_CONFIG.speed,
      damage: bossScaledDmg,
      attackRange: 55,
      attackCooldown: 1.6,
      currentAttackCooldown: 0.5,
      isDead: false,
      targetHeroId: null,
      state: 'patrol',
      stateTimer: 0,
      specialCooldown: 4.0,
      radius: BOSS_CONFIG.radius,
    });

    // Roaming Red Goblins
    const spawnPoints = [
      { x: 600, y: 500 },
      { x: 1800, y: 500 },
      { x: 1200, y: 700 },
      { x: 800, y: 900 },
      { x: 1600, y: 900 },
      { x: 1200, y: 1100 },
      { x: 600, y: 1300 },
      { x: 1800, y: 1300 },
      { x: 1000, y: 1300 },
      { x: 1400, y: 1300 },
      { x: 400, y: 600 },
      { x: 2000, y: 600 },
    ];

    for (let i = 0; i < config.roamingGoblins; i++) {
      const pt = spawnPoints[i % spawnPoints.length];
      const hp = Math.round(65 * mult);
      const dmg = Math.round(11 * mult);
      enemies.push({
        id: `goblin_w${waveNum}_${i}`,
        type: 'red_goblin',
        x: pt.x + (Math.random() - 0.5) * 80,
        y: pt.y + (Math.random() - 0.5) * 80,
        vx: 0,
        vy: 0,
        angle: Math.random() * Math.PI * 2,
        hp,
        maxHp: hp,
        speed: 130,
        damage: dmg,
        attackRange: 38,
        attackCooldown: 1.1,
        currentAttackCooldown: Math.random() * 0.8,
        isDead: false,
        targetHeroId: null,
        state: 'patrol',
        stateTimer: 0,
        specialCooldown: 0,
        radius: 17,
      });
    }

    // Goblin Spearmen
    for (let s = 0; s < config.spearmenCount; s++) {
      const t = towersRef.current[s % towersRef.current.length];
      const hp = Math.round(90 * mult);
      const dmg = Math.round(15 * mult);
      enemies.push({
        id: `spearman_w${waveNum}_${s}`,
        type: 'goblin_spearman',
        x: t.x + (s % 2 === 0 ? 50 : -50),
        y: t.y + 40,
        vx: 0,
        vy: 0,
        angle: Math.random() * Math.PI * 2,
        hp,
        maxHp: hp,
        speed: 110,
        damage: dmg,
        attackRange: 55,
        attackCooldown: 1.4,
        currentAttackCooldown: 0.5,
        isDead: false,
        targetHeroId: null,
        state: 'patrol',
        stateTimer: 0,
        specialCooldown: 0,
        radius: 20,
      });
    }

    enemiesRef.current = enemies;

    // Update Game State
    setGameState(prev => ({
      ...prev,
      wave: waveNum,
      requiredDeliveries: config.requiredDeliveries,
      cratesDelivered: 0,
      totalCratesInWave: config.totalCrates,
      realCratesInWave: config.realCrates,
      trapCratesInWave: config.trapCrates,
      enemyStatMultiplier: config.enemyMultiplier,
    }));
  }, []);

  // -------------------------------------------------------------
  // START MATCH
  // -------------------------------------------------------------
  const handleStartMatch = () => {
    initHeroes(selectedClass);
    initWave(1);
    setGameState(prev => ({
      ...prev,
      status: 'PLAYING',
      teamLives: TEAM_CONFIG.initialLives,
      matchStartTime: Date.now(),
    }));
    sound.playDeliverySuccess();
  };

  // -------------------------------------------------------------
  // PLAYER INPUT & ACTIONS
  // -------------------------------------------------------------
  const handlePlayerAttack = useCallback(() => {
    if (gameState.status !== 'PLAYING') return;
    const activeHero = heroesRef.current.find(h => h.id === gameState.activeHeroId);
    if (!activeHero || activeHero.isDead) return;

    const destroyedCount = towersRef.current.filter(t => t.isDestroyed).length;
    executeHeroAttack(
      activeHero,
      mousePosRef.current.worldX,
      mousePosRef.current.worldY,
      projectilesRef.current,
      enemiesRef.current,
      towersRef.current,
      particlesRef.current,
      floatingTextsRef.current,
      destroyedCount
    );

    // Broadcast input to co-op peers
    netSync.broadcast('PLAYER_INPUT', {
      heroId: activeHero.id,
      action: 'attack',
      targetX: mousePosRef.current.worldX,
      targetY: mousePosRef.current.worldY,
    });
  }, [gameState.status, gameState.activeHeroId]);

  const handlePlayerSkill = useCallback((skillKey: 'Q' | 'E' | 'R') => {
    if (gameState.status !== 'PLAYING') return;
    const activeHero = heroesRef.current.find(h => h.id === gameState.activeHeroId);
    if (!activeHero || activeHero.isDead) return;

    const destroyedCount = towersRef.current.filter(t => t.isDestroyed).length;
    executeHeroSkill(
      activeHero,
      skillKey,
      mousePosRef.current.worldX,
      mousePosRef.current.worldY,
      gameState.wave,
      projectilesRef.current,
      turretsRef.current,
      enemiesRef.current,
      towersRef.current,
      heroesRef.current,
      particlesRef.current,
      floatingTextsRef.current,
      destroyedCount
    );

    netSync.broadcast('PLAYER_INPUT', {
      heroId: activeHero.id,
      action: 'skill',
      skillKey,
      targetX: mousePosRef.current.worldX,
      targetY: mousePosRef.current.worldY,
    });
  }, [gameState.status, gameState.activeHeroId, gameState.wave]);

  const handlePlayerInteract = useCallback(() => {
    if (gameState.status !== 'PLAYING') return;
    const activeHero = heroesRef.current.find(h => h.id === gameState.activeHeroId);
    if (!activeHero || activeHero.isDead) return;

    const res = handleCrateInteraction(
      activeHero,
      cratesRef.current,
      gameState.wave,
      particlesRef.current,
      floatingTextsRef.current,
      gameState.enemyStatMultiplier
    );

    if (res.spawnedEnemies) {
      enemiesRef.current.push(...res.spawnedEnemies);
    }

    netSync.broadcast('PLAYER_INPUT', {
      heroId: activeHero.id,
      action: 'interact',
    });
  }, [gameState.status, gameState.activeHeroId, gameState.wave, gameState.enemyStatMultiplier]);

  // Switch Active Controlled Hero (1-5 keys or click on roster)
  const handleSelectHero = useCallback((heroId: string) => {
    heroesRef.current.forEach(h => {
      if (h.id === heroId) {
        h.isBot = false;
      }
    });
    setGameState(prev => ({ ...prev, activeHeroId: heroId }));
    sound.playCrateInteract();
  }, []);

  // -------------------------------------------------------------
  // KEYBOARD & MOUSE EVENT LISTENERS
  // -------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = true;

      // Hotkey actions
      if (e.code === 'KeyQ') handlePlayerSkill('Q');
      if (e.code === 'KeyE') handlePlayerSkill('E');
      if (e.code === 'KeyR') handlePlayerSkill('R');
      if (e.code === 'KeyF') handlePlayerInteract();
      if (e.code === 'Space') handlePlayerAttack();

      // Hero selection hotkeys 1 - 5
      if (e.code === 'Digit1') handleSelectHero('player_1');
      if (e.code === 'Digit2') handleSelectHero('player_2');
      if (e.code === 'Digit3') handleSelectHero('player_3');
      if (e.code === 'Digit4') handleSelectHero('player_4');
      if (e.code === 'Digit5') handleSelectHero('player_5');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current.x = e.clientX;
      mousePosRef.current.y = e.clientY;

      // Approximate world position based on active hero camera
      const activeHero = heroesRef.current.find(h => h.id === gameState.activeHeroId);
      if (activeHero) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const camX = Math.max(0, Math.min(activeHero.x - vw / 2, WORLD_CONFIG.width - vw));
        const camY = Math.max(0, Math.min(activeHero.y - vh / 2, WORLD_CONFIG.height - vh));
        mousePosRef.current.worldX = e.clientX + camX;
        mousePosRef.current.worldY = e.clientY + camY;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handlePlayerAttack, handlePlayerSkill, handlePlayerInteract, handleSelectHero, gameState.activeHeroId]);

  // -------------------------------------------------------------
  // MULTIPLAYER SYNC SUBSCRIPTION
  // -------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = netSync.onMessage((msg: PlayerNetMessage) => {
      if (msg.type === 'PLAYER_INPUT') {
        const { heroId, action, targetX, targetY, skillKey } = msg.payload;
        const peerHero = heroesRef.current.find(h => h.id === heroId);
        if (peerHero && !peerHero.isDead) {
          peerHero.isBot = false; // Mark human controlled
          const destroyedCount = towersRef.current.filter(t => t.isDestroyed).length;

          if (action === 'attack') {
            executeHeroAttack(
              peerHero, targetX, targetY, projectilesRef.current, enemiesRef.current, towersRef.current, particlesRef.current, floatingTextsRef.current, destroyedCount
            );
          } else if (action === 'skill' && skillKey) {
            executeHeroSkill(
              peerHero, skillKey, targetX, targetY, gameState.wave, projectilesRef.current, turretsRef.current, enemiesRef.current, towersRef.current, heroesRef.current, particlesRef.current, floatingTextsRef.current, destroyedCount
            );
          } else if (action === 'interact') {
            const res = handleCrateInteraction(
              peerHero, cratesRef.current, gameState.wave, particlesRef.current, floatingTextsRef.current, gameState.enemyStatMultiplier
            );
            if (res.spawnedEnemies) enemiesRef.current.push(...res.spawnedEnemies);
          }
        }
      }
    });

    return unsubscribe;
  }, [gameState.wave, gameState.enemyStatMultiplier]);

  // -------------------------------------------------------------
  // MAIN GAME TICK LOOP (60 FPS Simulation)
  // -------------------------------------------------------------
  useEffect(() => {
    let animId: number;
    let syncTimer = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      if (gameState.status === 'PLAYING') {
        const keys = keysPressedRef.current;
        const colliders = mapDataRef.current.colliders;
        const activeHero = heroesRef.current.find(h => h.id === gameState.activeHeroId);
        const destroyedTowersCount = towersRef.current.filter(t => t.isDestroyed).length;

        // 1. Update Controlled Active Hero Movement
        if (activeHero && !activeHero.isDead) {
          let moveX = 0;
          let moveY = 0;

          if (keys['KeyW'] || keys['ArrowUp']) moveY -= 1;
          if (keys['KeyS'] || keys['ArrowDown']) moveY += 1;
          if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
          if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

          if (moveX !== 0 && moveY !== 0) {
            const len = Math.SQRT2;
            moveX /= len;
            moveY /= len;
          }

          const speedMultiplier = activeHero.carryingCrateId ? TEAM_CONFIG.crateSpeedPenalty : 1.0;
          const currentSpeed = activeHero.speed * speedMultiplier;

          activeHero.vx = moveX * currentSpeed;
          activeHero.vy = moveY * currentSpeed;

          activeHero.x += activeHero.vx * dt;
          activeHero.y += activeHero.vy * dt;

          // Wall collision
          const wallCheck = checkCircleWallCollision(activeHero.x, activeHero.y, 18, colliders);
          if (wallCheck.collided) {
            activeHero.x += wallCheck.pushX;
            activeHero.y += wallCheck.pushY;
          }

          // Face mouse aim
          const dx = mousePosRef.current.worldX - activeHero.x;
          const dy = mousePosRef.current.worldY - activeHero.y;
          activeHero.angle = Math.atan2(dy, dx);
        }

        // 2. Update Heroes Timers & Revives
        heroesRef.current.forEach(h => {
          if (h.attackCooldown > 0) h.attackCooldown -= dt;
          if (h.invulnerableTimer > 0) h.invulnerableTimer -= dt;
          if (h.stealthedTimer > 0) h.stealthedTimer -= dt;
          if (h.skills.q.currentCooldown > 0) h.skills.q.currentCooldown -= dt;
          if (h.skills.e.currentCooldown > 0) h.skills.e.currentCooldown -= dt;
          if (h.skills.r.currentCooldown > 0) h.skills.r.currentCooldown -= dt;

          // Revive handling
          if (h.isDead) {
            dropCarriedCrateOnDeath(h, cratesRef.current);
            h.respawnTimer -= dt;
            if (h.respawnTimer <= 0) {
              // Try consume team life to revive
              setGameState(prev => {
                if (prev.teamLives > 1) {
                  // Revive at extraction base
                  h.isDead = false;
                  h.hp = h.maxHp;
                  h.invulnerableTimer = 2.0;
                  h.x = WORLD_CONFIG.baseZone.x + 120;
                  h.y = WORLD_CONFIG.baseZone.y + 120;
                  sound.playDeliverySuccess();
                  return { ...prev, teamLives: prev.teamLives - 1 };
                } else {
                  // All lives exhausted!
                  sound.playDefeat();
                  return { ...prev, teamLives: 0, status: 'DEFEAT' };
                }
              });
            }
          }
        });

        // 3. Update Bot Party Teammates
        const leader = activeHero || heroesRef.current[0];
        heroesRef.current.forEach(h => {
          if (h.isBot && !h.isDead) {
            updatePartyBotAI(
              dt,
              h,
              leader,
              heroesRef.current,
              enemiesRef.current,
              cratesRef.current,
              towersRef.current,
              projectilesRef.current,
              turretsRef.current,
              particlesRef.current,
              floatingTextsRef.current,
              colliders,
              gameState.wave,
              gameState.squadOrder,
              destroyedTowersCount,
              gameState.enemyStatMultiplier
            );
          }
        });

        // 4. Update Enemy AI & State Machines
        updateEnemyAI(
          dt,
          enemiesRef.current,
          heroesRef.current,
          colliders,
          particlesRef.current,
          floatingTextsRef.current,
          gameState.wave,
          gameState.enemyStatMultiplier
        );

        // Check if boss was killed
        const boss = enemiesRef.current.find(e => e.type === 'goblin_king');
        if (boss && boss.isDead && !bossDefeatedRef.current) {
          bossDefeatedRef.current = true;
        }

        // 5. Update Projectiles & Sentry Turrets
        updateProjectilesAndTurrets(
          dt,
          projectilesRef.current,
          turretsRef.current,
          heroesRef.current,
          enemiesRef.current,
          towersRef.current,
          particlesRef.current,
          floatingTextsRef.current,
          destroyedTowersCount
        );

        // 6. Update Base Crate Delivery Verification
        const deliveryResult = checkBaseDelivery(
          heroesRef.current,
          cratesRef.current,
          particlesRef.current,
          floatingTextsRef.current
        );

        if (deliveryResult.deliveredCount > 0) {
          setGameState(prev => {
            const newDelivered = prev.cratesDelivered + deliveryResult.deliveredCount;
            // Check if Wave objective is satisfied!
            if (newDelivered >= prev.requiredDeliveries) {
              sound.playVictory();
              if (prev.wave >= prev.maxWaves) {
                // Completed Wave 3 -> Full Match Victory!
                return {
                  ...prev,
                  cratesDelivered: newDelivered,
                  status: 'VICTORY',
                };
              } else {
                // Completed Wave 1 or 2 -> Show Wave Clear Summary
                return {
                  ...prev,
                  cratesDelivered: newDelivered,
                  status: 'WAVE_CLEAR',
                };
              }
            }
            return { ...prev, cratesDelivered: newDelivered };
          });
        }

        // 7. Update Particles & Floating Texts
        for (let pIdx = particlesRef.current.length - 1; pIdx >= 0; pIdx--) {
          const pt = particlesRef.current[pIdx];
          pt.life -= dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          if (pt.life <= 0) particlesRef.current.splice(pIdx, 1);
        }

        for (let tIdx = floatingTextsRef.current.length - 1; tIdx >= 0; tIdx--) {
          const ft = floatingTextsRef.current[tIdx];
          ft.duration -= dt;
          if (ft.duration <= 0) floatingTextsRef.current.splice(tIdx, 1);
        }

        // 8. Throttle HUD state synchronization to ~10hz for optimal React performance
        syncTimer += dt;
        if (syncTimer >= 0.1) {
          syncTimer = 0;
          setHudState({
            heroes: [...heroesRef.current],
            enemies: [...enemiesRef.current],
            crates: [...cratesRef.current],
            towers: [...towersRef.current],
          });
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [gameState.status, gameState.activeHeroId, gameState.wave, gameState.squadOrder, gameState.enemyStatMultiplier]);

  // -------------------------------------------------------------
  // WAVE PROGRESSION & RETRY
  // -------------------------------------------------------------
  const handleProceedNextWave = () => {
    const nextWave = gameState.wave + 1;
    initWave(nextWave);
    setGameState(prev => ({
      ...prev,
      status: 'PLAYING',
      wave: nextWave,
    }));
  };

  const handleRetryWave = () => {
    initWave(gameState.wave);
    setGameState(prev => ({
      ...prev,
      status: 'PLAYING',
      teamLives: TEAM_CONFIG.initialLives,
    }));
  };

  const handleRestartMatch = () => {
    setGameState(prev => ({
      ...prev,
      status: 'TITLE',
      wave: 1,
      teamLives: TEAM_CONFIG.initialLives,
      matchStartTime: Date.now(),
    }));
  };

  const handleStartSolo = () => {
    setIsMultiplayerSession(false);
    netSync.initChannel('SOLO-' + Math.floor(1000 + Math.random() * 9000));
    setGameState(prev => ({
      ...prev,
      status: 'HERO_SELECT',
    }));
  };

  const handleStartMultiplayer = (roomCode: string, _isHost: boolean) => {
    setIsMultiplayerSession(true);
    setActiveRoomCode(roomCode);
    netSync.initChannel(roomCode);
    setGameState(prev => ({
      ...prev,
      status: 'HERO_SELECT',
    }));
  };

  const handleBackToMenu = () => {
    setGameState(prev => ({
      ...prev,
      status: 'TITLE',
    }));
  };

  const handleToggleMute = () => {
    const nextMuted = sound.toggleMute();
    setIsMuted(nextMuted);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans">
      
      {/* 2D Gameplay Viewport Canvas */}
      <GameCanvas
        heroes={hudState.heroes.length ? hudState.heroes : heroesRef.current}
        activeHeroId={gameState.activeHeroId}
        enemies={hudState.enemies.length ? hudState.enemies : enemiesRef.current}
        crates={hudState.crates.length ? hudState.crates : cratesRef.current}
        towers={hudState.towers.length ? hudState.towers : towersRef.current}
        projectiles={projectilesRef.current}
        turrets={turretsRef.current}
        particles={particlesRef.current}
        floatingTexts={floatingTextsRef.current}
        mapData={mapDataRef.current}
        mousePos={mousePosRef.current}
        onInteract={handlePlayerInteract}
        onAttack={handlePlayerAttack}
      />

      {/* Main Gameplay HUD */}
      {gameState.status === 'PLAYING' && (
        <HUD
          gameState={gameState}
          heroes={hudState.heroes.length ? hudState.heroes : heroesRef.current}
          activeHeroId={gameState.activeHeroId}
          enemies={hudState.enemies.length ? hudState.enemies : enemiesRef.current}
          crates={hudState.crates.length ? hudState.crates : cratesRef.current}
          towers={hudState.towers.length ? hudState.towers : towersRef.current}
          onSelectHero={handleSelectHero}
          onSetSquadOrder={(order) => setGameState(prev => ({ ...prev, squadOrder: order }))}
          onTriggerSkill={handlePlayerSkill}
          onInteract={handlePlayerInteract}
          onOpenConfig={() => setIsConfigOpen(true)}
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
        />
      )}

      {/* Title / Main Menu Modal */}
      <MainMenuModal
        isOpen={gameState.status === 'TITLE'}
        onStartSolo={handleStartSolo}
        onStartMultiplayer={handleStartMultiplayer}
        onOpenHelp={() => setIsHelpOpen(true)}
        onToggleMute={handleToggleMute}
        isMuted={isMuted}
      />

      {/* Dialog Modals */}
      {gameState.status === 'HERO_SELECT' && (
        <HeroSelectModal
          selectedClass={selectedClass}
          onSelectClass={setSelectedClass}
          onStartMatch={handleStartMatch}
          onOpenMultiplayer={() => setIsMultiplayerOpen(true)}
          onBackToMenu={handleBackToMenu}
        />
      )}

      {gameState.status === 'WAVE_CLEAR' && (
        <WaveSummaryModal
          gameState={gameState}
          heroes={heroesRef.current}
          onProceedNextWave={handleProceedNextWave}
        />
      )}

      {gameState.status === 'VICTORY' && (
        <VictoryModal
          gameState={gameState}
          heroes={heroesRef.current}
          bossDefeated={bossDefeatedRef.current}
          onRestartMatch={handleRestartMatch}
        />
      )}

      {gameState.status === 'DEFEAT' && (
        <DefeatModal
          gameState={gameState}
          onRetryWave={handleRetryWave}
          onRestartMatch={handleRestartMatch}
        />
      )}

      {/* Auxiliary Modals */}
      <ConfigTuningModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />

      <MultiplayerModal
        isOpen={isMultiplayerOpen}
        onClose={() => setIsMultiplayerOpen(false)}
        onRoomChanged={(newRoom) => {
          setActiveRoomCode(newRoom);
          netSync.initChannel(newRoom);
        }}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

    </div>
  );
}
