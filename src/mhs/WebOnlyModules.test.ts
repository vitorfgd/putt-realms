import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_ONLY_BROWSER_MODULES, WEB_ONLY_THREE_MODULES } from "./WebOnlyModules";

describe("web-only module registry", () => {
  it("points to existing modules that must not be treated as MHS portable code", () => {
    for (const modulePath of [...WEB_ONLY_THREE_MODULES, ...WEB_ONLY_BROWSER_MODULES]) {
      expect(existsSync(join(process.cwd(), modulePath)), modulePath).toBe(true);
    }
  });
});
