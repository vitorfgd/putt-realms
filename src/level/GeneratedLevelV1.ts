import type {
  CollectibleSpec,
  CourseSurface,
  GeneratedLevel,
  HazardSpawnSpec,
  LevelWorldBounds,
  PlacedTile,
  ProgressionSummary,
  RailCapsule,
} from "./LevelTypes";

export const GENERATED_LEVEL_V1_SCHEMA_ID = "putt-realms.generated-level.v1";

export interface GeneratedLevelV1 {
  schemaId: typeof GENERATED_LEVEL_V1_SCHEMA_ID;
  id: string;
  levelIndex: number;
  difficultyScore: number;
  targetDifficulty: number;
  imperfectDifficulty?: boolean;
  hazardSpecs: HazardSpawnSpec[];
  tiles: PlacedTile[];
  startPosition: { x: number; y: number; z: number };
  holePosition: { x: number; y: number; z: number };
  finishKind?: "hole" | "portal";
  bounds: LevelWorldBounds;
  surface: CourseSurface;
  procgenSeed?: string;
  progressionLevel?: number;
  par: number;
  realmId: string;
  progressionSummary?: ProgressionSummary;
  dailyChallengeId?: string;
  weeklyChallengeId?: string;
  collectibles: CollectibleSpec[];
  railColliders: RailCapsule[];
}

/**
 * Shipping/MHS payload projection. Debug-only maps and unknown procgen metadata stay out of v1.
 */
export function toGeneratedLevelV1(level: GeneratedLevel): GeneratedLevelV1 {
  return {
    schemaId: GENERATED_LEVEL_V1_SCHEMA_ID,
    id: level.id,
    levelIndex: level.levelIndex,
    difficultyScore: level.difficultyScore,
    targetDifficulty: level.targetDifficulty,
    ...(level.imperfectDifficulty !== undefined
      ? { imperfectDifficulty: level.imperfectDifficulty }
      : {}),
    hazardSpecs: level.hazardSpecs.map((spec) => ({ ...spec })),
    tiles: level.tiles.map((tile) => ({
      ...tile,
      ...(tile.railS ? { railS: { ...tile.railS } } : {}),
      ...(tile.railWorldSides
        ? { railWorldSides: tile.railWorldSides.map((side) => ({ ...side })) }
        : {}),
    })),
    startPosition: { ...level.startPosition },
    holePosition: { ...level.holePosition },
    ...(level.finishKind ? { finishKind: level.finishKind } : {}),
    bounds: { ...level.bounds },
    surface: {
      patches: level.surface.patches.map((patch) => ({ ...patch })),
    },
    ...(level.procgenSeed ? { procgenSeed: level.procgenSeed } : {}),
    ...(level.progressionLevel !== undefined
      ? { progressionLevel: level.progressionLevel }
      : {}),
    par: level.par,
    realmId: level.realmId,
    ...(level.progressionSummary
      ? {
          progressionSummary: {
            ...level.progressionSummary,
            milestoneLevels: [...level.progressionSummary.milestoneLevels],
          },
        }
      : {}),
    ...(level.dailyChallengeId ? { dailyChallengeId: level.dailyChallengeId } : {}),
    ...(level.weeklyChallengeId ? { weeklyChallengeId: level.weeklyChallengeId } : {}),
    collectibles: level.collectibles.map((collectible) => ({ ...collectible })),
    railColliders: level.railColliders.map((rail) => ({ ...rail })),
  };
}

export function assertGeneratedLevelV1(value: GeneratedLevelV1): void {
  if (value.schemaId !== GENERATED_LEVEL_V1_SCHEMA_ID) {
    throw new Error("GeneratedLevelV1: invalid schemaId");
  }
  if (!value.tiles.length) {
    throw new Error("GeneratedLevelV1: tiles must not be empty");
  }
  if (!value.surface.patches.length) {
    throw new Error("GeneratedLevelV1: surface patches must not be empty");
  }
  if (!Number.isFinite(value.startPosition.x) || !Number.isFinite(value.holePosition.z)) {
    throw new Error("GeneratedLevelV1: positions must be finite");
  }
}
