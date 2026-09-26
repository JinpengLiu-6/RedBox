# 02 — Combat: basic attacks (left click)

**You own:** `backend/src/systems/combat.ts`, `backend/test/combat.test.ts`

## attack (`w.commands('attack')`)
- `canAttack(p, w.now)` (selector: alive, not carrying, off cooldown), not stunned.
- Aim = `payload.x/y` (mouse, world px); missing → along `p.facing`. Set `p.facing`.
- Cooldown: `p.attackReadyAtMs = now + spec.attackCooldownMs * w.modifier(id, 'attackCooldownMult')`.
- Hostiles = goblins, standing towers, `'boss'` (if alive). Never players.
- By `spec.attackKind` (`shared/src/classes.ts`):
  - `bolt` (mage, dwarf): first hostile along the aim ray within `attackRange`,
    only if `w.lineOfSight`. `w.fx('attack', p, { angle })` for the projectile.
  - `swing` (troll): EVERY hostile within `attackRange` inside `attackArcDeg`.
  - `strike` (brawler, warrior): the single nearest hostile within range and arc.
- `w.damage(id, spec.attackDamage, { sourceId: p.id })` — DamageDealtMult and the
  tower bonus on the boss are applied inside `damage()`; don't re-apply.
- `w.fx('attack', p, { sourceId: p.id, angle })` on every swing, hit or miss.

## Test
Mage bolt hits a goblin in range; blocked by a wall → no hit. Troll swing hits
two goblins in the arc. Carrying player cannot attack. Players never damaged.
