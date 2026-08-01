import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { gradeService } from "./grade.js";
import { buildDefaultGradeSettings } from "../../src/lib/grade-statistics.js";

function state(): AppState {
  return {
    teachers: [
      {
        id: "teacher-1",
        email: "math@example.com",
        name: "数学老师",
        avatar: "数",
        schoolId: "school-1",
        subject: "数学",
        status: "active",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        affiliations: [
          {
            id: "aff-1",
            teacherId: "teacher-1",
            schoolId: "school-1",
            schoolName: "测试中学",
            subject: "数学",
            status: "active",
            role: "teacher",
            roles: ["teacher"],
            subjectGroupIds: [],
            prepGroupIds: [],
            isCurrent: true,
            joinedAt: "2025-09-01T00:00:00.000Z",
          },
        ],
        currentAffiliationId: "aff-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    ],
    currentTeacherId: null,
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高三(1)班",
        grade: "高三",
        gradeYear: 2023,
        gradYear: 2026,
        studentCount: 1,
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
      {
        id: "class-2",
        type: "school",
        schoolId: "school-1",
        name: "高三(2)班",
        grade: "高三",
        gradeYear: 2023,
        gradYear: 2026,
        studentCount: 0,
        createdBy: "teacher-1",
        createdAt: "2025-09-01T00:00:00.000Z",
      },
    ],
    students: [
      {
        id: "student-1",
        name: "旧姓名",
        studentNo: "202601",
        classId: "class-1",
        schoolId: "school-1",
        grade: "高三",
        status: "active",
      },
    ],
    gradeExams: [],
    gradeTemplateProfiles: [],
    gradeCohortSettings: [],
  };
}

function addSecondCohort(appState: AppState): void {
  (appState.schoolClasses as any[]).push(
    {
      id: "class-3",
      type: "school",
      schoolId: "school-1",
      name: "高二(1)班",
      grade: "高二",
      gradeYear: 2024,
      gradYear: 2027,
      studentCount: 0,
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    },
    {
      id: "class-4",
      type: "school",
      schoolId: "school-1",
      name: "高二(2)班",
      grade: "高二",
      gradeYear: 2024,
      gradYear: 2027,
      studentCount: 0,
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    },
  );
}

describe("grade service", () => {
  it("discovers cohorts and imports matched, renamed, and new students", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const cohorts = await gradeService.listCohorts("school-1");
      expect(cohorts).toEqual([
        expect.objectContaining({ key: "grad-2026", label: "2026届高三", studentCount: 1 }),
      ]);

      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const subjects = ["数学", "化学"];
      const settings = buildDefaultGradeSettings(subjects, context.classes.map((item) => item.id), context.teachers);
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "第一次联考",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects,
        settings,
        rows: [
          {
            rowKey: "row-1",
            sourceRowNumber: 2,
            sourceName: "新姓名",
            sourceStudentNo: "202601",
            sourceClassName: "高三(1)班",
            studentId: "student-1",
            updateStudentName: true,
            scores: { 数学: 120, 化学: 80 },
          },
          {
            rowKey: "row-2",
            sourceRowNumber: 3,
            sourceName: "新增学生",
            sourceStudentNo: "202602",
            sourceClassName: "高三(2)班",
            createStudent: {
              name: "新增学生",
              studentNo: "202602",
              classId: "class-2",
            },
            scores: { 数学: 110, 化学: 70 },
          },
        ],
      });

      expect(exam.records).toHaveLength(2);
      expect(exam.records.map((item) => item.gradeRank)).toEqual([1, 2]);
      expect((appState.students as any[]).find((item) => item.id === "student-1")?.name).toBe("新姓名");
      expect(appState.students).toHaveLength(2);
      expect((appState.schoolClasses as any[]).find((item) => item.id === "class-2")?.studentCount).toBe(1);
      expect(appState.gradeExams).toEqual([exam]);
    });
  });

  it("rejects duplicate matches to the same existing student", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const settings = buildDefaultGradeSettings(["数学"], context.classes.map((item) => item.id));
      await expect(gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "重复名单",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects: ["数学"],
        settings,
        rows: [
          {
            rowKey: "row-1",
            sourceRowNumber: 2,
            sourceName: "旧姓名",
            sourceStudentNo: "202601",
            sourceClassName: "高三(1)班",
            studentId: "student-1",
            scores: { 数学: 100 },
          },
          {
            rowKey: "row-2",
            sourceRowNumber: 3,
            sourceName: "旧姓名",
            sourceStudentNo: "202601",
            sourceClassName: "高三(1)班",
            studentId: "student-1",
            scores: { 数学: 99 },
          },
        ],
      })).rejects.toThrow("重复匹配");
    });
  });

  it("restricts cohort template publishing and exposes the saved profile", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const templates = buildDefaultGradeSettings(
        ["数学", "化学"],
        context.classes.map((item) => item.id),
        context.teachers,
      ).templates;

      await expect(gradeService.saveCohortTemplateProfile(
        "school-1",
        "grad-2026",
        "teacher-1",
        ["数学", "化学"],
        templates,
      )).rejects.toThrow("仅学校管理员、年级组长或教务管理人员");

      const teacher = (appState.teachers as any[])[0];
      teacher.roles = ["teacher", "gradeLeader"];
      teacher.affiliations[0].roles = ["teacher", "gradeLeader"];

      const profile = await gradeService.saveCohortTemplateProfile(
        "school-1",
        "grad-2026",
        "teacher-1",
        ["数学", "化学"],
        templates,
      );

      expect(profile.templates.some((item) => item.kind === "customTable")).toBe(true);
      expect(appState.gradeTemplateProfiles).toEqual([profile]);
      await expect(gradeService.getCohortTemplateProfile("school-1", "grad-2026"))
        .resolves.toEqual(profile);
      await expect(gradeService.getImportContext("school-1", "grad-2026"))
        .resolves.toEqual(expect.objectContaining({ templateProfile: profile }));
    });
  });

  it("scopes query details by teaching and homeroom assignments", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const teacher = appState.teachers[0] as any;
      teacher.teachingClassIds = ["class-1"];
      teacher.homeroomClassIds = ["class-2"];
      teacher.affiliations[0].teachingClassIds = ["class-1"];
      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const subjects = ["数学", "化学"];
      const settings = buildDefaultGradeSettings(subjects, context.classes.map((item) => item.id), context.teachers);
      await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "期中考试",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects,
        settings,
        rows: [
          {
            rowKey: "row-1",
            sourceRowNumber: 2,
            sourceName: "旧姓名",
            sourceStudentNo: "202601",
            sourceClassName: "高三(1)班",
            studentId: "student-1",
            scores: { 数学: 120, 化学: 80 },
          },
          {
            rowKey: "row-2",
            sourceRowNumber: 3,
            sourceName: "二班学生",
            sourceStudentNo: "202602",
            sourceClassName: "高三(2)班",
            createStudent: {
              name: "二班学生",
              studentNo: "202602",
              classId: "class-2",
            },
            scores: { 数学: 100, 化学: 90 },
          },
        ],
      });

      const teacherQuery = await gradeService.getQueryData(teacher);
      expect(teacherQuery.scope).toBe("teacher");
      expect(teacherQuery.homeroomClassIds).toEqual([]);
      expect(teacherQuery.exams[0].subjects).toEqual(["数学"]);
      expect(teacherQuery.exams[0].records).toHaveLength(1);
      expect(teacherQuery.exams[0].records[0]).toMatchObject({ classId: "class-1", rawTotal: null });
      expect(Object.keys(teacherQuery.exams[0].records[0].scores)).toEqual(["数学"]);
      expect(teacherQuery.exams[0].classSummaries).toHaveLength(2);
      expect(Object.keys(teacherQuery.exams[0].classSummaries[0].subjectAverages)).toEqual(["数学"]);

      teacher.homeroomClassIds = ["class-1"];
      teacher.affiliations[0].homeroomClassIds = ["class-1"];
      teacher.affiliations[0].roles = ["teacher", "headTeacher"];
      const homeroomQuery = await gradeService.getQueryData(teacher);
      expect(homeroomQuery.scope).toBe("homeroom");
      expect(homeroomQuery.fullClassIds).toEqual(["class-1"]);
      expect(homeroomQuery.exams[0].subjects).toEqual(subjects);
      expect(homeroomQuery.exams[0].records).toHaveLength(1);
      expect(homeroomQuery.exams[0].records[0].rawTotal).toBe(200);
      expect(Object.keys(homeroomQuery.exams[0].records[0].scores)).toEqual(subjects);
      expect(Object.keys(homeroomQuery.exams[0].classSummaries.find((item) => item.classId === "class-1")!.subjectAverages)).toEqual(subjects);
      expect(Object.keys(homeroomQuery.exams[0].classSummaries.find((item) => item.classId === "class-2")!.subjectAverages)).toEqual(["数学"]);

      teacher.role = "school_admin";
      teacher.roles = ["principal"];
      teacher.affiliations[0].role = "teacher";
      teacher.affiliations[0].roles = ["gradeLeader"];
      teacher.affiliations[0].teachingGrades = ["高三"];
      teacher.affiliations[0].homeroomClassIds = [];
      const gradeQuery = await gradeService.getQueryData(teacher);
      expect(gradeQuery.scope).toBe("grade");
      expect(gradeQuery.fullClassIds).toEqual(["class-1", "class-2"]);
      expect(gradeQuery.exams[0].records).toHaveLength(2);

      teacher.affiliations[0].roles = ["vicePrincipal"];
      const schoolQuery = await gradeService.getQueryData(teacher);
      expect(schoolQuery.scope).toBe("school");
      expect(schoolQuery.scopeLabel).toBe("全校");
    });
  });
  it("shares cohort preprocessing across imports and recalculates existing exams", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const subjects = ["数学", "化学"];
      const initialSettings = buildDefaultGradeSettings(subjects, context.classes.map((item) => item.id));
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "已有考试",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects,
        settings: initialSettings,
        rows: [{
          rowKey: "row-1",
          sourceRowNumber: 2,
          sourceName: "旧姓名",
          sourceStudentNo: "202601",
          sourceClassName: "高三(1)班",
          studentId: "student-1",
          scores: { 数学: 100, 化学: 50 },
        }],
      });
      expect(exam.records[0].rawTotal).toBe(150);

      const sharedSettings = buildDefaultGradeSettings(subjects, context.classes.map((item) => item.id));
      sharedSettings.templates[0].name = "年级统一名次表";
      sharedSettings.classSubjects = sharedSettings.classSubjects.map((item) => ({
        ...item,
        statisticSubjects: ["数学"],
      }));
      const saved = await gradeService.saveCohortSettings(
        "school-1",
        "teacher-1",
        "grad-2026",
        subjects,
        sharedSettings,
      );

      expect(saved.settings.templates[0].name).toBe("年级统一名次表");
      expect((appState.gradeTemplateProfiles as any[])[0].templates[0].name).toBe("年级统一名次表");
      expect((appState.gradeExams as any[])[0].records[0].rawTotal).toBe(100);

      const inherited = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "继承配置的考试",
        sourceFileName: "scores-2.xlsx",
        sourceSheetName: "成绩",
        subjects,
        rows: [{
          rowKey: "row-2",
          sourceRowNumber: 2,
          sourceName: "旧姓名",
          sourceStudentNo: "202601",
          sourceClassName: "高三(1)班",
          studentId: "student-1",
          scores: { 数学: 90, 化学: 40 },
        }],
      });
      expect(inherited.settings.templates[0].name).toBe("年级统一名次表");
      expect(inherited.records[0].rawTotal).toBe(90);

      const teacher = (appState.teachers as any[])[0];
      teacher.roles = ["teacher", "gradeLeader"];
      teacher.affiliations[0].roles = ["teacher", "gradeLeader"];
      const publishedTemplates = saved.settings.templates.map((item, index) => index === 0
        ? { ...item, name: "公式发布后的统一名次表" }
        : item);
      await gradeService.saveCohortTemplateProfile(
        "school-1",
        "grad-2026",
        "teacher-1",
        subjects,
        publishedTemplates,
      );
      expect((appState.gradeCohortSettings as any[])[0].settings.templates[0].name)
        .toBe("公式发布后的统一名次表");
      expect((appState.gradeExams as any[]).every((item) =>
        item.settings.templates[0].name === "公式发布后的统一名次表"))
        .toBe(true);
    });
  });

  it("copies cohort preprocessing and remaps class settings to the target grade", async () => {
    const appState = state();
    addSecondCohort(appState);

    await runWithState(appState, async () => {
      const sourceContext = await gradeService.getImportContext("school-1", "grad-2026");
      const subjects = ["数学", "化学"];
      const settings = buildDefaultGradeSettings(subjects, sourceContext.classes.map((item) => item.id));
      settings.classSubjects = settings.classSubjects.map((item, index) => ({
        ...item,
        statisticSubjects: index === 0 ? ["数学"] : ["化学"],
        separateRankSubjects: index === 0 ? ["化学"] : [],
      }));
      settings.classSubjectTeacherIds = {
        "class-1": { 数学: ["teacher-1"], 化学: [] },
        "class-2": { 数学: [], 化学: ["teacher-1"] },
      };
      await gradeService.saveCohortSettings(
        "school-1",
        "teacher-1",
        "grad-2026",
        subjects,
        settings,
      );

      const copied = await gradeService.copyCohortSettings(
        "school-1",
        "teacher-1",
        "grad-2026",
        "grad-2027",
      );

      expect(copied.cohortLabel).toBe("2027届高二");
      expect(copied.settings.classSubjects.map((item) => item.classId)).toEqual(["class-3", "class-4"]);
      expect(copied.settings.classSubjects.map((item) => item.statisticSubjects)).toEqual([
        ["数学"],
        ["化学"],
      ]);
      expect(copied.settings.classSubjects.map((item) => item.separateRankSubjects)).toEqual([
        ["化学"],
        [],
      ]);
      expect(copied.settings.classSubjects.some((item) => ["class-1", "class-2"].includes(item.classId))).toBe(false);
      expect(copied.settings.classSubjectTeacherIds).toEqual({
        "class-3": { 数学: ["teacher-1"], 化学: [] },
        "class-4": { 数学: [], 化学: ["teacher-1"] },
      });
    });
  });

});
