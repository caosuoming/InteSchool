import { describe, expect, it } from "vitest";
import type {
  ExamPaper,
  ExtractedDocumentBlock,
  Lecture,
  Question,
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
    { id: "title-1", type: "documentTitle", content: "阶段检测" },
    { id: "info-1", type: "documentInfo", content: "考试时间：90 分钟" },
    { id: "group-1", type: "groupTitle", content: "一、选择题" },
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
  const questions: Question[] = [
    {
      id: "bank-question-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      type: "single",
      stem: "题库中的第一道题",
      options: ["A 选项", "B 选项"],
      answer: "A",
      analysis: "第一题解析",
      chapterIds: [],
      knowledgePointIds: [],
      difficulty: 3,
      recommendation: 3,
      usageCount: 0,
      remark: "",
      isShared: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "bank-question-2",
      teacherId: "teacher-1",
      schoolId: "school-1",
      type: "essay",
      stem: "题库中的第二道题",
      answer: "证明过程",
      analysis: "第二题解析",
      chapterIds: [],
      knowledgePointIds: [],
      difficulty: 4,
      recommendation: 3,
      usageCount: 0,
      remark: "",
      isShared: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
  return {
    teachers: [],
    currentTeacherId: null,
    questions,
    examPapers: [sourcePaper()],
    lectures: [sourceLecture()],
    reflections: [],
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
      expect(copy.questions[0]).toMatchObject({
        options: ["A 选项", "B 选项"],
        answer: "A",
        analysis: "第一题解析",
      });
      expect(copy.questions[1]).toMatchObject({
        answer: "证明过程",
        analysis: "第二题解析",
      });
      expect(copy.totalScore).toBe(17);
      expect(copy.contentBlocks?.map((block) => block.type)).toEqual([
        "documentTitle",
        "documentInfo",
        "groupTitle",
        "question",
        "knowledge",
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
        "text",
        "chapter",
        "question",
        "knowledge",
        "question",
      ]);
      expect(copy.sections[0]).toMatchObject({ title: "阶段检测", content: "" });
      expect(copy.sections[1]).toMatchObject({ content: "考试时间：90 分钟" });
      expect(copy.sections[2]).toMatchObject({ title: "一、选择题", content: "" });
      expect(copy.sections[3]).toMatchObject({
        content: "第一道题题干",
        questionId: "bank-question-1",
        displayMode: "stem-only",
      });
      expect(copy.sections[4]).toMatchObject({
        title: "知识提示",
        content: "集合的基本概念",
      });
      expect(copy.sections[5]).toMatchObject({
        content: "第二道题题干",
        questionId: "bank-question-2",
        displayMode: "stem-only",
      });
      expect(copy.contentBlocks?.map((block) => block.type)).toEqual([
        "documentTitle",
        "documentInfo",
        "groupTitle",
        "question",
        "knowledge",
        "question",
      ]);
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

  it("allows exam paper score changes while rejecting extracted document structure changes", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const copy = await examPaperService.createExtractCopy("paper-source", blocks());
      const rescoredQuestions = copy.questions.map((question, index) => ({
        ...question,
        score: question.score + index + 1,
      }));

      const rescored = await examPaperService.updatePaper(copy.id, {
        title: "允许修改属性",
        questions: rescoredQuestions,
      });
      expect(rescored.title).toBe("允许修改属性");
      expect(rescored.questions.map((question) => question.score)).toEqual(
        rescoredQuestions.map((question) => question.score),
      );
      expect(rescored.totalScore).toBe(
        rescoredQuestions.reduce((sum, question) => sum + question.score, 0),
      );

      await expect(examPaperService.updatePaper(copy.id, {
        questions: [...rescored.questions].reverse(),
      })).rejects.toThrow("不能换题、删除题目或调整题目顺序");
      await expect(examPaperService.updatePaper(copy.id, {
        questions: rescored.questions.map((question, index) => (
          index === 0 ? { ...question, stem: "被篡改的题干" } : question
        )),
      })).rejects.toThrow("不能换题、删除题目或调整题目顺序");

      const stillLocked = await examPaperService.updatePaper(copy.id, {
        isExtractCopy: undefined,
        sourceResourceId: undefined,
      });
      expect(stillLocked).toMatchObject({
        isExtractCopy: true,
        sourceResourceId: "paper-source",
      });
    });
  });

  it("allows lecture property changes while rejecting extracted document content changes", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const copy = await lectureService.createExtractCopy("lecture-source", blocks());

      const renamed = await lectureService.updateLecture(copy.id, { title: "允许修改讲义属性" });
      expect(renamed.title).toBe("允许修改讲义属性");
      expect(renamed.sections).toEqual(copy.sections);

      await expect(lectureService.updateLecture(copy.id, {
        sections: [...copy.sections].reverse(),
      })).rejects.toThrow("不能编辑、删除或调整讲义内容顺序");

      const stillLocked = await lectureService.updateLecture(copy.id, {
        isExtractCopy: undefined,
        sourceResourceId: undefined,
      });
      expect(stillLocked).toMatchObject({
        isExtractCopy: true,
        sourceResourceId: "lecture-source",
      });
    });
  });

  it("creates fully editable authored copies from extracted documents", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const extractedPaper = await examPaperService.createExtractCopy("paper-source", blocks());
      const paperCopy = await examPaperService.duplicatePaper(extractedPaper.id, "试卷普通副本");
      expect(paperCopy).toMatchObject({
        title: "试卷普通副本",
        isExtractCopy: undefined,
        sourceResourceId: undefined,
        originalFileUrl: undefined,
        contentBlocks: undefined,
      });
      const reorderedPaper = await examPaperService.updatePaper(paperCopy.id, {
        questions: [...paperCopy.questions].reverse(),
      });
      expect(reorderedPaper.questions.map((question) => question.id)).toEqual(
        [...paperCopy.questions].reverse().map((question) => question.id),
      );

      const extractedLecture = await lectureService.createExtractCopy("lecture-source", blocks());
      const lectureCopy = await lectureService.duplicateLecture(extractedLecture.id, "讲义普通副本");
      expect(lectureCopy).toMatchObject({
        title: "讲义普通副本",
        isExtractCopy: undefined,
        sourceResourceId: undefined,
        originalFileUrl: undefined,
        contentBlocks: undefined,
      });
      expect(lectureCopy.sections.map((section) => section.type)).toEqual([
        "chapter",
        "chapter",
      ]);
      expect(lectureCopy.sections[0].children.map((section) => section.type)).toEqual([
        "text",
      ]);
      expect(lectureCopy.sections[1].children.map((section) => section.type)).toEqual([
        "question",
        "knowledge",
        "question",
      ]);
      expect(lectureCopy.sections[1].children.map((section) => section.questionId)).toEqual([
        "bank-question-1",
        undefined,
        "bank-question-2",
      ]);
      const reorderedLecture = await lectureService.updateLecture(lectureCopy.id, {
        sections: [...lectureCopy.sections].reverse(),
      });
      expect(reorderedLecture.sections.map((section) => section.id)).toEqual(
        [...lectureCopy.sections].reverse().map((section) => section.id),
      );
    });
  });
});
