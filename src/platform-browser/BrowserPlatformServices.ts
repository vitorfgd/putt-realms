import type {
  ClockService,
  PlatformServices,
  TelemetryService,
} from "../platform/PlatformServices";
import { GameAudio } from "./GameAudio";
import { browserDebugConfig } from "./BrowserDebugConfigService";
import { browserStorage } from "./BrowserStorageService";

export interface BrowserPlatformServices extends PlatformServices {
  audio: GameAudio;
}

export class BrowserClockService implements ClockService {
  now(): number {
    return Date.now();
  }

  setTimeout(handler: () => void, ms: number): number {
    return window.setTimeout(handler, ms);
  }

  clearTimeout(id: number): void {
    window.clearTimeout(id);
  }
}

export class BrowserTelemetryService implements TelemetryService {
  record(eventName: string, payload: Record<string, unknown>): void {
    void eventName;
    void payload;
  }
}

export const browserClock = new BrowserClockService();

export function createBrowserPlatformServices(): BrowserPlatformServices {
  return {
    storage: browserStorage,
    audio: new GameAudio(browserStorage),
    telemetry: new BrowserTelemetryService(),
    debugConfig: browserDebugConfig,
    clock: browserClock,
  };
}
