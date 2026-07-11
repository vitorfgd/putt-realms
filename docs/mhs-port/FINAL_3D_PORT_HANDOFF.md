# Final 3D MHS Port Handoff

This handoff updates the Putt Realms port plan with the 3D Meta Horizon Studio guides. The target remains a 3D prefab/entity port. Do not rewrite gameplay as a 2D DrawingSurface game.

This does not mean AI should author shipping 3D. For current agent work, AI should generate 2D/UI art directly when safe, treat 3D meshes as candidate assets, and hand off exact replacement paths when import/template/collision validation is not available.

MHS API names in this document are planning labels from the team guides. Verify exact names and signatures against the current MHS documentation before implementation.

## Target MHS Shape

Future MHS project structure:

| Area | Planned role |
| --- | --- |
| `space.hstf` | Static bootstrap scene. |
| `GameRoot` / `GameplayManager` | Startup sequencing, systems, update orchestration, UI/audio/persistence wiring. |
| `Camera` | Custom gameplay camera host. |
| `HudRoot` | Screen-space UI / Noesis-style HUD root. |
| `AudioHub` | Named child sound entities for global SFX and music. |
| `PersistenceAnchor` | Server-owned progression, economy, leaderboard, and saved-state bridge. |
| `Templates/` | Imported course tiles, hazards, ball, collectibles, decor, and VFX templates. |
| `Templates/Primitives/` | Local-only pooled debug/VFX primitives when needed. |

Do not port directly:

- `Game.ts`: web adapter only.
- `TileKit.ts` / `LevelBuilder.ts`: replace with spawned templates from `MhsSpawnManifest` / `RenderWorldState`.
- `AssetRegistry`, `GLTFLoader`, `FBXLoader`: replace with Studio-imported template declarations.
- DOM HUD, CSS, WebAudio, URL query flags, `localStorage`, Vite public paths: replace with MHS adapters/services.
- Procgen debug renderers/viewers: keep web/editor-only unless rebuilt as MHS editor tools.
- `LevelGenerator`: legacy web QA fallback only.

## Runtime Data Boundary

MHS should consume plain data, not Three scene objects:

- `GeneratedLevelV1`: strict gameplay level payload.
- `ProcgenCourseSpawnV1`: first-slice procgen course payload for tiles, deck-center transforms, coordinate/spawn policy, template calibration stubs, surface patches, and rail colliders.
- `MhsSpawnManifest`: level tiles, hazards, and collectibles as prefab spawn intents.
- `RenderWorldState`: camera plus desired world object states.
- `WorldObjectState`: stable `objectId`, stable `templateId`, transform, visibility, lifetime, replication, tags.
- `GameEvent`: serializable audio/UI/persistence/telemetry intent.
- `HudState` / `OverlayState`: UI-facing state.
- `PlatformServices`: storage, audio, telemetry, debug config, clock/timers.

Every spawned object must separate:

- `objectId`: runtime instance identity, e.g. `level-6:tile:12`.
- `templateId`: stable template/prefab key, e.g. `tile_straight_rw`.

## Template Contracts

MHS template paths must be static `TemplateAsset` declarations. Never construct future template paths dynamically. Runtime spawning should resolve registry/template keys to those declarations and use `WorldService.spawnTemplate`.

Course tile spawn rule:

- Spawned entity root = `ProcgenCourseSpawnV1.tiles[].position` (deck center).
- Entity yaw = `tiles[].rotationY` around +Y, in radians.
- Template visual/pivot/pitch/import-scale correction belongs inside the template child hierarchy, not in procgen and not in the generic spawner.

Each prefab registry entry now records planning metadata:

- future template path
- pivot/footprint policy
- forward axis `+Z`
- up axis `+Y`
- unit scale `1`
- collision intent
- replication intent
- lifetime/pooling intent
- required child names

Required child-name contracts to preserve:

| Template | Required child names |
| --- | --- |
| Windmill hazard | `VisualRoot`, `WindmillBlade` |
| Fan hazard | `VisualRoot`, `FanRotor` |
| Portal gate hazard | `VisualRoot`, `PortalEffect`, `PortalTrigger` |
| Collectible coin | `CollectibleVisualRoot` |
| Ball templates | `BallVisualRoot` |
| Course tile templates | `VisualRoot`, `Collider` |

## Replication, Pooling, And Spawn Safety

Planned replication intent:

- `sharedGameplay`: course tiles, hazards, ball, collectibles.
- `localCosmetic`: particles, aim line, debug gizmos, backdrop helpers, non-authoritative VFX.

Planned lifetime:

- `persistent`: level tiles, hazards, ball.
- `pooled`: collectibles, decor, debug helpers, repeated VFX.
- `oneShot`: rare temporary events only when pooling is not useful.

Future MHS spawning should use version-token safety:

1. Increment a build/reset version before rebuilding a level.
2. Capture the version before async template spawn.
3. After spawn resolves, compare versions.
4. Destroy stale spawned entities if reset/teardown already happened.

Inactive pooled entities may be hidden below the world, for example around `(0, -1000, 0)`, if component visibility is not sufficient.

## Future Systems

Recommended MHS systems/components:

| System | Responsibility |
| --- | --- |
| `SpawnSystem` | Spawn templates, cache components, pool/despawn level objects. |
| `CameraSystem` | Presentation-only camera transform/FOV/shake. |
| `HazardSystem` | Apply `HazardSimulationContract` behavior through MHS triggers/components. |
| `CollectibleSystem` | Collectible triggers, pickup events, pooled visuals. |
| `UiBridge` | Bind `HudState` / `OverlayState` to screen UI view models. |
| `AudioService` | Map sound IDs to `AudioHub` child sound entities and template-local sounds. |
| `PersistenceService` | Server-owned save, economy, cosmetics, quests, leaderboard flow. |

Current Studio runtime notes from May 26, 2026:

- `UiBridge` must support animated summary/store coin badges using `hud_topbar_coins.png`, treasure chest progress, chest unlock coin flights, and `NEXT LEVEL LOADING` / `NEXT LEVEL READY`.
- `UiBridge` must support Yip as a reusable UI character layer: FTUE portrait/name, loading tips, loading-logo peeks, and run-summary peeks.
- `CameraSystem` should preserve the slower opening overview (`1.15s`) and temporary preview FOV boost before returning to gameplay FOV.
- `PersistenceService` must treat treasure chest progress as reset-on-unlock and include the chest reward in the saved coin balance.

AudioHub planned sound IDs:

- `hit`
- `rail`
- `hazard`
- `oob`
- `hole`
- `coin`
- `ui`
- `reward`
- `skip`
- `level`
- `bgm`

Persistence and leaderboard behavior should be server/authority owned. Client UI should receive results through events or service replies, not direct browser storage equivalents.

## Remaining Before Porting

- Visually review compressed 1024px GLB textures in-game.
- Resolve `scene.bin` ownership and exclude it from MHS packaging if orphaned.
- Continue reducing `Game.ts` until gameplay decisions live in `HoleSession` and platform adapters.
- Make web hazard implementations consume or mirror `evaluateHazardEffect` more directly.
- Add negative validation tests for strict `GeneratedLevelV1` / spawn manifest error cases.
- Keep the Vite large-chunk warning tracked until debug/render code splitting is worthwhile.
