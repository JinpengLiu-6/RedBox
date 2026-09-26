# 03 — Crystals, boss vulnerability windows, stages

**You own:** `backend/src/systems/crystals.ts`, `backend/test/crystals.test.ts`

You own `state.stage`, `crystalsRequired`, `crystalsDestroyed`, `boss.vulnerable`,
`boss.vulnerableUntilMs`. The HUD shows "ВОЛНА 1/3" = `state.stage`.

## init
- Define ~9 fixed crystal positions spread across the map (target art: towers in
  corners/edges and mid-map, NOT a ring around the boss). Stage N uses the next
  `CRYSTALS.PER_STAGE[N-1]` positions.
- Spawn stage 1 crystals (`new Crystal()`, hp = maxHp = `CRYSTALS.HP`).
  `crystalsRequired = PER_STAGE[0]`, `crystalsDestroyed = 0`.

## every tick
- Crystal `hp === 0 && !destroyed` → `destroyed = true`, `crystalsDestroyed++`,
  emit `crystal_destroyed`, `w.fx('crystal_break', c)`.
- All required destroyed and boss not vulnerable → `boss.vulnerable = true`,
  `vulnerableUntilMs = now + BOSS.VULNERABLE_MS`, emit `stage_cleared` and
  `boss_vulnerable`, `w.awardTeamSkillPoint(PROGRESSION.POINTS.CRYSTAL_SET_CLEARED)`.
- Window expired and boss did not lose a life → `vulnerable = false`, restore this
  stage's crystals (hp full, destroyed false), `crystalsDestroyed = 0`.
- Boss lost a life (remember `lastLives` in the closure; boss.ts decrements it):
  `stage = min(3, stage + 1)`, `vulnerable = false`, remove old crystals, spawn the
  next stage's crystals, reset counters, and **unlock ability slot `stage - 1`
  at rank 1 for every player whose rank there is 0** — the art shows E/R locked
  behind "Волна 2" / "Волна 3".

## Test
Destroy 2 crystals with `w.damage(id, 999, { fromRanged: true })` → boss vulnerable.
Decrement `state.boss.lives` → stage 2, 3 new crystals, every player `ranks[1] === 1`.
