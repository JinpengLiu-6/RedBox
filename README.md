# 🎮 RedBox (Crate Heist)

A stylized 5-player cooperative PvE multiplayer action prototype built with vanilla HTML5 Canvas, modern CSS, Web Audio API, and custom stylized 2.5D visual assets.

---

## 🌟 Key Features

### 🦸 10 Playable Heroes
Each operative features a custom top-down stylized 3D/cartoon visual asset, avatar icon, combat role, base attack, and 3 active abilities:
1. **01 — Guardian**: Frontline tank with Shield Bash, Ground Slam, and Last Stand forcefield.
2. **02 — Scout**: Hyper-mobile runner with Quick Dash, Decoy Hologram, and Overdrive sprint.
3. **03 — Striker**: Rapid melee brawler with Blade Flurry, Shadow Step, and Whirlwind.
4. **04 — Engineer**: Battlefield tactician with Deployable Sentry Turret, Barricade Wall, and EMP Blast.
5. **05 — Sniper**: Long-range assassin with Charged Piercing Shot, Bear Trap, and Smoke Cloak.
6. **06 — Medic**: Squad lifeline with Healing Nanite Field, Revive Drone, and Nano-Shield.
7. **07 — Disruptor**: Crowd-control specialist with Gravity Vortex, Stun Grenade, and Repulsor Wave.
8. **08 — Infiltrator**: Stealth specialist with Active Camouflage, False Signal, and Backstab.
9. **09 — Berserker**: High-risk bruiser with Blood Rage, Reckless Leap, and Cleave.
10. **10 — Aegis**: High-tech protector with Hexagonal Force Barrier, Kinetic Absorption, and Fortress Stance.

### 👹 5 Unique AI Bosses
Custom high-resolution boss illustrations with custom attack telegraphs, minion guards, and phases:
- **Gorog (The Brute)**: Heavy shockwaves, ground stomps, and brutal melee swings.
- **Vex (The Synth Emperor)**: Cybernetic energy beams, tracking missiles, and grid traps.
- **Mother (The Swarm Queen)**: Brood summons, poison spit, and corrosive acid pools.
- **Shade (The Phantom Stalker)**: Teleports, shadow strikes, and confusion decoys.
- **Warden (The Automated Bastion)**: Heavy rotating lasers, fortress shields, and artillery mortars.

### 🗺️ 5 Biomes / Maps
Distinct illustrated environments with environmental events and dynamic particle weather:
- **Warehouse**: Heavy industrial cargo facility with Crane Surge events and dust particles.
- **Glacier**: Cryo arctic spires with Blizzard slowdown events and snow particles.
- **Crucible**: Volcanic foundry with Magma Overdrive (+40% DMG) and ember particles.
- **Cyber**: Neon metropolis rooftops with Grid Overload (Haste) and digital glyphs.
- **Jungle**: Ancient overgrown ruins with Spore Bloom regeneration and bio-spores.

### 🛰️ Complete UI System
- **5-Player Hero Draft Screen**: Full-screen draft with live squad roster, 25s countdown timer, interactive hero cards with independent parallax hover, teammate lock-ins, and large character preview.
- **Tactical Biome Scanner**: Military satellite scanning array that decelerates through biomes (Fast $\to$ Medium $\to$ Slow $\to$ Lock) and blooms into the winning map.
- **Dynamic HUD**: Health vitals, active cooldown overlays, carried crate indicators, boss health bars, and match timer.
- **Web Audio API Synth**: Programmatic sound effects for hover, selection, lock-in, scanner ticks, and cinematic reveals.

---

## 🚀 Quick Start

Run a local HTTP server:

```bash
# Python 3
python3 -m http.server 8080

# Or Node.js
npx serve -l 8080
```

Open your browser at:
```
http://localhost:8080/
```

### 🎮 Controls
- **WASD**: Move operative
- **Left-Click / F**: Basic Attack
- **Q / E / Space**: Abilities 1, 2, and 3
- **H**: Toggle Hero Selection Draft
- **Roll Match**: Re-randomize biome and deploy into arena
