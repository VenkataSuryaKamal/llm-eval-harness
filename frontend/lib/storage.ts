// Browser storage can be unavailable (private mode, blocked site data), so every access is guarded.
type Store = "local" | "session";

function store(kind: Store): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readJSON<T>(kind: Store, key: string): T | null {
  try {
    const raw = store(kind)?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJSON(kind: Store, key: string, value: unknown): void {
  try {
    store(kind)?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: not important */
  }
}

export function removeKey(kind: Store, key: string): void {
  try {
    store(kind)?.removeItem(key);
  } catch {
    /* ignore */
  }
}
