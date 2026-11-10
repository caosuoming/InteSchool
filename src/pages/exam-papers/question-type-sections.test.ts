import { describe, expect, it } from "vitest";
import type { ExamPaperQuestion, Question } from "@/types";
import { getQuestionTypeHeading, getQuestionTypeSections } from "./question-type-sections";

const question = (id: string, type: string, questionId?: string) =>
  ({ id, type, questionId }) as ExamPaperQuestion;

describe("getQuestionTypeSections", () => {
  it("keeps question order within each type, honors custom order, and retains unknown types", () => {
    const questions = [
      question("single-1", "single"),
      question("essay-1", "essay"),
      question("custom-1", "custom"),
      question("single-2", "single"),
    ];
    const sections = getQuestionTypeSections(questions, {}, ["essay", "single"]);
    expect(sections.map((section) => section.type)).toEqual(["essay", "single", "custom"]);
    expect(sections.map((section) => section.questions.map((item) => item.id))).toEqual([
      ["essay-1"], ["single-1", "single-2"], ["custom-1"],
    ]);
  });

  it("uses linked question types and gives every visible section a title", () => {
    const sections = getQuestionTypeSections(
      [question("linked", "single", "question-1"), question("fill", "conceptFill")],
      { "question-1": { type: "essay" } as Question },
    );
    expect(sections.map((section, index) => getQuestionTypeHeading(section.type, index))).toEqual([
      "一、概念填空题", "二、解答题",
    ]);
  });
  it("allows display-only headings without changing grouping or numbering", () => {
    const questions = [question("single", "single"), question("essay", "essay")];
    const labels = { single: "客观题", essay: "计算与证明" };
    const sections = getQuestionTypeSections(questions);
    expect(sections.map((section, index) => getQuestionTypeHeading(section.type, index, labels))).toEqual([
      "一、客观题", "二、计算与证明",
    ]);
    expect(sections.map((section) => section.type)).toEqual(["single", "essay"]);
    expect(getQuestionTypeHeading("single", 0, { single: "   " })).toBe("一、单选题");
  });

});
