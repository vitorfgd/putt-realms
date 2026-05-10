import type { Vector3 } from "three";

/**
 * Cardinal sockets in **tile-local** space before `rotationY` is applied.
 * Local fairway runs toward {@link SocketDirection.PosZ} (+Z). Entry is normally from {@link SocketDirection.NegZ}.
 */
export enum SocketDirection {
  PosZ = 0,
  PosX = 1,
  NegZ = 2,
  NegX = 3,
}

export type TileType =
  | "straight_right_wall"
  | "convex_right_wall"
  | "concave_right_wall"
  | "ramp_right_wall"
  | "ramp_left_wall"
  | "floor_plain"
  | "start_placeholder"
  | "hole_placeholder"
  /** Finish-style cap mesh for portal dead ends — gameplay is straight deck, not a hole. */
  | "dead_end_cap";

/** Plain object compatible with THREE.Box3 `min` / `max`. */
export interface Box3Like {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/** `double_row_straight` = two parallel lanes (wall out on each side), straights only for now. */
export type ProcgenLayoutMode = "single_path" | "double_row_straight";

export interface GenerateMapRequest {
  seed: string;
  levelIndex: number;
  targetDifficulty: number;
  maxTiles: number;
  allowRamps: boolean;
  allowCurves: boolean;
  /**
   * Map topology. Default `double_row_straight` — two rows of tiles per forward step
   * (right row: wall on the right; left row: same piece rotated 180° so the wall faces left).
   */
  layout?: ProcgenLayoutMode;
}

export interface Footprint {
  /** Half-extent along local X (right of lane). */
  halfWidth: number;
  /** Half-extent along local Z (forward). */
  halfLength: number;
}

export interface PlacedTile {
  id: string;
  tileType: TileType;
  position: Vector3;
  rotationY: number;
  anchor: Vector3;
  entrySocket: SocketDirection;
  exitSocket: SocketDirection;
  modelKey: string;
  /** Optional fallback rail/collider orientation for curved procgen tiles. */
  railS?: { sx: 1 | -1; sz: 1 | -1 };
  /** Centerline station that emitted this physical cell. */
  stationIndex?: number;
}

export interface PortalLink {
  id: string;
  fromTileIndex: number;
  toTileIndex: number;
}

export interface GeneratedMap {
  id: string;
  seed: string;
  levelIndex: number;
  difficulty: number;
  tiles: PlacedTile[];
  startPosition: Vector3;
  holePosition: Vector3;
  cameraBounds: Box3Like;
  imperfectDifficulty: boolean;
  /** Links between disconnected playable pieces. */
  portalLinks?: PortalLink[];
  /** When set, this supported tile hosts the final level-completion portal. */
  finishPortalTileIndex?: number;
  finishKind?: "hole" | "portal";
  debugInfo: Record<string, unknown>;
}
