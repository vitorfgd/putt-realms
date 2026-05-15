export interface StorageService {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export interface AudioService {
  setMusicMuted(muted: boolean): void;
  setSfxMuted(muted: boolean): void;
  playSfx(id: string): void;
}

export interface TelemetryService {
  record(eventName: string, payload: Record<string, unknown>): void;
}

export interface DebugConfigService {
  getFlag(name: string): string | boolean | null;
}

export interface ClockService {
  now(): number;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface PlatformServices {
  storage: StorageService;
  audio: AudioService;
  telemetry: TelemetryService;
  debugConfig: DebugConfigService;
  clock: ClockService;
}
