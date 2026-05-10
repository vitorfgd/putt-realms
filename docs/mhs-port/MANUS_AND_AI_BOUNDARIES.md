# Manus / AI agent boundaries (Putt Realms → MHS)

Experience shows **3D authoring by general-purpose AI** (including tools marketed for Horizon workflows) often corrupts pivots, scale, collision, or scene hierarchy. This project **does not** rely on AI for mesh truth—only for **data**, **documentation**, and **carefully scoped scripts**.

## Goals

- Keep **one human-verified source** for geometry: FBX/GLB imported through Studio with QA ([`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md)).
- Keep **gameplay truth** in typed **data contracts** ([`DATA_CONTRACTS.md`](./DATA_CONTRACTS.md)).
- Let agents accelerate **boilerplate**, **docs**, and **parameter tuning** where validation is automated.

## Allow list (low risk)

| Task | Guardrails |
|------|------------|
| Edit markdown under `docs/` | Human review before treating as spec |
| Generate **JSON / tables** from existing types | Validate with schema or TS compile |
| Tune **constants** (economy, audio volumes, drag limits) | Playtest + unit constraints |
| Add **telemetry fields** | Must not break deserialization |
| Refactor **pure functions** (math helpers) | Tests / deterministic procgen seeds |
| Draft **MHE component skeletons** | Must compile against **your** pinned SDK; human verifies imports |

## Deny list (high risk — human + DCC pipeline required)

| Task | Why |
|------|-----|
| “Fix” UVs, retopo, merge vertices on shipping FBX | Silent pivot/collision drift |
| Convert Three.js scene code → MHE **line-by-line** | Wrong lifecycle and APIs |
| Invent `meta/worlds` APIs or package versions | Breaks Studio build |
| Redesign tile sockets without **TileCatalog** + validator updates | Breaks continuity |
| Edit **physics + surface + rails** together without golden tests | Subtle OOB / tunneling |
| Procedural replacement of **course tile meshes** for shipping | Conflicts with authored art strategy |

## Recommended workflow when using Manus

1. **Scope**: Paste **allow-list task** + link `DATA_CONTRACTS.md` / relevant `src/` file—never open-ended “make the level prettier in 3D.”
2. **Artifact**: Require output as **diff or data file**, not a binary `.fbx`.
3. **Verify**: Run web build (`npm run build`) or MHE compile; run procgen debug seed replay if touching generation.
4. **Escalate**: Any collision/visual change touches **human artist + engineer** pair review.

## Alignment with Meta “AI Template” idea

Snackable / template docs emphasize AI changing **shallow** layers (palette, tuning, themed variants) while **core mechanic** stays stable. For Putt Realms:

- **Core**: stroke→roll→cup, surface+rail+hazard contracts.
- **Shallow**: cosmetics, realm props, numeric tuning, themed `AssetKey` mapping tables.

## Related

- [`THREE_TO_MHE_MAPPING.md`](./THREE_TO_MHE_MAPPING.md) — what not to translate literally.
- [`SKILLS_STUBS.md`](./SKILLS_STUBS.md) — structured tasks suitable for future Assistant skills.
