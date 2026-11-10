import { describe, expect, it } from "vitest";
import type { ExamPaper } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { classroomHomeworkAnswers } from "./classroomHomeworkAnswers.js";
import { classroomHomeworkService } from "./classroomHomework.js";

const DATE = "2026-10-12";
const paper = (id: string, patch: Partial<ExamPaper> = {}): ExamPaper => ({
  id, teacherId: "teacher-1", schoolId: "school-1", subject: "数学",
  title: id, description: "", chapterIds: [], knowledgePointIds: [], grade: "高一",
  schoolYear: "2026-2027", duration: 60, totalScore: 20,
  questions: [
    { id: "q1", stem: "一", answer: "A", analysis: "", type: "single", score: 5 },
    { id: "q2", stem: "二", answer: "", analysis: "", type: "fill", score: 5 },
  ],
  status: "published", classIds: ["class-1"], assignedDate: DATE,
  managementCategory: "homework", createdAt: DATE, updatedAt: DATE,
  ...patch,
});

function state(): AppState {
  return {
    currentTeacherId: "teacher-1",
    teachers: [{ id: "teacher-1", schoolId: "school-1", subject: "数学" }],
    schoolClasses: [
      { id: "class-1", schoolId: "school-1" },
      { id: "class-2", schoolId: "school-1" },
    ],
    examPapers: [
      paper("recorded"),
      paper("scanned", { subject: "语文", assignedDate: "2026-10-13" }),
      paper("not-eligible", { assignedDate: "2026-10-14" }),
      paper("other-class", { classIds: ["class-2"] }),
      paper("other-school", { schoolId: "school-2" }),
      paper("exam", { managementCategory: "exam" }),
      paper("no-answer", { questions: [{ id: "empty", stem: "", answer: "", analysis: "", type: "single", score: 5 }] }),
      paper("extract-copy", { isExtractCopy: true }),
    ],
    homeworkClassOverviewRecords: [
      { schoolId: "school-1", classId: "class-1", teacherId: "teacher-1",
        homeworkDate: DATE, attendanceTaken: true, summary: "已完成批改" },
      { schoolId: "school-1", classId: "class-2", teacherId: "teacher-1",
        homeworkDate: "2026-10-14", attendanceTaken: true, summary: "" },
    ],
    scannerPages: [
      { schoolId: "school-1", sheetType: "paper", sheetId: "scanned", createdAt: "2026-10-13T10:00:00Z", reviewedAt: "2026-10-13T12:00:00Z" },
      { schoolId: "school-2", sheetType: "paper", sheetId: "not-eligible", createdAt: "2026-10-14T10:00:00Z" },
      { schoolId: "school-1", sheetType: "lecture", sheetId: "not-eligible", createdAt: "2026-10-14T10:00:00Z" },
    ],
  } as unknown as AppState;
}

describe("classroomHomeworkAnswers", () => {
  it("returns only assigned and answered homework with a recorded class overview or scan", async () => {
    await runWithState(state(), async () => {
      const answers = await classroomHomeworkService.listHomeworkAnswers("school-1", "class-1");
      expect(answers.map((item) => item.id)).toEqual(["scanned:2026-10-13", "recorded:2026-10-12"]);
      expect(answers[0]).toMatchObject({ subject: "语文", assignedDate: "2026-10-13" });
      expect(answers[1].questions).toEqual([
        { id: "q1", number: 1, answer: "A" },
        { id: "q2", number: 2, answer: "" },
      ]);
      expect(classroomHomeworkAnswers("school-1", "missing")).toEqual([]);
      expect(classroomHomeworkAnswers("school-2", "class-1")).toEqual([]);
    });
  });

  it("does not unlock an entire day from attendance or an unreviewed scan alone", async () => {
    const s = state();
    s.homeworkClassOverviewRecords = [{ schoolId: "school-1", classId: "class-1", teacherId: "teacher-1",
      homeworkDate: DATE, attendanceTaken: true, summary: "" }];
    s.scannerPages = [{ schoolId: "school-1", sheetType: "paper", sheetId: "scanned",
      createdAt: "2026-10-13T10:00:00Z" }];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
  });

  it("unlocks all papers sharing a date once their class's work is corrected", async () => {
    const s = state();
    s.examPapers = [...(s.examPapers as ExamPaper[]), paper("same-day")];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1").map((item) => item.id))
        .toEqual(["scanned:2026-10-13", "recorded:2026-10-12", "same-day:2026-10-12"]);
    });
  });

  it("uses the parent classroom assignment date for linked papers", async () => {
    const s = state();
    s.examPapers = [paper("linked", { assignedDate: undefined })];
    s.scannerPages = [];
    s.classroomHomeworks = [{
      id: "hw-1", teacherId: "teacher-1", teacherName: "老师", schoolId: "school-1",
      subject: "数学", content: "做试卷", classIds: ["class-1"], examPaperIds: ["linked"],
      assignedDate: DATE, publishAt: "2026-10-11T00:00:00Z",
      createdAt: DATE, updatedAt: DATE,
    }];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1").map((item) => item.id)).toEqual([`linked:${DATE}`]);
    });
  });

  it("recognizes a dated student evaluation as a correction", async () => {
    const s = state();
    s.homeworkClassOverviewRecords = [];
    s.scannerPages = [];
    s.students = [{ id: "student-1", classId: "class-1", schoolId: "school-1" }];
    s.homeworkAttitudeRecords = [{
      teacherId: "teacher-1", schoolId: "school-1", studentId: "student-1",
      homeworkDate: DATE, keywords: [], evaluation: "已批改",
    }];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1").map((item) => item.id)).toEqual([`recorded:${DATE}`]);
    });
  });

  it("does not release one class's answers using another class's reviewed scan", async () => {
    const s = state();
    s.homeworkClassOverviewRecords = [];
    s.examPapers = [paper("shared", { classIds: ["class-1", "class-2"] })];
    s.students = [{ id: "student-2", schoolId: "school-1", classId: "class-2" }];
    s.scannerPages = [{
      schoolId: "school-1", sheetType: "paper", sheetId: "shared",
      studentId: "student-2", createdAt: DATE, reviewedAt: DATE,
    }];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
      expect(classroomHomeworkAnswers("school-1", "class-2").map((item) => item.id)).toEqual([`shared:${DATE}`]);
    });
  });

  it("does not count empty overviews and does not expose work from another teacher on the same day", async () => {
    const s = state();
    s.homeworkClassOverviewRecords = [
      { schoolId: "school-1", classId: "class-1", teacherId: "teacher-1",
        homeworkDate: DATE, attendanceTaken: false, summary: "  ", images: [] },
      { schoolId: "school-1", classId: "class-1", teacherId: "teacher-2",
        homeworkDate: DATE, attendanceTaken: true, summary: "" },
    ];
    s.scannerPages = [];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
  });

  it("releases a merged written-and-paper assignment only after its own dated record", async () => {
    const s = state();
    s.examPapers = [
      paper("linked", { teacherId: "paper-owner", assignedDate: "2026-09-01" }),
      paper("unrecorded", { assignedDate: "2026-09-01" }),
    ];
    s.classroomHomeworks = [
      { id: "hw-1", teacherId: "teacher-1", teacherName: "老师", schoolId: "school-1",
        subject: "数学", content: "练习课本题目", title: "今天的数学作业",
        classIds: ["class-1"], examPaperIds: ["linked", "unrecorded"],
        assignedDate: DATE, publishAt: "2026-10-01T00:00:00Z",
        createdAt: DATE, updatedAt: DATE },
    ];
    s.homeworkClassOverviewRecords = [{ schoolId: "school-1", classId: "class-1", teacherId: "teacher-1",
      homeworkDate: DATE, attendanceTaken: true, summary: "已批改" }] as typeof s.homeworkClassOverviewRecords;
    await runWithState(s, async () => {
      const answers = classroomHomeworkAnswers("school-1", "class-1");
      expect(answers.map((item) => item.id)).toEqual([`linked:${DATE}`, `unrecorded:${DATE}`]);
      expect(answers[0]).toMatchObject({
        assignedDate: DATE, homeworkTitle: "今天的数学作业", title: "linked",
      });
    });
    s.homeworkClassOverviewRecords = [];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
  });

  it("never releases linked paper answers using another teacher, class, date, scan, or unpublished assignment", async () => {
    const s = state();
    s.examPapers = [paper("linked", { assignedDate: "2026-09-01" })];
    s.scannerPages = [{ schoolId: "school-1", sheetType: "paper", sheetId: "linked", createdAt: `${DATE}T10:00:00Z` }];
    s.classroomHomeworks = [{ id: "hw-1", teacherId: "teacher-1", teacherName: "老师", schoolId: "school-1",
      subject: "数学", content: "作业", classIds: ["class-1"], examPaperIds: ["linked"],
      assignedDate: DATE, publishAt: "2026-10-01T00:00:00Z", createdAt: DATE, updatedAt: DATE }];
    s.homeworkClassOverviewRecords = [
      { schoolId: "school-1", classId: "class-1", teacherId: "teacher-2", homeworkDate: DATE, attendanceTaken: true },
      { schoolId: "school-1", classId: "class-2", teacherId: "teacher-1", homeworkDate: DATE, attendanceTaken: true },
      { schoolId: "school-1", classId: "class-1", teacherId: "teacher-1", homeworkDate: "2026-09-01", attendanceTaken: true },
    ] as typeof s.homeworkClassOverviewRecords;
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
    (s.homeworkClassOverviewRecords as Array<{
      schoolId: string; classId: string; teacherId: string; homeworkDate: string; attendanceTaken: boolean;
    }>).push({ schoolId: "school-1", classId: "class-1", teacherId: "teacher-1",
      homeworkDate: DATE, attendanceTaken: true });
    s.classroomHomeworks[0].publishAt = "2099-01-01T00:00:00Z";
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
  });

  it("does not expose examination papers or extract copies", async () => {
    const s = state();
    s.examPapers = [paper("exam", { managementCategory: "exam" }), paper("copy", { isExtractCopy: true })];
    await runWithState(s, async () => {
      expect(classroomHomeworkAnswers("school-1", "class-1")).toEqual([]);
    });
  });

});
