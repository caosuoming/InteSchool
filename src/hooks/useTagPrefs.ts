import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "question-tag-prefs";

export interface TagPrefs {
  /** 标签显示顺序，按 key 排列 */
  order: string[];
  /** 被隐藏的标签 key */
  hidden: string[];
}

const DEFAULT_PREFS: TagPrefs = {
  order: ["type", "difficulty", "recommendation", "remark", "source", "category", "grade", "schoolYear", "usage"],
  hidden: ["source", "category", "grade", "schoolYear"],
};

function loadPrefs(): TagPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as TagPrefs;
    return {
      order: Array.isArray(parsed.order) && parsed.order.length > 0 ? parsed.order : DEFAULT_PREFS.order,
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : DEFAULT_PREFS.hidden,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: TagPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略存储错误
  }
}

export function useTagPrefs() {
  const [prefs, setPrefs] = useState<TagPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = useCallback((next: TagPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  /** 显示/隐藏标签 */
  const toggleHidden = useCallback((key: string) => {
    setPrefs((prev) => {
      const next = {
        ...prev,
        hidden: prev.hidden.includes(key)
          ? prev.hidden.filter((k) => k !== key)
          : [...prev.hidden, key],
      };
      savePrefs(next);
      return next;
    });
  }, []);

  /** 移动标签顺序 */
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

  /** 重置为默认 */
  const reset = useCallback(() => {
    setPrefs(DEFAULT_PREFS);
    savePrefs(DEFAULT_PREFS);
  }, []);

  return { prefs, update, toggleHidden, move, reset };
}
