import "./style.css";
import { publicUrl } from "./core/publicPath";
import { assetRegistry } from "./art/AssetRegistry";
import { USE_PROCGEN_ENDPOINT } from "./core/Constants";
import { Game } from "./core/Game";
import { BACKGROUND_FLOATING_ISLAND_KEYS } from "./level/backgroundFloatingIslands";
import { ISLAND_DECOR_ASSET_KEYS } from "./level/islandDecorScatter";
import { PROCGEN_PRELOAD_KEYS } from "./procgen/procgenAssetKeys";
import { preloadDeckGrassTexture } from "./level/tiles/tileMaterials";

document.documentElement.style.setProperty(
  "--hud-skip-btn-bg",
  `url("${publicUrl("assets/ui/skip_level.png")}")`,
);
document.documentElement.style.setProperty(
  "--hud-skip-btn-bg-pressed",
  `url("${publicUrl("assets/ui/skip_level_pressed.png")}")`,
);
document.documentElement.style.setProperty(
  "--hud-leaderboard-frame-bg",
  `url("${publicUrl("assets/ui/leaderboard_frame.png")}")`,
);

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const hud = document.querySelector<HTMLElement>("#hud");
const titleScreen = document.querySelector<HTMLElement>("#title-screen");
const appRoot = document.querySelector<HTMLElement>("#app");

const procgenDebug =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("procgenDebug");

if (procgenDebug) {
  if (!canvas) {
    throw new Error("Missing #game canvas");
  }
  void import("./procgen/bootstrapProcgenDebug").then((m) =>
    m.mountProcgenDebug(canvas),
  );
} else if (!canvas || !hud) {
  throw new Error("Missing #game canvas or #hud overlay");
} else {
  const gameCanvas = canvas;
  const gameHud = hud;

  let game: Game;

  async function bootstrap(): Promise<void> {
    assetRegistry.startBackgroundPreload();
    preloadDeckGrassTexture();
    await assetRegistry.preloadAsset("hole_flag");
    await assetRegistry.preloadAsset("undermap_island");
    await Promise.all(
      BACKGROUND_FLOATING_ISLAND_KEYS.map((k) => assetRegistry.preloadAsset(k)),
    );
    await Promise.all(
      ISLAND_DECOR_ASSET_KEYS.map((k) => assetRegistry.preloadAsset(k)),
    );
    await assetRegistry.preloadAsset("hazard_fan");
    await assetRegistry.preloadAsset("hazard_windmill");
    await assetRegistry.preloadAsset("coin");
    if (USE_PROCGEN_ENDPOINT) {
      await Promise.all(
        PROCGEN_PRELOAD_KEYS.map((k) => assetRegistry.preloadAsset(k)),
      );
    }
    game = new Game(gameCanvas, gameHud, appRoot ?? document.body);

    let gameStarted = false;
    function dismissTitleScreen(): void {
      if (gameStarted) return;
      gameStarted = true;
      titleScreen?.classList.add("title-screen--hidden");
      titleScreen?.setAttribute("aria-hidden", "true");
      appRoot?.classList.remove("app--pre-game");
      game.primeAudioOnTitleScreen();
      game.start();
    }

    if (titleScreen) {
      appRoot?.classList.add("app--pre-game");
      game.presentInitialFrame();
      /** First touch on title = user gesture → BGM can start before tap-to-play. */
      titleScreen.addEventListener("pointerdown", () => {
        game.primeAudioOnTitleScreen();
      });
      const onActivate = (e: Event): void => {
        e.preventDefault();
        dismissTitleScreen();
      };
      titleScreen.addEventListener("pointerup", onActivate);
      titleScreen.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          dismissTitleScreen();
        }
      });
      queueMicrotask(() => titleScreen.focus());
    } else {
      game.start();
    }
  }

  void bootstrap().catch((err) => {
    console.error("[bootstrap]", err);
  });
}
