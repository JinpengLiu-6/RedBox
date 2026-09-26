# 02 — Combat: basic attacks

**You own:** `backend/src/systems/combat.ts`, `backend/test/combat.test.ts`

## attack command (`w.commands('attack')`)
- Attacker must be alive, `canAttack(p)` (selector: no weapon / carrying = no),
  not stunned (`w.modifier(id, 'stunned', 0) > 0`).
- Per-player cooldown (closure map): `spec.attackCooldownMs * w.modifier(id, 'attackCooldownMult')`.
- Target:
  1. `payload.targetId` if it is a hostile (creep id, crystal id, `'boss'`) within
     `spec.attackRange + 24`;
  2. else `payload.x/y` → nearest hostile to that point that is within range of the attacker;
  3. else nearest hostile within range.
  Crystals only count as a valid target for the `ranged` class.
- `w.damage(targetId, spec.attackDamage, { sourceId: p.id, fromRanged: classId === 'ranged' })`.
- `w.fx('attack', p, { sourceId: p.id, value: <angle to target> })` so the client can
  draw the swing / projectile toward the target.

Bots send the same `attack` commands every tick — the cooldown is what limits them.

## Test
Ranged damages a crystal in range; tank cannot; carrier cannot; a carrying
player cannot; second attack inside cooldown does nothing.
