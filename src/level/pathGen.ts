import { GridDir } from "./LevelTypes";

export interface GridCell {
  x: number;
  z: number;
}

const DX = [0, 1, 0, -1];
const DZ = [1, 0, -1, 0];

function key(c: GridCell): string {
  return `${c.x},${c.z}`;
}

export function step(c: GridCell, dir: GridDir): GridCell {
  return { x: c.x + DX[dir], z: c.z + DZ[dir] };
}

export function turn(dir: GridDir, delta: 1 | -1): GridDir {
  return ((dir + delta + 4) % 4) as GridDir;
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export interface PathGenOptions {
  cellCount: number;
  /** ~0.15 = mostly straight; ~0.55 = windy */
  turnBias: number;
  rng: () => number;
}

/**
 * Single self-avoiding cardinal path (no branches).
 */
export function generateSinglePath(options: PathGenOptions): GridCell[] {
  const { cellCount, turnBias, rng } = options;

  for (let attempt = 0; attempt < 120; attempt++) {
    const occupied = new Set<string>();
    const path: GridCell[] = [{ x: 0, z: 0 }];
    occupied.add(key(path[0]));

    let dir: GridDir = GridDir.N;

    while (path.length < cellCount) {
      const cur = path[path.length - 1];
      const order: GridDir[] = [dir, turn(dir, 1), turn(dir, -1)];
      shuffle(order, rng);

      let placed = false;

      for (const tryDir of order) {
        if (tryDir !== dir && rng() > turnBias) {
          continue;
        }
        const next = step(cur, tryDir);
        const k = key(next);
        if (occupied.has(k)) continue;
        path.push(next);
        occupied.add(k);
        dir = tryDir;
        placed = true;
        break;
      }

      if (!placed) {
        const fallback: GridDir[] = [dir, turn(dir, 1), turn(dir, -1)];
        shuffle(fallback, rng);
        for (const tryDir of fallback) {
          const next = step(cur, tryDir);
          const k = key(next);
          if (occupied.has(k)) continue;
          path.push(next);
          occupied.add(k);
          dir = tryDir;
          placed = true;
          break;
        }
      }

      if (!placed) {
        break;
      }
    }

    if (path.length === cellCount) {
      return path;
    }
  }

  const fallback: GridCell[] = [];
  for (let i = 0; i < cellCount; i++) {
    fallback.push({ x: 0, z: i });
  }
  return fallback;
}

export function dirBetween(a: GridCell, b: GridCell): GridDir | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (let d = 0; d < 4; d++) {
    if (DX[d] === dx && DZ[d] === dz) return d as GridDir;
  }
  return null;
}

/** True if a→b→c continues in a straight line */
export function isCollinearStraight(a: GridCell, b: GridCell, c: GridCell): boolean {
  return b.x - a.x === c.x - b.x && b.z - a.z === c.z - b.z;
}
