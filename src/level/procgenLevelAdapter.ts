import type {
  GeneratedMap,
  PlacedTile as ProcgenTile,
} from "../procgen/MapGenerationTypes";
import { PROCGEN_TILE_TO_ASSET } from "../procgen/procgenAssetKeys";
import {
  deckCenterWorldFromPivot,
  getTileDefinition,
} from "../procgen/TileCatalog";
import { bendOuterRailSigns } from "./bendOuterRails";
import {
  flatProcgenPatch,
  rampProcgenPatch,
  sampleCourseSurface,
} from "./courseSurface";
import { generateHazardSpecs } from "./generateHazardSpecs";
import type {
  CourseSurface,
  GeneratedLevel,
  PlacedTile as GamePlacedTile,
} from "./LevelTypes";
import type { GridCell } from "./pathGen";
import { buildRailColliders } from "./railColliders";

export interface ProcgenAdaptOptions {
  levelIndex: number;
  /** Integer difficulty target shown in HUD / skip pricing — mirrors legacy generator. */
  targetDifficultyRounded: number;
  rng: () => number;
}

function gridPathFromDebug(map: GeneratedMap): GridCell[] {
  const gp = map.debugInfo["gridPath"];
  if (!Array.isArray(gp)) {
    throw new Error(
      "procgenLevelAdapter: expected map.debugInfo.gridPath from MapGenerationEndpoint",
    );
  }
  return gp as GridCell[];
}

function keyCell(c: GridCell): string {
  return `${c.x},${c.z}`;
}

function exposedSides(
  cell: GridCell,
  occupied: ReadonlySet<string>,
): { x: number; z: number }[] {
  const sides = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  return sides.filter((s) => !occupied.has(`${cell.x + s.x},${cell.z + s.z}`));
}

function toGameplayTile(
  pt: ProcgenTile,
  prev: GridCell | undefined,
  cur: GridCell,
  next: GridCell | undefined,
  exposed: readonly { x: number; z: number }[],
): GamePlacedTile {
  const def = getTileDefinition(pt.tileType);
  const deck = deckCenterWorldFromPivot(pt.position, pt.rotationY, def);

  let type: GamePlacedTile["type"];
  let railS: GamePlacedTile["railS"];
  let railWorldSides: GamePlacedTile["railWorldSides"];

  switch (pt.tileType) {
    case "start_placeholder":
      type = "start";
      railWorldSides = [...exposed];
      break;
    case "hole_placeholder":
      type = "hole";
      railWorldSides = [...exposed];
      break;
    case "straight_right_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "ramp_right_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "ramp_left_wall":
      type = "straight";
      railWorldSides = [...exposed];
      break;
    case "floor_plain":
      type = "floor";
      railWorldSides = [];
      break;
    case "convex_right_wall":
      type = "corner";
      railWorldSides = [...exposed];
      if (pt.railS !== undefined) {
        railS = pt.railS;
      } else if (prev !== undefined && next !== undefined) {
        railS = bendOuterRailSigns(
          cur.x - prev.x,
          cur.z - prev.z,
          next.x - cur.x,
          next.z - cur.z,
        );
      }
      break;
    case "concave_right_wall":
      type = "corner";
      railWorldSides = [...exposed];
      if (pt.railS !== undefined) {
        railS = pt.railS;
      } else if (prev !== undefined && next !== undefined) {
        railS = bendOuterRailSigns(
          cur.x - prev.x,
          cur.z - prev.z,
          next.x - cur.x,
          next.z - cur.z,
        );
      }
      break;
    default:
      type = "straight";
  }

  const out: GamePlacedTile = {
    type,
    gridX: cur.x,
    gridZ: cur.z,
    worldX: deck.x,
    // Only set worldY when non-zero (elevated tile) to keep flat levels unchanged.
    ...(deck.y !== 0 ? { worldY: deck.y } : {}),
    worldZ: deck.z,
    rotationY: pt.rotationY,
    ...(pt.stationIndex !== undefined ? { stationIndex: pt.stationIndex } : {}),
    ...(pt.tileType === "ramp_right_wall" || pt.tileType === "ramp_left_wall"
      ? { isRamp: true, hazardSafe: false }
      : {}),
    ...(type === "straight" &&
    pt.tileType !== "ramp_right_wall" &&
    pt.tileType !== "ramp_left_wall"
      ? { hazardSafe: true }
      : type !== "straight"
        ? { hazardSafe: false }
        : {}),
    ...(PROCGEN_TILE_TO_ASSET[pt.tileType]
      ? { assetKeyOverride: PROCGEN_TILE_TO_ASSET[pt.tileType] }
      : {}),
    ...(railWorldSides !== undefined ? { railWorldSides } : {}),
  };
  if (railS !== undefined) {
    out.railS = railS;
  }
  return out;
}

function buildProcgenSurface(map: GeneratedMap): CourseSurface {
  return {
    patches: map.tiles.map((pt) => {
      const def = getTileDefinition(pt.tileType);
      const deck = deckCenterWorldFromPivot(pt.position, pt.rotationY, def);
      if (pt.tileType === "ramp_right_wall" || pt.tileType === "ramp_left_wall") {
        return rampProcgenPatch(deck.x, deck.z, deck.y, pt.rotationY);
      }
      return flatProcgenPatch(deck.x, deck.z, deck.y, pt.rotationY);
    }),
  };
}

function progressionLevelFromDebug(map: GeneratedMap): number | undefined {
  const profile = map.debugInfo["progressionProfile"];
  if (!profile || typeof profile !== "object") return undefined;
  const level = (profile as { level?: unknown }).level;
  return typeof level === "number" ? level : undefined;
}

function validateAdaptedLevel(level: GeneratedLevel): void {
  if (level.surface.patches.length < level.tiles.length) {
    throw new Error("procgenLevelAdapter: missing surface patches");
  }
  if (!sampleCourseSurface(level.surface, level.startPosition.x, level.startPosition.z)) {
    throw new Error("procgenLevelAdapter: start position has no support");
  }
  if (!sampleCourseSurface(level.surface, level.holePosition.x, level.holePosition.z)) {
    throw new Error("procgenLevelAdapter: hole position has no support");
  }
  for (const rail of level.railColliders) {
    const finite =
      Number.isFinite(rail.ax) &&
      Number.isFinite(rail.az) &&
      Number.isFinite(rail.bx) &&
      Number.isFinite(rail.bz);
    const len = Math.hypot(rail.bx - rail.ax, rail.bz - rail.az);
    if (!finite || len < 0.001) {
      throw new Error("procgenLevelAdapter: invalid rail collider");
    }
  }
}

/**
 * Bridges procedural {@link GeneratedMap} into legacy {@link GeneratedLevel} for TileKit / physics.
 * Gameplay stays unaware of procgen details — swap this adapter or the endpoint later.
 */
export function adaptProcgenMapToGeneratedLevel(
  map: GeneratedMap,
  opts: ProcgenAdaptOptions,
): GeneratedLevel {
  const path = gridPathFromDebug(map);
  if (path.length !== map.tiles.length) {
    throw new Error("procgenLevelAdapter: gridPath length mismatch");
  }

  const tiles: GamePlacedTile[] = [];
  const occupied = new Set(path.map(keyCell));
  for (let i = 0; i < map.tiles.length; i++) {
    const cur = path[i];
    tiles.push(
      toGameplayTile(
        map.tiles[i],
        path[i - 1],
        cur,
        path[i + 1],
        exposedSides(cur, occupied),
      ),
    );
  }

  const progressionLevel = progressionLevelFromDebug(map);
  const hazardSpecs = generateHazardSpecs(
    progressionLevel ?? opts.levelIndex,
    tiles,
    opts.rng,
  );
  const surface = buildProcgenSurface(map);

  const bounds = {
    minX: map.cameraBounds.min.x,
    maxX: map.cameraBounds.max.x,
    minZ: map.cameraBounds.min.z,
    maxZ: map.cameraBounds.max.z,
  };

  const level: GeneratedLevel = {
    id: map.id,
    levelIndex: opts.levelIndex,
    difficultyScore: map.difficulty,
    targetDifficulty: opts.targetDifficultyRounded,
    imperfectDifficulty: map.imperfectDifficulty ? true : undefined,
    hazardSpecs,
    tiles,
    startPosition: {
      x: map.startPosition.x,
      y: map.startPosition.y,
      z: map.startPosition.z,
    },
    holePosition: {
      x: map.holePosition.x,
      y: map.holePosition.y,
      z: map.holePosition.z,
    },
    bounds,
    surface,
    procgenDebugInfo: map.debugInfo,
    procgenSeed: map.seed,
    progressionLevel,
    par: Math.max(2, Math.ceil((progressionLevel ?? opts.levelIndex) / 4) + 2),
    realmId: "sky_meadow",
    collectibles: [],
    railColliders: buildRailColliders(tiles),
  };
  validateAdaptedLevel(level);
  return level;
}
