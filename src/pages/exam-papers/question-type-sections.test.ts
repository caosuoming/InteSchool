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
});
