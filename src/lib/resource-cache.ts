const PREFIX = "inteschool.resource-cache.v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const MAX_ENTRIES = 24;

interface CacheEntry<T> {
  savedAt: number;
  value: T;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function resourceCacheKey(
  section: string,
  scope: { teacherId: string; schoolId?: string; subject?: string },
  query: unknown,
): string {
  return `${PREFIX}${section}:${JSON.stringify([scope.teacherId, scope.schoolId, scope.subject, query])}`;
}

export function readResourceCache<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!entry || typeof entry.savedAt !== "number" || !Number.isFinite(entry.savedAt)
      || entry.savedAt > Date.now() || Date.now() - entry.savedAt > MAX_AGE_MS
      || entry.value == null) {
      store.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    try { store.removeItem(key); } catch { /* Storage unavailable */ }
    return null;
  }
}

export function writeResourceCache<T>(key: string, value: T): void {
  const store = storage();
  if (!store) return;
  try {
    const serialized = JSON.stringify({ savedAt: Date.now(), value } satisfies CacheEntry<T>);
    if (serialized.length > MAX_ENTRY_BYTES) return;

    const entries: { key: string; size: number; savedAt: number }[] = [];
    for (let i = 0; i < store.length; i++) {
      const itemKey = store.key(i);
      if (!itemKey?.startsWith(PREFIX) || itemKey === key) continue;
      const raw = store.getItem(itemKey) || "";
      let savedAt = 0;
      try { savedAt = (JSON.parse(raw) as CacheEntry<unknown>).savedAt || 0; } catch { /* Expire malformed entries */ }
      entries.push({ key: itemKey, size: raw.length, savedAt });
    }
    entries.sort((a, b) => b.savedAt - a.savedAt);
    let total = serialized.length;
    entries.forEach((entry, index) => {
      if (index >= MAX_ENTRIES - 1 || total + entry.size > MAX_TOTAL_BYTES
        || Date.now() - entry.savedAt > MAX_AGE_MS) {
        store.removeItem(entry.key);
      } else {
        total += entry.size;
      }
    });
    store.setItem(key, serialized);
  } catch {
    // Cache writes must never interrupt resource loading (private mode / quota).
  }
}

export function clearResourceCache(section?: string): void {
  const store = storage();
  if (!store) return;
  try {
    const prefix = section ? `${PREFIX}${section}:` : PREFIX;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
  } catch {
    // Storage may be disabled by browser policy.
  }
}
