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
        homeworkDate: DATE, attendanceTaken: true, summary: "" },
      { schoolId: "school-1", classId: "class-2", teacherId: "teacher-1",
        homeworkDate: "2026-10-14", attendanceTaken: true, summary: "" },
    ],
    scannerPages: [
      { schoolId: "school-1", sheetType: "paper", sheetId: "scanned", createdAt: "2026-10-13T10:00:00Z" },
      { schoolId: "school-2", sheetType: "paper", sheetId: "not-eligible", createdAt: "2026-10-14T10:00:00Z" },
      { schoolId: "school-1", sheetType: "lecture", sheetId: "not-eligible", createdAt: "2026-10-14T10:00:00Z" },
    ],
  } as unknown as AppState;
}

describe("classroomHomeworkAnswers", () => {
  it("returns only assigned and answered homework with a recorded class overview or scan", async () => {
    await runWithState(state(), async () => {
      const answers = await classroomHomeworkService.listHomeworkAnswers("school-1", "class-1");
      expect(answers.map((item) => item.id)).toEqual(["scanned", "recorded"]);
      expect(answers[0]).toMatchObject({ subject: "语文", assignedDate: "2026-10-13" });
      expect(answers[1].questions).toEqual([
        { id: "q1", number: 1, answer: "A" },
        { id: "q2", number: 2, answer: "" },
      ]);
      expect(classroomHomeworkAnswers("school-1", "missing")).toEqual([]);
      expect(classroomHomeworkAnswers("school-2", "class-1")).toEqual([]);
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
});
