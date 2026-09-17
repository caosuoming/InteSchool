import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question, Teacher } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import {
  assertResourceCapacity,
  awardDonationCredits,
  buildQuotaSnapshot,
  consumeExamUsageInternal,
  DEFAULT_CREDIT_SETTINGS,
  quotaService,
} from "./quota.js";

const now = "2026-08-15T08:00:00.000Z";

function teacher(
  id: string,
  role: "teacher" | "school_admin" | "platform_admin" = "teacher",
  overrides: Partial<Teacher> = {},
): Teacher {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    nickname: id,
    avatar: "",
    schoolId: "school-a",
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [],
    currentAffiliationId: null,
    createdAt: now,
    ...overrides,
  };
}

function question(id: string, teacherId: string): Question {
  return {
    id,
    teacherId,
    schoolId: "school-a",
    type: "single",
    stem: `题目 ${id}`,
    options: ["A", "B"],
    answer: "A",
    analysis: "解析",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 3,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    hiddenByExamIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function state(overrides: Record<string, unknown> = {}): AppState {
  return {
    teachers: [teacher("user-a"), teacher("admin", "platform_admin")],
    currentTeacherId: "user-a",
    questions: [],
    examPapers: [],
    lectures: [],
    coursewares: [],
    materials: [],
    shareRecords: [],
    creditTransactions: [],
    platformCreditSettings: [],
    ...overrides,
  } as unknown as AppState;
}

describe("user quota service", () => {
  it("provides the requested default capacities and exam-use counts", () => {
    const appState = state();
    runWithState(appState, () => {
      const snapshot = buildQuotaSnapshot("user-a");
      expect(snapshot.resources.question.capacity).toBe(10_000);
      expect(snapshot.resources.examPaper.capacity).toBe(1_000);
      expect(snapshot.resources.lecture.capacity).toBe(1_000);
      expect(snapshot.resources.courseware.capacity).toBe(1_000);
      expect(snapshot.resources.material.capacity).toBe(1_000);
      expect(snapshot.exam.examRoom.remaining).toBe(50);
      expect(snapshot.exam.invigilation.remaining).toBe(50);
      expect(snapshot.exam.gradeStatistics.remaining).toBe(50);
    });
  });

  it("awards donation credits exactly once per donation record", () => {
    const appState = state();
    runWithState(appState, () => {
      expect(awardDonationCredits("user-a", "donation-1", "question")).toBe(1);
      expect(awardDonationCredits("user-a", "donation-1", "question")).toBe(1);
      const snapshot = buildQuotaSnapshot("user-a");
      expect(snapshot.creditBalance).toBe(1);
      expect(snapshot.resources.question.creditCapacityBonus).toBe(0);
      expect(snapshot.resources.question.capacity).toBe(10_000);
      expect((appState.creditTransactions as unknown[])).toHaveLength(1);
    });
  });

  it("supports configurable donation rewards, admin gifts, and permanent credit redemption", async () => {
    const user = teacher("user-a");
    const normal = teacher("user-b");
    const admin = teacher("admin", "platform_admin");
    const appState = state({ teachers: [user, normal, admin] });

    await runWithState(appState, async () => {
      const settings = {
        donationCredits: { ...DEFAULT_CREDIT_SETTINGS.donationCredits, question: 3 },
        capacityPerCredit: { ...DEFAULT_CREDIT_SETTINGS.capacityPerCredit, question: 25 },
      };
      await expect(quotaService.updateCreditSettings(settings, normal)).rejects.toThrow(/仅平台超级管理员/);
      await quotaService.updateCreditSettings(settings, admin);

      let snapshot = await quotaService.grantCredits("user-a", 5, admin);
      expect(snapshot.creditBalance).toBe(5);
      expect(awardDonationCredits("user-a", "donation-2", "question")).toBe(3);

      snapshot = await quotaService.redeemCredits("question", 2, user);
      expect(snapshot.creditBalance).toBe(6);
      expect(snapshot.resources.question.creditCapacityBonus).toBe(50);
      expect(snapshot.resources.question.capacity).toBe(10_050);

      await quotaService.updateCreditSettings({
        ...settings,
        capacityPerCredit: { ...settings.capacityPerCredit, question: 100 },
      }, admin);
      const afterRuleChange = buildQuotaSnapshot("user-a");
      expect(afterRuleChange.resources.question.creditCapacityBonus).toBe(50);
      expect(afterRuleChange.resources.question.capacity).toBe(10_050);
    });
  });

  it("rejects additions that would exceed a user's effective capacity", () => {
    const user = teacher("user-a", "teacher", {
      quotaOverrides: { resourceBaseCapacities: { question: 1 } },
    });
    const appState = state({ teachers: [user], questions: [question("q1", "user-a")] });
    runWithState(appState, () => {
      expect(() => assertResourceCapacity("user-a", "question")).toThrow(/题库容量不足/);
      expect(() => assertResourceCapacity("user-a", "question", 0)).not.toThrow();
    });
  });

  it("decrements exam usage and blocks use at zero", () => {
    const user = teacher("user-a", "teacher", {
      quotaOverrides: { examRemainingUses: { examRoom: 1 } },
    });
    const appState = state({ teachers: [user] });
    runWithState(appState, () => {
      expect(consumeExamUsageInternal("user-a", "examRoom")).toBe(0);
      expect(buildQuotaSnapshot("user-a").exam.examRoom.remaining).toBe(0);
      expect(() => consumeExamUsageInternal("user-a", "examRoom")).toThrow(/可使用次数已用完/);
    });
  });

  it("lets only the platform super administrator adjust another user's quotas", async () => {
    const user = teacher("user-a");
    const normal = teacher("user-b");
    const admin = teacher("admin", "platform_admin");
    const appState = state({ teachers: [user, normal, admin] });

    await runWithState(appState, async () => {
      await expect(quotaService.updateQuota(
        "user-a",
        { resourceBaseCapacities: { material: 1200 } },
        normal,
      )).rejects.toThrow(/仅平台超级管理员/);

      const updated = await quotaService.updateQuota(
        "user-a",
        {
          resourceBaseCapacities: { material: 1200 },
          examRemainingUses: { gradeStatistics: 77 },
        },
        admin,
      );
      expect(updated.resources.material.baseCapacity).toBe(1200);
      expect(updated.exam.gradeStatistics.remaining).toBe(77);
    });
  });
});
