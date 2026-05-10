# Assistant / skills stubs (future MHE repo)

Meta’s internal **Best Practices** documentation describes an `Assistant/skills/` tree (e.g. `scripting/`, `scene/`, `mesh_gen/`) for agent workflows. **Do not copy proprietary skill files** from Meta into this repo.

Instead, when you create the Horizon project, add **project-specific** skills that wrap **Putt Realms tasks** below. Each stub lists **inputs**, **outputs**, and **verification**.

---

## Skill: `putt_validate_level_json`

**Purpose**: Validate a proposed `level.v1.json` (subset of `GeneratedLevel`) against schema rules.

- **Inputs**: JSON blob; optional schema path.
- **Outputs**: Error list or “ok”.
- **Verify**: Parser + required arrays (`tiles`, `surface.patches`, `railColliders`).
- **Forbidden**: Loading FBX or editing meshes.

---

## Skill: `putt_map_asset_keys`

**Purpose**: Maintain a table `{ AssetKey → MHE TemplateAsset path/guid }`.

- **Inputs**: `src/art/AssetRegistry.ts` key list; Studio export of template names.
- **Outputs**: Markdown or JSON manifest checked into repo.
- **Verify**: CI script ensures every `AssetKey` resolves or is explicitly marked optional.

---

## Skill: `putt_procgen_seed_replay`

**Purpose**: Given `procgenSeed` + `levelIndex`, regenerate TS `GeneratedLevel` and diff summaries.

- **Inputs**: Seed string, difficulty/progression params.
- **Outputs**: Tile count, hazard list, bounds—no scene mutation.
- **Verify**: Same inputs → same hash (deterministic RNG).

---

## Skill: `putt_spawn_manifest_from_level`

**Purpose**: Emit a spawn list (entity prototype id + transform + components params) for QA in MHE.

- **Inputs**: `GeneratedLevel`.
- **Outputs**: CSV/JSON ordered spawn steps.
- **Verify**: Spot-check first/last tile types (`start`/`hole`) and hazard `tileIndex` bounds.

---

## Skill: `putt_hazard_behavior_matrix`

**Purpose**: Document each `HazardKind` with plane tests, cooldowns, and portal pair rules—single page for designers.

- **Inputs**: `src/hazards/implementations.ts`, `generateHazardSpecs.ts`.
- **Outputs**: Markdown matrix.
- **Verify**: Engineer sign-off when adding a kind.

---

## Anti-skills (explicitly do not automate)

- **Mesh repair / auto-FBX healing** — human DCC + Studio import QA only.
- **Blind MHE API codegen** without compiling against pinned SDK.

---

When authoring real `.skill` files for Horizon’s Assistant, reference Meta’s current **writing-skills** governance doc in your org (path varies by template revision).
