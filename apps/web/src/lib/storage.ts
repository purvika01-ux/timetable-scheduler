// Browser-only persistence for the prototype. Everything lives in this browser's localStorage;
// nothing is sent to a server or shared between users. Parsing of stored data is in workspace.ts.

export const STORAGE_KEYS = {
  workspace: "cto.workspace.v1",
  /** Demo role switcher choice (coordinator or a teacher); a per-browser convenience. */
  role: "cto.role.v1",
} as const;

/** Keys written by earlier versions of the prototype. */
export const LEGACY_KEYS = ["cto.availability.v1", "cto.timetable.v1"] as const;

// localStorage can throw (private mode, blocked storage, quota); never let that break the page.
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
