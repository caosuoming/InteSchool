import { describe, expect, it } from "vitest";
import type { ExamPaper, Lecture, LectureSection, Question } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { db, runWithState } from "../runtime-db.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";

const now = "2026-11-07T00:00:00.000Z";

function question(id: string, chapters: string[], knowledge: string[]): Question {
  return {
    id, teacherId: "t", schoolId: "s", type: "short", stem: id, answer: "", analysis: "",
    chapterIds: chapters, knowledgePointIds: knowledge, difficulty: 2, recommendation: 3,
    usageCount: 0, remark: "", isShared: false, createdAt: now, updatedAt: now,
  };
}

function paper(id: string, ids: (string | undefined)[]): ExamPaper {
  return {
    id, teacherId: "t", schoolId: "s", title: id, chapterIds: [], knowledgePointIds: [],
    grade: "高一", schoolYear: "2026-2027", duration: 90, totalScore: 30, status: "draft",
    questions: ids.map((questionId, index) => ({
      id: `${id}-${index}`, questionId, stem: "题", answer: "", analysis: "", score: 5, type: "short",
    })),
    createdAt: now, updatedAt: now,
  };
}

function section(id: string, type: LectureSection["type"], questionId?: string, children: LectureSection[] = []): LectureSection {
  return { id, title: id, type, questionId, content: "", children };
}

function lecture(id: string, sections: LectureSection[]): Lecture {
  return {
    id, teacherId: "t", schoolId: "s", title: id, chapterIds: [], knowledgePointIds: [],
    grade: "高一", schoolYear: "2026-2027", classIds: [], studentIds: [], sections,
    version: 1, status: "draft", createdAt: now, updatedAt: now,
  };
}

describe("document list annotation summary", () => {
  it("counts each paper question separately, including unlinked and missing records", async () => {
    const state: AppState = {
      teachers: [], currentTeacherId: null,
      questions: [question("q1", ["ch"], []), question("q2", [], ["kp"])],
      examPapers: [paper("paper", ["q1", "q2", undefined, "deleted"])],
    };
    await runWithState(state, async () => {
      const [result] = await examPaperService.listPapers();
      expect(result.annotationSummary).toEqual({ totalQuestions: 4, missingChapterCount: 3, missingKnowledgePointCount: 3 });
      db.update("questions", (all: Question[]) => all.map((q) => ({ ...q, chapterIds: ["ch"], knowledgePointIds: ["kp"] })));
      const [updated] = await examPaperService.listPapers();
      expect(updated.annotationSummary).toEqual({ totalQuestions: 4, missingChapterCount: 2, missingKnowledgePointCount: 2 });
    });
  });

  it("counts nested lecture question sections, ignoring non-questions and supporting content blocks", async () => {
    const nested = lecture("nested", [
      section("heading", "chapter", undefined, [section("1", "question", "q1"), section("2", "question", "q2")]),
      section("3", "question"), section("text", "text", "q1"),
    ]);
    const blocks = lecture("blocks", []);
    blocks.contentBlocks = [
      { id: "b1", type: "question", questionId: "q1", content: "题" },
      { id: "b2", type: "knowledge", content: "说明" },
    ];
    await runWithState({
      teachers: [], currentTeacherId: null,
      questions: [question("q1", ["ch"], []), question("q2", [], ["kp"])],
      lectures: [nested, blocks],
    }, async () => {
      const results = await lectureService.listLectures();
      expect(results.find((item) => item.id === "nested")?.annotationSummary).toEqual({
        totalQuestions: 3, missingChapterCount: 2, missingKnowledgePointCount: 2,
      });
      expect(results.find((item) => item.id === "blocks")?.annotationSummary).toEqual({
        totalQuestions: 1, missingChapterCount: 0, missingKnowledgePointCount: 1,
      });
    });
  });

  it("uses the latest extracted copy to show annotations on original documents", async () => {
    const originalPaper = paper("original-paper", []);
    const oldPaper = { ...paper("old", ["q2"]), isExtractCopy: true, sourceResourceId: originalPaper.id, updatedAt: "2026-01-01T00:00:00Z" };
    const newPaper = { ...paper("new", ["q1"]), isExtractCopy: true, sourceResourceId: originalPaper.id };
    const originalLecture = lecture("original-lecture", []);
    const extractedLecture = { ...lecture("copy", [section("q", "question", "q2")]), isExtractCopy: true, sourceResourceId: originalLecture.id };
    await runWithState({
      teachers: [], currentTeacherId: null,
      questions: [question("q1", ["ch"], []), question("q2", [], ["kp"])],
      examPapers: [newPaper, originalPaper, oldPaper], lectures: [extractedLecture, originalLecture],
    }, async () => {
      const papers = await examPaperService.listPapers();
      expect(papers.find((item) => item.id === originalPaper.id)?.annotationSummary).toEqual({
        totalQuestions: 1, missingChapterCount: 0, missingKnowledgePointCount: 1,
      });
      const lectures = await lectureService.listLectures();
      expect(lectures.find((item) => item.id === originalLecture.id)?.annotationSummary).toEqual({
        totalQuestions: 1, missingChapterCount: 1, missingKnowledgePointCount: 0,
      });
    });
  });
});
