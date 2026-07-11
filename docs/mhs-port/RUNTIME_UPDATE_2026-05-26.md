# Runtime update - 2026-05-26

This note records the MHS-side gameplay and UI changes made on May 26, 2026. The active implementation lives under `putt_realms/scripts/puttrealms`; this doc is a handoff snapshot for future MHS/UI/economy work.

## Run summary and rewards

- The run summary uses the realm screen background and a lower frame position so the top badge/Yip peek have room.
- A centered `LEVEL X` label is rendered under the `RUN SUMMARY` header with a black outline.
- Summary stat rows now use a compact fixed vertical rhythm so optional rows (`Hole in One`, `Par Streak`, `Treasure Chest`) do not push `Total Earnings` into the shop button.
- `RunSummaryState` now carries `level`, `coinsBalance`, and treasure chest reward data so the summary can display the current level and live coin balance.
- The treasure chest unlock is automatic when the three-game goal is reached. Unlocking grants `40` coins, resets chest progress, and persists the reset.
- Chest coins now float briefly, then fly into the top coin badge while the displayed coin total increments.
- The run summary and store use `hud_topbar_coins.png` for coin totals instead of a loose coin icon plus text.
- A `NEXT LEVEL LOADING` / `NEXT LEVEL READY` label appears below the summary loading bar.

## Yip integration

- The initial loading screen cycles Yip gameplay tips in the same panel style used in game.
- Yip peeks from behind the logo on the initial loading screen, alternating left/right with different expressions.
- The same peek animation is used behind the run summary frame, positioned farther left/right so it does not collide with the coin badge.
- The FTUE dialogue panel now places `YIP` above the portrait, uses black title/body text, and positions the portrait lower/right to avoid showing unwanted lower cutout.
- Sparse gameplay Yip moments remain preferred; avoid triggering reaction bubbles on every clean shot or hole-in-one.

## Camera and movement polish

- The opening route overview is slower: preview duration is now `1.15s`.
- The custom course camera applies a preview-only FOV bonus of `+8` degrees, then fades back to normal during the transition to gameplay.
- Camera yaw is normalized instead of clamped, so players can keep orbiting rather than hitting a rotation limit.
- Portal exits apply a small minimum horizontal impulse so the ball is less likely to stop on a portal and bounce between endpoints.

## Open follow-ups

- Undermap island clipping/spawn-inside reports still need a dedicated fix and regression seed coverage.
- The `40` coin chest reward is a tuning constant; revisit once final chest reward art and economy pacing are decided.
- Layout polish should be checked on tall and short portrait canvases whenever the summary/store frames move.
