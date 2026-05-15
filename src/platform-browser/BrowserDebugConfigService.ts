import type { DebugConfigService } from "../platform/PlatformServices";

export class BrowserDebugConfigService implements DebugConfigService {
  getFlag(name: string): string | boolean | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.has(name)) return null;
    const value = params.get(name);
    return value === "" || value === null ? true : value;
  }
}

export const browserDebugConfig = new BrowserDebugConfigService();
