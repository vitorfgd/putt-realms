# Snackable / Quickplay alignment checklist

Cross-check against Meta’s **Snackable Games & AI Templates** external developer guide (deprecated copy may live under your `Documentation` folder). This Putt Realms prototype is **not** trimmed to snackable shipping constraints yet; use this as a **gap list** when targeting IG/Facebook Quickplay-style distribution.

## Experience

| Guide emphasis | Putt Realms today | Notes |
|----------------|-------------------|--------|
| Short sessions (20s–7min; ideal 1–2min) | Progression holes vary | Tune par + levelgen length caps |
| Portrait-first | Procgen limits horizontal span | Already partly addressed |
| One-finger / minimal input | Drag-to-shoot | Fits; verify MHE pointer model |
| Minimal tutorial | Level 1 tutorial branch | OK pattern |
| Strong feedback (audio/VFX) | Present | Reimplement per MHE UX |

## Technical footprint

| Guide emphasis | Putt Realms today | Notes |
|----------------|-------------------|--------|
| Small download (~35MB guardrail cited in guide) | Web bundle + many GLBs | Audit asset sizes; LOD; lazy load |
| Simple core mechanic | Putting | Good AI-template core |
| Structured data for variation | `GeneratedLevel`, seeds | Aligns with “AI Template” shallow edits |

## AI template boundaries

| Guide emphasis | Putt Realms recommendation |
|----------------|---------------------------|
| AI edits shallow layers | Theme swaps via `AssetKey` tables; tuning constants |
| Preserve core mechanic | Keep physics + surface + hazard contracts stable ([`DATA_CONTRACTS.md`](./DATA_CONTRACTS.md)) |
| Avoid AI mesh surgery | [`MANUS_AND_AI_BOUNDARIES.md`](./MANUS_AND_AI_BOUNDARIES.md) |

## Action items when prioritizing snackables

1. Cap **max tiles / difficulty** for Quickplay build flavor.
2. Strip or defer **non-core** decor loads.
3. Replace DOM HUD with **platform UI** pattern suitable for mobile preview.
4. Add **instant replay / seed copy** in minimal UI (already have procgen seed hooks—surface in HUD/tooling).

## Disclaimer

Program requirements change; verify dimensions, size budgets, and certification steps against **current** Meta partner documentation before submission.
