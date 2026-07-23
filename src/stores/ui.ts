import { create } from "zustand";
import type { Toast, ToastType } from "@/types";
import { genId } from "@/services/_shared";

interface UIState {
  toasts: Toast[];
  sidebarCollapsed: boolean;
  addToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  sidebarCollapsed: false,

  addToast: (type, title, message, duration = 3500) => {
    const id = genId("toast");
    set((state) => ({ toasts: [...state.toasts, { id, type, title, message, duration }] }));
    if (duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));

// 便捷工具
export const toast = {
  success: (title: string, message?: string) =>
    useUIStore.getState().addToast("success", title, message),
  error: (title: string, message?: string) =>
    useUIStore.getState().addToast("error", title, message),
  info: (title: string, message?: string) =>
    useUIStore.getState().addToast("info", title, message),
  warning: (title: string, message?: string) =>
    useUIStore.getState().addToast("warning", title, message),
};
