# Putt Realms — audit log (roadmap execution)

Per roadmap §0: brief purpose / Three / legacy / complexity / porting / tests / action. Phases below record **read-through completion** and concrete follow-ups shipped in this pass.

---

## §0 — Template (use for future deep dives)

1. **Purpose** — Owner subsystem; importers.
2. **Three.js** — Scene graph, geometry, loaders, render-only vs sim.
3. **Legacy / dual path** — Legacy generator, deprecated APIs, `userData`.
4. **Complexity** — Long functions, branching, duplicated math.
5. **Porting** — DTO vs presentation split.
6. **Tests** — Coverage; one test idea if none.
7. **Action** — None | document | simplify | split.

---

## §1 — Core (`src/core/`) — **Phase complete (summary)**

| File | Summary |
|------|---------|
| `Game.ts` | Large orchestrator; hazard env scratch; **extracts**: `configureCourseShadows.ts`, `gameCameraAndLayout.ts`. |
| `gameCameraAndLayout.ts` | Portrait gameplay rect, follow/top-down camera math, `disposeObject3D`. |
| `configureCourseShadows.ts` | Course shadow cast/receive setup (traverse on course group). |
| `GameCameraController.ts` | Camera-only; `lookAt` / lerp — port bucket. |
| `Constants.ts` | `USE_PROCGEN_ENDPOINT` documented as shipped default; URL overrides for procgen QA. |
| `PlayableLevelService.ts` | Single entry `generate()` branches procgen vs `LevelGenerator`; retry loop documented. |
| `PsxLowResPresenter.ts` | Render-only shader path. |
| `RunStateMachine.ts` | Phase enum — engine-neutral. |
| `publicPath.ts` | Asset URL helper. |

**Actions shipped:** Shadow traversal extracted; Constants/PlayableLevelService comments clarified.

---

## §2–§3 — Gameplay + input — **Phase complete (summary)**

| Area | Notes |
|------|--------|
| Ball, AimIndicator, ShotEffects, SimpleBallPhysics, StrokeController | Physics + visuals; `SimpleBallPhysics` port-critical. |
| DragShotInput | `Raycaster` + `Plane` — replace in engine port. |
| CollectibleController | GLB coin + halo; no PNG late-load path (supersedes old texture race). |

---

## §4–§5 — Hazards + art — **Phase complete (summary)**

| File | Notes |
|------|--------|
| `implementations.ts` | Thin `createHazardInstances` factory + portal pairing; hazard classes in `instances/*.ts`. |
| `baseHazard.ts`, `hazardSpatialUtils.ts`, `hazardSpinTargets.ts` | Shared hazard base + XZ math + windmill/fan spin discovery. |
| `instances/*Hazard.ts` | One class per file (windmill, sandpit, fan, bridge, boost, bumper, portal). |
| `glbTwoPartSpin.ts` | Two-mesh GLB fan/windmill blade collection. |
| `Hazard.ts` / `HazardTypes.ts` | Contracts + weights. |
| AssetRegistry / Materials / PsxStyle | Loaders + PSX materials. |

---

## §6 — Level + tiles — **Phase complete (summary)**

Notable: `TileKit.ts`, `procgenLevelAdapter.ts`, `generateHazardSpecs.ts` (windmill spawn added), `courseSurface.ts` for collectibles Y.

---

## §7 — Procgen — **Phase complete (summary)**

`MapGenerationEndpoint.ts`, `TileCatalog`, solver, validator — smoke tests in `procgen.smoke.test.ts`; no change to solver this pass.

---

## §8–§12 — UI, economy, progression, cosmetics, platform, entry — **Phase complete (summary)**

- **Hud:** Removed deprecated `setStrokes` (no callers; `setStrokesPar` remains).
- **GameOverlays:** `escapeHtml` on user-facing strings (e.g. tutorial title); realm/summary markup unchanged structurally.
- **style.css:** `--game-strip-width`; realm route + run-summary widths aligned to variable.

---

## §13 — Non-src — **Phase complete (summary)**

- **scripts:** Shared `writePngAtomic.mjs` for realm frame + HUD topbar pipelines; [scripts/README.md](../scripts/README.md) indexes entrypoints including optional Python stripper.
- **`strip_run_summary_png_bg.py`:** Pillow-based trim of listed `public/assets/ui/*.png`; run via `npm run strip:ui-bg` (requires Python + Pillow).
- **docs/THREE_INVENTORY.md** — Geometry / API inventory from repo scan.

---

## Pillars (this PR)

| Pillar | Status |
|--------|--------|
| A — Dual path | Documented `USE_PROCGEN_ENDPOINT`; adapter wording in `procgenLevelAdapter` header. |
| B — Split large files | `configureCourseShadows.ts`; `gameCameraAndLayout.ts`; hazard `instances/*` + `baseHazard` / spatial / spin utils; thin `implementations.ts`. |
| B — Fan / collectibles | Shared GLB second-mesh helper; collectibles = GLB path (no texture rebuild). |
| C — UI | `--game-strip-width`; realm + run-summary widths; `escapeHtml` on overlay dynamics. |
| D — Scripts | `writePngAtomic.mjs`; `scripts/README.md`; `npm run strip:ui-bg` (Python / Pillow). |
| E — Porting | `THREE_INVENTORY.md`; `PORTING.md` index. |
| F — Quality | `generateHazardSpecs.test.ts`. |
| Upkeep | Build + test run; this log. |

---

## Per-file registry (§0 checklist)

One line per module: **Purpose** · **Three** (heavy/light) · **Legacy** · **Porting** · **Tests** · **Action**.

### §1 — `src/core/`

- **`Game.ts`** — Main loop, phases, level lifecycle; Three scene-heavy; procgen default; port: peel sim; manual; ongoing extracts.
- **`gameCameraAndLayout.ts`** — Letterbox rect, camera poses, mesh dispose; Three vectors; none; camera port; none; none.
- **`configureCourseShadows.ts`** — Shadow cast/receive for course; Three traverse; none; render; none; none.
- **`GameCameraController.ts`** — Camera modes; Three; none; render; none; none.
- **`Constants.ts`** — Tunables + procgen flags; none; URL override; tuning; none; document.
- **`PlayableLevelService.ts`** — Level gen entry procgen vs legacy; dual path; DTO boundary; none; document.
- **`PsxLowResPresenter.ts`** — PSX post pipeline; Three; none; render; none; none.
- **`RunStateMachine.ts`** — Phases/events; none; none; neutral; none; none.
- **`publicPath.ts`** — Asset URL helper; none; none; build; none; none.

### §2 — `src/gameplay/`

- **`Ball.ts`** — Ball mesh + cosmetics; Three; none; render; none; port bucket.
- **`AimIndicator.ts`** — Aim line; Three; none; render; none; none.
- **`ShotEffects.ts`** — FX particles; Three; none; render; none; none.
- **`SimpleBallPhysics.ts`** — Physics integration; light Three; legacy bits; **port-critical**; add surface tests.
- **`CollectibleController.ts`** — GLB coins; Three; none; GLB-only path; none; none.
- **`StrokeController.ts`** — Shot glue; none; none; glue; none; none.

### §3 — `src/input/`

- **`DragShotInput.ts`** — Drag shot; Raycaster; none; port ray-plane; none; none.
- **`CameraOrbitInput.ts`** — Orbit input; none; none; input; none; none.

### §4 — `src/hazards/`

- **`Hazard.ts`** — Types; none; none; contracts; none; none.
- **`HazardTypes.ts`** — Weights; none; none; data; none; none.
- **`implementations.ts`** — `createHazardInstances`; none; none; factory; none; none.
- **`baseHazard.ts`** — Hazard base; Three Group; none; sim+render; none; none.
- **`hazardSpatialUtils.ts`** — XZ basis, segments, scale; Three Box3; none; sim math; none; none.
- **`hazardSpinTargets.ts`** — Spin node discovery; Three traverse; none; anim; none; none.
- **`glbTwoPartSpin.ts`** — Two-part GLB blades; Three; none; shared; none; none.
- **`instances/WindmillHazard.ts`** — Windmill; Three; none; sim hit; none; none.
- **`instances/SandpitHazard.ts`** — Sandpit; Three; none; env; none; none.
- **`instances/FanHazard.ts`** — Fan; Three; none; env; none; none.
- **`instances/BridgeHazard.ts`** — Bridge OOB; Three; none; sim; none; none.
- **`instances/BoostPadHazard.ts`** — Boost; Three; none; env; none; none.
- **`instances/BumperMushroomHazard.ts`** — Bumper; Three; none; sim+FX; none; none.
- **`instances/PortalGateHazard.ts`** — Portal; Three; pair ids; sim; none; none.

### §5 — `src/art/`

- **`AssetRegistry.ts`** — GLTF load; Three; none; I/O port; none; document.
- **`Materials.ts`** — Materials; Three; none; render port; none; none.
- **`PsxStyle.ts`** — PSX helpers; Three; none; render; none; none.

### §6 — `src/level/` (+ `tiles/`)

- **`LevelTypes.ts`** — DTOs; none; none; **port gold**; none; none.
- **`LevelGenerator.ts`** — Legacy generator; mixed; legacy; cull when unused; none; document.
- **`LevelBuilder.ts`** — Build scene; Three heavy; dual; pipeline; none; none.
- **`TileDimensions.ts`** — Constants; none; none; sim; none; none.
- **`procgenLevelAdapter.ts`** — Map→level; none; procgen primary; DTO; none; document.
- **`generateHazardSpecs.ts`** — Hazard rules; none; none; logic; vitest; none.
- **`generateHazardSpecs.test.ts`** — Tests; none; none; tests; none; none.
- **`courseSurface.ts`** — Surface patches; math; none; physics; none; unit tests.
- **`railColliders.ts`** — Rails; math; none; sim; none; none.
- **`pathGen.ts`** / **`pathCorridor.ts`** / **`Difficulty.ts`** — Legacy path/difficulty; mixed; legacy; port notes; none; document.
- **`bendOuterRails.ts`** — Rail bend; Three; legacy; builder; none; none.
- **`fantasyVoid.ts`** / **`levelBackground.ts`** — Backdrops; Three; none; render; none; none.
- **`decorCameraOcclusion.ts`** / **`backgroundFloatingIslands.ts`** / **`islandDecorScatter.ts`** / **`undermapIslands.ts`** / **`resolveProcgenUndermapIslandSlots.ts`** — Decor / islands; Three; procgen; render; none; none.
- **`tiles/TileKit.ts`** — Tiles + cup + flag; Three large; procgen models; render; none; split if grows.
- **`tiles/tileDecor.ts`** / **`tiles/tileMaterials.ts`** — Tile decor/materials; Three; none; render; none; none.

### §7 — `src/procgen/`

- **`MapGenerationEndpoint.ts`** — Solver orchestration; none; endpoint; core; smoke; none.
- **`MapGenerationTypes.ts`** / **`procgenEndpointReplay.ts`** — Types/replay; none; none; DTO; none; none.
- **`TileCatalog.ts`** / **`TilePlacementSolver.ts`** — Tiles + solver; none; none; logic; smoke; none.
- **`procgenModelScale.ts`** / **`procgenAssetKeys.ts`** / **`procgenUndermapQuads.ts`** — Helpers; Three Box3 where noted; none; util; none; none.
- **`GeneratedMapValidator.ts`** — Validation; none; none; logic; smoke; none.
- **`DebugMapRenderer.ts`** / **`ProcgenDebugViewer.ts`** / **`bootstrapProcgenDebug.ts`** / **`SocketDebugHelpers.ts`** — Debug; Three; debug; none; none; none.
- **`procgen.smoke.test.ts`** — Vitest; none; none; tests; none; none.

### §8–12 — UI, economy, progression, cosmetics, platform, entry

- **`ui/Hud.ts`**, **`ui/GameOverlays.ts`**, **`ui/calloutSprites.ts`** — DOM HUD/overlays; none; none; UI; manual; templates optional.
- **`economy/EconomyService.ts`**, **`economy/economyFormulas.ts`** — Economy; none; localStorage; rules; none; none.
- **`progression/QuestService.ts`**, **`progression/TelemetryService.ts`** — Meta; none; none; state; none; none.
- **`cosmetics/CosmeticService.ts`**, **`cosmeticCatalog.ts`**, **`cosmeticTypes.ts`** — Cosmetics; none; none; meta; none; none.
- **`platform-browser/GameAudio.ts`** — Web Audio; none; none; platform; none; none.
- **`main.ts`**, **`vite-env.d.ts`** — Boot + types; none; none; entry; none; none.

### §13 — non-src

- **`index.html`**, **`src/style.css`** — Shell + styles; CSS vars; none; UI contract; none; none.
- **`package.json`**, **`package-lock.json`**, **`vite.config.ts`**, **`vitest.config.ts`** — Tooling; none; none; build; none; none.
- **`scripts/*.mjs`**, **`scripts/lib/writePngAtomic.mjs`**, **`scripts/README.md`** — Node asset pipelines + docs; Sharp; none; CI local; none; none.
- **`scripts/strip_run_summary_png_bg.py`** — PIL UI trim; Pillow; manual; artist step; none; README.
- **`public/assets/`** — Static assets; none; registry+UI paths; contract; none; verify on add.

---

## Commands run

`npm run build` · `npm run test`
