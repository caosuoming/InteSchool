import { create } from "zustand";
import { persist } from "zustand/middleware";

/** UI 字体版本：青春版（小）、中年版（默认）、老年版（大） */
export type UiScale = "youth" | "middle" | "senior";
export type AppearanceMode = "light" | "dark" | "eye-care";

export const uiScaleConfig: Record<UiScale, { label: string; fontSize: string; description: string }> = {
  youth: { label: "青春版", fontSize: "14px", description: "紧凑字号，信息密度高" },
  middle: { label: "中年版", fontSize: "16px", description: "默认字号，均衡舒适" },
  senior: { label: "老年版", fontSize: "18px", description: "放大字号，阅读更轻松" },
};

export const appearanceModeConfig: Record<AppearanceMode, { label: string; description: string }> = {
  light: { label: "浅色", description: "明亮清晰的默认显示模式" },
  dark: { label: "暗黑", description: "降低暗环境下的屏幕亮度刺激" },
  "eye-care": { label: "护眼", description: "柔和偏暖的低刺激背景" },
};

interface SettingsState {
  uiScale: UiScale;
  appearanceMode: AppearanceMode;
  setUiScale: (scale: UiScale) => void;
  setAppearanceMode: (mode: AppearanceMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      uiScale: "middle",
      appearanceMode: "light",
      setUiScale: (uiScale) => set({ uiScale }),
      setAppearanceMode: (appearanceMode) => set({ appearanceMode }),
    }),
    { name: "zhiti:ui-settings" },
  ),
);

/** 将字体版本同步到 :root 的 font-size，Tailwind rem 单位会随之缩放 */
export function applyUiScale(scale: UiScale) {
  const config = uiScaleConfig[scale];
  document.documentElement.style.fontSize = config.fontSize;
}

export function applyAppearanceMode(mode: AppearanceMode) {
  document.documentElement.dataset.appearance = mode;
  document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
}
