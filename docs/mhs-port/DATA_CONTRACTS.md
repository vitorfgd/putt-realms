# Data contracts (freeze for MHS port)

Canonical shapes used to describe a **playable hole** after procgen + adaptation. Source types live in `src/level/LevelTypes.ts`, `src/hazards/HazardTypes.ts`, and procgen types in `src/procgen/MapGenerationTypes.ts`.

## Principles

1. **Identifiers**: Renaming fields below requires a **migration note** and dual-read period if saved levels exist.
2. **Units**: World space uses **meters-like** world units consistent with `TILE_LENGTH` / `TILE_WIDTH` (see [`../PROCGEN.md`](../PROCGEN.md)); angles are **radians** unless otherwise noted.
3. **Optional fields**: Omit vs `undefined` behavior should match TS consumption in `Game` / physics.

---

## `GeneratedLevel` (gameplay hole)

Logical aggregate produced by `adaptProcgenMapToGeneratedLevel` or legacy `LevelGenerator`.

| Field | Type | Notes |
|-------|------|--------|
| `id` | `string` | Stable level instance id |
| `levelIndex` | `number` | Player-facing progression step |
| `difficultyScore` | `number` | 0–10 computed |
| `targetDifficulty` | `number` | HUD / pricing |
| `imperfectDifficulty` | `boolean?` | Procgen missed ±1 match |
| `hazardSpecs` | `HazardSpawnSpec[]` | Spawn list |
| `tiles` | `PlacedTile[]` | Includes start/hole path order semantics via array index |
| `startPosition` | `{x,y,z}` | Tee |
| `holePosition` | `{x,y,z}` | Cup target |
| `bounds` | `LevelWorldBounds` | xz camera / OOB framing |
| `surface` | `CourseSurface` | Support for physics |
| `procgenDebugInfo` | `Record<string, unknown>?` | Loose; do not rely on keys in shipping logic |
| `procgenSeed` | `string?` | Replay |
| `progressionLevel` | `number?` | 1–20 profile |
| `par` | `number` | Stroke expectation |
| `realmId` | `string` | Theme bucket |
| `progressionSummary` | `ProgressionSummary?` | Realm display |
| `dailyChallengeId` / `weeklyChallengeId` | `string?` | Challenge hooks |
| `collectibles` | `CollectibleSpec[]` | Coins etc. |
| `railColliders` | `RailCapsule[]` | Physics rails |

**AI may**: add **optional** debug fields under `procgenDebugInfo`; tune numeric ranges that **do not** break deserialization.

**AI must not**: rename `tiles` ↔ `pieces`, collapse `surface.patches` without updating physics, or remove `railColliders` without replacing collision.

---

## `PlacedTile`

| Field | Type | Notes |
|-------|------|--------|
| `type` | `TileType` | `start \| straight \| floor \| curve \| corner \| hole` |
| `gridX`, `gridZ` | `number` | Integer logical grid |
| `worldX`, `worldZ` | `number` | Deck center xz |
| `worldY` | `number?` | Elevated deck (ramps) |
| `railOriginX`, `railOriginZ` | `number?` | Hazard/rail origin override |
| `rotationY` | `number` | Yaw |
| `stationIndex` | `number?` | Procgen centerline station |
| `isRamp` | `boolean?` | Ramp geometry |
| `hazardSafe` | `boolean?` | false → no random hazards |
| `railS` | `{sx,sz}?` | Corner outer rail signs |
| `railSides` | `string[]?` | Legacy wall labels |
| `railWorldSides` | `{x,z}[]?` | Procgen exposed normals |
| `assetKeyOverride` | `AssetKey?` | Model catalog key |

---

## `HazardSpawnSpec`

| Field | Type | Notes |
|-------|------|--------|
| `id` | `string` | Unique |
| `kind` | `HazardKind` | See below |
| `tileIndex` | `number` | Index into `tiles[]` |
| `weight` | `number` | Telemetry / tuning |
| `fanSign` | `1 \| -1?` | Fan push lateral flip |
| `portalPairId` | `string?` | Two specs share id |
| `portalRole` | `"a" \| "b"?` | Pair endpoint |

### `HazardKind` (closed set)

`windmill`, `sandpit`, `fan`, `bridge`, `axe`, `boost`, `bumper_mushroom`, `portal_gate`

**AI may**: add a new kind **only** with matching spawn code, MHE prefab, physics hook, and weight table update.

---

## `RailCapsule`

| Field | Type |
|-------|------|
| `ax`, `az`, `bx`, `bz` | `number` |
| `yMin`, `yMax` | `number?` |

Segment in xz with optional vertical band for rail–ball tests.

---

## `CourseSurface` / `CourseSurfacePatch`

`CourseSurface`: `{ patches: CourseSurfacePatch[] }`

`CourseSurfacePatch`:

| Field | Type |
|-------|------|
| `kind` | `"flat" \| "ramp"` |
| `cx`, `cz`, `y` | `number` |
| `halfWidth`, `halfLength` | `number` |
| `rotationY` | `number` |
| `lowY`, `highY` | `number?` (ramp) |

Physics samples height + ramp gradient from patches.

---

## `CollectibleSpec`

| Field | Type |
|-------|------|
| `id` | `string` |
| `tileIndex` | `number` |
| `stationIndex` | `number?` |
| `x`, `y`, `z` | `number` |
| `value` | `number` |
| `collected` | `boolean?` |

---

## Procgen-native `GeneratedMap` (pre-adapter)

Used inside TS generator; adapter converts to `GeneratedLevel`.

| Field | Notes |
|-------|--------|
| `tiles` | Procgen `PlacedTile` with `tileType` enum (`straight_right_wall`, …) |
| `debugInfo.gridPath` | Required for adapter |
| `debugInfo.layout`, `spinePath` | Curved double-row |

Porting **without** running TS procgen in-world: serialize **`GeneratedLevel`** (or a strict subset) as the interchange format.

---

## JSON interchange (recommended)

Define `level.v1.json` later with the same fields as `GeneratedLevel`, using:

- Explicit required arrays (`tiles`, `hazardSpecs`, `surface.patches`, `railColliders`)
- No `unknown` maps in shipping payloads (keep debug optional top-level `debug?: object`)

Optional JSON Schema folder was suggested in the port plan; add when you start saving levels to disk or cloud.
