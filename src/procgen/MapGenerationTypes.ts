import type { MutableVec3, Vec3Like } from "../core/math";

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

/** Plain object compatible with bounds calculations and renderer adapters. */
export interface Box3Like {
  min: Vec3Like;
  max: Vec3Like;
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

/**
 * Snapshot of the last {@link GenerateMapRequest} sent to the procgen endpoint (in-game or equivalent),
 * stored under {@link GeneratedLevel.procgenDebugInfo} `endpointReplay` for QA / external replay.
 */
export type ProcgenEndpointReplayPayload = Pick<
  GenerateMapRequest,
  | "seed"
  | "levelIndex"
  | "targetDifficulty"
  | "maxTiles"
  | "allowRamps"
  | "allowCurves"
> & { layout?: ProcgenLayoutMode };

export interface Footprint {
  /** Half-extent along local X (right of lane). */
  halfWidth: number;
  /** Half-extent along local Z (forward). */
  halfLength: number;
}

export interface PlacedTile {
  id: string;
  tileType: TileType;
  position: MutableVec3;
  rotationY: number;
  anchor: MutableVec3;
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
  startPosition: MutableVec3;
  holePosition: MutableVec3;
  cameraBounds: Box3Like;
  imperfectDifficulty: boolean;
  /** Links between disconnected playable pieces. */
  portalLinks?: PortalLink[];
  /** When set, this supported tile hosts the final level-completion portal. */
  finishPortalTileIndex?: number;
  finishKind?: "hole" | "portal";
  debugInfo: Record<string, unknown>;
}
