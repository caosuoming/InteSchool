import { create } from "zustand";
import type { Teacher, TeacherAffiliation } from "@/types";
import { authService } from "@/services/auth";

interface AuthState {
  teacher: Teacher | null;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (input: Parameters<typeof authService.register>[0]) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Parameters<typeof authService.updateProfile>[0]) => Promise<boolean>;
  clearError: () => void;
  switchAffiliation: (affiliationId: string) => Promise<boolean>;
  getCurrentAffiliation: () => TeacherAffiliation | null;
  getAffiliations: () => TeacherAffiliation[];
}

export const useAuthStore = create<AuthState>((set, get) => ({
  teacher: null,
  loading: true,
  error: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.init();
      set({ teacher, loading: false });
    } catch (error) {
      set({
        teacher: null,
        loading: false,
        error: error instanceof Error ? error.message : "服务暂时不可用",
      });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.login(email, password);
      set({ teacher, loading: false });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "登录失败", loading: false });
      return false;
    }
  },

  register: async (input) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.register(input);
      set({ teacher, loading: false });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "注册失败", loading: false });
      return false;
    }
  },

  logout: async () => {
    await authService.logout();
    set({ teacher: null });
  },

  refresh: async () => {
    const teacher = await authService.refreshCurrentTeacher();
    set({ teacher });
  },

  updateProfile: async (patch) => {
    try {
      const teacher = await authService.updateProfile(patch);
      set({ teacher, error: null });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "资料保存失败" });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  switchAffiliation: async (affiliationId) => {
    const { teacher } = get();
    if (!teacher) return false;
    try {
      await authService.switchAffiliation(teacher.id, affiliationId);
      const updated = authService.getCurrentTeacher();
      set({ teacher: updated });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "切换身份失败" });
      return false;
    }
  },

  getCurrentAffiliation: () => {
    const { teacher } = get();
    return teacher ? authService.getCurrentAffiliation(teacher.id) : null;
  },

  getAffiliations: () => {
    const { teacher } = get();
    return teacher ? authService.getAffiliations(teacher.id) : [];
  },
}));
