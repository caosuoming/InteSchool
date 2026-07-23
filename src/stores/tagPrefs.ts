import { create } from "zustand";
import { persist } from "zustand/middleware";

const STORAGE_KEY = "question-tag-prefs";

export interface TagPrefs {
  order: string[];
  hidden: string[];
}

const DEFAULT_PREFS: TagPrefs = {
  order: ["type", "difficulty", "recommendation", "remark", "source", "category", "grade", "schoolYear", "usage"],
  hidden: ["source", "category", "grade", "schoolYear"],
};

interface TagPrefsState {
  prefs: TagPrefs;
  toggleHidden: (key: string) => void;
  move: (key: string, direction: "left" | "right") => void;
  reset: () => void;
}

export const useTagPrefsStore = create<TagPrefsState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_PREFS,
      toggleHidden: (key: string) =>
        set((state) => ({
          prefs: {
            ...state.prefs,
            hidden: state.prefs.hidden.includes(key)
              ? state.prefs.hidden.filter((k) => k !== key)
              : [...state.prefs.hidden, key],
          },
        })),
      move: (key: string, direction: "left" | "right") =>
        set((state) => {
          const order = [...state.prefs.order];
          const idx = order.indexOf(key);
          if (idx === -1) return state;
          const targetIdx = direction === "left" ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= order.length) return state;
          [order[idx], order[targetIdx]] = [order[targetIdx], order[idx]];
          return { prefs: { ...state.prefs, order } };
        }),
      reset: () => set({ prefs: DEFAULT_PREFS }),
    }),
    {
      name: STORAGE_KEY,
    }
  )
);
