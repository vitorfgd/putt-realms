import { CALLOUT_SPRITES } from "./calloutSprites";
import type { ProcgenEndpointReplayPayload } from "../procgen/MapGenerationTypes";

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
  private calloutTimer = 0;
  private currentPar = 0;

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
    this.setMapSeed(null, null);
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
    this.elLevelValue.textContent = `${level}`;
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
    this.currentPar = par;
    this.elStrokesValue.textContent = `${strokes}`;
    this.elParValue.textContent = par > 0 ? `${par}` : "—";
  }

  /** @deprecated Prefer {@link setStrokesPar} — uses last known par */
  setStrokes(n: number): void {
    this.setStrokesPar(n, this.currentPar);
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
   */
  presentHoleFinishCallout(opts: {
    holeInOne: boolean;
    streakAfterAward: number;
  }): number {
    const durationMs = 840;
    let imageUrl: string;
    let fallback: string;
    if (opts.holeInOne && opts.streakAfterAward >= 2) {
      const tier = Math.min(5, Math.max(2, opts.streakAfterAward)) as
        | 2
        | 3
        | 4
        | 5;
      imageUrl = CALLOUT_SPRITES.streak(tier);
      fallback = `STREAK x${opts.streakAfterAward}`;
    } else if (opts.holeInOne) {
      imageUrl = CALLOUT_SPRITES.holeInOne;
      fallback = "HOLE IN ONE";
    } else {
      imageUrl = CALLOUT_SPRITES.cleanShot;
      fallback = "CLEAN SHOT";
    }
    this.showCallout(imageUrl, fallback, durationMs);
    return durationMs;
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

  private showCallout(
    imageUrl: string,
    fallbackText: string,
    durationMs: number,
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

    this.calloutTimer = window.setTimeout(() => {
      this.hideCallout();
    }, durationMs);
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
