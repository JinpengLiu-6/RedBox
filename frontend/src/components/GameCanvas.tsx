/**
 * Goblin King Heist - 2D Canvas Gameplay Renderer
 * Renders cartoon top-down world, camera tracking, heroes, crates, enemies, towers, and effects.
 */

import React, { useRef, useEffect } from 'react';
import { Hero, Enemy, Crate, Tower, Projectile, Turret, Particle, FloatingText } from '../types/game';
import { WORLD_CONFIG, TEAM_CONFIG } from '../config/gameConfig';
import { MapData } from '../engine/mapData';
import { 
  drawElfMage, 
  drawAxeTroll, 
  drawHumanBrawler, 
  drawDwarfDemolitionist, 
  drawDualBladeWarrior, 
  drawGoblinKing, 
  drawRedGoblinMinion 
} from './CharacterSprites';

interface GameCanvasProps {
  heroes: Hero[];
  activeHeroId: string;
  enemies: Enemy[];
  crates: Crate[];
  towers: Tower[];
  projectiles: Projectile[];
  turrets: Turret[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  mapData: MapData;
  mousePos: { x: number; y: number; worldX: number; worldY: number };
  onInteract: () => void;
  onAttack: () => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  heroes,
  activeHeroId,
  enemies,
  crates,
  towers,
  projectiles,
  turrets,
  particles,
  floatingTexts,
  mapData,
  mousePos,
  onInteract,
  onAttack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeHero = heroes.find(h => h.id === activeHeroId) || heroes[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Smooth camera follow
      if (activeHero) {
        const targetCamX = activeHero.x - w / 2;
        const targetCamY = activeHero.y - h / 2;
        const maxCamX = WORLD_CONFIG.width - w;
        const maxCamY = WORLD_CONFIG.height - h;

        const clampedTargetX = Math.max(0, Math.min(targetCamX, maxCamX));
        const clampedTargetY = Math.max(0, Math.min(targetCamY, maxCamY));

        cameraRef.current.x += (clampedTargetX - cameraRef.current.x) * 0.15;
        cameraRef.current.y += (clampedTargetY - cameraRef.current.y) * 0.15;
      }

      const camX = Math.round(cameraRef.current.x);
      const camY = Math.round(cameraRef.current.y);

      // Save context for camera transform
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.translate(-camX, -camY);

      // 1. Draw Beige Tile Floor
      drawFloor(ctx, camX, camY, w, h);

      // 2. Draw Grass Patches
      drawGrassPatches(ctx, mapData.grassPatches);

      // 3. Draw Mint-Green Extraction Base Zone
      drawBaseZone(ctx);

      // 4. Draw Destructible Towers & Crystal Beams
      const boss = enemies.find(e => e.type === 'goblin_king' && !e.isDead);
      drawTowers(ctx, towers, boss);

      // 5. Draw Crates
      drawCrates(ctx, crates, activeHero);

      // 6. Draw Turrets
      drawTurrets(ctx, turrets);

      // 7. Draw Enemies (Goblins, Spearmen, Goblin King)
      drawEnemies(ctx, enemies);

      // 8. Draw Heroes (5 Distinct Archetypes)
      drawHeroes(ctx, heroes, activeHeroId);

      // 9. Draw Projectiles
      drawProjectiles(ctx, projectiles);

      // 10. Draw Particles
      drawParticles(ctx, particles);

      // 11. Draw Chunky Brown Walls with Dark Outlines
      drawWalls(ctx, mapData.colliders, mapData.decorations);

      // 12. Draw Floating Numbers & Notifications
      drawFloatingTexts(ctx, floatingTexts);

      // 13. Draw Active Aiming Crosshair in World Coordinates
      if (activeHero && !activeHero.isDead) {
        drawAimCrosshair(ctx, mousePos.worldX, mousePos.worldY);
      }

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [heroes, activeHeroId, enemies, crates, towers, projectiles, turrets, particles, floatingTexts, mapData, mousePos]);

  // Keep canvas sized to container
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block cursor-crosshair select-none"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button === 0) {
          onAttack();
        } else if (e.button === 2) {
          onInteract();
        }
      }}
    />
  );
};

/* =========================================================================
   CANVAS DRAWING HELPER FUNCTIONS
   ========================================================================= */

function drawFloor(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number) {
  const tileSize = WORLD_CONFIG.tileSize;
  const startX = Math.floor(camX / tileSize) * tileSize;
  const startY = Math.floor(camY / tileSize) * tileSize;
  const endX = Math.min(WORLD_CONFIG.width, camX + vw + tileSize);
  const endY = Math.min(WORLD_CONFIG.height, camY + vh + tileSize);

  for (let x = startX; x < endX; x += tileSize) {
    for (let y = startY; y < endY; y += tileSize) {
      const isAlt = ((x / tileSize) + (y / tileSize)) % 2 === 0;
      ctx.fillStyle = isAlt ? '#e7decb' : '#dfd5be';
      ctx.fillRect(x, y, tileSize, tileSize);

      // Subtle mortar line
      ctx.strokeStyle = '#cebe9f';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, tileSize, tileSize);
    }
  }
}

function drawGrassPatches(ctx: CanvasRenderingContext2D, grassPatches: { x: number; y: number; r: number }[]) {
  grassPatches.forEach(gp => {
    ctx.save();
    ctx.fillStyle = '#4d7c3b';
    ctx.beginPath();
    ctx.arc(gp.x, gp.y, gp.r, 0, Math.PI * 2);
    ctx.fill();

    // Dark outline
    ctx.strokeStyle = '#365829';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Small tufts
    ctx.fillStyle = '#659e4f';
    for (let i = 0; i < 5; i++) {
      const ox = gp.x + (i - 2) * (gp.r * 0.35);
      const oy = gp.y + ((i % 2) - 0.5) * (gp.r * 0.3);
      ctx.beginPath();
      ctx.moveTo(ox - 3, oy + 4);
      ctx.lineTo(ox, oy - 6);
      ctx.lineTo(ox + 3, oy + 4);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawBaseZone(ctx: CanvasRenderingContext2D) {
  const b = WORLD_CONFIG.baseZone;
  ctx.save();

  // Mint-Green base floor
  ctx.fillStyle = '#6ee7b733';
  ctx.fillRect(b.x, b.y, b.width, b.height);

  // Mint-green dashed border
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 4;
  ctx.setLineDash([12, 8]);
  ctx.strokeRect(b.x, b.y, b.width, b.height);
  ctx.setLineDash([]);

  // Central extraction Crate + Flag Icon (matching reference exactly)
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;

  // Green delivery crate icon in base
  ctx.fillStyle = '#059669';
  ctx.fillRect(cx - 24, cy - 8, 48, 38);
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - 24, cy - 8, 48, 38);
  ctx.fillStyle = '#6ee7b7';
  ctx.fillRect(cx - 6, cy + 6, 12, 10); // Latch

  // Green Flag above crate
  ctx.fillStyle = '#10b981';
  ctx.fillRect(cx - 14, cy - 32, 4, 26); // Flagpole
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy - 32);
  ctx.lineTo(cx + 10, cy - 23);
  ctx.lineTo(cx - 10, cy - 14);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawTowers(ctx: CanvasRenderingContext2D, towers: Tower[], boss?: Enemy) {
  towers.forEach(t => {
    ctx.save();
    if (t.isDestroyed) {
      // Rubble of shattered tower
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SHATTERED', t.x, t.y + 3);
    } else {
      // Tower base shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 14, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Stone Round Pedestal Tower (Grey layered stone bricks)
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(t.x, t.y + 4, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Inner pedestal rim
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 2, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Glowing Cyan/Blue Rune Diamond Crystal
      const glow = Math.sin(Date.now() * 0.006 + t.x) * 2;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 34 + glow);
      ctx.lineTo(t.x + 11, t.y - 18 + glow);
      ctx.lineTo(t.x, t.y - 4 + glow);
      ctx.lineTo(t.x - 11, t.y - 18 + glow);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Crystal highlight facet
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 34 + glow);
      ctx.lineTo(t.x + 11, t.y - 18 + glow);
      ctx.lineTo(t.x, t.y - 4 + glow);
      ctx.closePath();
      ctx.fill();

      // Green status indicator bar below pedestal (matching reference)
      const barW = 36;
      const barH = 5;
      const barX = t.x - barW / 2;
      const barY = t.y + 24;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#22c55e';
      const pct = Math.max(0, t.hp / t.maxHp);
      ctx.fillRect(barX, barY, barW * pct, barH);
    }
    ctx.restore();
  });
}

function drawCrates(ctx: CanvasRenderingContext2D, crates: Crate[], activeHero: Hero) {
  crates.forEach(c => {
    if (c.isDelivered || c.isDestroyed || c.isCarried) return;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 12, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sturdy wooden crate body
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(c.x - 16, c.y - 14, 32, 28);

    // Dark outline
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(c.x - 16, c.y - 14, 32, 28);

    // Iron corner straps / cross bands
    ctx.fillStyle = '#57534e';
    ctx.fillRect(c.x - 16, c.y - 2, 32, 4); // horizontal strap
    ctx.fillRect(c.x - 2, c.y - 14, 4, 28); // vertical strap

    // Golden padlock
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#713f12';
    ctx.lineWidth = 1;
    ctx.stroke();

    // If active hero is in interact range, show sleek arcade prompt
    const dist = Math.hypot(c.x - activeHero.x, c.y - activeHero.y);
    if (dist <= TEAM_CONFIG.interactRadius) {
      const pulse = Math.sin(Date.now() * 0.008) * 2;
      
      // 1. Pulsing ground aura ring
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 6, 26 + pulse, 14 + pulse * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Floating Pill Badge above crate
      const badgeW = 92;
      const badgeH = 22;
      const badgeX = c.x - badgeW / 2;
      const badgeY = c.y - 36 + pulse;

      // Dark translucent backdrop
      ctx.fillStyle = 'rgba(7, 11, 20, 0.92)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();

      // Golden outline
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Key icon pill [F]
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(badgeX + 3, badgeY + 3, 16, 16, 4);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', badgeX + 11, badgeY + 11);

      // Action Label
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('EXTRACT', badgeX + 24, badgeY + 11);
    }

    ctx.restore();
  });
}

function drawTurrets(ctx: CanvasRenderingContext2D, turrets: Turret[]) {
  turrets.forEach(t => {
    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 8, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Brass Turret base
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Barrel
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(t.x - 3, t.y - 16, 6, 12);

    ctx.restore();
  });
}

function drawEnemies(ctx: CanvasRenderingContext2D, enemies: Enemy[]) {
  const animTime = performance.now() / 1000;
  enemies.forEach(e => {
    if (e.isDead) return;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.radius * 0.75, e.radius * 1.1, e.radius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.type === 'goblin_king') {
      drawGoblinKing(ctx, e, animTime);
    } else {
      drawRedGoblinMinion(ctx, e, animTime);
    }

    // Health Bar
    const barW = e.radius * 2.2;
    const barH = e.type === 'goblin_king' ? 8 : 5;
    const barX = e.x - barW / 2;
    const barY = e.y - e.radius - 12;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = e.type === 'goblin_king' ? '#f59e0b' : '#ef4444';
    const pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.restore();
  });
}

function drawHeroes(ctx: CanvasRenderingContext2D, heroes: Hero[], activeHeroId: string) {
  const animTime = performance.now() / 1000;
  heroes.forEach(h => {
    ctx.save();

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(h.x, h.y + 14, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // If hero is active controlled player, draw cyan/golden selection ring matching reference
    if (h.id === activeHeroId) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(h.x, h.y + 6, 26, 0, Math.PI * 2);
      ctx.stroke();

      // Soft glow
      ctx.strokeStyle = '#38bdf844';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(h.x, h.y + 6, 28, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Teammate subtle ring
      ctx.strokeStyle = h.heroClass === 'dual_blade_warrior' ? '#f59e0b' : '#3b82f688';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(h.x, h.y + 6, 24, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (h.isDead) {
      // Tombstone / Fallen hero marker
      ctx.fillStyle = '#64748b';
      ctx.fillRect(h.x - 12, h.y - 14, 24, 24);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x - 12, h.y - 14, 24, 24);

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`REVIVE IN ${Math.ceil(h.respawnTimer)}s`, h.x, h.y - 20);
      ctx.restore();
      return;
    }

    // Hero Character rendering with lively bob and weapon animation
    ctx.save();
    ctx.translate(h.x, h.y);

    switch (h.heroClass) {
      case 'elf_mage':
        drawElfMage(ctx, h, animTime);
        break;
      case 'axe_troll':
        drawAxeTroll(ctx, h, animTime);
        break;
      case 'human_brawler':
        drawHumanBrawler(ctx, h, animTime);
        break;
      case 'dwarf_demolitionist':
        drawDwarfDemolitionist(ctx, h, animTime);
        break;
      case 'dual_blade_warrior':
        drawDualBladeWarrior(ctx, h, animTime);
        break;
    }
    ctx.restore();

    // If hero is carrying a crate, render crate directly in their arms / over their head
    if (h.carryingCrateId) {
      ctx.save();
      const crateY = h.y - 16;
      ctx.fillStyle = '#92400e';
      ctx.fillRect(h.x - 12, crateY - 10, 24, 20);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x - 12, crateY - 10, 24, 20);
      
      // Straps
      ctx.fillStyle = '#475569';
      ctx.fillRect(h.x - 12, crateY - 2, 24, 3);
      ctx.fillRect(h.x - 2, crateY - 10, 3, 20);
      
      // Gold latch
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(h.x, crateY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Health & Shield Bar (compact rounded matching reference)
    const barW = 34;
    const barH = 5;
    const barX = h.x - barW / 2;
    const barY = h.y - 28 - (h.carryingCrateId ? 14 : 0);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // HP
    const hpPct = Math.max(0, h.hp / h.maxHp);
    ctx.fillStyle = hpPct > 0.35 ? '#22c55e' : '#ef4444';
    ctx.fillRect(barX, barY, barW * hpPct, barH);

    // Shield overlay
    if (h.shieldHp > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(barX, barY - 2, barW * Math.min(1, h.shieldHp / 80), 2);
    }

    // Hero title label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${h.title} ${h.isBot ? '(BOT)' : ''}`, h.x, barY - 4);

    ctx.restore();
  });
}

function drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: Projectile[]) {
  projectiles.forEach(p => {
    ctx.save();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  });
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  particles.forEach(pt => {
    ctx.save();
    const alpha = pt.life / pt.maxLife;
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  colliders: { x: number; y: number; w: number; h: number }[],
  decorations: { x: number; y: number; type: 'pillar' | 'torch' | 'rubble' }[]
) {
  // Chunky brown walls matching cartoon visual reference
  colliders.forEach(w => {
    ctx.save();
    // Wall body
    ctx.fillStyle = '#4a3324';
    ctx.fillRect(w.x, w.y, w.w, w.h);

    // Top wall cap (lighter chunky brown)
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(w.x, w.y, w.w, Math.min(10, w.h / 2));

    // Dark bold cartoon outline
    ctx.strokeStyle = '#22150e';
    ctx.lineWidth = 3;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
    ctx.restore();
  });

  // Torches and Pillars
  decorations.forEach(dec => {
    ctx.save();
    if (dec.type === 'torch') {
      ctx.fillStyle = '#78350f';
      ctx.fillRect(dec.x - 4, dec.y - 12, 8, 16);
      // Flame spark
      const flicker = Math.sin(Date.now() * 0.01 + dec.x) * 2;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y - 14 + flicker, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y - 14 + flicker, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (dec.type === 'pillar') {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawFloatingTexts(ctx: CanvasRenderingContext2D, texts: FloatingText[]) {
  texts.forEach(ft => {
    ctx.save();
    const progress = 1 - (ft.duration / ft.maxDuration);
    const yOff = progress * 24;
    ctx.globalAlpha = Math.max(0, ft.duration / ft.maxDuration);

    ctx.fillStyle = ft.color;
    ctx.font = `bold ${ft.size || 13}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(ft.text, ft.x, ft.y - yOff);
    ctx.fillText(ft.text, ft.x, ft.y - yOff);
    ctx.restore();
  });
}

function drawAimCrosshair(ctx: CanvasRenderingContext2D, wx: number, wy: number) {
  ctx.save();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(wx, wy, 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(wx - 14, wy);
  ctx.lineTo(wx - 4, wy);
  ctx.moveTo(wx + 4, wy);
  ctx.lineTo(wx + 14, wy);
  ctx.moveTo(wx, wy - 14);
  ctx.lineTo(wx, wy - 4);
  ctx.moveTo(wx, wy + 4);
  ctx.lineTo(wx, wy + 14);
  ctx.stroke();

  ctx.restore();
}
