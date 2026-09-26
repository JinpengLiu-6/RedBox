/**
 * Plain enums, deliberately free of any @colyseus/schema import, so the client
 * can import them at runtime without pulling in server machinery.
 */

/** Numbers are stable on the wire; WaveTransition was appended. */
export const MatchPhase = { Lobby: 0, Countdown: 1, Playing: 2, Ended: 3, WaveTransition: 4 } as const;
export const Outcome = { None: 0, Victory: 1, Defeat: 2, Timeout: 3 } as const;
/** Unknown until the authoritative interaction. Real is set on pickup. */
export const BoxMark = { Unknown: 0, Real: 1, Fake: 2 } as const;
/** Crate lifecycle. Dropped crates are known-real (someone carried them). */
export const BoxState = { Idle: 0, Carried: 1, Delivered: 2, Triggered: 3, Dropped: 4 } as const;

export const PHASE_LABEL = ['Lobby', 'Countdown', 'Playing', 'Ended', 'Wave cleared'] as const;
export const OUTCOME_LABEL = ['None', 'Victory', 'Defeat', 'Out of time'] as const;
/** HUD labels for locked skill slots. */
export const SLOT_UNLOCK_LABEL = ['', 'Wave 2', 'Wave 3'] as const;
