# Putt Realms (web prototype)

Vite + Three.js miniature golf prototype with **seed-driven procedural maps** (`src/procgen/`) and a **built-in procgen debug viewer** for layout QA.

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173/`).

## Documentation

| Doc | Contents |
|-----|----------|
| [**docs/HANDOFF_MESSAGE.md**](docs/HANDOFF_MESSAGE.md) | Short message you can paste for the next developer (onboarding + procgen debug). |
| [**docs/PROCGEN_DEBUG.md**](docs/PROCGEN_DEBUG.md) | **Procgen debug mode**: URLs, toolbar, keyboard, what is rendered, adapter quirks. |
| [**docs/PROCGEN.md**](docs/PROCGEN.md) | Full procedural generation technical reference (solver, tiles, validation, adapter). |
| [**docs/mhs-port/**](docs/mhs-port/README.md) | Optional Meta Horizon port notes (engine-agnostic contracts). |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Preview production build |
| `npm test` | Vitest (`src/procgen/procgen.smoke.test.ts`) |
| `npm run lint` | ESLint |

## Procgen debug (TL;DR)

Append **`?procgenDebug`** to the app URL (while running `npm run dev`). Example:

`http://localhost:5173/?procgenDebug&procgenDifficulty=10&procgenSeed=your-seed-here`

Full reference: [**docs/PROCGEN_DEBUG.md**](docs/PROCGEN_DEBUG.md).

## Assets

Place models under **`public/assets/models/`** as keyed in [`src/art/AssetRegistry.ts`](src/art/AssetRegistry.ts). Missing files log warnings and fall back where possible.
