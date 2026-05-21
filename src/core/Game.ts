import * as THREE from "three";
import { AimIndicator } from "../gameplay/AimIndicator";
import { Ball } from "../gameplay/Ball";
import {
  computeBallFollowCameraPose,
  computePortraitGameplayRect,
  computeTopDownCameraPose,
  disposeObject3D,
} from "./gameCameraAndLayout";
import {
  SimpleBallPhysics,
  type PhysicsStepEnvironment,
} from "../gameplay/SimpleBallPhysics";
import type { HazardEnvironmental, HazardInstance } from "../hazards/Hazard";
import { createHazardInstances } from "../hazards/implementations";
import { StrokeController } from "../gameplay/StrokeController";
import { CameraOrbitInput } from "../input/CameraOrbitInput";
import { DragShotInput, type DragShotContext } from "../input/DragShotInput";
import { LevelBuilder } from "../level/LevelBuilder";
import {
  createLevelBackdropMesh,
  loadLevelBackgroundTexture,
  resizeLevelBackdropMesh,
} from "../level/levelBackground";
import { maxCourseSurfaceHeight } from "../level/courseSurface";
import type { GeneratedLevel } from "../level/LevelTypes";
import { holeCupRadius } from "../level/TileDimensions";
import { BALL_COSMETIC_BODY_HEX } from "../cosmetics/cosmeticCatalog";
import { CosmeticService } from "../cosmetics/CosmeticService";
import { EconomyService } from "../economy/EconomyService";
import { parStreakBonusCoins } from "../economy/economyFormulas";
import { Hud } from "../ui/Hud";
import {
  GAMEPLAY_ASPECT,
  HOLE_SCORE_MAX_SPEED,
  HOLE_SINK_SEQUENCE_DURATION,
  HOLE_VORTEX_DURATION,
  MAX_DRAG_WORLD,
  MIN_DRAG_WORLD,
  OOB_MESSAGE_DURATION,
  OOB_Z_EXTRA,
  POWER_FULL_DRAG_WORLD,
  PREVIEW_CAMERA_DURATION,
  CAM_ORBIT_RAD_PER_PX,
  ENABLE_DECOR_CAMERA_OCCLUSION,
  isPsxLowResPipelineActive,
  PSX_LOW_RES_INTERNAL_SCALE,
  SKY_BLUE,
  shotSpeedFromPower01,
  STUCK_SKIP_MIN_DIST_FROM_HOLE,
  STUCK_SKIP_PLANAR_SPEED,
  STUCK_SKIP_SECONDS,
} from "./Constants";
import { configureCourseShadows } from "./configureCourseShadows";
import {
  RunEvent,
  RunPhase,
} from "./RunStateMachine";
import { HoleSession, type HoleSessionCommand } from "./HoleSession";
import { createBrowserPlatformServices } from "../platform-browser/BrowserPlatformServices";
import { GameCameraController } from "./GameCameraController";
import { PsxLowResPresenter } from "./PsxLowResPresenter";
import { PlayableLevelService } from "./PlayableLevelService";
import { ShotEffects } from "../gameplay/ShotEffects";
import { CollectibleController } from "../gameplay/CollectibleController";
import { FantasyVoidLayer } from "../level/fantasyVoid";
import { createBackgroundFloatingIslands } from "../level/backgroundFloatingIslands";
import { updateDecorCameraOcclusion } from "../level/decorCameraOcclusion";
import { createIslandSurroundDecor } from "../level/islandDecorScatter";
import {
  buildUndermapIslandGroup,
  computeUndermapIslandSlots,
} from "../level/undermapIslands";
import { resolveProcgenUndermapPlacement } from "../level/resolveProcgenUndermapIslandSlots";
import { GameOverlays } from "../ui/GameOverlays";
import { readProcgenEndpointReplay } from "../procgen/procgenEndpointReplay";
import {
  TelemetryService,
  type HoleStatsDraft,
} from "../progression/TelemetryService";
import { QuestService } from "../progression/QuestService";
import {
  isFtueIntroComplete,
  markFtueIntroComplete,
  recordMushroomBumperHit,
} from "../progression/ftueState";
import { FTUE_INTRO_SCRIPT } from "../ui/ftueScript";
const HOLE_PORTAL_WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Letterbox bars — deep sky hue (not harsh black) */
const LETTERBOX_CLEAR = 0x3d78a8;
const START_LEVEL_INDEX = 1;
const TEE_CENTER_NUDGE = 0.75;

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly courseGroup = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly platform = createBrowserPlatformServices();
  private readonly run = new HoleSession();
  private readonly input: DragShotInput;
  private readonly cameraOrbit: CameraOrbitInput;
  private readonly hud: Hud;
  private readonly ball: Ball;
  private readonly aimIndicator: AimIndicator;
  private physics!: SimpleBallPhysics;
  private readonly strokeController = new StrokeController();
  private readonly economy = new EconomyService(this.platform.storage);
  private readonly cosmetics = new CosmeticService(this.platform.storage);
  private readonly levelService = new PlayableLevelService();
  private readonly levelBuilder = new LevelBuilder();
  private readonly telemetry = new TelemetryService(this.platform.storage);
  private readonly quests = new QuestService(this.platform.storage);
  private readonly collectibles = new CollectibleController();
  private readonly cameraController: GameCameraController;
  private readonly overlays: GameOverlays;
  private readonly ballWorldScratch = new THREE.Vector3();
  private readonly lastShotPosition = new THREE.Vector3();
  /** Last lie after the ball fully settled — OOB respawns here (not the pre-stroke tap position). */
  private readonly lastStoppedLie = new THREE.Vector3();
  private readonly camGameplayPos = new THREE.Vector3();
  private readonly camGameplayTarget = new THREE.Vector3();
  private readonly camPreviewPos = new THREE.Vector3();
  private readonly camPreviewTarget = new THREE.Vector3();
  private readonly hazardEnvScratch: HazardEnvironmental = {
    frictionScale: 1,
    accelX: 0,
    accelZ: 0,
  };

  private hazardInstances: HazardInstance[] = [];
  private holeFlagMixers: THREE.AnimationMixer[] = [];
  private hazardHitFlashClear = 0;
  private readonly keyLight: THREE.DirectionalLight;

  private generatedLevel!: GeneratedLevel;
  private currentLevelIndex = START_LEVEL_INDEX;
  /** Consecutive levels cleared at or under par (session-only; resets on skip/restart/reload). */
  private parStreakCount = 0;
  private previousDifficultyScore: number | undefined = undefined;

  private previewTimer = PREVIEW_CAMERA_DURATION;
  private levelCompleteTimer = 0;
  private celebrationShown = false;
  private oobTimer = 0;
  private holeSummaryTimer = 0;
  private holeVortexStartDist = 0.4;
  private holeVortexStartAngle = 0;
  private holePoofPlayed = false;

  private prevPhase = RunPhase.Booting;
  private stuckTimer = 0;
  /** Seconds spent in “no tile under the ball” while descending — lost-ball once threshold exceeded */
  private offCourseLostSeconds = 0;
  private courseDeckTopY = 0;
  /** True after slow-roll “bad lie” timer triggers free skip for this hole */
  private freeSkipFromStuck = false;
  private readonly audio = this.platform.audio;
  private shotEffects!: ShotEffects;
  private voidLayer: FantasyVoidLayer | null = null;
  private undermapIslands: THREE.Group | null = null;
  private islandDecor: THREE.Group | null = null;
  private backgroundFloatingIslands: THREE.Group | null = null;
  private paused = false;
  private currentTurnCount = 0;
  private currentRampCount = 0;
  private holeCollectedCoinValue = 0;
  private holeStats: HoleStatsDraft = {
    oobCount: 0,
    restarts: 0,
    skips: 0,
    hazardHits: 0,
    coinPickups: 0,
  };

  private gameplayRect = { x: 0, y: 0, width: 1, height: 1 };
  private lastFrameTime = 0;
  private rafId = 0;
  private gameLoopStarted = false;
  /** Horizontal orbit offset around ball–hole baseline (yaw, radians) */
  private cameraYawOffset = 0;
  private cameraZoomScale = 1;
  private readonly previewPanOffset = new THREE.Vector2(0, 0);

  private levelBackdropMesh: THREE.Mesh | null = null;
  private levelBackdropTexture: THREE.Texture | null = null;
  private readonly psxLowResPresenter: PsxLowResPresenter | null;
  /** Camera-local — far enough that clouds/course usually draw in front */
  private readonly levelBackdropDist = 275;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    overlayRoot: HTMLElement = hudRoot.parentElement ?? document.body,
  ) {
    this.camera = new THREE.PerspectiveCamera(48, GAMEPLAY_ASPECT, 0.1, 1200);
    this.cameraController = new GameCameraController(this.camera);
    this.overlays = new GameOverlays(overlayRoot, this.platform.storage);
    this.scene.add(this.courseGroup);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.psxLowResPresenter = isPsxLowResPipelineActive()
      ? new PsxLowResPresenter(this.renderer, PSX_LOW_RES_INTERNAL_SCALE)
      : null;

    this.scene.background = new THREE.Color(SKY_BLUE);

    const ambient = new THREE.AmbientLight(0xfff8f0, 0.52);
    this.scene.add(ambient);
    this.keyLight = new THREE.DirectionalLight(0xffefd8, 1.45);
    this.keyLight.position.set(10, 26, 14);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.4;
    this.keyLight.shadow.camera.far = 320;
    this.keyLight.shadow.bias = -0.00025;
    this.keyLight.shadow.normalBias = 0.03;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);
    const fill = new THREE.HemisphereLight(0xd8f2ff, 0xd4b898, 0.52);
    this.scene.add(fill);

    this.ball = new Ball();
    this.scene.add(this.ball);
    this.shotEffects = new ShotEffects(this.ball);
    this.scene.add(this.shotEffects.group);
    this.courseGroup.add(this.collectibles.group);

    this.aimIndicator = new AimIndicator(MAX_DRAG_WORLD);
    this.ball.add(this.aimIndicator);
    this.aimIndicator.position.set(0, 0.08, 0);

    this.hud = new Hud(hudRoot);
    this.hud.mount();
    this.hud.setCoins(this.economy.getCoins());
    this.ball.syncVisualFromRegistry(this.cosmetics.getEquippedBallCosmetic());
    this.ball.applyCosmeticTint(
      BALL_COSMETIC_BODY_HEX[this.cosmetics.getEquippedBallCosmetic()],
    );
    this.hud.bindSkip(() => this.requestSkipLevel());
    this.overlays.syncAudioSettings(this.audio.getSettings());
    this.overlays.onPauseChange = (paused) => {
      this.paused = paused;
    };
    this.overlays.onRestart = () => this.restartHole();
    this.overlays.onContinue = () => {
      if (this.run.getPhase() === RunPhase.LevelComplete && this.celebrationShown) {
        this.hud.hideToast();
        this.hud.hideCallout();
        this.advanceLevelAfterHole();
      }
    };
    this.overlays.onAudioSettings = (settings) => {
      this.audio.setSettings(settings);
      this.overlays.syncAudioSettings(this.audio.getSettings());
    };
    this.overlays.onUiSound = () => this.audio.playNamed("ui");

    const openPauseMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.overlays.onUiSound?.();
      this.overlays.showPause(true);
    };
    const hudSettings = hudRoot.querySelector("#hud-settings-btn");
    if (hudSettings instanceof HTMLButtonElement) {
      hudSettings.addEventListener("click", openPauseMenu);
    }
    const hudPause = hudRoot.querySelector("#hud-pause-btn");
    if (hudPause instanceof HTMLButtonElement) {
      hudPause.addEventListener("click", openPauseMenu);
    }

    this.run.onPhaseChange((phase) => {
      this.audio.syncForPhase(phase, this.currentLevelIndex);
      this.shotEffects.setBallShadowEnabled(phase !== RunPhase.LevelComplete);
      if (phase === RunPhase.PreviewCamera) {
        this.previewTimer = this.cameraController.previewDuration();
      }
      if (phase === RunPhase.TransitioningCamera) {
        this.cameraController.beginTransition(this.ball.position);
        computeBallFollowCameraPose(
          this.ball.position.x,
          this.ball.position.z,
          this.generatedLevel.holePosition.x,
          this.generatedLevel.holePosition.z,
          this.camGameplayPos,
          this.camGameplayTarget,
          this.ball.position.y,
          this.cameraYawOffset,
          this.cameraZoomScale,
        );
      }
      if (phase === RunPhase.LevelComplete) {
        this.levelCompleteTimer = 0;
        this.celebrationShown = false;
        this.holePoofPlayed = false;
        this.physics.settleHard();
        const hp = this.generatedLevel.holePosition;
        const dx = this.ball.position.x - hp.x;
        const dz = this.ball.position.z - hp.z;
        this.holeVortexStartDist = Math.max(0.12, Math.hypot(dx, dz));
        this.holeVortexStartAngle = Math.atan2(dz, dx);
        this.shotEffects.onHoleSuctionStart(
          new THREE.Vector3(hp.x, hp.y + Ball.RADIUS * 0.22, hp.z),
        );
      }
      if (phase === RunPhase.ResolvingOOB) {
        this.oobTimer = OOB_MESSAGE_DURATION;
      }
    });

    this.dispatchRunEvent(RunEvent.SkipBootToLevelSpawn);
    this.loadLevel(START_LEVEL_INDEX, true);
    this.dispatchRunEvent(RunEvent.LevelSpawned);

    const dragCtx: DragShotContext = {
      camera: this.camera,
      planeY: 0,
      getPlaneY: () => this.ball.position.y,
      ballRadius: Ball.RADIUS,
      minDragWorld: MIN_DRAG_WORLD,
      maxDragWorld: MAX_DRAG_WORLD,
      powerFullDragWorld: POWER_FULL_DRAG_WORLD,
      getGameplayScreenBounds: () => this.getGameplayScreenBounds(),
      getBallWorld: () => this.ballWorldScratch.copy(this.ball.position),
      isInteractionEnabled: () => this.run.isShotInteractionEnabled(),
      canBeginShot: () =>
        this.physics.isSettled() && this.run.canStartDrag(),
      onAimBegin: () => {
        this.dispatchRunEvent(RunEvent.AimStarted);
      },
      onShot: (intent) => {
        const { directionXZ: shotDirectionXZ, power01 } = intent;
        this.shotEffects.onShot(power01, shotDirectionXZ);
        this.cameraController.kick(power01);
        this.lastShotPosition.copy(this.ball.position);
        this.dispatchRunEvent(RunEvent.ShotReleased);
        this.strokeController.recordStroke();
        this.run.record({ type: "stroke" });
        this.applyHoleSessionCommands();
        this.physics.applyShot(shotDirectionXZ, shotSpeedFromPower01(power01));
      },
      onDragCancel: () => {
        this.dispatchRunEvent(RunEvent.AimCancelled);
      },
    };

    this.input = new DragShotInput(this.canvas, dragCtx);
    this.input.attach();

    this.cameraOrbit = new CameraOrbitInput(this.canvas, {
      sensitivity: CAM_ORBIT_RAD_PER_PX,
      isPointerInGameplay: (cx, cy) => this.isPointerInGameplay(cx, cy),
      shotInput: this.input,
      canOrbit: () => {
        const p = this.run.getPhase();
        if (this.input.isAiming()) return false;
        return (
          p === RunPhase.AwaitingShot ||
          p === RunPhase.BallInFlight
        );
      },
      canNavigate: () => {
        const p = this.run.getPhase();
        return !this.input.isAiming() &&
          (p === RunPhase.PreviewCamera || p === RunPhase.AwaitingShot);
      },
      addYaw: (d) => {
        this.cameraYawOffset += d;
        this.cameraController.addYaw(d);
      },
      addZoom: (delta) => {
        this.cameraController.addZoom(delta);
      },
      addPan: (dx, dy) =>
        this.cameraController.panPreview(dx, dy, this.gameplayRect.height),
    });
    this.cameraOrbit.attach();

    window.addEventListener("resize", this.onResize);
    this.onResize();

    void loadLevelBackgroundTexture()
      .then((tex) => {
        this.levelBackdropTexture = tex;
        const mesh = createLevelBackdropMesh(
          tex,
          this.camera,
          this.levelBackdropDist,
        );
        this.levelBackdropMesh = mesh;
        this.camera.add(mesh);
      })
      .catch(() => {
        /* Missing file — sky clear color only */
      });
  }

  private dispatchRunEvent(event: RunEvent): boolean {
    const applied = this.run.dispatch(event);
    this.applyHoleSessionCommands();
    return applied;
  }

  private forceRunPhase(phase: RunPhase): void {
    this.run.forcePhase(phase);
    this.applyHoleSessionCommands();
  }

  private applyHoleSessionCommands(): void {
    for (const command of this.run.drainCommands()) {
      this.applyHoleSessionCommand(command);
    }
  }

  private applyHoleSessionCommand(command: HoleSessionCommand): void {
    switch (command.type) {
      case "phaseChanged":
      case "completeHole":
      case "setInputEnabled":
      case "spawnCollectible":
        break;
      case "updateHud":
        this.hud.setStrokesPar(
          command.snapshot.strokes,
          this.generatedLevel?.par ?? 0,
        );
        this.hud.setCoins(this.economy.getCoins());
        break;
      case "playSound":
        if (command.sound === "hit") this.audio.playHit();
        else this.audio.playNamed(command.sound);
        break;
      case "showOverlay":
        if (command.overlay === "oob") {
          this.hud.showOutOfBounds();
          this.audio.playNamed("oob");
        } else if (command.overlay === "skip") {
          this.hud.hideToast();
        }
        break;
      case "recoverOob":
        this.holeStats.oobCount++;
        this.oobTimer = OOB_MESSAGE_DURATION;
        this.offCourseLostSeconds = 0;
        this.shotEffects.onOob();
        this.physics.settleHard();
        this.ball.position.copy(this.lastStoppedLie);
        this.ball.resetVisual();
        break;
      case "recordTelemetry": {
        const result = command.result === "oob" ? "failed" : command.result;
        this.telemetry.record(this.generatedLevel, this.holeStats, {
          strokes: command.strokes,
          turnCount: command.turnCount,
          result,
        });
        break;
      }
      case "awardCurrency":
        if (command.reason === "collectible") {
          this.economy.addCoins(command.amount);
        }
        break;
    }
  }

  private loadLevel(levelIndex: number, isFirst: boolean): void {
    window.clearTimeout(this.holeSummaryTimer);
    this.holeSummaryTimer = 0;
    this.hud.hideCallout();
    this.overlays.showLoading(true);
    this.cameraYawOffset = 0;
    this.cameraZoomScale = 1;
    this.previewPanOffset.set(0, 0);
    this.stuckTimer = 0;
    this.freeSkipFromStuck = false;
    this.holeCollectedCoinValue = 0;
    this.holeStats = {
      oobCount: 0,
      restarts: 0,
      skips: 0,
      hazardHits: 0,
      coinPickups: 0,
    };
    this.disposeVoidLayer();
    this.disposeUndermapIslands();
    this.disposeIslandDecor();
    this.disposeBackgroundFloatingIslands();
    this.disposeCourse();
    this.generatedLevel = this.generatePlayableLevel(levelIndex);
    this.previousDifficultyScore = this.generatedLevel.difficultyScore;

    this.holeFlagMixers = this.levelBuilder.buildInto(
      this.courseGroup,
      this.generatedLevel,
    );

    this.backgroundFloatingIslands = createBackgroundFloatingIslands(
      this.generatedLevel,
    );
    this.scene.add(this.backgroundFloatingIslands);
    const { undermapSlots } = this.generatedLevel.procgenSourceMap
      ? resolveProcgenUndermapPlacement(
          this.generatedLevel.procgenSourceMap,
          this.generatedLevel,
        )
      : {
          undermapSlots: computeUndermapIslandSlots(this.generatedLevel),
        };
    this.undermapIslands = buildUndermapIslandGroup(undermapSlots);
    this.scene.add(this.undermapIslands);
    this.islandDecor = createIslandSurroundDecor(
      this.generatedLevel,
      undermapSlots,
      undermapSlots.length > 0 ? { islandsOnly: true } : undefined,
    );
    this.scene.add(this.islandDecor);
    this.voidLayer = new FantasyVoidLayer(this.generatedLevel.bounds);
    this.scene.add(this.voidLayer);

    this.hazardInstances = createHazardInstances(
      this.generatedLevel.hazardSpecs,
      this.generatedLevel.tiles,
    );
    for (const h of this.hazardInstances) {
      this.courseGroup.add(h.group);
    }
    this.collectibles.reset(this.generatedLevel.collectibles);
    this.courseGroup.add(this.collectibles.group);
    this.configureShadowsForCourse();
    this.strokeController.resetHole();
    this.run.resetCounters();
    this.applyHoleSessionCommands();

    const oobMaxZ = this.generatedLevel.bounds.maxZ + OOB_Z_EXTRA;
    if (isFirst) {
      this.physics = new SimpleBallPhysics(
        Ball.RADIUS,
        this.generatedLevel.bounds,
        oobMaxZ,
        this.generatedLevel.surface,
      );
    } else {
      this.physics.setBounds(this.generatedLevel.bounds, oobMaxZ);
    }
    this.physics.setSurface(this.generatedLevel.surface);
    this.courseDeckTopY = maxCourseSurfaceHeight(this.generatedLevel.surface);
    this.offCourseLostSeconds = 0;
    this.physics.setRailColliders(this.generatedLevel.railColliders);
    this.shotEffects.setSurface(this.generatedLevel.surface);

    this.placeBallAtTee();
    this.lastShotPosition.copy(this.ball.position);
    this.lastStoppedLie.copy(this.ball.position);
    this.ball.resetVisual();
    this.cameraController.resetForLevel(this.generatedLevel, this.ball.position);
    this.cameraController.updateFog(this.scene);

    computeBallFollowCameraPose(
      this.ball.position.x,
      this.ball.position.z,
      this.generatedLevel.holePosition.x,
      this.generatedLevel.holePosition.z,
      this.camGameplayPos,
      this.camGameplayTarget,
      this.ball.position.y,
      this.cameraYawOffset,
      this.cameraZoomScale,
    );
    computeTopDownCameraPose(
      this.generatedLevel.bounds,
      this.camPreviewPos,
      this.camPreviewTarget,
      this.cameraZoomScale,
      this.previewPanOffset.x,
      this.previewPanOffset.y,
    );
    this.camera.position.copy(this.camGameplayPos);
    this.camera.lookAt(this.camGameplayTarget);

    this.hud.setLevel(this.generatedLevel.levelIndex);
    this.hud.setDifficultyRating(
      this.generatedLevel.targetDifficulty,
      this.generatedLevel.imperfectDifficulty,
    );
    const endpointReplay = readProcgenEndpointReplay(this.generatedLevel);
    this.hud.setProcgenMeta({
      seed: this.generatedLevel.procgenSeed,
      progressionLevel: this.generatedLevel.progressionLevel,
      tileCount: this.generatedLevel.tiles.length,
      turnCount: this.currentTurnCount,
      rampCount: this.currentRampCount,
      endpointReplay,
    });
    this.hud.setMapSeed(
      this.generatedLevel.procgenSeed ?? this.generatedLevel.id,
      endpointReplay,
    );
    this.hud.setStrokesPar(0, this.generatedLevel.par);
    this.hud.setCoins(this.economy.getCoins());
    this.ball.syncVisualFromRegistry(this.cosmetics.getEquippedBallCosmetic());
    this.ball.applyCosmeticTint(
      BALL_COSMETIC_BODY_HEX[this.cosmetics.getEquippedBallCosmetic()],
    );
    if (this.gameLoopStarted) {
      this.showLevelIntroOverlays();
    }
    window.setTimeout(() => this.overlays.showLoading(false), 220);
    this.audio.playNamed("level");
  }

  private showLevelIntroOverlays(): void {
    this.overlays.showRoute(this.generatedLevel);
    const tutorialHole =
      this.generatedLevel.levelIndex === 1 &&
      this.generatedLevel.procgenDebugInfo?.tutorial === true;
    if (tutorialHole && !isFtueIntroComplete()) {
      window.setTimeout(() => {
        this.paused = true;
        this.overlays.startFtueIntro(FTUE_INTRO_SCRIPT, () => {
          this.paused = false;
          markFtueIntroComplete();
          this.showPostFtueIntroTips();
        });
      }, 2360);
      return;
    }
    this.showPostFtueIntroTips();
  }

  private showPostFtueIntroTips(): void {
    const tutorialHole =
      this.generatedLevel.levelIndex === 1 &&
      this.generatedLevel.procgenDebugInfo?.tutorial === true;
    if (!tutorialHole) {
      this.overlays.showTutorialOnce(
        "drag",
        "Drag to Putt",
        "Pull from the ball, release, then use the preview to plan bigger realm holes.",
      );
    }
    if (this.generatedLevel.collectibles.length > 0) {
      this.overlays.showTutorialOnce(
        "coins",
        "Collect Realm Coins",
        "Coins appear on safe straight tiles. Roll through them before sinking the shot.",
      );
    }
    if (this.generatedLevel.tiles.some((tile) => tile.isRamp)) {
      this.overlays.showTutorialOnce(
        "ramps",
        "Ramps Change Height",
        "Bright arrows mark slopes. The ball really rolls up, down, and onto elevated decks.",
      );
    }
  }

  private generatePlayableLevel(levelIndex: number): GeneratedLevel {
    const generated = this.levelService.generate(
      levelIndex,
      this.previousDifficultyScore,
    );
    this.currentTurnCount = generated.turnCount;
    this.currentRampCount = generated.rampCount;
    return generated.level;
  }

  private disposeVoidLayer(): void {
    if (!this.voidLayer) return;
    this.scene.remove(this.voidLayer);
    disposeObject3D(this.voidLayer);
    this.voidLayer = null;
  }

  private disposeUndermapIslands(): void {
    if (!this.undermapIslands) return;
    this.scene.remove(this.undermapIslands);
    disposeObject3D(this.undermapIslands);
    this.undermapIslands = null;
  }

  private disposeIslandDecor(): void {
    if (!this.islandDecor) return;
    this.scene.remove(this.islandDecor);
    disposeObject3D(this.islandDecor);
    this.islandDecor = null;
  }

  private disposeBackgroundFloatingIslands(): void {
    if (!this.backgroundFloatingIslands) return;
    this.scene.remove(this.backgroundFloatingIslands);
    disposeObject3D(this.backgroundFloatingIslands);
    this.backgroundFloatingIslands = null;
  }

  private disposeCourse(): void {
    this.holeFlagMixers = [];
    for (const h of this.hazardInstances) {
      this.courseGroup.remove(h.group);
      h.dispose();
    }
    this.hazardInstances = [];
    this.collectibles.clear();
    while (this.courseGroup.children.length) {
      const c = this.courseGroup.children[0];
      this.courseGroup.remove(c);
      disposeObject3D(c);
    }
  }

  private flashHazardHit(): void {
    this.canvas.classList.add("canvas-hit-flash");
    window.clearTimeout(this.hazardHitFlashClear);
    this.hazardHitFlashClear = window.setTimeout(() => {
      this.canvas.classList.remove("canvas-hit-flash");
    }, 72);
  }

  private placeBallAtTee(): void {
    const spawn = new THREE.Vector3(
      this.generatedLevel.startPosition.x,
      this.generatedLevel.startPosition.y,
      this.generatedLevel.startPosition.z,
    );
    const stationValues = this.generatedLevel.tiles
      .map((tile) => tile.stationIndex)
      .filter((station): station is number => typeof station === "number");
    const startStation =
      stationValues.length > 0 ? Math.min(...stationValues) : undefined;
    const startTiles =
      startStation !== undefined
        ? this.generatedLevel.tiles.filter(
            (tile) => tile.stationIndex === startStation,
          )
        : this.generatedLevel.tiles.slice(0, 1);
    if (startTiles.length > 0) {
      const cx =
        startTiles.reduce((sum, tile) => sum + tile.worldX, 0) /
        startTiles.length;
      const cz =
        startTiles.reduce((sum, tile) => sum + tile.worldZ, 0) /
        startTiles.length;
      const dx = cx - spawn.x;
      const dz = cz - spawn.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        const nudge = Math.min(TEE_CENTER_NUDGE, len * 0.42);
        spawn.x += (dx / len) * nudge;
        spawn.z += (dz / len) * nudge;
      }
    }
    this.ball.position.set(
      spawn.x,
      spawn.y,
      spawn.z,
    );
  }

  private advanceLevelAfterHole(): void {
    const nextIndex = this.currentLevelIndex + 1;
    this.audio.switchGameplayBgmToLevel(nextIndex);
    this.disposeCourse();
    this.currentLevelIndex = nextIndex;
    this.loadLevel(this.currentLevelIndex, false);
    this.dispatchRunEvent(RunEvent.LevelFinishSequenceComplete);
    this.dispatchRunEvent(RunEvent.LevelSpawned);
  }

  private restartHole(): void {
    this.parStreakCount = 0;
    this.holeStats.restarts++;
    this.telemetry.record(this.generatedLevel, this.holeStats, {
      strokes: this.strokeController.getStrokes(),
      turnCount: this.currentTurnCount,
      result: "restarted",
    });
    this.economy.removeCoins(this.holeCollectedCoinValue);
    this.forceRunPhase(RunPhase.LevelSpawning);
    this.loadLevel(this.currentLevelIndex, false);
    this.dispatchRunEvent(RunEvent.LevelSpawned);
  }

  private requestSkipLevel(): void {
    const strokes = this.strokeController.getStrokes();
    if (!this.run.canRequestSkip({
      strokes,
      par: this.generatedLevel.par,
      phase: this.run.getPhase(),
    })) {
      return;
    }
    const diff = this.generatedLevel.difficultyScore;
    const imperfect = !!this.generatedLevel.imperfectDifficulty;
    if (!this.economy.attemptSkip(diff, imperfect, this.freeSkipFromStuck)) {
      return;
    }
    this.parStreakCount = 0;
    this.holeStats.skips++;
    this.run.record({
      type: "skip",
      strokes,
      turnCount: this.currentTurnCount,
    });
    this.applyHoleSessionCommands();
    this.hud.hideToast();
    this.freeSkipFromStuck = false;
    this.stuckTimer = 0;
    this.disposeCourse();
    this.currentLevelIndex += 1;
    this.audio.switchGameplayBgmToLevel(this.currentLevelIndex);
    this.forceRunPhase(RunPhase.LevelSpawning);
    this.loadLevel(this.currentLevelIndex, false);
    this.dispatchRunEvent(RunEvent.LevelSpawned);
  }

  private unlockMilestoneCosmetic(): string | undefined {
    const level = this.generatedLevel.progressionLevel ?? this.generatedLevel.levelIndex;
    const unlocks: Array<{ at: number; id: keyof typeof BALL_COSMETIC_BODY_HEX; name: string }> = [
      { at: 5, id: "gold", name: "Royal Gold" },
      { at: 10, id: "emerald", name: "Forest Emerald" },
      { at: 15, id: "ruby", name: "Ember Ruby" },
      { at: 20, id: "sapphire", name: "Sky Sapphire" },
    ];
    const hit = unlocks.find((u) => u.at === level);
    if (!hit || this.cosmetics.isUnlocked(hit.id)) return undefined;
    this.cosmetics.unlock(hit.id);
    return hit.name;
  }

  private updateSkipUi(phase: RunPhase): void {
    const strokes = this.strokeController.getStrokes();
    const par = this.generatedLevel.par;
    const overPar = strokes > par;
    const show =
      overPar &&
      (phase === RunPhase.AwaitingShot || phase === RunPhase.BallInFlight);
    if (!show) {
      this.hud.setSkipRow({ visible: false, label: "", enabled: false });
      return;
    }
    const diff = this.generatedLevel.difficultyScore;
    const imperfect = !!this.generatedLevel.imperfectDifficulty;
    const free = imperfect || this.freeSkipFromStuck;
    const cost = this.economy.skipPrice(diff);
    const label = free ? "FREE" : `${cost} coins`;
    const enabled = free || this.economy.getCoins() >= cost;
    this.hud.setSkipRow({ visible: true, label, enabled, free });
  }

  private getGameplayScreenBounds(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const rect = this.canvas.getBoundingClientRect();
    const gw = this.gameplayRect.width;
    const gh = this.gameplayRect.height;
    const left = rect.left + (rect.width - gw) / 2;
    const top = rect.top + (rect.height - gh) / 2;
    return { left, top, width: gw, height: gh };
  }

  private isPointerInGameplay(clientX: number, clientY: number): boolean {
    const b = this.getGameplayScreenBounds();
    return (
      clientX >= b.left &&
      clientX <= b.left + b.width &&
      clientY >= b.top &&
      clientY <= b.top + b.height
    );
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gameplayRect = computePortraitGameplayRect(w, h);
    this.camera.aspect =
      this.gameplayRect.width / Math.max(1, this.gameplayRect.height);
    this.camera.updateProjectionMatrix();
    if (this.levelBackdropMesh && this.levelBackdropTexture) {
      resizeLevelBackdropMesh(
        this.levelBackdropMesh,
        this.levelBackdropTexture,
        this.camera,
        this.levelBackdropDist,
      );
    }
    this.renderer.setSize(w, h, false);
  };

  /** Idempotent — title screen may defer first call */
  start(): void {
    if (this.gameLoopStarted) return;
    this.gameLoopStarted = true;
    this.audio.tryUnlock();
    this.showLevelIntroOverlays();
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Unlocks audio after title-screen gesture (autoplay policy). */
  unlockAudio(): void {
    this.audio.tryUnlock();
  }

  /** Unlock + start level BGM on first title-screen touch (before `start()` / level phases). */
  primeAudioOnTitleScreen(): void {
    this.audio.tryUnlock();
    this.audio.startEarlyLevelBgm(this.currentLevelIndex);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.hazardHitFlashClear);
    window.clearTimeout(this.holeSummaryTimer);
    window.removeEventListener("resize", this.onResize);
    this.audio.dispose();
    this.cameraOrbit.dispose();
    this.input.dispose();
    this.disposeLevelBackdrop();
    this.shotEffects.dispose();
    this.disposeVoidLayer();
    this.disposeUndermapIslands();
    this.disposeIslandDecor();
    this.disposeBackgroundFloatingIslands();
    this.disposeCourse();
    this.psxLowResPresenter?.dispose();
  }

  private configureShadowsForCourse(): void {
    configureCourseShadows(
      this.courseGroup,
      this.keyLight,
      this.generatedLevel.bounds,
    );
  }

  private disposeLevelBackdrop(): void {
    if (!this.levelBackdropMesh) return;
    this.camera.remove(this.levelBackdropMesh);
    disposeObject3D(this.levelBackdropMesh);
    this.levelBackdropMesh = null;
    this.levelBackdropTexture = null;
  }

  private holeScoreRadius(): number {
    return holeCupRadius() * 0.56;
  }

  /**
   * Commit when the ball is in the cup ring at moderate speed — no magnetic pull during flight;
   * the “suction” is purely the LevelComplete corkscrew cinematic.
   */
  private tryHoleScore(): boolean {
    const hp = this.generatedLevel.holePosition;
    const dx = this.ball.position.x - hp.x;
    const dz = this.ball.position.z - hp.z;
    const dist = Math.hypot(dx, dz);
    const spd = Math.hypot(
      this.physics.velocity.x,
      this.physics.velocity.z,
    );
    const cupR = holeCupRadius();
    if (dist > this.holeScoreRadius()) return false;
    if (Math.abs(this.ball.position.y - hp.y) > 0.42) return false;
    if (dist > cupR * 1.22 && spd > HOLE_SCORE_MAX_SPEED) return false;
    return true;
  }

  /** Closer third-person follow — updates every frame during interactive play */
  private frame = (now: number): void => {
    const deltaSeconds = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    if (this.paused) {
      this.renderGameplayViewport();
      this.rafId = requestAnimationFrame(this.frame);
      return;
    }

    this.courseGroup.traverse((o) => {
      const cupSpin =
        this.run.getPhase() === RunPhase.LevelComplete ? 1.95 : 1;
      if (o.name === "HolePortalSurface") {
        o.rotateOnWorldAxis(HOLE_PORTAL_WORLD_UP, deltaSeconds * 0.65 * cupSpin);
      }
      if (o.name === "HolePortalSwirlRing") {
        o.rotateOnWorldAxis(HOLE_PORTAL_WORLD_UP, deltaSeconds * -0.88 * cupSpin);
      }
    });

    /** Hazard animation phase — independent of ball motion */
    for (const hz of this.hazardInstances) {
      hz.update(deltaSeconds);
    }

    for (const m of this.holeFlagMixers) {
      m.update(deltaSeconds);
    }
    this.voidLayer?.update(deltaSeconds);
    this.shotEffects.update(deltaSeconds);
    this.collectibles.update(deltaSeconds);

    const phase = this.run.getPhase();

    if (phase === RunPhase.PreviewCamera) {
      this.previewTimer -= deltaSeconds;
      const elapsed01 =
        1 - this.previewTimer / Math.max(0.001, this.cameraController.previewDuration());
      this.cameraController.updatePreview(elapsed01);
      if (this.previewTimer <= 0) {
        this.dispatchRunEvent(RunEvent.PreviewDurationElapsed);
      }
    } else if (phase === RunPhase.TransitioningCamera) {
      if (this.cameraController.updateTransition(deltaSeconds, this.ball.position)) {
        this.dispatchRunEvent(RunEvent.GameplayCameraReady);
      }
    } else if (phase === RunPhase.BallInFlight) {
      if (this.prevPhase !== RunPhase.BallInFlight) {
        this.stuckTimer = 0;
      }

      const hzCtx = {
        position: this.ball.position,
        radius: Ball.RADIUS,
      };
      const env = this.hazardEnvScratch;
      env.frictionScale = 1;
      env.accelX = 0;
      env.accelZ = 0;
      for (const hz of this.hazardInstances) {
        hz.accumulateEnvironment(hzCtx, env);
      }

      const hp = this.generatedLevel.holePosition;

      const stepEnv: PhysicsStepEnvironment = {
        frictionScale: env.frictionScale,
        planarAccelX: env.accelX,
        planarAccelZ: env.accelZ,
      };
      const res = this.physics.step(
        this.ball.position,
        deltaSeconds,
        stepEnv,
      );

      let portalFinished = false;
      let portalTeleported = false;
      for (const hz of this.hazardInstances) {
        const portalResult = hz.tryPortal?.(hzCtx, this.physics);
        if (portalResult === "finish") {
          portalFinished = true;
          break;
        }
        if (portalResult === "teleport") {
          portalTeleported = true;
        }
      }
      if (portalTeleported) {
        this.audio.playNamed("portalUse");
      }

      /** Roll whenever the ball is on / near the deck (physics y is contact/bottom) */
      const supportY = this.physics.surfaceHeightAt(
        this.ball.position.x,
        this.ball.position.z,
      );
      if (
        supportY !== null &&
        this.ball.position.y <= supportY + 0.02 &&
        Math.abs(this.physics.velocity.y) < 0.85
      ) {
        this.ball.applyPlanarRoll(
          this.physics.velocity.x,
          this.physics.velocity.z,
          deltaSeconds,
          Ball.RADIUS,
        );
      }

      let hazardHit = false;
      let mushroomBump = false;
      for (const hz of this.hazardInstances) {
        if (hz.resolveImpulses(hzCtx, this.physics, deltaSeconds)) {
          hazardHit = true;
          if (hz.hazardType === "bumper_mushroom") {
            mushroomBump = true;
          }
        }
      }
      const surfaceBump = this.physics.consumeSurfaceContact();
      if (surfaceBump || hazardHit) {
        this.audio.playBallBump();
      }
      if (hazardHit) {
        this.holeStats.hazardHits++;
        this.flashHazardHit();
        this.shotEffects.onHazardHit();
        this.audio.playNamed("hazard");
      }
      if (mushroomBump) {
        const tipTier = recordMushroomBumperHit();
        if (tipTier !== null) {
          this.overlays.showYipMushroomTip(tipTier);
        }
      }

      const coinHits = this.collectibles.collectNear(
        this.ball.position,
        Ball.RADIUS * 2.4,
      );
      for (const hit of coinHits) {
        this.holeStats.coinPickups++;
        this.holeCollectedCoinValue += hit.value;
        this.run.record({ type: "collectible", id: hit.id, value: hit.value });
        this.shotEffects.onCoinPickup(hit.position);
        this.applyHoleSessionCommands();
      }

      let bridgeOob = false;
      for (const hz of this.hazardInstances) {
        if (hz.checkBridgeOob?.(hzCtx)) {
          bridgeOob = true;
          break;
        }
      }

      const deckSample = this.physics.surfaceHeightAt(
        this.ball.position.x,
        this.ball.position.z,
      );
      const vy = this.physics.velocity.y;
      let lostOffFairway = false;
      if (deckSample !== null) {
        this.offCourseLostSeconds = 0;
      } else if (
        this.ball.position.y <= this.courseDeckTopY + 10 &&
        vy <= 0.55
      ) {
        this.offCourseLostSeconds += deltaSeconds;
        if (this.offCourseLostSeconds >= 0.14) {
          lostOffFairway = true;
        }
      } else {
        this.offCourseLostSeconds = 0;
      }

      const planarSpd = Math.hypot(
        this.physics.velocity.x,
        this.physics.velocity.z,
      );
      const distHole = Math.hypot(
        this.ball.position.x - hp.x,
        this.ball.position.z - hp.z,
      );
      if (
        planarSpd < STUCK_SKIP_PLANAR_SPEED &&
        distHole > STUCK_SKIP_MIN_DIST_FROM_HOLE
      ) {
        this.stuckTimer += deltaSeconds;
        if (
          this.stuckTimer >= STUCK_SKIP_SECONDS &&
          !this.freeSkipFromStuck
        ) {
          this.freeSkipFromStuck = true;
          this.hud.showRewardToast("free-skip");
        }
      } else {
        this.stuckTimer = 0;
      }

      if (portalFinished) {
        this.dispatchRunEvent(RunEvent.HoleScored);
      } else if (
        !res.oob &&
        !bridgeOob &&
        !lostOffFairway &&
        this.generatedLevel.finishKind !== "portal" &&
        this.tryHoleScore()
      ) {
        this.dispatchRunEvent(RunEvent.HoleScored);
      } else if (res.oob || bridgeOob || lostOffFairway) {
        this.dispatchRunEvent(RunEvent.OutOfBounds);
      } else if (this.physics.isSettled()) {
        this.lastStoppedLie.copy(this.ball.position);
        this.dispatchRunEvent(RunEvent.BallSettled);
      }
    } else if (phase === RunPhase.LevelComplete) {
      this.levelCompleteTimer += deltaSeconds;
      const t = this.levelCompleteTimer;
      const hp = this.generatedLevel.holePosition;
      const vortexEnd = HOLE_VORTEX_DURATION;
      const shrinkEnd = HOLE_SINK_SEQUENCE_DURATION;

      if (t < vortexEnd) {
        const u = t / vortexEnd;
        /** Ease-in “vacuum ramp” — lingers near rim then slurps in (comic timing). */
        const suck = Math.pow(u, 0.58);
        const wobble = 1 + 0.12 * Math.sin(u * Math.PI * 11);
        const spirals = 5.35;
        const ang = this.holeVortexStartAngle + suck * spirals * Math.PI * 2;
        const r = this.holeVortexStartDist * (1 - suck) * wobble;
        this.ball.position.x = hp.x + Math.cos(ang) * r;
        this.ball.position.z = hp.z + Math.sin(ang) * r;
        const bob = Math.sin(u * Math.PI) * 0.07 * (1 - u);
        this.ball.position.y =
          hp.y + Ball.RADIUS * (0.94 + 0.32 * (1 - u) - 0.22 * u * u) + bob;
        this.ball.setSinkProgress(0);
        const spin = 14 + 26 * u;
        this.ball.visualRoot.rotation.y += deltaSeconds * spin;
        this.ball.visualRoot.rotation.x = 0.32 * Math.sin(u * Math.PI * 5);
        this.ball.visualRoot.rotation.z = 0.18 * Math.sin(u * Math.PI * 4 + 0.7);
        const squashWobble = 1 + 0.14 * (1 - u) * Math.sin(u * Math.PI * 2);
        const shrinkIntoCup = THREE.MathUtils.lerp(1, 0.1, Math.pow(u, 1.35));
        const s = squashWobble * shrinkIntoCup;
        this.ball.visualRoot.scale.set(s, s * 0.92, s);
      } else if (t < shrinkEnd) {
        if (!this.holePoofPlayed) {
          this.holePoofPlayed = true;
          this.ball.resetVisual();
        }
        const u = (t - vortexEnd) / (shrinkEnd - vortexEnd);
        this.ball.position.set(
          hp.x,
          hp.y + Ball.RADIUS * 0.35 * (1 - u),
          hp.z,
        );
        this.ball.setSinkProgress(u);
      } else {
        this.ball.setSinkProgress(1);
        if (!this.celebrationShown) {
          this.celebrationShown = true;
          const hio = this.strokeController.getStrokes() === 1;
          const underPar =
            this.strokeController.getStrokes() <= this.generatedLevel.par;
          const unlockedCosmetic = this.unlockMilestoneCosmetic();
          this.quests.recordHole({
            underPar,
            coinsCollected: this.collectibles.getCollectedValue(),
            hazardless: this.holeStats.hazardHits === 0,
            dailyChallenge: false,
          });
          this.telemetry.record(this.generatedLevel, this.holeStats, {
            strokes: this.strokeController.getStrokes(),
            turnCount: this.currentTurnCount,
            result: "completed",
          });

          let payout = 0;
          if (hio) {
            payout = this.economy.awardHoleInOne(
              this.generatedLevel.difficultyScore,
            );
          } else {
            this.economy.recordNonHoleInOneCompletion();
          }

          let parStreakCoinPayout = 0;
          let parStreakLevel = 0;
          if (underPar) {
            this.parStreakCount += 1;
            parStreakLevel = this.parStreakCount;
            parStreakCoinPayout = parStreakBonusCoins(this.parStreakCount);
            this.economy.addCoins(parStreakCoinPayout);
          } else {
            this.parStreakCount = 0;
          }
          this.hud.setCoins(this.economy.getCoins());

          window.clearTimeout(this.holeSummaryTimer);
          const calloutMs = this.hud.presentHoleFinishCallout({
            holeInOne: hio,
            parStreakLevel,
          });
          if (hio) {
            this.audio.playNamed("holeInOne");
          } else {
            this.audio.playNamed("levelClear");
          }
          this.holeSummaryTimer = window.setTimeout(() => {
            const baseSummary = {
              strokes: this.strokeController.getStrokes(),
              par: this.generatedLevel.par,
              coinsCollected: this.collectibles.getCollectedValue(),
              parStreakCoinPayout,
              parStreakLevel,
              realmName:
                this.generatedLevel.progressionSummary?.realmName ??
                "Putt Realm",
              unlockedCosmetic,
            };
            if (hio) {
              this.overlays.showSummary({
                ...baseSummary,
                rewardCoins: payout,
              });
              this.audio.playNamed("reward");
              this.hud.setCoins(this.economy.getCoins());
            } else {
              this.overlays.showSummary({
                ...baseSummary,
                rewardCoins: 0,
              });
            }
          }, calloutMs);
        }
      }

    } else if (phase === RunPhase.ResolvingOOB) {
      this.oobTimer -= deltaSeconds;
      if (this.oobTimer <= 0) {
        this.hud.hideToast();
        this.hud.hideCallout();
        this.dispatchRunEvent(RunEvent.OobMessageComplete);
      }
    }

    const renderPhase = this.run.getPhase();
    const preview = this.input.getShotPreview();
    if (
      renderPhase === RunPhase.Aiming &&
      this.input.isAiming() &&
      preview
    ) {
      this.aimIndicator.show(
        preview.shotDirXZ,
        preview.pullLength,
        preview.power01,
      );
      this.hud.setPowerMeter(preview.power01);
    } else {
      this.aimIndicator.hide();
      this.hud.setPowerMeter(null);
    }

    if (renderPhase === RunPhase.BallInFlight) {
      this.hud.setHint("rolling");
    } else if (renderPhase === RunPhase.Aiming) {
      this.hud.setHint("release");
    } else if (
      renderPhase === RunPhase.AwaitingShot ||
      renderPhase === RunPhase.ResolvingOOB
    ) {
      this.hud.setHint("drag");
    } else {
      this.hud.setHint("drag");
    }

    this.hud.setStrokesPar(
      this.strokeController.getStrokes(),
      this.generatedLevel.par,
    );
    this.hud.setCoins(this.economy.getCoins());
    this.updateSkipUi(renderPhase);

    if (
      renderPhase !== RunPhase.PreviewCamera &&
      renderPhase !== RunPhase.TransitioningCamera
    ) {
      if (renderPhase === RunPhase.LevelComplete) {
        const hp = this.generatedLevel.holePosition;
        const sp = this.generatedLevel.startPosition;
        const vortex01 = Math.min(1, this.levelCompleteTimer / HOLE_VORTEX_DURATION);
        this.cameraController.updateHoleFinishCinematic(
          hp,
          sp,
          this.levelCompleteTimer,
          vortex01,
        );
      } else {
        this.cameraController.updateFollow(deltaSeconds, this.ball.position);
      }
    }

    if (ENABLE_DECOR_CAMERA_OCCLUSION) {
      updateDecorCameraOcclusion(
        this.camera,
        this.ball.position,
        [this.islandDecor, this.backgroundFloatingIslands],
        this.cameraController.getFollowZoomScale(),
      );
    }

    this.prevPhase = renderPhase;

    this.renderGameplayViewport();

    this.rafId = requestAnimationFrame(this.frame);
  };

  /** Draw once before RAF (e.g. title screen over live scene) */
  presentInitialFrame(): void {
    this.renderGameplayViewport();
  }

  private renderGameplayViewport(): void {
    const { x, y, width, height } = this.gameplayRect;

    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(LETTERBOX_CLEAR, 1);
    this.renderer.clear(true, true, true);

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(x, y, width, height);
    this.renderer.setScissor(x, y, width, height);
    this.renderer.setClearColor(SKY_BLUE, 1);
    this.renderer.clear(true, true, true);

    if (this.psxLowResPresenter) {
      this.psxLowResPresenter.render(this.renderer, this.scene, this.camera, SKY_BLUE, {
        x,
        y,
        width,
        height,
      });
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
