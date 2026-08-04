import { describe, expect, it } from "vitest";
import type { AnswerRecord, ExtractedDocumentBlock } from "@/types";
import {
  buildQuestionProgress,
  getCollapsedStructuredBlockIds,
  getHeadingInsertIndex,
  insertBlocksUnderHeading,
} from "./exam-paper-editor-helpers";

function record(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    id: "record",
    studentId: "student-1",
    questionId: "question-1",
    lectureId: "paper-1",
    isCorrect: false,
    answeredAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildQuestionProgress", () => {
  it("uses the latest result per target student and excludes done-only records from accuracy", () => {
    const progress = buildQuestionProgress([
      record({ id: "old", score: "wrong" }),
      record({ id: "new", score: "correct", isCorrect: true, answeredAt: "2026-08-02T00:00:00.000Z" }),
      record({ id: "done", studentId: "student-2", score: "done" }),
      record({ id: "other", studentId: "student-3", score: "wrong" }),
    ], ["student-1", "student-2"]);

    expect(progress["question-1"]).toEqual({
      answeredCount: 2,
      targetCount: 2,
      scoredCount: 1,
      correctRate: 1,
    });
  });
});

describe("structured question groups", () => {
  const blocks: ExtractedDocumentBlock[] = [
    { id: "title", type: "documentTitle", content: "试卷" },
    { id: "group-1", type: "groupTitle", content: "选择题" },
    { id: "question-1", type: "question", content: "第一题" },
    { id: "note-1", type: "text", content: "说明" },
    { id: "group-2", type: "heading", content: "解答题" },
    { id: "question-2", type: "question", content: "第二题" },
  ];

  it("hides all descendants until the next question group", () => {
    expect(getCollapsedStructuredBlockIds(blocks, new Set(["group-1"]))).toEqual(
      new Set(["question-1", "note-1"]),
    );
  });

  it("inserts new questions at the end of the selected group", () => {
    expect(getHeadingInsertIndex(blocks, "group-1")).toBe(4);
    const inserted = insertBlocksUnderHeading(blocks, "group-1", [
      { id: "question-new", type: "question", content: "新增题" },
    ]);
    expect(inserted.map((block) => block.id)).toEqual([
      "title",
      "group-1",
      "question-1",
      "note-1",
      "question-new",
      "group-2",
      "question-2",
    ]);
  });
});
