/**
 * Visual scale for the 1-unit logical grid.
 * Replace meshes later while keeping these contracts stable.
 */
export const TILE_SIZE = 6;
/** Wider playable strip — rails/deck scale from this */
export const LANE_WIDTH = 6.65;
export const RAIL_HEIGHT = 0.6;
export const RAIL_THICKNESS = 0.35;

export const LANE_HALF_WIDTH = LANE_WIDTH / 2;

/** Cup radius scales with lane width for readability */
export function holeCupRadius(): number {
  return LANE_WIDTH * 0.18;
}
