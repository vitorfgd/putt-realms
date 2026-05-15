import type { Vec3Like } from "../core/math";

export type GameEvent =
  | { type: "strokeReleased"; power01: number; directionXZ: { x: number; y: number } }
  | { type: "ballSettled"; position: Vec3Like }
  | { type: "hazardHit"; hazardId: string; hazardKind: string; position: Vec3Like }
  | { type: "coinCollected"; collectibleId: string; value: number; position: Vec3Like }
  | { type: "outOfBounds"; position: Vec3Like }
  | { type: "holeCompleted"; strokes: number; par: number; rewardCoins: number }
  | { type: "skipRequested"; strokes: number; par: number }
  | { type: "rewardAwarded"; amount: number; reason: "hole-in-one" | "clean-shot" | "collectible" }
  | { type: "uiAction"; action: "pause" | "resume" | "restart" | "continue" | "openLeaderboard" | "closeLeaderboard" };

export const MHS_AUDIO_EVENT_IDS = [
  "hit",
  "rail",
  "hazard",
  "oob",
  "hole",
  "coin",
  "ui",
  "reward",
  "skip",
  "level",
  "bgm",
] as const;

export type MhsAudioEventId = (typeof MHS_AUDIO_EVENT_IDS)[number];

