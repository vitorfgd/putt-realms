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
import { generateHazardSpecs } from "./generateHazardSpecs";
import type { GeneratedLevel, PlacedTile as GamePlacedTile } from "./LevelTypes";
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

function toGameplayTile(
  pt: ProcgenTile,
  prev: GridCell | undefined,
  cur: GridCell,
  next: GridCell | undefined,
): GamePlacedTile {
  const def = getTileDefinition(pt.tileType);
  const deck = deckCenterWorldFromPivot(pt.position, pt.rotationY, def);

  let type: GamePlacedTile["type"];
  let railS: GamePlacedTile["railS"];

  switch (pt.tileType) {
    case "start_placeholder":
      type = "start";
      break;
    case "hole_placeholder":
      type = "hole";
      break;
    case "straight_right_wall":
    case "ramp_right_wall":
    case "ramp_left_wall":
      type = "straight";
      break;
    case "floor_plain":
      type = "floor";
      break;
    case "convex_right_wall":
      type = "corner";
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
    ...(pt.tileType !== "floor_plain" && PROCGEN_TILE_TO_ASSET[pt.tileType]
      ? { assetKeyOverride: PROCGEN_TILE_TO_ASSET[pt.tileType] }
      : {}),
  };
  if (railS !== undefined) {
    out.railS = railS;
  }
  return out;
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
  for (let i = 0; i < map.tiles.length; i++) {
    tiles.push(
      toGameplayTile(map.tiles[i], path[i - 1], path[i], path[i + 1]),
    );
  }

  const hazardSpecs = generateHazardSpecs(opts.levelIndex, tiles, opts.rng);

  const bounds = {
    minX: map.cameraBounds.min.x,
    maxX: map.cameraBounds.max.x,
    minZ: map.cameraBounds.min.z,
    maxZ: map.cameraBounds.max.z,
  };

  return {
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
    railColliders: buildRailColliders(tiles),
  };
}
