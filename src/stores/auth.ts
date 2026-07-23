import { create } from "zustand";
import type { Teacher, TeacherAffiliation } from "@/types";
import { authService } from "@/services/auth";

interface AuthState {
  teacher: Teacher | null;
  loading: boolean;
  error: string | null;
  init: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, name: string) => Promise<boolean>;
  loginWithWechat: (openId: string, unionId?: string) => Promise<boolean>;
  loginWithWecom: (userId: string, corpId: string) => Promise<boolean>;
  bindWechat: (openId: string, unionId?: string) => Promise<void>;
  unbindWechat: () => Promise<void>;
  bindWecom: (userId: string, corpId: string) => Promise<void>;
  unbindWecom: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
  clearError: () => void;
  switchAffiliation: (affiliationId: string) => Promise<boolean>;
  getCurrentAffiliation: () => TeacherAffiliation | null;
  getAffiliations: () => TeacherAffiliation[];
}

export const useAuthStore = create<AuthState>((set, get) => ({
  teacher: null,
  // 启动时先恢复持久化会话；完成前不能把 teacher=null 当成未登录。
  loading: true,
  error: null,

  init: () => {
    set({ loading: true });
    const teacher = authService.getCurrentTeacher();
    set({ teacher, loading: false });
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.login(email, password);
      set({ teacher, loading: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "登录失败";
      set({ error: msg, loading: false });
      return false;
    }
  },

  register: async (email, password, name) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.register(email, password, name);
      set({ teacher, loading: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "注册失败";
      set({ error: msg, loading: false });
      return false;
    }
  },

  loginWithWechat: async (openId, unionId) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.loginWithWechat(openId, unionId);
      set({ teacher, loading: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "微信登录失败";
      set({ error: msg, loading: false });
      return false;
    }
  },

  loginWithWecom: async (userId, corpId) => {
    set({ loading: true, error: null });
    try {
      const teacher = await authService.loginWithWecom(userId, corpId);
      set({ teacher, loading: false });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "企业微信登录失败";
      set({ error: msg, loading: false });
      return false;
    }
  },

  bindWechat: async (openId, unionId) => {
    const { teacher } = get();
    if (!teacher) throw new Error("请先登录");
    try {
      await authService.bindWechat(teacher.id, openId, unionId);
      const updatedTeacher = authService.getCurrentTeacher();
      set({ teacher: updatedTeacher });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "绑定失败";
      set({ error: msg });
      throw e;
    }
  },

  unbindWechat: async () => {
    const { teacher } = get();
    if (!teacher) throw new Error("请先登录");
    await authService.unbindWechat(teacher.id);
    const updatedTeacher = authService.getCurrentTeacher();
    set({ teacher: updatedTeacher });
  },

  bindWecom: async (userId, corpId) => {
    const { teacher } = get();
    if (!teacher) throw new Error("请先登录");
    try {
      await authService.bindWecom(teacher.id, userId, corpId);
      const updatedTeacher = authService.getCurrentTeacher();
      set({ teacher: updatedTeacher });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "绑定失败";
      set({ error: msg });
      throw e;
    }
  },

  unbindWecom: async () => {
    const { teacher } = get();
    if (!teacher) throw new Error("请先登录");
    await authService.unbindWecom(teacher.id);
    const updatedTeacher = authService.getCurrentTeacher();
    set({ teacher: updatedTeacher });
  },

  logout: async () => {
    await authService.logout();
    set({ teacher: null });
  },

  refresh: () => {
    const teacher = authService.getCurrentTeacher();
    set({ teacher });
  },

  clearError: () => set({ error: null }),

  switchAffiliation: async (affiliationId: string) => {
    const { teacher } = get();
    if (!teacher) return false;
    try {
      await authService.switchAffiliation(teacher.id, affiliationId);
      const updatedTeacher = authService.getCurrentTeacher();
      set({ teacher: updatedTeacher });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "切换身份失败";
      set({ error: msg });
      return false;
    }
  },

  getCurrentAffiliation: () => {
    const { teacher } = get();
    if (!teacher) return null;
    return authService.getCurrentAffiliation(teacher.id);
  },

  getAffiliations: () => {
    const { teacher } = get();
    if (!teacher) return [];
    return authService.getAffiliations(teacher.id);
  },
}));
