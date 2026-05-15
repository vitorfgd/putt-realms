# Porting Putt Realms off Three.js

When you start a real engine port, treat this file as the **index** and keep the linked artifacts current.

- **[THREE_INVENTORY.md](./THREE_INVENTORY.md)** — Geometry-heavy modules, loaders, `AnimationMixer`, `Raycaster`, cameras, and other Three-only surfaces to replace or wrap.
- **[AUDIT_LOG.md](./AUDIT_LOG.md)** — Subsystem summaries, dual-path notes (procgen vs legacy), and actions already taken during the maintenance roadmap.

**Simulation-first targets** (from audits): `SimpleBallPhysics`, `courseSurface`, `DragShotInput` ray–plane math, `LevelTypes` DTOs, `RunStateMachine`, procgen map types in `MapGenerationTypes.ts`.

**Presentation-only** (can stay on WebGL longer or reimplement): `TileKit`, hazard meshes in `implementations.ts`, `PsxLowResPresenter`, HUD DOM in `Hud` / `GameOverlays`.
