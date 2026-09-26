# Backend / Frontend contract

Two developers, one seam. **Backend + AI** and **Frontend** never edit the same
file. Everything they must agree on lives in `shared/`.

## Run it

```bash
npm install
npm run check        # typecheck + contract validation
npm run stub         # terminal 1 - fake server, real protocol   :2567
npm run client       # terminal 2 - debug view                   :5173
npm run seam         # terminal 3 - asserts the seam end to end
```

`npm run stub` is the point of this whole setup: it is the **real room, real
schema, real message routing** with a fake simulation. The frontend can be built
completely against it before a single gameplay system exists. When the real
systems land, the client does not change.

## Ownership

| Area | Owner | Files |
|---|---|---|
| Contract | **both** | `shared/src/**` |
| Server, systems, AI | Backend | `backend/src/**` |
| Rendering, UI, input, audio | Frontend | `frontend/src/**` except `net.ts` |
| Connection layer | **both** | `frontend/src/net.ts` |
| Seam test | **both** | `e2e/seam-check.ts` |

Rule: **if a change touches `shared/` or `net.ts`, tell the other person before
you commit it.** Everything else you may change freely without asking.

## What the frontend may assume

1. `net.state` is the whole truth. Render from it; never keep a parallel copy.
2. The client has **no authority**. It sends intent (`net.move`, `net.useAbility`)
   and waits for the server to reflect the result. There is no prediction, and
   adding some is a contract change.
3. Positions come from `net.positionOf(id, fallback)`, which renders
   `INTERP_DELAY_MS` in the past. Reading `player.x` directly will stutter at the
   patch rate.
4. Anything derived - cooldown readiness, whether a player can attack, effective
   speed, box marks - has a helper in `shared/src/selectors.ts`. Use it rather
   than re-deriving, otherwise the HUD and the server will disagree.
5. The first frames run **before** the first patch decodes. Guard on
   `state.crystals` being present; do not assume state is ready on frame 1.

## What is deliberately NOT in synced state

These arrive as messages, because they are events rather than facts:

| Message | Payload | Use |
|---|---|---|
| `fx` | `FxPayload` | transient VFX: hits, heals, scan pulse, crystal break |
| `event` | `MatchEvent` | the match log; feeds the kill feed and the AI |
| `director` | `DirectorPayload` | boss decision when Modal answers |
| `debrief` | `DebriefPayload` | post-match AI recap; **arrives after** phase Ended |

The boss voice line is also mirrored into `state.director` so a client that
joined late still sees the current taunt.

## The one integrity rule

**A box's real identity is never sent to the client.** `Box.mark` is `Unknown`
until a Scanner reveals it, and camouflaged boxes are not in `state.boxes` at
all until found. Do not add an `isReal` field "just for the UI" - it would let
anyone defeat the Scanner role with devtools, and the Scanner is the core of the
game.

## Version pins - do not casually upgrade

These are pinned because the obvious `npm install latest` combination is broken:

| Package | Pin | Why |
|---|---|---|
| `colyseus` | `0.16.5` | server 0.18 returns a flat seat reservation that `colyseus.js` cannot parse |
| `colyseus.js` | `0.16.22` | newest released browser client; there is no 0.18 client |
| `@colyseus/schema` | `^3.0.0` | required peer of colyseus 0.16 |

Server 0.18.8 shipped 2026-09-23; the browser client has not followed. If you
upgrade the server, the client silently fails to join with
`Cannot read properties of undefined (reading 'name')`.

## Two traps already paid for

- **Schema fields have no implicit default.** An undeclared numeric field is
  `undefined`, so `hp -= damage` yields `NaN` and poisons the encoder for the
  rest of the match. Every field in `schema.ts` declares a default; keep it that
  way when adding fields.
- **`shared/src/schema.ts` is server-only at runtime.** The barrel re-exports it
  as `export type *`. The client imports types, never the classes. Runtime enums
  live in `enums.ts` precisely so the client can import them safely.

## Changing the contract

1. Say what you are changing and why.
2. Edit `shared/src/**`.
3. Bump `PROTOCOL_VERSION` in `protocol.ts` if the wire shape changed - the
   server then rejects stale clients instead of behaving strangely.
4. `npm run check` must pass.
5. `npm run seam` must pass against the stub.
