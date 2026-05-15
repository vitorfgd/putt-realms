import { publicUrl } from "../core/publicPath";

/**
 * Yip portrait + dialogue frame URLs. Copy PNGs from your art pack into
 * `public/assets/ui/yip/` using these filenames (see `public/assets/ui/yip/README.md`).
 */
export type YipExpression =
  | "smile"
  | "laugh"
  | "excited"
  | "smug"
  | "cheerful"
  | "idea"
  | "loving"
  | "worried"
  | "surprised"
  | "angry"
  | "confident"
  | "affectionate"
  | "victory"
  | "apologetic"
  | "reward_coins"
  | "celebrating";

const BASE = publicUrl("assets/ui/yip");

export const YIP_DIALOGUE_FRAME = `${BASE}/dialogue_frame.png`;

export const YIP_EXPRESSION_URL: Record<YipExpression, string> = {
  smile: `${BASE}/smile.png`,
  laugh: `${BASE}/laugh.png`,
  excited: `${BASE}/excited.png`,
  smug: `${BASE}/smug.png`,
  cheerful: `${BASE}/cheerful.png`,
  idea: `${BASE}/idea.png`,
  loving: `${BASE}/loving.png`,
  worried: `${BASE}/worried.png`,
  surprised: `${BASE}/surprised.png`,
  angry: `${BASE}/angry.png`,
  confident: `${BASE}/confident.png`,
  affectionate: `${BASE}/affectionate.png`,
  victory: `${BASE}/victory.png`,
  apologetic: `${BASE}/apologetic.png`,
  reward_coins: `${BASE}/reward_coins.png`,
  celebrating: `${BASE}/celebrating.png`,
};
