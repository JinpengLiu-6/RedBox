/**
 * Optional boss voice: the one HTTP call to the Modal "voice" endpoint (Gradium
 * TTS behind it), shared by voice.ts (taunts) and debrief.ts (recap).
 *
 * Off unless VOICE_URL and VOICE_TOKEN are both set. Text always reaches the
 * players first through the existing messages; audio is a best-effort bonus, so
 * nothing here ever throws or rejects: every failure resolves to null and is
 * logged (the first, then every 10th) without the token.
 */

import { MatchPhase, ServerMessage, type World } from '@redbox/shared';

export type VoiceKind = 'taunt' | 'recap';

/**
 * Whole round trip including the body. Modal's own upstream deadline is
 * 6 s (taunt) / 18 s (recap); the extra seconds cover a Modal cold start.
 */
export const VOICE_TAUNT_TIMEOUT_MS = 8_000;
export const VOICE_RECAP_TIMEOUT_MS = 22_000;
/** A 600-char recap is ~200 kB of Opus at most; anything far bigger is not what we asked for. */
const MAX_AUDIO_BYTES = 2_000_000;
/** Every Ogg page starts with "OggS". */
const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53] as const;
const LOG_DETAIL_CHARS = 160;

export interface VoiceConfig { url: string; token: string; }

/** Both env vars or nothing: the endpoint turns text into billed audio and must never be called unauthenticated. */
export function voiceConfig(): VoiceConfig | null {
  const url = process.env.VOICE_URL;
  const token = process.env.VOICE_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * POST {text, kind} and resolve to the Ogg Opus bytes, or null on any failure
 * (disabled, HTTP error, timeout, empty/oversized/non-Ogg body).
 */
export async function fetchVoice(
  kind: VoiceKind, text: string, timeoutMs: number, cfg: VoiceConfig | null = voiceConfig(),
): Promise<Uint8Array | null> {
  if (!cfg) return null;
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-voice-token': cfg.token },
      body: JSON.stringify({ text, kind }),
      // Covers the body download too, not just the headers.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      reportFailure(kind, `HTTP ${res.status}${detail ? ` ${detail.slice(0, LOG_DETAIL_CHARS)}` : ''}`, timeoutMs, cfg.token);
      return null;
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length === 0) { reportFailure(kind, 'empty audio body', timeoutMs, cfg.token); return null; }
    if (audio.length > MAX_AUDIO_BYTES) {
      reportFailure(kind, `audio too large (${audio.length} bytes)`, timeoutMs, cfg.token);
      return null;
    }
    if (!OGG_MAGIC.every((b, i) => audio[i] === b)) {
      reportFailure(kind, 'response is not Ogg audio', timeoutMs, cfg.token);
      return null;
    }
    return audio;
  } catch (err) {
    reportFailure(kind, err instanceof Error ? `${err.name}: ${err.message}` : String(err), timeoutMs, cfg.token);
    return null;
  }
}

/**
 * Speak the end-of-match recap. Called by debrief.ts right after it broadcast
 * the text. Fire-and-forget; VOICE_RECAP=0 turns just this part off.
 */
export function speakRecap(w: World, summary: string): void {
  const cfg = voiceConfig();
  if (!cfg || process.env.VOICE_RECAP === '0') return;
  const text = summary.trim();
  if (text === '') return;
  void fetchVoice('recap', text, VOICE_RECAP_TIMEOUT_MS, cfg)
    .then((audio) => {
      // After a restart the party is back in the lobby: the recap would talk over it.
      if (audio && w.state.phase === MatchPhase.Ended) w.broadcast(ServerMessage.DebriefVoice, audio);
    })
    .catch(() => {});
}

/**
 * Same policy as the director: failures are otherwise invisible (the boss just
 * stays silent), so log the first and then every 10th, with the reason. The
 * token is scrubbed from anything logged, including upstream error bodies.
 */
let failures = 0;
function reportFailure(kind: VoiceKind, reason: string, timeoutMs: number, token: string) {
  failures++;
  if (failures === 1 || failures % 10 === 0) {
    const safe = reason.split(token).join('[redacted]').replace(/\s+/g, ' ').trim();
    console.warn(`[voice] ${kind} call failed (${failures} so far): ${safe}. Timeout ${timeoutMs} ms.`);
  }
}

/** Tests only: make the next failure the "first" one again so it is logged. */
export function resetVoiceFailureLog() { failures = 0; }
