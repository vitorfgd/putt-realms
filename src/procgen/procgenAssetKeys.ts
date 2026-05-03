import * as THREE from "three";
import type { AssetKey } from "../art/AssetRegistry";
import type { TileType } from "./MapGenerationTypes";
import { getTileDefinition } from "./TileCatalog";

/**
 * One registry key per procgen {@link TileType} — filenames live in `public/assets/models/`
 * (see {@link ASSET_FILENAMES}).
 */
export const PROCGEN_TILE_TO_ASSET: Partial<Record<TileType, AssetKey>> = {
  straight_right_wall: "tile_straight_rw",
  floor_plain: "tile_floor_plain",
  convex_right_wall: "tile_convex_rw",
  concave_right_wall: "tile_concave_rw",
  ramp_right_wall: "tile_ramp_rw",
  ramp_left_wall: "tile_ramp_lw",
  start_placeholder: "tile_start_ph",
  hole_placeholder: "tile_hole_ph",
};

/** Preload these before gameplay so procgen tiles never fall back to legacy meshes mid-load. */
export const PROCGEN_PRELOAD_KEYS: readonly AssetKey[] = Object.values(
  PROCGEN_TILE_TO_ASSET,
) as AssetKey[];

/** Deck → artist pivot in unrotated tile space; applied as child offset under the deck root (see TileKit). */
export function procgenPivotOffsetForAssetKey(
  assetKey: AssetKey,
): THREE.Vector3 | null {
  for (const [tileType, key] of Object.entries(
    PROCGEN_TILE_TO_ASSET,
  ) as [TileType, AssetKey][]) {
    if (key === assetKey) {
      return getTileDefinition(tileType).pivotOffsetFromDeckOrigin.clone();
    }
  }
  return null;
}
