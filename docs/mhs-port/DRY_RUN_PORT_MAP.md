# Dry-Run MHS Port Map

This is a planning map for a future Meta Horizon Studio / Horizon Engine port. It does not introduce MHS APIs. The web game remains the source of truth until the port starts.

## Buckets

| Bucket | Meaning | Current Source Areas |
| --- | --- | --- |
| `portable` | Keep as TypeScript/data-first source of truth for MHS consumption. | `src/core/math.ts`, `src/core/HoleSession.ts`, `src/level/GeneratedLevelV1.ts`, `src/hazards/HazardSimulationContract.ts`, `src/hazards/HazardRuntimeAdapter.ts`, `src/mhs/MhsSpawnManifest.ts`, `src/mhs/RenderWorldState.ts`, `src/mhs/PrefabRegistry.ts`, `src/mhs/GameEvents.ts`, procgen data contracts. |
| `web-adapter` | Keep for the current web build; future MHS replaces the adapter, not the portable contract. | `src/core/Game.ts`, browser platform services, DOM HUD/overlays, WebAudio, `DragShotInput`, `CameraOrbitInput`, Vite/browser boot code. |
| `web-debug-only` | Keep for web/editor QA only unless an MHS editor tool is intentionally designed later. | `ProcgenDebugViewer`, `DebugMapRenderer`, `SocketDebugHelpers`, procgen debug bootstrap, debug query/replay helpers. |
| `future-mhs-replacement` | Replace with MHS templates/components/systems during the port. | `LevelBuilder`, `TileKit`, Three hazard instance classes, `Ball`, `ShotEffects`, `AimIndicator`, `CollectibleController`, runtime GLB/FBX loading, Three materials and scene graph helpers. |
| `asset-pipeline` | Keep as planning/import metadata; MHS should use imported templates, not arbitrary runtime model loaders. | `scripts/compress-glb-textures.mjs`, `MHS_PREFAB_REGISTRY`, `MHS_ASSET_OPTIMIZATION_BACKLOG`, compressed GLB source files, future template/child-name contracts. |
| `exclude-from-mhs` | Do not package into the MHS runtime unless later promoted by a specific port decision. | Web fallback tile models, debug-only assets, browser UI art that MHS UI does not use, orphaned assets after `scene.bin` ownership is resolved. |

## Port Order

1. Lock portable contracts: `GeneratedLevelV1`, hazard contracts, `HoleSession` commands/events, prefab registry metadata, and render-world state.
2. Create the static MHS scene bootstrap: `GameRoot`, `GameplayManager`, `Camera`, `HudRoot`, `AudioHub`, and `PersistenceAnchor`.
3. Spawn imported templates from `MhsSpawnManifest` / `RenderWorldState` using stable `objectId` and `templateId`.
4. Wire gameplay/session updates: strokes, OOB recovery, skip flow, collectibles, hazard effects, completion, rewards, and telemetry intent.
5. Replace web adapters last: UI rendering, audio, persistence, input, debug config, and telemetry ownership.

## Rules

- Do not port `Game.ts`, `LevelBuilder`, or `TileKit` line by line.
- Do not recreate runtime GLB/FBX loading in MHS; use static imported templates.
- Keep debug viewers web/editor-only until an explicit MHS editor-tool plan exists.
- Keep Three.js inside the web adapter and rendering helpers; portable modules must stay engine-neutral.
- Resolve `scene.bin` before final packaging and place it in either `asset-pipeline` or `exclude-from-mhs`.
