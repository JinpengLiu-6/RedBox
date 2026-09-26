# 01 — Boxes: spawn, pickup, fake traps, carry, deliver

**You own:** `backend/src/systems/boxes.ts`, `backend/test/boxes.test.ts`

This is the heist. It is the most important system in the game.

## init
- Spawn `BOXES.TOTAL` boxes spread across the WHOLE map (see target art: boxes
  everywhere, a few near the boss for risk). Min 140px apart, none within
  `MAP.BASE.radius + 200` of base. Use `new Box()` from `@redbox/shared/schema`.
- `BOXES.REAL` are real, of which `BOXES.CAMOUFLAGED` are camouflaged.
  Register every box with `w.addBox(box, { isReal, camouflaged })` — this is the
  ONLY place truth is stored. Never put truth in state.

## interact command (`w.commands('interact')`)
- Player alive and carrying → drop box at feet (state Idle, clear both sides),
  emit `box_dropped`.
- Player alive, not carrying, idle box within `BOXES.PICKUP_RADIUS` (or
  `payload.targetId` if it is a box in range):
  - **Fake** (`!w.isBoxReal(id)`): mark Fake, state Consumed, remove it, trigger ONE
    random effect, emit `fake_triggered` with `label` = effect, `w.fx('fake_trigger', box)`:
    - `ambush`: `FAKE_BOX.AMBUSH_COUNT` creeps around the box via `w.spawnCreep(pos, state.stage)`
    - `damage_amp`: `w.applyDebuff(id, 'damageAmp', FAKE_BOX.DAMAGE_AMP_MS)` on every live player
    - `slow`: `w.applyDebuff(id, 'slow', FAKE_BOX.SLOW_MS)` on every live player
  - **Real**: mark Real, state Carried, `carriedBy` = player, `player.carryingBoxId` = box,
    emit `box_picked`, `w.fx('pickup', box)`.
- Any class may carry (keeps a solo judge able to win). The Carrier is just faster.
- Ignore interact targets starting with `rv` — revives belong to lives.ts.

## every tick
- Carried box follows its carrier's x/y.
- Carrier no longer alive → drop the box where they fell (state Idle, clear
  `carryingBoxId`, `carriedBy`), emit `box_dropped`.
- Carrier within `MAP.BASE.radius` of `MAP.BASE` → state Delivered, clear carry,
  `state.boxesDelivered++`, emit `box_delivered`,
  `w.awardTeamSkillPoint(PROGRESSION.POINTS.BOX_DELIVERED)`.
  If `boxesDelivered >= MATCH.BOXES_TO_WIN` → `w.endMatch(Outcome.BoxVictory)`.

## Test
Carrier next to a real box → interact → carrying; walk to base → delivered = 1.
Three deliveries → phase Ended, outcome BoxVictory. Fake pickup → effect fired.
