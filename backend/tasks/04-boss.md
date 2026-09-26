# 04 — Boss AI: threat table, chase, slam, lives

**You own:** `backend/src/ai/boss.ts`, `backend/test/boss.test.ts`

The Goblin King. Readable, fair, and it must make the Tank matter.

## Targeting (every tick)
- Decay: `w.scaleAllThreat(1 - BOSS.THREAT.DECAY_PER_SEC * w.dt)`.
- Candidates: alive players not phased (`isPhased` selector).
- Score = `w.threatOf(id) * w.threatBias(classIdOf(p))` (the director writes bias).
- Switch only if the challenger beats the current target by `BOSS.THREAT.SWITCH_MARGIN`.
  All scores 0 → nearest candidate within `BOSS_ZONE.radius`.
- Target changed → `state.boss.targetId`, emit `boss_target_changed` (playerId, classId).

## Movement
- Chase target with `w.nextStep(boss, target)` at `BOSS.SPEED`. Update `boss.facing`.
- Leash: farther than `BOSS_ZONE.radius * 1.8` from `MAP.BOSS_ZONE` → walk home and
  drop target. This is what makes kiting a skill.

## Attack
- Within `BOSS.ATTACK_RANGE`, every `BOSS.ATTACK_COOLDOWN_MS`:
  `w.damage(target, BOSS.DAMAGE * (1 + 0.25 * (stage - 1)))`, `w.fx('boss_slam', boss)`.
- `boss.behaviour`: vulnerable → `'enraged'`, attacking → `'attack'`, chasing →
  `'chase'`, else `'shielded'`.

## Lives (you own boss death)
- Vulnerable and `boss.hp <= 0` → `lives--`, emit `boss_life_removed`,
  `w.awardTeamSkillPoint(PROGRESSION.POINTS.BOSS_LIFE_REMOVED)`, `hp = maxHp`,
  `vulnerable = false`. `lives === 0` → `w.endMatch(Outcome.BossVictory)`.
  (crystals.ts sees the life drop and advances the stage.)

## Test
Ranged with more raw threat vs tank who `setThreatTop` → boss targets tank.
Boss moves toward target. Vulnerable boss damaged to 0 → lives 2. Three times → BossVictory.
