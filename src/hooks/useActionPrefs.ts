import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_STORAGE_KEY = "question-action-prefs";
const EVENT_PREFIX = "inteschool-action-prefs:";

export interface ActionPrefs {
  /** 按钮显示顺序，按 key 排列。 */
  order: string[];
  /** 被折叠到“更多”菜单中的按钮 key。 */
  collapsed: string[];
}

export interface UseActionPrefsOptions {
  storageKey?: string;
  defaultPrefs?: ActionPrefs;
}

const DEFAULT_QUESTION_ACTION_PREFS: ActionPrefs = {
  order: ["addToBasket", "edit", "download", "replace", "share", "quickEdit", "delete"],
  collapsed: ["replace", "quickEdit"],
};

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function normalizePrefs(value: unknown, defaults: ActionPrefs): ActionPrefs {
  if (!value || typeof value !== "object") return defaults;
  const parsed = value as Partial<ActionPrefs>;
  const storedOrder = uniqueStrings(parsed.order);
  const order = [
    ...storedOrder,
    ...defaults.order.filter((key) => !storedOrder.includes(key)),
  ];
  const collapsed = Array.isArray(parsed.collapsed)
    ? uniqueStrings(parsed.collapsed)
    : defaults.collapsed;
  return { order: order.length > 0 ? order : defaults.order, collapsed };
}

function loadPrefs(storageKey: string, defaults: ActionPrefs): ActionPrefs {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    return normalizePrefs(JSON.parse(raw), defaults);
  } catch {
    return defaults;
  }
}

function notifyPrefsChanged(storageKey: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(`${EVENT_PREFIX}${storageKey}`));
}

function savePrefs(storageKey: string, prefs: ActionPrefs) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    // 存储不可用时仍保留当前页面内的设置。
  }
  notifyPrefsChanged(storageKey);
}

export function useActionPrefs(options: UseActionPrefsOptions = {}) {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const defaultPrefs = options.defaultPrefs ?? DEFAULT_QUESTION_ACTION_PREFS;
  const normalizedDefaults = useMemo<ActionPrefs>(() => ({
    order: [...defaultPrefs.order],
    collapsed: [...defaultPrefs.collapsed],
  }), [defaultPrefs]);
  const [prefs, setPrefs] = useState<ActionPrefs>(normalizedDefaults);
  const prefsRef = useRef(prefs);

  const applyPrefs = useCallback((next: ActionPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  useEffect(() => {
    const reload = () => applyPrefs(loadPrefs(storageKey, normalizedDefaults));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) reload();
    };

    reload();
    window.addEventListener(`${EVENT_PREFIX}${storageKey}`, reload);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(`${EVENT_PREFIX}${storageKey}`, reload);
      window.removeEventListener("storage", handleStorage);
    };
  }, [applyPrefs, normalizedDefaults, storageKey]);

  const commit = useCallback((next: ActionPrefs) => {
    applyPrefs(next);
    savePrefs(storageKey, next);
  }, [applyPrefs, storageKey]);

  const update = useCallback((next: ActionPrefs) => {
    commit(normalizePrefs(next, normalizedDefaults));
  }, [commit, normalizedDefaults]);

  const collapse = useCallback((key: string) => {
    const prev = prefsRef.current;
    commit({
      order: prev.order,
      collapsed: prev.collapsed.includes(key) ? prev.collapsed : [...prev.collapsed, key],
    });
  }, [commit]);

  const expand = useCallback((key: string) => {
    const prev = prefsRef.current;
    commit({
      order: prev.order,
      collapsed: prev.collapsed.filter((item) => item !== key),
    });
  }, [commit]);

  const move = useCallback((key: string, direction: "left" | "right") => {
    const prev = prefsRef.current;
    const order = [...prev.order];
    const index = order.indexOf(key);
    if (index === -1) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    commit({ ...prev, order });
  }, [commit]);

  return { prefs, update, collapse, expand, move };
}
