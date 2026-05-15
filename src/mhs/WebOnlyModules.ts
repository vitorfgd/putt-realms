export const WEB_ONLY_THREE_MODULES = [
  "src/procgen/ProcgenDebugViewer.ts",
  "src/procgen/DebugMapRenderer.ts",
  "src/procgen/SocketDebugHelpers.ts",
  "src/core/PsxLowResPresenter.ts",
  "src/level/LevelBuilder.ts",
  "src/level/tiles/TileKit.ts",
  "src/gameplay/Ball.ts",
  "src/gameplay/ShotEffects.ts",
  "src/gameplay/AimIndicator.ts",
  "src/art/AssetRegistry.ts",
] as const;

export const WEB_ONLY_BROWSER_MODULES = [
  "src/main.ts",
  "src/ui/Hud.ts",
  "src/ui/GameOverlays.ts",
  "src/input/DragShotInput.ts",
  "src/input/CameraOrbitInput.ts",
  "src/platform-browser/GameAudio.ts",
  "src/platform-browser/BrowserDebugConfigService.ts",
  "src/platform-browser/BrowserPlatformServices.ts",
  "src/platform-browser/BrowserStorageService.ts",
  "src/procgen/bootstrapProcgenDebug.ts",
] as const;
