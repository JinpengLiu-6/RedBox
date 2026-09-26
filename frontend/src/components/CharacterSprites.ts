/**
 * Goblin King Heist - Character Sprite Renderer
 * Authentic 2.5D cartoon chibi illustrated characters matching the reference photo:
 * - Upright perspective (no inverted rotation)
 * - Animated walking feet / boots walk cycle
 * - Weapon aiming and attacking swings
 * - Expressive cartoon faces with directional eyes
 * - Elf Mage with pointed wizard hat, staff, and purple robe
 * - Axe Troll, Human Brawler, Dwarf, Dual-Blade
 * - Red Goblin minions and Giant Goblin King Boss with crown & royal sceptre
 */

import type { Hero as GameHero, Enemy as GameEnemy } from '../types/game';

// The same artwork can render authoritative network entities and local previews.
type Hero = Pick<GameHero, 'vx' | 'vy' | 'angle'>;
type Enemy = Pick<GameEnemy, 'vx' | 'vy' | 'angle' | 'radius' | 'type' | 'x' | 'y'>;

/**
 * Draw Elf Mage
 * Matches the reference photo:
 * Pointed purple witch/wizard hat with golden trim & stars,
 * flowing purple robe, cute face, blonde/silver bangs,
 * long elven ears, animated brown walking boots,
 * and a golden wizard staff with a radiating glowing arcane/frost crystal orb!
 */
export function drawElfMage(ctx: CanvasRenderingContext2D, h: Hero, animTime: number) {
  const speed = Math.hypot(h.vx, h.vy);
  const isMoving = speed > 10;
  const walkFreq = 14;
  const walkCycle = animTime * walkFreq;

  // Upright facing: determine left/right from aim angle or movement
  const isFacingLeft = Math.cos(h.angle) < 0;

  ctx.save();
  // Flip horizontally if facing left so character always looks where aiming
  if (isFacingLeft) {
    ctx.scale(-1, 1);
  }

  // Bob and tilt
  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -4 : Math.sin(animTime * 3) * 1.2;
  const tilt = isMoving ? (h.vx !== 0 ? 0.08 : 0) : 0;
  ctx.rotate(tilt);

  // 1. ANIMATED WALKING FEET (Boots stepping under robe)
  const leftBootY = isMoving ? Math.sin(walkCycle) * 6 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 6 : 0;
  const leftBootX = isMoving ? Math.cos(walkCycle) * 3 : 0;
  const rightBootX = isMoving ? -Math.cos(walkCycle) * 3 : 0;

  ctx.fillStyle = '#581c87'; // Deep purple leather boots
  // Left boot
  ctx.beginPath();
  ctx.ellipse(-7 + leftBootX, 14 + leftBootY, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right boot
  ctx.beginPath();
  ctx.ellipse(7 + rightBootX, 14 + rightBootY, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Translate by body bob for upper body
  ctx.translate(0, bob);

  // 2. PURPLE FLOWING ROBE / CAPE (Back layer)
  const capeFlutter = isMoving ? Math.sin(walkCycle) * 4 : Math.sin(animTime * 4) * 1.5;
  ctx.fillStyle = '#6b21a8';
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.quadraticCurveTo(-18 - capeFlutter, 14, -8, 16);
  ctx.lineTo(8, 16);
  ctx.quadraticCurveTo(18 + capeFlutter, 14, 14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3b0764';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 3. ROBE BODY (Front dress with golden hem)
  ctx.fillStyle = '#7e22ce';
  ctx.beginPath();
  ctx.moveTo(-12, -4);
  ctx.lineTo(12, -4);
  ctx.lineTo(15, 13);
  ctx.lineTo(-15, 13);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3b0764';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Golden hem trim
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 11);
  ctx.lineTo(14, 11);
  ctx.stroke();

  // Golden brooch / medallion
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(0, -2, 3, 0, Math.PI * 2);
  ctx.fill();

  // 4. CUTE ANIME / CHIBI HEAD
  ctx.fillStyle = '#fed7aa'; // Fair skin
  ctx.beginPath();
  ctx.arc(0, -11, 10.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Rosy anime cheeks
  ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
  ctx.beginPath();
  ctx.arc(-6, -9, 2.5, 0, Math.PI * 2);
  ctx.arc(6, -9, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Long pointed elf ears
  ctx.fillStyle = '#fed7aa';
  // Left ear
  ctx.beginPath();
  ctx.moveTo(-9, -12);
  ctx.lineTo(-18, -17);
  ctx.lineTo(-8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(9, -12);
  ctx.lineTo(18, -17);
  ctx.lineTo(8, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Cute expressive cartoon eyes (looking right, towards target)
  ctx.fillStyle = '#1e1b4b';
  ctx.beginPath();
  ctx.ellipse(-3, -11, 2.2, 3.2, 0, 0, Math.PI * 2);
  ctx.ellipse(4, -11, 2.2, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sparkly eye reflections
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-2.2, -12.5, 1.1, 0, Math.PI * 2);
  ctx.arc(4.8, -12.5, 1.1, 0, Math.PI * 2);
  ctx.arc(-3.5, -9.5, 0.6, 0, Math.PI * 2);
  ctx.arc(3.5, -9.5, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Cute tiny smile
  ctx.strokeStyle = '#9f1239';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(1, -7, 2, 0.1, Math.PI * 0.9);
  ctx.stroke();

  // Blonde / Platinum bangs framing face
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-10, -14);
  ctx.quadraticCurveTo(-4, -10, 0, -14);
  ctx.quadraticCurveTo(5, -10, 10, -14);
  ctx.lineTo(9, -17);
  ctx.lineTo(-9, -17);
  ctx.closePath();
  ctx.fill();

  // 5. TALL POINTED WIZARD HAT (Classic fantasy cartoon witch/wizard hat)
  // Hat Brim
  ctx.fillStyle = '#6b21a8';
  ctx.beginPath();
  ctx.ellipse(0, -16, 17, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gold Band around hat
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.ellipse(0, -18, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pointed Cone (curling slightly back with cute cartoon fold)
  ctx.fillStyle = '#7e22ce';
  ctx.beginPath();
  ctx.moveTo(-11, -18);
  ctx.quadraticCurveTo(-6, -34, -14, -39); // folded tip
  ctx.quadraticCurveTo(4, -32, 11, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#2e1065';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Golden star on hat tip
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(-14, -39, 3, 0, Math.PI * 2);
  ctx.fill();

  // 6. GOLDEN WIZARD STAFF (Held in front, aiming toward target)
  // Local staff aim angle
  const staffAim = isFacingLeft ? Math.PI - h.angle : h.angle;
  const staffSway = isMoving ? Math.sin(walkCycle) * 0.15 : Math.sin(animTime * 3) * 0.05;
  
  ctx.save();
  ctx.translate(11, -2);
  ctx.rotate(staffAim * 0.4 + staffSway);

  // Staff shaft
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-2, -26, 4, 34);
  ctx.strokeStyle = '#3b1704';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-2, -26, 4, 34);

  // Golden head piece
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, -29, 6.5, 0, Math.PI * 2);
  ctx.stroke();

  // Glowing Crystal Orb (Frost & Arcane radiance)
  const pulse = Math.sin(animTime * 8) * 1.5;
  ctx.fillStyle = '#38bdf8'; // Cyan ice / purple arcane glow
  ctx.beginPath();
  ctx.arc(0, -29, 5 + pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0f2fe';
  ctx.beginPath();
  ctx.arc(-1.5, -30.5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Magical sparkle rays
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.lineWidth = 1.5;
  for (let r = 0; r < 4; r++) {
    const rAng = animTime * 3 + (r * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(rAng) * 6, -29 + Math.sin(rAng) * 6);
    ctx.lineTo(Math.cos(rAng) * (11 + pulse), -29 + Math.sin(rAng) * (11 + pulse));
    ctx.stroke();
  }

  ctx.restore();

  ctx.restore();
}

/**
 * Draw Axe Troll
 * Massive muscular green/teal brute with curved horns, leather harness,
 * heavy thumping walking boots, and a giant double-bladed battleaxe!
 */
export function drawAxeTroll(ctx: CanvasRenderingContext2D, h: Hero, animTime: number) {
  const isMoving = Math.hypot(h.vx, h.vy) > 10;
  const walkFreq = 12;
  const walkCycle = animTime * walkFreq;
  const isFacingLeft = Math.cos(h.angle) < 0;

  ctx.save();
  if (isFacingLeft) ctx.scale(-1, 1);

  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -4.5 : Math.sin(animTime * 3) * 1.0;
  const tilt = isMoving ? 0.08 : 0;
  ctx.rotate(tilt);

  // 1. Heavy Walking Boots (Clawed leather stompers)
  const leftBootY = isMoving ? Math.sin(walkCycle) * 7 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 7 : 0;

  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.ellipse(-9, 15 + leftBootY, 7, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(9, 15 + rightBootY, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#291404';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.translate(0, bob);

  // 2. Muscular Green Torso & Broad Shoulders
  ctx.fillStyle = '#22c55e'; // Vibrant troll green
  ctx.beginPath();
  ctx.ellipse(0, 2, 21, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Leather armor harness & iron studs
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-15, 6, 30, 6);
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(0, 9, 3, 0, Math.PI * 2);
  ctx.fill();

  // 3. Head & Horned War Helmet
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  ctx.arc(0, -9, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14532d';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Curved Bone Horns
  ctx.fillStyle = '#fef08a';
  // Left Horn
  ctx.beginPath();
  ctx.moveTo(-11, -14);
  ctx.quadraticCurveTo(-22, -26, -18, -28);
  ctx.quadraticCurveTo(-15, -20, -7, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Right Horn
  ctx.beginPath();
  ctx.moveTo(11, -14);
  ctx.quadraticCurveTo(22, -26, 18, -28);
  ctx.quadraticCurveTo(15, -20, 7, -18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Lower Tusks pointing upward
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-6, -4);
  ctx.lineTo(-9, -12);
  ctx.lineTo(-3, -7);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(6, -4);
  ctx.lineTo(9, -12);
  ctx.lineTo(3, -7);
  ctx.closePath();
  ctx.fill();

  // Fierce Glowing Orange Eyes
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.arc(-4, -9, 2.5, 0, Math.PI * 2);
  ctx.arc(4, -9, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // 4. Colossal Double-Bladed Battleaxe
  const axeSwing = isMoving ? Math.sin(walkCycle) * 0.25 : Math.sin(animTime * 4) * 0.1;
  ctx.save();
  ctx.translate(14, 0);
  ctx.rotate(axeSwing);

  // Wooden haft
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-2, -30, 5, 42);
  ctx.strokeStyle = '#291404';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-2, -30, 5, 42);

  // Steel Double Blades with glint
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  // Front blade
  ctx.moveTo(3, -28);
  ctx.bezierCurveTo(18, -36, 24, -14, 3, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Rear blade
  ctx.beginPath();
  ctx.moveTo(-2, -28);
  ctx.bezierCurveTo(-14, -36, -18, -14, -2, -12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();

  ctx.restore();
}

/**
 * Draw Human Brawler
 * Athletic brawler with spiky hair, red headband, taped boxing gauntlets,
 * and quick-stepping boxing footwork!
 */
export function drawHumanBrawler(ctx: CanvasRenderingContext2D, h: Hero, animTime: number) {
  const isMoving = Math.hypot(h.vx, h.vy) > 10;
  const walkFreq = 14;
  const walkCycle = animTime * walkFreq;
  const isFacingLeft = Math.cos(h.angle) < 0;

  ctx.save();
  if (isFacingLeft) ctx.scale(-1, 1);

  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -4 : Math.sin(animTime * 4) * 1.0;
  ctx.translate(0, bob);

  // 1. Boxing Sneaker Steps
  const leftBootY = isMoving ? Math.sin(walkCycle) * 6 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 6 : 0;
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.ellipse(-7, 14 + leftBootY, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(7, 14 + rightBootY, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Muscular Torso & Red Vest
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.ellipse(0, 3, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Open red martial vest
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(-15, -2, 6, 14);
  ctx.fillRect(9, -2, 6, 14);

  // 3. Head & Spiky Hair
  ctx.fillStyle = '#ffedd5';
  ctx.beginPath();
  ctx.arc(0, -9, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Red headband
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-11, -13, 22, 5);

  // Spiky blonde hair on top
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(-11, -13);
  ctx.lineTo(-8, -23);
  ctx.lineTo(-3, -14);
  ctx.lineTo(2, -24);
  ctx.lineTo(6, -14);
  ctx.lineTo(10, -21);
  ctx.lineTo(11, -13);
  ctx.closePath();
  ctx.fill();

  // Determined eyes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-3, -8, 2, 0, Math.PI * 2);
  ctx.arc(4, -8, 2, 0, Math.PI * 2);
  ctx.fill();

  // 4. Brass Gauntlet Punching Fists
  const punchL = isMoving ? Math.sin(walkCycle) * 5 : 0;
  const punchR = isMoving ? -Math.sin(walkCycle) * 5 : 0;

  ctx.fillStyle = '#f59e0b';
  // Left fist
  ctx.beginPath();
  ctx.arc(-14, 2 + punchL, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Right fist forward
  ctx.beginPath();
  ctx.arc(14, 2 + punchR, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Dwarf Demolitionist
 * Stout dwarf with brass miner helmet, glowing goggles, braided orange beard,
 * heavy iron boots, and wide-bore blunderbuss!
 */
export function drawDwarfDemolitionist(ctx: CanvasRenderingContext2D, h: Hero, animTime: number) {
  const isMoving = Math.hypot(h.vx, h.vy) > 10;
  const walkFreq = 12;
  const walkCycle = animTime * walkFreq;
  const isFacingLeft = Math.cos(h.angle) < 0;

  ctx.save();
  if (isFacingLeft) ctx.scale(-1, 1);

  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -3.5 : Math.sin(animTime * 3) * 1.0;
  ctx.translate(0, bob);

  // 1. Heavy Dwarf Iron Boots
  const leftBootY = isMoving ? Math.sin(walkCycle) * 5 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 5 : 0;
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.ellipse(-8, 14 + leftBootY, 6, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(8, 14 + rightBootY, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Chunky Armored Body
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.ellipse(0, 3, 17, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 3. Huge Bushy Ginger Beard
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.moveTo(-13, -3);
  ctx.quadraticCurveTo(0, 20, 13, -3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9a3412';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Round Dwarf Nose
  ctx.fillStyle = '#fb923c';
  ctx.beginPath();
  ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // 4. Brass Miner Helmet with Blue Goggles
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.arc(0, -10, 12, Math.PI * 0.85, Math.PI * 2.15);
  ctx.fill();
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Glowing blue goggle lenses
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(-5, -9, 4, 0, Math.PI * 2);
  ctx.arc(5, -9, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5. Blunderbuss Shotgun
  ctx.fillStyle = '#334155';
  ctx.fillRect(6, -1, 16, 6);
  // Flared muzzle
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(22, -4);
  ctx.lineTo(28, -7);
  ctx.lineTo(28, 9);
  ctx.lineTo(22, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Dual-Blade Warrior
 * Agile blade-master with blonde ponytail, nimble ninja wraps,
 * and dual glowing scimitars slicing forward!
 */
export function drawDualBladeWarrior(ctx: CanvasRenderingContext2D, h: Hero, animTime: number) {
  const isMoving = Math.hypot(h.vx, h.vy) > 10;
  const walkFreq = 16;
  const walkCycle = animTime * walkFreq;
  const isFacingLeft = Math.cos(h.angle) < 0;

  ctx.save();
  if (isFacingLeft) ctx.scale(-1, 1);

  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -4 : Math.sin(animTime * 4) * 1.0;
  ctx.translate(0, bob);

  // 1. Tabi Boots
  const leftBootY = isMoving ? Math.sin(walkCycle) * 6 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 6 : 0;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.ellipse(-6, 14 + leftBootY, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(6, 14 + rightBootY, 4.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Sleek Dark Armor
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.ellipse(0, 2, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 3. Head & Blonde Ponytail
  ctx.fillStyle = '#fed7aa';
  ctx.beginPath();
  ctx.arc(0, -7, 10.5, 0, Math.PI * 2);
  ctx.fill();

  // Blonde Ponytail swinging
  const ponySwing = isMoving ? Math.sin(walkCycle) * 5 : 0;
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(0, -11, 10, Math.PI * 0.8, Math.PI * 2.2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4, -14);
  ctx.quadraticCurveTo(-14 - ponySwing, -20, -16 - ponySwing, -10);
  ctx.quadraticCurveTo(-10, -10, -2, -12);
  ctx.closePath();
  ctx.fill();

  // Sharp eyes
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(-3, -7, 2, 0, Math.PI * 2);
  ctx.arc(4, -7, 2, 0, Math.PI * 2);
  ctx.fill();

  // 4. Dual Curved Scimitars
  const bladeGlint = Math.sin(animTime * 10) * 0.2;
  // Left Blade
  ctx.save();
  ctx.translate(-12, 1);
  ctx.rotate(-0.4 + bladeGlint);
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-10, -12, -4, -22);
  ctx.quadraticCurveTo(0, -14, 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#38bdf8'; // Cyan energy edge
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Right Blade
  ctx.save();
  ctx.translate(12, 1);
  ctx.rotate(0.4 - bladeGlint);
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(10, -12, 4, -22);
  ctx.quadraticCurveTo(0, -14, -2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * Draw Red Goblin Minion
 * Scampering crimson goblin with pointed floppy ears, glowing yellow eyes,
 * and a curved bone/iron dagger!
 */
export function drawRedGoblinMinion(ctx: CanvasRenderingContext2D, g: Enemy, animTime: number) {
  const speed = Math.hypot(g.vx, g.vy);
  const isMoving = speed > 10;
  const walkFreq = 16;
  const walkCycle = animTime * walkFreq + g.x;
  const isFacingLeft = Math.cos(g.angle) < 0;

  ctx.save();
  ctx.translate(g.x, g.y);
  if (isFacingLeft) ctx.scale(-1, 1);

  const bob = isMoving ? Math.abs(Math.sin(walkCycle)) * -3.5 : Math.sin(animTime * 4) * 0.8;
  ctx.translate(0, bob);

  // 1. Little Scampering Red Claws / Feet
  const leftFootY = isMoving ? Math.sin(walkCycle) * 5 : 0;
  const rightFootY = isMoving ? -Math.sin(walkCycle) * 5 : 0;
  ctx.fillStyle = '#991b1b';
  ctx.beginPath();
  ctx.ellipse(-5, g.radius * 0.85 + leftFootY, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(5, g.radius * 0.85 + rightFootY, 4, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Red Goblin Body
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Brown leather loincloth
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-g.radius * 0.7, g.radius * 0.3, g.radius * 1.4, 5);

  // 3. Pointed Goblin Ears
  ctx.fillStyle = '#dc2626';
  // Left ear
  ctx.beginPath();
  ctx.moveTo(-g.radius + 2, -2);
  ctx.lineTo(-g.radius - 12, -9);
  ctx.lineTo(-g.radius + 2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Right ear
  ctx.beginPath();
  ctx.moveTo(g.radius - 2, -2);
  ctx.lineTo(g.radius + 12, -9);
  ctx.lineTo(g.radius - 2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 4. Mischievous Glowing Yellow Eyes
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(2, -3, 3, 0, Math.PI * 2);
  ctx.arc(7, -3, 3, 0, Math.PI * 2);
  ctx.fill();

  // Red pupils
  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.arc(3, -3, 1.2, 0, Math.PI * 2);
  ctx.arc(8, -3, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // 5. Weapon: Spear & Buckler for spearman, or Jagged Dagger for minion
  if (g.type === 'goblin_spearman') {
    // Spear thrust animation
    const spearThrust = isMoving ? Math.sin(walkCycle) * 6 : 0;
    ctx.save();
    ctx.translate(g.radius * 0.7 + spearThrust, 2);
    // Wooden pole
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-8, -2, 28, 4);
    // Steel Spearhead
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(20, -6);
    ctx.lineTo(32, 0);
    ctx.lineTo(20, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Small buckler shield on opposite side
    ctx.save();
    ctx.translate(-g.radius * 0.5, 3);
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Iron central boss
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Sharp Dagger in claw
    const knifeSwing = isMoving ? Math.sin(walkCycle) * 0.3 : Math.sin(animTime * 6) * 0.1;
    ctx.save();
    ctx.translate(g.radius * 0.7, 2);
    ctx.rotate(knifeSwing);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(14, -2);
    ctx.lineTo(4, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Draw Goblin King Boss
 * Giant chunky red/crimson Goblin King with a massive golden spiked crown,
 * purple royal mantle with ermine fur, glowing menace eyes, skull belt,
 * and a colossal iron-studded royal scepter/club!
 */
export function drawGoblinKing(ctx: CanvasRenderingContext2D, boss: Enemy, animTime: number) {
  const isMoving = Math.hypot(boss.vx, boss.vy) > 10;
  const walkFreq = 10;
  const walkCycle = animTime * walkFreq;
  const isFacingLeft = Math.cos(boss.angle) < 0;

  ctx.save();
  ctx.translate(boss.x, boss.y);
  if (isFacingLeft) ctx.scale(-1, 1);

  const stomp = isMoving ? Math.abs(Math.sin(walkCycle)) * -5 : Math.sin(animTime * 3) * 1.5;

  // 1. Red Royal Danger Aura Ring on ground
  ctx.strokeStyle = '#ef444455';
  ctx.lineWidth = 3.5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(0, boss.radius * 0.5, boss.radius + 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Heavy King Stomping Boots
  const leftBootY = isMoving ? Math.sin(walkCycle) * 7 : 0;
  const rightBootY = isMoving ? -Math.sin(walkCycle) * 7 : 0;
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.ellipse(-14, boss.radius * 0.85 + leftBootY, 12, 7, 0, 0, Math.PI * 2);
  ctx.ellipse(14, boss.radius * 0.85 + rightBootY, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.translate(0, stomp);

  // 3. Purple Royal Mantle / Cape with Ermine White Fur
  ctx.fillStyle = '#6b21a8'; // Purple royal cape
  ctx.beginPath();
  ctx.arc(0, 10, boss.radius + 8, Math.PI * 0.2, Math.PI * 0.8);
  ctx.lineTo(-boss.radius - 14, boss.radius + 18);
  ctx.lineTo(boss.radius + 14, boss.radius + 18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3b0764';
  ctx.lineWidth = 3;
  ctx.stroke();

  // White fur trim
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(0, -boss.radius * 0.6, boss.radius * 0.85, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Massive Crimson Goblin King Body
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#450a0a';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Spiked Dark Pauldrons
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.arc(-boss.radius + 4, -12, 14, 0, Math.PI * 2);
  ctx.arc(boss.radius - 4, -12, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c1917';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Gold spikes on shoulders
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(-boss.radius, -22);
  ctx.lineTo(-boss.radius - 8, -34);
  ctx.lineTo(-boss.radius + 8, -22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(boss.radius, -22);
  ctx.lineTo(boss.radius + 8, -34);
  ctx.lineTo(boss.radius - 8, -22);
  ctx.closePath();
  ctx.fill();

  // Skull Belt Buckle
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.arc(0, boss.radius - 8, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5. Angry Glowing Eyes & Lower Tusks
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.ellipse(-10, -6, 5, 4, -0.1, 0, Math.PI * 2);
  ctx.ellipse(12, -6, 5, 4, 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath();
  ctx.arc(-9, -6, 2, 0, Math.PI * 2);
  ctx.arc(13, -6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Fierce Lower Tusks
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.lineTo(-12, -4);
  ctx.lineTo(-4, 6);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(12, -4);
  ctx.lineTo(4, 6);
  ctx.closePath();
  ctx.fill();

  // 6. Giant Golden Spiked Crown with Royal Rubies
  ctx.fillStyle = '#eab308';
  ctx.beginPath();
  ctx.moveTo(-24, -boss.radius + 8);
  ctx.lineTo(-18, -boss.radius - 18);
  ctx.lineTo(-8, -boss.radius - 4);
  ctx.lineTo(0, -boss.radius - 24); // Center giant peak
  ctx.lineTo(8, -boss.radius - 4);
  ctx.lineTo(18, -boss.radius - 18);
  ctx.lineTo(24, -boss.radius + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#713f12';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Large Red Rubies
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(0, -boss.radius - 8, 4.5, 0, Math.PI * 2);
  ctx.arc(-15, -boss.radius - 5, 3, 0, Math.PI * 2);
  ctx.arc(15, -boss.radius - 5, 3, 0, Math.PI * 2);
  ctx.fill();

  // 7. Colossal Studded Royal Scepter / Club
  const clubSwing = isMoving ? Math.sin(walkCycle) * 0.2 : Math.sin(animTime * 5) * 0.1;
  ctx.save();
  ctx.translate(boss.radius * 0.8, -4);
  ctx.rotate(clubSwing);

  ctx.fillStyle = '#78350f';
  ctx.fillRect(-4, -38, 8, 48);
  ctx.strokeStyle = '#291404';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-4, -38, 8, 48);

  // Iron club head with spikes
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.arc(0, -38, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Iron spikes protruding
  ctx.fillStyle = '#e2e8f0';
  for (let s = 0; s < 5; s++) {
    const sAng = (s * Math.PI) / 2.5 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(sAng) * 11, -38 + Math.sin(sAng) * 11);
    ctx.lineTo(Math.cos(sAng) * 20, -38 + Math.sin(sAng) * 20);
    ctx.lineTo(Math.cos(sAng + 0.3) * 11, -38 + Math.sin(sAng + 0.3) * 11);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  ctx.restore();
}
