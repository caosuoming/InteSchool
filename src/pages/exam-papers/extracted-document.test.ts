import { describe, expect, it } from "vitest";
import type { ExamPaperQuestion, ExtractedDocumentBlock, Question } from "@/types";
import {
  commonScoreUnderHeading,
  questionIdsUnderHeading,
  resolveExtractedQuestionDisplay,
  setScoreUnderHeading,
} from "./extracted-document";

const blocks: ExtractedDocumentBlock[] = [
  { id: "heading-single", type: "groupTitle", content: "一、单选题" },
  { id: "question-block-1", type: "question", content: "第一题", examPaperQuestionId: "paper-question-1" },
  { id: "text-1", type: "text", content: "说明" },
  { id: "question-block-2", type: "question", content: "第二题", examPaperQuestionId: "paper-question-2" },
  { id: "heading-essay", type: "heading", content: "二、解答题" },
  { id: "question-block-3", type: "question", content: "第三题", examPaperQuestionId: "paper-question-3" },
];

const questions: ExamPaperQuestion[] = [
  { id: "paper-question-1", stem: "第一题", answer: "A", analysis: "解析一", score: 2, type: "single" },
  { id: "paper-question-2", stem: "第二题", answer: "B", analysis: "解析二", score: 2, type: "single" },
  { id: "paper-question-3", stem: "第三题", answer: "过程", analysis: "解析三", score: 12, type: "essay" },
];

const linkedQuestion: Question = {
  id: "question-bank-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "题库题干",
  options: ["选项 A", "选项 B"],
  answer: "A",
  analysis: "题库解析",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("extracted document question helpers", () => {
  it("limits a group title's question scope at the next group title or legacy heading", () => {
    expect(questionIdsUnderHeading(blocks, "heading-single")).toEqual([
      "paper-question-1",
      "paper-question-2",
    ]);
    expect(questionIdsUnderHeading(blocks, "heading-essay")).toEqual([
      "paper-question-3",
    ]);
  });

  it("sets one score for all questions under a heading without touching later groups", () => {
    const updated = setScoreUnderHeading(blocks, questions, "heading-single", 4);

    expect(updated.map((question) => question.score)).toEqual([4, 4, 12]);
    expect(commonScoreUnderHeading(blocks, updated, "heading-single")).toBe(4);
  });

  it("reports mixed group scores as no common value", () => {
    const mixed = questions.map((question, index) => index === 1 ? { ...question, score: 3 } : question);
    expect(commonScoreUnderHeading(blocks, mixed, "heading-single")).toBeNull();
  });

  it("repairs legacy mean vectors in an already decomposed paper snapshot", () => {
    const display = resolveExtractedQuestionDisplay(
      {
        id: "paper-question-738",
        stem: "估计正确识别图像数量的均值$\\vec{x}$。",
        answer: "$\\vec{x}=67$。",
        analysis: "所以$\\vec{x}=67$。",
        score: 12,
        type: "essay",
      },
      undefined,
    );

    expect(display).toEqual({
      stem: "估计正确识别图像数量的均值$\\bar{x}$。",
      options: undefined,
      answer: "$\\bar{x}=67$。",
      analysis: "所以$\\bar{x}=67$。",
    });
  });

  it("keeps the extracted stem and fills missing details from the linked question", () => {
    const display = resolveExtractedQuestionDisplay(
      {
        id: "paper-question-1",
        questionId: linkedQuestion.id,
        stem: "拆解题干",
        answer: "",
        analysis: "",
        score: 2,
        type: "single",
      },
      linkedQuestion,
      "原文完整题干\n第二段",
    );

    expect(display).toEqual({
      stem: "原文完整题干\n第二段",
      options: ["选项 A", "选项 B"],
      answer: "A",
      analysis: "题库解析",
    });
  });
});
