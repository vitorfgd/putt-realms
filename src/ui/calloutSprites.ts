import { publicUrl } from "../core/publicPath";

/**
 * Full-screen completion callouts — drop matching PNGs under `public/assets/ui/`.
 * Missing files fall back to large HUD text (see Hud).
 */
export const CALLOUT_SPRITES = {
  holeInOne: publicUrl("assets/ui/callout_hole_in_one.png"),
  cleanShot: publicUrl("assets/ui/callout_clean_shot.png"),
  outOfBounds: publicUrl("assets/ui/callout_oob.png"),
  streak: (tier: 2 | 3 | 4 | 5) =>
    publicUrl(`assets/ui/callout_streak_x${tier}.png`),
} as const;
