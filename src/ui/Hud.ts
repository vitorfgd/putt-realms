import { CALLOUT_SPRITES } from "./calloutSprites";
import type { ProcgenEndpointReplayPayload } from "../procgen/MapGenerationTypes";
import { publicUrl } from "../core/publicPath";
import { bindImageButtonPressSpriteSwap } from "./imageButtonPressSpriteSwap";

export type HudHintKind = "drag" | "release" | "rolling";

export type HudRewardToastKind =
  | "hole-in-one"
  | "clean-shot"
  | "out-of-bounds"
  | "free-skip";

/**
 * HTML overlay HUD (no Three.js text). Pointer-events disabled so input hits the canvas.
 */
export class Hud {
  private readonly elLevelValue: HTMLElement;
  private readonly elDifficulty: HTMLElement;
  private readonly elCoins: HTMLElement;
  private readonly elStrokesValue: HTMLElement;
  private readonly elParValue: HTMLElement;
  private readonly elHint: HTMLElement;
  private readonly elToast: HTMLElement;
  private readonly elPowerWrap: HTMLElement;
  private readonly elPowerPct: HTMLElement;
  private readonly elPowerBar: HTMLElement;
  private readonly elChargePointer: HTMLElement;
  private readonly elSkipWrap: HTMLElement;
  private readonly elSkipBtn: HTMLButtonElement;
  private readonly elSkipCost: HTMLElement;
  private readonly elSeed: HTMLElement;
  private readonly elCallout: HTMLElement;
  private readonly elCalloutImg: HTMLImageElement;
  private readonly elCalloutFallback: HTMLElement;
  private readonly elLeaderboardBtn: HTMLButtonElement;
  private readonly elLeaderboardPanel: HTMLElement;
  private readonly elLeaderboardLevel: HTMLElement;
  private readonly elLeaderboardList: HTMLOListElement;
  private readonly elLeaderboardClose: HTMLButtonElement;
  private readonly elLeaderboardShade: HTMLElement;
  private calloutTimer = 0;
  private currentLevel = 1;

  constructor(container: HTMLElement) {
    this.elLevelValue = requireEl(container, "hud-level-value");
    this.elDifficulty = requireEl(container, "hud-difficulty");
    this.elCoins = requireEl(container, "hud-coins");
    this.elStrokesValue = requireEl(container, "hud-strokes-value");
    this.elParValue = requireEl(container, "hud-par-value");
    this.elHint = requireEl(container, "hud-hint");
    this.elToast = requireEl(container, "hud-toast");
    this.elPowerWrap = requireEl(container, "hud-power-wrap");
    this.elPowerPct = requireEl(container, "hud-power-pct");
    this.elPowerBar = requireEl(container, "hud-power-bar");
    this.elChargePointer = requireEl(container, "hud-charge-pointer");
    this.elSkipWrap = requireEl(container, "hud-skip-wrap");
    this.elSkipBtn = requireEl(container, "hud-skip-btn") as HTMLButtonElement;
    this.elSkipCost = requireEl(container, "hud-skip-cost");
    this.elSeed = requireEl(container, "hud-seed");
    this.elCallout = requireEl(container, "hud-callout");
    this.elCalloutImg = requireEl(container, "hud-callout-img") as HTMLImageElement;
    this.elCalloutFallback = requireEl(container, "hud-callout-fallback");
    this.elLeaderboardBtn = requireEl(container, "hud-leaderboard-btn") as HTMLButtonElement;
    this.elLeaderboardPanel = requireEl(container, "hud-leaderboard-panel");
    this.elLeaderboardLevel = requireEl(container, "hud-leaderboard-level");
    this.elLeaderboardList = requireEl(container, "hud-leaderboard-list") as HTMLOListElement;
    this.elLeaderboardClose = requireEl(container, "hud-leaderboard-close") as HTMLButtonElement;
    this.elLeaderboardShade = requireEl(container, "hud-leaderboard-shade");
  }

  mount(): void {
    this.setLevel(1);
    this.setDifficultyRating(0, false);
    this.setCoins(0);
    this.setStrokesPar(0, 0);
    this.setHint("drag");
    this.setPowerMeter(null);
    this.setSkipRow({ visible: false, label: "", enabled: false });
    this.hideToast();
    this.hideCallout();
    this.hideLeaderboard();
    this.setMapSeed(null, null);
    this.elLeaderboardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleLeaderboard();
    });
    this.elLeaderboardClose.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hideLeaderboard();
    });
    this.elLeaderboardShade.addEventListener("click", () => this.hideLeaderboard());
    const lbNormal = publicUrl("assets/ui/leaderboard_button.png");
    const lbPressed = publicUrl("assets/ui/leaderboard_button_pressed.png");
    const lbImg = this.elLeaderboardBtn.querySelector("img");
    if (lbImg instanceof HTMLImageElement) {
      lbImg.src = lbNormal;
    }
    bindImageButtonPressSpriteSwap(this.elLeaderboardBtn, lbNormal, lbPressed);
  }

  /**
   * Procgen bug / replay line: seed plus endpoint `targetDifficulty` and `levelIndex` when available.
   * Tooltip holds full JSON for the last generate-map request payload (same shape as the procgen endpoint).
   */
  setMapSeed(
    seed: string | null,
    endpointReplay: ProcgenEndpointReplayPayload | null,
  ): void {
    if (seed == null || seed === "") {
      this.elSeed.textContent = "";
      this.elSeed.classList.add("hud-seed--hidden");
      this.elSeed.removeAttribute("title");
      return;
    }
    const display =
      seed.length > 56 ? `${seed.slice(0, 53)}…` : seed;
    const replaySuffix = endpointReplay
      ? ` · td ${endpointReplay.targetDifficulty} · lv ${endpointReplay.levelIndex}`
      : "";
    this.elSeed.textContent = `Seed ${display}${replaySuffix}`;
    const lines = [
      seed,
      "",
      "In-game replay: ?procgenSeed=" + encodeURIComponent(seed),
    ];
    if (endpointReplay) {
      lines.push(
        "",
        "Last endpoint request (JSON) — use the same body on your procgen API:",
        JSON.stringify(endpointReplay, null, 2),
      );
    }
    this.elSeed.title = lines.join("\n");
    this.elSeed.classList.remove("hud-seed--hidden");
  }

  /** Skip row visibility is driven from Game (over par, phase, economy). */
  bindSkip(handler: () => void): void {
    this.elSkipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  setSkipRow(opts: {
    visible: boolean;
    label: string;
    enabled: boolean;
    free?: boolean;
  }): void {
    this.elSkipWrap.classList.toggle("hud-skip-row--hidden", !opts.visible);
    this.elSkipWrap.classList.toggle("hud-skip-row--free", !!opts.free && opts.visible);
    if (opts.visible) {
      this.elSkipCost.textContent = opts.label;
      this.elSkipBtn.disabled = !opts.enabled;
    }
  }

  setLevel(level: number): void {
    this.currentLevel = Math.max(1, Math.round(level));
    this.elLevelValue.textContent = `${level}`;
    this.renderLeaderboard();
  }

  setDifficultyRating(score: number, imperfect?: boolean): void {
    this.elDifficulty.textContent = `DIFF ${score}/10`;
    this.elDifficulty.classList.toggle(
      "hud-badge__meta--imperfect",
      !!imperfect,
    );
  }

  setProcgenMeta(meta: {
    seed?: string;
    progressionLevel?: number;
    tileCount?: number;
    turnCount?: number;
    rampCount?: number;
    endpointReplay?: ProcgenEndpointReplayPayload | null;
  }): void {
    const bits = [
      meta.seed ? `seed ${meta.seed}` : null,
      meta.progressionLevel !== undefined
        ? `hole ${meta.progressionLevel}`
        : null,
      meta.tileCount !== undefined ? `${meta.tileCount} tiles` : null,
      meta.turnCount !== undefined ? `${meta.turnCount} turns` : null,
      meta.rampCount !== undefined ? `${meta.rampCount} ramps` : null,
      meta.endpointReplay
        ? `endpoint targetDifficulty ${meta.endpointReplay.targetDifficulty} · levelIndex ${meta.endpointReplay.levelIndex} · maxTiles ${meta.endpointReplay.maxTiles}`
        : null,
    ].filter((bit): bit is string => bit !== null);
    this.elDifficulty.title = bits.join(" | ");
  }

  setCoins(amount: number): void {
    this.elCoins.textContent = `${amount}`;
  }

  setStrokesPar(strokes: number, par: number): void {
    this.elStrokesValue.textContent = `${strokes}`;
    this.elParValue.textContent = par > 0 ? `${par}` : "—";
  }

  setHint(kind: HudHintKind): void {
    const text =
      kind === "drag"
        ? "Drag to aim"
        : kind === "release"
          ? "Release to hit"
          : "Rolling...";
    if (this.elHint.textContent !== text) {
      this.elHint.textContent = text;
    }
  }

  /** Shot power while aiming; `null` hides the meter. */
  setPowerMeter(power01: number | null): void {
    if (power01 === null) {
      this.elPowerWrap.classList.add("hud-instruction-power--hidden");
      this.elPowerBar.setAttribute("aria-valuenow", "0");
      this.elChargePointer.style.left = "5.5%";
      return;
    }
    const p = Math.max(0, Math.min(1, power01));
    const pct = Math.round(p * 100);
    this.elPowerWrap.classList.remove("hud-instruction-power--hidden");
    this.elPowerPct.textContent = `${pct}%`;
    /** Keep pointer inside the bar art (inset matches CSS charge pointer range). */
    const insetPct = 5.5;
    const x = insetPct + p * (100 - 2 * insetPct);
    this.elChargePointer.style.left = `${x}%`;
    this.elPowerBar.setAttribute("aria-valuenow", `${pct}`);
  }

  /**
   * Big moment before the summary overlay. Returns hold time in ms before summary should open.
   * Hole-in-one or clean shot always plays first; par streak (≥2) plays immediately after and
   * extends the returned delay so the run summary waits for both.
   */
  presentHoleFinishCallout(opts: {
    holeInOne: boolean;
    /** Par streak length after this hole (same as summary); 0 if streak broken. */
    parStreakLevel: number;
  }): number {
    const primaryMs = 840;
    const streakMs = 840;
    const { holeInOne, parStreakLevel } = opts;
    const primaryUrl = holeInOne
      ? CALLOUT_SPRITES.holeInOne
      : CALLOUT_SPRITES.cleanShot;
    const primaryFallback = holeInOne ? "HOLE IN ONE" : "CLEAN SHOT";

    if (parStreakLevel >= 2) {
      const tier = Math.min(5, Math.max(2, parStreakLevel)) as 2 | 3 | 4 | 5;
      const streakFallback =
        parStreakLevel >= 5 ? "STREAK x5+" : `STREAK x${parStreakLevel}`;
      this.showCallout(primaryUrl, primaryFallback, primaryMs, () => {
        this.showCallout(
          CALLOUT_SPRITES.streak(tier),
          streakFallback,
          streakMs,
        );
      });
      return primaryMs + streakMs;
    }

    this.showCallout(primaryUrl, primaryFallback, primaryMs);
    return primaryMs;
  }

  showOutOfBounds(): void {
    const durationMs = 760;
    this.showCallout(CALLOUT_SPRITES.outOfBounds, "OUT OF BOUNDS", durationMs);
  }

  /** Temporary reward / promo line (e.g. free skip). */
  showRewardToast(kind: HudRewardToastKind): void {
    this.clearToastModifiers();
    const messages: Record<HudRewardToastKind, string> = {
      "hole-in-one": "HOLE IN ONE",
      "clean-shot": "CLEAN SHOT",
      "out-of-bounds": "OUT OF BOUNDS",
      "free-skip": "FREE SKIP AVAILABLE",
    };
    const cls: Record<HudRewardToastKind, string> = {
      "hole-in-one": "hud-toast--hole-in-one",
      "clean-shot": "hud-toast--clean-shot",
      "out-of-bounds": "hud-toast--oob",
      "free-skip": "hud-toast--free-skip",
    };
    this.elToast.textContent = messages[kind];
    this.elToast.classList.add(cls[kind]);
    this.elToast.classList.remove("hud-toast--hidden");
  }

  showCoinsEarned(amount: number): void {
    this.clearToastModifiers();
    this.elToast.textContent = `+${amount} COINS`;
    this.elToast.classList.add("hud-toast--coins");
    this.elToast.classList.remove("hud-toast--hidden");
  }

  hideToast(): void {
    this.elToast.classList.add("hud-toast--hidden");
    this.clearToastModifiers();
  }

  hideCallout(): void {
    window.clearTimeout(this.calloutTimer);
    this.calloutTimer = 0;
    this.elCallout.classList.add("hud-callout--hidden");
    this.elCalloutImg.removeAttribute("src");
    this.elCalloutImg.classList.add("hud-callout__img--hidden");
    this.elCalloutFallback.textContent = "";
    this.elCalloutFallback.classList.remove("hud-callout__fallback--hidden");
  }

  private toggleLeaderboard(): void {
    if (this.elLeaderboardPanel.classList.contains("hud-leaderboard--hidden")) {
      this.showLeaderboard();
    } else {
      this.hideLeaderboard();
    }
  }

  private showLeaderboard(): void {
    this.renderLeaderboard();
    this.elLeaderboardBtn.setAttribute("aria-expanded", "true");
    this.elLeaderboardPanel.classList.remove("hud-leaderboard--hidden");
  }

  private hideLeaderboard(): void {
    this.elLeaderboardBtn.setAttribute("aria-expanded", "false");
    this.elLeaderboardPanel.classList.add("hud-leaderboard--hidden");
  }

  private renderLeaderboard(): void {
    const level = this.currentLevel;
    this.elLeaderboardLevel.textContent = `Level ${level}`;
    const rows = fakeLeaderboardRows(level);
    this.elLeaderboardList.replaceChildren(
      ...rows.map((row, index) => {
        const item = document.createElement("li");
        item.className = "hud-leaderboard__row";
        if (row.you) item.classList.add("hud-leaderboard__row--you");

        const rank = document.createElement("span");
        rank.className = "hud-leaderboard__rank";
        rank.textContent = `${index + 1}`;

        const name = document.createElement("span");
        name.className = "hud-leaderboard__name";
        name.textContent = row.name;

        const score = document.createElement("span");
        score.className = "hud-leaderboard__score";
        score.textContent = `${row.strokes}`;

        item.append(rank, name, score);
        return item;
      }),
    );
  }

  private showCallout(
    imageUrl: string,
    fallbackText: string,
    durationMs: number,
    onEnd: () => void = () => {
      this.hideCallout();
    },
  ): void {
    window.clearTimeout(this.calloutTimer);
    this.elCalloutFallback.textContent = fallbackText;
    this.elCalloutFallback.classList.remove("hud-callout__fallback--hidden");
    this.elCalloutImg.classList.add("hud-callout__img--hidden");

    const onLoad = (): void => {
      this.elCalloutImg.removeEventListener("load", onLoad);
      this.elCalloutImg.removeEventListener("error", onError);
      this.elCalloutImg.classList.remove("hud-callout__img--hidden");
      this.elCalloutFallback.classList.add("hud-callout__fallback--hidden");
    };
    const onError = (): void => {
      this.elCalloutImg.removeEventListener("load", onLoad);
      this.elCalloutImg.removeEventListener("error", onError);
      this.elCalloutImg.classList.add("hud-callout__img--hidden");
      this.elCalloutFallback.classList.remove("hud-callout__fallback--hidden");
    };
    this.elCalloutImg.addEventListener("load", onLoad);
    this.elCalloutImg.addEventListener("error", onError);
    this.elCallout.classList.remove("hud-callout--hidden");
    this.elCalloutImg.src = imageUrl;

    this.calloutTimer = window.setTimeout(onEnd, durationMs);
  }

  private clearToastModifiers(): void {
    this.elToast.classList.remove(
      "hud-toast--hole-in-one",
      "hud-toast--clean-shot",
      "hud-toast--oob",
      "hud-toast--free-skip",
      "hud-toast--coins",
    );
  }

  update(_deltaSeconds: number): void {
    void _deltaSeconds;
  }
}

function requireEl(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`#${id}`);
  if (!el) throw new Error(`HUD missing #${id}`);
  return el as HTMLElement;
}

function fakeLeaderboardRows(
  level: number,
): { name: string; strokes: number; you?: boolean }[] {
  const names = [
    "Mira",
    "Bram",
    "Vesper",
    "Jun",
    "Sol",
    "Nyx",
    "Pip",
    "Ari",
  ];
  const basePar = 2 + Math.floor((level % 7) / 2);
  const rows: { name: string; strokes: number; you?: boolean }[] = names
    .slice(0, 6)
    .map((name, index) => {
      const wobble = (level * (index + 3) + index * 5) % 4;
      return {
        name,
        strokes: Math.max(1, basePar + index + wobble - 1),
      };
    });
  rows.push({
    name: "You",
    strokes: Math.max(1, basePar + ((level * 3) % 5)),
    you: true,
  });
  return rows.sort(
    (a, b) => a.strokes - b.strokes || a.name.localeCompare(b.name),
  );
}
