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
  /** World-space origin for this tile's root group: lane / deck center on xz (legacy + procgen). */
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
  /** Procgen station index; useful when several physical cells belong to one centerline step. */
  stationIndex?: number;
  /** True for ramp meshes adapted as straight gameplay tiles. */
  isRamp?: boolean;
  /** False for ramps, caps, elbows, and other tiles hazards should not occupy. */
  hazardSafe?: boolean;
  /** Corner / curve: outer rail offset signs in tile-local space (see bendOuterRails). */
  railS?: { sx: 1 | -1; sz: 1 | -1 };
  /**
   * When set (procgen levels), {@link buildTileGroup} loads this registry asset first
   * so distinct meshes (straight vs ramp, convex vs concave) are preserved.
   */
  assetKeyOverride?: AssetKey;
}

/** Axis-aligned playable bounds in world space (xz), for camera framing and legacy fallback. */
export interface LevelWorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Wood rail centerline in world xz: capsule collision in physics (matches TileKit). */
export interface RailCapsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Vertical band where this rail can collide with the ball. */
  yMin?: number;
  yMax?: number;
}

export interface CourseSurfacePatch {
  kind: "flat" | "ramp";
  cx: number;
  cz: number;
  y: number;
  halfWidth: number;
  halfLength: number;
  rotationY: number;
  /** Ramp only: height at local -Z. */
  lowY?: number;
  /** Ramp only: height at local +Z. */
  highY?: number;
}

export interface CourseSurface {
  patches: CourseSurfacePatch[];
}

export interface GeneratedLevel {
  id: string;
  levelIndex: number;
  /** Computed integer difficulty 0-10 */
  difficultyScore: number;
  /** Rounded target used for +/-1 matching */
  targetDifficulty: number;
  /** True when no candidate landed within +/-1 after max attempts */
  imperfectDifficulty?: boolean;
  hazardSpecs: HazardSpawnSpec[];
  tiles: PlacedTile[];
  startPosition: { x: number; y: number; z: number };
  holePosition: { x: number; y: number; z: number };
  bounds: LevelWorldBounds;
  /** Actual playable support. Missing support is void, even when inside camera bounds. */
  surface: CourseSurface;
  /** Procgen replay/report metadata, intentionally loose so debug payloads can evolve. */
  procgenDebugInfo?: Record<string, unknown>;
  procgenSeed?: string;
  progressionLevel?: number;
  /** Procedural cream rails: ball collides, cannot pass through. */
  railColliders: RailCapsule[];
}
