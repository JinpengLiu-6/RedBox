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
/**
 * A 600-char recap is ~200 kB of Opus at most; anything far bigger is not what
 * we asked for. Enforced while reading, so an oversized body is never buffered.
 */
export const MAX_AUDIO_BYTES = 2_000_000;
/** Every Ogg page starts with "OggS". */
const OGG_MAGIC = [0x4f, 0x67, 0x67, 0x53] as const;
/** Error bodies: read at most this much, redact the token, then keep LOG_DETAIL_CHARS. */
const ERROR_BODY_BYTES = 4_096;
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
 * (disabled, HTTP error or redirect, timeout, empty/oversized/non-Ogg body).
 */
export async function fetchVoice(
  kind: VoiceKind, text: string, timeoutMs: number, cfg: VoiceConfig | null = voiceConfig(),
): Promise<Uint8Array | null> {
  if (!cfg) return null;
  const fail = (reason: string) => { reportFailure(kind, reason, timeoutMs, cfg.token); return null; };
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-voice-token': cfg.token },
      body: JSON.stringify({ text, kind }),
      // Never follow a redirect: fetch would forward x-voice-token (only
      // Authorization/Cookie are stripped cross-origin) to wherever it points.
      // A 3xx lands in the !res.ok branch below and is logged as a failure.
      redirect: 'manual',
      // Covers the body download too, not just the headers.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const { bytes } = await readUpTo(res, ERROR_BODY_BYTES);
      // Redact the whole captured body before cutting it, so a token that
      // straddles the cut can never be half-logged.
      const detail = new TextDecoder().decode(bytes).split(cfg.token).join('[redacted]')
        .replace(/\s+/g, ' ').trim().slice(0, LOG_DETAIL_CHARS);
      const redirect = res.status >= 300 && res.status < 400 ? ' redirect not followed (VOICE_URL must be the endpoint itself)' : '';
      return fail(`HTTP ${res.status}${redirect}${detail ? ` ${detail}` : ''}`);
    }
    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_AUDIO_BYTES) {
      await res.body?.cancel().catch(() => {});
      return fail(`audio too large (content-length ${declared} bytes)`);
    }
    const { bytes: audio, overflow } = await readUpTo(res, MAX_AUDIO_BYTES);
    if (overflow) return fail(`audio too large (over ${MAX_AUDIO_BYTES} bytes)`);
    if (audio.length === 0) return fail('empty audio body');
    if (!OGG_MAGIC.every((b, i) => audio[i] === b)) return fail('response is not Ogg audio');
    return audio;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
    return fail(err instanceof Error ? `${err.name}: ${err.message}${cause}` : String(err));
  }
}

/**
 * Read at most `max` bytes of the body. If there is more, stop reading and
 * cancel the stream (which closes the connection) instead of buffering it.
 */
async function readUpTo(res: Response, max: number): Promise<{ bytes: Uint8Array; overflow: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), overflow: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = max - total;
      if (value.byteLength > room) {
        if (room > 0) { chunks.push(value.subarray(0, room)); total = max; }
        overflow = true;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    if (overflow) await reader.cancel().catch(() => {});
    else reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  return { bytes, overflow };
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
  // The LLM debrief can take up to 25 s. Every recap character is billed, so
  // do not ask for audio nobody will hear: the party already restarted (back
  // in the lobby) or every player has left the end screen.
  if (!onEndScreen(w)) return;
  void fetchVoice('recap', text, VOICE_RECAP_TIMEOUT_MS, cfg)
    .then((audio) => {
      // Same check on arrival: a restart during synthesis would talk over the lobby.
      if (audio && onEndScreen(w)) w.broadcast(ServerMessage.DebriefVoice, audio);
    })
    .catch(() => {});
}

function onEndScreen(w: World): boolean {
  if (w.state.phase !== MatchPhase.Ended) return false;
  for (const p of w.state.players.values()) if (p.connected) return true;
  return false;
}

/**
 * Same policy as the director: failures are otherwise invisible (the boss just
 * stays silent), so log the first and then every 10th, with the reason. The
 * token is scrubbed again here as a last line of defence.
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
