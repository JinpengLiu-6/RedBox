# Deploying Goblin King Heist

```
itch.io page ─┐                      ┌─ Modal (optional AI: director + debrief)
              ├─ static client ──wss──► Railway: Colyseus game server
Vercel link ──┘   (same build)       └─ env DIRECTOR_URL / DEBRIEF_URL
```

Order matters: **Railway → Modal (optional) → build client with the Railway URL → Vercel + itch.io.**

## 1. Railway — game server

The server holds live matches in memory: run **exactly 1 replica**, no autoscaling,
and keep "app sleeping" off.

Dashboard: New Project → Deploy from GitHub → `JinpengLiu-6/RedBox`, root directory
= repo root. `railway.json` supplies the rest (`npm run check` at build, `npm start`,
healthcheck `/health`). Then Settings → Networking → **Generate Domain**.

No GitHub access to the repo (it belongs to JinpengLiu-6)? Deploy from a local checkout:
```bash
npm i -g @railway/cli && railway login
railway init            # new project
railway up              # uploads this checkout, builds, starts
railway domain          # -> https://<app>.up.railway.app
```

Variables (optional AI layer; the game runs identically without them):
`DIRECTOR_URL`, `DEBRIEF_URL` — the two Modal endpoint URLs.

Verify from your machine:
```bash
SERVER=https://<app>.up.railway.app npm run check:deploy
```
Expect `DEPLOY OK`: health, protocol match, CORS for the itch.io origin, private room
by code, quick-match isolation.

## 2. Modal — optional AI layer

```bash
modal token new --activate            # log in, pick YOUR workspace
modal profile current                 # confirm
read -s OPENAI_API_KEY && modal secret create openai OPENAI_API_KEY="$OPENAI_API_KEY"; unset OPENAI_API_KEY
modal deploy ai/modal/app.py          # prints the two endpoint URLs
```
Put the URLs into Railway variables and redeploy the server.

## 3. Build the client (once, used by both Vercel and itch.io)

```bash
VITE_GAME_SERVER=wss://<app>.up.railway.app npm run package:itch
```
Produces `frontend/dist/` and `redbox-itch.zip` (index.html at the zip root, all
asset paths relative). The build **refuses to run** without a `wss://` server URL —
a client without it would try to connect to itch.io's own CDN.

## 4. Vercel — direct link

Project root directory `frontend` (`frontend/vercel.json` installs from the monorepo
root). Environment variable `VITE_GAME_SERVER=wss://<app>.up.railway.app`.
Without GitHub access: `cd frontend && npx vercel --prod` after `npx vercel env add VITE_GAME_SERVER`.

## 5. itch.io — the game page

Create new project → Kind of project: **HTML** → upload `redbox-itch.zip` → tick
**"This file will be played in the browser"**. Embed options: viewport **1280 × 720**,
**Fullscreen button** on, mobile off, "click to launch" on (gives the audio context a
user gesture). Save as draft, play it, then set visibility to public.

Repeat uploads from the CLI: `butler push redbox-itch.zip <user>/<game>:html5`.

## Players

- **Quick play**: joins any open lobby (up to 5), empty seats become labelled bots.
- **Create room**: private; share the 4-character code shown in the lobby.
- **Join room**: type the code (case and spaces don't matter).

## When something breaks

| Symptom | Cause |
|---|---|
| Black screen on itch.io, 404s for `/assets/...` | built without `base: './'` — use `npm run package:itch` |
| "protocol_mismatch" on join | client and server built from different commits — rebuild the client |
| Join hangs from itch.io | `VITE_GAME_SERVER` is `ws://` or points at the wrong host; must be `wss://<railway domain>` |
| Players in different matches after a redeploy | expected: redeploy wipes in-memory rooms |
| Two Railway replicas | rooms split across processes; set replicas to 1 |
