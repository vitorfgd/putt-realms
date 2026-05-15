import type { ProcgenEndpointReplayPayload } from "../procgen/MapGenerationTypes";
import type { HudHintKind } from "./Hud";

export interface HudState {
  level: number;
  difficultyScore: number;
  imperfectDifficulty: boolean;
  coins: number;
  strokes: number;
  par: number;
  hint: HudHintKind;
  power01: number | null;
  skip: {
    visible: boolean;
    label: string;
    enabled: boolean;
    free: boolean;
  };
  seed: string | null;
  endpointReplay: ProcgenEndpointReplayPayload | null;
}

export interface OverlayState {
  paused: boolean;
  loading: boolean;
  summary: {
    strokes: number;
    par: number;
    coinsCollected: number;
    rewardCoins: number;
    parStreakCoinPayout: number;
    parStreakLevel: number;
    realmName: string;
    unlockedCosmetic?: string;
  } | null;
}

export function defaultHudState(): HudState {
  return {
    level: 1,
    difficultyScore: 0,
    imperfectDifficulty: false,
    coins: 0,
    strokes: 0,
    par: 0,
    hint: "drag",
    power01: null,
    skip: {
      visible: false,
      label: "",
      enabled: false,
      free: false,
    },
    seed: null,
    endpointReplay: null,
  };
}
