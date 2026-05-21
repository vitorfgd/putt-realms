import { describe, expect, it } from "vitest";
import {
  actionIdAtPoint,
  buildUiLayout,
  resolveUiMetrics,
  type Rect,
  type ResolvedUiLayout,
} from "../../../putt_realms/scripts/puttrealms/ui/Layout";
import {
  defaultUiState,
  fixtureUiState,
  summaryFixtureUiState,
} from "../../../putt_realms/scripts/puttrealms/ui/UiState";

const TARGET_ASPECTS = [
  { name: "9:16", aspect: 9 / 16, height: 960 },
  { name: "9:18", aspect: 9 / 18, height: 1080 },
  { name: "9:21", aspect: 9 / 21, height: 1260 },
];

describe("MHS portrait UI layout", () => {
  it.each(TARGET_ASPECTS)("resolves $name to a matching logical canvas", ({ aspect, height }) => {
    const metrics = resolveUiMetrics(aspect);
    expect(metrics.canvasWidth).toBe(540);
    expect(metrics.canvasHeight).toBe(height);
    expect(metrics.screenAspectRatio).toBeCloseTo(aspect);
  });

  it.each(TARGET_ASPECTS)("keeps all visual rects inside the $name canvas", ({ aspect }) => {
    const layout = buildUiLayout(resolveUiMetrics(aspect));
    for (const [key, rect] of rectEntries(layout)) {
      expect(rect.x, key).toBeGreaterThanOrEqual(0);
      expect(rect.y, key).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w, key).toBeLessThanOrEqual(layout.metrics.canvasWidth);
      expect(rect.y + rect.h, key).toBeLessThanOrEqual(layout.metrics.canvasHeight);
    }
  });

  it.each(TARGET_ASPECTS)("keeps bottom HUD controls ordered on $name", ({ aspect }) => {
    const layout = buildUiLayout(resolveUiMetrics(aspect));
    expect(layout.skipButton.y + layout.skipButton.h).toBeLessThanOrEqual(layout.powerWrap.y);
    expect(layout.powerWrap.y + layout.powerWrap.h).toBeLessThanOrEqual(layout.hintPlate.y);
    expect(layout.hintPlate.y + layout.hintPlate.h).toBeLessThanOrEqual(layout.seed.y);
    expect(layout.ftueFrame.y + layout.ftueFrame.h).toBeLessThanOrEqual(layout.hintPlate.y);
  });

  it("clamps unsupported portrait aspects to the supported range", () => {
    expect(resolveUiMetrics(1).canvasHeight).toBe(900);
    expect(resolveUiMetrics(9 / 30).canvasHeight).toBe(1320);
    expect(resolveUiMetrics(Number.NaN).canvasHeight).toBe(1080);
  });

  it.each(TARGET_ASPECTS)("keeps tap targets aligned with actions on $name", ({ aspect }) => {
    const layout = buildUiLayout(resolveUiMetrics(aspect));

    const hudState = fixtureUiState();
    expect(actionIdAtPoint(hudState, center(layout.pause), layout)).toBe("pause");
    expect(actionIdAtPoint(hudState, center(layout.leaderboardButton), layout)).toBe("openLeaderboard");
    expect(actionIdAtPoint(hudState, center(layout.skipButton), layout)).toBe("skipLevel");

    const pausedState = fixtureUiState();
    pausedState.overlay.paused = true;
    expect(actionIdAtPoint(pausedState, center(layout.pauseResume), layout)).toBe("resume");
    expect(actionIdAtPoint(pausedState, center(layout.pauseRestart), layout)).toBe("restart");
    expect(actionIdAtPoint(pausedState, center(layout.pauseMusic), layout)).toBe("toggleMusic");
    expect(actionIdAtPoint(pausedState, center(layout.pauseSfx), layout)).toBe("toggleSfx");

    const summaryState = summaryFixtureUiState();
    expect(actionIdAtPoint(summaryState, center(layout.summaryContinue), layout)).toBe("summaryContinue");
    expect(actionIdAtPoint(summaryState, center(layout.summaryShop), layout)).toBe("summaryShop");

    const titleState = defaultUiState();
    expect(actionIdAtPoint(titleState, center(layout.titleLogo), layout)).toBe("tapToPlay");

    const ftueState = fixtureUiState();
    ftueState.overlay.ftue = {
      title: "Welcome!",
      body: "Quick practice first.",
      expression: "smile",
      speaker: "Yip",
      stepIndex: 0,
      stepCount: 6,
    };
    expect(actionIdAtPoint(ftueState, { x: 2, y: 2 }, layout)).toBe("ftueAdvance");
    expect(actionIdAtPoint(ftueState, { x: layout.metrics.canvasWidth - 2, y: layout.metrics.canvasHeight - 2 }, layout)).toBe("ftueAdvance");
  });

  it("closes the leaderboard from any point outside the panel", () => {
    const layout = buildUiLayout(resolveUiMetrics(9 / 18));
    const state = fixtureUiState();
    state.overlay.leaderboardOpen = true;

    expect(actionIdAtPoint(state, { x: 2, y: 2 }, layout)).toBe("closeLeaderboard");
    expect(actionIdAtPoint(state, center(layout.leaderboardButton), layout)).toBe("closeLeaderboard");
    expect(actionIdAtPoint(state, center(layout.leaderboardPanel), layout)).toBeNull();
  });

  it("does not seed leaderboard defaults with placeholder players", () => {
    expect(defaultUiState().overlay.leaderboardRows).toEqual([]);
    expect(fixtureUiState().overlay.leaderboardRows).toEqual([]);
  });
});

function rectEntries(layout: ResolvedUiLayout): [string, Rect][] {
  return Object.entries(layout).filter((entry): entry is [string, Rect] => entry[0] !== "metrics");
}

function center(rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  };
}
