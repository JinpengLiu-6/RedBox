/**
 * OWNER: see brief backend/tasks/09-ai-backend.md
 * Post-match recap. With DEBRIEF_URL the event log is POSTed to an LLM; without
 * it (or on any failure) a local English recap is built from the events so the
 * end screen always gets something.
 */

import {
  OUTCOME_LABEL, ServerMessage, classIdOf,
  type DebriefPayload, type DebriefRequest, type System, type World,
} from '@redbox/shared';

const DEBRIEF_TIMEOUT_MS = 15_000;
const MAX_HIGHLIGHTS = 6;
const MAX_SUMMARY_CHARS = 400;
const MAX_HIGHLIGHT_CHARS = 120;

interface HeroTally { deliveries: number; damageEvents: number; deaths: number; }

export function createDebriefSystem(): System {
  return {
    id: 'debrief',
    update(_w) {},

    onEnd(w) {
      const req = buildRequest(w);
      const url = process.env.DEBRIEF_URL;
      if (!url) { w.broadcast(ServerMessage.Debrief, localDebrief(req)); return; }

      fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(DEBRIEF_TIMEOUT_MS),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: unknown) => validatePayload(body, req) ?? localDebrief(req))
        .catch(() => localDebrief(req))
        .then((payload) => w.broadcast(ServerMessage.Debrief, payload));
    },
  };
}

function buildRequest(w: World): DebriefRequest {
  const s = w.state;
  return {
    outcome: s.outcome,
    outcomeLabel: OUTCOME_LABEL[s.outcome] ?? 'None',
    durationMs: s.elapsedMs,
    players: [...s.players.values()].map((p) => ({
      id: p.id, name: p.name, classId: classIdOf(p), isBot: p.isBot,
    })),
    events: w.allEvents(),
  };
}

/** Strict: an unusable summary or an MVP nobody played falls back to the local recap. */
export function validatePayload(body: unknown, req: DebriefRequest): DebriefPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.summary !== 'string' || b.summary.trim() === '') return null;
  const highlights = (Array.isArray(b.highlights) ? b.highlights : [])
    .filter((h): h is string => typeof h === 'string' && h.trim() !== '')
    .slice(0, MAX_HIGHLIGHTS)
    .map((h) => h.trim().slice(0, MAX_HIGHLIGHT_CHARS));
  const out: DebriefPayload = { summary: b.summary.trim().slice(0, MAX_SUMMARY_CHARS), highlights };
  if (b.mvpPlayerId !== undefined && b.mvpPlayerId !== '') {
    if (typeof b.mvpPlayerId !== 'string' || !req.players.some((p) => p.id === b.mvpPlayerId)) return null;
    out.mvpPlayerId = b.mvpPlayerId;
  }
  return out;
}

/** Deterministic English recap. MVP = most deliveries, then most damage events. */
export function localDebrief(req: DebriefRequest): DebriefPayload {
  const tally = new Map<string, HeroTally>();
  const nameOf = new Map(req.players.map((p) => [p.id, p.name || p.classId]));
  const hero = (id: string): HeroTally => {
    let t = tally.get(id);
    if (!t) { t = { deliveries: 0, damageEvents: 0, deaths: 0 }; tally.set(id, t); }
    return t;
  };
  for (const p of req.players) hero(p.id);

  let deliveries = 0, traps = 0, towers = 0, deaths = 0, bossKills = 0, wavesCleared = 0;
  for (const e of req.events) {
    switch (e.type) {
      case 'box_delivered': deliveries++; if (e.playerId) hero(e.playerId).deliveries++; break;
      case 'trap_triggered': traps++; break;
      case 'crystal_destroyed': towers++; if (e.playerId) hero(e.playerId).damageEvents++; break;
      case 'player_died': deaths++; if (e.playerId) hero(e.playerId).deaths++; break;
      case 'boss_defeated': bossKills++; if (e.playerId) hero(e.playerId).damageEvents++; break;
      case 'wave_cleared': wavesCleared++; break;
      case 'ability_used': if (e.playerId) hero(e.playerId).damageEvents++; break;
      default: break;
    }
  }

  const mvp = pickMvp(tally);
  const minutes = Math.floor(req.durationMs / 60_000);
  const seconds = Math.floor((req.durationMs % 60_000) / 1000);
  const duration = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const summary = `${req.outcomeLabel} after ${duration}. The heroes delivered ${plural(deliveries, 'crate')}, `
    + `sprang ${plural(traps, 'trap')}, toppled ${plural(towers, 'tower')} and went down ${plural(deaths, 'time')}.`;

  const highlights: string[] = [];
  if (wavesCleared > 0) highlights.push(`${plural(wavesCleared, 'wave')} cleared.`);
  if (bossKills > 0) highlights.push(`The Goblin King was felled ${plural(bossKills, 'time')}.`);
  if (mvp) {
    const t = tally.get(mvp)!;
    highlights.push(`MVP: ${nameOf.get(mvp) ?? mvp} with ${plural(t.deliveries, 'delivery', 'deliveries')}.`);
  }
  for (const [id, t] of [...tally.entries()].sort((a, b) => b[1].deaths - a[1].deaths)) {
    if (t.deaths === 0 || highlights.length >= MAX_HIGHLIGHTS) break;
    highlights.push(`${nameOf.get(id) ?? id} fell ${plural(t.deaths, 'time')}.`);
  }
  if (highlights.length === 0) highlights.push('A quiet heist: nothing much happened.');

  const payload: DebriefPayload = { summary, highlights: highlights.slice(0, MAX_HIGHLIGHTS) };
  if (mvp) payload.mvpPlayerId = mvp;
  return payload;
}

function pickMvp(tally: Map<string, HeroTally>): string | undefined {
  let best: string | undefined;
  let bestT: HeroTally | undefined;
  for (const [id, t] of tally) {
    if (!bestT || t.deliveries > bestT.deliveries
      || (t.deliveries === bestT.deliveries && t.damageEvents > bestT.damageEvents)) {
      best = id; bestT = t;
    }
  }
  if (!bestT || (bestT.deliveries === 0 && bestT.damageEvents === 0)) return undefined;
  return best;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
