/**
 * THE arena. One ASCII grid, read by both halves: the server collides and
 * pathfinds against it, the client renders it. Edit it here and both follow.
 *
 * Legend
 *   #  wall            .  floor          ,  grass (walkable decoration)
 *   B  base (delivery zone, respawn)     S  player spawn (inside base)
 *   K  Goblin King spawn                 T  tower (3)
 *   c  crate spot (more spots than crates; the server picks per wave)
 *   R  revival pickup spot               g  goblin guard spot
 *
 * All special tiles are walkable. `npm run validate` proves every one is
 * reachable from the spawn.
 */

export const TILE = 32;

export const ARENA_ROWS: readonly string[] = [
  '################################################################',
  '#..............................................................#',
  '#.....,,,.........................,,,..........................#',
  '#.....,,,........c........c.......,,,.............##...........#',
  '#.....T......##.........................##........##...........#',
  '#............##.........................##........##......T....#',
  '#............##...##............K.......##...c....##...........#',
  '#........######...##...........................................#',
  '#........######...##...##...g.......g.............c............#',
  '#.................##...##...............................####...#',
  '#.........c.......##...##.....................##........####...#',
  '#.............g...##...##....g.....g..........##.............c.#',
  '#..#####.............c..................c.....##...............#',
  '#..#####......................##..............##.......,,,.....#',
  '#...............#####.........##..............##......c,,,.....#',
  '#...........c...#####.........##......######...................#',
  '#...................R.......c.##......######....R..............#',
  '#.........##..................##..........##........######.....#',
  '#.........##..............................##........######.....#',
  '#..,,,,...##..........##..........c.......##...................#',
  '#..,,,,...##.,,,,.....##........................,,,.........c..#',
  '#.......c.##.,,,,.....##................c.......,,,............#',
  '#..............c......##..######...............................#',
  '#.....................##..######..........................##...#',
  '#.BBBBBB..............##....................##......g.....##...#',
  '#.BBBBBB...........c..............T.........##............##...#',
  '#.BBBBBB......##............................##............##...#',
  '#.BBSBBB......##...........,,,,......##.....##.................#',
  '#.BBBBBB......##........c..,,,,......##.....##..c.......c......#',
  '#.BBBBBB......##.....................##........................#',
  '#..............................................................#',
  '################################################################',
];

export const ARENA_W = ARENA_ROWS[0]!.length;
export const ARENA_H = ARENA_ROWS.length;

export type TileChar = '#' | '.' | ',' | 'B' | 'S' | 'K' | 'T' | 'c' | 'R' | 'g';

export function tileAt(tx: number, ty: number): TileChar {
  if (tx < 0 || ty < 0 || tx >= ARENA_W || ty >= ARENA_H) return '#';
  return ARENA_ROWS[ty]![tx] as TileChar;
}

export function isWallTile(tx: number, ty: number): boolean {
  return tileAt(tx, ty) === '#';
}

/** Pixel position -> tile coordinates. */
export function toTile(px: number, py: number): { tx: number; ty: number } {
  return { tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) };
}

/** Tile centre in pixels. */
export function tileCentre(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function isWalkablePx(px: number, py: number): boolean {
  const { tx, ty } = toTile(px, py);
  return !isWallTile(tx, ty);
}

/** Pixel centres of every tile of one kind, in reading order (stable across runs). */
export function spotsOf(kind: TileChar): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let ty = 0; ty < ARENA_H; ty++)
    for (let tx = 0; tx < ARENA_W; tx++)
      if (ARENA_ROWS[ty]![tx] === kind) out.push(tileCentre(tx, ty));
  return out;
}
