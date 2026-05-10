# Conceptual mapping: Three.js prototype → Meta Horizon Engine

This document is **conceptual only**. It does **not** specify real `meta/worlds` APIs (those change). Use official MHS documentation when implementing.

## Parity goal

Preserve **behavior** defined by:

- `GeneratedLevel` and related types ([`DATA_CONTRACTS.md`](./DATA_CONTRACTS.md))
- Physics semantics (surface height, ramp downhill bias, rail capsules)
- Hazard contracts (tile-local regions, impulses, portals)

Replace **presentation** (Three loaders, meshes, materials) with MHE entities, templates, and engine physics/audio.

## Scene graph

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| `THREE.Scene` + groups per tile/hazard | World with **entities**; course root entity parenting tile instances |
| `THREE.Mesh` / GLTF subtree under tile group | **Template** or prefab instantiated per tile; mesh components on child entities |
| Per-frame `mesh.rotation` / shader uniforms | Prefer **cached component handles**; batch updates; avoid TS↔native chatter every frame |

**Bridge cost**: Meta’s internal best-practice docs stress that **TypeScript ↔ native (C++) component calls are expensive**. Patterns that touch transforms or meshes every frame from TS should be minimized—cache references at create time, update only what changed, and prefer engine-side animation where possible.

## Assets

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| `AssetRegistry` + `ASSET_FILENAMES` keys | Stable **template asset** references or IDs mapped 1:1 from registry keys |
| `FBXLoader` / `GLTFLoader` | Studio asset pipeline (import once; runtime spawn from template) |
| `getModelClone(key)` | Instantiate from template / pooled instances—verify against current duplication API |

See [`ASSET_PIPELINE.md`](./ASSET_PIPELINE.md) for naming and pivot rules that survive the engine change.

## Level instantiation

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| `LevelBuilder.buildInto` + `TileKit` | Spawner component or service: iterate `tiles[]`, set transform from `worldX/Y/Z`, `rotationY`, attach gameplay components |
| `assetKeyOverride` on `PlacedTile` | Select which prefab variant to spawn |
| Collectibles / hazards child groups | Separate prefabs or components keyed by spec |

## Physics

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| `SimpleBallPhysics` + `sampleCourseSurface` | Native rigid body + collision surfaces **or** scripted integration that mirrors the same patch math |
| `RailCapsule` segments | Capsule/cylinder colliders per segment; respect `yMin`/`yMax` bands |
| Ball `position` as contact-centric representation today | Align MHE collider + visual so **the same numeric contract** (surface height queries) holds—verify in QA |

## Input

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| Pointer drag on horizontal plane at ball height | MHE pointer / hand ray / thumbstick—reproduce **same shot vector** and dead zones |
| Title screen gesture for audio unlock | Platform-specific audio rules |

## UI / HUD

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| DOM HUD (`Hud.ts`) | Noesis XAML or platform UI—same **state model** (strokes, seed, coins) |

## Debugging

| Web prototype | MHE direction (conceptual) |
|---------------|----------------------------|
| `?procgenDebug=1` separate viewer | Editor utility scene or dev-only component gated by build flavor |

## Anti-patterns when using AI on this port

- Asking an agent to “translate Three.js scene graph code line-by-line” into MHE without prefabs.
- Inventing `meta/worlds` imports—always verify against the **studio version** you target.
- Mixing **mesh editing** with **gameplay math** in one task; split responsibilities ([`MANUS_AND_AI_BOUNDARIES.md`](./MANUS_AND_AI_BOUNDARIES.md)).
