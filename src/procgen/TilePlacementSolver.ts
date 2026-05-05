import * as THREE from "three";
import type { GridCell } from "../level/pathGen";
import {
  generateSinglePath,
  isCollinearStraight,
} from "../level/pathGen";
import { bendOuterRailSigns } from "../level/bendOuterRails";
import {
  doubleRowDeckCenterX,
  getTileDefinition,
  TILE_LENGTH,
  RAMP_HEIGHT,
  rotateFlatOffset,
} from "./TileCatalog";
import type { PlacedTile, TileType } from "./MapGenerationTypes";
import { SocketDirection } from "./MapGenerationTypes";

const DX = [0, 1, 0, -1];
const DZ = [1, 0, -1, 0];

export interface TileSolveOptions {
  rng: () => number;
  allowRamps: boolean;
  allowCurves: boolean;
  rampChance?: number;
}

/**
 * Options for {@link solveDoubleRowStraightPath}.
 * Both fields are optional — omitting them produces a flat all-straight course.
 */
export interface SolveDoubleRowOptions {
  /** When true, interior Z rows may be randomly assigned as ramp rows. Default false. */
  allowRamps?: boolean;
  /** When true, the two-lane centerline may include 90-degree turns. Default false. */
  allowCurves?: boolean;
  /**
   * Seeded RNG used to decide which rows become ramps.
   * Pass the same RNG instance used for the rest of the generation call so that
   * layout is fully reproducible from the seed.
   */
  rng?: () => number;
  turnBias?: number;
  minTurns?: number;
  maxTurns?: number;
  rampChance?: number;
  minRamps?: number;
  maxRamps?: number;
}

export interface SolverOutcome {
  tiles: PlacedTile[];
  path: GridCell[];
  sumDifficultyWeights: number;
  spinePath?: GridCell[];
}

function centerOffsets(path: GridCell[]): { cx: number; cz: number } {
  let minx = Infinity;
  let maxx = -Infinity;
  let minz = Infinity;
  let maxz = -Infinity;
  for (const p of path) {
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
    minz = Math.min(minz, p.z);
    maxz = Math.max(maxz, p.z);
  }
  return { cx: (minx + maxx) / 2, cz: (minz + maxz) / 2 };
}

/** Center only on Z — double-row uses explicit world X from {@link doubleRowDeckCenterX}. */
function centerZForPath(path: GridCell[]): number {
  let minz = Infinity;
  let maxz = -Infinity;
  for (const p of path) {
    minz = Math.min(minz, p.z);
    maxz = Math.max(maxz, p.z);
  }
  return (minz + maxz) / 2;
}

function deckCenterForCell(
  cell: GridCell,
  cx: number,
  cz: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(
    (cell.x - cx) * TILE_LENGTH,
    0,
    (cell.z - cz) * TILE_LENGTH,
  );
}

function rotationForStart(cur: GridCell, next: GridCell): number {
  const nx = next.x - cur.x;
  const nz = next.z - cur.z;
  return Math.atan2(nx, nz);
}

function rotationForHole(prev: GridCell, cur: GridCell): number {
  const nx = cur.x - prev.x;
  const nz = cur.z - prev.z;
  return Math.atan2(nx, nz);
}

function rotationForMiddle(cur: GridCell, next: GridCell): number {
  const nx = next.x - cur.x;
  const nz = next.z - cur.z;
  return Math.atan2(nx, nz);
}

function crossSign2D(ax: number, az: number, bx: number, bz: number): number {
  return Math.sign(ax * bz - az * bx);
}

/** Pure +Z chain — no horizontal curves (when {@link TileSolveOptions.allowCurves} is false). */
export function buildCollinearPath(cellCount: number): GridCell[] {
  const path: GridCell[] = [];
  for (let i = 0; i < cellCount; i++) {
    path.push({ x: 0, z: i });
  }
  return path;
}

function pushDoubleRowTile(
  tiles: PlacedTile[],
  params: {
    id: string;
    tileType: TileType;
    deck: THREE.Vector3;
    rotationY: number;
    railS?: { sx: 1 | -1; sz: 1 | -1 };
    stationIndex?: number;
  },
): void {
  const def = getTileDefinition(params.tileType);
  const pivotScratch = new THREE.Vector3();
  rotateFlatOffset(def.pivotOffsetFromDeckOrigin, params.rotationY, pivotScratch);
  const pivotWorld = new THREE.Vector3().addVectors(params.deck, pivotScratch);
  tiles.push({
    id: params.id,
    tileType: params.tileType,
    position: pivotWorld.clone(),
    rotationY: params.rotationY,
    anchor: pivotWorld.clone(),
    entrySocket: def.entrySocket,
    exitSocket: def.exitSocket,
    modelKey: def.modelKey,
    ...(params.railS ? { railS: params.railS } : {}),
    ...(params.stationIndex !== undefined ? { stationIndex: params.stationIndex } : {}),
  });
}

function vecEq(ax: number, az: number, bx: number, bz: number): boolean {
  return Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
}

function cornerRotationForOutsideWalls(
  desiredA: { x: number; z: number },
  desiredB: { x: number; z: number },
): number {
  for (let k = 0; k < 4; k++) {
    const rotationY = (Math.PI / 2) * k;
    const c = Math.round(Math.cos(rotationY));
    const s = Math.round(Math.sin(rotationY));
    const right = { x: c, z: -s };
    const bottom = { x: -s, z: -c };
    const matches =
      (vecEq(right.x, right.z, desiredA.x, desiredA.z) &&
        vecEq(bottom.x, bottom.z, desiredB.x, desiredB.z)) ||
      (vecEq(right.x, right.z, desiredB.x, desiredB.z) &&
        vecEq(bottom.x, bottom.z, desiredA.x, desiredA.z));
    if (matches) return rotationY + Math.PI / 2;
  }
  return Math.PI / 2;
}

function capRotationForLane(
  dirX: number,
  dirZ: number,
  isRightLane: boolean,
  cap: "start" | "finish",
): number {
  const right = { x: dirZ, z: -dirX };
  const side = isRightLane ? right : { x: -right.x, z: -right.z };
  const end =
    cap === "start"
      ? { x: -dirX, z: -dirZ }
      : { x: dirX, z: dirZ };
  return cornerRotationForOutsideWalls(side, end);
}

function hasAdjacentTurns(path: GridCell[]): boolean {
  let previousWasTurn = false;
  for (let i = 1; i < path.length - 1; i++) {
    const isTurn = !isCollinearStraight(path[i - 1], path[i], path[i + 1]);
    if (isTurn && previousWasTurn) return true;
    previousWasTurn = isTurn;
  }
  return false;
}

function countPathTurns(path: readonly GridCell[]): number {
  let turns = 0;
  for (let i = 1; i < path.length - 1; i++) {
    if (isTurnStation(path, i)) turns++;
  }
  return turns;
}

function isTurnStation(path: readonly GridCell[], index: number): boolean {
  return (
    index > 0 &&
    index < path.length - 1 &&
    !isCollinearStraight(path[index - 1], path[index], path[index + 1])
  );
}

function isRampSafeStraightStation(
  path: readonly GridCell[],
  index: number,
): boolean {
  if (index <= 1 || index >= path.length - 2) return false;
  return (
    !isTurnStation(path, index - 1) &&
    !isTurnStation(path, index) &&
    !isTurnStation(path, index + 1)
  );
}

function keyCell(c: GridCell): string {
  return `${c.x},${c.z}`;
}

function addCell(out: Map<string, GridCell>, c: GridCell): void {
  out.set(keyCell(c), c);
}

function laneCellsForDir(anchor: GridCell, dirX: number, dirZ: number): GridCell[] {
  const rightX = dirZ;
  const rightZ = -dirX;
  return [
    { x: anchor.x, z: anchor.z },
    { x: anchor.x + rightX, z: anchor.z + rightZ },
  ];
}

function exposedSides(
  cell: GridCell,
  occupied: ReadonlySet<string>,
): { x: number; z: number }[] {
  const sides = [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
  ];
  return sides.filter((s) => !occupied.has(`${cell.x + s.x},${cell.z + s.z}`));
}

function rotationForSingleWall(side: { x: number; z: number }): number {
  for (let k = 0; k < 4; k++) {
    const rotationY = (Math.PI / 2) * k;
    const c = Math.round(Math.cos(rotationY));
    const s = Math.round(Math.sin(rotationY));
    const right = { x: c, z: -s };
    if (vecEq(right.x, right.z, side.x, side.z)) return rotationY;
  }
  return 0;
}

function solveDoubleRowCurvedPath(
  cellCount: number,
  opts: Required<Pick<SolveDoubleRowOptions, "allowRamps" | "rng">> &
    Pick<
      SolveDoubleRowOptions,
      | "turnBias"
      | "minTurns"
      | "maxTurns"
      | "rampChance"
      | "minRamps"
      | "maxRamps"
    >,
): SolverOutcome | null {
  if (cellCount < 3) return null;

  const turnBias = opts.turnBias ?? 0.32;
  const minTurns = opts.minTurns ?? 0;
  const maxTurns = opts.maxTurns ?? Math.max(0, cellCount - 2);
  let spinePath: GridCell[] | null = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const candidate = generateSinglePath({
      cellCount,
      turnBias,
      rng: opts.rng,
    });
    const turns = countPathTurns(candidate);
    if (
      candidate.length === cellCount &&
      !hasAdjacentTurns(candidate) &&
      turns >= minTurns &&
      turns <= maxTurns
    ) {
      spinePath = candidate;
      break;
    }
  }
  if (!spinePath) {
    if (minTurns > 0) return null;
    spinePath = buildCollinearPath(cellCount);
  }

  type RampDir = "ascending" | "descending";
  const rampDirByStation = new Map<number, RampDir>();

  if (opts.allowRamps) {
    let cooldown = 0;
    let rampCount = 0;
    let planElev = 0;
    const rampChance = opts.rampChance ?? 0.28;
    const minRamps = opts.minRamps ?? 0;
    const maxRamps = opts.maxRamps ?? 2;
    const eligible: number[] = [];
    for (let i = 1; i < cellCount - 1; i++) {
      if (isRampSafeStraightStation(spinePath, i)) eligible.push(i);
    }
    for (let i = 1; i < cellCount - 1; i++) {
      if (cooldown > 0) {
        cooldown--;
        continue;
      }
      if (!isRampSafeStraightStation(spinePath, i)) continue;
      if (rampCount < maxRamps && opts.rng() < rampChance) {
        const canDescend = planElev >= RAMP_HEIGHT;
        const dir: RampDir =
          canDescend && opts.rng() < 0.5 ? "descending" : "ascending";
        rampDirByStation.set(i, dir);
        rampCount++;
        cooldown = 2;
        planElev += dir === "ascending" ? RAMP_HEIGHT : -RAMP_HEIGHT;
      }
    }
    for (const i of eligible) {
      if (rampCount >= Math.min(minRamps, maxRamps)) break;
      if (rampDirByStation.has(i)) continue;
      const tooClose = [...rampDirByStation.keys()].some(
        (existing) => Math.abs(existing - i) <= 2,
      );
      if (tooClose) continue;
      rampDirByStation.set(i, "ascending");
      rampCount++;
    }
    if (rampCount < Math.min(minRamps, maxRamps)) return null;
  }

  const elevationByStation = new Array<number>(cellCount).fill(0);
  {
    let elev = 0;
    for (let i = 0; i < cellCount; i++) {
      const dir = rampDirByStation.get(i);
      if (dir === "descending") {
        elevationByStation[i] = elev - RAMP_HEIGHT;
        elev -= RAMP_HEIGHT;
      } else {
        elevationByStation[i] = elev;
        if (dir === "ascending") elev += RAMP_HEIGHT;
      }
    }
  }

  const occupied = new Map<string, GridCell>();
  const cellStation = new Map<string, number>();
  const cellTravelDir = new Map<string, { x: number; z: number }>();
  const cellRole = new Map<string, "straight" | "corner" | "floor">();
  const cellCornerWalls = new Map<
    string,
    [{ x: number; z: number }, { x: number; z: number }]
  >();

  for (let i = 0; i < spinePath.length; i++) {
    const cur = spinePath[i];
    const prev = spinePath[i - 1];
    const next = spinePath[i + 1];
    const inX = prev ? cur.x - prev.x : next!.x - cur.x;
    const inZ = prev ? cur.z - prev.z : next!.z - cur.z;
    const outX = next ? next.x - cur.x : cur.x - prev!.x;
    const outZ = next ? next.z - cur.z : cur.z - prev!.z;
    const isInterior = i !== 0 && i !== spinePath.length - 1;
    const isTurn =
      isInterior && !isCollinearStraight(prev!, cur, next!);

    const stationCells = new Map<string, GridCell>();
    for (const c of laneCellsForDir(cur, inX, inZ)) addCell(stationCells, c);
    if (isTurn) {
      for (const c of laneCellsForDir(cur, outX, outZ)) addCell(stationCells, c);
      const rightIn = { x: inZ, z: -inX };
      const rightOut = { x: outZ, z: -outX };
      const sideIn = { x: cur.x + rightIn.x, z: cur.z + rightIn.z };
      const sideOut = { x: cur.x + rightOut.x, z: cur.z + rightOut.z };
      const diagonal = {
        x: cur.x + rightIn.x + rightOut.x,
        z: cur.z + rightIn.z + rightOut.z,
      };
      const turnsLeft = inX * outZ - inZ * outX > 0;
      const inner = turnsLeft ? cur : diagonal;
      const outer = turnsLeft ? diagonal : cur;
      const outerWalls = turnsLeft
        ? [rightIn, rightOut] as const
        : [
            { x: -rightIn.x, z: -rightIn.z },
            { x: -rightOut.x, z: -rightOut.z },
          ] as const;
      addCell(stationCells, diagonal);
      cellRole.set(keyCell(inner), "floor");
      cellRole.set(keyCell(sideIn), "straight");
      cellRole.set(keyCell(sideOut), "straight");
      cellRole.set(keyCell(outer), "corner");
      cellCornerWalls.set(keyCell(outer), [outerWalls[0], outerWalls[1]]);
    }

    for (const c of stationCells.values()) {
      const k = keyCell(c);
      addCell(occupied, c);
      if (!cellStation.has(k)) cellStation.set(k, i);
      if (!cellTravelDir.has(k)) {
        cellTravelDir.set(k, isTurn ? { x: outX, z: outZ } : { x: inX, z: inZ });
      }
    }
  }

  const occupiedKeys = new Set(occupied.keys());
  const { cx: gridCx, cz: gridCz } = centerOffsets([...occupied.values()]);
  const tiles: PlacedTile[] = [];
  const path: GridCell[] = [];
  let sumWeights = 0;
  const deckScratch = new THREE.Vector3();

  for (const cell of occupied.values()) {
    const sides = exposedSides(cell, occupiedKeys);
    const station = cellStation.get(keyCell(cell)) ?? 0;
    const travel = cellTravelDir.get(keyCell(cell)) ?? { x: 0, z: 1 };
    const role = cellRole.get(keyCell(cell));
    if (sides.length === 0 && role !== "floor" && role !== "corner") continue;

    const baseRotation = Math.atan2(travel.x, travel.z);
    const isStart = station === 0;
    const isHole = station === spinePath.length - 1;
    const isInterior = !isStart && !isHole;
    const rampDir = rampDirByStation.get(station);
    const primarySide = sides[0] ?? { x: 0, z: 1 };

    let tileType: TileType;
    let rotationY: number;

    if (role === "floor" && sides.length === 0) {
      tileType = "floor_plain";
      rotationY = baseRotation;
    } else if (isStart || isHole || role === "corner" || sides.length >= 2) {
      tileType = isStart
        ? "start_placeholder"
        : isHole
          ? "hole_placeholder"
          : "convex_right_wall";
      const cornerWalls = cellCornerWalls.get(keyCell(cell)) ?? [
        sides[0] ?? primarySide,
        sides[1] ?? sides[0] ?? primarySide,
      ];
      rotationY = cornerRotationForOutsideWalls(cornerWalls[0], cornerWalls[1]);
    } else if (rampDir === "ascending") {
      const right = { x: travel.z, z: -travel.x };
      const isRightWall = vecEq(primarySide.x, primarySide.z, right.x, right.z);
      tileType = isRightWall ? "ramp_right_wall" : "ramp_left_wall";
      rotationY = baseRotation;
    } else if (rampDir === "descending") {
      const right = { x: travel.z, z: -travel.x };
      const isRightWall = vecEq(primarySide.x, primarySide.z, right.x, right.z);
      tileType = isRightWall ? "ramp_left_wall" : "ramp_right_wall";
      rotationY = baseRotation + Math.PI;
    } else {
      tileType = "straight_right_wall";
      rotationY = rotationForSingleWall(primarySide);
    }

    const def = getTileDefinition(tileType);
    if (isInterior) sumWeights += def.difficultyWeight;
    deckScratch.set(
      (cell.x - gridCx) * TILE_LENGTH,
      elevationByStation[station] ?? 0,
      (cell.z - gridCz) * TILE_LENGTH,
    );
    pushDoubleRowTile(tiles, {
      id: `pg-2rowc-${station}-${cell.x}_${cell.z}-${tileType}`,
      tileType,
      deck: deckScratch,
      rotationY,
      stationIndex: station,
      ...(tileType === "convex_right_wall"
        ? { railS: { sx: 1 as const, sz: -1 as const } }
        : {}),
    });
    path.push(cell);
  }

  if (
    rampDirByStation.size > 0 &&
    tiles.filter(
      (t) => t.tileType === "ramp_right_wall" || t.tileType === "ramp_left_wall",
    ).length < rampDirByStation.size * 2
  ) {
    return null;
  }

  return {
    tiles,
    path,
    spinePath,
    sumDifficultyWeights: sumWeights,
  };
}

/**
 * Two parallel straight lanes along +Z, with optional ramp rows.
 *
 * ### Straight rows
 * - **x=1** right lane: `straight_right_wall` rotationY=0 — wall on local +X → outer +world X.
 * - **x=0** left lane:  `straight_right_wall` rotationY=π — wall faces −X (outer left).
 *
 * ### Ramp rows  (when `opts.allowRamps` is true)
 * Rotating a ramp 180° would reverse its slope, so ramp rows use **two distinct tile types**
 * both at rotationY=0 so the slope always rises in the +Z world direction:
 * - **x=1** right lane: `ramp_right_wall` rotationY=0 — slope up, wall on +X.
 * - **x=0** left lane:  `ramp_left_wall`  rotationY=0 — slope up, wall on −X.
 *
 * ### Elevation
 * Each ramp row increments the running `currentElevation` by `RAMP_HEIGHT` for all
 * subsequent Z rows.  The Y value is baked into `PlacedTile.position.y` (= deck centre Y),
 * so downstream code (`ProcgenDebugViewer`, `LevelBuilder`) simply reads `deck.y`.
 *
 * Grid path order is row-major: (0,z),(1,z) for each z.
 */
export function solveDoubleRowStraightPath(
  cellCountZ: number,
  opts: SolveDoubleRowOptions = {},
): SolverOutcome | null {
  if (cellCountZ < 2) return null;

  const allowRamps = opts.allowRamps ?? false;
  const allowCurves = opts.allowCurves ?? false;
  const rng = opts.rng ?? (() => Math.random());

  if (allowCurves) {
    return solveDoubleRowCurvedPath(cellCountZ, {
      allowRamps,
      rng,
      turnBias: opts.turnBias,
      minTurns: opts.minTurns,
      maxTurns: opts.maxTurns,
      rampChance: opts.rampChance,
      minRamps: opts.minRamps,
      maxRamps: opts.maxRamps,
    });
  }

  const path: GridCell[] = [];
  for (let z = 0; z < cellCountZ; z++) {
    path.push({ x: 0, z }, { x: 1, z });
  }

  const cz = centerZForPath(path);

  // ── Decide which interior Z rows become ramp rows and their direction ────
  // Rules:
  //   • Only interior rows (z=1 … cellCountZ-2) are eligible.
  //   • 28 % chance per eligible row; max 2 ramp rows per course.
  //   • A 2-row cooldown after each ramp prevents back-to-back ramps.
  //   • "ascending" → ball goes UP as it travels +Z world (ramp_right/left at rot=0).
  //   • "descending" → ball goes DOWN (swap tile types + rotationY=π).
  //     Descending is only chosen when currentElevation ≥ RAMP_HEIGHT so the
  //     course never dips below Y=0.
  type RampDir = "ascending" | "descending";
  const rampRowDir = new Map<number, RampDir>();
  if (allowRamps) {
    let cooldown = 0;
    let rampCount = 0;
    let planElev = 0; // running elevation during the decision pass
    const rampChance = opts.rampChance ?? 0.28;
    const maxRamps = opts.maxRamps ?? 2;
    for (let z = 1; z < cellCountZ - 1; z++) {
      if (cooldown > 0) { cooldown--; continue; }
      if (rampCount < maxRamps && rng() < rampChance) {
        // Choose direction: descend only when we have enough height, 50/50 otherwise.
        const canDescend = planElev >= RAMP_HEIGHT;
        const dir: RampDir = (canDescend && rng() < 0.5) ? "descending" : "ascending";
        rampRowDir.set(z, dir);
        rampCount++;
        cooldown = 2;
        planElev += dir === "ascending" ? RAMP_HEIGHT : -RAMP_HEIGHT;
      }
    }
  }

  // ── Precompute piece.position.y per Z row ────────────────────────────────
  // For flat tiles: Y = currentElevation (bottom of tile = current floor).
  // For ascending ramps: Y = currentElevation (low end is the entry).
  // For descending ramps: Y = currentElevation − RAMP_HEIGHT (low end is the exit,
  //   since the rotated model's Y=0 point is at the +Z / exit end in world space).
  const rowElevation = new Array<number>(cellCountZ).fill(0);
  {
    let elev = 0;
    for (let z = 0; z < cellCountZ; z++) {
      const dir = rampRowDir.get(z);
      if (dir === "descending") {
        rowElevation[z] = elev - RAMP_HEIGHT; // piece Y = exit floor
        elev -= RAMP_HEIGHT;
      } else {
        rowElevation[z] = elev; // piece Y = entry floor (= current floor)
        if (dir === "ascending") {
          elev += RAMP_HEIGHT;
        }
      }
    }
  }

  const tiles: PlacedTile[] = [];
  let sumWeights = 0;

  const pivotScratch = new THREE.Vector3();
  const deckScratch = new THREE.Vector3();

  /*
   * Pivot geometry (top-left artist convention, TILE_WIDTH=4, TILE_LENGTH=6):
   *
   *   Straight right lane (x=1, rotationY=0):
   *     deck  = (+2, elev, zBase)
   *     pivot = deck + (−2, 0, +3) = (0, elev, zBase+3)
   *     tile covers  X=[0, +4],  Z=[zBase−3, zBase+3]
   *
   *   Straight left lane  (x=0, rotationY=π):
   *     deck  = (−2, elev, zBase)
   *     rotated pivotOffset(π) = (+2, 0, −3)
   *     pivot = (0, elev, zBase−3)
   *     tile covers  X=[−4, 0],  Z=[zBase−3, zBase+3]  ← same Z band ✓
   *
   *   Ramp right lane (x=1, rotationY=0, type=ramp_right_wall):
   *     same pivot math as straight right lane; slope rises toward +Z.
   *
   *   Ramp left lane  (x=0, rotationY=0, type=ramp_left_wall):
   *     deck  = (−2, elev, zBase)
   *     pivotOffset = (+2, 0, +3)  (left-wall convention)
   *     pivot = (0, elev, zBase+3)
   *     slope also rises toward +Z ✓ (not flipped, unlike straight left lane)
   */
  for (let i = 0; i < path.length; i++) {
    const cur = path[i];
    const z = cur.z;
    const x = cur.x;
    const isRightLane = x === 1;
    const rampDir = rampRowDir.get(z);
    const elev = rowElevation[z];

    let tileType: TileType;
    let rotationY: number;

    if (z === 0) {
      tileType = "start_placeholder";
      rotationY = capRotationForLane(0, 1, isRightLane, "start");
    } else if (z === cellCountZ - 1) {
      tileType = "hole_placeholder";
      rotationY = capRotationForLane(0, 1, isRightLane, "finish");
    } else if (rampDir === "ascending") {
      // Both at rotationY=0 so the slope rises in the +Z world direction on both lanes.
      // ramp_right_wall: wall on +X (outer right), ramp_left_wall: wall on −X (outer left).
      tileType = isRightLane ? "ramp_right_wall" : "ramp_left_wall";
      rotationY = 0;
    } else if (rampDir === "descending") {
      // Rotate 180° to reverse the slope direction (ball descends as it travels +Z).
      // Tile types swap sides so the outer wall remains on the correct world side:
      //   right lane: ramp_left_wall (−X local) + rot=π → wall on +X world ✓
      //   left lane:  ramp_right_wall (+X local) + rot=π → wall on −X world ✓
      tileType = isRightLane ? "ramp_left_wall" : "ramp_right_wall";
      rotationY = Math.PI;
    } else {
      tileType = "straight_right_wall";
      rotationY = isRightLane ? 0 : Math.PI;
    }

    const def = getTileDefinition(tileType);
    const xDeck = doubleRowDeckCenterX(isRightLane);
    const zWorldBase = (z - cz) * TILE_LENGTH;
    // Y = entry elevation of this tile row (baked into pivot so deckCenterWorldFromPivot
    // correctly recovers the elevated deck centre downstream).
    deckScratch.set(xDeck, elev, zWorldBase);
    rotateFlatOffset(def.pivotOffsetFromDeckOrigin, rotationY, pivotScratch);
    const pivotWorld = new THREE.Vector3().addVectors(deckScratch, pivotScratch);

    if (z !== 0 && z !== cellCountZ - 1) {
      sumWeights += def.difficultyWeight;
    }

    tiles.push({
      id: `pg-2row-${z}-x${x}-${tileType}`,
      tileType,
      position: pivotWorld.clone(),
      rotationY,
      anchor: pivotWorld.clone(),
      entrySocket: def.entrySocket,
      exitSocket: def.exitSocket,
      modelKey: def.modelKey,
      stationIndex: z,
    });
  }

  return {
    tiles,
    path,
    sumDifficultyWeights: sumWeights,
  };
}

/**
 * Builds typed tiles + pivots for an existing cardinal grid path (no branches).
 */
export function solveTilesAlongPath(
  path: GridCell[],
  opts: TileSolveOptions,
): SolverOutcome | null {
  if (path.length < 3) return null;

  const { rng, allowRamps, allowCurves } = opts;
  const rampChance = opts.rampChance ?? 0.28;
  const { cx, cz } = centerOffsets(path);
  const tiles: PlacedTile[] = [];
  let sumWeights = 0;

  const pivotScratch = new THREE.Vector3();
  const deckScratch = new THREE.Vector3();

  // Running elevation — incremented after each ramp tile so subsequent tiles sit higher.
  let currentElevation = 0;

  for (let i = 0; i < path.length; i++) {
    const cur = path[i];
    const prev = path[i - 1];
    const next = path[i + 1];

    let tileType: TileType;
    let rotationY: number;

    if (i === 0) {
      tileType = "start_placeholder";
      rotationY = rotationForStart(cur, next!);
    } else if (i === path.length - 1) {
      tileType = "hole_placeholder";
      rotationY = rotationForHole(prev!, cur);
    } else {
      const a = prev!;
      const b = cur;
      const c = next!;
      if (!allowCurves || isCollinearStraight(a, b, c)) {
        tileType = "straight_right_wall";
        if (
          allowRamps &&
          (!allowCurves || isRampSafeStraightStation(path, i)) &&
          rng() < rampChance
        ) {
          tileType = rng() < 0.5 ? "ramp_right_wall" : "ramp_left_wall";
        }
      } else {
        const inx = b.x - a.x;
        const inz = b.z - a.z;
        const outx = c.x - b.x;
        const outz = c.z - b.z;
        const s = crossSign2D(inx, inz, outx, outz);
        tileType = s >= 0 ? "convex_right_wall" : "concave_right_wall";
        bendOuterRailSigns(inx, inz, outx, outz);
      }
      rotationY = rotationForMiddle(cur, c);
    }

    const def = getTileDefinition(tileType);
    deckCenterForCell(cur, cx, cz, deckScratch);
    // Bake current elevation into deck Y so downstream placement is correct.
    deckScratch.y = currentElevation;
    rotateFlatOffset(def.pivotOffsetFromDeckOrigin, rotationY, pivotScratch);
    const pivotWorld = new THREE.Vector3().addVectors(deckScratch, pivotScratch);

    if (i !== 0 && i !== path.length - 1) {
      sumWeights += def.difficultyWeight;
    }

    tiles.push({
      id: `pg-${i}-${tileType}`,
      tileType,
      position: pivotWorld.clone(),
      rotationY,
      anchor: pivotWorld.clone(),
      entrySocket: def.entrySocket,
      exitSocket: def.exitSocket,
      modelKey: def.modelKey,
      stationIndex: i,
    });

    // Advance elevation after this tile (affects the next tile's entry).
    currentElevation += def.exitElevationDelta;
  }

  return {
    tiles,
    path,
    sumDifficultyWeights: sumWeights,
  };
}

/** Maximum horizontal spread (grid units). */
export function horizontalSpan(path: GridCell[]): number {
  if (path.length === 0) return 0;
  let minx = Infinity;
  let maxx = -Infinity;
  for (const p of path) {
    minx = Math.min(minx, p.x);
    maxx = Math.max(maxx, p.x);
  }
  return maxx - minx;
}

export function isPortraitReasonable(
  path: GridCell[],
  maxSpan: number,
): boolean {
  return horizontalSpan(path) <= maxSpan;
}

export function gridStepDelta(dir: SocketDirection): { dx: number; dz: number } {
  return { dx: DX[dir], dz: DZ[dir] };
}

export interface RandomPathParams {
  rng: () => number;
  cellCount: number;
  turnBias: number;
  allowCurves: boolean;
}

/** Generates a single-file path; collinear-only when curves disabled. */
export function generateRandomPath(params: RandomPathParams): GridCell[] | null {
  const { rng, cellCount, turnBias, allowCurves } = params;
  if (cellCount < 3) return null;
  if (!allowCurves) {
    return buildCollinearPath(cellCount);
  }
  const path = generateSinglePath({
    cellCount,
    turnBias,
    rng,
  });
  return path.length === cellCount ? path : null;
}
