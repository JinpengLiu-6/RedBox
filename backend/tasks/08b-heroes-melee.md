# 08b — Hero skills: Axe Troll + Human Brawler + Dual-Blade Warrior

**You own:** `backend/src/classes/troll.ts`, `backend/src/classes/brawler.ts`,
`backend/src/classes/warrior.ts`, `backend/test/heroes-melee.test.ts`

The dispatcher already validated alive / not carrying / unlocked for this wave /
off cooldown, and starts the cooldown only if your handler returns `true`.
`ctx.params` = `CLASSES.<hero>.abilities[slot].params`, `ctx.aim` = mouse point.
Hostiles = goblins, towers, `'boss'` — never players. Knockback: `w.push` (walls and
the boss are handled for you). Stuns: `addModifier(id, 'stunned', 1, ms)` — the
World turns a stun on the boss into a slow. Channelled skills tick in `tick(w, p)`.

**Axe Troll** — slow, sweeping
- `whirlwind` (Q): `damage` to hostiles within `radius`.
- `earth_splitter` (E): line toward aim, length `range`, `width`: `damage` + slow.
  Stops at the first wall along the line (`w.lineOfSight`).
- `rage` (R): self `attackCooldownMult` and `damageTakenMult` for `durationMs`.

**Human Brawler** — clears routes by displacement
- `shoulder_charge` (Q): dash toward aim up to `range` (use `w.push` on yourself —
  it stops at walls); goblins along the path take `damage` and get pushed
  `knockbackPx` sideways/forward.
- `ground_slam` (E): goblins within `radius` stunned `stunMs`, hostiles take `damage`.
- `unstoppable` (R): `knockbackImmune` + `damageDealtMult` for `durationMs`.

**Dual-Blade Warrior** — rewards timing
- `slashing_dash` (Q): dash toward aim up to `range`; every hostile within `width/2`
  of the path takes `damage` once.
- `parry` (E): `addModifier(caster.id, 'parry', counterDamage, windowMs)` — the World
  blocks all damage and counters each attacker for you. Just fire `w.fx('parry')`.
- `blade_dance` (R): for `durationMs`, every `tickMs` hostiles within `radius` take
  `damagePerTick` (the warrior keeps moving). Track the channel in the closure.

## Test
Whirlwind hits all goblins around. Charge stops at a wall. Ground slam stuns
goblins but the boss only slows. Parry blocks a goblin hit and damages it.
Blade dance ticks multiple times over its duration.
