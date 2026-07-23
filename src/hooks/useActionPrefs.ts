import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "question-action-prefs";

export interface ActionPrefs {
  /** 按钮显示顺序，按 key 排列 */
  order: string[];
  /** 被折叠到"更多"菜单中的按钮 key */
  collapsed: string[];
}

const DEFAULT_PREFS: ActionPrefs = {
  order: ["addToBasket", "edit", "download", "replace", "share", "quickEdit", "delete"],
  collapsed: ["replace", "quickEdit"],
};

function loadPrefs(): ActionPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as ActionPrefs;
    return {
      order: Array.isArray(parsed.order) && parsed.order.length > 0 ? parsed.order : DEFAULT_PREFS.order,
      collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed : DEFAULT_PREFS.collapsed,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ActionPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略存储错误
  }
}

export function useActionPrefs() {
  const [prefs, setPrefs] = useState<ActionPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = useCallback((next: ActionPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  /** 将某个按钮移到折叠区 */
  const collapse = useCallback((key: string) => {
    setPrefs((prev) => {
      const next = {
        order: prev.order,
        collapsed: prev.collapsed.includes(key) ? prev.collapsed : [...prev.collapsed, key],
      };
      savePrefs(next);
      return next;
    });
  }, []);

  /** 将某个按钮从折叠区移出 */
  const expand = useCallback((key: string) => {
    setPrefs((prev) => {
      const next = {
        order: prev.order,
        collapsed: prev.collapsed.filter((k) => k !== key),
      };
      savePrefs(next);
      return next;
    });
  }, []);

  /** 移动按钮顺序 */
  const move = useCallback((key: string, direction: "left" | "right") => {
    setPrefs((prev) => {
      const order = [...prev.order];
      const idx = order.indexOf(key);
      if (idx === -1) return prev;
      const targetIdx = direction === "left" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= order.length) return prev;
      [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
      const next = { ...prev, order };
      savePrefs(next);
      return next;
    });
  }, []);

  return { prefs, update, collapse, expand, move };
}
