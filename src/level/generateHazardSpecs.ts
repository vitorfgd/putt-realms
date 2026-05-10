import { hazardWeight, type HazardKind } from "../hazards/HazardTypes";
import type { HazardSpawnSpec, PlacedTile } from "./LevelTypes";

/** Hazards chosen randomly on eligible tiles (excludes paired portal_gate). */
const SCATTER_KINDS: HazardKind[] = [
  "bumper_mushroom",
];

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function pickScatterKind(rng: () => number): HazardKind {
  return SCATTER_KINDS[Math.floor(rng() * SCATTER_KINDS.length)];
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
    const i = eligible[Math.floor(rng() * eligible.length)];
    const j = eligible[Math.floor(rng() * eligible.length)];
    if (i === j) continue;
    if (Math.abs(i - j) < 2) continue;
    const si = stationOrIndex(tiles, i);
    const sj = stationOrIndex(tiles, j);
    if (Math.abs(si - sj) < 3) continue;
    return [i, j];
  }
  return null;
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
    budget = rng() < 0.58 ? 1 : 0;
  } else {
    const roll = Math.ceil(rng() * maxH);
    budget = Math.max(1, roll);
  }

  const used = new Set<number>();
  const specs: HazardSpawnSpec[] = [];

  const portalOk =
    levelIndex >= 8 && eligible.length >= 6 && rng() < 0.36 && budget >= 2;
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

  const pool = eligible.filter((i) => !used.has(i));
  shuffleInPlace(pool, rng);

  const scatterCount = Math.min(Math.max(0, budget), pool.length);
  for (let k = 0; k < scatterCount; k++) {
    const tileIndex = pool[k];
    const kind = pickScatterKind(rng);
    specs.push({
      id: `hz-${levelIndex}-${tileIndex}-${specs.length}`,
      kind,
      tileIndex,
      weight: hazardWeight(kind),
      fanSign: (rng() > 0.5 ? 1 : -1) as 1 | -1,
    });
  }

  return specs;
}
