import { create } from "zustand";
import { persist } from "zustand/middleware";

/** UI 字体版本：青春版（小）、中年版（默认）、老年版（大） */
export type UiScale = "youth" | "middle" | "senior";

export const uiScaleConfig: Record<UiScale, { label: string; fontSize: string; description: string }> = {
  youth: { label: "青春版", fontSize: "14px", description: "紧凑字号，信息密度高" },
  middle: { label: "中年版", fontSize: "16px", description: "默认字号，均衡舒适" },
  senior: { label: "老年版", fontSize: "18px", description: "放大字号，阅读更轻松" },
};

interface SettingsState {
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      uiScale: "middle",
      setUiScale: (uiScale) => set({ uiScale }),
    }),
    { name: "zhiti:ui-settings" },
  ),
);

/** 将字体版本同步到 :root 的 font-size，Tailwind rem 单位会随之缩放 */
export function applyUiScale(scale: UiScale) {
  const config = uiScaleConfig[scale];
  document.documentElement.style.fontSize = config.fontSize;
}
