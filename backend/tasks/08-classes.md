# 08 — Class abilities (all five classes)

**You own:** `backend/src/classes/{tank,ranged,carrier,support,scanner}.ts`,
`backend/test/classes.test.ts`

The dispatcher (`systems/abilities.ts`) already checks alive / unlocked /
cooldown and starts the cooldown **only if your handler returns true**. You only
write effects. `ctx.magnitude` is already rank-resolved from `CLASSES`. Specs and
ranges are in `shared/src/classes.ts`. Every ability fires `w.fx(<ability id>, …)`.

**tank**
- `taunt`: boss within `range` → `w.setThreatTop(caster.id, BOSS.THREAT.TAUNT_OVERSHOOT)`.
- `bulwark`: `w.addModifier(caster.id, 'damageTakenMult', magnitude, 4000)`.
- `shockwave`: creeps within `range` pushed `magnitude` px away and stunned 1500ms
  (`addModifier(creepId, 'stunned', 1, 1500)`); `w.addThreat(caster.id, 150)`.

**ranged**
- `piercing_shot`: `targetId` (or nearest crystal/boss/creep in range):
  `w.damage(t, attackDamage * magnitude, { sourceId, fromRanged: true })`.
- `volley`: `point` in range → everything hostile within 120px of it takes `magnitude`, fromRanged.
- `focus`: `addModifier(caster.id, 'attackCooldownMult', magnitude, 5000)`.

**carrier** (usable while carrying)
- `blink`: toward `point` (or `facing`), distance ≤ `magnitude`, must be `w.walkable` → teleport.
- `phase`: `w.applyDebuff(caster.id, 'phase', magnitude)` — untargetable.
- `sprint`: `addModifier(caster.id, 'speedMult', carrying ? magnitude / BOXES.CARRY_SPEED_MULT : magnitude, 3000)`.

**support**
- `mend`: `targetId` ally in range, else lowest-hp% ally in range, else self →
  `w.heal(target, magnitude, caster.id)` (healing draws boss threat — intended).
- `barrier`: ally shield `+= magnitude`, capped at `maxHp / 2`.
- `cleanse`: `w.clearDebuffs` on every ally within `range`.

**scanner**
- `scan`: `w.scan(caster, magnitude, caster.id)`; return true even if 0 revealed.
- `ping`: `w.fx('ping', point, { sourceId })`.
- `decoy`: creeps within 300px of `point` stunned for `magnitude` ms.

## Test
Taunt makes the tank top threat; blink moves the carrier; scan reveals a box;
mend heals and gives the support threat. Use `Harness([createAbilitySystem()])`.
