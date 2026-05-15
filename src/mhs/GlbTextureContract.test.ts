import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MHS_PREFAB_REGISTRY } from "./PrefabRegistry";

const compressedModelKeys = [
  "hazard_fan",
  "coin",
  "hazard_portal_gate",
  "hazard_bumper_mushroom",
  "hazard_windmill",
  "hazard_sandpit",
] as const;

const modelRoot = join(process.cwd(), "public", "assets", "models");

interface ParsedGlb {
  json: {
    buffers?: Array<{ byteLength: number }>;
    bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
    images?: Array<{ bufferView?: number; mimeType?: string }>;
  };
  bin: Buffer;
}

function parseGlb(file: string): ParsedGlb {
  const buffer = readFileSync(join(modelRoot, file));
  expect(buffer.toString("ascii", 0, 4)).toBe("glTF");
  expect(buffer.readUInt32LE(4)).toBe(2);
  expect(buffer.readUInt32LE(8)).toBe(buffer.length);

  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString("ascii", 16, 20)).toBe("JSON");
  const json = JSON.parse(buffer.slice(20, 20 + jsonLength).toString("utf8"));
  const binHeader = 20 + jsonLength;
  const binLength = buffer.readUInt32LE(binHeader);
  expect(buffer.toString("ascii", binHeader + 4, binHeader + 8)).toBe("BIN\0");
  return {
    json,
    bin: buffer.slice(binHeader + 8, binHeader + 8 + binLength),
  };
}

describe("compressed GLB texture contracts", () => {
  it("keeps target models valid with one embedded 1024px JPEG texture", async () => {
    for (const key of compressedModelKeys) {
      const entry = MHS_PREFAB_REGISTRY[key];
      const parsed = parseGlb(entry.file);
      expect(parsed.json.images).toHaveLength(1);
      const image = parsed.json.images![0]!;
      expect(image.mimeType).toBe("image/jpeg");
      expect(image.bufferView).toBeTypeOf("number");

      const view = parsed.json.bufferViews![image.bufferView!]!;
      const start = view.byteOffset ?? 0;
      const texture = parsed.bin.subarray(start, start + view.byteLength);
      const metadata = await sharp(texture).metadata();
      expect(metadata.format).toBe("jpeg");
      expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1024);
    }
  });

  it("keeps registry byte sizes in sync with compressed files", () => {
    for (const key of compressedModelKeys) {
      const entry = MHS_PREFAB_REGISTRY[key];
      expect(entry.sizeBytes).toBe(statSync(join(modelRoot, entry.file)).size);
    }
  });
});

