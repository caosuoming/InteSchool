import { describe, expect, it } from "vitest";
import { documentStudentProgress, documentStudentProgressLabel } from "./document-student-progress";
import type { AnswerRecord, ExamPaper, Lecture } from "@/types";

function record(studentId: string, questionId: string, id = `${studentId}:${questionId}`): AnswerRecord {
  return { id, studentId, questionId, lectureId: "lecture-1", isCorrect: true, answeredAt: "2026-10-01" };
}

const paper = {
  questions: [
    { id: "entry-1", questionId: "q1" },
    { id: "entry-2", questionId: "q2" },
    { id: "entry-3", questionId: "q3" },
  ],
} as ExamPaper;

const assignments = [
  { studentId: "s1", questionId: "q1" },
  { studentId: "s1", questionId: "q2" },
  { studentId: "s2", questionId: "q1" },
  { studentId: "s2", questionId: "q3" },
  { studentId: "s3", questionId: "q3" },
];

describe("documentStudentProgress", () => {
  it("separates completed, assigned but incomplete, and never assigned questions", () => {
    const records = [record("s1", "q1"), record("s1", "q1", "retry"), record("s1", "unrelated")];
    expect(documentStudentProgress(paper, ["s1"], records, assignments)).toEqual({ done: 1, pending: 1, undone: 1 });
    expect(documentStudentProgressLabel(paper, ["s1"], records, assignments))
      .toBe("做过 1 题 · 待做 1 题 · 未做 1 题");
  });

  it("counts per student and does not count nonselected students' records or assignments", () => {
    const records = [record("s1", "q1"), record("s2", "q1"), record("s3", "q2")];
    expect(documentStudentProgress(paper, ["s1", "s2"], records, assignments))
      .toEqual({ done: 2, pending: 2, undone: 2 });
    expect(documentStudentProgressLabel(paper, ["s1", "s2"], records, assignments))
      .toBe("做过 2 题次 · 待做 2 题次 · 未做 2 题次");
  });

  it("gives real attempts priority over pending assignments and deduplicates repeated selections", () => {
    const records = [record("s1", "q1"), record("s1", "q2")];
    expect(documentStudentProgress(paper, ["s1", "s1"], records, assignments))
      .toEqual({ done: 2, pending: 0, undone: 1 });
  });

  it("handles nested lecture questions without double-counting document blocks", () => {
    const lecture = {
      sections: [{
        id: "section", type: "chapter", children: [
          { id: "one", type: "question", questionId: "q1", children: [] },
          { id: "nested", type: "chapter", children: [
            { id: "two", type: "question", questionId: "q2", children: [] },
          ] },
        ],
      }],
      contentBlocks: [{ id: "block", type: "question", questionId: "q1" }],
    } as Lecture;
    expect(documentStudentProgress(lecture, ["s1"], [record("s1", "q1")], assignments))
      .toEqual({ done: 1, pending: 1, undone: 0 });
  });

  it("falls back to content blocks for documents without structured questions", () => {
    const onlyBlocks = {
      questions: [],
      contentBlocks: [{ id: "b1", type: "question", questionId: "q1" }, { id: "b2", type: "text" }],
    } as ExamPaper;
    expect(documentStudentProgress(onlyBlocks, ["s1"], [record("s1", "q1")], assignments))
      .toEqual({ done: 1, pending: 0, undone: 0 });
  });

  it("does not infer assigned status for question entries without bank IDs", () => {
    const detached = { questions: [{ id: "entry-a" }] } as ExamPaper;
    expect(documentStudentProgress(detached, ["s1"], [], assignments))
      .toEqual({ done: 0, pending: 0, undone: 1 });
  });

  it("returns zero when no students or questions are selected", () => {
    expect(documentStudentProgress(paper, [], [], assignments)).toEqual({ done: 0, pending: 0, undone: 0 });
    expect(documentStudentProgress({ questions: [] } as ExamPaper, ["s1"], [], assignments))
      .toEqual({ done: 0, pending: 0, undone: 0 });
  });
});
