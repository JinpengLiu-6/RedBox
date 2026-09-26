# 09 — Optional AI layer in the server: director + debrief

**You own:** `backend/src/ai/director.ts`, `backend/src/ai/debrief.ts`,
`backend/test/ai.test.ts`

**Scope note:** the MVP plan says runtime LLM calls are NOT required and all
gameplay AI is FSM-based (boss.ts, goblins.ts). This layer is an **optional,
additive** showcase: it can only nudge boss targeting within clamped bounds and
show text. With no env URLs it must stay silent or use a tiny local fallback —
the game must play identically without it.

The HTTP contract (with agent 10) is fixed in `shared/src/events.ts`:
`DirectorSnapshot` → `DirectorDecision`, `DebriefRequest` → `DebriefPayload`.

## Director (`update`)
- Only if `process.env.DIRECTOR_URL` is set. First call at 8s, then every
  `DIRECTOR.INTERVAL_MS`. Build the snapshot from state, `w.threatEntries()`,
  `w.recentEvents(15)`.
- `fetch` POST JSON with `AbortSignal.timeout(DIRECTOR.TIMEOUT_MS)`. **Never await
  in update**: store the settled result in the closure, apply on a later tick.
  Drop results that arrive after the wave/match changed.
- Validate strictly: `focus` ∈ `CLASS_IDS` or null, finite bias numbers, taunt
  trimmed to `DIRECTOR.TAUNT_MAX_CHARS`. Invalid → ignore.
- Apply: reset all biases to 1, `w.setThreatBias` per entry (World clamps). Write
  `state.director` (focusClassIndex, taunt, reasoning, updatedAtMs, source `'llm'`),
  `w.broadcast(ServerMessage.Director, { ...decision, source: 'llm' })`, emit
  `director_decision`.

## Debrief (`onEnd`)
- Build `DebriefRequest` (outcome, `OUTCOME_LABEL`, duration, players, `w.allEvents()`).
- `DEBRIEF_URL` set → POST (15s timeout) → `w.broadcast(ServerMessage.Debrief, payload)`.
- Otherwise / on failure → local English recap from events (deliveries, traps
  sprung, towers, deaths per hero; MVP = most deliveries, then most damage events)
  → broadcast. The end screen always gets something.

## Test
No env: no director message is ever sent and the game state is untouched; ending
the match broadcasts a local debrief. With a local `http.createServer` mock as
DIRECTOR_URL: a decision is applied and clamped.
