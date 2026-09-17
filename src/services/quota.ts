import { rpcCall } from "./api";
import type {
  ExamUsageQuotaKey,
  PlatformCreditSettings,
  ResourceQuotaKey,
  UserQuotaOverrides,
  UserQuotaSnapshot,
} from "@/types";

export const quotaService = {
  async getQuota(targetTeacherId: string): Promise<UserQuotaSnapshot> {
    return rpcCall("quota", "getQuota", [targetTeacherId, null]) as Promise<UserQuotaSnapshot>;
  },

  async updateQuota(
    targetTeacherId: string,
    patch: UserQuotaOverrides,
  ): Promise<UserQuotaSnapshot> {
    return rpcCall("quota", "updateQuota", [targetTeacherId, patch, null]) as Promise<UserQuotaSnapshot>;
  },

  async getCreditSettings(): Promise<PlatformCreditSettings> {
    return rpcCall("quota", "getCreditSettings", []) as Promise<PlatformCreditSettings>;
  },

  async updateCreditSettings(settings: PlatformCreditSettings): Promise<PlatformCreditSettings> {
    return rpcCall("quota", "updateCreditSettings", [settings, null]) as Promise<PlatformCreditSettings>;
  },

  async grantCredits(targetTeacherId: string, amount: number): Promise<UserQuotaSnapshot> {
    return rpcCall("quota", "grantCredits", [targetTeacherId, amount, null]) as Promise<UserQuotaSnapshot>;
  },

  async redeemCredits(resourceType: ResourceQuotaKey, credits: number): Promise<UserQuotaSnapshot> {
    const result = await rpcCall("quota", "redeemCredits", [resourceType, credits, null]) as UserQuotaSnapshot;
    if (typeof window !== "undefined") window.dispatchEvent(new Event("inteschool:quota-updated"));
    return result;
  },

  async consumeExamUsage(
    teacherId: string,
    feature: ExamUsageQuotaKey,
  ): Promise<{ key: ExamUsageQuotaKey; remaining: number }> {
    const result = await rpcCall("quota", "consumeExamUsage", [teacherId, feature]) as {
      key: ExamUsageQuotaKey;
      remaining: number;
    };
    if (typeof window !== "undefined") window.dispatchEvent(new Event("inteschool:quota-updated"));
    return result;
  },
};
