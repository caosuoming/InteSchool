import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question, ShareRecord, Teacher } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import {
  assertResourceCapacity,
  buildQuotaSnapshot,
  consumeExamUsageInternal,
  quotaService,
  recordDonationDownload,
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

function donation(id: string, fromTeacherId: string): ShareRecord {
  return {
    id,
    fromTeacherId,
    fromSchoolId: "school-a",
    scope: "public",
    kind: "donation",
    resourceType: "question",
    resourceId: `platform-${id}`,
    sourceResourceId: `source-${id}`,
    resourceTitle: "平台题目",
    resourceSnapshot: question(`snapshot-${id}`, fromTeacherId),
    status: "pending",
    createdAt: now,
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

  it("counts only retained donations downloaded by five distinct other users", () => {
    const kept = donation("kept", "user-a");
    const merged = {
      ...donation("merged", "user-a"),
      mergedIntoDonationId: "other-primary",
      downloadedByTeacherIds: ["u1", "u2", "u3", "u4", "u5"],
    };
    const appState = state({ shareRecords: [kept, merged] });

    runWithState(appState, () => {
      recordDonationDownload("kept", "user-a");
      recordDonationDownload("kept", "u1");
      recordDonationDownload("kept", "u1");
      recordDonationDownload("kept", "u2");
      recordDonationDownload("kept", "u3");
      recordDonationDownload("kept", "u4");
      expect(buildQuotaSnapshot("user-a").resources.question.effectiveDonations).toBe(0);

      recordDonationDownload("kept", "u5");
      const status = buildQuotaSnapshot("user-a").resources.question;
      expect(status.effectiveDonations).toBe(1);
      expect(status.donationBonus).toBe(10);
      expect(status.capacity).toBe(10_010);
      expect((appState.shareRecords as ShareRecord[])[0].downloadedByTeacherIds).toEqual([
        "u1", "u2", "u3", "u4", "u5",
      ]);
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
