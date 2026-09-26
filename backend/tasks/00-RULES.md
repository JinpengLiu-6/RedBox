# Rules for every backend agent — read before your brief

Game: **Goblin King Heist**. The rules live in these briefs and in `shared/`.
Five heroes recover real crates (identical to trap crates) while
fighting red goblins and the Goblin King. Deliveries 3 / 2 / 3 clear waves 1–3.

You are one of ~11 agents working IN PARALLEL. It only works because nobody
touches anybody else's files.

## Hard rules
1. **Edit only the files under "You own" in your brief.** Never `shared/`,
   `backend/src/world.ts`, `room.ts`, `index.ts`, `stub.ts`, `systems/index.ts`,
   `systems/movement.ts`, `systems/abilities.ts`, `classes/index.ts`, `sim/`,
   `package.json`. **No new npm dependencies.**
2. Talk to the match **only through `World`** (`shared/src/world.ts` — read it
   fully). Never import another agent's file. Coupling is via `state` and events.
3. Numbers come from `shared/src/constants.ts` / `classes.ts` (`ability.params`).
   A new tuning number = a named `const` at the top of YOUR file.
4. Per-match state lives **inside your factory closure**, never at module level.
5. **Wave lifecycle:** the integrator clears the whole board between waves.
   Spawn your entities for the new wave in `onWaveStart(w)` (runs for wave 1 too).
6. **Death ownership:** `w.damage()` only subtracts HP. The owner detects hp 0:
   players → lives · goblins → goblins · towers → towers · boss → boss.
7. **Walls are real.** Anything that moves toward something steers with
   `w.nextStep(from, to)`; never chase what `w.reachable()` says you can't reach.
   Ranged hits and skill aims check `w.lineOfSight()`. Teleports/drops use
   `w.nearestWalkable()`. Knockback uses `w.push()`.
8. **No friendly fire.** Only ever damage hostiles (goblins, towers, `'boss'`).
9. **Closed crates are identical.** Never put or read crate truth outside
   `w.isBoxReal()` in crates.ts. No scanning, no hints, no minimap tells.
10. Emit the matching `MatchEvent` (`shared/src/events.ts`) for what you do, and
    `w.fx(...)` for anything the player should see.
11. `update()` never awaits or blocks.
12. Missing a `World` capability? Implement it privately in your file. If truly
    impossible, say so in your final message — do not edit shared files.
13. UI-facing text (taunts, labels, debrief) is **English**.

## Verify (mandatory)
- ONE test file `backend/test/<your-area>.test.ts` with the headless `Harness`
  (`backend/src/sim/harness.ts`; examples in `backend/test/core.test.ts`).
  Golden path + the one rule your system must never break. No exhaustive suites.
- `npx tsx --test backend/test/<your-area>.test.ts` and `npm run typecheck` pass.

```ts
const h = new Harness([createYourSystem()]);   // or Harness.full()
const p = h.addPlayer('dwarf', { x: 500, y: 400 });
h.start();                                     // init + onWaveStart(wave 1)
h.command(p.id, 'interact', {}).tick();        // commands land next tick
h.walk(p.id, 1, 0, 2); h.seconds(10);
h.events('box_delivered'); h.messages('fx');
```

## Git
Own branch → commit ONLY your files → `git pull --rebase origin main` → push to
main. If you stayed inside your files the rebase cannot conflict.

## Timebox: 20 minutes. Golden path first, commit, then polish.
