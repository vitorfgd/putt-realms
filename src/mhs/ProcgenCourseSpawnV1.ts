import type { AssetKey } from "../art/AssetRegistry";
import type { Vec3Like } from "../core/math";
import type { GeneratedLevelV1 } from "../level/GeneratedLevelV1";
import type {
  CourseSurfacePatch,
  LevelWorldBounds,
  PlacedTile,
  RailCapsule,
} from "../level/LevelTypes";
import { MHS_PREFAB_REGISTRY } from "./PrefabRegistry";

export const PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID =
  "putt-realms.procgen-course-spawn.v1";

export const PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM = {
  handedness: "right-handed",
  upAxis: "+Y",
  forwardAxis: "+Z",
  yawAxis: "+Y",
  yawUnit: "radians",
  lengthUnit: "world-meter",
  positionSemantic: "deck-center",
} as const;

export const PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY = {
  entityRoot: "deck-center",
  positionSource: "tiles[].position",
  yawSource: "tiles[].rotationY",
  applyYawTo: "entity-root",
  scaleOwner: "mhs-template",
  visualPivotCorrectionOwner: "mhs-template-child",
  requiresAssetPivotMathInSpawner: false,
} as const;

export interface ProcgenTileSpawnV1 {
  id: string;
  objectId: string;
  tileIndex: number;
  tileType: PlacedTile["type"];
  assetKey: AssetKey;
  templateId: AssetKey;
  position: Vec3Like;
  rotationY: number;
  gridX: number;
  gridZ: number;
  stationIndex?: number;
  isRamp: boolean;
  surfacePatchIndex: number;
}

export interface ProcgenTemplateCalibrationV1 {
  assetKey: AssetKey;
  templateId: AssetKey;
  futureTemplatePath: string;
  rootPolicy: "deck-center";
  entityRootPosition: "tiles[].position";
  entityRootYaw: "tiles[].rotationY";
  expectedForwardAxis: "+Z";
  expectedUpAxis: "+Y";
  unitScale: 1;
  visualCorrectionOwner: "template-child";
  requiredChildNames: readonly string[];
}

export interface ProcgenCourseSpawnV1 {
  schemaId: typeof PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID;
  coordinateSystem: typeof PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM;
  spawnPolicy: typeof PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY;
  levelId: string;
  levelIndex: number;
  procgenSeed?: string;
  startPosition: Vec3Like;
  holePosition: Vec3Like;
  finishKind?: "hole" | "portal";
  bounds: LevelWorldBounds;
  tiles: ProcgenTileSpawnV1[];
  templateCalibrations: ProcgenTemplateCalibrationV1[];
  surfacePatches: CourseSurfacePatch[];
  railColliders: RailCapsule[];
}

function clonePatch(patch: CourseSurfacePatch): CourseSurfacePatch {
  return { ...patch };
}

function cloneRail(rail: RailCapsule): RailCapsule {
  return { ...rail };
}

function finiteVec3(v: Vec3Like): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function matchesCoordinateSystem(
  value: ProcgenCourseSpawnV1["coordinateSystem"] | undefined,
): boolean {
  return (
    value !== undefined &&
    value.handedness === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.handedness &&
    value.upAxis === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.upAxis &&
    value.forwardAxis === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.forwardAxis &&
    value.yawAxis === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.yawAxis &&
    value.yawUnit === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.yawUnit &&
    value.lengthUnit === PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.lengthUnit &&
    value.positionSemantic ===
      PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM.positionSemantic
  );
}

function matchesSpawnPolicy(
  value: ProcgenCourseSpawnV1["spawnPolicy"] | undefined,
): boolean {
  return (
    value !== undefined &&
    value.entityRoot === PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.entityRoot &&
    value.positionSource === PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.positionSource &&
    value.yawSource === PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.yawSource &&
    value.applyYawTo === PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.applyYawTo &&
    value.scaleOwner === PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.scaleOwner &&
    value.visualPivotCorrectionOwner ===
      PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.visualPivotCorrectionOwner &&
    value.requiresAssetPivotMathInSpawner ===
      PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY.requiresAssetPivotMathInSpawner
  );
}

function finiteBounds(bounds: LevelWorldBounds): boolean {
  return (
    Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.minZ) &&
    Number.isFinite(bounds.maxZ) &&
    bounds.maxX > bounds.minX &&
    bounds.maxZ > bounds.minZ
  );
}

function finitePatch(patch: CourseSurfacePatch): boolean {
  const baseFinite =
    Number.isFinite(patch.cx) &&
    Number.isFinite(patch.cz) &&
    Number.isFinite(patch.y) &&
    Number.isFinite(patch.halfWidth) &&
    Number.isFinite(patch.halfLength) &&
    Number.isFinite(patch.rotationY) &&
    patch.halfWidth > 0 &&
    patch.halfLength > 0;
  if (!baseFinite) return false;
  if (patch.kind === "ramp") {
    return Number.isFinite(patch.lowY) && Number.isFinite(patch.highY);
  }
  return patch.kind === "flat";
}

function makeTemplateCalibrations(
  tiles: readonly ProcgenTileSpawnV1[],
): ProcgenTemplateCalibrationV1[] {
  const seen = new Set<AssetKey>();
  const calibrations: ProcgenTemplateCalibrationV1[] = [];
  for (const tile of tiles) {
    if (seen.has(tile.templateId)) continue;
    seen.add(tile.templateId);
    const registry = MHS_PREFAB_REGISTRY[tile.templateId];
    calibrations.push({
      assetKey: tile.assetKey,
      templateId: tile.templateId,
      futureTemplatePath: registry.futureTemplatePath,
      rootPolicy: "deck-center",
      entityRootPosition: "tiles[].position",
      entityRootYaw: "tiles[].rotationY",
      expectedForwardAxis: registry.forwardAxis,
      expectedUpAxis: registry.upAxis,
      unitScale: registry.unitScale,
      visualCorrectionOwner: "template-child",
      requiredChildNames: [...registry.requiredChildNames],
    });
  }
  return calibrations;
}

export function createProcgenCourseSpawnV1(
  level: GeneratedLevelV1,
): ProcgenCourseSpawnV1 {
  if (level.surface.patches.length < level.tiles.length) {
    throw new Error("ProcgenCourseSpawnV1: missing surface patch for one or more tiles");
  }

  const course: ProcgenCourseSpawnV1 = {
    schemaId: PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID,
    coordinateSystem: PROCGEN_COURSE_SPAWN_V1_COORDINATE_SYSTEM,
    spawnPolicy: PROCGEN_COURSE_SPAWN_V1_SPAWN_POLICY,
    levelId: level.id,
    levelIndex: level.levelIndex,
    ...(level.procgenSeed ? { procgenSeed: level.procgenSeed } : {}),
    startPosition: { ...level.startPosition },
    holePosition: { ...level.holePosition },
    ...(level.finishKind ? { finishKind: level.finishKind } : {}),
    bounds: { ...level.bounds },
    tiles: level.tiles.map((tile, index) => {
      const assetKey = tile.assetKeyOverride ?? "tile_floor_plain";
      return {
        id: `tile-${index}`,
        objectId: `${level.id}:tile:${index}`,
        tileIndex: index,
        tileType: tile.type,
        assetKey,
        templateId: assetKey,
        position: {
          x: tile.worldX,
          y: tile.worldY ?? 0,
          z: tile.worldZ,
        },
        rotationY: tile.rotationY,
        gridX: tile.gridX,
        gridZ: tile.gridZ,
        ...(tile.stationIndex !== undefined ? { stationIndex: tile.stationIndex } : {}),
        isRamp: tile.isRamp === true,
        surfacePatchIndex: index,
      };
    }),
    templateCalibrations: [],
    surfacePatches: level.surface.patches.map(clonePatch),
    railColliders: level.railColliders.map(cloneRail),
  };
  course.templateCalibrations = makeTemplateCalibrations(course.tiles);

  assertProcgenCourseSpawnV1(course);
  return course;
}

export function assertProcgenCourseSpawnV1(value: ProcgenCourseSpawnV1): void {
  if (value.schemaId !== PROCGEN_COURSE_SPAWN_V1_SCHEMA_ID) {
    throw new Error("ProcgenCourseSpawnV1: invalid schemaId");
  }
  if (!matchesCoordinateSystem(value.coordinateSystem)) {
    throw new Error("ProcgenCourseSpawnV1: invalid coordinate system");
  }
  if (!matchesSpawnPolicy(value.spawnPolicy)) {
    throw new Error("ProcgenCourseSpawnV1: invalid spawn policy");
  }
  if (!value.tiles.length) {
    throw new Error("ProcgenCourseSpawnV1: tiles must not be empty");
  }
  if (value.surfacePatches.length < value.tiles.length) {
    throw new Error("ProcgenCourseSpawnV1: surface patches must cover tiles");
  }
  if (!Array.isArray(value.templateCalibrations) || !value.templateCalibrations.length) {
    throw new Error("ProcgenCourseSpawnV1: template calibrations must not be empty");
  }
  if (!finiteVec3(value.startPosition) || !finiteVec3(value.holePosition)) {
    throw new Error("ProcgenCourseSpawnV1: endpoints must be finite");
  }
  if (!finiteBounds(value.bounds)) {
    throw new Error("ProcgenCourseSpawnV1: bounds must be finite");
  }

  const calibrationByTemplate = new Map(
    value.templateCalibrations.map((calibration) => [
      calibration.templateId,
      calibration,
    ]),
  );
  for (const [index, tile] of value.tiles.entries()) {
    if (tile.tileIndex !== index) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} index drift`);
    }
    if (!tile.assetKey || !tile.templateId) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} missing template key`);
    }
    if (tile.templateId !== tile.assetKey) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} template drift`);
    }
    const registry = MHS_PREFAB_REGISTRY[tile.assetKey];
    if (!registry || registry.debugOnly || registry.pivotPolicy !== "deck-center") {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} has invalid template registry entry`);
    }
    if (!calibrationByTemplate.has(tile.templateId)) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} missing template calibration`);
    }
    if (!finiteVec3(tile.position) || !Number.isFinite(tile.rotationY)) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} has invalid transform`);
    }
    if (!Number.isInteger(tile.gridX) || !Number.isInteger(tile.gridZ)) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} has invalid grid cell`);
    }
    if (tile.surfacePatchIndex !== tile.tileIndex) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} surface patch drift`);
    }
    if (!value.surfacePatches[tile.surfacePatchIndex]) {
      throw new Error(`ProcgenCourseSpawnV1: tile ${tile.tileIndex} missing surface patch`);
    }
  }
  for (const calibration of value.templateCalibrations) {
    const registry = MHS_PREFAB_REGISTRY[calibration.templateId];
    if (!registry || calibration.assetKey !== calibration.templateId) {
      throw new Error("ProcgenCourseSpawnV1: invalid template calibration key");
    }
    if (
      calibration.rootPolicy !== "deck-center" ||
      calibration.entityRootPosition !== "tiles[].position" ||
      calibration.entityRootYaw !== "tiles[].rotationY" ||
      calibration.expectedForwardAxis !== "+Z" ||
      calibration.expectedUpAxis !== "+Y" ||
      calibration.unitScale !== 1 ||
      calibration.visualCorrectionOwner !== "template-child" ||
      calibration.futureTemplatePath !== registry.futureTemplatePath
    ) {
      throw new Error("ProcgenCourseSpawnV1: invalid template calibration");
    }
    for (const requiredChildName of registry.requiredChildNames) {
      if (!calibration.requiredChildNames.includes(requiredChildName)) {
        throw new Error("ProcgenCourseSpawnV1: missing required child contract");
      }
    }
  }
  for (const patch of value.surfacePatches) {
    if (!finitePatch(patch)) {
      throw new Error("ProcgenCourseSpawnV1: invalid surface patch");
    }
  }
  for (const rail of value.railColliders) {
    const finite =
      Number.isFinite(rail.ax) &&
      Number.isFinite(rail.az) &&
      Number.isFinite(rail.bx) &&
      Number.isFinite(rail.bz) &&
      (rail.yMin === undefined || Number.isFinite(rail.yMin)) &&
      (rail.yMax === undefined || Number.isFinite(rail.yMax)) &&
      (rail.yMin === undefined ||
        rail.yMax === undefined ||
        rail.yMax >= rail.yMin);
    const length = Math.hypot(rail.bx - rail.ax, rail.bz - rail.az);
    if (!finite || length <= 0) {
      throw new Error("ProcgenCourseSpawnV1: invalid rail collider");
    }
  }
}
