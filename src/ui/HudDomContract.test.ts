import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync("index.html", "utf8");
const overlaySource = readFileSync("src/ui/GameOverlays.ts", "utf8");

describe("web UI DOM contract", () => {
  it("keeps HUD mount points required by the DOM adapter", () => {
    for (const id of [
      "hud",
      "hud-level-value",
      "hud-difficulty",
      "hud-coins",
      "hud-strokes-value",
      "hud-par-value",
      "hud-hint",
      "hud-toast",
      "hud-power-wrap",
      "hud-power-pct",
      "hud-power-bar",
      "hud-charge-pointer",
      "hud-seed",
    ]) {
      expect(indexHtml).toContain(`id="${id}"`);
    }
  });

  it("keeps leaderboard, skip, and callout mount points available", () => {
    for (const id of [
      "hud-leaderboard-btn",
      "hud-leaderboard-panel",
      "hud-leaderboard-level",
      "hud-leaderboard-list",
      "hud-leaderboard-close",
      "hud-leaderboard-shade",
      "hud-skip-wrap",
      "hud-skip-btn",
      "hud-skip-cost",
      "hud-callout",
      "hud-callout-img",
      "hud-callout-fallback",
    ]) {
      expect(indexHtml).toContain(`id="${id}"`);
    }
    expect(indexHtml).toContain('aria-controls="hud-leaderboard-panel"');
    expect(indexHtml).toContain('aria-expanded="false"');
    expect(indexHtml).toContain('aria-label="Leaderboard"');
  });

  it("keeps overlay string interpolation guarded by escaping", () => {
    expect(overlaySource).toContain("function escapeHtml");
    expect(overlaySource).toContain("escapeHtml(summary.realmName)");
    expect(overlaySource).toContain("escapeHtml(summary.unlockedCosmetic)");
    expect(overlaySource).toContain("escapeHtml(title)");
    expect(overlaySource).toContain("escapeHtml(step.title)");
    expect(overlaySource).toContain("escapeHtml(p.trim())");
    expect(overlaySource).toContain("ftue-panel");
    expect(overlaySource).toContain("run-summary");
  });
});
