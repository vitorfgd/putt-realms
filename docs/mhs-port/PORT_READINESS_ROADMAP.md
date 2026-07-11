# MHS Port Readiness Roadmap

This is the planning source of truth for preparing Putt Realms for a future Meta Horizon Studio / Horizon Engine port. It does not introduce MHS APIs or a Horizon project. The current web game remains the playable runtime.

## Official Pre-Port Boundary

MHS should consume these portable surfaces:

| Surface | Purpose |
| --- | --- |
| `GeneratedLevelV1` | Strict level interchange payload with debug maps removed. |
| `ProcgenCourseSpawnV1` | First-slice course spawn payload: tile template keys, deck-center transforms, coordinate/spawn policy, template calibration stubs, surface patches, and rail colliders. |
| `createMhsSpawnManifest` | Pure prefab spawn intents from `GeneratedLevelV1`. |
| `MHS_PREFAB_REGISTRY` | Asset key to future prefab planning metadata. |
| `HAZARD_SIMULATION_CONTRACTS` / `evaluateHazardEffect` | Mesh-free hazard behavior contract. |
| `HoleSession` commands/events | Engine-neutral hole lifecycle and side-effect intent. |
| `ShotIntent` | Engine-neutral shot input output. |
| `HudState` / `OverlayState` | UI data models for web or future MHS UI adapters. |
| `PlatformServices` | Storage, audio, telemetry, debug config, and clock/timer seams. |
| `RenderWorldState` / `WorldObjectState` | Platform-neutral desired 3D world state with stable object/template IDs. |
| `GameEvent` | Serializable audio/UI/persistence/telemetry intent. |

## Do Not Port Directly

These modules are implementation details of the current web prototype:

| Web-only area | Future MHS direction |
| --- | --- |
| `Game.ts` | Treat as web adapter; move portable decisions into `HoleSession`. |
| `TileKit.ts` and `LevelBuilder.ts` | Replace with imported prefab spawning from `MhsSpawnManifest`. |
| Hazard visual classes | Keep behavior contract; rebuild visuals/components as MHS prefabs. |
| `AssetRegistry`, `GLTFLoader`, `FBXLoader` | Replace runtime loading with Studio-imported templates/prefabs. |
| DOM HUD/overlays and `style.css` | Rebuild with MHS UI; preserve `HudState` / `OverlayState`. |
| `GameAudio` / WebAudio | Replace with MHS audio services/components. |
| Browser storage/query/clipboard/Vite paths | Replace adapters with MHS save/profile/debug/packaging services. |
| Procgen debug viewers/renderers | Keep web/editor-only unless a future MHS editor tool is designed. |
| `LevelGenerator` | Legacy web QA fallback only; do not port unless explicitly promoted. |

## 3D MHS Target Shape

The final target is a 3D MHS runtime with a static bootstrap scene plus spawned templates:

This target still relies on human-verified imported templates for shipping 3D. AI-generated 2D/UI art is acceptable when registered and layout-checked; generated 3D/audio should stay candidate or handoff work until validated.

- `space.hstf`: static world bootstrap.
- `GameRoot` / `GameplayManager`: startup, system construction, update orchestration, UI/audio/persistence wiring.
- `Camera`: custom gameplay camera host.
- `HudRoot`: screen-space UI root.
- `AudioHub`: named sound children for global SFX/music.
- `PersistenceAnchor`: server-owned saved progress/leaderboard bridge.
- `Templates/`: imported tile, hazard, ball, collectible, decor, and VFX templates.

MHS API names from the team guides, such as `WorldService`, `TemplateAsset`, `NetworkMode`, `TransformComponent`, `CustomUiComponent`, and persistence services, are version-sensitive and must be verified against current MHS documentation before implementation.

## Remaining Preparation Milestones

1. **Session extraction**: continue moving scoring, OOB recovery, skip flow, rewards, collectible events, phase changes, telemetry intent, currency intent, and input enablement into `HoleSession`.
2. **Hazard split**: keep Three hazard classes as web visuals, but make their runtime behavior match the pure hazard evaluator contract.
3. **Prefab package**: complete prefab planning metadata, including source footprint, pivot policy, required/optional status, optimization state, and future prefab names.
4. **UI containment**: keep DOM rendering as a web adapter and expand smoke tests before any UI rewrite.
5. **Asset cleanup**: six oversized GLB textures are compressed to 1024px JPEG quality 72; visually review them in-game, then confirm whether `scene.bin` is still needed.
6. **Bundle hygiene**: split web debug/render-only modules from the production bundle when the main chunk warning becomes a release concern.
7. **Runtime architecture handoff**: keep `FINAL_3D_PORT_HANDOFF.md` current with static scene, template child names, replication intent, pooling, async spawn safety, AudioHub, UI bridge, and persistence ownership.

## Recent Studio Runtime Slice (2026-05-26)

- UI polish: realm-screen-backed loading/summary, compact run summary rows, `LEVEL X` summary label, `hud_topbar_coins.png` summary/store coin badges, larger next-level loading text, and treasure chest progress/unlock presentation.
- Economy/progression: treasure chest progress increments once per completed game, unlocks at three games, grants a tunable `40` coins, resets progress, and persists the reset.
- Yip moments: loading tips, logo/summary peek animations, and FTUE portrait/name/text refinements are implemented. Gameplay reactions should stay sparse.
- Camera/movement: route overview duration is now `1.15s`, preview FOV gets a temporary `+8` degree boost, yaw orbit wraps instead of clamping, and portal exits add a minimum horizontal impulse.
- Open risk: reported undermap-island clipping/spawn-inside cases still need targeted collision/placement work and seed coverage.

## Platform Service Replacement Notes

| Service | Current web adapter | Future MHS replacement |
| --- | --- | --- |
| Storage | `BrowserStorageService` using `localStorage` | MHS save/profile service. |
| Audio | `GameAudio` using HTMLAudio/WebAudio | MHS audio components/mixer. |
| Telemetry | Browser no-op telemetry service plus current progression telemetry | MHS analytics/event service if available. |
| Debug config | URL query flags | Editor/dev settings or debug console commands. |
| Clock/timers | `Date.now`, `window.setTimeout` | Engine clock/scheduler. |
| Input | Pointer events plus Three raycast adapter | Hand/controller/ray input producing `ShotIntent`. |
| UI | DOM HUD/overlays | MHS UI adapter rendering `HudState` / `OverlayState`. |

## Spawn And Replication Rules

- Use stable `objectId` values for runtime instances and stable `templateId` values for prefab keys.
- Mark course tiles, hazards, ball, and collectibles as `sharedGameplay`.
- Mark aim indicators, particles, debug gizmos, backdrop helpers, and cosmetic-only effects as `localCosmetic`.
- Pool repeated visuals and hide inactive pooled objects below the world if needed.
- Use build/reset version tokens for future async template spawning so stale entities are destroyed after reset.

## Acceptance Gates

Every readiness milestone should pass:

- `npx tsc --noEmit -p tsconfig.json`
- `npm run lint`
- `npx vitest run`
- `npx knip`
- `npm run build`

Permanent regression coverage must include the seed `1778813885962-390489452`, strict level projection, prefab registry completeness, compressed GLB texture validity, render-world object/template IDs, hazard behavior contracts, session command output, UI DOM mount points, and browser service containment.
