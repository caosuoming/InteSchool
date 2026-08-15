import { rpcCall } from "./api";
import type {
  ExamUsageQuotaKey,
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
