# Rules for every backend agent — read before your brief

You are one of ~10 agents working IN PARALLEL on the RedBox backend. The only
reason this works is that nobody touches anybody else's files.

## Hard rules
1. **Edit only the files listed under "You own" in your brief.** Nothing else:
   not `shared/`, not `backend/src/world.ts`, `room.ts`, `systems/index.ts`,
   `classes/index.ts`, `package.json`, lockfile. **No new npm dependencies.**
2. Talk to the match **only through `World`** (`shared/src/world.ts`). Never import
   another agent's system. Coupling happens through `state` and events only.
3. Every number comes from `shared/src/constants.ts` / `classes.ts`. If you need a
   new tuning number, put a named `const` at the top of YOUR file.
4. Per-match state lives **inside your factory closure**, never at module level
   (several rooms can run in one process).
5. **Death ownership:** `w.damage()` only subtracts HP. The owner detects `hp === 0`:
   players → lives.ts · creeps → waves.ts · crystals → crystals.ts · boss → boss.ts.
6. **Anything that chases steers with `w.nextStep(from, to)`**, never raw vectors.
   It is a straight line today and becomes wall pathfinding later for everyone.
7. Emit the matching `MatchEvent` (see `shared/src/events.ts`) for everything your
   system does. The AI director and debrief read ONLY the event log.
8. Use selectors from `shared/src/selectors.ts` (`canAttack`, `classIdOf`,
   `isKnownReal`, `hpPct`, …) instead of re-deriving rules.
9. `update()` must never `await` or block. Fire promises, apply results on a later tick.
10. Missing capability on `World`? Implement it privately inside your file. If that
    is truly impossible, say so in your final message — do not edit shared files.

## Verify (mandatory, ~5 min of your budget)
- ONE test file `backend/test/<your-area>.test.ts` using the headless `Harness`
  (`backend/src/sim/harness.ts`, example: `backend/test/core.test.ts`).
  Golden path only — prove your system does its job. No exhaustive suites.
- `npx tsx --test backend/test/<your-area>.test.ts` passes.
- `npm run typecheck` passes.

Harness cheatsheet:
```ts
const h = new Harness([createYourSystem()]);      // or Harness.full() for all systems
const p = h.addPlayer('carrier', { x: 500, y: 500 });
h.start();                                        // runs init()
h.command(p.id, 'interact', {}).tick();           // command lands next tick
h.walk(p.id, 1, 0, 2);                            // hold a direction for 2s
h.seconds(10);                                    // advance time
h.events('box_delivered'); h.messages('director');
```

## Git
Own branch → commit ONLY your files → `git pull --rebase origin main` → push to
main. If you stayed inside your files, the rebase cannot conflict.

## Timebox: 20 minutes
Golden path first, commit, then polish. A working simple version beats a
half-finished clever one — the demo is in 50 minutes.
