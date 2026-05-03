# Putt Realms — Procedural Generation Technical Reference

> **Living document.** Update this file whenever a procgen file changes.  
> Last updated: 2026-05-01 (double-row curves + ramp elevation + vertical gap fix)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Coordinate System & Tile Dimensions](#2-coordinate-system--tile-dimensions)
3. [Tile Types & Catalog](#3-tile-types--catalog)
4. [Artist Pivot Convention](#4-artist-pivot-convention)
5. [Generation Modes](#5-generation-modes)
   - 5.1 [double_row_straight](#51-double_row_straight)
   - 5.2 [single_path](#52-single_path)
6. [Double-Row Layout — Full Placement Math](#6-double-row-layout--full-placement-math)
7. [Model Loading Pipeline](#7-model-loading-pipeline)
8. [Socket System](#8-socket-system)
9. [Validation](#9-validation)
10. [Adapter — Procgen → Gameplay](#10-adapter--procgen--gameplay)
11. [Debug Tooling](#11-debug-tooling)
12. [File Map](#12-file-map)
13. [Changelog](#13-changelog)

---

## 1. System Overview

Putt Realms uses a **socket-based, seed-driven procedural map generator** that produces a
`GeneratedMap` value object.  The generator lives entirely in `src/procgen/` and is decoupled
from the legacy tile renderer in `src/level/`.  A thin adapter (`procgenLevelAdapter.ts`)
converts `GeneratedMap → GeneratedLevel` so the existing `LevelBuilder` / `TileKit` pipeline
can render it.

```
GenerateMapRequest
      │
      ▼
MapGenerationEndpoint.generateMap()
      │
      ├─ double_row_straight ──► solveDoubleRowStraightPath()
      │                               └─ PlacedTile[] (pivot world positions)
      │
      └─ single_path ──────────► generateRandomPath()
                                      └─ solveTilesAlongPath()
                                              └─ PlacedTile[] (pivot world positions)
      │
      ▼
validateGeneratedMap()   — sanity-checks grid path + tile positions
      │
      ▼
GeneratedMap  { tiles, startPosition, holePosition, cameraBounds, … }
      │
      ▼
adaptProcgenMapToGeneratedLevel()   ← bridges to legacy renderer
      │
      ▼
LevelBuilder.buildInto()  →  TileKit.buildTileGroup()  →  Three.js scene
```

---

## 2. Coordinate System & Tile Dimensions

### Axes

| Axis | Meaning |
|------|---------|
| **+X** | Right (lateral, wall side on right-wall tiles) |
| **+Y** | Up (wall height) |
| **+Z** | Forward along the fairway (entry → exit) |

All tile placement, socket directions, and pivot offsets are expressed in this space.

### Constants (`src/procgen/TileCatalog.ts`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `TILE_LENGTH` | **6** | World-unit stride between consecutive Z rows |
| `TILE_WIDTH`  | **6** | World-unit deck width; square with `TILE_LENGTH` for 2x2 source art |
| `DOUBLE_ROW_SIDE_GAP` | **0** | Extra clearance between inner lane edges |
| `RAMP_HEIGHT` | **3** | World vertical delta for current 2x2 ramp art |

### Lane centres (double-row)

```
doubleRowDeckCenterX(isRightLane):
  half = (TILE_WIDTH + DOUBLE_ROW_SIDE_GAP) / 2 = 3
  right lane  → +3   (world X)
  left  lane  → −3   (world X)
```

The total corridor width is `2 × TILE_WIDTH = 12` world units, with the two lanes meeting
flush at **X = 0**.

---

## 3. Tile Types & Catalog

### TileType union

```
"straight_right_wall"   straight, wall on +X
"convex_right_wall"     90° bend outward  (right turn)
"concave_right_wall"    90° bend inward   (left turn)
"ramp_right_wall"       elevation change, wall +X
"ramp_left_wall"        elevation change, wall −X
"floor_plain"           open 2x2 floor, no walls
"start_placeholder"     tee strip
"hole_placeholder"      cup strip
```

### Catalog entry fields (`TileDefinition`)

| Field | Description |
|-------|-------------|
| `tileType` | TileType key |
| `modelKey` | Asset registry key (e.g. `"tile_straight_rw"`) |
| `footprint` | `{ halfWidth: 3, halfLength: 3 }` |
| `entrySocket` | Incoming socket direction in **tile-local** space (before rotationY) |
| `exitSocket` | Outgoing socket direction in tile-local space |
| `pivotOffsetFromDeckOrigin` | `Vector3` — deck centre → artist pivot, unrotated local space |
| `difficultyWeight` | 1.0 – 2.0, summed for difficulty scoring |
| `tags` | String array for filtering (e.g. `["straight","right_wall"]`) |

### Pivot offsets by type

| Type | `pivotOffsetFromDeckOrigin` | `exitElevationDelta` |
|------|-----------------------------|----------------------|
| `straight_right_wall` | `(-3, 0, +3)` | 0 |
| `convex_right_wall`   | `(-3, 0, +3)` | 0 |
| `concave_right_wall`  | `(-3, 0, +3)` | 0 |
| `ramp_right_wall`     | `(-3, 0, +3)` | `RAMP_HEIGHT` (+3) |
| `ramp_left_wall`      | `(+3, 0, +3)` ← wall on −X side | `RAMP_HEIGHT` (+3) |
| `floor_plain`         | `(-3, 0, +3)` | 0 |
| `start_placeholder`   | `(-3, 0, +3)` | 0 |
| `hole_placeholder`    | `(-3, 0, +3)` | 0 |

> **Note:** These offsets encode the *assumed* artist pivot location used by the solver and
> socket-debug helpers.  The runtime model loader no longer uses them for mesh placement —
> it derives the deck centre directly from the bounding box (see §7).

---

## 4. Artist Pivot Convention

Every procgen tile is authored with its **local origin at the top-left corner** of the
footprint:

```
Top-left convention (looking down +Y, +Z points away from viewer)

   pivot ●──────────────────── +X (wall side)
         │                    │
         │   TILE footprint   │
         │   6 × 6 world u    │  −Z
         │                    │
         └────────────────────┘  (entry end, local −Z face)

  "Top"  = exit end (+Z, far from player at start)
  "Left" = wall-free side (−X)
```

In local (unrotated) tile space the model geometry occupies:

```
X ∈ [0, +TILE_WIDTH ]  =  [0, 4]
Z ∈ [−TILE_LENGTH, 0]  =  [−6, 0]
```

The pivot offset from deck centre is therefore `(−halfWidth, 0, +halfLength) = (−3, 0, +3)`.

> **Runtime behaviour:**  
> The model loader uses `centerModelOnDeckOrigin()` which derives the centring offset from
> the model's actual bounding box rather than trusting the pivot offsets above.  This means
> tiles with non-top-left pivots (e.g. the start/hole placeholders) are also positioned
> correctly.

---

## 5. Generation Modes

### 5.1 `double_row_straight`

**Default mode.**  Produces two parallel wall lanes around a shared centerline.  When
`allowCurves=false`, that centerline is a pure +Z straight path.  When
`allowCurves=true`, the centerline may make cardinal 90-degree turns and the solver places
paired curve pieces so later pieces continue along the new rotation.  Optional ramp rows
elevate the course by `RAMP_HEIGHT = 3` world units per ramp.

Entry point: `MapGenerationEndpoint.generateDoubleRowStraight()`  
Tile solver:  `TilePlacementSolver.solveDoubleRowStraightPath(cellCountZ, opts)`

**Scale note:** the convex/concave FBX files may be authored as 2x2 source-art tiles, but
runtime procgen still uses the existing world footprint (`TILE_LENGTH = 6`,
`TILE_WIDTH = 4`). The model loader scales art into that footprint; gameplay spacing,
physics, camera bounds, and pivot math are unchanged.

Grid layout (with one ramp row at z=2 as example):

```
+Z (forward)
↑
│  x=0 (left lane)              x=1 (right lane)
│
│  z=0   start_placeholder      start_placeholder       Y=0
│  z=1   straight_right_wall    straight_right_wall     Y=0  (rot=π) (rot=0)
│  z=2   ramp_left_wall         ramp_right_wall         Y=0→2  (both rot=0)
│  z=3   straight_right_wall    straight_right_wall     Y=2  (rot=π) (rot=0)
│  z=N   hole_placeholder       hole_placeholder        Y=2
│
└──────────────────────────────────────────────────────────────────────► +X
```

**Ramp row rules:**
- Only interior rows are eligible (not start/hole).
- 28 % chance per eligible row; max 2 ramp rows per course; 2-row cooldown after each ramp.
- Each ramp row is randomly **ascending** (slope up in +Z) or **descending** (slope down).
  Descending is only chosen when `currentElevation ≥ RAMP_HEIGHT` (course never dips below Y=0).
- Curved double-row maps only place ramps on straight interior centerline stations whose
  immediate previous and next stations are also straight. Ramps never sit next to a curve;
  curve stations and curve-adjacent stations remain flat and preserve the running elevation.

**Ascending ramp row** (`dir = "ascending"`):
```
right lane: ramp_right_wall  rotationY=0   (wall +X, slope up toward +Z)
left  lane: ramp_left_wall   rotationY=0   (wall −X, slope up toward +Z)
rowElevation[z] = currentElevation
currentElevation += RAMP_HEIGHT
```

**Descending ramp row** (`dir = "descending"`) — tile types swap sides so outer walls stay correct:
```
right lane: ramp_left_wall   rotationY=π   (−X local → +X world ✓, slope now descends in +Z)
left  lane: ramp_right_wall  rotationY=π   (+X local → −X world ✓, slope now descends in +Z)
rowElevation[z] = currentElevation − RAMP_HEIGHT   ← piece.position.y = low/exit end
currentElevation -= RAMP_HEIGHT
```

Why the swap for descending: `ramp_right_wall` at rot=π puts its wall on −X world (wrong for right lane).
Using `ramp_left_wall` at rot=π gives wall on +X world (correct outer right wall). Same logic for left lane.

Row count: `cellCountZ = interiorZCount + 2` (2 end strips).  
Interior strips: 5–12 (capped by `maxTiles`).

**Curve station rules (`allowCurves=true`):**
- The solver first generates a self-avoiding cardinal `spinePath`, stored in
  `debugInfo.spinePath`.
- Tile order is left lane then right lane for straight stations. Turn stations intentionally
  emit only the outside L-wall corner; the inside corner stays open so no wall appears in
  the middle of the hall.
- Each station computes its base rotation from the incoming centerline direction. This is
  the key rule that lets a curve's local exit socket define the new heading for following
  straight/ramp pieces.
- Centerline right turn: the outside/left lane emits one `convex_right_wall` corner.
- Centerline left turn: the outside/right lane emits one `convex_right_wall` corner.
- Straight stations keep the previous wall-side behavior generalized to the current
  centerline direction: right lane at `baseRotation`, left lane at `baseRotation + PI`.
- Curved maps are solved as a 2-wide occupied tile grid rather than a centerline with
  half-lane offsets. At turns the solver unions the incoming and outgoing 2-wide strips,
  deduplicates overlapping cells, and assigns each elbow cell by turn direction. The
  inner elbow cell becomes `floor_plain`, the side elbow cells stay straight, and the
  outside cell becomes the L-wall corner. This keeps every emitted tile center on the
  same square tile grid before and after bends.
- Right turns and left turns assign the inner/open and outer/corner cells differently:
  the solver uses the turn cross product to keep the no-wall `floor_plain` on the inside
  of the bend and the L-wall corner on the outside.
- Validation rejects any curved double-row map where a centerline turn is missing either
  its inner `floor_plain` or its outer `convex_right_wall`.
- Start/hole stations use the same shared L-wall asset as an end cap. The start cap closes
  the back of the corridor plus each outside wall; the hole cap closes the forward end plus
  each outside wall.

### 5.2 `single_path`

Single-file cardinal path, may include 90° turns.  
Solver: `solveTilesAlongPath()`.  Used when `layout = "single_path"`.

---

## 6. Double-Row Layout — Full Placement Math

### Solver step (`solveDoubleRowStraightPath`)

Elevation is precomputed per Z row before the main loop:

```
elevation[0] = 0
for z in 0..cellCountZ-1:
  elevation[z] = runningElev
  if z is a ramp row: runningElev += RAMP_HEIGHT
```

For each `(x, z)` cell pair:

```
isRampRow = rampRowSet.has(z)

if isRampRow:
  tileType  = (x===1) ? "ramp_right_wall" : "ramp_left_wall"
  rotationY = 0                   ← both lanes, not mirrored
else:
  tileType  = "straight_right_wall"
  rotationY = (x===1) ? 0 : π

xDeck = doubleRowDeckCenterX(x === 1)   // +2 or −2
zBase = (z − centerZ) × TILE_LENGTH

deckWorld   = (xDeck, elevation[z], zBase)   ← Y baked in
pivotOffset = rotateFlatOffset(def.pivotOffsetFromDeckOrigin, rotationY)
pivotWorld  = deckWorld + pivotOffset
```

`pivotWorld` (including Y) is stored in `PlacedTile.position`.

### Pivot world positions

```
Right lane (x=1, rot=0):
  pivot = (2, 0, zBase) + (−2, 0, +3) = (0, 0, zBase+3)
  tile covers  X=[0,+4],   Z=[zBase−3, zBase+3]

Left lane  (x=0, rot=π):
  pivotOffset rotated π → (+2, 0, −3)
  pivot = (−2, 0, zBase) + (+2, 0, −3) = (0, 0, zBase−3)
  tile covers  X=[−4, 0],  Z=[zBase−3, zBase+3]   ← same Z band ✓
```

Both tiles always share the same Z band.  The left tile's pivot is 6 units behind the
right tile's pivot — this is the "rotate 180° + move half-a-tile" relationship that
manual pivot-based placement requires.  The deck-centre framework handles it automatically.

### Recovering deck centre from pivot

```typescript
// TileCatalog.ts
deckCenterWorldFromPivot(pivot, rotationY, def):
  offset = rotateFlatOffset(def.pivotOffsetFromDeckOrigin, rotationY)
  return pivot − offset
```

The round-trip `deck → pivot → deck` is always exact regardless of which pivot offset is
stored in the catalog.

### Difficulty

```
sumWeights = Σ def.difficultyWeight  (interior tiles only)
difficulty = clamp( round(sumWeights / 2), 0, 10 )
```

The generator retries up to 30 candidates × 40 RNG seeds to hit the target difficulty ±1.

---

## 7. Model Loading Pipeline

All procgen art models go through this pipeline before being added to the Three.js scene.

### Step 1 — Scale to footprint (`scaleProcgenModelToWorldUnits`)

```typescript
scaleProcgenModelToWorldUnits(node, PROC_GEN_TILE_MODEL_EXTENT, ignoreHeight = true)
```

| Parameter | Value | Reason |
|-----------|-------|--------|
| `targetMaxExtent` | `PROC_GEN_TILE_MODEL_EXTENT = TILE_LENGTH = 6` | Full tile footprint |
| `ignoreHeight` | `true` | Use **Z span only** as scale denominator |

Scale formula when `ignoreHeight = true`:

```
span        = size.z   (forward extent of the model's bounding box)
scaleFactor = targetMaxExtent / span  =  6 / size.z
```

Using `size.z` (not `max(X,Y,Z)` or `max(X,Z)`) guarantees:

- **No row gaps:** `Z_after_scale = size.z × (6 / size.z) = 6 = TILE_LENGTH` always.
- **No wall shrinkage:** tall walls (large Y) do not reduce the ground footprint.
- **No rail bleed:** wide rails/caps (large X) do not reduce Z below TILE_LENGTH.

The original value of `PROC_GEN_MODEL_TARGET_MAX_EXTENT = 2` is kept for the debug slab
renderer (`DebugMapRenderer`) which intentionally draws small coloured placeholder boxes.

### Step 2 — Centre on deck origin (`centerModelOnDeckOrigin`)

```typescript
centerModelOnDeckOrigin(node, groundY = 0)
```

1. Reset `node.position` to `(0, 0, 0)`.
2. Recompute world AABB.
3. `node.position.x = −(box.min.x + box.max.x) / 2`  ← XZ centre → deck origin
4. `node.position.z = −(box.min.z + box.max.z) / 2`
5. `node.position.y = groundY − box.min.y`           ← snap bottom to ground

This replaces the former hard-coded `pivotOffsetFromDeckOrigin` placement.  
**Works correctly for any artist pivot** (top-left, centre, bottom-left, etc.).

### Step 3 — Attach to piece group

```typescript
const piece = new THREE.Group();
piece.position.set(deck.x, deck.y, deck.z);  // deck.y = entry elevation (0 on flat, RAMP_HEIGHT after a ramp)
piece.rotation.y = tile.rotationY;            // 0 (right lane) or π (left lane) for straights; 0 for ramps
piece.add(node);                              // node already centred at local origin
scene.add(piece);
```

Three.js applies `piece.rotation.y` to `node.position` when computing the world matrix.
`deck.y` carries the entry elevation: for ramp tiles the mesh bottom snaps to `piece.position.y`
(local Y=0 from `centerModelOnDeckOrigin`) and the top of the ramp mesh naturally reaches
`piece.position.y + RAMP_HEIGHT`.

### Asset keys

| TileType | Asset key | File |
|----------|-----------|------|
| `straight_right_wall` | `tile_straight_rw` | `tile_straight_rw.fbx` |
| `convex_right_wall`   | `tile_convex_rw`   | `tile_convex_rw.fbx` |
| `concave_right_wall`  | `tile_concave_rw`  | `tile_concave_rw.fbx` |
| `ramp_right_wall`     | `tile_ramp_rw`     | `tile_ramp_rw.fbx` |
| `ramp_left_wall`      | `tile_ramp_lw`     | `tile_ramp_lw.fbx` |
| `floor_plain`         | `tile_floor_plain` | `tile_floor_plain.fbx` |
| `start_placeholder`   | `tile_start_ph`    | `tile_start_ph.fbx` |
| `hole_placeholder`    | `tile_hole_ph`     | `tile_hole_ph.fbx` |

All FBX files live in `public/assets/models/`.  Missing files degrade gracefully
(registry logs a warning, `getModelClone()` returns `null`, tile falls back to procedural
mesh or is skipped in the debug viewer).

Corner-family FBXs (`tile_convex_rw`, `tile_concave_rw`, `tile_start_ph`, `tile_hole_ph`)
are authored as `210 x 210`, while straight/ramp wall assets are `210 x 200`.
They are scaled to a `6.3` world-unit full wall extent so their wall outside faces line up
with straight/ramp walls. The no-wall `floor_plain` asset remains a true `6 x 6` tile.

> Current corner art note: `tile_convex_rw.fbx` and `tile_concave_rw.fbx` both use the
> same simple 2x2 L-wall corner source (`tile7_corner.fbx`) with a top-left pivot and
> walls on the right and bottom. The logical tile types remain separate so procgen can
> keep socket/rotation semantics while rendering the simpler shared corner mesh.
> Start and hole placeholders also use this same corner mesh as visual end caps. Their
> tile types remain `start_placeholder` / `hole_placeholder`, but double-row placement
> rotates each lane so the outside wall and end wall close the corridor.

---

## 8. Socket System

Sockets define how tiles connect.  Directions are in **tile-local space before rotationY**.

```typescript
enum SocketDirection { PosZ=0, PosX=1, NegZ=2, NegX=3 }
```

| Type | Entry (local) | Exit (local) | World entry (rot=0) | World exit (rot=0) |
|------|---------------|--------------|---------------------|--------------------|
| straight / ramp / start / hole | NegZ | PosZ | −Z face | +Z face |
| convex_right_wall | NegZ | PosX | −Z face | +X face |
| concave_right_wall | NegZ | NegX | −Z face | −X face |

For the **left lane** (rotationY = π), world-space socket directions flip:
- Entry NegZ local → **PosZ** world (enters from the +Z / exit end in world)
- Exit  PosZ local → **NegZ** world

This is intentional — the two lanes face each other, both serving as corridor walls.
The ball travels along +Z in world space on both lanes.

Socket edge centres in deck-local space (for debug helpers):

```
NegZ face  → (    0, y, −halfLength)
PosZ face  → (    0, y, +halfLength)
NegX face  → (−halfWidth, y, 0)
PosX face  → (+halfWidth, y, 0)
```

---

## 9. Validation

`validateGeneratedMap()` checks:

- At least one `start_placeholder` and one `hole_placeholder`.
- All tile positions / rotations are finite.
- **double_row_straight:** path is `(0,z),(1,z)` pairs for z=0..N, no duplicates.
- **single_path:** each step is cardinal-adjacent (Manhattan distance = 1), no duplicates.
- `cameraBounds` has positive, finite, reasonable span (≤ 800 world units per axis).
- Tile count matches grid path length.

Camera bounds (`computeCameraBoundsFromTiles`) are computed from rotated tile footprints
plus a `TILE_LENGTH × 0.25` padding on each side.

---

## 10. Adapter — Procgen → Gameplay

`src/level/procgenLevelAdapter.ts`

Converts `GeneratedMap` → `GeneratedLevel` for `LevelBuilder`.

Key mapping:

| Procgen `tileType` | Legacy `type` |
|--------------------|---------------|
| `start_placeholder` | `"start"` |
| `hole_placeholder`  | `"hole"` |
| `straight_right_wall`, `ramp_*` | `"straight"` |
| `floor_plain` | `"floor"` |
| `convex_right_wall` | `"corner"` |
| `concave_right_wall` | `"corner"` |

World positions are recovered via `deckCenterWorldFromPivot()` and stored as
`tile.worldX / tile.worldZ`.  `LevelBuilder.buildInto()` places each tile's piece group
at `(worldX, 0, worldZ)` with `rotation.y = rotationY`.

`assetKeyOverride` carries the procgen model key through to `TileKit.tryAttachTileModel()`
so the FBX art is used instead of procedural geometry.

---

## 11. Debug Tooling

### Procgen Debug Viewer

URL parameter: `?procgenDebug=1`

Optional replay parameter: `?procgenDebug=1&procgenSeed=<seed>`. The toolbar shows
the current seed, can copy it, and can regenerate a map from a pasted seed.
Use `procgenDifficulty=1..20` or the toolbar difficulty input to preview progression.

### Difficulty Progression

`GenerateMapRequest.targetDifficulty` drives a 20-step `progressionProfile` in `MapGenerationEndpoint`.
The profile controls map length, turn density, ramp chance, minimum turns, and minimum ramp
stations. Low difficulty stays short/straight/flat; high difficulty allows longer courses,
requires more centerline turns, and forces legal ramp pairs when possible. Ramps are still
restricted to straight stations with straight neighbors, so the solver rejects candidates
that cannot satisfy the requested minimum ramp count without placing ramps beside curves.
The internal score shown to gameplay remains capped to 0..10, but geometry progression uses
levels 1..20; level 20 can generate substantially larger maps.

| Key | Action |
|-----|--------|
| `1–5` | Show single tile (straight / convex / concave / ramp_rw / ramp_lw) |
| `G`   | Generate and render a full `double_row_straight` map |
| `S`   | Toggle socket / pivot helper overlays |

### Socket Debug Helpers (`SocketDebugHelpers.ts`)

Draws per-tile:

| Marker | Colour | Position |
|--------|--------|----------|
| Pivot ball | 🔴 Red | Stored pivot world position (`PlacedTile.position`) |
| Entry ball | 🔵 Blue | Entry socket edge centre (deck-local, rotated to world) |
| Exit ball  | 🟢 Green | Exit socket edge centre |
| Entry arrow | Blue | Points inward through entry face |
| Exit arrow  | Green | Points outward through exit face |

### Debug Placeholder Slabs (`DebugMapRenderer.ts`)

Coloured 2 × 2 × 0.12 boxes rendered at each tile's **deck centre** (not pivot).  
Scale is fixed at `PROC_GEN_MODEL_TARGET_MAX_EXTENT = 2` — intentionally small so art
models are visible on top.

| TileType | Colour |
|----------|--------|
| `straight_right_wall` | 🟩 Green `#6ecf7a` |
| `convex_right_wall`   | 🟨 Amber `#ffc857` |
| `concave_right_wall`  | 🟦 Blue  `#6ab0ff` |
| `ramp_right_wall`     | 🟣 Purple `#d96cff` |
| `ramp_left_wall`      | 🩷 Pink   `#ff6bcd` |
| `start_placeholder`   | ⬜ White  `#ffffff` |
| `hole_placeholder`    | ⬛ Black  `#222222` |

---

## 12. File Map

```
src/procgen/
├── MapGenerationEndpoint.ts      Entry point; mode dispatch; difficulty search
├── MapGenerationTypes.ts         TileType, SocketDirection, PlacedTile, GeneratedMap
├── TileCatalog.ts                TILE_CATALOG, pivot offsets, rotateFlatOffset,
│                                 deckCenterWorldFromPivot, doubleRowDeckCenterX
├── TilePlacementSolver.ts        solveDoubleRowStraightPath, solveTilesAlongPath,
│                                 generateRandomPath, buildCollinearPath
├── GeneratedMapValidator.ts      validateGeneratedMap, computeCameraBoundsFromTiles
├── procgenAssetKeys.ts           PROCGEN_TILE_TO_ASSET, PROCGEN_PRELOAD_KEYS
├── procgenModelScale.ts          scaleProcgenModelToWorldUnits (ignoreHeight param),
│                                 measureRampExitFloorY, snapRampExitFloorToHeight,
│                                 centerModelOnDeckOrigin, PROC_GEN_TILE_MODEL_EXTENT
├── DebugMapRenderer.ts           createDebugPlaceholderGroup (2×2 coloured slabs)
├── ProcgenDebugViewer.ts         Dev scene (?procgenDebug=1), keyboard controls
├── SocketDebugHelpers.ts         Per-tile pivot/entry/exit visualisers
└── bootstrapProcgenDebug.ts      Preloads all procgen assets for the debug scene

src/level/
├── procgenLevelAdapter.ts        GeneratedMap → GeneratedLevel adapter
├── LevelBuilder.ts               Iterates tiles, creates piece groups at worldX/Z
└── tiles/
    └── TileKit.ts                tryAttachTileModel: scale + centerModelOnDeckOrigin
```

---

## 13. Changelog

### 2026-05-01 - Double-row curves

**Feature - default procgen can bend**

`solveDoubleRowStraightPath` now accepts `allowCurves`. When enabled, it generates a
cardinal `spinePath` and places two wall pieces per centerline station, preserving the
existing no-curve branch when disabled.

**Curve attachment rule**

Curve tile rotation is based on the incoming direction, not the outgoing direction. A
right turn places `convex_right_wall` on the right side and `concave_right_wall` rotated by
PI on the left side; a left turn swaps those types. The next station then uses the new
centerline direction, so straight/ramp pieces attach after the bend without a manual offset.

**Validation / adapter**

Curved double-row maps store `debugInfo.spinePath` for centerline validation while keeping
`debugInfo.gridPath` aligned with emitted tile order for the gameplay adapter. Inner turn
tiles are intentionally omitted, so curved maps may have fewer than two tiles per
centerline station. Curved tiles can carry fallback rail metadata so physics/debug rails
still have the intended bend signs.

### 2026-05-01 — Ramp direction fix + vertical gap fix

**Problem — only ascending (or only descending) ramps generated**  
The first ramp implementation always used rotationY=0 for both lanes, producing only one
slope direction.  Additionally, rotating `ramp_right_wall` by π reverses the slope in world
space AND puts the wall on the wrong side, so the fix requires swapping tile types:

| Direction | Right lane | Left lane |
|-----------|-----------|-----------|
| Ascending  | `ramp_right_wall` rot=0 | `ramp_left_wall` rot=0 |
| Descending | `ramp_left_wall` rot=π  | `ramp_right_wall` rot=π |

*Fix:* Solver decision pass now randomly chooses ascending or descending per ramp row
(descending only when `currentElevation ≥ RAMP_HEIGHT`).  Descending rows swap tile types
and use rot=π; `rowElevation[z] = currentElevation − RAMP_HEIGHT` (piece sits at the low/exit end).

---

**Problem — vertical gap between ramp top and next straight**  
After Z-based uniform scaling (`size.z → TILE_LENGTH`), the ramp mesh exit-floor Y must
equal `RAMP_HEIGHT` exactly. The current 2×2 ramp source rises 1 source unit, so after
scaling to `TILE_LENGTH = 6` its world rise is `RAMP_HEIGHT = 3`.

*Failed fix 1:* `snapModelHeightToWorldUnits` — scaled only the Y axis to force total height
to RAMP_HEIGHT.  Squished the wall visually (wall shorter than straight tiles).

*Failed fix 2:* `correctRampModelScale` — measured straight tile `box.max.y` as wall height,
subtracted to isolate slope, applied uniform scale correction.  Broke when the straight
reference model wasn't loaded yet (returns 0, correction factor ~0.5 → everything shrinks 50%
and horizontal gaps appear too).

*Fix (current):* **Vertex-sampling Y translation** — no change to any scale axis.

`measureRampExitFloorY(root, exitZFraction=0.15)` traverses all mesh vertices and returns
the minimum Y among those within the outermost 15 % of the Z bounding box (the exit face).
This isolates the floor surface at the high end of the slope, ignoring wall tops and caps.

`snapRampExitFloorToHeight(root, RAMP_HEIGHT)` calls `measureRampExitFloorY` then applies:
```
root.position.y += RAMP_HEIGHT − measuredExitFloorY
```
This is a pure Y translation (zero deformation).  The exit floor lands exactly at
`RAMP_HEIGHT` in the model's local space, which maps to world Y = `worldY + RAMP_HEIGHT`
for the piece group — matching the next tile's floor exactly.  The entry end shifts by the
same small amount; if the model's slope/Z ratio is close to `RAMP_HEIGHT/TILE_LENGTH` (as
a well-authored model should be) this offset is imperceptible.

---

### 2026-05-01 — Ramp elevation in double-row layout

**Feature — ramp rows in `double_row_straight`**

`solveDoubleRowStraightPath` now accepts `SolveDoubleRowOptions { allowRamps, rng }`.
When `allowRamps = true`, interior Z rows have a 28 % chance to become ramp rows (max 2
per course, with a 2-row cooldown between ramps).

**Slope direction problem and fix**

Rotating `ramp_right_wall` by π (as done for straight left-lane tiles) reverses the ramp's
slope in world space — the tile would slope *down* while the right tile slopes *up*.
Fix: ramp rows use **two distinct tile types both at rotationY=0**:
`ramp_right_wall` (wall on +X) for the right lane and `ramp_left_wall` (wall on −X) for
the left lane.  Both slope upward in the +Z world direction.

**Elevation tracking**

`TileDefinition` gained `exitElevationDelta: number` (0 for flat tiles, `RAMP_HEIGHT = 3`
for ramp tiles).  The solver precomputes `rowElevation[z]` and stores the Y value in
`PlacedTile.position.y`.  `deckCenterWorldFromPivot` propagates it correctly since
`pivotOffsetFromDeckOrigin.y = 0` for all tiles.

**Y propagation through the pipeline**

| Location | Change |
|----------|--------|
| `TileCatalog.ts` | Added `exitElevationDelta` field to `TileDefinition` and all catalog entries |
| `TilePlacementSolver.ts` | Double-row: precompute `rowElevation[]`, bake into `deckScratch.y`. Single-path: `deckScratch.y = currentElevation`, increment by `def.exitElevationDelta` each step |
| `MapGenerationEndpoint.ts` | Pass `{ allowRamps, rng }` to `solveDoubleRowStraightPath`; use `deck.y` in start/hole world positions |
| `ProcgenDebugViewer.ts` | `piece.position.set(deck.x, deck.y, deck.z)` |
| `LevelTypes.ts` | Added `worldY?: number` to `PlacedTile` |
| `LevelBuilder.ts` | `piece.position.set(tile.worldX, tile.worldY ?? 0, tile.worldZ)` |
| `procgenLevelAdapter.ts` | Set `worldY: deck.y` on game tile when non-zero |

---

### 2026-05-01 — Initial procgen implementation + alignment fixes

**Problem 1 — Scale mismatch (tiles appeared tiny and displaced)**  
`scaleProcgenModelToWorldUnits` defaulted to `targetMaxExtent = 2`.  After scaling, models
were ~2 world units but `pivotOffsetFromDeckOrigin = (−2, 0, +3)` assumed a 4×6 tile.
Models appeared as tiny quads floating several units from their correct position.

*Fix:* Added `PROC_GEN_TILE_MODEL_EXTENT = TILE_LENGTH = 6` and pass it as the target to
all tile-model scale calls in `TileKit.tryAttachTileModel` and `ProcgenDebugViewer.cloneTileModel`.

---

**Problem 2 — Start/hole tiles displaced (wrong artist pivot)**  
`tryAttachTileModel` applied `node.position.copy(pivotOffsetFromDeckOrigin)` = `(−2, 0, +3)`
to every model.  Straight tiles were authored with a top-left pivot so this happened to
work.  The start and hole placeholder FBX files were authored with a different pivot (likely
centre), causing them to appear displaced from the corridor.

*Fix:* Replaced the hard-coded pivot offset with `centerModelOnDeckOrigin()` — a
bounding-box-based function that centres any model's XZ footprint on the deck origin and
snaps its bottom to Y = 0.  The pivot offset approach is retained in the catalog only for
the socket debug helper markers.

---

**Problem 3 — Small gap between consecutive Z rows**  
`scaleProcgenModelToWorldUnits` used `Math.max(size.x, size.y, size.z)` as the span.  If
wall height (Y) > TILE_LENGTH, the model was scaled down, making Z < 6 and leaving a
visible gap.  Even with `ignoreHeight = true` (introduced in the same session), using
`Math.max(size.x, size.z)` could still under-scale Z when rail caps or decorative elements
made X > Z in the bounding box.

*Fix:* When `ignoreHeight = true`, use `size.z` directly as the scale denominator.  
`scaleFactor = TILE_LENGTH / size.z` guarantees Z = TILE_LENGTH = 6 after scaling,
eliminating all row gaps regardless of model proportions or decoration.
