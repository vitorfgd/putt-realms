import type { BallCosmeticDef, BallCosmeticId } from "./cosmeticTypes";

/** Visual tint for ball mesh until full materials per cosmetic exist */
export const BALL_COSMETIC_BODY_HEX: Record<BallCosmeticId, number> = {
  classic_ivory: 0xf7f4ee,
  gold: 0xe8b830,
  emerald: 0x2fba74,
  ruby: 0xe85555,
  sapphire: 0x4a9eed,
};

/** Authoring list — shop UI comes later */
export const BALL_COSMETICS: readonly BallCosmeticDef[] = [
  {
    id: "classic_ivory",
    name: "Classic Ivory",
    defaultUnlocked: true,
  },
  {
    id: "gold",
    name: "Royal Gold",
    defaultUnlocked: false,
  },
  {
    id: "emerald",
    name: "Forest Emerald",
    defaultUnlocked: false,
  },
  {
    id: "ruby",
    name: "Ember Ruby",
    defaultUnlocked: false,
  },
  {
    id: "sapphire",
    name: "Sky Sapphire",
    defaultUnlocked: false,
  },
];
