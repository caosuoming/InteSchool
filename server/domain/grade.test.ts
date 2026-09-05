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
  it("builds sorted class profiles from roster and latest imported scores", async () => {
    const appState = state();
    (appState.classTypeCategories as any[]) = [{
      id: "class-type-1",
      schoolId: "school-1",
      name: "实验班",
      sortOrder: 1,
      enabled: true,
      createdAt: "2025-09-01T00:00:00.000Z",
    }];
    (appState.schoolClasses as any[])[0].classTypeId = "class-type-1";
    (appState.students as any[])[0].subjectSelection = "物化生";
    (appState.schoolClasses as any[]).push({
      id: "class-10",
      type: "school",
      schoolId: "school-1",
      name: "高三(10)班",
      grade: "高三",
      gradeYear: 2023,
      gradYear: 2026,
      studentCount: 0,
      createdBy: "teacher-1",
      createdAt: "2025-09-01T00:00:00.000Z",
    });

    await runWithState(appState, async () => {
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "最近联考",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects: ["数学", "化学"],
        rows: [{
          rowKey: "row-profile",
          sourceRowNumber: 2,
          sourceName: "旧姓名",
          sourceStudentNo: "202601",
          sourceClassName: "高三(1)班",
          studentId: "student-1",
          subjectSelection: "物化生",
          classType: "实验班",
          scores: { 数学: 95, 化学: null },
        }],
      });
      const context = await gradeService.getImportContext("school-1", "grad-2026");

      expect(context.classes.map((item) => item.name)).toEqual([
        "高三(1)班",
        "高三(2)班",
        "高三(10)班",
      ]);
      expect(context.classProfiles?.["class-1"]).toEqual({
        classTypeName: "实验班",
        subjectSelections: ["物化生"],
        scoreSubjects: ["数学"],
        hasImportedScores: true,
      });
      expect(context.sampleRecords).toEqual([exam.records[0]]);
      expect(exam.settings.classSubjects.find((item) => item.classId === "class-1")).toMatchObject({
        examSubjects: ["数学"],
        statisticSubjects: ["数学"],
      });
    });
  });

  it("presets unified ranking from the imported class subject selection", async () => {
    const appState = state();
    const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];

    await runWithState(appState, async () => {
      const scores = Object.fromEntries(subjects.map((subject, index) => [subject, 100 - index]));
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "史政地联考",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects,
        rows: [{
          rowKey: "row-selection",
          sourceRowNumber: 2,
          sourceName: "旧姓名",
          sourceStudentNo: "202601",
          sourceClassName: "高三(1)班",
          studentId: "student-1",
          subjectSelection: "史政地",
          scores,
        }],
      });

      expect(exam.settings.classSubjects.find((item) => item.classId === "class-1")?.statisticSubjects)
        .toEqual(["语文", "数学", "英语", "政治", "历史", "地理"]);
    });
  });

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

  it("allows importing multiple new students without student numbers", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "缺少学号的成绩",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects: ["数学"],
        rows: [
          {
            rowKey: "row-new-1",
            sourceRowNumber: 2,
            sourceName: "新增甲",
            sourceStudentNo: "",
            sourceClassName: "高三(2)班",
            createStudent: { name: "新增甲", studentNo: "", classId: "class-2" },
            scores: { 数学: 100 },
          },
          {
            rowKey: "row-new-2",
            sourceRowNumber: 3,
            sourceName: "新增乙",
            sourceStudentNo: "",
            sourceClassName: "高三(2)班",
            createStudent: { name: "新增乙", studentNo: "", classId: "class-2" },
            scores: { 数学: 90 },
          },
        ],
      });

      expect(exam.records.map((item) => item.studentNo)).toEqual(["", ""]);
      expect((appState.students as any[]).filter((item) => item.classId === "class-2")).toHaveLength(2);
    });
  });

  it("imports assigned scores and preserves them across recalculation", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const context = await gradeService.getImportContext("school-1", "grad-2026");
      const subjects = ["化学", "生物"];
      const settings = buildDefaultGradeSettings(subjects, context.classes.map((item) => item.id));
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "赋分导入",
        sourceFileName: "assigned.xlsx",
        sourceSheetName: "成绩",
        subjects,
        settings,
        rows: [{
          rowKey: "row-assigned",
          sourceRowNumber: 2,
          sourceName: "旧姓名",
          sourceStudentNo: "202601",
          sourceClassName: "高三(1)班",
          subjectSelection: "物化生",
          classType: "强基班",
          studentId: "student-1",
          scores: { 化学: 72 },
          assignedScores: { 化学: 88, 生物: 91 },
        }],
      });

      expect(exam.records[0]).toMatchObject({
        subjectSelection: "物化生",
        classType: "强基班",
        scores: { 化学: 72, 生物: null },
        sourceAssignedScores: { 化学: 88, 生物: 91 },
        assignedScores: { 化学: 88, 生物: 91 },
        rawTotal: 72,
        assignedTotal: 179,
      });

      settings.assignmentRules.化学 = [{
        label: "全部",
        percentileFrom: 0,
        percentileTo: 100,
        assignedMin: 30,
        assignedMax: 30,
      }];
      const recalculated = await gradeService.updateExamSettings(exam.id, settings);
      expect(recalculated.records[0].assignedScores).toEqual({ 化学: 88, 生物: 91 });

      const adjustedAssigned = await gradeService.adjustExamScore(
        exam.id,
        "student-1",
        "化学",
        "assigned",
        89,
        appState.teachers[0] as any,
      );
      expect(adjustedAssigned.records[0]).toMatchObject({
        sourceAssignedScores: { 化学: 89, 生物: 91 },
        assignedScores: { 化学: 89, 生物: 91 },
      });
    });
  });

  it("updates exam metadata and audits score adjustments while recalculating ranks", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const exam = await gradeService.importExam("school-1", "teacher-1", {
        cohortKey: "grad-2026",
        name: "原考试名",
        examDate: "2026-08-01",
        sourceFileName: "scores.xlsx",
        sourceSheetName: "成绩",
        subjects: ["数学"],
        rows: [
          {
            rowKey: "row-adjust-1",
            sourceRowNumber: 2,
            sourceName: "旧姓名",
            sourceStudentNo: "202601",
            sourceClassName: "高三(1)班",
            studentId: "student-1",
            scores: { 数学: 100 },
          },
          {
            rowKey: "row-adjust-2",
            sourceRowNumber: 3,
            sourceName: "新增学生",
            sourceStudentNo: "202602",
            sourceClassName: "高三(2)班",
            createStudent: {
              name: "新增学生",
              studentNo: "202602",
              classId: "class-2",
            },
            scores: { 数学: 90 },
          },
        ],
      });

      const renamed = await gradeService.updateExamMetadata(exam.id, {
        name: "八月联考",
        examDate: "2026-08-12",
      });
      expect(renamed).toMatchObject({ name: "八月联考", examDate: "2026-08-12" });

      const adjusted = await gradeService.adjustExamScore(
        exam.id,
        "student-1",
        "数学",
        "raw",
        80,
        appState.teachers[0] as any,
      );
      const changed = adjusted.records.find((item) => item.studentId === "student-1")!;
      const other = adjusted.records.find((item) => item.studentId !== "student-1")!;
      expect(changed.scores.数学).toBe(80);
      expect(changed.rawTotal).toBe(80);
      expect(changed.gradeRank).toBe(2);
      expect(other.gradeRank).toBe(1);
      expect(adjusted.scoreAdjustments).toEqual([
        expect.objectContaining({
          studentId: "student-1",
          subject: "数学",
          kind: "raw",
          previousValue: 100,
          nextValue: 80,
          changedByTeacherId: "teacher-1",
          changedByName: "数学老师",
        }),
      ]);

      await expect(gradeService.adjustExamScore(
        exam.id,
        "student-1",
        "数学",
        "assigned",
        79,
        appState.teachers[0] as any,
      )).rejects.toThrow("仅可修改导入成绩中已有的赋分");
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
      const totalScoreTemplate = settings.templates.find((item) => item.kind === "totalScoreSegment")!;
      totalScoreTemplate.totalScoreSegmentOptions = {
        ...totalScoreTemplate.totalScoreSegmentOptions,
        totalScoreTopN: 1,
      };
      const exam = await gradeService.importExam("school-1", "teacher-1", {
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

      const unpublishedQuery = await gradeService.getQueryData(teacher);
      expect(unpublishedQuery.exams).toEqual([]);
      const published = await gradeService.publishExamResults(exam.id, undefined, teacher);
      expect(published.publication?.shareToken).toBeTruthy();

      const teacherQuery = await gradeService.getQueryData(teacher);
      expect(teacherQuery.scope).toBe("teacher");
      expect(teacherQuery.homeroomClassIds).toEqual([]);
      expect(teacherQuery.exams[0].subjects).toEqual(["数学"]);
      expect(teacherQuery.exams[0].records).toHaveLength(1);
      expect(teacherQuery.exams[0].records[0]).toMatchObject({ classId: "class-1", rawTotal: null });
      expect(Object.keys(teacherQuery.exams[0].records[0].scores)).toEqual(["数学"]);
      expect(teacherQuery.exams[0].classSummaries).toHaveLength(2);
      expect(Object.keys(teacherQuery.exams[0].classSummaries[0].subjectAverages)).toEqual(["数学"]);
      expect(teacherQuery.exams[0].reportToken).toBe(published.publication?.shareToken);
      const publicReport = await gradeService.getPublishedReportByToken(published.publication!.shareToken);
      expect(publicReport.exam).toMatchObject({ name: "期中考试", cohortLabel: "2026届高三" });
      expect(publicReport.totalScoreRanking?.topN).toBe(1);
      expect(publicReport.totalScoreRanking?.tables.flatMap((table) => table.rows.map((row) => row.studentName)))
        .toEqual(["二班学生"]);
      expect(JSON.stringify(publicReport)).not.toContain("旧姓名");
      await expect(gradeService.adjustExamScore(exam.id, "student-1", "数学", "raw", 119, teacher))
        .rejects.toThrow("请先撤回成绩发布");
      await expect(gradeService.saveCohortSettings("school-1", "teacher-1", "grad-2026", subjects, settings))
        .rejects.toThrow("请先撤回「期中考试」的成绩发布");

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

      teacher.role = "teacher";
      teacher.roles = ["teacher"];
      teacher.teachingClassIds = [];
      teacher.homeroomClassIds = [];
      teacher.affiliations[0].role = "teacher";
      teacher.affiliations[0].roles = ["teacher"];
      teacher.affiliations[0].teachingClassIds = [];
      teacher.affiliations[0].homeroomClassIds = [];
      teacher.affiliations[0].teachingGrades = [];
      const unassignedQuery = await gradeService.getQueryData(teacher);
      expect(unassignedQuery.teachingClassIds).toEqual([]);
      expect(unassignedQuery.exams).toEqual([]);

      const token = published.publication!.shareToken;
      const withdrawn = await gradeService.unpublishExamResults(exam.id);
      expect(withdrawn.publication).toBeUndefined();
      await expect(gradeService.getPublishedReportByToken(token)).rejects.toThrow("已撤回");
      await expect(gradeService.updateExamMetadata(exam.id, { name: "撤回后可修改", examDate: "2026-08-13" }))
        .resolves.toMatchObject({ name: "撤回后可修改", examDate: "2026-08-13" });
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
