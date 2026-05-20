import { rotateFlatOffset, type Vec3Like } from "../core/math";
import {
  doubleRowDeckCenterX,
  TILE_LENGTH,
  TILE_WIDTH,
} from "./TileCatalog";

export const STRAIGHT_TRACE_VERSION = "straight-row-trace-v7";

const HTML_MODEL_ROOT_OFFSET: Vec3Like = {
  x: -TILE_WIDTH / 2,
  y: 0,
  z: -TILE_LENGTH / 2,
};

const HTML_GRASS_CENTER_FROM_ROOT: Vec3Like = {
  x: TILE_WIDTH / 2,
  y: 0,
  z: TILE_LENGTH / 2,
};

const MHS_TEMPLATE_LOCAL_DECK_CENTER: Vec3Like = {
  x: TILE_WIDTH / 2,
  y: -TILE_LENGTH / 2,
  z: 0,
};

interface StraightTraceRow {
  index: number;
  stripIndex: number;
  lane: "left" | "right";
  tileType: "straight_right_wall";
  rotationYRad: number;
  rotationYDeg: number;
  pitchDeg: number;
  deck: Vec3Like;
  html: {
    groupPosition: Vec3Like;
    groupRotationYRad: number;
    modelLocalPosition: Vec3Like;
    modelWorldRoot: Vec3Like;
    visualCenterWorld: Vec3Like;
    grassBaseScale: number;
    sourceGrassBaseExtent: number;
  };
  mhsExpected: {
    spawnPosition: Vec3Like;
    visualCenterWorld: Vec3Like;
    templateLocalDeckCenter: Vec3Like;
    deckCenterWorldOffset: Vec3Like;
    tileImportScale: number;
  };
  catalogPivotWorld: Vec3Like;
  mismatch: {
    htmlRootToMhsSpawn: number;
    fixedVisualCenterToDeck: number;
  };
}

interface StraightTracePayload {
  version: string;
  source: string;
  stripCount: number;
  yawOffsetDeg: number;
  pitchOffsetDeg: number;
  tileImportScale: number;
  rows: StraightTraceRow[];
  maxHtmlRootToMhsSpawn: number;
  maxFixedVisualCenterToDeck: number;
}

interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

declare global {
  interface Window {
    __puttRealmsStraightTrace?: StraightTracePayload;
  }
}

function addVec3(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subVec3(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dist2D(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function roundNumber(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function roundVec(v: Vec3Like): Vec3Like {
  return {
    x: roundNumber(v.x),
    y: roundNumber(v.y),
    z: roundNumber(v.z),
  };
}

function yawToQuat(yaw: number): QuatLike {
  const half = yaw * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}

function quatFromAxisAngle(axis: Vec3Like, angleRad: number): QuatLike {
  const half = angleRad * 0.5;
  const s = Math.sin(half);
  return {
    x: axis.x * s,
    y: axis.y * s,
    z: axis.z * s,
    w: Math.cos(half),
  };
}

function multiplyQuat(a: QuatLike, b: QuatLike): QuatLike {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function rotateVecByQuat(v: Vec3Like, q: QuatLike): Vec3Like {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function centerZ(stripCount: number): number {
  return (stripCount - 1) / 2;
}

function parseNumberParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
): number {
  const raw = params.get(name);
  if (raw == null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildStraightTracePayload(params: URLSearchParams): StraightTracePayload {
  const stripCount = Math.max(
    1,
    Math.round(parseNumberParam(params, "strips", 6)),
  );
  const yawOffsetDeg = parseNumberParam(params, "yawOffsetDeg", 0);
  const yawOffsetRad = (yawOffsetDeg * Math.PI) / 180;
  const pitchOffsetDeg = parseNumberParam(params, "pitchOffsetDeg", -90);
  const tileImportScale = parseNumberParam(params, "tileImportScale", 100);
  const rows: StraightTraceRow[] = [];

  for (let stripIndex = 0; stripIndex < stripCount; stripIndex++) {
    const zWorld = (stripIndex - centerZ(stripCount)) * TILE_LENGTH;
    for (const isRightLane of [false, true]) {
      const lane = isRightLane ? "right" : "left";
      const rotationYRad = (isRightLane ? 0 : Math.PI) + yawOffsetRad;
      const rotationYDeg = Math.round((rotationYRad * 180) / Math.PI);
      const deck: Vec3Like = {
        x: doubleRowDeckCenterX(isRightLane),
        y: 0,
        z: zWorld,
      };
      const htmlRoot = addVec3(
        deck,
        rotateFlatOffset(HTML_MODEL_ROOT_OFFSET, rotationYRad),
      );
      const htmlVisualCenter = addVec3(
        htmlRoot,
        rotateFlatOffset(HTML_GRASS_CENTER_FROM_ROOT, rotationYRad),
      );
      const deckCenterWorldOffset = rotateVecByQuat(
        MHS_TEMPLATE_LOCAL_DECK_CENTER,
        multiplyQuat(
          yawToQuat(rotationYRad),
          quatFromAxisAngle({ x: 1, y: 0, z: 0 }, (pitchOffsetDeg * Math.PI) / 180),
        ),
      );
      const mhsSpawn = subVec3(deck, deckCenterWorldOffset);
      const mhsVisualCenter = addVec3(mhsSpawn, deckCenterWorldOffset);
      const catalogPivotWorld = addVec3(
        deck,
        rotateFlatOffset(
          { x: -TILE_WIDTH / 2, y: 0, z: TILE_LENGTH / 2 },
          rotationYRad,
        ),
      );

      rows.push({
        index: rows.length,
        stripIndex,
        lane,
        tileType: "straight_right_wall",
        rotationYRad: roundNumber(rotationYRad),
        rotationYDeg,
        pitchDeg: pitchOffsetDeg,
        deck: roundVec(deck),
        html: {
          groupPosition: roundVec(deck),
          groupRotationYRad: roundNumber(rotationYRad),
          modelLocalPosition: roundVec(HTML_MODEL_ROOT_OFFSET),
          modelWorldRoot: roundVec(htmlRoot),
          visualCenterWorld: roundVec(htmlVisualCenter),
          grassBaseScale: 0.03,
          sourceGrassBaseExtent: 200,
        },
        mhsExpected: {
          spawnPosition: roundVec(mhsSpawn),
          visualCenterWorld: roundVec(mhsVisualCenter),
          templateLocalDeckCenter: roundVec(MHS_TEMPLATE_LOCAL_DECK_CENTER),
          deckCenterWorldOffset: roundVec(deckCenterWorldOffset),
          tileImportScale,
        },
        catalogPivotWorld: roundVec(catalogPivotWorld),
        mismatch: {
          htmlRootToMhsSpawn: roundNumber(dist2D(htmlRoot, mhsSpawn)),
          fixedVisualCenterToDeck: roundNumber(dist2D(mhsVisualCenter, deck)),
        },
      });
    }
  }

  return {
    version: STRAIGHT_TRACE_VERSION,
    source: "html-route",
    stripCount,
    yawOffsetDeg,
    pitchOffsetDeg,
    tileImportScale,
    rows,
    maxHtmlRootToMhsSpawn: rows.reduce(
      (max, row) => Math.max(max, row.mismatch.htmlRootToMhsSpawn),
      0,
    ),
    maxFixedVisualCenterToDeck: rows.reduce(
      (max, row) => Math.max(max, row.mismatch.fixedVisualCenterToDeck),
      0,
    ),
  };
}

export function mountStraightPlacementTrace(): void {
  const params = new URLSearchParams(location.search);
  const payload = buildStraightTracePayload(params);
  window.__puttRealmsStraightTrace = payload;
  console.log(
    `[PuttRealmsStraightTrace:${payload.version}:${payload.source}]`,
    JSON.stringify(payload),
  );

  document.body.innerHTML = "";
  const pre = document.createElement("pre");
  pre.style.whiteSpace = "pre-wrap";
  pre.style.margin = "16px";
  pre.textContent = JSON.stringify(payload, null, 2);
  document.body.append(pre);
}
