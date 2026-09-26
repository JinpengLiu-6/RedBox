/**
 * Throwaway debug view. Proves the seam and gives the frontend a live target:
 * it renders the shared arena, follows the local hero with a camera, and wires
 * WASD / mouse / Q E R / F exactly as the real client should. Replace with Phaser.
 */

import {
  ARENA_H, ARENA_ROWS, ARENA_W, MAP, OUTCOME_LABEL, PHASE_LABEL, SLOT_UNLOCK_LABEL, TILE,
  MatchPhase, abilityCooldownProgress, classOf, cratesRemaining, hpPct, isAbilityUnlocked,
} from '@redbox/shared';
import { Net } from './net.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const tauntEl = document.getElementById('taunt')!;
const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
addEventListener('resize', resize); resize();

const net = new Net();
/** Connection trouble, shown on top of the HUD until it clears. */
let notice = '';
try {
  await net.connect(
    { name: 'dev-' + Math.floor(Math.random() * 1000), classId: 'mage' },
    {
      onError: (c, m) => (notice = `error ${c}: ${m}`),
      onReconnecting: () => (notice = 'Connection lost. Reconnecting...'),
      onReconnected: () => (notice = ''),
      onLeave: () => (notice = 'Disconnected from the game. Reload the page to play again.'),
    },
  );
} catch (err) {
  // Never fail silently: a blank page with dead controls is the worst outcome.
  hud.textContent = `Could not join a game: ${err instanceof Error ? err.message : String(err)}\nReload the page to try again.`;
  throw err;
}
net.ready();

// This client has no lobby screen: whenever the room is back in the lobby
// (after Enter = restart), ready up again, or the match never starts.
let lastPhase = net.state?.phase;
function readyAgainInLobby() {
  const phase = net.state.phase;
  if (phase === MatchPhase.Lobby && lastPhase !== MatchPhase.Lobby && net.me && !net.me.ready) net.ready();
  lastPhase = phase;
}

// ---- camera ---------------------------------------------------------------
const cam = { x: 0, y: 0 };
const toWorld = (sx: number, sy: number) => ({ x: sx + cam.x, y: sy + cam.y });

// ---- input: send on change only, never per frame --------------------------
const keys = new Set<string>();
let lastSent = '';
const sendMove = () => {
  const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  const dy = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
  const sig = `${dx},${dy}`;
  if (sig !== lastSent) { lastSent = sig; net.move(dx, dy); }
};
const mouse = { x: 0, y: 0 };
addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener('mousedown', (e) => { if (e.button === 0) { const a = toWorld(e.clientX, e.clientY); net.attack(a.x, a.y); } });
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'q' || k === 'e' || k === 'r') {
    const a = toWorld(mouse.x, mouse.y);
    net.useAbility(k === 'q' ? 0 : k === 'e' ? 1 : 2, a.x, a.y);
  } else if (k === 'f') net.interact();
  else if (k === 'enter' && net.state.phase === MatchPhase.Ended) net.restart();
  keys.add(k); sendMove();
});
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); sendMove(); });
// A key released while the window is unfocused never fires keyup: drop them
// all, or the hero keeps walking on its own.
const releaseAll = () => { keys.clear(); sendMove(); };
addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

// ---- render ---------------------------------------------------------------
const TILE_COLOR: Record<string, string> = { '#': '#8b5a2b', ',': '#5a9e4b', B: '#6ee7b7', S: '#6ee7b7' };

function frame() {
  const s = net.state;
  if (!s?.crystals) { requestAnimationFrame(frame); return; }
  readyAgainInLobby();
  const me = net.me;
  const mePos = me ? net.positionOf(me.id, me) : MAP.BASE;
  cam.x = Math.max(0, Math.min(MAP.WIDTH_PX - canvas.width, mePos.x - canvas.width / 2));
  cam.y = Math.max(0, Math.min(MAP.HEIGHT_PX - canvas.height, mePos.y - canvas.height / 2));

  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(-cam.x, -cam.y);
  for (let ty = 0; ty < ARENA_H; ty++) for (let tx = 0; tx < ARENA_W; tx++) {
    const ch = ARENA_ROWS[ty]![tx]!;
    ctx.fillStyle = TILE_COLOR[ch] ?? '#efe3c8';
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
  }
  const dot = (x: number, y: number, r: number, c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const ring = (x: number, y: number, r: number, c: string) => { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); };

  for (const [, h] of s.hazards) {
    ring(h.x, h.y, h.radius, '#ef4444');
  }
  for (const [, c] of s.crystals) dot(c.x, c.y, 16, c.destroyed ? '#475569' : '#38bdf8');
  for (const [, b] of s.boxes) { ctx.fillStyle = '#a16207'; ctx.fillRect(b.x - 13, b.y - 13, 26, 26); }
  for (const [id, c] of s.creeps) {
    const p = net.positionOf(id, c);
    dot(p.x, p.y, 13, '#dc2626');
    if (c.windupUntilMs > s.elapsedMs) { ctx.fillStyle = '#fff'; ctx.fillText('!', p.x - 2, p.y - 18); }
  }
  if (s.boss.alive) {
    const bp = net.positionOf('boss', s.boss);
    if (s.boss.attack) ring(s.boss.attackX, s.boss.attackY, 110, '#f87171');
    dot(bp.x, bp.y, 44, '#b91c1c');
  }
  for (const [id, p] of s.players) {
    if (!p.alive) continue;
    const pos = net.positionOf(id, p);
    dot(pos.x, pos.y, 17, '#' + classOf(p).color.toString(16).padStart(6, '0'));
    if (id === net.sessionId) ring(pos.x, pos.y, 23, '#ffffff');
    if (p.carryingBoxId) { ctx.fillStyle = '#a16207'; ctx.fillRect(pos.x + 8, pos.y - 26, 16, 16); }
  }
  ctx.restore();

  const skills = me ? classOf(me).abilities.map((a, i) =>
    isAbilityUnlocked(me, i)
      ? `${'QER'[i]} ${a.name} ${Math.round(abilityCooldownProgress(me, i, s.elapsedMs) * 100)}%`
      : `${'QER'[i]} [locked: ${SLOT_UNLOCK_LABEL[i]}]`).join('   ') : '';
  hud.textContent = [
    notice,
    `room ${s.roomCode}   ${PHASE_LABEL[s.phase] ?? s.phase}   ${Math.ceil(s.timeRemainingMs / 1000)}s`,
    `WAVE ${s.stage} / 3   CRATES ${s.boxesDelivered} / ${s.boxesRequired}  (${cratesRemaining(s)} to go)`,
    `GOBLIN KING ${s.boss.alive ? Math.round(hpPct(s.boss) * 100) + '%' : 'defeated'}   dmg x${s.bossDamageMult.toFixed(2)}`,
    me ? `${classOf(me).name}  hp ${Math.round(hpPct(me) * 100)}%  lives ${me.lives}` : '',
    skills,
    s.phase === MatchPhase.Ended ? `RESULT: ${OUTCOME_LABEL[s.outcome]}   (Enter = restart)` : '',
  ].filter(Boolean).join('\n');
  tauntEl.textContent = s.director.taunt ? `"${s.director.taunt}" — ${s.director.reasoning}` : '';
  requestAnimationFrame(frame);
}
frame();
