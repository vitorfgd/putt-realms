import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("dry-run MHS port map", () => {
  const text = readFileSync(
    join(process.cwd(), "docs", "mhs-port", "DRY_RUN_PORT_MAP.md"),
    "utf8",
  );

  it("documents every required source classification bucket", () => {
    for (const bucket of [
      "portable",
      "web-adapter",
      "web-debug-only",
      "future-mhs-replacement",
      "asset-pipeline",
      "exclude-from-mhs",
    ]) {
      expect(text).toContain(`\`${bucket}\``);
    }
  });

  it("documents the intended port order", () => {
    expect(text).toContain("Lock portable contracts");
    expect(text).toContain("static MHS scene bootstrap");
    expect(text).toContain("Spawn imported templates");
    expect(text).toContain("Wire gameplay/session updates");
    expect(text).toContain("Replace web adapters last");
  });
});
