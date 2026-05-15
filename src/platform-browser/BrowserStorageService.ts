import type { StorageService } from "../platform/PlatformServices";

export class BrowserStorageService implements StorageService {
  read(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore full or unavailable browser storage */
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore unavailable browser storage */
    }
  }
}

export const browserStorage = new BrowserStorageService();
