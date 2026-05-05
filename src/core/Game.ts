import * as THREE from "three";
import { AimIndicator } from "../gameplay/AimIndicator";
import { Ball } from "../gameplay/Ball";
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
import { createSkyCloudBackdrop } from "../level/skyClouds";
import type { GeneratedLevel, LevelWorldBounds } from "../level/LevelTypes";
import { holeCupRadius } from "../level/TileDimensions";
import { BALL_COSMETIC_BODY_HEX } from "../cosmetics/cosmeticCatalog";
import { CosmeticService } from "../cosmetics/CosmeticService";
import { EconomyService } from "../economy/EconomyService";
import { Hud } from "../ui/Hud";
import {
  GAMEPLAY_ASPECT,
  HOLE_ORBIT_DAMP,
  HOLE_PULL_RADIUS,
  HOLE_RADIAL_PULL_ACCEL,
  HOLE_SCORE_MAX_SPEED,
  HOLE_SINK_DURATION,
  HOLE_SWIRL_FADE_DIST,
  HOLE_SWIRL_PULL_ACCEL,
  MAX_DRAG_WORLD,
  MAX_SHOT_SPEED,
  MIN_DRAG_WORLD,
  OOB_MESSAGE_DURATION,
  OOB_Z_EXTRA,
  POWER_FULL_DRAG_WORLD,
  PREVIEW_CAMERA_DURATION,
  GAMEPLAY_CAM_BACK_DIST,
  GAMEPLAY_CAM_HEIGHT,
  CAM_ORBIT_RAD_PER_PX,
  SKY_BLUE,
  STUCK_SKIP_MIN_DIST_FROM_HOLE,
  STUCK_SKIP_PLANAR_SPEED,
  STUCK_SKIP_SECONDS,
} from "./Constants";
import {
  RunEvent,
  RunPhase,
  RunStateMachine,
} from "./RunStateMachine";
import { GameAudio } from "../platform-browser/GameAudio";
import { GameCameraController } from "./GameCameraController";
import { PlayableLevelService } from "./PlayableLevelService";
import { ShotEffects } from "../gameplay/ShotEffects";
import { CollectibleController } from "../gameplay/CollectibleController";
import { FantasyVoidLayer } from "../level/fantasyVoid";
import { GameOverlays } from "../ui/GameOverlays";
import {
  TelemetryService,
  type HoleStatsDraft,
} from "../progression/TelemetryService";
import { QuestService } from "../progression/QuestService";

/** Cup mesh is tilted to XZ — spin around world Y so the portal swirls in the grass plane */
const HOLE_PORTAL_WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Letterbox bars — deep sky hue (not harsh black) */
const LETTERBOX_CLEAR = 0x3d78a8;
const START_LEVEL_INDEX = 1;
const MIN_CAMERA_ZOOM = 0.58;
const MAX_CAMERA_ZOOM = 1.9;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function computePortraitGameplayRect(
  innerWidth: number,
  innerHeight: number,
): { x: number; y: number; width: number; height: number } {
  let gw = innerWidth;
  let gh = gw / GAMEPLAY_ASPECT;
  if (gh > innerHeight) {
    gh = innerHeight;
    gw = gh * GAMEPLAY_ASPECT;
  }
  const x = (innerWidth - gw) / 2;
  const yTop = (innerHeight - gh) / 2;
  const yBottom = innerHeight - yTop - gh;
  return { x, y: yBottom, width: gw, height: gh };
}

/**
 * Eye sits behind the ball along the line to the hole so the cup stays in front — easier to aim than a fixed course shot.
 */
function computeBallFollowCameraPose(
  ballX: number,
  ballZ: number,
  holeX: number,
  holeZ: number,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  ballY = 0,
  yawOffset = 0,
  zoomScale = 1,
): void {
  let fx = holeX - ballX;
  let fz = holeZ - ballZ;
  const len = Math.hypot(fx, fz);
  if (len < 0.2) {
    fx = 0;
    fz = 1;
  } else {
    fx /= len;
    fz /= len;
  }
  const zoom = clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  const ox = -fx * GAMEPLAY_CAM_BACK_DIST * zoom;
  const oz = -fz * GAMEPLAY_CAM_BACK_DIST * zoom;
  const c = Math.cos(yawOffset);
  const s = Math.sin(yawOffset);
  const rx = ox * c + oz * s;
  const rz = -ox * s + oz * c;
  const eyeY =
    GAMEPLAY_CAM_HEIGHT * zoom + Math.min(4.5, Math.max(0, ballY)) * 0.42;
  /** Slightly shorten horizontal offset vs height → a bit more top-down without huge distance change */
  const horizTighten = 0.94;
  outPos.set(ballX + rx * horizTighten, eyeY, ballZ + rz * horizTighten);
  const tgtY = Ball.RADIUS * 0.58 + ballY;
  outTarget.set(ballX, tgtY, ballZ);
}

function computeTopDownCameraPose(
  bounds: LevelWorldBounds,
  outPos: THREE.Vector3,
  outTarget: THREE.Vector3,
  zoomScale = 1,
  panX = 0,
  panZ = 0,
): void {
  const cx = (bounds.minX + bounds.maxX) / 2 + panX;
  const cz = (bounds.minZ + bounds.maxZ) / 2 + panZ;
  const dx = bounds.maxX - bounds.minX;
  const dz = bounds.maxZ - bounds.minZ;
  const span = Math.max(32, dx, dz);
  const y = (span * 1.45 + 42) * clamp(zoomScale, MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
  outPos.set(cx, y, cz);
  outTarget.set(cx, 0, cz);
}

function disposeObject3D(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else (mat as THREE.Material | undefined)?.dispose();
    }
  });
}

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly courseGroup = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly run = new RunStateMachine();
  private readonly input: DragShotInput;
  private readonly cameraOrbit: CameraOrbitInput;
  private readonly hud: Hud;
  private readonly ball: Ball;
  private readonly aimIndicator: AimIndicator;
  private physics!: SimpleBallPhysics;
  private readonly strokeController = new StrokeController();
  private readonly economy = new EconomyService();
  private readonly cosmetics = new CosmeticService();
  private readonly levelService = new PlayableLevelService();
  private readonly levelBuilder = new LevelBuilder();
  private readonly telemetry = new TelemetryService();
  private readonly quests = new QuestService();
  private readonly collectibles = new CollectibleController();
  private readonly cameraController: GameCameraController;
  private readonly overlays: GameOverlays;
  private readonly ballWorldScratch = new THREE.Vector3();
  private readonly lastShotPosition = new THREE.Vector3();
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
  private previousDifficultyScore: number | undefined = undefined;

  private previewTimer = PREVIEW_CAMERA_DURATION;
  private levelCompleteTimer = 0;
  private celebrationShown = false;
  private oobTimer = 0;

  private prevPhase = RunPhase.Booting;
  private stuckTimer = 0;
  /** True after slow-roll “bad lie” timer triggers free skip for this hole */
  private freeSkipFromStuck = false;
  private coinsToastTimer = 0;
  private readonly audio = new GameAudio();
  private shotEffects!: ShotEffects;
  private voidLayer: FantasyVoidLayer | null = null;
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

  private skyBackdrop: THREE.Group | null = null;
  private levelBackdropMesh: THREE.Mesh | null = null;
  private levelBackdropTexture: THREE.Texture | null = null;
  /** Camera-local — far enough that clouds/course usually draw in front */
  private readonly levelBackdropDist = 275;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    overlayRoot: HTMLElement = hudRoot.parentElement ?? document.body,
  ) {
    this.camera = new THREE.PerspectiveCamera(48, GAMEPLAY_ASPECT, 0.1, 1200);
    this.cameraController = new GameCameraController(this.camera);
    this.overlays = new GameOverlays(overlayRoot);
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
        this.advanceLevelAfterHole();
      }
    };
    this.overlays.onAudioSettings = (settings) => {
      this.audio.setSettings(settings);
      this.overlays.syncAudioSettings(this.audio.getSettings());
    };
    this.overlays.onUiSound = () => this.audio.playNamed("ui");

    this.run.onPhaseChange((phase) => {
      this.audio.syncForPhase(phase, this.currentLevelIndex);
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
        this.physics.settleHard();
        this.shotEffects.onHoleScore(this.ball.position);
      }
      if (phase === RunPhase.ResolvingOOB) {
        this.holeStats.oobCount++;
        this.oobTimer = OOB_MESSAGE_DURATION;
        this.hud.showOutOfBounds();
        this.audio.playNamed("oob");
        this.shotEffects.onOob();
        this.physics.settleHard();
        this.ball.position.x = this.lastShotPosition.x;
        this.ball.position.z = this.lastShotPosition.z;
        this.ball.position.y = this.lastShotPosition.y;
        this.ball.resetVisual();
      }
    });

    this.run.dispatch(RunEvent.SkipBootToLevelSpawn);
    this.loadLevel(START_LEVEL_INDEX, true);
    this.run.dispatch(RunEvent.LevelSpawned);

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
        this.run.dispatch(RunEvent.AimStarted);
      },
      onShot: (shotDirectionXZ, power01) => {
        this.audio.playHit();
        this.shotEffects.onShot(power01, shotDirectionXZ);
        this.cameraController.kick(power01);
        this.lastShotPosition.copy(this.ball.position);
        this.run.dispatch(RunEvent.ShotReleased);
        this.strokeController.recordStroke();
        this.physics.applyShot(shotDirectionXZ, power01 * MAX_SHOT_SPEED);
      },
      onDragCancel: () => {
        this.run.dispatch(RunEvent.AimCancelled);
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

  private loadLevel(levelIndex: number, isFirst: boolean): void {
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
    this.disposeSkyBackdrop();
    this.disposeCourse();
    this.generatedLevel = this.generatePlayableLevel(levelIndex);
    this.previousDifficultyScore = this.generatedLevel.difficultyScore;

    this.holeFlagMixers = this.levelBuilder.buildInto(
      this.courseGroup,
      this.generatedLevel,
    );

    this.skyBackdrop = createSkyCloudBackdrop(
      this.generatedLevel.bounds,
      Math.random,
    );
    this.scene.add(this.skyBackdrop);
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
    this.physics.setRailColliders(this.generatedLevel.railColliders);
    this.shotEffects.setSurface(this.generatedLevel.surface);

    this.placeBallAtTee();
    this.lastShotPosition.copy(this.ball.position);
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
      this.generatedLevel.difficultyScore,
      this.generatedLevel.imperfectDifficulty,
    );
    this.hud.setProcgenMeta({
      seed: this.generatedLevel.procgenSeed,
      progressionLevel: this.generatedLevel.progressionLevel,
      tileCount: this.generatedLevel.tiles.length,
      turnCount: this.currentTurnCount,
      rampCount: this.currentRampCount,
    });
    this.hud.setStrokes(0);
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
    this.overlays.showTutorialOnce(
      "drag",
      "Drag to Putt",
      "Pull from the ball, release, then use the preview to plan bigger realm holes.",
    );
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

  private disposeSkyBackdrop(): void {
    if (!this.skyBackdrop) return;
    this.scene.remove(this.skyBackdrop);
    disposeObject3D(this.skyBackdrop);
    this.skyBackdrop = null;
  }

  private disposeVoidLayer(): void {
    if (!this.voidLayer) return;
    this.scene.remove(this.voidLayer);
    disposeObject3D(this.voidLayer);
    this.voidLayer = null;
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
    this.ball.position.set(
      this.generatedLevel.startPosition.x,
      this.generatedLevel.startPosition.y,
      this.generatedLevel.startPosition.z,
    );
  }

  private advanceLevelAfterHole(): void {
    this.disposeCourse();
    this.currentLevelIndex += 1;
    this.loadLevel(this.currentLevelIndex, false);
    this.run.dispatch(RunEvent.LevelFinishSequenceComplete);
    this.run.dispatch(RunEvent.LevelSpawned);
  }

  private restartHole(): void {
    this.holeStats.restarts++;
    this.telemetry.record(this.generatedLevel, this.holeStats, {
      strokes: this.strokeController.getStrokes(),
      turnCount: this.currentTurnCount,
      result: "restarted",
    });
    this.economy.removeCoins(this.holeCollectedCoinValue);
    this.run.forcePhase(RunPhase.LevelSpawning);
    this.loadLevel(this.currentLevelIndex, false);
    this.run.dispatch(RunEvent.LevelSpawned);
  }

  private requestSkipLevel(): void {
    if (this.strokeController.getStrokes() < 1) return;
    const phase = this.run.getPhase();
    if (phase !== RunPhase.AwaitingShot && phase !== RunPhase.BallInFlight) {
      return;
    }
    const diff = this.generatedLevel.difficultyScore;
    const imperfect = !!this.generatedLevel.imperfectDifficulty;
    if (!this.economy.attemptSkip(diff, imperfect, this.freeSkipFromStuck)) {
      return;
    }
    this.holeStats.skips++;
    this.telemetry.record(this.generatedLevel, this.holeStats, {
      strokes: this.strokeController.getStrokes(),
      turnCount: this.currentTurnCount,
      result: "skipped",
    });
    this.audio.playNamed("skip");
    window.clearTimeout(this.coinsToastTimer);
    this.hud.hideToast();
    this.freeSkipFromStuck = false;
    this.stuckTimer = 0;
    this.disposeCourse();
    this.currentLevelIndex += 1;
    this.run.forcePhase(RunPhase.LevelSpawning);
    this.loadLevel(this.currentLevelIndex, false);
    this.run.dispatch(RunEvent.LevelSpawned);
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
    const show =
      strokes >= 1 &&
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
    this.hud.setSkipRow({ visible: true, label, enabled });
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
    window.clearTimeout(this.coinsToastTimer);
    window.clearTimeout(this.hazardHitFlashClear);
    window.removeEventListener("resize", this.onResize);
    this.audio.dispose();
    this.cameraOrbit.dispose();
    this.input.dispose();
    this.disposeLevelBackdrop();
    this.shotEffects.dispose();
    this.disposeVoidLayer();
    this.disposeSkyBackdrop();
    this.disposeCourse();
  }

  private configureShadowsForCourse(): void {
    const b = this.generatedLevel.bounds;
    const pad = 18;
    const halfW = (b.maxX - b.minX) / 2 + pad;
    const halfH = (b.maxZ - b.minZ) / 2 + pad;
    /** Square ortho frustum so angled sun doesn’t clip diagonal fairways */
    const ext = Math.max(28, halfW, halfH);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const oc = this.keyLight.shadow.camera as THREE.OrthographicCamera;
    oc.left = -ext;
    oc.right = ext;
    oc.top = ext;
    oc.bottom = -ext;
    oc.updateProjectionMatrix();
    this.keyLight.target.position.set(cx, 0, cz);
    this.keyLight.target.updateMatrixWorld();

    this.courseGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.receiveShadow = true;
      const mat = m.material;
      const mats = Array.isArray(mat) ? mat : [mat];
      const transparent = mats.some(
        (x) => (x as THREE.Material).transparent === true,
      );
      m.castShadow = !transparent;
    });
  }

  private disposeLevelBackdrop(): void {
    if (!this.levelBackdropMesh) return;
    this.camera.remove(this.levelBackdropMesh);
    disposeObject3D(this.levelBackdropMesh);
    this.levelBackdropMesh = null;
    this.levelBackdropTexture = null;
  }

  private holeScoreRadius(): number {
    return holeCupRadius() * 0.92;
  }

  /**
   * Radial suck-in + swirl on approach; tangential damping + faded swirl near the cup
   * so the ball spirals in instead of settling into a perpetual orbit.
   */
  private accumulateHoleWell(
    env: HazardEnvironmental,
    ball: THREE.Vector3,
    holeX: number,
    holeZ: number,
    vx: number,
    vz: number,
  ): void {
    const dx = holeX - ball.x;
    const dz = holeZ - ball.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05 || dist > HOLE_PULL_RADIUS) return;
    const nx = dx / dist;
    const nz = dz / dist;
    const tx = -nz;
    const tz = nx;
    const u = 1 - dist / HOLE_PULL_RADIUS;
    const w = u * u;

    const tangVel = vx * tx + vz * tz;
    const damp = HOLE_ORBIT_DAMP * w;
    env.accelX -= tx * tangVel * damp;
    env.accelZ -= tz * tangVel * damp;

    const radial = HOLE_RADIAL_PULL_ACCEL * w;
    env.accelX += nx * radial;
    env.accelZ += nz * radial;

    const swirlFade = Math.min(
      1,
      (dist / HOLE_SWIRL_FADE_DIST) * (dist / HOLE_SWIRL_FADE_DIST),
    );
    const swirl = HOLE_SWIRL_PULL_ACCEL * w * u * swirlFade;
    env.accelX += tx * swirl;
    env.accelZ += tz * swirl;
  }

  private tryHoleScore(): boolean {
    const hp = this.generatedLevel.holePosition;
    const dx = this.ball.position.x - hp.x;
    const dz = this.ball.position.z - hp.z;
    const spd = Math.hypot(
      this.physics.velocity.x,
      this.physics.velocity.z,
    );
    if (spd > HOLE_SCORE_MAX_SPEED) return false;
    if (Math.abs(this.ball.position.y - hp.y) > 0.42) return false;
    return dx * dx + dz * dz <= this.holeScoreRadius() ** 2;
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
      if (o.name === "HolePortalSurface") {
        o.rotateOnWorldAxis(HOLE_PORTAL_WORLD_UP, deltaSeconds * 0.65);
      }
    });

    /** Windmill / axe phase — independent of ball motion */
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
        this.run.dispatch(RunEvent.PreviewDurationElapsed);
      }
    } else if (phase === RunPhase.TransitioningCamera) {
      if (this.cameraController.updateTransition(deltaSeconds, this.ball.position)) {
        this.run.dispatch(RunEvent.GameplayCameraReady);
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

      const hpWell = this.generatedLevel.holePosition;
      this.accumulateHoleWell(
        env,
        this.ball.position,
        hpWell.x,
        hpWell.z,
        this.physics.velocity.x,
        this.physics.velocity.z,
      );

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
      for (const hz of this.hazardInstances) {
        if (hz.resolveImpulses(hzCtx, this.physics, deltaSeconds)) {
          hazardHit = true;
        }
      }
      const surfaceBump = this.physics.consumeSurfaceContact();
      if (surfaceBump || hazardHit) {
        this.audio.playBallBump();
      }
      if (surfaceBump) {
        this.shotEffects.onRailBump();
      }
      if (hazardHit) {
        this.holeStats.hazardHits++;
        this.flashHazardHit();
        this.shotEffects.onHazardHit();
        this.audio.playNamed("hazard");
      }

      const coinHits = this.collectibles.collectNear(
        this.ball.position,
        Ball.RADIUS * 2.4,
      );
      for (const hit of coinHits) {
        this.holeStats.coinPickups++;
        this.holeCollectedCoinValue += hit.value;
        this.economy.addCoins(hit.value);
        this.shotEffects.onCoinPickup(hit.position);
        this.audio.playNamed("coin");
      }

      let bridgeOob = false;
      for (const hz of this.hazardInstances) {
        if (hz.checkBridgeOob?.(hzCtx)) {
          bridgeOob = true;
          break;
        }
      }

      const planarSpd = Math.hypot(
        this.physics.velocity.x,
        this.physics.velocity.z,
      );
      const hp = hpWell;
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

      if (!res.oob && !bridgeOob && this.tryHoleScore()) {
        this.run.dispatch(RunEvent.HoleScored);
      } else if (res.oob || bridgeOob) {
        this.run.dispatch(RunEvent.OutOfBounds);
      } else if (this.physics.isSettled()) {
        this.run.dispatch(RunEvent.BallSettled);
      }
    } else if (phase === RunPhase.LevelComplete) {
      this.levelCompleteTimer += deltaSeconds;
      const t = this.levelCompleteTimer;
      if (t < HOLE_SINK_DURATION) {
        this.ball.setSinkProgress(t / HOLE_SINK_DURATION);
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
          if (hio) {
            const payout = this.economy.awardHoleInOne(
              this.generatedLevel.difficultyScore,
            );
            this.hud.showHoleCelebration(true);
            this.overlays.showSummary({
              strokes: this.strokeController.getStrokes(),
              par: this.generatedLevel.par,
              coinsCollected: this.collectibles.getCollectedValue(),
              rewardCoins: payout,
              seed: this.generatedLevel.procgenSeed,
              difficulty: this.generatedLevel.difficultyScore,
              realmName:
                this.generatedLevel.progressionSummary?.realmName ?? "Putt Realm",
              unlockedCosmetic,
              questProgress: this.quests.getProgress(),
            });
            this.audio.playNamed("reward");
            window.clearTimeout(this.coinsToastTimer);
            this.coinsToastTimer = window.setTimeout(() => {
              this.hud.showCoinsEarned(payout);
              this.hud.setCoins(this.economy.getCoins());
            }, 480);
          } else {
            this.economy.recordNonHoleInOneCompletion();
            this.hud.showHoleCelebration(false);
            this.overlays.showSummary({
              strokes: this.strokeController.getStrokes(),
              par: this.generatedLevel.par,
              coinsCollected: this.collectibles.getCollectedValue(),
              rewardCoins: 0,
              seed: this.generatedLevel.procgenSeed,
              difficulty: this.generatedLevel.difficultyScore,
              realmName:
                this.generatedLevel.progressionSummary?.realmName ?? "Putt Realm",
              unlockedCosmetic,
              questProgress: this.quests.getProgress(),
            });
          }
        }
      }

    } else if (phase === RunPhase.ResolvingOOB) {
      this.oobTimer -= deltaSeconds;
      if (this.oobTimer <= 0) {
        this.hud.hideToast();
        this.run.dispatch(RunEvent.OobMessageComplete);
      }
    }

    const preview = this.input.getShotPreview();
    if (
      phase === RunPhase.Aiming &&
      this.input.isAiming() &&
      preview
    ) {
      this.aimIndicator.show(preview.shotDirXZ, preview.pullLength);
      this.hud.setPowerMeter(preview.power01);
      this.hud.setAimingChip(true);
    } else {
      this.aimIndicator.hide();
      this.hud.setPowerMeter(null);
      this.hud.setAimingChip(false);
    }

    if (phase === RunPhase.BallInFlight) {
      this.hud.setHint("rolling");
    } else if (phase === RunPhase.Aiming) {
      this.hud.setHint("release");
    } else if (
      phase === RunPhase.AwaitingShot ||
      phase === RunPhase.ResolvingOOB
    ) {
      this.hud.setHint("drag");
    } else {
      this.hud.setHint("drag");
    }

    this.hud.setStrokes(this.strokeController.getStrokes());
    this.hud.setCoins(this.economy.getCoins());
    this.updateSkipUi(phase);

    if (
      phase !== RunPhase.PreviewCamera &&
      phase !== RunPhase.TransitioningCamera
    ) {
      this.cameraController.updateFollow(deltaSeconds, this.ball.position);
    }

    this.prevPhase = phase;

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

    this.renderer.render(this.scene, this.camera);
  }
}
