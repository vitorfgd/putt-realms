# Three.js Inventory And MHS Port Risk Register

Last refreshed: 2026-05-15.

This file lists current Three.js usage by porting concern. Anything in this document is expected to be replaced, wrapped, or moved behind an adapter for Meta Horizon Studio / Horizon Engine.

See also: [AUDIT_2026-05-15.md](./AUDIT_2026-05-15.md).

## Summary

- Direct Three.js usage appears across core, art, gameplay visuals, hazards, level building, procgen debug, and render/editor helpers.
- Best MHS seam: keep `GeneratedLevelV1`, `CourseSurface`, `RailCapsule`, `HazardSpawnSpec`, `MhsSpawnManifest`, and procgen outputs as data; replace Three scene construction with MHS prefabs/components.
- Highest-risk remaining leakage: `Game.ts`, `TileKit`, `LevelBuilder`, hazard visual classes, `DragShotInput` internals, runtime model bounds helpers, and decor/undermap render helpers. `SimpleBallPhysics`, `TileCatalog`, `MapGenerationTypes`, `TilePlacementSolver`, and `MapGenerationEndpoint` now use engine-neutral math primitives.

## Rendering And Scene Ownership

| Area | Three.js usage | MHS port direction |
| --- | --- | --- |
| `src/core/Game.ts` | `Scene`, `Group`, `PerspectiveCamera`, `WebGLRenderer`, lights, render loop, shadows, `AnimationMixer` updates | Split game/session state from renderer. Replace with MHS world/camera/light setup. |
| `src/core/GameCameraController.ts` / `gameCameraAndLayout.ts` | `Vector3`, camera lerp/lookAt math, object disposal | Keep math intent; rewrite against MHS camera/entity APIs. |
| `src/core/PsxLowResPresenter.ts` | `WebGLRenderTarget`, blit scene/camera, `ShaderMaterial` | Drop for MVP or rebuild as platform post effect if MHS supports it. |
| `src/level/LevelBuilder.ts` | Course root `Group`, tile group placement, flag `AnimationMixer` collection | Replace with prefab spawner that consumes `GeneratedLevel`. |
| `src/mhs/MhsSpawnManifest.ts` | No Three.js dependency | Portable prefab-spawn manifest for MHS consumption. Keep this data-only. |
| `src/level/fantasyVoid.ts`, `levelBackground.ts`, decor/island modules | Planes, spheres, groups, texture/material setup, camera occlusion traversal | Rebuild as MHS environment/decor prefabs; keep placement data where useful. |

## Asset Loading And Materials

| Area | Three.js usage | MHS port direction |
| --- | --- | --- |
| `src/art/AssetRegistry.ts` | `GLTFLoader`, `FBXLoader`, clone cache, animation clip cache | Replace runtime loaders with Studio-imported templates/prefabs keyed by `AssetKey`. |
| `src/art/Materials.ts` | `TextureLoader`, `MeshStandardMaterial`, `MeshBasicMaterial`, texture wrapping/filtering/color space | Replace with MHS materials. Preserve material intent only. |
| `src/art/PsxStyle.ts` | `CanvasTexture`, procedural texture canvases, geometry jitter | Web-only style helper unless recreated in MHS material pipeline. |
| `src/level/tiles/tileMaterials.ts` | `TextureLoader`, fallback `CanvasTexture`, grass material singleton | Replace with prefab material assignment; avoid runtime canvas texture generation. |
| `src/procgen/procgenModelScale.ts` | `Box3` and object bounds for runtime-loaded models | Convert into offline asset validation or prefab metadata checks. |

## Tiles, Hazards, And Procedural Geometry

| Area | Three.js usage | MHS port direction |
| --- | --- | --- |
| `src/level/tiles/TileKit.ts` | Heavy mesh construction: boxes, planes, shapes, rings, circles, cylinders, flag animation, model attachment | Replace with tile prefabs selected by `assetKeyOverride`; keep footprint/pivot metadata as data. |
| `src/hazards/instances/*` | One class per hazard with meshes/groups plus gameplay collision/effects | Split hazard simulation contract from hazard visual prefab. |
| `src/hazards/hazardSpinTargets.ts`, `glbTwoPartSpin.ts` | Traverse mesh hierarchy and infer spinning children by mesh order/name | Replace with explicit prefab child references or engine animation components. |
| `src/gameplay/Ball.ts`, `ShotEffects.ts`, `CollectibleController.ts`, `AimIndicator.ts` | Ball mesh, particles, shadow, aim line, coin GLB/geometry fallback | Replace visuals with MHS entities/effects; preserve event triggers and values. |

## Physics Leakage

| Area | Three.js usage | Risk |
| --- | --- | --- |
| `src/gameplay/SimpleBallPhysics.ts` | No direct Three.js vector construction after the audit action pass | Keep covered by neutral physics tests before MHS translation. |
| `src/input/DragShotInput.ts` | `Raycaster`, `Plane`, `Vector2`, `Vector3` internally; outputs neutral `ShotIntent` DTOs | MHS input must preserve shot vector/dead-zone behavior without Three raycasting. |
| `src/procgen/TileCatalog.ts` | No direct Three.js dependency after the audit action pass | Keep this catalog data-only; callers may still pass Three vectors structurally in the web adapter. |
| `src/procgen/MapGenerationTypes.ts`, `TilePlacementSolver.ts`, `MapGenerationEndpoint.ts` | No direct Three.js dependency after the audit action pass | Keep these procgen runtime modules engine-neutral. |
| `src/hazards/hazardSpatialUtils.ts` | `Box3` for model scaling plus vector basis helpers | Separate runtime model bounds from portable hazard math. |
| `src/procgen/procgenUndermapQuads.ts` | `Box3`, `Vector3`, `MathUtils.lerp` | Move bounding-box work to render/editor layer; keep slot math plain. |

## Input, UI, And Browser Coupling

Three.js inventory overlaps with browser-only risks:

| Area | Browser usage | MHS port direction |
| --- | --- | --- |
| `src/main.ts`, `src/core/Constants.ts` | DOM query, title screen events, URL query flags | Replace with MHS boot/config/debug settings. |
| `src/input/*` | Pointer events, wheel/context menu | Replace with MHS pointer/hand/controller input. |
| `src/ui/Hud.ts`, `GameOverlays.ts` | DOM construction, timers, image tags, `innerHTML`, CSS classes | Replace with MHS UI. Preserve state model and strings only. |
| `src/platform-browser/GameAudio.ts` | WebAudio, browser audio elements, synthetic AudioContext cues | Replace with MHS audio services and save/profile APIs; settings already flow through `StorageService`. |
| `src/platform-browser/BrowserStorageService.ts` | `localStorage` | Sole browser persistence adapter; replace with MHS save/profile implementation. |
| `src/economy`, `src/progression`, `src/cosmetics` | No direct `localStorage` after the audit action pass | Keep these services storage-adapter driven. |
| `src/procgen/bootstrapProcgenDebug.ts` | DOM toolbar, clipboard, URL mutation | Rebuild as editor utility or dev-only MHS component. |

## Debug Tooling

| Area | Three.js usage | MHS port direction |
| --- | --- | --- |
| `src/procgen/ProcgenDebugViewer.ts` | Separate scene, renderer, camera, OrbitControls, debug labels, hazard preview | Keep web-only or rebuild as MHS editor utility. Do not ship runtime. |
| `src/procgen/DebugMapRenderer.ts` | `CanvasTexture`, sprites, placeholder meshes | Editor/debug-only visualization. |
| `src/procgen/SocketDebugHelpers.ts` | Spheres and arrows for socket visualization | Editor/debug-only visualization. |
| `src/mhs/WebOnlyModules.ts` | No Three.js dependency | Maintains a data list of web/debug-only modules to keep port scope explicit. |

## Primitive / Geometry Inventory

| Area | Geometry/material APIs |
| --- | --- |
| `level/tiles/TileKit.ts` | `ShapeGeometry`, `BoxGeometry`, `PlaneGeometry`, `CylinderGeometry`, `DodecahedronGeometry`, `RingGeometry`, `CircleGeometry` |
| `hazards/instances/*` | `BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `SphereGeometry`, `TorusGeometry`, `CircleGeometry`, `PlaneGeometry`, `IcosahedronGeometry` |
| `gameplay/ShotEffects.ts` | `IcosahedronGeometry`, `CircleGeometry`, `CylinderGeometry`, `RingGeometry`, `SphereGeometry` |
| `gameplay/AimIndicator.ts` | `BufferGeometry` line |
| `gameplay/Ball.ts` | `SphereGeometry` |
| `level/fantasyVoid.ts`, `levelBackground.ts` | `PlaneGeometry`, `SphereGeometry` |
| `procgen/DebugMapRenderer.ts`, `SocketDebugHelpers.ts` | `BoxGeometry`, `CylinderGeometry`, `RingGeometry`, `SphereGeometry`, sprites/arrows |
| `core/PsxLowResPresenter.ts` | Fullscreen `PlaneGeometry`, render target, shader/basic blit material |

## Current Direct Usage Scan

Current direct Three or `THREE.` files include:

- `src/art/*`
- `src/core/Game.ts`, `GameCameraController.ts`, `PsxLowResPresenter.ts`, `configureCourseShadows.ts`, `gameCameraAndLayout.ts`
- `src/gameplay/*`
- `src/hazards/**`
- `src/input/DragShotInput.ts`
- `src/level/**` render/decor/tile modules
- `src/procgen/DebugMapRenderer.ts`, `ProcgenDebugViewer.ts`, `SocketDebugHelpers.ts`, `procgenModelScale.ts`, `procgenUndermapQuads.ts`

## Recommended Cleanup Before Port

1. Continue extracting `Game.ts` lifecycle decisions into `HoleSession` commands and platform-service calls.
2. Make web hazard classes consume or mirror the pure `evaluateHazardEffect` behavior contract.
3. Convert tile footprint and pivot/base rules into offline asset metadata tests.
4. Keep `ProcgenDebugViewer`, socket helpers, and debug renderers web/editor-only.
5. Replace runtime GLB/FBX loader assumptions with MHS prefab/template references and optimize the largest models.
