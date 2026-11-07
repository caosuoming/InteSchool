import { describe, expect, it } from "vitest";

import type { AnswerRecord, ExamPaperQuestion, LectureSection } from "../../src/types/index.js";
import { db, runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";
import { analyticsService } from "./analytics.js";
import { scannerService } from "./scanner.js";

const now = "2026-09-29T00:00:00.000Z";

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    examPapers: [],
    lectures: [],
    answerRecords: [],
    questions: [],
    schools: [{ id: "school-1" }],
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
  it("allows score changes but rejects reordering, replacement and metadata edits after usage", async () => {
    await runWithState(state(), async () => {
      const questions: ExamPaperQuestion[] = [
        { id: "pq1", questionId: "q1", type: "single", stem: "第一题", options: ["A", "B"], answer: "A", analysis: "", score: 3 },
        { id: "pq2", questionId: "q2", type: "essay", stem: "第二题", answer: "解答", analysis: "", score: 4 },
      ];
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "试卷", chapterIds: [], knowledgePointIds: [], grade: "高一",
        schoolYear: "2026-2027", duration: 60, totalScore: 7, questions,
      });
      markUsed(paper.id);
      const saved = await examPaperService.updatePaper(paper.id, {
        questions: [{ ...questions[0], score: 5 }, questions[1]], totalScore: 9,
      });
      expect(saved.totalScore).toBe(9);
      expect(saved.questions.map((item) => item.score)).toEqual([5, 4]);
      expect(saved.answerSheetPublishedAt).toBe(now);
      await expect(examPaperService.updatePaper(paper.id, {
        questions: [...questions].reverse(),
      })).rejects.toThrow();
      await expect(examPaperService.updatePaper(paper.id, {
        questions: [{ ...questions[0], stem: "换题" }, questions[1]],
      })).rejects.toThrow();
      await expect(examPaperService.updatePaper(paper.id, {
        questions: [questions[0]],
      })).rejects.toThrow();
      await expect(examPaperService.updatePaper(paper.id, { title: "改变标题" })).rejects.toThrow();
      await expect(examPaperService.unpublishAnswerSheet(paper.id)).rejects.toThrow("答题记录");
    });
  });

  it("auto-publishes both document types when student usage is saved", async () => {
    await runWithState(state(), async () => {
      const paper = await examPaperService.createPaper("teacher-1", "school-1", {
        title: "试卷", chapterIds: [], knowledgePointIds: [], grade: "高一",
        schoolYear: "2026-2027", duration: 60, totalScore: 0, questions: [],
      });
      const lecture = await lectureService.createLecture("teacher-1", "school-1", {
        title: "讲义", chapterIds: [], knowledgePointIds: [], grade: "高一",
        schoolYear: "2026-2027", semester: "上学期", classIds: [], studentIds: [], sections: [],
      });
      await analyticsService.saveAnswerRecord({ studentId: "s1", questionId: "q1", lectureId: paper.id, score: "done" });
      await analyticsService.batchSaveAnswerRecords([
        { studentId: "s1", questionId: "q2", lectureId: lecture.id, score: "correct" },
      ]);
      const actualPaper = await examPaperService.getPaper(paper.id);
      const actualLecture = await lectureService.getLecture(lecture.id);
      expect(actualPaper).toMatchObject({ hasAnswerSheet: true, answerSheetPublishedAt: expect.any(String) });
      expect(actualLecture).toMatchObject({ hasAnswerSheet: true, answerSheetPublishedAt: expect.any(String) });
      expect((await scannerService.listPublishedAnswerSheets("school-1")).map((item) => item.id).sort())
        .toEqual([lecture.id, paper.id].sort());
      await expect(lectureService.updateLecture(lecture.id, { sections: [
        { id: "extra", type: "question", title: "第三题", questionId: "q3", children: [] } as LectureSection,
      ] })).rejects.toThrow();
    });
  });

});
