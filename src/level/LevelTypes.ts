import type { AssetKey } from "../art/AssetRegistry";
import type { HazardKind } from "../hazards/HazardTypes";

export type TileType = "start" | "straight" | "floor" | "curve" | "corner" | "hole";

export interface HazardSpawnSpec {
  id: string;
  kind: HazardKind;
  tileIndex: number;
  weight: number;
  /** Only for fan kind */
  fanSign?: 1 | -1;
}

/** Cardinal directions on the logical grid (+Z forward default). */
export enum GridDir {
  N = 0,
  E = 1,
  S = 2,
  W = 3,
}

export interface PlacedTile {
  type: TileType;
  /** Logical grid cell (integer coordinates). */
  gridX: number;
  gridZ: number;
  /** World-space origin for this tile's root group — lane / deck center on xz (legacy + procgen). */
  worldX: number;
  /** World-space Y for this tile's root group. Non-zero for elevated tiles (e.g. tiles after a ramp). */
  worldY?: number;
  worldZ: number;
  /**
   * Override rail/hazard origin when it must differ from {@link worldX}/{@link worldZ} (unused in current procgen).
   */
  railOriginX?: number;
  railOriginZ?: number;
  /** Rotation around Y so geometry aligns with path (radians). */
  rotationY: number;
  /** Corner / curve: outer rail offset signs in tile-local space (see bendOuterRails). */
  railS?: { sx: 1 | -1; sz: 1 | -1 };
  /**
   * When set (procgen levels), {@link buildTileGroup} loads this registry asset first
   * so distinct meshes (straight vs ramp, convex vs concave) are preserved.
   */
  assetKeyOverride?: AssetKey;
}

/** Axis-aligned playable bounds in world space (xz), for physics clamping. */
export interface LevelWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Wood rail centerline in world xz — capsule collision in physics (matches TileKit). */
export interface RailCapsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface GeneratedLevel {
  id: string;
  levelIndex: number;
  /** Computed integer difficulty 0–10 */
  difficultyScore: number;
  /** Rounded target used for ±1 matching */
  targetDifficulty: number;
  /** True when no candidate landed within ±1 after max attempts */
  imperfectDifficulty?: boolean;
  hazardSpecs: HazardSpawnSpec[];
  tiles: PlacedTile[];
  startPosition: { x: number; y: number; z: number };
  holePosition: { x: number; y: number; z: number };
  bounds: LevelWorldBounds;
  /** Procedural cream rails — ball collides, cannot pass through */
  railColliders: RailCapsule[];
}
