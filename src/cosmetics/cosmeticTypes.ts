export type BallCosmeticId =
  | "classic_ivory"
  | "gold"
  | "emerald"
  | "ruby"
  | "sapphire";

export interface BallCosmeticDef {
  id: BallCosmeticId;
  /** Future shop / display */
  name: string;
  /** Starts unlocked — others gated until shop */
  defaultUnlocked: boolean;
}
