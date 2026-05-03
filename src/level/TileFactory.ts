/**
 * Facade for tile mesh construction. Visuals resolve optional GLB models via
 * {@link ../art/AssetRegistry.assetRegistry} inside `tiles/TileKit.ts` (no gameplay coupling).
 */
export { buildTileGroup as buildTileMesh } from "./tiles/TileKit";
export { assetRegistry } from "../art/AssetRegistry";
