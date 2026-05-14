import { hazardWeight } from "../hazards/HazardTypes";
import type { HazardSpawnSpec, PlacedTile } from "./LevelTypes";

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function stationOrIndex(tiles: readonly PlacedTile[], tileIndex: number): number {
  const s = tiles[tileIndex]?.stationIndex;
  return typeof s === "number" ? s : tileIndex;
}

/**
 * Tiles where a one-cell footprint hazard can sit.
 *
 * Rules:
 * - Type `straight` only (hazard meshes assume a straight fairway strip).
 * - Not ramp/cap/elbow (`hazardSafe !== false`; ramps set `hazardSafe: false`).
 * - Skip tiles near start/hole along station ordering (see station min/max guard).
 */
export function eligibleTileIndicesForHazards(
  tiles: readonly PlacedTile[],
): number[] {
  const out: number[] = [];
  const stationValues = tiles
    .map((tile) => tile.stationIndex)
    .filter((station): station is number => typeof station === "number");
  const minStation = stationValues.length > 0 ? Math.min(...stationValues) : 0;
  const maxStation =
    stationValues.length > 0 ? Math.max(...stationValues) : tiles.length - 1;
  for (let i = 2; i <= tiles.length - 2; i++) {
    const tile = tiles[i];
    const station = tile.stationIndex;
    const isFirstOrLastStation =
      station !== undefined &&
      (station <= minStation + 1 || station >= maxStation - 1);
    if (
      tile.type === "straight" &&
      tile.hazardSafe !== false &&
      !tile.isRamp &&
      !isFirstOrLastStation
    ) {
      out.push(i);
    }
  }
  return out;
}

function tryPickPortalPairIndices(
  eligible: readonly number[],
  tiles: readonly PlacedTile[],
  rng: () => number,
): [number, number] | null {
  if (eligible.length < 2) return null;
  for (let attempt = 0; attempt < 55; attempt++) {
    const i = eligible[Math.floor(rng() * eligible.length)]!;
    const j = eligible[Math.floor(rng() * eligible.length)]!;
    if (i === j) continue;
    if (Math.abs(i - j) < 2) continue;
    const si = stationOrIndex(tiles, i);
    const sj = stationOrIndex(tiles, j);
    if (Math.abs(si - sj) < 3) continue;
    return [i, j];
  }
  return null;
}

/** Maximal runs of consecutive tile indices (path order), each run length ≥ 3 */
function consecutiveRunsInPool(pool: readonly number[]): number[][] {
  if (pool.length < 3) return [];
  const sorted = [...new Set(pool)].sort((a, b) => a - b);
  const runs: number[][] = [];
  let cur: number[] = [sorted[0]!];
  for (let k = 1; k < sorted.length; k++) {
    const v = sorted[k]!;
    if (v === sorted[k - 1]! + 1) cur.push(v);
    else {
      runs.push(cur);
      cur = [v];
    }
  }
  runs.push(cur);
  return runs.filter((r) => r.length >= 3);
}

/** Pick a contiguous cluster of `size` indices from a run, or null */
function pickClusterSlice(
  run: readonly number[],
  size: number,
  rng: () => number,
): number[] | null {
  if (run.length < size) return null;
  const startMax = run.length - size;
  const start = Math.floor(rng() * (startMax + 1));
  return run.slice(start, start + size);
}

/**
 * Level 1: none. Otherwise scatter hazards on eligible straights; sometimes adds a paired
 * portal pair on higher levels (counts toward the same placement budget).
 */
export function generateHazardSpecs(
  levelIndex: number,
  tiles: readonly PlacedTile[],
  rng: () => number,
): HazardSpawnSpec[] {
  if (levelIndex === 1) return [];

  const eligible = eligibleTileIndicesForHazards(tiles);
  if (eligible.length === 0) return [];

  let maxH = 2;
  if (levelIndex >= 10) maxH = 3;
  if (levelIndex >= 16) maxH = 4;
  maxH = Math.min(maxH, eligible.length);

  let budget: number;
  if (levelIndex >= 2 && levelIndex <= 4) {
    /** Always place at least one hazard on short early holes so mushroom clusters can appear. */
    if (eligible.length >= 5) {
      budget = rng() < 0.45 ? 3 : 2;
    } else if (eligible.length >= 3) {
      budget = 2;
    } else {
      budget = eligible.length >= 1 ? 1 : 0;
    }
  } else {
    const roll = Math.ceil(rng() * maxH);
    budget = Math.max(2, roll);
  }

  const used = new Set<number>();
  const specs: HazardSpawnSpec[] = [];

  const portalOk =
    levelIndex >= 8 && eligible.length >= 6 && rng() < 0.36 && budget >= 4;
  if (portalOk) {
    const pair = tryPickPortalPairIndices(eligible, tiles, rng);
    if (pair) {
      const portalPairId = `pg-${levelIndex}-${Math.floor(rng() * 1e9)}`;
      const w = hazardWeight("portal_gate");
      specs.push({
        id: `hz-${levelIndex}-${pair[0]}-port-a`,
        kind: "portal_gate",
        tileIndex: pair[0],
        weight: w,
        portalPairId,
        portalRole: "a",
      });
      specs.push({
        id: `hz-${levelIndex}-${pair[1]}-port-b`,
        kind: "portal_gate",
        tileIndex: pair[1],
        weight: w,
        portalPairId,
        portalRole: "b",
      });
      used.add(pair[0]);
      used.add(pair[1]);
      budget -= 2;
    }
  }

  let pool = eligible.filter((i) => !used.has(i));
  shuffleInPlace(pool, rng);

  const pushMushroom = (tileIndex: number, fanSign: 1 | -1) => {
    const r = rng();
    const mushroomVisualScale =
      1 + r * r * 0.95 + rng() * 0.85;
    specs.push({
      id: `hz-${levelIndex}-${tileIndex}-${specs.length}`,
      kind: "bumper_mushroom",
      tileIndex,
      weight: hazardWeight("bumper_mushroom"),
      fanSign,
      mushroomVisualScale: Math.min(2.75, mushroomVisualScale),
    });
  };

  const pushFan = (tileIndex: number, fanSign: 1 | -1) => {
    specs.push({
      id: `hz-${levelIndex}-${tileIndex}-${specs.length}`,
      kind: "fan",
      tileIndex,
      weight: hazardWeight("fan"),
      fanSign,
    });
  };

  const pushWindmill = (tileIndex: number) => {
    specs.push({
      id: `hz-${levelIndex}-${tileIndex}-${specs.length}`,
      kind: "windmill",
      tileIndex,
      weight: hazardWeight("windmill"),
    });
  };

  while (budget > 0 && pool.length > 0) {
    if (budget >= 3) {
      const want: 3 | 4 = rng() < 0.52 ? 3 : 4;
      const size = Math.min(want, budget, pool.length);
      if (size >= 3) {
        const runs = consecutiveRunsInPool(pool);
        const viable = runs.filter((r) => r.length >= size);
        if (viable.length > 0) {
          const run = viable[Math.floor(rng() * viable.length)]!;
          const cluster = pickClusterSlice(run, size, rng);
          if (cluster) {
            for (const tileIndex of cluster) {
              used.add(tileIndex);
              pushMushroom(tileIndex, (rng() > 0.5 ? 1 : -1) as 1 | -1);
            }
            pool = pool.filter((i) => !used.has(i));
            budget -= size;
            shuffleInPlace(pool, rng);
            continue;
          }
        }
      }
    }

    const tileIndex = pool[0]!;
    used.add(tileIndex);
    pool = pool.filter((i) => i !== tileIndex);
    const wantFan = levelIndex >= 4 && rng() < 0.32;
    const wantWindmill =
      levelIndex >= 3 && !wantFan && rng() < 0.26;
    if (wantFan) {
      pushFan(tileIndex, (rng() > 0.5 ? 1 : -1) as 1 | -1);
    } else if (wantWindmill) {
      pushWindmill(tileIndex);
    } else {
      pushMushroom(tileIndex, (rng() > 0.5 ? 1 : -1) as 1 | -1);
    }
    budget -= 1;
    shuffleInPlace(pool, rng);
  }

  return specs;
}
