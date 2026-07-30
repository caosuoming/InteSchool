import { describe, expect, it } from "vitest";
import type {
  ExamPaper,
  ExtractedDocumentBlock,
  Lecture,
} from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";

const now = "2026-07-30T14:00:00.000Z";

function sourcePaper(): ExamPaper {
  return {
    id: "paper-source",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "上传试卷",
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    duration: 90,
    totalScore: 0,
    questions: [],
    status: "draft",
    originalFileUrl: "/uploads/paper.docx",
    originalFileName: "paper.docx",
    originalFileType: "word",
    originalFileSize: 1024,
    extractStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function sourceLecture(): Lecture {
  return {
    id: "lecture-source",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "上传讲义",
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    classIds: [],
    studentIds: [],
    sections: [],
    version: 1,
    status: "draft",
    originalFileUrl: "/uploads/lecture.docx",
    originalFileName: "lecture.docx",
    originalFileType: "word",
    originalFileSize: 2048,
    extractStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

function blocks(): ExtractedDocumentBlock[] {
  return [
    { id: "heading-1", type: "heading", content: "一、选择题" },
    {
      id: "question-1",
      type: "question",
      content: "第一道题题干",
      questionType: "single",
      questionId: "bank-question-1",
    },
    {
      id: "knowledge-1",
      type: "knowledge",
      title: "知识提示",
      content: "集合的基本概念",
      materialId: "material-1",
    },
    { id: "text-1", type: "text", content: "请认真作答。" },
    {
      id: "question-2",
      type: "question",
      content: "第二道题题干",
      questionType: "essay",
      questionId: "bank-question-2",
    },
  ];
}

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    examPapers: [sourcePaper()],
    lectures: [sourceLecture()],
  };
}

describe("document extract copies", () => {
  it("builds an exam paper from reviewed blocks and reports the real question count", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const copy = await examPaperService.createExtractCopy("paper-source", blocks());

      expect(copy.questions).toHaveLength(2);
      expect(copy.questions.map((question) => question.stem)).toEqual([
        "第一道题题干",
        "第二道题题干",
      ]);
      expect(copy.questions.map((question) => question.questionId)).toEqual([
        "bank-question-1",
        "bank-question-2",
      ]);
      expect(copy.totalScore).toBe(17);
      expect(copy.contentBlocks?.map((block) => block.type)).toEqual([
        "heading",
        "question",
        "knowledge",
        "text",
        "question",
      ]);
      expect(copy.contentBlocks?.filter((block) => block.type === "question"))
        .toSatisfy((questionBlocks: ExtractedDocumentBlock[]) =>
          questionBlocks.every((block) => Boolean(block.examPaperQuestionId)));
      expect(copy).toMatchObject({
        isExtractCopy: true,
        sourceResourceId: "paper-source",
        originalFileUrl: undefined,
        status: "draft",
      });
      expect((appState.examPapers as ExamPaper[]).find((paper) => paper.id === "paper-source"))
        .toMatchObject({ extractStatus: "done" });
    });
  });

  it("builds an editable lecture manuscript in the original block order", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const copy = await lectureService.createExtractCopy("lecture-source", blocks());

      expect(copy.sections.map((section) => section.type)).toEqual([
        "chapter",
        "question",
        "knowledge",
        "text",
        "question",
      ]);
      expect(copy.sections[0]).toMatchObject({ title: "一、选择题", content: "" });
      expect(copy.sections[1]).toMatchObject({
        content: "第一道题题干",
        questionId: "bank-question-1",
        displayMode: "stem-only",
      });
      expect(copy.sections[2]).toMatchObject({
        title: "知识提示",
        content: "集合的基本概念",
      });
      expect(copy.sections[4]).toMatchObject({
        content: "第二道题题干",
        questionId: "bank-question-2",
        displayMode: "stem-only",
      });
      expect(copy).toMatchObject({
        isExtractCopy: true,
        sourceResourceId: "lecture-source",
        versionType: "extract",
        hasOrigin: true,
        originalFileUrl: undefined,
      });
      expect((appState.lectures as Lecture[]).find((lecture) => lecture.id === "lecture-source"))
        .toMatchObject({ extractStatus: "done" });
    });
  });
});
