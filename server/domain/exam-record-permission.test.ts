// @vitest-environment node

import { describe, expect, it } from "vitest";
import { examArrangementService } from "./examArrangement.js";
import { gradeService } from "./grade.js";
import { runWithState } from "../runtime-db.js";
import { serviceParameters } from "../service-metadata.js";
import type { AppState } from "../types.js";
import type { ExamInvigilationConfig, Teacher } from "../../src/types/index.js";

function actor(
  id: string,
  schoolId: string,
  role: "teacher" | "school_admin" | "platform_admin" = "teacher",
): Teacher {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: id.slice(0, 1),
    schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: role === "teacher" ? ["teacher", "gradeLeader"] : ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId,
      schoolName: schoolId === "school-1" ? "一中" : "二中",
      subject: "数学",
      status: "active",
      role,
      roles: role === "teacher" ? ["teacher", "gradeLeader"] : ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      isCurrent: true,
      joinedAt: "2026-08-01T00:00:00.000Z",
    }],
    currentAffiliationId: `aff-${id}`,
    createdAt: "2026-08-01T00:00:00.000Z",
  } as Teacher;
}

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    examArrangements: [{
      id: "arrangement-owned",
      schoolId: "school-1",
      teacherId: "owner",
      cohortKey: "grad-2027",
      cohortLabel: "2027届高一",
      name: "期中考试",
      examDate: "2026-08-20",
      mode: "combination",
      subjectSetupMode: "all",
      subjects: ["数学"],
      selectionSubjects: {},
      separateSubjects: [],
      simultaneousSubjectGroups: [],
      seatOrder: "random",
      rooms: [{ id: "room-1", name: "101", number: "101", location: "教学楼", capacity: 30 }],
      classRules: [],
      studentSubjects: [],
      assignments: [],
      invigilation: {
        teachers: [],
        subjectTimes: [{ subject: "数学", date: "2026-08-20", period: "morning", time: "08:00", durationMinutes: 120 }],
        patrolTeacherIds: [],
        overrides: {},
      },
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }],
    gradeExams: [{
      id: "grade-owned",
      schoolId: "school-1",
      teacherId: "owner",
      cohortKey: "grad-2027",
      cohortLabel: "2027届高一",
      name: "期中成绩",
      sourceFileName: "scores.xlsx",
      sourceSheetName: "Sheet1",
      subjects: ["数学"],
      records: [],
      settings: {},
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    }],
    gradePublications: [],
  } as AppState;
}

const invigilation: ExamInvigilationConfig = {
  teachers: [],
  subjectTimes: [{
    subject: "数学",
    date: "2026-08-20",
    period: "morning",
    time: "08:00",
    durationMinutes: 120,
  }],
  patrolTeacherIds: [],
  overrides: {},
};

describe("exam record ownership and recycle bins", () => {
  it("injects the authenticated teacher into every ownership-sensitive RPC method", () => {
    expect(serviceParameters.examArrangement.saveArrangement.at(-1)).toBe("teacher");
    expect(serviceParameters.examArrangement.saveInvigilationConfig.at(-1)).toBe("teacher");
    expect(serviceParameters.examArrangement.deleteInvigilationConfig.at(-1)).toBe("teacher");
    expect(serviceParameters.examArrangement.deleteArrangement.at(-1)).toBe("teacher");
    expect(serviceParameters.examArrangement.restoreInvigilationConfig.at(-1)).toBe("teacher");
    expect(serviceParameters.examArrangement.restoreArrangement.at(-1)).toBe("teacher");
    expect(serviceParameters.grade.saveCohortSettings.at(-1)).toBe("teacher");
    expect(serviceParameters.grade.copyCohortSettings.at(-1)).toBe("teacher");
    expect(serviceParameters.grade.updateExamMetadata.at(-1)).toBe("teacher");
    expect(serviceParameters.grade.deleteExam.at(-1)).toBe("teacher");
    expect(serviceParameters.grade.restoreExam.at(-1)).toBe("teacher");
  });

  it("keeps other exam managers read-only while allowing the same-school admin to modify", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(examArrangementService.saveInvigilationConfig(
        "school-1",
        "arrangement-owned",
        invigilation,
        actor("other-manager", "school-1"),
      )).rejects.toThrow("无权修改其他教师的监考表");

      await expect(gradeService.updateExamMetadata(
        "grade-owned",
        { name: "越权修改" },
        actor("other-manager", "school-1"),
      )).rejects.toThrow("无权修改其他教师的成绩统计");

      await expect(examArrangementService.saveInvigilationConfig(
        "school-1",
        "arrangement-owned",
        invigilation,
        actor("school-admin", "school-1", "school_admin"),
      )).resolves.toMatchObject({ id: "arrangement-owned", teacherId: "owner" });

      await expect(gradeService.updateExamMetadata(
        "grade-owned",
        { name: "管理员修改" },
        actor("school-admin", "school-1", "school_admin"),
      )).resolves.toMatchObject({ id: "grade-owned", teacherId: "owner", name: "管理员修改" });
    });
  });

  it("soft-deletes each table independently and only same-school admins can restore it", async () => {
    const appState = state();
    const owner = actor("owner", "school-1");
    const admin = actor("school-admin", "school-1", "school_admin");
    const otherSchoolAdmin = actor("other-school-admin", "school-2", "school_admin");

    await runWithState(appState, async () => {
      await examArrangementService.deleteInvigilationConfig("arrangement-owned", owner);
      const arrangementAfterInvigilationDelete = (
        await examArrangementService.listArrangements("school-1", "grad-2027")
      ).find((item) => item.id === "arrangement-owned");
      expect(arrangementAfterInvigilationDelete?.invigilationDeletedAt).toEqual(expect.any(String));
      expect(arrangementAfterInvigilationDelete?.deletedAt).toBeUndefined();

      await expect(examArrangementService.listInvigilationRecycleBin("school-1", owner))
        .rejects.toThrow("仅学校管理员可查看监考表回收站");
      await expect(examArrangementService.restoreInvigilationConfig("arrangement-owned", otherSchoolAdmin))
        .rejects.toThrow("仅学校管理员可恢复监考表");
      const restoredInvigilation = await examArrangementService.restoreInvigilationConfig("arrangement-owned", admin);
      expect(restoredInvigilation.id).toBe("arrangement-owned");
      expect(restoredInvigilation).not.toHaveProperty("invigilationDeletedAt");

      await examArrangementService.deleteArrangement("arrangement-owned", owner);
      expect(await examArrangementService.listArrangements("school-1", "grad-2027")).toEqual([]);
      expect((await examArrangementService.listArrangementRecycleBin("school-1", admin))[0])
        .toMatchObject({ id: "arrangement-owned", deletedAt: expect.any(String) });
      await expect(examArrangementService.restoreArrangement("arrangement-owned", otherSchoolAdmin))
        .rejects.toThrow("仅学校管理员可恢复考试安排");
      const restoredArrangement = await examArrangementService.restoreArrangement("arrangement-owned", admin);
      expect(restoredArrangement.id).toBe("arrangement-owned");
      expect(restoredArrangement).not.toHaveProperty("deletedAt");

      await gradeService.deleteExam("grade-owned", owner);
      expect(await gradeService.listExams("school-1", "grad-2027")).toEqual([]);
      await expect(gradeService.listExamRecycleBin("school-1", owner))
        .rejects.toThrow("仅学校管理员可查看成绩统计回收站");
      expect((await gradeService.listExamRecycleBin("school-1", admin))[0])
        .toMatchObject({ id: "grade-owned", deletedAt: expect.any(String) });
      await expect(gradeService.restoreExam("grade-owned", otherSchoolAdmin))
        .rejects.toThrow("仅学校管理员可恢复成绩统计");
      const restoredExam = await gradeService.restoreExam("grade-owned", admin);
      expect(restoredExam.id).toBe("grade-owned");
      expect(restoredExam).not.toHaveProperty("deletedAt");
    });
  });
});
