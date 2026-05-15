# Data contracts (freeze for MHS port)

Canonical shapes used to describe a **playable hole** after procgen + adaptation. Source types live in `src/level/LevelTypes.ts`, `src/level/GeneratedLevelV1.ts`, `src/hazards/HazardTypes.ts`, `src/hazards/HazardSimulationContract.ts`, and procgen types in `src/procgen/MapGenerationTypes.ts`.

## Principles

1. **Identifiers**: Renaming fields below requires a **migration note** and dual-read period if saved levels exist.
2. **Units**: World space uses **meters-like** world units consistent with `TILE_LENGTH` / `TILE_WIDTH` (see [`../PROCGEN.md`](../PROCGEN.md)); angles are **radians** unless otherwise noted.
3. **Optional fields**: Omit vs `undefined` behavior should match TS consumption in `Game` / physics.

---

## `GeneratedLevelV1` (MHS interchange)

`GeneratedLevelV1` is the strict shipping projection for MHS and serialized level handoff. Use `toGeneratedLevelV1(level)` after `adaptProcgenMapToGeneratedLevel`.

It keeps gameplay fields from `GeneratedLevel` but intentionally excludes:

- `procgenDebugInfo`
- `procgenSourceMap`
- any other `Record<string, unknown>` debug payloads

The schema id is `putt-realms.generated-level.v1`.

---

## `GeneratedLevel` (web gameplay hole)

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
| `procgenDebugInfo` | `Record<string, unknown>?` | Web/debug only; excluded from `GeneratedLevelV1` |
| `procgenSeed` | `string?` | Replay |
| `progressionLevel` | `number?` | 1–20 profile |
| `par` | `number` | Stroke expectation |
| `realmId` | `string` | Theme bucket |
| `progressionSummary` | `ProgressionSummary?` | Realm display |
| `dailyChallengeId` / `weeklyChallengeId` | `string?` | Challenge hooks |
| `collectibles` | `CollectibleSpec[]` | Coins etc. |
| `railColliders` | `RailCapsule[]` | Physics rails |

**AI may**: add **optional** debug fields under `procgenDebugInfo`; tune numeric ranges that **do not** break deserialization.

**AI must not**: rename `tiles` <-> `pieces`, collapse `surface.patches` without updating physics, remove `railColliders` without replacing collision, or add unknown maps to `GeneratedLevelV1`.

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

`windmill`, `sandpit`, `fan`, `bridge`, `boost`, `bumper_mushroom`, `portal_gate`

**AI may**: add a new kind **only** with matching spawn code, MHE prefab, physics hook, and weight table update.

---

## Hazard simulation contract

`src/hazards/HazardSimulationContract.ts` describes the portable behavior for each closed-set `HazardKind` independent of Three meshes. Use it to decide which MHS prefab/component behavior is required:

| Effect | Meaning |
|-------|---------|
| `blocks` | Timed or static obstacle collision |
| `slows` | Friction/velocity damping area |
| `pushes` | Directional acceleration/force field |
| `narrows` | Bridge or lane-width constraint |
| `boosts` | Speed impulse/acceleration |
| `bounces` | Elastic collision/impulse |
| `teleports` | Paired portal transfer |

Current web hazard classes remain visual/runtime implementations. The MHS port should implement this contract with engine components and imported prefabs.

---

## `ShotIntent`

`src/input/ShotIntent.ts` is the engine-neutral output of any input adapter. The current web adapter uses pointer events and Three raycasting internally, but only emits:

| Field | Type | Notes |
|-------|------|-------|
| `directionXZ` | `{x,y}` | Planar shot direction where `x` is world x and `y` is world z. |
| `power01` | `number` | Clamped 0-1 power fraction. |
| `startWorld` | `{x,y,z}` | Ball position when the shot is released. |
| `source` | `"pointer" \| "controller" \| "keyboard" \| "replay"` | Input source for telemetry/replay. |

MHS input should produce the same DTO from controller/hand/ray interactions without carrying over Three `Raycaster`.

---

## Render world state

`src/mhs/RenderWorldState.ts` describes the future 3D adapter boundary. It is planning-only for now and contains no MHS API imports.

| Type | Purpose |
|-------|---------|
| `RenderWorldState` | Level id, camera state, and desired world object list. |
| `WorldObjectState` | Stable `objectId`, stable `templateId`, transform, visibility, lifetime, replication, tags. |
| `TransformState` | Plain position, quaternion rotation, and scale. |
| `CameraState` | Presentation-only camera mode, position, target/rotation, FOV, optional shake. |

`objectId` is runtime instance identity. `templateId` is the prefab/template key. Never use one as the other.

Replication intent:

- `sharedGameplay`: tiles, hazards, ball, collectibles.
- `localCosmetic`: aim line, particles, debug gizmos, backdrop helpers, local-only VFX.

---

## Game events

`src/mhs/GameEvents.ts` defines serializable event intent for future audio, UI, persistence, and telemetry adapters. Events should remain plain JSON-compatible data. Future MHS audio should map stable sound IDs to named AudioHub children or template-local sound components.

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

Porting **without** running TS procgen in-world: serialize **`GeneratedLevelV1`** as the interchange format.

---

## JSON interchange (recommended)

`GeneratedLevelV1` is the current code-level contract. Add a JSON Schema file later when levels are saved to disk or cloud, using:

- Explicit required arrays (`tiles`, `hazardSpecs`, `surface.patches`, `railColliders`)
- No `unknown` maps in shipping payloads

Optional JSON Schema folder was suggested in the port plan; add when you start saving levels to disk or cloud.
