# 07 — Bots: a solo judge must be able to win

**You own:** `backend/src/ai/bots.ts`, `backend/test/bots.test.ts`

Judges play alone. Every class a human did not pick is a bot (`player.isBot`).
If the bots are dumb, the demo is dumb. Your system runs FIRST each tick.

## Mechanics
- Bots act only through `w.setIntent(id, dx, dy)` and `w.command(id, kind, payload)` —
  the same path humans use. Movement is `w.nextStep(p, goal)`.
- Intents expire after `PLAYER.INPUT_MAX_AGE_MS`: re-issue the cached direction
  EVERY tick; re-decide goals every `BOTS.REACTION_MS` (closure timers).
- Skill points: bots don't send messages — if `skillPoints > 0`, raise the lowest
  unlocked slot below `PROGRESSION.MAX_RANK` directly (`ranks[slot]++`, `skillPoints--`).
- Abilities: `w.command(id, 'ability', { slot, targetId?, x?, y? })` when
  `isAbilityReady(p, slot, w.now)`.
- Any non-tank under 25% hp retreats to base.

## Roles
- **tank**: walk to the boss; within 150px `attack` `'boss'` (hitting a shielded boss
  still builds threat); `taunt` (slot 0) whenever the boss targets someone else;
  `bulwark` (slot 1) under 50% hp.
- **ranged**: nearest undestroyed crystal, hold at ~0.8 × attackRange, `attack` it,
  `piercing_shot` on it. Boss vulnerable → shoot the boss instead.
- **scanner**: go to the nearest box with mark Unknown and `scan` (slot 0) within
  ~0.8 × scan radius. No Unknown boxes visible → patrol a fixed waypoint list across
  the map and scan (reveals camouflaged boxes). Attack creeps in range.
- **carrier**: carrying → go to base; `blink` (slot 0) toward base when ready
  (point = 300px along the path); `sprint` when unlocked. Not carrying → nearest
  box with mark **Real** and state Idle → walk there → `interact`. NEVER pick up
  Unknown boxes — that is the Scanner's whole point. Nothing known → follow the scanner.
- **support**: follow the lowest-hp% ally (prefer tank); `mend` (slot 0) any ally
  under 70% in range; attack creeps in range.

## Test
`[createBotsSystem(), createMovementSystem()]`: carrier bot beside a Real-marked
box issues `interact`; carrier bot with `carryingBoxId` set moves toward base;
scanner bot near an Unknown box issues ability slot 0.
