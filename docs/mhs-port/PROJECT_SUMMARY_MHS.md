# Putt Realms — project summary (port-facing)

Abstract overview for engineers planning a **Meta Horizon Engine** port. This document avoids Three.js API detail; see [`THREE_TO_MHE_MAPPING.md`](./THREE_TO_MHE_MAPPING.md) for conceptual mapping.

## High-level pitch

- **Genre**: Fantasy mini-golf / putt progression.
- **Core loop**: Load hole → aim drag-shot → ball rolls with friction, ramps, rails, hazards → sink in cup or OOB/restart → advance level index, coins/economy hooks.
- **Session**: Skill-based putting; portrait-friendly camera framing is already a concern for procgen (`MAX_PORTRAIT_GRID_SPAN` in generation).

## Runtime architecture (web prototype)

| Concern | Primary locations | Port note |
|---------|-------------------|-----------|
| Bootstrap | `src/main.ts` | Replace DOM canvas/HUD bootstrap with MHE world entry / UI stack |
| Game loop | `src/core/Game.ts` | Phases (preview camera, ball flight, hole complete, OOB). Maps to components + services + events in MHE |
| Level source | `src/core/PlayableLevelService.ts` | Builds `GeneratedPlayableLevel`: procgen endpoint vs legacy flag (`USE_PROCGEN_ENDPOINT`) |
| Procgen | `src/procgen/MapGenerationEndpoint.ts` | Pure TS: seed → `GeneratedMap` → validated |
| Procgen QA viewer | `src/procgen/bootstrapProcgenDebug.ts`, `ProcgenDebugViewer.ts` | Optional **`?procgenDebug`** URL mode in `main.ts`; doc: [`../PROCGEN_DEBUG.md`](../PROCGEN_DEBUG.md) |
| Gameplay bridge | `src/level/procgenLevelAdapter.ts` | `GeneratedMap` → `GeneratedLevel` (tiles, surface, rails, hazards specs) |
| Level assembly | `src/level/LevelBuilder.ts`, `TileKit` | Spawns visuals / rails from `PlacedTile` |
| Ball physics | `src/gameplay/SimpleBallPhysics.ts` | Planar + gravity + **course surface sampling** + rail capsules |
| Hazards | `src/hazards/*`, `src/level/generateHazardSpecs.ts` | Spec-driven instances; axial tests in tile space |
| Input | `src/input/DragShotInput.ts` | Drag on plane → shot vector; replace with MHE pointer / laser input |
| Audio / FX | `src/platform-browser/GameAudio.ts`, `src/core/Game.ts` hooks | Event-driven; rebind to MHE audio |
| Economy / telemetry | `src/economy/*`, `src/progression/TelemetryService.ts` | Local persistence patterns; MHE may use services + cloud |

## Data flow for a playable hole

1. **Request**: Level index + optional previous difficulty → `PlayableLevelService` chooses procgen config (progression cap 20, max tiles, curves/ramps gates).
2. **Generate**: `mapGenerationEndpoint.generateMap({ seed, levelIndex, targetDifficulty, maxTiles, allowRamps, allowCurves })` → `GeneratedMap`.
3. **Validate**: `validateGeneratedMap` (`src/procgen/GeneratedMapValidator.ts`).
4. **Adapt**: `adaptProcgenMapToGeneratedLevel` produces `GeneratedLevel` (legacy tile list, `CourseSurface`, `railColliders`, `hazardSpecs`, collectibles RNG).
5. **Present**: `Game.loadLevel` builds Three scene; physics gets `surface` + rails.

For MHE: steps 1–4 are largely **engine-independent** if you preserve the **data contracts** ([`DATA_CONTRACTS.md`](./DATA_CONTRACTS.md)). Step 5 becomes **prefab/template instantiation** + native or custom physics aligned with the same contracts.

## Progression and realms

- Level index clamps and realm metadata are computed in `PlayableLevelService` (`realmForProgression`).
- Par, turn count, ramp count feed HUD and telemetry.
- Current Studio runtime progression also includes a three-game treasure chest loop. On unlock, the chest grants a tunable `40` coin reward, resets progress, and animates coins into the summary coin badge.

## Current Studio runtime UI notes (2026-05-26)

- Run summary displays `LEVEL X`, compact stat rows, live coin balance using `hud_topbar_coins.png`, treasure chest progress/unlock, and `NEXT LEVEL LOADING` / `NEXT LEVEL READY`.
- Store coin totals also use `hud_topbar_coins.png`; avoid reintroducing a separate coin icon next to the text.
- Yip appears as FTUE/dialogue art, gameplay tips, initial loading logo peeks, and run summary peeks. Keep reactions sparse in gameplay so Yip feels special rather than noisy.
- The opening route overview is intentionally slower and wider than gameplay camera: `1.15s` preview plus a temporary FOV boost.
- See [`RUNTIME_UPDATE_2026-05-26.md`](./RUNTIME_UPDATE_2026-05-26.md) for the detailed dated snapshot.

## Explicit non-goals for this summary

- Networking / multiplayer semantics (prototype is single-player web).
- Exact shader or material parity (art pipeline in [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md)).

## Next steps for an MHE project lead

1. Freeze **level JSON shape** (subset of `GeneratedLevel`) for spawning.
2. Author **one prefab per `AssetKey`** (or grouped variants) with transforms driven by `PlacedTile`.
3. Implement **surface + rails** in MHE physics/collision to match `CourseSurfacePatch` + `RailCapsule` semantics.
4. Port **hazard behaviors** as isolated modules keyed by `HazardKind`.
