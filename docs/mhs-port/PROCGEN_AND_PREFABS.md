# Procgen output → prefab spawn recipe

Describes how procedural maps become instances you can recreate in **Meta Horizon** from data (templates + transforms), without relying on Three.js specifics.

Full generator rules: [`../PROCGEN.md`](../PROCGEN.md).

## Pipeline recap

1. `MapGenerationEndpoint.generateMap(GenerateMapRequest)` → `GeneratedMap`.
2. `validateGeneratedMap` gates layout/topology.
3. `adaptProcgenMapToGeneratedLevel` → `GeneratedLevel` (`tiles`, `surface`, `railColliders`, hazard specs, …).

## What to spawn (per hole)

For each entry in `GeneratedLevel.tiles` (`PlacedTile`):

| Data | Spawn use |
|------|-----------|
| `type` | Gameplay tag (start/hole/straight/corner/floor/…) |
| `worldX`, `worldY?`, `worldZ` | Entity **world position** (deck center) |
| `rotationY` | Entity yaw |
| `assetKeyOverride` | Select **which prefab** from catalog (`AssetKey`) |
| `isRamp` | Surface patch kind + mesh variant |
| `railWorldSides` / `railS` | Rail capsule generation (already resolved in `railColliders` for physics) |
| `stationIndex` | Correlate with designer debug / hazard spacing |

**Rails**: Use precomputed `railColliders[]` as the authority for physics capsules in port (regenerate only if MHE colliders must differ).

**Surface**: Instantiate supporting colliders/meshes from `surface.patches[]` (`flat` vs `ramp` with `lowY`/`highY`).

## Order and path semantics

- Adapter builds `tiles` in **`gridPath` order** aligned with `map.tiles.length` (validator enforces length match).
- **Start** is typically early indices; **hole** at end—for hazards, spawn uses **`tileIndex`** into this array (not grid coord alone).

## Hazards (`hazardSpecs`)

Generated in `generateHazardSpecs(levelIndex, tiles, rng)`:

- Only certain **`type === "straight"`** tiles with `hazardSafe !== false`, non-ramp, away from start/hole by station guard (`eligibleTileIndicesForHazards`).
- **`portal_gate`**: exactly **two** specs sharing `portalPairId`, distinct `portalRole` (`a`/`b`), spaced by tile index and **station index** gaps.

**Prefab recipe**: For each spec, spawn hazard prefab at `tiles[tileIndex]` deck pose (`railOrigin*` overrides if present). Portal pairs resolve partner tile at runtime from shared `portalPairId`.

## Collectibles

`generateCollectibles` (PlayableLevelService) places coins relative to eligible tiles—spawn from `collectibles[]` positions.

## Debug / replay

- `procgenSeed` + `levelIndex` reproduces layout when running the same TS generator.
- **Web prototype:** the **`?procgenDebug`** URL mode runs the Three.js **ProcgenDebugViewer** (see [`../PROCGEN_DEBUG.md`](../PROCGEN_DEBUG.md)); there is no separate HTTP procgen API in-repo.
- `procgenDebugInfo` may include `gridPath`, `spinePath`, `progressionProfile`—useful for tooling; **do not** require unknown keys in MHE runtime.

## AI-safe variation

Safe template-friendly changes:

- Swapping **themes** by mapping `AssetKey` → alternate prefab sets.
- Tuning **`GenerateMapRequest`** progression tables (length, curves, ramps) **in TS or data**—not by editing FBX topology with AI.

Unsafe:

- Letting an agent **re-layout sockets** on tile FBX without re-running full validation.
