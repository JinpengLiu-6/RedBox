/**
 * Goblin King Heist - Dungeon Map, Colliders & World Layout
 */

import { WORLD_CONFIG, TOWER_CONFIG } from '../config/gameConfig';
import { RectCollider, Tower } from '../types/game';

export interface GrassPatch {
  x: number;
  y: number;
  r: number;
}

export interface MapData {
  colliders: RectCollider[];
  grassPatches: GrassPatch[];
  decorations: { x: number; y: number; type: 'pillar' | 'torch' | 'rubble' }[];
  initialTowers: Tower[];
}

export function generateMapData(): MapData {
  const colliders: RectCollider[] = [];

  // 1. World outer boundary walls (thickness 40)
  const W = WORLD_CONFIG.width;
  const H = WORLD_CONFIG.height;
  const wallT = 48;

  // North wall
  colliders.push({ x: 0, y: 0, w: W, h: wallT });
  // South wall
  colliders.push({ x: 0, y: H - wallT, w: W, h: wallT });
  // West wall
  colliders.push({ x: 0, y: 0, w: wallT, h: H });
  // East wall
  colliders.push({ x: W - wallT, y: 0, w: wallT, h: H });

  // 2. Chunky brown interior walls creating tactical rooms, halls, and alcoves
  // Northwest Chamber walls
  colliders.push({ x: 260, y: 180, w: 28, h: 360 });
  colliders.push({ x: 260, y: 540, w: 240, h: 28 });

  // Northeast Chamber walls
  colliders.push({ x: 2112, y: 180, w: 28, h: 360 });
  colliders.push({ x: 1900, y: 540, w: 240, h: 28 });

  // Central Throne Enclosure Pillars/Dividers (leaving wide entrances)
  colliders.push({ x: 920, y: 220, w: 140, h: 32 });
  colliders.push({ x: 1340, y: 220, w: 140, h: 32 });
  colliders.push({ x: 820, y: 320, w: 32, h: 240 });
  colliders.push({ x: 1548, y: 320, w: 32, h: 240 });

  // Center-Mid Tactical Cover Pillars
  colliders.push({ x: 740, y: 780, w: 64, h: 64 });
  colliders.push({ x: 1596, y: 780, w: 64, h: 64 });
  colliders.push({ x: 1168, y: 920, w: 64, h: 64 });

  // Southern Corridors & Alcove partitions
  colliders.push({ x: 440, y: 1040, w: 32, h: 320 }); // Separating Extraction base from South hallway
  colliders.push({ x: 700, y: 1220, w: 220, h: 32 });
  colliders.push({ x: 1480, y: 1220, w: 220, h: 32 });
  colliders.push({ x: 1720, y: 1040, w: 32, h: 300 });

  // 3. Green Grass Patches (scattered naturally across stone tiles)
  const grassPatches: GrassPatch[] = [
    { x: 160, y: 1320, r: 85 }, // Near mint base
    { x: 280, y: 1420, r: 65 },
    { x: 620, y: 460, r: 90 },
    { x: 1780, y: 460, r: 95 },
    { x: 1100, y: 720, r: 110 },
    { x: 1300, y: 720, r: 100 },
    { x: 780, y: 1380, r: 80 },
    { x: 1620, y: 1380, r: 85 },
    { x: 2180, y: 920, r: 75 },
    { x: 280, y: 880, r: 70 },
  ];

  // 4. Pillars, torches, rubble decorations
  const decorations: { x: number; y: number; type: 'pillar' | 'torch' | 'rubble' }[] = [
    { x: 600, y: 300, type: 'torch' },
    { x: 1800, y: 300, type: 'torch' },
    { x: 600, y: 960, type: 'torch' },
    { x: 1800, y: 960, type: 'torch' },
    { x: 1200, y: 160, type: 'pillar' },
    { x: 1000, y: 520, type: 'rubble' },
    { x: 1400, y: 520, type: 'rubble' },
    { x: 420, y: 1440, type: 'torch' },
    { x: 1980, y: 1440, type: 'torch' },
  ];

  // 5. Initial Towers
  const initialTowers: Tower[] = TOWER_CONFIG.towers.map(t => ({
    id: t.id,
    x: t.x,
    y: t.y,
    name: t.name,
    hp: TOWER_CONFIG.maxHp,
    maxHp: TOWER_CONFIG.maxHp,
    isDestroyed: false,
    radius: TOWER_CONFIG.radius,
  }));

  return {
    colliders,
    grassPatches,
    decorations,
    initialTowers,
  };
}

/**
 * Checks circle against all axis-aligned box colliders
 */
export function checkCircleWallCollision(
  cx: number,
  cy: number,
  radius: number,
  colliders: RectCollider[]
): { collided: boolean; pushX: number; pushY: number } {
  let pushX = 0;
  let pushY = 0;
  let collided = false;

  for (const box of colliders) {
    // Find closest point on box to circle center
    const closestX = Math.max(box.x, Math.min(cx, box.x + box.w));
    const closestY = Math.max(box.y, Math.min(cy, box.y + box.h));

    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq < radius * radius) {
      collided = true;
      const dist = Math.sqrt(distSq) || 0.001;
      const overlap = radius - dist;
      pushX += (dx / dist) * overlap;
      pushY += (dy / dist) * overlap;
    }
  }

  return { collided, pushX, pushY };
}
