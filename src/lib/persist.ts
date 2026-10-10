/** Best-effort sessionStorage helpers: never throw, never block the flow. */

const KEY = "pocw:landing:v1";

export function loadState<T>(): T | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveState(value: unknown): void {
  try {
    if (value == null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage full or disabled */
  }
}
