import type { YipExpression } from "./yipFtueAssets";

export interface FtueIntroLine {
  expression: YipExpression;
  title: string;
  /** Plain text; double newlines become separate paragraphs */
  body: string;
}

/** First-hole guided copy — paired with portraits in {@link ../ui/yipFtueAssets}. */
export const FTUE_INTRO_SCRIPT: FtueIntroLine[] = [
  {
    expression: "smile",
    title: "Welcome!",
    body: "I'm Yip. This lane is practice only — you'll learn the basics fast.",
  },
  {
    expression: "idea",
    title: "That ring is the goal",
    body: "Roll into the portal to finish. No cup here.",
  },
  {
    expression: "idea",
    title: "Pull back to aim",
    body: "Drag from the ball, release to shoot. Check the preview, then putt.",
  },
  {
    expression: "worried",
    title: "Skip the purple mushrooms",
    body: "They bounce you sideways. We'll nudge you again after real bumps.",
  },
  {
    expression: "reward_coins",
    title: "Coins & streaks",
    body: "Grab coins on safe straights. Par streaks pay bonus coins at hole-out.",
  },
  {
    expression: "cheerful",
    title: "You're set",
    body: "Tap anywhere when you're ready — first swing is yours.",
  },
];

export const YIP_MUSHROOM_TIP =
  "Careful of the mushrooms — they'll bounce you!";
