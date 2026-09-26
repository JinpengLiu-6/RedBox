/**
 * Plain enums, deliberately free of any @colyseus/schema import.
 *
 * The client imports these at runtime; it must never pull in schema.ts, whose
 * class definitions are server-side machinery. Keeping them split is what lets
 * the frontend treat state as read-only data.
 */

export const MatchPhase = { Lobby: 0, Countdown: 1, Playing: 2, Ended: 3 } as const;
export const Outcome = { None: 0, BoxVictory: 1, BossVictory: 2, Timeout: 3, Wipe: 4 } as const;
export const BoxMark = { Unknown: 0, Real: 1, Fake: 2 } as const;
export const BoxState = { Idle: 0, Carried: 1, Delivered: 2, Consumed: 3 } as const;

export const PHASE_LABEL = ['Lobby', 'Countdown', 'Playing', 'Ended'] as const;
export const OUTCOME_LABEL = [
  'None', 'Boxes delivered', 'Boss defeated', 'Out of time', 'Team wiped',
] as const;
