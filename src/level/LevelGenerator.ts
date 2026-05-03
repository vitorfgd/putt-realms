import { BALL_RADIUS } from "../core/Constants";
import {
  computeCourseMetrics,
  difficultyFromCourseMetrics,
  targetDifficulty,
} from "./Difficulty";
import {
  TILE_SIZE,
  LANE_HALF_WIDTH,
} from "./TileDimensions";
import { pathHasPlayableCorridor } from "./pathCorridor";
import type {
  GeneratedLevel,
  HazardSpawnSpec,
  PlacedTile,
  TileType,
  LevelWorldBounds,
} from "./LevelTypes";
import {
  generateSinglePath,
  isCollinearStraight,
  type GridCell,
} from "./pathGen";
import { generateHazardSpecs } from "./generateHazardSpecs";
import { bendOuterRailSigns } from "./bendOuterRails";
import { buildRailColliders } from "./railColliders";

export interface GenerateLevelOptions {
  rng?: () => number;
  /** Previous level score — prevents two consecutive levels both > 8 */
  previousDifficultyScore?: number;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cellCountForLevel(levelIndex: number, rng: () => number): number {
  if (levelIndex === 1) return 3;
  if (levelIndex <= 5) return 5 + Math.floor(rng() * 3);
  return 10 + Math.floor(rng() * 10) + Math.floor(levelIndex / 2);
}

function turnBiasForLevel(levelIndex: number): number {
  if (levelIndex <= 1) return 0.04;
  if (levelIndex <= 5) return 0.15 + levelIndex * 0.02;
  return 0.32 + Math.min(0.3, levelIndex * 0.018);
}

function centerOffsets(path: GridCell[]): { cx: number; cz: number } {
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const p of path) {
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
    minz = Math.min(minz, p.z);
    maxz = Math.max(maxz, p.z);
  }
  return { cx: (minx + maxx) / 2, cz: (minz + maxz) / 2 };
}

function worldXZ(p: GridCell, cx: number, cz: number): { x: number; z: number } {
  return {
    x: (p.x - cx) * TILE_SIZE,
    z: (p.z - cz) * TILE_SIZE,
  };
}

function innerBoundsFromPath(
  path: GridCell[],
  cx: number,
  cz: number,
): LevelWorldBounds {
  const pad = LANE_HALF_WIDTH - BALL_RADIUS;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of path) {
    const { x, z } = worldXZ(p, cx, cz);
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  }
  return { minX, maxX, minZ, maxZ };
}

function levelId(levelIndex: number, path: GridCell[]): string {
  const sig = path.map((p) => `${p.x},${p.z}`).join("|");
  return `lvl-${levelIndex}-${sig}`;
}

export class LevelGenerator {
  /**
   * Procedural single-path layout with difficulty search (≤30 candidates).
   */
  generate(
    levelIndex: number,
    options?: GenerateLevelOptions,
  ): GeneratedLevel {
    const rng = options?.rng ?? Math.random;
    const prevScore = options?.previousDifficultyScore;

    if (levelIndex === 1) {
      const path: GridCell[] = [
        { x: 0, z: 0 },
        { x: 0, z: 1 },
        { x: 0, z: 2 },
      ];
      const { cx, cz } = centerOffsets(path);
      const tiles = this.buildTiles(path, levelIndex, rng, cx, cz);
      return this.assembleLevel(levelIndex, path, rng, {
        tiles,
        difficultyScoreOverride: 0,
        targetDifficulty: 0,
        imperfectDifficulty: false,
      });
    }

    const targetFloat = targetDifficulty(levelIndex, rng);
    const targetInt = clampInt(Math.round(targetFloat), 0, 10);

    let best: {
      path: GridCell[];
      tiles: PlacedTile[];
      hazardSpecs: HazardSpawnSpec[];
      score: number;
      dist: number;
    } | null = null;

    let bestAny: {
      path: GridCell[];
      tiles: PlacedTile[];
      hazardSpecs: HazardSpawnSpec[];
      score: number;
      dist: number;
    } | null = null;

    let bestBlocked: {
      path: GridCell[];
      tiles: PlacedTile[];
      hazardSpecs: HazardSpawnSpec[];
      score: number;
      dist: number;
    } | null = null;

    for (let attempt = 0; attempt < 48; attempt++) {
      const count = Math.max(
        3,
        cellCountForLevel(levelIndex, rng) + Math.floor((rng() - 0.5) * 3),
      );
      const bias = Math.max(
        0.02,
        turnBiasForLevel(levelIndex) + (rng() - 0.5) * 0.14,
      );
      const path = generateSinglePath({
        cellCount: count,
        turnBias: bias,
        rng,
      });

      const { cx, cz } = centerOffsets(path);
      const tiles = this.buildTiles(path, levelIndex, rng, cx, cz);
      const playable = pathHasPlayableCorridor(path, tiles, cx, cz, TILE_SIZE);
      const hazardSpecs = generateHazardSpecs(levelIndex, tiles, rng);
      const metrics = computeCourseMetrics(path, tiles, hazardSpecs);
      const score = difficultyFromCourseMetrics(metrics);

      const dist = Math.abs(score - targetInt);

      if (!playable) {
        if (!bestBlocked || dist < bestBlocked.dist) {
          bestBlocked = { path, tiles, hazardSpecs, score, dist };
        }
        continue;
      }

      if (!bestAny || dist < bestAny.dist) {
        bestAny = { path, tiles, hazardSpecs, score, dist };
      }

      if (prevScore !== undefined && prevScore > 8 && score > 8) {
        continue;
      }

      if (dist <= 1) {
        return this.assembleLevel(levelIndex, path, rng, {
          tiles,
          hazardSpecs,
          targetDifficulty: targetInt,
          imperfectDifficulty: false,
        });
      }

      if (!best || dist < best.dist) {
        best = { path, tiles, hazardSpecs, score, dist };
      }
    }

    if (best) {
      return this.assembleLevel(levelIndex, best.path, rng, {
        tiles: best.tiles,
        hazardSpecs: best.hazardSpecs,
        targetDifficulty: targetInt,
        imperfectDifficulty: true,
      });
    }

    if (bestAny) {
      return this.assembleLevel(levelIndex, bestAny.path, rng, {
        tiles: bestAny.tiles,
        hazardSpecs: bestAny.hazardSpecs,
        targetDifficulty: targetInt,
        imperfectDifficulty: true,
      });
    }

    if (bestBlocked) {
      return this.assembleLevel(levelIndex, bestBlocked.path, rng, {
        tiles: bestBlocked.tiles,
        hazardSpecs: bestBlocked.hazardSpecs,
        targetDifficulty: targetInt,
        imperfectDifficulty: true,
      });
    }

    for (let fb = 0; fb < 24; fb++) {
      const fallback = generateSinglePath({
        cellCount: Math.max(3, cellCountForLevel(levelIndex, rng)),
        turnBias: turnBiasForLevel(levelIndex),
        rng,
      });
      const { cx: fcx, cz: fcz } = centerOffsets(fallback);
      const fbTiles = this.buildTiles(fallback, levelIndex, rng, fcx, fcz);
      if (pathHasPlayableCorridor(fallback, fbTiles, fcx, fcz, TILE_SIZE)) {
        return this.assembleLevel(levelIndex, fallback, rng, {
          tiles: fbTiles,
          targetDifficulty: targetInt,
          imperfectDifficulty: true,
        });
      }
    }

    const fallback = generateSinglePath({
      cellCount: Math.max(3, cellCountForLevel(levelIndex, rng)),
      turnBias: turnBiasForLevel(levelIndex),
      rng,
    });
    const { cx: fcx, cz: fcz } = centerOffsets(fallback);
    const fbTiles = this.buildTiles(fallback, levelIndex, rng, fcx, fcz);
    return this.assembleLevel(levelIndex, fallback, rng, {
      tiles: fbTiles,
      targetDifficulty: targetInt,
      imperfectDifficulty: true,
    });
  }

  private assembleLevel(
    levelIndex: number,
    path: GridCell[],
    rng: () => number,
    opts: {
      tiles?: PlacedTile[];
      hazardSpecs?: HazardSpawnSpec[];
      difficultyScoreOverride?: number;
      targetDifficulty: number;
      imperfectDifficulty: boolean;
    },
  ): GeneratedLevel {
    const { cx, cz } = centerOffsets(path);
    const tiles =
      opts.tiles ?? this.buildTiles(path, levelIndex, rng, cx, cz);
    const hazardSpecs =
      opts.hazardSpecs ??
      generateHazardSpecs(levelIndex, tiles, rng);
    const metrics = computeCourseMetrics(path, tiles, hazardSpecs);
    let difficultyScore = difficultyFromCourseMetrics(metrics);
    if (opts.difficultyScoreOverride !== undefined) {
      difficultyScore = opts.difficultyScoreOverride;
    }

    const bounds = innerBoundsFromPath(path, cx, cz);

    const first = path[0];
    const second = path[1];
    const fwx = worldXZ(first, cx, cz);
    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const len = Math.hypot(dx, dz) || 1;
    const backX = (-dx / len) * TILE_SIZE * 0.34;
    const backZ = (-dz / len) * TILE_SIZE * 0.34;

    const last = path[path.length - 1];
    const lwx = worldXZ(last, cx, cz);

    return {
      id: levelId(levelIndex, path),
      levelIndex,
      difficultyScore,
      targetDifficulty: opts.targetDifficulty,
      imperfectDifficulty: opts.imperfectDifficulty ? true : undefined,
      hazardSpecs,
      tiles,
      startPosition: { x: fwx.x + backX, y: 0, z: fwx.z + backZ },
      holePosition: { x: lwx.x, y: 0, z: lwx.z },
      bounds,
      railColliders: buildRailColliders(tiles),
    };
  }

  private buildTiles(
    path: GridCell[],
    levelIndex: number,
    rng: () => number,
    cx: number,
    cz: number,
  ): PlacedTile[] {
    const tiles: PlacedTile[] = [];

    for (let i = 0; i < path.length; i++) {
      const cur = path[i];
      const prev = path[i - 1];
      const next = path[i + 1];
      const { x: wx, z: wz } = worldXZ(cur, cx, cz);

      let type: TileType;
      let rotationY: number;
      let railS: { sx: 1 | -1; sz: 1 | -1 } | undefined;

      if (i === 0) {
        type = "start";
        const nx = next!.x - cur.x;
        const nz = next!.z - cur.z;
        rotationY = Math.atan2(nx, nz);
      } else if (i === path.length - 1) {
        type = "hole";
        const nx = cur.x - prev!.x;
        const nz = cur.z - prev!.z;
        rotationY = Math.atan2(nx, nz);
      } else {
        const a = prev!;
        const b = cur;
        const c = next!;

        if (isCollinearStraight(a, b, c)) {
          type = "straight";
        } else {
          type = levelIndex >= 6 && rng() > 0.42 ? "curve" : "corner";
          const dxIn = b.x - a.x;
          const dzIn = b.z - a.z;
          const dxOut = c.x - b.x;
          const dzOut = c.z - b.z;
          railS = bendOuterRailSigns(dxIn, dzIn, dxOut, dzOut);
        }

        const nx = next!.x - cur.x;
        const nz = next!.z - cur.z;
        rotationY = Math.atan2(nx, nz);
      }

      const placed: PlacedTile = {
        type,
        gridX: cur.x,
        gridZ: cur.z,
        worldX: wx,
        worldZ: wz,
        rotationY,
      };
      if (railS !== undefined) {
        placed.railS = railS;
      }
      tiles.push(placed);
    }

    return tiles;
  }
}
