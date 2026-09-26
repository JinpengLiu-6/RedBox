/**
 * Throwaway debug view. It exists to prove the seam and to give the frontend a
 * live target on day one - replace it with the Phaser scene. It deliberately
 * uses nothing but `net`, `shared` selectors and a canvas, which is exactly the
 * budget the real client has.
 */

import {
  CLASSES, MAP, MATCH, PHASE_LABEL, OUTCOME_LABEL, MatchPhase,
  classOf, crystalsRemaining, hpPct, isKnownFake, isKnownReal, isUnscanned,
} from '@redbox/shared';
import { Net } from './net.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const tauntEl = document.getElementById('taunt')!;

const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
addEventListener('resize', resize); resize();

const net = new Net();
await net.connect(
  { name: 'dev-' + Math.floor(Math.random() * 1000), classId: 'scanner' },
  { onError: (c, m) => (hud.textContent = `error ${c}: ${m}`) },
);
net.room.onStateChange(() => net.sample());
net.ready();

// --- input: send on change only, never per frame --------------------------
const keys = new Set<string>();
let lastSent = '';
const step = () => {
  const dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  const dy = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
  const sig = `${dx},${dy}`;
  if (sig !== lastSent) { lastSent = sig; net.move(dx, dy); }
};
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); step(); });
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); step(); });

// --- render ---------------------------------------------------------------
const scale = () => Math.min(canvas.width / MAP.WIDTH_PX, canvas.height / MAP.HEIGHT_PX);

function frame() {
  const s = net.state;
  // The first frames run before the first patch decodes: collections are not
  // populated yet. Guard rather than assuming state is ready on frame 1.
  if (!s?.crystals) { requestAnimationFrame(frame); return; }
  const k = scale();
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(k, k);

  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(0, 0, MAP.WIDTH_PX, MAP.HEIGHT_PX);

  const ring = (x: number, y: number, r: number, color: string) => {
    ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  };
  ring(MAP.BASE.x, MAP.BASE.y, MAP.BASE.radius, '#22c55e');
  ring(MAP.BOSS_ZONE.x, MAP.BOSS_ZONE.y, MAP.BOSS_ZONE.radius, '#7f1d1d');

  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  for (const [, c] of s.crystals)
    dot(c.x, c.y, 16, c.destroyed ? '#334155' : '#38bdf8');

  for (const [, b] of s.boxes) {
    const color = isKnownReal(b) ? '#22c55e' : isKnownFake(b) ? '#ef4444' : '#94a3b8';
    ctx.fillStyle = color;
    ctx.fillRect(b.x - 12, b.y - 12, 24, 24);
    if (isUnscanned(b)) { ctx.fillStyle = '#0b0f17'; ctx.fillRect(b.x - 6, b.y - 6, 12, 12); }
  }

  const bp = net.positionOf('boss', s.boss);
  dot(bp.x, bp.y, 46, s.boss.vulnerable ? '#f97316' : '#7f1d1d');

  for (const [id, p] of s.players) {
    if (!p.alive) continue;
    const pos = net.positionOf(id, p);
    dot(pos.x, pos.y, 20, '#' + classOf(p).color.toString(16).padStart(6, '0'));
    if (id === net.sessionId) ring(pos.x, pos.y, 26, '#ffffff');
  }
  ctx.restore();

  const me = net.me;
  hud.textContent = [
    `room ${s.roomCode}   ${PHASE_LABEL[s.phase] ?? s.phase}`,
    `time  ${Math.ceil(s.timeRemainingMs / 1000)}s / ${MATCH.DURATION_MS / 1000}s`,
    `stage ${s.stage}   crystals left ${crystalsRemaining(s)}`,
    `boxes ${s.boxesDelivered}/${MATCH.BOXES_TO_WIN}   boss lives ${s.boss.lives}`,
    me ? `me    ${classOf(me).name}  hp ${Math.round(hpPct(me) * 100)}%  pts ${me.skillPoints}` : '',
    s.phase === MatchPhase.Ended ? `RESULT: ${OUTCOME_LABEL[s.outcome]}` : '',
  ].filter(Boolean).join('\n');

  tauntEl.textContent = s.director.taunt
    ? `“${s.director.taunt}”   — ${s.director.reasoning}` : '';

  requestAnimationFrame(frame);
}
frame();
