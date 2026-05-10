# Procgen debug viewer

This is **not** an HTTP API: it is a **separate front-end entry path** when the page URL contains the query flag **`procgenDebug`**. The game HUD/title flow is skipped; a fullscreen canvas runs [`ProcgenDebugViewer`](../src/procgen/ProcgenDebugViewer.ts) mounted from [`bootstrapProcgenDebug.ts`](../src/procgen/bootstrapProcgenDebug.ts).

Use it to visually inspect tiles, hazards, undermap islands, and island décor for any seed/difficulty without playing the full game loop.

---

## 1. How to launch

1. Run `npm run dev`.
2. Open the dev server origin with **`?procgenDebug`** on the query string.

Examples:

```txt
http://localhost:5173/?procgenDebug
http://localhost:5173/?procgenDebug=1
```

Optional query parameters (see §2). The toolbar syncs **`procgenSeed`** and **`procgenDifficulty`** into the URL when you generate or load a map so links are shareable.

---

## 2. URL parameters

| Parameter | Effect |
|-----------|--------|
| **`procgenDebug`** | Required (presence only). Switches `main.ts` to load `bootstrapProcgenDebug` instead of the normal `Game` bootstrap. |
| **`procgenSeed`** | If set on first load, generates that map immediately after assets preload. |
| **`procgenDifficulty`** | Integer **1–20** — passed as `levelIndex` / `targetDifficulty` to `MapGenerationEndpoint.generateMap` (default in UI if omitted is **6**). |
| **`procgenPsxLowRes`** or **`psxLowRes`** | Enables the PSX-style low-resolution render path in the debug viewer (see `Constants.ts`). |
| **`procgenLayout`** | Same semantics as gameplay QA: `single_path` / `single` or `double_row_straight` / `double` / `2row` — forces layout mode for **both** debug and main game when present (`readProcgenLayoutUrlOverride`). |

Gameplay-only (normal `Game`, not procgen debug):

| Parameter | Effect |
|-----------|--------|
| **`procgenSeed`** | Overrides the deterministic gameplay seed (exact replay). |
| **`procgenLayout`** | Topology override for QA. |

---

## 3. Toolbar

Loaded by `bootstrapProcgenDebug.ts` (fixed top bar):

| Control | Action |
|---------|--------|
| **1 Straight … 5 Ramp L** | Single-tile preview for five catalog types. |
| **Generate map** | Random seed at current difficulty (same as **G**). |
| **Seed** input | Paste a seed string; use **Load seed** to regenerate. |
| **Difficulty** input | **1–20** — drives `maxTiles`, curves, ramps (see `debugMaxTilesForDifficulty` in `ProcgenDebugViewer.ts`). |
| **Load seed** | `generateMapFromUi(seed, difficulty)`. |
| **Copy seed** | Clipboard helper for bug reports. |
| **Sockets** | Toggle socket/pivot helpers (same as **S**). |
| **PSX low-res** | Toggle low-res presenter; updates `procgenPsxLowRes` in the URL when possible. |
| **Game view** | Hides toolbar, hint, debug overlays (placeholder slabs, endpoint labels), and sockets. Tiles + hazards + void backdrop stay. **Esc** or **Exit game view** restores. |

Bottom-left hint lists shortcuts.

---

## 4. Keyboard (viewer focused)

| Key | Action |
|-----|--------|
| **G** | Generate a new random map (respects toolbar difficulty). |
| **S** | Toggle socket helpers. |
| **1 – 5** | Single-tile presets (same as toolbar). |

---

## 5. What gets rendered (map mode)

Rough order in `ProcgenDebugViewer.showGeneratedMap`:

1. **Tile art** — `buildTileVisual` per procgen tile at deck centers from `TileCatalog`.
2. **Debug overlays** — coloured placeholder slabs + endpoint labels (hidden in **Game view**).
3. **Hazard debug meshes** — from `adaptProcgenMapToGeneratedLevel` + `createHazardInstances` when adaptation succeeds.
4. **Undermap islands** — `computeProcgenUndermapQuadSlots(map)` when coplanar **2×2** deck blocks exist; else **`computeUndermapIslandSlots(adapted)`** when adaptation produced a level (path-following pads).
5. **Island décor** — `createIslandSurroundDecor` when adaptation yields a level (see §6).

Camera target and distance derive from `map.cameraBounds`.

---

## 6. Level adaptation in debug (important)

The viewer calls **`adaptProcgenMapToGeneratedLevel`** for:

- Hazard instances,
- Path-based undermap slots (when quad slots are empty),
- Island décor scatter.

**Strict validation** (`validateAdaptedLevel`) can **throw** on some maps (surface samples, rail sanity, etc.). That used to leave **`adapted === null`** while undermap **quads** still appeared — so you could see **islands but no props**.

**Current behavior:**

1. Try full adaptation.
2. On failure, retry with **`skipGameplayValidation: true`** (`ProcgenAdaptOptions` in `procgenLevelAdapter.ts`) so deck positions, bounds, and hazard specs still exist for **visual** passes. Gameplay physics are not guaranteed for that retry path.

**Island décor in procgen debug:**

- Uses **`islandsOnly: true` whenever any décor slot list is non-empty** so scatter stays on undermap meshes (no huge “void ring” sampling far from the course).
- When **quad** slots exist, décor targets **`[...quadSlots, ...pathSlots]`** so small pads under 2×2 flats still get enough placement targets.

If décor meshes are still empty, the console logs a **`[ProcgenDebugViewer] Island decor:`** hint (missing GLBs vs placement rules).

---

## 7. Asset preloading (debug)

`bootstrapProcgenDebug` awaits:

- All **`PROCGEN_TILE_TO_ASSET`** values,
- **`undermap_island`**,
- **`ISLAND_DECOR_ASSET_KEYS`**,
- Hazard debug keys (windmill, fan, portal, bumpers, etc.).

Decor and hazards stay empty until those loads finish (failed files stay `null` in `AssetRegistry`).

---

## 8. Relationship to `MapGenerationEndpoint`

There is **no separate REST server** in this repo. The “endpoint” is the **`mapGenerationEndpoint`** singleton in [`MapGenerationEndpoint.ts`](../src/procgen/MapGenerationEndpoint.ts), invoked from:

- `ProcgenDebugViewer` / `bootstrapProcgenDebug`,
- `PlayableLevelService` for real gameplay.

Same `generateMap(request)` contract everywhere.

---

## 9. Filing layout bugs

Include:

- **Seed** string (from toolbar / URL),
- **Difficulty** (1–20),
- Screenshot or description,
- Whether issue appears in **procgen debug** only, **gameplay** only, or both.

Smoke tests: `npm test` (`src/procgen/procgen.smoke.test.ts`).

---

## 10. File map

| File | Role |
|------|------|
| `src/main.ts` | Branches on `procgenDebug` query param. |
| `src/procgen/bootstrapProcgenDebug.ts` | Preload, toolbar, mounts viewer. |
| `src/procgen/ProcgenDebugViewer.ts` | Scene, map generation, hazards, undermap, décor. |
| `src/procgen/MapGenerationEndpoint.ts` | `generateMap` implementation. |
| `src/level/procgenLevelAdapter.ts` | `GeneratedMap` → `GeneratedLevel`, optional `skipGameplayValidation`. |
| `src/level/islandDecorScatter.ts` | Trees/mushrooms/etc. on/near island slots. |
| `src/procgen/procgenUndermapQuads.ts` | Coplanar 2×2 quad slots under decks. |
| `src/core/Constants.ts` | URL readers + `USE_PROCGEN_ENDPOINT`. |

Further generator theory: [**PROCGEN.md**](./PROCGEN.md).
