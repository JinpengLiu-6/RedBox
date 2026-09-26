# 07 — Bots (DEV / SOLO mode)

**You own:** `backend/src/ai/bots.ts`, `backend/test/bots.test.ts`

The real mode is five humans. Bots fill empty seats so a solo judge or a
developer can run a full match; they are labelled "(bot)". Your system runs FIRST.

## Mechanics
- Act only via `w.setIntent(id, dx, dy)` and `w.command(id, kind, payload)`.
  Steer with `w.nextStep`. Re-issue the intent EVERY tick (intents expire);
  re-decide goals every `BOTS.REACTION_MS` (closure timers).
- Attack/skill payloads carry an aim point `{ x, y }` (the target's position).

## One generic brain, hero-flavoured
1. Carrying → go to `MAP.BASE`. Don't fight.
2. A crate with state `Dropped` (known real) nearby → go pick it up (`interact`).
3. Hostile within ~250px (goblin, boss) → fight it: `attack` with aim; use Q (and
   E/R when unlocked, `isAbilityReady`) aimed at it.
4. Else nearest closed crate not already claimed by another bot this tick →
   walk to it → `interact`. (Traps happen — that is the game; bots don't cheat.)
5. Else attack the nearest standing tower.
- Below 25% hp → retreat to base.
- Melee heroes (troll, brawler, warrior) close to ~40px; ranged (mage, dwarf) hold
  at ~0.8 × attackRange with line of sight.

## Test
`[createBotsSystem(), createMovementSystem()]`: a bot next to a closed crate
issues `interact`; a carrying bot moves toward base; a bot next to a goblin
issues `attack` with an aim point.
