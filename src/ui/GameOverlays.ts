import type { GeneratedLevel } from "../level/LevelTypes";
import type { AudioSettings } from "../platform-browser/GameAudio";
import type { StorageService } from "../platform/PlatformServices";
import { browserStorage } from "../platform-browser/BrowserStorageService";
import type { QuestProgress } from "../progression/QuestService";
import type { MushroomTipTier } from "../progression/ftueState";
import type { FtueIntroLine } from "./ftueScript";
import { YIP_MUSHROOM_TIP } from "./ftueScript";
import { YIP_DIALOGUE_FRAME, YIP_EXPRESSION_URL } from "./yipFtueAssets";
import { publicUrl } from "../core/publicPath";
import { bindImageButtonPressSpriteSwap } from "./imageButtonPressSpriteSwap";

const LS_TUTORIAL = "pmg_seen_tutorial_v1";

export interface LevelSummaryView {
  strokes: number;
  par: number;
  coinsCollected: number;
  rewardCoins: number;
  /** Par-streak bonus (already credited); 0 omits the streak row */
  parStreakCoinPayout: number;
  /** Streak count N for "Par Streak xN" when par streak payout is shown */
  parStreakLevel: number;
  realmName: string;
  unlockedCosmetic?: string;
  questProgress: QuestProgress;
}

export class GameOverlays {
  private readonly root: HTMLElement;
  private readonly pausePanel: HTMLElement;
  private readonly loadingPanel: HTMLElement;
  private readonly routePanel: HTMLElement;
  private readonly tutorialPanel: HTMLElement;
  private readonly summaryPanel: HTMLElement;
  private readonly ftuePanel: HTMLElement;
  private readonly yipTipRoot: HTMLElement;
  private readonly musicToggle: HTMLInputElement;
  private readonly sfxToggle: HTMLInputElement;
  private seenTutorial: Record<string, boolean> = {};

  onPauseChange?: (paused: boolean) => void;
  onRestart?: () => void;
  onContinue?: () => void;
  /** Optional — e.g. future shop route; summary Shop button still shows an in-panel hint if unset. */
  onShop?: () => void;
  onAudioSettings?: (settings: Partial<AudioSettings>) => void;
  onUiSound?: () => void;

  private shopToastTimer = 0;
  private ftueScript: FtueIntroLine[] = [];
  private ftueStep = 0;
  private ftueCompleteCallback?: () => void;
  private yipTipClear = 0;

  constructor(
    parent: HTMLElement,
    private readonly storage: StorageService = browserStorage,
  ) {
    this.root = document.createElement("div");
    this.root.className = "game-overlays";
    parent.appendChild(this.root);

    this.pausePanel = this.panel("pause-panel overlay-panel--hidden");
    this.pausePanel.innerHTML = `
      <div class="overlay-card">
        <h2>Paused</h2>
        <p class="overlay-muted">Take a breath. The realm can wait.</p>
        <label class="overlay-toggle"><input id="overlay-music-toggle" type="checkbox" /> Music</label>
        <label class="overlay-toggle"><input id="overlay-sfx-toggle" type="checkbox" /> SFX</label>
        <button type="button" data-action="resume">Resume</button>
        <button type="button" data-action="restart">Restart hole</button>
      </div>
    `;
    this.musicToggle = this.pausePanel.querySelector(
      "#overlay-music-toggle",
    ) as HTMLInputElement;
    this.sfxToggle = this.pausePanel.querySelector(
      "#overlay-sfx-toggle",
    ) as HTMLInputElement;
    this.pausePanel.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute("data-action");
      if (!action) return;
      this.onUiSound?.();
      if (action === "resume") this.showPause(false);
      if (action === "restart") {
        this.showPause(false);
        this.onRestart?.();
      }
    });
    this.musicToggle.addEventListener("change", () => {
      this.onAudioSettings?.({ musicMuted: !this.musicToggle.checked });
    });
    this.sfxToggle.addEventListener("change", () => {
      this.onAudioSettings?.({ sfxMuted: !this.sfxToggle.checked });
    });
    this.root.appendChild(this.pausePanel);

    this.loadingPanel = this.panel("loading-panel overlay-panel--hidden");
    this.loadingPanel.innerHTML = `
      <div class="overlay-card overlay-card--small">
        <div class="loading-rune"></div>
        <strong>Conjuring Realm</strong>
      </div>
    `;
    this.root.appendChild(this.loadingPanel);

    this.routePanel = this.panel("route-panel overlay-panel--hidden");
    this.root.appendChild(this.routePanel);

    this.tutorialPanel = this.panel("tutorial-panel overlay-panel--hidden");
    this.root.appendChild(this.tutorialPanel);

    this.summaryPanel = this.panel("summary-panel overlay-panel--hidden");
    this.root.appendChild(this.summaryPanel);

    this.ftuePanel = this.panel("ftue-panel overlay-panel--hidden");
    this.root.appendChild(this.ftuePanel);
    this.ftuePanel.addEventListener("click", () => {
      if (this.ftueScript.length === 0) return;
      if (this.ftuePanel.classList.contains("overlay-panel--hidden")) return;
      this.onFtueAdvance();
    });

    this.yipTipRoot = document.createElement("div");
    this.yipTipRoot.className = "yip-tooltip-root yip-tooltip-root--hidden";
    this.yipTipRoot.setAttribute("role", "status");
    this.yipTipRoot.setAttribute("aria-live", "polite");
    this.root.appendChild(this.yipTipRoot);

    this.loadSeenTutorial();
  }

  syncAudioSettings(settings: AudioSettings): void {
    this.musicToggle.checked = !settings.musicMuted;
    this.sfxToggle.checked = !settings.sfxMuted;
  }

  showPause(show: boolean): void {
    this.pausePanel.classList.toggle("overlay-panel--hidden", !show);
    this.onPauseChange?.(show);
  }

  showLoading(show: boolean): void {
    this.loadingPanel.classList.toggle("overlay-panel--hidden", !show);
  }

  showRoute(level: GeneratedLevel): void {
    const p = level.progressionSummary;
    if (!p) return;
    const diff = level.difficultyScore;
    const hole = p.level;
    this.routePanel.innerHTML = `
      <div class="realm-route" role="status" aria-live="polite">
        <div class="realm-route__frame">
          <div class="realm-route__picture">
            <img
              class="realm-route__bg"
              src="${publicUrl("assets/ui/realm_run_frame.png")}"
              alt=""
              width="967"
              height="348"
              decoding="async"
            />
          </div>
          <div class="realm-route__text">
            <p class="realm-route__realm">${escapeHtml(p.realmName)}</p>
            <p class="realm-route__meta">
              Hole <strong>${hole}</strong> · Difficulty <strong>${diff}/10</strong> · Par ${level.par}
            </p>
          </div>
        </div>
      </div>
    `;
    this.routePanel.classList.remove("overlay-panel--hidden");
    window.setTimeout(
      () => this.routePanel.classList.add("overlay-panel--hidden"),
      2300,
    );
  }

  showTutorialOnce(key: string, title: string, _body: string): void {
    if (this.seenTutorial[key]) return;
    this.seenTutorial[key] = true;
    this.saveSeenTutorial();
    this.tutorialPanel.innerHTML = `
      <div class="tutorial-card">
        <span>Tip</span>
        <strong>${escapeHtml(title)}</strong>
      </div>
    `;
    this.tutorialPanel.classList.remove("overlay-panel--hidden");
    window.setTimeout(
      () => this.tutorialPanel.classList.add("overlay-panel--hidden"),
      2400,
    );
  }

  showSummary(summary: LevelSummaryView): void {
    const field = Math.max(0, Math.floor(summary.coinsCollected));
    const hioReward = Math.max(0, Math.floor(summary.rewardCoins));
    const streak = Math.max(0, Math.floor(summary.parStreakCoinPayout));
    const coinsTotal = field + hioReward + streak;
    const qp = summary.questProgress;
    const streakLevel = Math.max(0, Math.floor(summary.parStreakLevel));
    const hioRow =
      hioReward > 0
        ? `<div class="run-summary__earn-row"><span>Hole in One</span><span>+${hioReward}</span></div>`
        : "";
    const streakRow =
      streak > 0 && streakLevel > 0
        ? `<div class="run-summary__earn-row"><span>Par Streak x${streakLevel}</span><span>+${streak}</span></div>`
        : "";
    this.summaryPanel.innerHTML = `
      <div class="run-summary" role="dialog" aria-labelledby="run-summary-title">
        <h2 id="run-summary-title" class="run-summary__visually-hidden">Run summary</h2>
        <div class="run-summary__frame">
          <img
            class="run-summary__bg"
            src="${publicUrl("assets/ui/run_summary_frame.png")}"
            alt=""
            width="520"
            height="620"
            decoding="async"
          />
          <div class="run-summary__stats">
            <p class="run-summary__realm">${escapeHtml(summary.realmName)}</p>
            <dl class="run-summary__grid">
              <dt>Strokes</dt><dd>${summary.strokes}</dd>
              <dt>Par</dt><dd>${summary.par}</dd>
            </dl>
            <div class="run-summary__earnings" aria-label="Coin earnings this hole">
              <div class="run-summary__earn-row"><span>Coins Found</span><span>+${field}</span></div>
              ${hioRow}
              ${streakRow}
              <div class="run-summary__earn-row run-summary__earn-row--total"><span>Total Earnings</span><span>+${coinsTotal}</span></div>
            </div>
            ${
              summary.unlockedCosmetic
                ? `<p class="run-summary__unlock">Unlocked: ${escapeHtml(summary.unlockedCosmetic)}</p>`
                : ""
            }
            <p class="run-summary__quests">
              <span class="run-summary__quests-row">
                <span class="run-summary__quests-label">Under par</span>
                <span class="run-summary__quests-val">${qp.underParCompletions}/3</span>
              </span>
              <span class="run-summary__quests-row">
                <span class="run-summary__quests-label">Run coins</span>
                <span class="run-summary__quests-val">${qp.collectedCoins}/10</span>
              </span>
            </p>
          </div>
          <p class="run-summary__shop-toast run-summary__shop-toast--hidden" role="status" aria-live="polite">
            Shop — coming soon
          </p>
          <div class="run-summary__footer">
            <button type="button" class="run-summary__btn" data-action="continue" aria-label="Next level">
              <img src="${publicUrl("assets/ui/run_summary_btn_next.png")}" alt="" width="280" height="96" decoding="async" />
            </button>
            <button type="button" class="run-summary__btn" data-action="shop" aria-label="Shop">
              <img src="${publicUrl("assets/ui/run_summary_btn_shop.png")}" alt="" width="280" height="96" decoding="async" />
            </button>
          </div>
        </div>
      </div>
    `;
    this.summaryPanel.classList.remove("overlay-panel--hidden");
    const nextBtn = this.summaryPanel.querySelector("[data-action='continue']");
    const shopBtn = this.summaryPanel.querySelector("[data-action='shop']");
    bindImageButtonPressSpriteSwap(
      nextBtn,
      publicUrl("assets/ui/run_summary_btn_next.png"),
      publicUrl("assets/ui/run_summary_btn_next_pressed.png"),
    );
    bindImageButtonPressSpriteSwap(
      shopBtn,
      publicUrl("assets/ui/run_summary_btn_shop.png"),
      publicUrl("assets/ui/run_summary_btn_shop_pressed.png"),
    );
    nextBtn?.addEventListener(
      "click",
      () => {
        this.onUiSound?.();
        this.hideSummary();
        this.onContinue?.();
      },
      { once: true },
    );
    shopBtn?.addEventListener("click", () => {
      this.onUiSound?.();
      this.onShop?.();
      const toast = this.summaryPanel.querySelector(".run-summary__shop-toast");
      toast?.classList.remove("run-summary__shop-toast--hidden");
      window.clearTimeout(this.shopToastTimer);
      this.shopToastTimer = window.setTimeout(() => {
        toast?.classList.add("run-summary__shop-toast--hidden");
      }, 2400);
    });
  }

  hideSummary(): void {
    window.clearTimeout(this.shopToastTimer);
    this.shopToastTimer = 0;
    this.summaryPanel.classList.add("overlay-panel--hidden");
  }

  /**
   * Multi-step Yip intro on the first tutorial hole. Calls `onComplete` when the player
   * finishes the script (or immediately if `steps` is empty).
   */
  startFtueIntro(steps: FtueIntroLine[], onComplete: () => void): void {
    this.hideYipMushroomTip();
    if (!steps.length) {
      onComplete();
      return;
    }
    this.ftueScript = steps;
    this.ftueStep = 0;
    this.ftueCompleteCallback = onComplete;
    this.ftuePanel.classList.remove("overlay-panel--hidden");
    this.renderFtueStep();
  }

  hideFtueIntro(): void {
    this.ftuePanel.classList.add("overlay-panel--hidden");
    this.ftuePanel.innerHTML = "";
    this.ftueScript = [];
    this.ftueStep = 0;
    this.ftueCompleteCallback = undefined;
  }

  /** In-play reminder when the player hits bumper mushrooms (1st / 3rd / 6th lifetime hits). */
  showYipMushroomTip(_tier: MushroomTipTier): void {
    void _tier;
    window.clearTimeout(this.yipTipClear);
    const face = YIP_EXPRESSION_URL.worried;
    this.yipTipRoot.innerHTML = `
      <div class="yip-tooltip">
        <img class="yip-tooltip__face" src="${face}" alt="" width="72" height="72" decoding="async" />
        <p class="yip-tooltip__text">${escapeHtml(YIP_MUSHROOM_TIP)}</p>
      </div>
    `;
    const img = this.yipTipRoot.querySelector("img");
    img?.addEventListener("error", () => {
      img.classList.add("yip-tooltip__face--hidden");
    });
    this.yipTipRoot.classList.remove("yip-tooltip-root--hidden");
    this.yipTipClear = window.setTimeout(() => this.hideYipMushroomTip(), 5200);
  }

  hideYipMushroomTip(): void {
    window.clearTimeout(this.yipTipClear);
    this.yipTipClear = 0;
    this.yipTipRoot.classList.add("yip-tooltip-root--hidden");
    this.yipTipRoot.innerHTML = "";
  }

  private onFtueAdvance(): void {
    this.onUiSound?.();
    const last = this.ftueStep >= this.ftueScript.length - 1;
    if (last) {
      const done = this.ftueCompleteCallback;
      this.hideFtueIntro();
      done?.();
      return;
    }
    this.ftueStep += 1;
    this.renderFtueStep();
  }

  private renderFtueStep(): void {
    const step = this.ftueScript[this.ftueStep];
    if (!step) return;
    const portrait = YIP_EXPRESSION_URL[step.expression];
    const paras = step.body
      .split(/\n\s*\n/)
      .map((p) => `<p class="ftue-dialog__p">${escapeHtml(p.trim())}</p>`)
      .join("");
    this.ftuePanel.innerHTML = `
      <div class="ftue-flow">
        <div class="ftue-flow__stage">
          <div
            class="ftue-dialog"
            role="dialog"
            lang="en"
            aria-labelledby="ftue-title"
            aria-describedby="ftue-hint"
            style="background-image:url('${YIP_DIALOGUE_FRAME}')"
          >
            <img
              class="ftue-dialog__portrait"
              src="${portrait}"
              alt=""
              width="112"
              height="112"
              decoding="async"
            />
            <p class="ftue-dialog__eyebrow">Yip</p>
            <h2 id="ftue-title" class="ftue-dialog__title">${escapeHtml(step.title)}</h2>
            <div class="ftue-dialog__body">${paras}</div>
          </div>
          <p class="ftue-flow__hint" id="ftue-hint">CLICK ANYWHERE TO PROCEED</p>
        </div>
      </div>
    `;
    const portraitEl = this.ftuePanel.querySelector(".ftue-dialog__portrait");
    portraitEl?.addEventListener("error", () => {
      portraitEl.classList.add("ftue-dialog__portrait--hidden");
    });
  }

  private panel(className: string): HTMLElement {
    const el = document.createElement("div");
    el.className = `overlay-panel ${className}`;
    return el;
  }

  private loadSeenTutorial(): void {
    try {
      this.seenTutorial = JSON.parse(this.storage.read(LS_TUTORIAL) ?? "{}");
    } catch {
      this.seenTutorial = {};
    }
  }

  private saveSeenTutorial(): void {
    try {
      this.storage.write(LS_TUTORIAL, JSON.stringify(this.seenTutorial));
    } catch {
      /* ignore full storage */
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
