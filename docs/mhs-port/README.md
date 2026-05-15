# Putt Realms — MHS port preparation docs

This folder is a **documentation pack** for moving Putt Realms from the current **Vite + Three.js** web stack toward **Meta Horizon Studio / Horizon Engine (MHS/MHE)**. It mirrors the *intent* of Meta’s project layout (`Docs/`, `Assistant/skills/`) so you can copy or merge these files into a future `.hzproject` tree when the port repository exists.

## Disclaimer

- **Not official Meta documentation.** API names, package versions, and editor behavior change. When your team has the latest MHS docs, **reconcile or replace** any MHE-specific notes in these files.
- **Source of truth for game behavior** remains the TypeScript in `src/` and the existing technical reference [`../PROCGEN.md`](../PROCGEN.md).

## Local reference archive (deprecated copy)

An older documentation set the team used while planning other MHE work lives outside this repo, for example:

`c:\Users\Vitor\Documents\Meta\haunted_haul_workspace\meta_projects\Documentation`

Useful files there include `Best Practices.md`, `TypeScript in MHE2.md`, and the external Snackable / AI Templates guide. Paths on disk may move; update this README if the archive relocates.

## Index

| Document | Purpose |
|----------|---------|
| [PROJECT_SUMMARY_MHS.md](./PROJECT_SUMMARY_MHS.md) | Engine-agnostic overview of systems and loop for port scoping |
| [THREE_TO_MHE_MAPPING.md](./THREE_TO_MHE_MAPPING.md) | Conceptual mapping Three.js concepts → MHE patterns (no fabricated APIs) |
| [DATA_CONTRACTS.md](./DATA_CONTRACTS.md) | Serializable shapes: levels, tiles, hazards, rails, surface |
| [ASSET_PIPELINE.md](./ASSET_PIPELINE.md) | FBX/GLB, registry keys, pivots, QA checklist |
| [PROCGEN_AND_PREFABS.md](./PROCGEN_AND_PREFABS.md) | From procgen output to prefab spawn recipe |
| [MANUS_AND_AI_BOUNDARIES.md](./MANUS_AND_AI_BOUNDARIES.md) | What AI agents (e.g. Manus) should / must not do |
| [SKILLS_STUBS.md](./SKILLS_STUBS.md) | Future `Assistant/skills/`-style tasks (stubs only) |
| [SNACKABLE_ALIGNMENT.md](./SNACKABLE_ALIGNMENT.md) | Checklist vs snackable / AI template expectations |
| [PORT_READINESS_ROADMAP.md](./PORT_READINESS_ROADMAP.md) | Current pre-port boundary, do-not-port list, readiness milestones |
| [FINAL_3D_PORT_HANDOFF.md](./FINAL_3D_PORT_HANDOFF.md) | Final 3D MHS bootstrap, template, event, audio, pooling, and service plan |
| [DRY_RUN_PORT_MAP.md](./DRY_RUN_PORT_MAP.md) | File-area classification for portable, web-only, future MHS replacement, asset-pipeline, and excluded work |

Current code seams for the port: `src/core/HoleSession.ts`, `src/level/GeneratedLevelV1.ts`, `src/mhs/PrefabRegistry.ts`, `src/mhs/MhsSpawnManifest.ts`, `src/hazards/HazardSimulationContract.ts`, `src/platform/PlatformServices.ts`, `src/platform-browser/BrowserPlatformServices.ts`, and `src/ui/UiState.ts`.

## Current audit and risk register

- [`../AUDIT_2026-05-15.md`](../AUDIT_2026-05-15.md) — current project audit: legacy code, bugs, simplification opportunities, test gaps, and MHS red flags.
- [`../THREE_INVENTORY.md`](../THREE_INVENTORY.md) — Three.js-exclusive usage grouped by render, asset loading, physics leakage, input, debug tooling, and MHS replacement direction.

## Related repo docs

- [`../AUDIT_2026-05-15.md`](../AUDIT_2026-05-15.md) — latest full audit and MHS risk register
- [`../PROCGEN.md`](../PROCGEN.md) — procedural map generation, sockets, validation, adapter
- [`../PROCGEN_DEBUG.md`](../PROCGEN_DEBUG.md) — procgen **debug viewer** (URLs, toolbar, visual passes)
- [`../HANDOFF_MESSAGE.md`](../HANDOFF_MESSAGE.md) — short onboarding blurb for new developers
- [`../../README.md`](../../README.md) — root build/run and doc index
