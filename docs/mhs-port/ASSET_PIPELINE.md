# Asset pipeline (FBX / GLB) — port checklist

Putt Realms loads authored meshes through a single catalog: `src/art/AssetRegistry.ts` (`ASSET_FILENAMES`, `AssetKey`).

## Path convention (web build)

- Deploy under **`public/assets/models/`** (Vite serves as site root `assets/models/`).
- Keys map to filenames in `ASSET_FILENAMES`; missing files log a warning and gameplay falls back where coded (tiles/procedural slabs, hazard primitives).

## FBX vs GLB

- For keys whose filename ends in **`.fbx`**, the loader tries **FBX first**, then the **same basename with `.glb`** (`AssetRegistry.loadOne`).
- Other keys default to a single GLB/GLTF URL (see `hole_flag` special cases).

**MHE**: Prefer studio-imported assets once; keep **the same logical key** in a manifest your spawner reads (mirror `AssetKey` names).

## Pivot and footprint (procgen tiles)

Authoring rules are documented in [`../PROCGEN.md`](../PROCGEN.md) (artist pivot, socket directions, `TILE_LENGTH` / `TILE_WIDTH`).

Summary:

- Tile art aligns to **`TileCatalog`** footprints and pivot offsets; wrong pivots break socket continuity and rail placement.
- Procgen scales models using `procgenModelScale` helpers—do not assume Blender units match world units without checking that pipeline.

## Hazard meshes

Hazards (`src/hazards/implementations.ts`) assume:

- Placement at **deck center** xz (+ optional `worldY` for elevated lanes).
- Local forward/right derived from `rotationY` (`tileBasis`).
- Optional GLB nodes by name (e.g. windmill arm, axe blade) for animation/hit zones.

New hazards should document **expected mesh origin** and **collision approximation** in this file when adding keys.

## Asset QA checklist (before marking port-ready)

1. **Catalog**: Every spawn path has an `AssetKey` (or intentional fallback).
2. **Pivot**: Deck center matches `PlacedTile.worldX/Y/Z` expectations after rotation.
3. **Scale**: Bounding box matches footprint after `scaleProcgenModelToWorldUnits` (procgen) or manual baseline in MHE.
4. **Normals / facing**: Entry/exit face +Z local fairway where applicable.
5. **Materials**: Single-file GLB preferred for Quickplay size constraints later; external `.bin` paths avoided.
6. **Naming stability**: Renaming `ASSET_FILENAMES` entries requires updating **prefab mapping** and any saved level manifests.

## Art output targets for MHS

- One **prefab/template per logical variant** (straight, convex corner, ramp pair, each hazard).
- Avoid runtime mesh booleans or AI-generated topology for course tiles; keep variation in **transform + data** ([`PROCGEN_AND_PREFABS.md`](./PROCGEN_AND_PREFABS.md)).
