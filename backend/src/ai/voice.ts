/**
 * Optional boss voice. Off unless VOICE_URL and VOICE_TOKEN are set; the game
 * plays identically without it.
 *
 * Watches `state.director` (written by the director system, which runs right
 * before this one) and speaks each new LLM taunt once. The taunt text is already
 * on screen; the audio is a bonus. update() never awaits: the audio settles on
 * its own and is broadcast only if it still belongs to what players are reading.
 */

import { MatchPhase, ServerMessage, type System } from '@redbox/shared';
import { VOICE_TAUNT_TIMEOUT_MS, fetchVoice, voiceConfig } from './voiceClient.js';

/** Audio that lands later than this after its taunt appeared (match time) is dropped. */
const MAX_AUDIO_AGE_MS = 9_000;
/**
 * Gradium bills 1 credit per character (free plan ~45k/month), so a match voices
 * at most this many taunts. Override with VOICE_MAX_LINES.
 */
const DEFAULT_MAX_LINES = 20;

function maxLines(): number {
  const raw = process.env.VOICE_MAX_LINES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_MAX_LINES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_MAX_LINES;
}

export function createVoiceSystem(): System {
  let lastSeenUpdatedAt = -1;
  let lastVoicedTaunt = '';
  let linesVoiced = 0;
  let budgetLogged = false;
  /** Id of the newest taunt a call was made for; only its audio may play. */
  let latestLine = 0;
  /** Bumped on init and on match end so audio from an earlier match can never play. */
  let matchToken = 0;

  return {
    id: 'voice',

    init() {
      matchToken += 1;
      lastSeenUpdatedAt = -1;
      lastVoicedTaunt = '';
      linesVoiced = 0;
      budgetLogged = false;
    },

    update(w) {
      const cfg = voiceConfig();
      if (!cfg) return;

      const dir = w.state.director;
      if (dir.updatedAtMs === lastSeenUpdatedAt) return;
      lastSeenUpdatedAt = dir.updatedAtMs;

      const taunt = dir.taunt.trim();
      if (dir.source !== 'llm' || taunt === '' || taunt === lastVoicedTaunt) return;

      const budget = maxLines();
      if (linesVoiced >= budget) {
        if (!budgetLogged) {
          budgetLogged = true;
          console.log(`[voice] ${budget} taunts voiced this match (VOICE_MAX_LINES); the rest are text only.`);
        }
        return;
      }

      linesVoiced += 1;
      lastVoicedTaunt = taunt;
      const line = ++latestLine;
      const token = matchToken;
      const spokenAt = dir.updatedAtMs;
      const wave = w.wave;

      void fetchVoice('taunt', taunt, VOICE_TAUNT_TIMEOUT_MS, cfg)
        .then((audio) => {
          if (!audio || token !== matchToken || line !== latestLine) return;
          const s = w.state;
          if (s.phase !== MatchPhase.Playing || w.wave !== wave) return;
          if (w.now - spokenAt > MAX_AUDIO_AGE_MS) return;
          // The line on screen must still be this one (a newer, unvoiced taunt may have replaced it).
          if (s.director.taunt.trim() !== taunt) return;
          w.broadcast(ServerMessage.BossVoice, audio);
        })
        .catch(() => {});
    },

    onEnd() {
      matchToken += 1;
    },
  };
}
