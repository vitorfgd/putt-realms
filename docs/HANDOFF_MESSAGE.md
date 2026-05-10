# Handoff message (copy for the next developer)

You can paste the block below into Slack, email, or your issue tracker.

---

**Putt Realms** — Vite + Three.js miniature golf prototype. Layout work lives in **`src/procgen/`**; fastest feedback is the **procgen debug viewer** (full game UI optional).

**Local:** install deps and run the dev server as in **`README.md`** (default dev URL is typically port **5173**).

**Procgen debug** — not a REST API. Add **`?procgenDebug`** to the app URL (e.g. `http://localhost:5173/?procgenDebug`). Optional query params: **`procgenSeed`**, **`procgenDifficulty`** (1–20); the toolbar keeps them for shareable links. Viewer shows tiles, hazards when adaptation succeeds, undermap islands, and island décor — same generator output as gameplay.

**Keyboard:** **G** new map · **S** socket helpers · **1–5** single-tile previews · **Game view** / **Esc** as labeled in the UI. Bug reports: copy **Seed** + **Difficulty** from the toolbar.

**Gameplay vs debug:** Without `procgenDebug`, **`Game`** loads. Pipeline is still **`MapGenerationEndpoint.generateMap`** when **`USE_PROCGEN_ENDPOINT`** is set in **`src/core/Constants.ts`**. **`procgenSeed`** (without debug) overrides replay seed; **`procgenLayout`** forces **`single_path`** vs **`double_row_straight`** for QA.

**Docs (order):** **`docs/PROCGEN_DEBUG.md`** → **`docs/PROCGEN.md`** → **`README.md`**.

**Tests:** Procgen smoke tests live in **`src/procgen/procgen.smoke.test.ts`** (see **`package.json`** / **`README.md`** for the test script).

**Assets:** **`public/assets/models/`** · registry **`src/art/AssetRegistry.ts`**. Missing assets warn in the console and props may not show.

If docs drift from **`src/`**, fix the markdown in the same change.

---
