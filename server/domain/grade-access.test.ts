// @vitest-environment node
import { describe, expect, it } from "vitest";
import { gradeService } from "./grade.js";
import { runWithState } from "../runtime-db.js";
import { serviceParameters } from "../service-metadata.js";
import type { AppState } from "../types.js";
import type { Teacher } from "../../src/types/index.js";

function teacher(id: string, schoolId = "school-1"): Teacher {
  return {
    id, schoolId, name: id, role: "teacher", roles: ["teacher"], subject: "数学", status: "active",
    affiliations: [{ id: `${id}-aff`, teacherId: id, schoolId, schoolName: schoolId, status: "active",
      role: "teacher", roles: ["teacher"], subject: "数学", isCurrent: true, joinedAt: "2026-09-01" }],
  } as Teacher;
}

function makeState(): AppState {
  return {
    teachers: [teacher("owner"), teacher("guest"), teacher("exempt"), teacher("stranger", "school-2")],
    currentTeacherId: null,
    gradeExams: [{
      id: "exam-1", teacherId: "owner", schoolId: "school-1", cohortKey: "grad-2026", cohortLabel: "2026届",
      name: "期中", sourceFileName: "scores.xlsx", sourceSheetName: "Sheet1", subjects: ["数学"],
      records: [{ id: "score-1", studentId: "s1", studentName: "测试学生", studentNo: "001", classId: "c1",
        className: "1班", scores: { 数学: 88 }, assignedScores: { 数学: 88 }, rawTotal: 88,
        assignedTotal: 88, gradeRank: 1, classRank: 1 }],
      settings: { subjectTeacherIds: {}, assignmentRules: {}, classSubjects: [], templates: [] },
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    }],
    gradeExamAccess: [], gradeExamAccessGrants: [], gradePublications: [],
  } as unknown as AppState;
}

describe("grade exam access control", () => {
  it("only permits the uploader to manage access, hides grades and grants exemptions", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      await expect(gradeService.setExamAccess("exam-1", { password: "password123" }, teacher("guest")))
        .rejects.toThrow("仅上传者");
      await gradeService.setExamAccess("exam-1", { password: "password123" }, teacher("owner"));
      const masked = (await gradeService.listExams("school-1", undefined, teacher("guest")))[0];
      expect(masked.records).toEqual([]);
      expect(masked.accessControl?.locked).toBe(true);
      expect(JSON.stringify(masked)).not.toContain("password123");
      await expect(gradeService.getExam("exam-1", undefined, teacher("guest"))).rejects.toThrow("访问密码");
      await expect(gradeService.getExam("exam-1", undefined, teacher("stranger", "school-2"))).rejects.toThrow();
      await expect(gradeService.unlockExam("exam-1", "wrong", teacher("guest"))).rejects.toThrow("密码错误");
      const token = await gradeService.unlockExam("exam-1", "password123", teacher("guest"));
      expect((await gradeService.getExam("exam-1", token, teacher("guest")))?.records[0].scores.数学).toBe(88);
      await expect(gradeService.getExam("exam-1", token, teacher("exempt"))).rejects.toThrow();
      await gradeService.setExamAccess("exam-1", { exemptTeacherIds: ["exempt"] }, teacher("owner"));
      expect((await gradeService.listExams("school-1", undefined, teacher("exempt")))[0].records).toHaveLength(1);
      expect((await gradeService.getExam("exam-1", undefined, teacher("exempt")))?.records[0].scores.数学).toBe(88);
      expect((await gradeService.getExam("exam-1", undefined, teacher("owner")))?.accessControl?.exemptTeacherIds)
        .toEqual(["exempt"]);
      expect((state.gradeExamAccess as Array<{ exemptTeacherIds: string[] }>)[0].exemptTeacherIds)
        .toEqual(["exempt"]);
      await expect(gradeService.getExam("exam-1", token, teacher("guest"))).rejects.toThrow();
      await expect(gradeService.setExamAccess("exam-1", { exemptTeacherIds: ["stranger"] }, teacher("owner")))
        .rejects.toThrow("当前学校");
      await gradeService.setExamAccess("exam-1", { exemptTeacherIds: [] }, teacher("owner"));
      expect((await gradeService.listExams("school-1", undefined, teacher("exempt")))[0].accessControl?.locked).toBe(true);
      await expect(gradeService.getExam("exam-1", undefined, teacher("exempt"))).rejects.toThrow("访问密码");
      await gradeService.setExamAccess("exam-1", { password: null }, teacher("owner"));
      expect((await gradeService.getExam("exam-1", undefined, teacher("guest")))?.records).toHaveLength(1);
    });
  });

  it("consumes one-time codes once while keeping the current tab grant valid", async () => {
    const state = makeState();
    await runWithState(state, async () => {
      await gradeService.setExamAccess("exam-1", { password: "long-password" }, teacher("owner"));
      const code = await gradeService.createExamOneTimePassword("exam-1", teacher("owner"));
      const token = await gradeService.unlockExam("exam-1", code, teacher("guest"));
      await expect(gradeService.unlockExam("exam-1", code, teacher("guest"))).rejects.toThrow("已失效");
      expect((await gradeService.getExam("exam-1", token, teacher("guest")))?.records).toHaveLength(1);
      await gradeService.setExamAccess("exam-1", { password: "changed-password" }, teacher("owner"));
      await expect(gradeService.getExam("exam-1", token, teacher("guest"))).rejects.toThrow("访问密码");
      await expect(gradeService.unlockExam("exam-1", "long-password", teacher("guest"))).rejects.toThrow();
      expect((state.gradeExamAccess as Array<{passwordHash: string}>)[0].passwordHash).not.toContain("changed-password");
    });
  });

  it("also protects published share links, including single-use share access", async () => {
    const state = makeState();
    const exam = (state.gradeExams as Array<Record<string, unknown>>)[0];
    const publication = { shareToken: "public-link", publishedAt: "2026-09-02T00:00:00Z",
      publishedByTeacherId: "owner", publishedByName: "owner" };
    exam.publication = publication;
    state.gradePublications = [{ id: "pub-1", examId: "exam-1", schoolId: "school-1",
      cohortKey: "grad-2026", ...publication, report: { exam: { id: "exam-1" } } }];
    await runWithState(state, async () => {
      await gradeService.setExamAccess("exam-1", { password: "share-password" }, teacher("owner"));
      await expect(gradeService.getPublishedReportByToken("public-link")).rejects.toThrow("访问密码");
      const once = await gradeService.createExamOneTimePassword("exam-1", teacher("owner"));
      expect((await gradeService.getPublishedReportByToken("public-link", once)).exam.id).toBe("exam-1");
      await expect(gradeService.getPublishedReportByToken("public-link", once)).rejects.toThrow("访问密码");
      expect((await gradeService.getPublishedReportByToken("public-link", "share-password")).exam.id).toBe("exam-1");
    });
  });

  it("does not leak protected records through administrator mutation responses", async () => {
    const state = makeState();
    const admin = teacher("admin");
    admin.role = "school_admin";
    admin.affiliations![0].role = "school_admin";
    await runWithState(state, async () => {
      await gradeService.setExamAccess("exam-1", { password: "secure-pass" }, teacher("owner"));
      const updated = await gradeService.updateExamMetadata("exam-1", { name: "新考试", examDate: "2026-09-03" }, admin);
      expect(updated.records).toHaveLength(0);
      expect(updated.accessControl?.locked).toBe(true);
    });
  });

  it("injects authenticated actors into all new private grade RPC methods", () => {
    for (const method of ["listExams", "getExam", "getImportContext", "setExamAccess", "unlockExam", "createExamOneTimePassword"] as const) {
      expect(serviceParameters.grade[method].at(-1)).toBe("teacher");
    }
  });
});
