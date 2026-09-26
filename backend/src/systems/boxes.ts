/**
 * OWNER: see brief backend/tasks/01-crates.md
 *
 * Crates: the wave objective. Real and trap crates are identical on the wire;
 * the ONLY place their truth lives is `w.addBox` / `w.isBoxReal`.
 *
 * Invariants this system guarantees:
 *  - exactly realCrates + trapCrates crates per wave, seeded placement, random truth;
 *  - one interact per player per tick, one resolution per crate per tick, first
 *    command in arrival order wins; every press aims at the crates as they stood
 *    when the tick began, so a press that loses a race does nothing (it never
 *    falls through to the next crate in range);
 *  - a trap triggers exactly once and never becomes inventory;
 *  - a real crate is never destroyed: a downed or disconnected carrier drops it on
 *    walkable ground that is reachable from the base;
 *  - a carrier inside the base always delivers (pressing F there never drops);
 *  - each delivered crate is counted exactly once.
 */

import {
  CRATES, MAP, TILE, BoxMark, BoxState, classIdOf, spotsOf, toTile, tileCentre, wavePlan,
  type Command, type Player, type System, type Vec2, type World,
} from '@redbox/shared';
import { Box } from '@redbox/shared/schema';

/** Distance from the broken crate at which its trap goblins appear. */
const TRAP_SPAWN_SPREAD_PX = 20;
/** How far (in tiles) to search for a reachable drop spot before falling back to the base. */
const DROP_SEARCH_MAX_TILES = 12;

type DropReason = 'interact' | 'downed' | 'disconnected' | 'lost';

/** A pickable crate and where it stood when this tick's interacts began. */
type Candidate = { box: Box; x: number; y: number };

function inBase(w: World, p: Vec2) {
  return w.distance(p, MAP.BASE) <= MAP.BASE.radius;
}

/** Small deterministic PRNG (mulberry32). Placement only, never identities. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Walkable AND reachable from the base, so a dropped crate can always be recovered. */
function safeDropSpot(w: World, p: Vec2): Vec2 {
  const spot = w.nearestWalkable(p);
  if (w.reachable(spot, MAP.BASE)) return spot;
  const { tx, ty } = toTile(spot.x, spot.y);
  for (let r = 1; r <= DROP_SEARCH_MAX_TILES; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const c = tileCentre(tx + dx, ty + dy);
        if (w.walkable(c.x, c.y) && w.reachable(c, MAP.BASE)) return c;
      }
  return { x: MAP.BASE.x, y: MAP.BASE.y };
}

function isCarrierGone(p: Player | undefined): DropReason | undefined {
  if (!p) return 'lost';
  if (!p.alive) return 'downed';
  if (!p.connected && !p.isBot) return 'disconnected';
  return undefined;
}

export function createBoxesSystem(): System {
  /** Crates that were delivered or triggered. They can never be resolved again. */
  const spent = new Set<string>();

  function placeWave(w: World) {
    const plan = wavePlan(w.wave);
    const total = plan.realCrates + plan.trapCrates;

    // Reproducible layout: the same spots every time for a given wave.
    const spots = shuffle(spotsOf('c'), seededRandom(CRATES.PLACEMENT_SEED + w.wave));
    if (spots.length === 0) return;

    // Random truth: which of those spots hold the real crates.
    const order = shuffle([...Array(total).keys()], Math.random);
    const real = new Set(order.slice(0, plan.realCrates));

    for (let i = 0; i < total; i++) {
      let pos: Vec2 = spots[i % spots.length]!;
      if (i >= spots.length) {
        // More crates than spots (map edited): nudge the extra one off its spot.
        const lap = Math.floor(i / spots.length);
        pos = w.nearestWalkable({ x: pos.x + lap * TILE, y: pos.y });
      }
      const box = new Box();
      box.id = `w${w.wave}c${i}`;
      box.x = pos.x;
      box.y = pos.y;
      box.state = BoxState.Idle;
      box.carriedBy = '';
      w.addBox(box, { isReal: real.has(i) });
    }
  }

  function drop(w: World, box: Box, carrier: Player | undefined, at: Vec2, reason: DropReason) {
    const spot = safeDropSpot(w, at);
    box.x = spot.x;
    box.y = spot.y;
    box.state = BoxState.Dropped;
    box.carriedBy = '';
    if (carrier && carrier.carryingBoxId === box.id) carrier.carryingBoxId = '';
    w.fx('drop', spot, { sourceId: carrier?.id });
    w.emit({
      type: 'box_dropped', atMs: w.now, boxId: box.id, label: reason,
      playerId: carrier?.id, classId: carrier ? classIdOf(carrier) : undefined,
    });
  }

  function triggerTrap(w: World, box: Box, p: Player) {
    spent.add(box.id);
    box.state = BoxState.Triggered;
    box.mark = BoxMark.Fake;
    const at = { x: box.x, y: box.y };
    for (let i = 0; i < CRATES.TRAP_GOBLINS; i++) {
      const a = (2 * Math.PI * i) / CRATES.TRAP_GOBLINS;
      w.spawnCreep({ x: at.x + Math.cos(a) * TRAP_SPAWN_SPREAD_PX, y: at.y + Math.sin(a) * TRAP_SPAWN_SPREAD_PX });
    }
    w.removeEntity('box', box.id);
    w.fx('trap', at, { sourceId: p.id, value: CRATES.TRAP_GOBLINS });
    w.emit({
      type: 'trap_triggered', atMs: w.now, playerId: p.id, classId: classIdOf(p),
      boxId: box.id, value: CRATES.TRAP_GOBLINS,
    });
  }

  function pickUp(w: World, box: Box, p: Player) {
    box.mark = BoxMark.Real;
    box.state = BoxState.Carried;
    box.carriedBy = p.id;
    box.x = p.x;
    box.y = p.y;
    p.carryingBoxId = box.id;
    w.fx('pickup', box, { sourceId: p.id });
    w.emit({ type: 'box_picked', atMs: w.now, playerId: p.id, classId: classIdOf(p), boxId: box.id });
  }

  function deliver(w: World, box: Box, p: Player) {
    if (box.state !== BoxState.Carried || spent.has(box.id)) return;
    spent.add(box.id);
    box.state = BoxState.Delivered;
    box.carriedBy = '';
    p.carryingBoxId = '';
    const at = { x: box.x, y: box.y };
    w.removeEntity('box', box.id);
    w.state.boxesDelivered += 1;
    w.fx('deliver', at, { sourceId: p.id, value: w.state.boxesDelivered });
    w.emit({
      type: 'box_delivered', atMs: w.now, playerId: p.id, classId: classIdOf(p),
      boxId: box.id, value: w.state.boxesDelivered,
    });
  }

  function isPickable(box: Box) {
    return (box.state === BoxState.Idle || box.state === BoxState.Dropped) && !spent.has(box.id);
  }

  /**
   * The crate this interact aims at, chosen from the tick-start snapshot: an explicit
   * in-range target, else the nearest. It may already be claimed by an earlier press.
   */
  function crateFor(w: World, p: Player, cmd: Command<'interact'>, open: Candidate[]): Box | undefined {
    const inRange = open.filter((c) => w.distance(p, c) <= CRATES.PICKUP_RADIUS);
    const targetId = cmd.payload?.targetId;
    if (targetId) {
      const hit = inRange.find((c) => c.box.id === targetId);
      if (hit) return hit.box;
      // The player explicitly aimed at a revive pickup: that one belongs to lives.ts.
      if (w.findEntity(targetId)?.kind === 'revive') return undefined;
    }
    let best: Candidate | undefined;
    let bestD = Infinity;
    for (const c of inRange) {
      const d = w.distance(p, c);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best?.box;
  }

  function resolveInteracts(w: World) {
    const s = w.state;
    const cmds = w.commands('interact');
    if (cmds.length === 0) return;
    /** Players already served this tick: one action each, so nobody grabs two. */
    const acted = new Set<string>();
    /** Crates already resolved this tick: the first command in arrival order wins. */
    const claimed = new Set<string>();
    /**
     * Every press aims at the crates as they stood when the tick began. A crate that
     * an earlier press picked up, broke or dropped this tick stays the loser's target,
     * so the losing press is dropped instead of landing on another crate (maybe a trap).
     */
    const open: Candidate[] = [...s.boxes.values()]
      .filter(isPickable)
      .map((box) => ({ box, x: box.x, y: box.y }));

    for (const cmd of cmds) {
      if (acted.has(cmd.playerId)) continue;
      const p = s.players.get(cmd.playerId);
      if (!p || isCarrierGone(p)) continue;

      if (p.carryingBoxId !== '') {
        const box = s.boxes.get(p.carryingBoxId);
        if (box && box.state === BoxState.Carried && box.carriedBy === p.id) {
          claimed.add(box.id);
          if (inBase(w, p)) {
            // F on arrival in the base still scores: the base always delivers.
            box.x = p.x;
            box.y = p.y;
            deliver(w, box, p);
          } else {
            drop(w, box, p, p, 'interact');
          }
        } else {
          p.carryingBoxId = '';
        }
        acted.add(p.id);
        continue;
      }

      // No crate in range: leave the command to lives.ts (revive pickups).
      const box = crateFor(w, p, cmd, open);
      if (!box) continue;
      acted.add(p.id);
      // Lost the race for this crate: the press does nothing this tick.
      if (claimed.has(box.id)) continue;
      claimed.add(box.id);
      if (w.isBoxReal(box.id)) pickUp(w, box, p);
      else triggerTrap(w, box, p);
    }
  }

  /** Carried crates follow their carrier, fall when it goes down, and score in the base. */
  function settleCarried(w: World) {
    const s = w.state;
    for (const box of [...s.boxes.values()]) {
      if (box.state !== BoxState.Carried) continue;
      const carrier = s.players.get(box.carriedBy);
      const gone = isCarrierGone(carrier);
      if (gone || carrier!.carryingBoxId !== box.id) {
        drop(w, box, carrier, carrier ?? box, gone ?? 'lost');
        continue;
      }
      const p = carrier!;
      if (box.x !== p.x) box.x = p.x;
      if (box.y !== p.y) box.y = p.y;
      if (inBase(w, p)) deliver(w, box, p);
    }

    // A player can only carry a crate that says it is carried by them.
    for (const [, p] of s.players) {
      if (p.carryingBoxId === '') continue;
      const box = s.boxes.get(p.carryingBoxId);
      if (!box || box.state !== BoxState.Carried || box.carriedBy !== p.id) p.carryingBoxId = '';
    }
  }

  return {
    id: 'crates',
    init() {
      spent.clear();
    },
    onWaveStart(w) {
      spent.clear();
      placeWave(w);
    },
    update(w) {
      resolveInteracts(w);
      settleCarried(w);
    },
  };
}
