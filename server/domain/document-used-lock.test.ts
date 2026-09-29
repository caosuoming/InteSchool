import { describe, expect, it } from "vitest";

import type { AnswerRecord } from "../../src/types/index.js";
import { db, runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";

const now = "2026-09-29T00:00:00.000Z";

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    examPapers: [],
    lectures: [],
    answerRecords: [],
  } as AppState;
}

function markUsed(documentId: string): void {
  const record: AnswerRecord = {
    id: "answer-" + documentId,
    studentId: "student-1",
    questionId: "question-1",
    lectureId: documentId,
    isCorrect: true,
    score: "correct",
    answeredAt: now,
  };
  db.update("answerRecords", (records) => [...records, record]);
}

describe("used document edit lock", () => {
  it("rejects exam-paper updates after the paper has answer records", async () => {
    await runWithState(state(), async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "待使用试卷",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        duration: 60,
        totalScore: 0,
        questions: [],
      });

      markUsed(paper.id);

      await expect(
        examPaperService.updatePaper(paper.id, { title: "不应保存的新标题" }),
      ).rejects.toThrow("文档已用");
      await expect(examPaperService.getPaper(paper.id)).resolves.toEqual(
        expect.objectContaining({ title: "待使用试卷" }),
      );
    });
  });

  it("rejects lecture updates after the lecture has answer records", async () => {
    await runWithState(state(), async () => {
      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "待使用讲义",
        description: "",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "上学期",
        classIds: [],
        studentIds: [],
        sections: [],
      });

      markUsed(lecture.id);

      await expect(
        lectureService.updateLecture(lecture.id, { title: "不应保存的新标题" }),
      ).rejects.toThrow("文档已用");
      await expect(lectureService.getLecture(lecture.id)).resolves.toEqual(
        expect.objectContaining({ title: "待使用讲义" }),
      );
    });
  });
});
