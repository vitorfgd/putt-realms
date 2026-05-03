import type { PlacedTile } from "./LevelTypes";
import { isCollinearStraight, type GridCell } from "./pathGen";

/** Legacy tone buckets (optional UI / analytics) */
export enum DifficultyBand {
  Tutorial = "Tutorial",
  Normal = "Normal",
  Hard = "Hard",
}

export const TILE_SHAPE_WEIGHT = {
  /** straight / square */
  square: 1.0,
  /** straight segment spanning ≥3 collinear cells */
  longRectangle: 1.2,
  curve: 1.5,
  hardCorner: 1.8,
  /** Not generated in v1 */
  tJunction: 2.5,
} as const;

export function sumHazardWeights(specs: readonly { weight: number }[]): number {
  let t = 0;
  for (const h of specs) {
    t += h.weight;
  }
  return t;
}

export interface CourseMetrics {
  /** Course size / path length */
  S: number;
  /** Total trap weight */
  T: number;
  /** Tile shape weight aggregate (sum of per-tile weights) */
  W: number;
  /** Count of 90° turns along the path */
  R: number;
}

export function computeRaw(S: number, T: number, W: number, R: number): number {
  return 0.3 * S + 1.0 * T + 0.5 * W + 0.7 * R;
}

/** Integer difficulty in [0, 10] */
export function difficultyFromMetrics(S: number, T: number, W: number, R: number): number {
  const raw = computeRaw(S, T, W, R);
  return clampInt(Math.round(raw / 2.0), 0, 10);
}

export function difficultyFromCourseMetrics(m: CourseMetrics): number {
  return difficultyFromMetrics(m.S, m.T, m.W, m.R);
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function bandFromScore(score: number): DifficultyBand {
  if (score <= 3) return DifficultyBand.Tutorial;
  if (score <= 7) return DifficultyBand.Normal;
  return DifficultyBand.Hard;
}

/**
 * Ideal continuous target before candidate matching.
 * Level 1 must use difficulty 0 at generation time (handled in LevelGenerator).
 */
export function targetDifficulty(levelIndex: number, rng: () => number): number {
  if (levelIndex <= 1) return 0;
  const jitter = (rng() - 0.5) * 1.2;
  let t = 10 * (1 - Math.exp(-levelIndex / 2.5)) + jitter;
  if (levelIndex % 7 === 0) {
    t *= 0.5;
  }
  return Math.max(0, Math.min(10, t));
}

export function countTurns(path: GridCell[]): number {
  if (path.length < 3) return 0;
  let r = 0;
  for (let i = 1; i < path.length - 1; i++) {
    if (!isCollinearStraight(path[i - 1], path[i], path[i + 1])) {
      r += 1;
    }
  }
  return r;
}

/** Cells in the maximal straight run containing index i (same step direction). */
export function straightRunLength(path: GridCell[], i: number): number {
  const n = path.length;
  if (n <= 1) return n;

  let lo = i;
  while (lo > 0) {
    const v1x = path[lo].x - path[lo - 1].x;
    const v1z = path[lo].z - path[lo - 1].z;
    const v2x = path[lo + 1].x - path[lo].x;
    const v2z = path[lo + 1].z - path[lo].z;
    if (v1x !== v2x || v1z !== v2z) break;
    lo--;
  }

  let hi = i;
  while (hi < n - 1) {
    const v1x = path[hi].x - path[hi - 1].x;
    const v1z = path[hi].z - path[hi - 1].z;
    const v2x = path[hi + 1].x - path[hi].x;
    const v2z = path[hi + 1].z - path[hi].z;
    if (v1x !== v2x || v1z !== v2z) break;
    hi++;
  }

  return hi - lo + 1;
}

export function tileShapeWeightAt(
  path: GridCell[],
  tiles: PlacedTile[],
  index: number,
): number {
  const ty = tiles[index].type;
  switch (ty) {
    case "start":
    case "hole":
      return TILE_SHAPE_WEIGHT.square;
    case "curve":
      return TILE_SHAPE_WEIGHT.curve;
    case "corner":
      return TILE_SHAPE_WEIGHT.hardCorner;
    case "straight": {
      const run = straightRunLength(path, index);
      return run >= 3
        ? TILE_SHAPE_WEIGHT.longRectangle
        : TILE_SHAPE_WEIGHT.square;
    }
    default:
      return TILE_SHAPE_WEIGHT.square;
  }
}

export function sumTileShapeWeights(path: GridCell[], tiles: PlacedTile[]): number {
  let w = 0;
  for (let i = 0; i < tiles.length; i++) {
    w += tileShapeWeightAt(path, tiles, i);
  }
  return w;
}

export function computeCourseMetrics(
  path: GridCell[],
  tiles: PlacedTile[],
  hazardSpecs?: readonly { weight: number }[],
): CourseMetrics {
  return {
    S: path.length,
    T: hazardSpecs ? sumHazardWeights(hazardSpecs) : 0,
    W: sumTileShapeWeights(path, tiles),
    R: countTurns(path),
  };
}
