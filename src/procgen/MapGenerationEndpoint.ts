import * as THREE from "three";
import type { GridCell } from "../level/pathGen";
import {
  computeCameraBoundsFromTiles,
  validateGeneratedMap,
} from "./GeneratedMapValidator";
import type { GenerateMapRequest, GeneratedMap } from "./MapGenerationTypes";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
  TILE_LENGTH,
} from "./TileCatalog";
import {
  generateRandomPath,
  isPortraitReasonable,
  solveDoubleRowStraightPath,
  solveTilesAlongPath,
} from "./TilePlacementSolver";

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampDifficultyInt(n: number): number {
  return Math.max(0, Math.min(10, Math.round(n)));
}

function clampProgressionLevel(n: number): number {
  return Math.max(1, Math.min(20, Math.round(n)));
}

function difficultyFromWeights(sum: number): number {
  return clampDifficultyInt(sum / 2);
}

const MAX_PORTRAIT_GRID_SPAN = 4;

interface DifficultyProfile {
  level: number;
  score: number;
  minInterior: number;
  maxInterior: number;
  turnBias: number;
  minTurns: number;
  maxTurns: number;
  rampChance: number;
  minRamps: number;
  maxRamps: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function difficultyProfile(req: GenerateMapRequest): DifficultyProfile {
  const level = clampProgressionLevel(req.targetDifficulty);
  const score = clampDifficultyInt(req.targetDifficulty);
  const t = (level - 1) / 19;
  const maxInteriorCap = Math.max(1, Math.floor((req.maxTiles - 4) / 2));
  const minInterior = Math.min(
    maxInteriorCap,
    Math.max(3, Math.round(3 + t * 15)),
  );
  const maxInterior = Math.min(
    maxInteriorCap,
    Math.max(minInterior, Math.round(6 + t * 24)),
  );
  const maxTurns = req.allowCurves ? Math.round(lerp(0, 8, t)) : 0;
  const minTurns =
    req.allowCurves && level >= 6
      ? Math.min(maxTurns, level >= 16 ? 4 : level >= 11 ? 2 : 1)
      : 0;
  const maxRamps = req.allowRamps ? Math.round(lerp(0, 5, t)) : 0;
  const minRamps =
    req.allowRamps && level >= 8
      ? Math.min(maxRamps, level >= 17 ? 3 : level >= 12 ? 2 : 1)
      : 0;
  return {
    level,
    score,
    minInterior,
    maxInterior,
    turnBias: lerp(0.03, 0.58, t),
    minTurns,
    maxTurns,
    rampChance: req.allowRamps ? lerp(0.03, 0.5, t) : 0,
    minRamps,
    maxRamps,
  };
}

function pickInteriorCount(
  req: GenerateMapRequest,
  rng: () => number,
  profile = difficultyProfile(req),
): number {
  const lo = profile.minInterior;
  const hi = profile.maxInterior;
  const span = hi - lo + 1;
  let n = lo + Math.floor(rng() * span);
  const cap = Math.max(1, req.maxTiles - 2);
  return Math.min(n, cap);
}

/** Interior **z** strips for double-row (each strip = 2 tiles). Total tiles = 2 * (interiorZ + 2). */
function pickInteriorZCount(
  req: GenerateMapRequest,
  rng: () => number,
  profile = difficultyProfile(req),
): number {
  const lo = profile.minInterior;
  const hi = profile.maxInterior;
  const span = hi - lo + 1;
  let nz = lo + Math.floor(rng() * span);
  const cap = Math.max(1, Math.floor((req.maxTiles - 4) / 2));
  return Math.min(nz, cap);
}

function computeStartHoleWorld(
  tiles: GeneratedMap["tiles"],
  path: GridCell[],
): { start: THREE.Vector3; hole: THREE.Vector3 } {
  const first = tiles[0];
  const last = tiles[tiles.length - 1];
  const def0 = getTileDefinition(first.tileType);
  const defL = getTileDefinition(last.tileType);
  const deck0 = deckCenterWorldFromPivot(
    first.position,
    first.rotationY,
    def0,
  );
  const deckL = deckCenterWorldFromPivot(
    last.position,
    last.rotationY,
    defL,
  );
  const p0 = path[0];
  const p1 = path[1];
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const len = Math.hypot(dx, dz) || 1;
  const backX = (-dx / len) * TILE_LENGTH * 0.34;
  const backZ = (-dz / len) * TILE_LENGTH * 0.34;
  const start = new THREE.Vector3(deck0.x + backX, deck0.y, deck0.z + backZ);
  // Hole Y reflects the elevation of the final tile (may be above 0 if ramps raised the course).
  const hole = new THREE.Vector3(deckL.x, deckL.y, deckL.z);
  return { start, hole };
}

/** Tee / cup between the two parallel lanes (course runs +world Z). */
function computeStartHoleDoubleRow(
  tiles: GeneratedMap["tiles"],
  spinePath?: GridCell[],
): { start: THREE.Vector3; hole: THREE.Vector3 } {
  const pairCenter = (leftIndex: number): THREE.Vector3 => {
    const a = deckCenterWorldFromPivot(
      tiles[leftIndex].position,
      tiles[leftIndex].rotationY,
      getTileDefinition(tiles[leftIndex].tileType),
    );
    const b = deckCenterWorldFromPivot(
      tiles[leftIndex + 1].position,
      tiles[leftIndex + 1].rotationY,
      getTileDefinition(tiles[leftIndex + 1].tileType),
    );
    return new THREE.Vector3(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      (a.z + b.z) / 2,
    );
  };

  const tee = pairCenter(0);
  const dir =
    spinePath && spinePath.length >= 2
      ? new THREE.Vector3(
          spinePath[1].x - spinePath[0].x,
          0,
          spinePath[1].z - spinePath[0].z,
        ).normalize()
      : (() => {
          const next = tiles.length >= 4
            ? pairCenter(2)
            : tee.clone().add(new THREE.Vector3(0, 0, 1));
          const fallback = next.clone().sub(tee);
          fallback.y = 0;
          if (fallback.lengthSq() < 1e-6) fallback.set(0, 0, 1);
          return fallback.normalize();
        })();
  const back = TILE_LENGTH * 0.34;
  const start = new THREE.Vector3(
    tee.x - dir.x * back,
    tee.y,
    tee.z - dir.z * back,
  );

  const n = tiles.length;
  // Hole may be elevated if ramps raised the course before the final strip.
  const hole = pairCenter(n - 2);
  return { start, hole };
}

export interface MapGenerationEndpoint {
  generateMap(request: GenerateMapRequest): GeneratedMap;
}

class DefaultMapGenerationEndpoint implements MapGenerationEndpoint {
  generateMap(request: GenerateMapRequest): GeneratedMap {
    const targetInt = clampDifficultyInt(request.targetDifficulty);

    if (request.levelIndex === 1) {
      return this.generateTutorial(request);
    }

    if ((request.layout ?? "double_row_straight") === "double_row_straight") {
      return this.generateDoubleRowStraight(request, targetInt);
    }

    return this.generateSingleFilePath(request, targetInt);
  }

  private generateDoubleRowStraight(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    let best: { map: GeneratedMap; path: GridCell[]; dist: number } | null =
      null;
    const profile = difficultyProfile(request);

    for (let cand = 0; cand < 30; cand++) {
      for (let retry = 0; retry < 40; retry++) {
        const rngZ = mulberry32(
          hashSeed(`${request.seed}|c${cand}|r${retry}`),
        );
        const interiorZ = pickInteriorZCount(request, rngZ, profile);
        const cellCountZ = interiorZ + 2;

        const solved = solveDoubleRowStraightPath(cellCountZ, {
          allowRamps: request.allowRamps,
          allowCurves: request.allowCurves,
          rng: rngZ,
          turnBias: profile.turnBias,
          minTurns: profile.minTurns,
          maxTurns: profile.maxTurns,
          rampChance: profile.rampChance,
          minRamps: profile.minRamps,
          maxRamps: profile.maxRamps,
        });
        if (!solved) continue;

        const { start, hole } = computeStartHoleDoubleRow(
          solved.tiles,
          solved.spinePath,
        );
        const path = solved.path;
        const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);

        const draft: GeneratedMap = {
          id: `proc-2row-${request.levelIndex}-${hashSeed(request.seed) & 0xffff}-${cand}-${retry}`,
          seed: request.seed,
          levelIndex: request.levelIndex,
          difficulty,
          tiles: solved.tiles,
          startPosition: start,
          holePosition: hole,
          cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
          imperfectDifficulty: false,
          debugInfo: {
            layout: "double_row_straight",
            cellCountZ,
            progressionProfile: profile,
            gridPath: path,
            ...(solved.spinePath ? { spinePath: solved.spinePath } : {}),
          },
        };

        const v = validateGeneratedMap(draft, path);
        if (!v.ok) continue;

        const dist = Math.abs(difficulty - targetInt);
        const matched = dist <= 1;
        const finalized = this.finalizeMap(draft, path, targetInt, matched);

        if (matched) {
          return finalized;
        }

        if (!best || dist < best.dist) {
          best = { map: finalized, path, dist };
        }
      }
    }

    if (best) {
      best.map.imperfectDifficulty = true;
      best.map.debugInfo = {
        ...best.map.debugInfo,
        gridPath: best.path,
        layout: "double_row_straight",
        targetDifficulty: targetInt,
        matchedWithinOne: false,
      };
      return best.map;
    }

    return this.fallbackDoubleRow(request, targetInt);
  }

  private generateSingleFilePath(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    let best: { map: GeneratedMap; path: GridCell[]; dist: number } | null =
      null;
    const profile = difficultyProfile(request);

    for (let cand = 0; cand < 30; cand++) {
      const rng = mulberry32(hashSeed(`${request.seed}|c${cand}`));
      const interior = pickInteriorCount(request, rng, profile);
      const cellCount = interior + 2;

      for (let retry = 0; retry < 40; retry++) {
        const rngPath = mulberry32(
          hashSeed(`${request.seed}|c${cand}|r${retry}`),
        );
        const turnBias = profile.turnBias + (rngPath() - 0.5) * 0.08;
        const path = generateRandomPath({
          rng: rngPath,
          cellCount,
          turnBias,
          allowCurves: request.allowCurves,
        });
        if (!path) continue;
        if (!isPortraitReasonable(path, MAX_PORTRAIT_GRID_SPAN)) continue;

        const solved = solveTilesAlongPath(path, {
          rng: mulberry32(hashSeed(`${request.seed}|sol|c${cand}|r${retry}`)),
          allowRamps: request.allowRamps,
          allowCurves: request.allowCurves,
          rampChance: profile.rampChance,
        });
        if (!solved) continue;

        const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
        const { start, hole } = computeStartHoleWorld(solved.tiles, path);

        const draft: GeneratedMap = {
          id: `proc-${request.levelIndex}-${hashSeed(request.seed) & 0xffff}-${cand}-${retry}`,
          seed: request.seed,
          levelIndex: request.levelIndex,
          difficulty,
          tiles: solved.tiles,
          startPosition: start,
          holePosition: hole,
          cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
          imperfectDifficulty: false,
          debugInfo: {
            layout: "single_path",
            progressionProfile: profile,
            gridPath: path,
          },
        };

        const v = validateGeneratedMap(draft, path);
        if (!v.ok) continue;

        const dist = Math.abs(difficulty - targetInt);
        const matched = dist <= 1;
        const finalized = this.finalizeMap(draft, path, targetInt, matched);

        if (matched) {
          return finalized;
        }

        if (!best || dist < best.dist) {
          best = { map: finalized, path, dist };
        }
      }
    }

    if (best) {
      best.map.imperfectDifficulty = true;
      best.map.debugInfo = {
        ...best.map.debugInfo,
        gridPath: best.path,
        layout: "single_path",
        targetDifficulty: targetInt,
        matchedWithinOne: false,
      };
      return best.map;
    }

    return this.fallbackCollinear(request, targetInt);
  }

  private finalizeMap(
    map: GeneratedMap,
    path: GridCell[],
    targetInt: number,
    matched: boolean,
  ): GeneratedMap {
    map.imperfectDifficulty = !matched;
    map.debugInfo = {
      ...map.debugInfo,
      gridPath: path,
      targetDifficulty: targetInt,
      matchedWithinOne: matched,
    };
    return map;
  }

  private generateTutorial(request: GenerateMapRequest): GeneratedMap {
    const useDouble =
      (request.layout ?? "double_row_straight") === "double_row_straight";

    if (useDouble) {
      const solved = solveDoubleRowStraightPath(3)!;
      const path = solved.path;
      const { start, hole } = computeStartHoleDoubleRow(
        solved.tiles,
        solved.spinePath,
      );
      const draft: GeneratedMap = {
        id: `proc-tutorial-${request.levelIndex}-${hashSeed(request.seed)}`,
        seed: request.seed,
        levelIndex: request.levelIndex,
        difficulty: 0,
        tiles: solved.tiles,
        startPosition: start,
        holePosition: hole,
        cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
        imperfectDifficulty: false,
        debugInfo: {
          layout: "double_row_straight",
          gridPath: path,
          tutorial: true,
          targetDifficulty: 0,
          matchedWithinOne: true,
          cellCountZ: 3,
        },
      };
      const v = validateGeneratedMap(draft, path);
      if (!v.ok) {
        return this.fallbackDoubleRow(request, 0);
      }
      return draft;
    }

    const path: GridCell[] = [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 2 },
    ];
    const rng = mulberry32(hashSeed(`${request.seed}|tutorial`));
    const solved = solveTilesAlongPath(path, {
      rng,
      allowRamps: false,
      allowCurves: false,
    })!;
    const { start, hole } = computeStartHoleWorld(solved.tiles, path);
    const draft: GeneratedMap = {
      id: `proc-tutorial-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty: 0,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: false,
      debugInfo: {
        layout: "single_path",
        gridPath: path,
        tutorial: true,
        targetDifficulty: 0,
        matchedWithinOne: true,
      },
    };
    const v = validateGeneratedMap(draft, path);
    if (!v.ok) {
      return this.fallbackCollinear(request, 0);
    }
    return draft;
  }

  private fallbackDoubleRow(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    const rng = mulberry32(hashSeed(`${request.seed}|fallback2r`));
    const profile = difficultyProfile(request);
    const interiorZ = Math.min(
      12,
      Math.max(2, pickInteriorZCount(request, rng, profile)),
    );
    const cellCountZ = interiorZ + 2;
    const solved = solveDoubleRowStraightPath(cellCountZ, {
      allowRamps: request.allowRamps,
      allowCurves: request.allowCurves,
      rng,
      turnBias: profile.turnBias,
      minTurns: profile.minTurns,
      maxTurns: profile.maxTurns,
      rampChance: profile.rampChance,
      minRamps: profile.minRamps,
      maxRamps: profile.maxRamps,
    })!;
    const path = solved.path;
    const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
    const { start, hole } = computeStartHoleDoubleRow(
      solved.tiles,
      solved.spinePath,
    );
    const draft: GeneratedMap = {
      id: `proc-fallback-2r-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: Math.abs(difficulty - targetInt) > 1,
      debugInfo: {
        layout: "double_row_straight",
        gridPath: path,
        progressionProfile: profile,
        ...(solved.spinePath ? { spinePath: solved.spinePath } : {}),
        fallback: true,
        targetDifficulty: targetInt,
        matchedWithinOne: Math.abs(difficulty - targetInt) <= 1,
        cellCountZ,
      },
    };
    return draft;
  }

  private fallbackCollinear(
    request: GenerateMapRequest,
    targetInt: number,
  ): GeneratedMap {
    const rng = mulberry32(hashSeed(`${request.seed}|fallback`));
    const profile = difficultyProfile(request);
    const interior = Math.min(
      12,
      Math.max(profile.minInterior, pickInteriorCount(request, rng, profile)),
    );
    const cellCount = interior + 2;
    const path: GridCell[] = [];
    for (let z = 0; z < cellCount; z++) {
      path.push({ x: 0, z });
    }
    const solved = solveTilesAlongPath(path, {
      rng,
      allowRamps: request.allowRamps,
      allowCurves: false,
      rampChance: profile.rampChance,
    })!;
    const difficulty = difficultyFromWeights(solved.sumDifficultyWeights);
    const { start, hole } = computeStartHoleWorld(solved.tiles, path);
    const draft: GeneratedMap = {
      id: `proc-fallback-${request.levelIndex}-${hashSeed(request.seed)}`,
      seed: request.seed,
      levelIndex: request.levelIndex,
      difficulty,
      tiles: solved.tiles,
      startPosition: start,
      holePosition: hole,
      cameraBounds: computeCameraBoundsFromTiles({ tiles: solved.tiles }),
      imperfectDifficulty: Math.abs(difficulty - targetInt) > 1,
      debugInfo: {
        layout: "single_path",
        gridPath: path,
        progressionProfile: profile,
        fallback: true,
        targetDifficulty: targetInt,
        matchedWithinOne: Math.abs(difficulty - targetInt) <= 1,
      },
    };
    return draft;
  }
}

export const mapGenerationEndpoint: MapGenerationEndpoint =
  new DefaultMapGenerationEndpoint();
