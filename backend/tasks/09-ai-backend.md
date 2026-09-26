# 09 — AI in the server: boss director + post-match debrief

**You own:** `backend/src/ai/director.ts`, `backend/src/ai/debrief.ts`,
`backend/test/ai.test.ts`

The HTTP contract with the Modal side (agent 10) is already fixed in
`shared/src/events.ts`: `DirectorSnapshot` → `DirectorDecision`, `DebriefRequest` →
`DebriefPayload`. **Do not wait for Modal** — build against a local fallback and
the URLs plug in later via env `DIRECTOR_URL` / `DEBRIEF_URL`.

## Director (`update`)
- First call at 8s, then every `DIRECTOR.INTERVAL_MS`.
- Build a `DirectorSnapshot` from `state`, `w.threatEntries()`, `w.recentEvents(15)`.
- `DIRECTOR_URL` set → `fetch` POST JSON with `AbortSignal.timeout(DIRECTOR.TIMEOUT_MS)`.
  **Never await in update**: store the settled result in the closure, apply it on a
  later tick. Drop results that arrive after the match ended.
- No URL / error / timeout / invalid JSON → local heuristic decision
  (`source: 'fallback'`): focus carrier if someone carries a box, else support if
  it has high threat share, else tank; a short Russian taunt from a canned list per
  situation; one-line `reasoning`. The game UI is Russian.
- Validate LLM output strictly: `focus` ∈ `CLASS_IDS` or null, finite bias numbers,
  `spawnHint` enum, taunt trimmed to `DIRECTOR.TAUNT_MAX_CHARS`. Invalid → fallback.
- Apply: reset every class bias to 1, then `w.setThreatBias` per entry; focus →
  bias at least 1.6. Write `state.director` (`focusClassIndex`, `taunt`,
  `reasoning`, `spawnHint`, `updatedAtMs`, `source`), then
  `w.broadcast(ServerMessage.Director, { ...decision, source })` and emit
  `director_decision` with `label` = taunt.

## Debrief (`onEnd`)
- Build `DebriefRequest` (outcome, `OUTCOME_LABEL`, duration, players, `w.allEvents()`).
- `DEBRIEF_URL` set → POST with a 15s timeout → `w.broadcast(ServerMessage.Debrief, payload)`.
- Otherwise / on failure → local debrief from the events (boxes, crystals, deaths
  per player; MVP = player with most events) and broadcast that. Something must
  ALWAYS be broadcast.

## Test
No env URLs: after 8s `state.director.taunt` is non-empty and a `director` message
was sent; ending the match broadcasts a `debrief` (flush with
`await new Promise(r => setTimeout(r, 0))`). Bonus: a local `http.createServer`
mock proves the LLM path applies bias.
