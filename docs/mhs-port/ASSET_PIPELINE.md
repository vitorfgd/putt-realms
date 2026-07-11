# Asset pipeline (FBX / GLB) — port checklist

Putt Realms loads authored meshes through a single web catalog: `src/art/AssetRegistry.ts` (`ASSET_FILENAMES`, `AssetKey`). The MHS-facing prefab registry lives in `src/mhs/PrefabRegistry.ts`; first-slice procgen course spawns are emitted by `src/mhs/ProcgenCourseSpawnV1.ts`, and broader prefab intents remain in `src/mhs/MhsSpawnManifest.ts`.

## Path convention (web build)

- Deploy under **`public/assets/models/`** (Vite serves as site root `assets/models/`).
- Keys map to filenames in `ASSET_FILENAMES`; missing files log a warning and gameplay falls back where coded (tiles/procedural slabs, hazard primitives).

## FBX vs GLB

- For keys whose filename ends in **`.fbx`**, the loader tries **FBX first**, then the **same basename with `.glb`** (`AssetRegistry.loadOne`).
- Other keys default to a single GLB/GLTF URL (see `hole_flag` special cases).

**MHE**: Prefer studio-imported assets once; keep **the same logical key** in `MHS_PREFAB_REGISTRY` so the spawner reads `AssetKey` names instead of web file URLs. The registry now includes size, bundle, required/optional status, debug-only, pivot policy, footprint, optimization status, future prefab name, future static template path, collision intent, replication intent, pooling/lifetime intent, required child names, and replacement notes so runtime and debug assets can split cleanly.

Future template paths must be static declarations in the MHS project. Do not construct `TemplateAsset` paths dynamically from arbitrary strings.

## Pivot and footprint (procgen tiles)

Authoring rules are documented in [`../PROCGEN.md`](../PROCGEN.md) (artist pivot, socket directions, `TILE_LENGTH` / `TILE_WIDTH`).

Summary:

- Tile art aligns to **`TileCatalog`** footprints and pivot offsets; wrong pivots break socket continuity and rail placement.
- `GeneratedMap.tiles[].deckPosition` is the authoritative course tile spawn position; artist pivots are a web/debug compatibility detail.
- In MHS, the template entity root should be the deck center. Imported mesh scale, pitch, and pivot offsets should be applied to children under the template, not to the procgen spawn transform.
- Current procgen tile prefab metadata records the source grass base as **200 x 200**, with walls outside the base.
- Procgen scales models using `procgenModelScale` helpers--do not assume Blender units match world units without checking that pipeline.

## Hazard meshes

Hazards (`src/hazards/implementations.ts`) assume:

- Placement at **deck center** xz (+ optional `worldY` for elevated lanes).
- Local forward/right derived from `rotationY` (`tileBasis`).
- Optional GLB nodes by name (e.g. windmill arm, axe blade) for animation/hit zones.

New hazards should document **expected mesh origin** and **collision approximation** in this file when adding keys.

## Asset QA checklist (before marking port-ready)

1. **Catalog**: Every spawn path has an `AssetKey` (or intentional fallback).
2. **Pivot**: Deck center matches `ProcgenCourseSpawnV1.tiles[].position` / `PlacedTile.worldX/Y/Z` expectations after rotation.
3. **Scale**: Bounding box matches footprint after `scaleProcgenModelToWorldUnits` (procgen) or manual baseline in MHE.
4. **Normals / facing**: Entry/exit face +Z local fairway where applicable.
5. **Materials**: Single-file GLB preferred for Quickplay size constraints later; external `.bin` paths avoided.
6. **Naming stability**: Renaming `ASSET_FILENAMES` entries requires updating **prefab mapping** and any saved level manifests.
7. **Registry test**: `src/mhs/PrefabRegistry.test.ts` verifies required files, hazard mappings, size/bundle/pivot/footprint metadata, replication/lifetime/collision metadata, child-name contracts, large-asset notes, the optimization backlog, and procgen grass-base metadata.

## Current large asset red flags

The current `public/assets/**` scan is **18.20 MB** before platform packaging overhead, after the Balanced 1024 texture compression pass. Before compression, these six GLBs were **18,695,732 bytes** total; after compression they are **1,681,960 bytes**, saving **17,013,772 bytes**.

These assets remain tracked in `MHS_ASSET_OPTIMIZATION_BACKLOG` until visual review confirms the 1024px textures are acceptable:

| Asset key | File | Current size |
| --- | --- | --- |
| `hazard_fan` | `fan.glb` | 289,616 bytes |
| `coin` | `collectible_crown_coin.glb` | 339,292 bytes |
| `hazard_portal_gate` | `hazard_portal_gate.glb` | 268,320 bytes |
| `hazard_bumper_mushroom` | `hazard_bumper_mushroom.glb` | 257,492 bytes |
| `hazard_windmill` | `windmill.glb` | 339,492 bytes |
| `hazard_sandpit` | `hazard_sandpit.glb` | 187,748 bytes |

The code-level backlog is `MHS_ASSET_OPTIMIZATION_BACKLOG`; it also tracks `scene.bin` until ownership/reference status is confirmed. Re-run `npm run compress:models` if the original 2048px embedded textures are restored or replaced.

## Art output targets for MHS

- One **prefab/template per logical variant** (straight, convex corner, ramp pair, each hazard).
- Each course tile template keeps `VisualRoot` and `Collider` children and a deck-center root; use `ProcgenCourseSpawnV1.templateCalibrations[]` as the binding checklist.
- Avoid runtime mesh booleans or AI-generated topology for course tiles; keep variation in **transform + data** ([`PROCGEN_AND_PREFABS.md`](./PROCGEN_AND_PREFABS.md)).
- Treat AI-generated meshes as candidate assets until Studio import, `:template` creation, scale/pivot/collision review, child-name verification, and runtime readability checks are complete.
