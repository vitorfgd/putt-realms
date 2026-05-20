# Procgen output → prefab spawn recipe

Describes how procedural maps become instances you can recreate in **Meta Horizon** from data (templates + transforms), without relying on Three.js specifics.

Full generator rules: [`../PROCGEN.md`](../PROCGEN.md).

## Pipeline recap

1. `MapGenerationEndpoint.generateMap(GenerateMapRequest)` → `GeneratedMap`.
2. `validateGeneratedMap` gates layout/topology.
3. `adaptProcgenMapToGeneratedLevel` -> `GeneratedLevel` (`tiles`, `surface`, `railColliders`, hazard specs, ...).
4. `toGeneratedLevelV1` -> strict MHS interchange payload with debug maps removed.
5. `createProcgenCourseSpawnV1` -> first-slice MHS course payload: tiles, deck-center transforms, spawn policy, template calibrations, surface patches, and rail colliders only.
6. `createMhsSpawnManifest` -> prefab spawn intents keyed by `MHS_PREFAB_REGISTRY` without `TileKit` or Three scene objects.

## What to spawn (per hole)

For the first MHS slice, consume `ProcgenCourseSpawnV1` from `src/mhs/ProcgenCourseSpawnV1.ts`. It intentionally excludes hazards, collectibles, debug maps, and web-only procgen source maps.

Read `coordinateSystem` and `spawnPolicy` first:

- Set the MHS spawned entity root directly to `tiles[].position`.
- Apply `tiles[].rotationY` to that entity root as yaw around +Y.
- Do not apply asset pivot math in the spawner.
- Keep import scale, pitch, and visual pivot correction inside the MHS template child, normally under `VisualRoot`.

For each entry in `ProcgenCourseSpawnV1.tiles`:

| Data | Spawn use |
|------|-----------|
| `tileType` | Gameplay tag (start/hole/straight/corner/floor/...) |
| `position` | Entity **world position** (authoritative deck center) |
| `rotationY` | Entity yaw |
| `assetKey` / `templateId` | Select **which prefab/template** from catalog (`AssetKey`) |
| `isRamp` | Surface patch kind + mesh variant |
| `surfacePatchIndex` | Matching support patch in `surfacePatches[]` |
| `stationIndex` | Correlate with designer debug / hazard spacing |

Future MHS scripts should bind each logical `templateId` to a static `TemplateAsset` declaration and spawn through `WorldService.spawnTemplate`. Do not build template paths dynamically from arbitrary strings.

`templateCalibrations[]` is the checklist for that binding: each used tile template must keep `rootPolicy = deck-center`, `unitScale = 1` at the spawn contract level, +Z forward, +Y up, and required template children such as `VisualRoot` and `Collider`.

**Rails**: Use `ProcgenCourseSpawnV1.railColliders[]` as the authority for physics capsules in the first slice (regenerate only if MHS colliders must differ).

**Surface**: Instantiate supporting colliders/meshes from `surfacePatches[]` (`flat` vs `ramp` with `lowY`/`highY`).

`GeneratedMap.tiles[].deckPosition` is now the procgen source of truth for deck-center placement. `GeneratedMap.tiles[].position` remains the artist-pivot position for web/debug socket overlays only and should not be used for MHS spawning.

Before attaching visuals in MHS, spawn temporary markers at every `tiles[].position`. If the markers form the expected course, procgen survived the port and any mismatch is template calibration.

## Order and path semantics

- Adapter builds `tiles` in **`gridPath` order** aligned with `map.tiles.length` (validator enforces length match).
- **Start** is typically early indices; **hole** at end—for hazards, spawn uses **`tileIndex`** into this array (not grid coord alone).

## Hazards (`hazardSpecs`)

Generated in `generateHazardSpecs(levelIndex, tiles, rng)`:

- Only certain **`type === "straight"`** tiles with `hazardSafe !== false`, non-ramp, away from start/hole by station guard (`eligibleTileIndicesForHazards`).
- **`portal_gate`**: exactly **two** specs sharing `portalPairId`, distinct `portalRole` (`a`/`b`), spaced by tile index and **station index** gaps.

**Prefab recipe**: For each spec, spawn hazard prefab at `tiles[tileIndex]` deck pose (`railOrigin*` overrides if present). Portal pairs resolve partner tile at runtime from shared `portalPairId`. Use `src/mhs/PrefabRegistry.ts` as the current code-level key-to-prefab manifest and `src/mhs/MhsSpawnManifest.ts` as the pure projection from `GeneratedLevelV1` to spawn data.

Portable hazard behavior is described in `src/hazards/HazardSimulationContract.ts`. Current web hazard classes still mix visual meshes and runtime effects; the MHS port should implement the contract with MHS components/prefabs instead of translating Three hazard classes directly.

## Collectibles

`generateCollectibles` (PlayableLevelService) places coins relative to eligible tiles—spawn from `collectibles[]` positions.

## Debug / replay

- `procgenSeed` + `levelIndex` reproduces layout when running the same TS generator.
- **Web prototype:** the **`?procgenDebug`** URL mode runs the Three.js **ProcgenDebugViewer** (see [`../PROCGEN_DEBUG.md`](../PROCGEN_DEBUG.md)); there is no separate HTTP procgen API in-repo.
- `procgenDebugInfo` may include `gridPath`, `spinePath`, `progressionProfile`--useful for tooling; **do not** require unknown keys in MHE runtime. These fields are excluded from `GeneratedLevelV1`.

## AI-safe variation

Safe template-friendly changes:

- Swapping **themes** by mapping `AssetKey` → alternate prefab sets.
- Tuning **`GenerateMapRequest`** progression tables (length, curves, ramps) **in TS or data**—not by editing FBX topology with AI.

Unsafe:

- Letting an agent **re-layout sockets** on tile FBX without re-running full validation.

