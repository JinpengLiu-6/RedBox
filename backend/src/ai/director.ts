/**
 * OWNER: see brief backend/tasks/09-ai-backend.md
 * Optional LLM boss director. Off unless DIRECTOR_URL is set; the game plays
 * identically without it. update() never awaits: the fetch settles into the
 * closure and is applied on a later tick, and only if the wave/match is still
 * the one the snapshot described.
 */

import {
  CLASS_IDS, CLASS_INDEX, DIRECTOR, MatchPhase, ServerMessage, classIdOf, hpPct,
  type ClassId, type DirectorDecision, type DirectorSnapshot, type System, type World,
} from '@redbox/shared';

/** First snapshot is sent this long after the match starts. */
const FIRST_CALL_MS = 8_000;
/** Replicated to every client, so an LLM cannot flood the schema with prose. */
const REASONING_MAX_CHARS = 240;

interface Pending { wave: number; decision: DirectorDecision | null; settled: boolean; }

export function createDirectorSystem(): System {
  let nextCallAt = FIRST_CALL_MS;
  let inflight: Pending | null = null;
  let matchToken = 0;

  return {
    id: 'director',

    init() {
      matchToken += 1;
      nextCallAt = FIRST_CALL_MS;
      inflight = null;
    },

    update(w) {
      const url = process.env.DIRECTOR_URL;
      if (!url) return;

      if (inflight?.settled) {
        const result = inflight;
        inflight = null;
        if (result.decision && result.wave === w.wave && w.state.phase === MatchPhase.Playing) {
          applyDecision(w, result.decision);
        }
      }

      if (w.now < nextCallAt || inflight) return;
      nextCallAt = w.now + DIRECTOR.INTERVAL_MS;

      const pending: Pending = { wave: w.wave, decision: null, settled: false };
      inflight = pending;
      const token = matchToken;
      const snapshot = buildSnapshot(w);

      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.timeout(DIRECTOR.TIMEOUT_MS),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: unknown) => { pending.decision = validateDecision(body); })
        .catch(() => { pending.decision = null; })
        .finally(() => { if (token === matchToken) pending.settled = true; });
    },
  };
}

function buildSnapshot(w: World): DirectorSnapshot {
  const s = w.state;
  const threat = new Map(w.threatEntries());
  let total = 0;
  for (const t of threat.values()) total += t;
  const boss = { x: s.boss.x, y: s.boss.y };
  const players = [...s.players.values()];
  return {
    elapsedMs: s.elapsedMs,
    timeRemainingMs: s.timeRemainingMs,
    wave: w.wave,
    bossAlive: s.boss.alive,
    bossHpPct: hpPct(s.boss),
    bossDamageMult: s.bossDamageMult,
    towersDestroyed: s.crystalsDestroyed,
    cratesDelivered: s.boxesDelivered,
    cratesRequired: s.boxesRequired,
    carriers: players.filter((p) => p.carryingBoxId !== '').map((p) => p.id),
    players: players.map((p) => ({
      id: p.id,
      classId: classIdOf(p),
      hpPct: hpPct(p),
      lives: p.lives,
      alive: p.alive,
      distanceToBoss: Math.round(w.distance(p, boss)),
      threatShare: total > 0 ? (threat.get(p.id) ?? 0) / total : 0,
      carrying: p.carryingBoxId !== '',
    })),
    recent: w.recentEvents(15),
  };
}

function isClassId(v: unknown): v is ClassId {
  return typeof v === 'string' && (CLASS_IDS as readonly string[]).includes(v);
}

/** Strict: unknown focus, non-finite biases or non-string text -> whole decision dropped. */
export function validateDecision(body: unknown): DirectorDecision | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const focus = b.focus ?? null;
  if (focus !== null && !isClassId(focus)) return null;

  const threatBias: Partial<Record<ClassId, number>> = {};
  if (b.threatBias !== undefined) {
    if (!b.threatBias || typeof b.threatBias !== 'object') return null;
    for (const [k, v] of Object.entries(b.threatBias as Record<string, unknown>)) {
      if (!isClassId(k)) return null;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
      threatBias[k] = v;
    }
  }

  const taunt = b.taunt === undefined ? '' : b.taunt;
  const reasoning = b.reasoning === undefined ? '' : b.reasoning;
  if (typeof taunt !== 'string' || typeof reasoning !== 'string') return null;

  return {
    focus,
    threatBias,
    taunt: taunt.trim().slice(0, DIRECTOR.TAUNT_MAX_CHARS),
    reasoning: reasoning.trim().slice(0, REASONING_MAX_CHARS),
  };
}

function applyDecision(w: World, d: DirectorDecision) {
  for (const c of CLASS_IDS) w.setThreatBias(c, 1);
  for (const [c, mult] of Object.entries(d.threatBias) as Array<[ClassId, number]>) w.setThreatBias(c, mult);

  const dir = w.state.director;
  dir.focusClassIndex = d.focus ? CLASS_INDEX[d.focus] : -1;
  dir.taunt = d.taunt;
  dir.reasoning = d.reasoning;
  dir.updatedAtMs = w.now;
  dir.source = 'llm';

  w.broadcast(ServerMessage.Director, { ...d, source: 'llm' });
  w.emit({
    type: 'director_decision',
    atMs: w.now,
    classId: d.focus ?? undefined,
    label: d.taunt || d.reasoning,
  });
}
