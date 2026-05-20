import type { AssetKey } from "../art/AssetRegistry";
import type { GeneratedLevelV1 } from "../level/GeneratedLevelV1";
import { HAZARD_KIND_TO_PREFAB_ASSET, MHS_PREFAB_REGISTRY } from "./PrefabRegistry";
import { createProcgenCourseSpawnV1 } from "./ProcgenCourseSpawnV1";
import type { CameraState, RenderWorldState, WorldObjectState } from "./RenderWorldState";
import { yawToQuat } from "./RenderWorldState";

export interface MhsSpawnTransform {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface MhsPrefabSpawn {
  id: string;
  prefab: string;
  assetKey: AssetKey;
  transform: MhsSpawnTransform;
  objectId: string;
  templateId: string;
}

export interface MhsLevelSpawnManifest {
  levelId: string;
  tiles: MhsPrefabSpawn[];
  hazards: MhsPrefabSpawn[];
  collectibles: MhsPrefabSpawn[];
}

export function createMhsSpawnManifest(level: GeneratedLevelV1): MhsLevelSpawnManifest {
  const courseSpawn = createProcgenCourseSpawnV1(level);
  return {
    levelId: level.id,
    tiles: courseSpawn.tiles.map((tile) => {
      const assetKey = tile.assetKey;
      return {
        id: tile.id,
        assetKey,
        prefab: MHS_PREFAB_REGISTRY[assetKey].mhsPrefab,
        objectId: tile.objectId,
        templateId: tile.templateId,
        transform: {
          x: tile.position.x,
          y: tile.position.y,
          z: tile.position.z,
          rotationY: tile.rotationY,
        },
      };
    }),
    hazards: level.hazardSpecs.map((hazard) => {
      const tile = level.tiles[hazard.tileIndex];
      if (!tile) {
        throw new Error(`MHS spawn manifest: hazard ${hazard.id} references missing tile ${hazard.tileIndex}`);
      }
      const assetKey = HAZARD_KIND_TO_PREFAB_ASSET[hazard.kind];
      return {
        id: hazard.id,
        assetKey,
        prefab: MHS_PREFAB_REGISTRY[assetKey].mhsPrefab,
        objectId: `${level.id}:hazard:${hazard.id}`,
        templateId: assetKey,
        transform: {
          x: hazard.portalSpawnWorldX ?? tile.railOriginX ?? tile.worldX,
          y: hazard.portalSpawnDeckY ?? tile.worldY ?? 0,
          z: hazard.portalSpawnWorldZ ?? tile.railOriginZ ?? tile.worldZ,
          rotationY: hazard.portalSpawnRotationY ?? tile.rotationY,
        },
      };
    }),
    collectibles: level.collectibles.map((collectible) => ({
      id: collectible.id,
      assetKey: "coin",
      prefab: MHS_PREFAB_REGISTRY.coin.mhsPrefab,
      objectId: `${level.id}:collectible:${collectible.id}`,
      templateId: "coin",
      transform: {
        x: collectible.x,
        y: collectible.y,
        z: collectible.z,
        rotationY: 0,
      },
    })),
  };
}

export function createRenderWorldState(level: GeneratedLevelV1): RenderWorldState {
  const manifest = createMhsSpawnManifest(level);
  return {
    levelId: level.id,
    camera: defaultCameraForLevel(level),
    objects: [
      ...manifest.tiles.map((spawn): WorldObjectState => spawnToWorldObject(spawn, ["tile", "course"])),
      ...manifest.hazards.map((spawn): WorldObjectState => spawnToWorldObject(spawn, ["hazard"])),
      ...manifest.collectibles.map((spawn): WorldObjectState => spawnToWorldObject(spawn, ["collectible"])),
    ],
  };
}

function spawnToWorldObject(
  spawn: MhsPrefabSpawn,
  tags: readonly string[],
): WorldObjectState {
  const registry = MHS_PREFAB_REGISTRY[spawn.assetKey];
  return {
    objectId: spawn.objectId,
    templateId: spawn.templateId,
    visible: true,
    lifetime: registry.lifetime,
    replication: registry.replication,
    tags,
    transform: {
      position: {
        x: spawn.transform.x,
        y: spawn.transform.y,
        z: spawn.transform.z,
      },
      rotation: yawToQuat(spawn.transform.rotationY),
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function defaultCameraForLevel(level: GeneratedLevelV1): CameraState {
  return {
    mode: "orbit",
    position: {
      x: level.startPosition.x,
      y: level.startPosition.y + 14,
      z: level.startPosition.z + 18,
    },
    target: level.holePosition,
    fovDeg: 48,
  };
}
