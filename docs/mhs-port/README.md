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

## Related repo docs

- [`../PROCGEN.md`](../PROCGEN.md) — procedural map generation, sockets, validation, adapter
- Root `README.md` (if present) — build/run for the web prototype
