import { describe, expect, it } from "vitest";
import { documentStudentProgress, documentStudentProgressLabel } from "./document-student-progress";
import type { AnswerRecord, ExamPaper, Lecture } from "@/types";

function record(studentId: string, questionId: string, id = `${studentId}:${questionId}`): AnswerRecord {
  return { id, studentId, questionId, lectureId: "lecture-1", isCorrect: true, answeredAt: "2026-10-01" };
}

describe("documentStudentProgress", () => {
  const paper = {
    questions: [
      { id: "entry-1", questionId: "q1" },
      { id: "entry-2", questionId: "q2" },
      { id: "entry-3", questionId: "q3" },
    ],
  } as ExamPaper;

  it("counts distinct completed questions, regardless of repeat attempts", () => {
    const records = [record("s1", "q1"), record("s1", "q1", "retry"), record("s1", "unrelated")];
    expect(documentStudentProgress(paper, ["s1"], records)).toEqual({ done: 1, pending: 2 });
    expect(documentStudentProgressLabel(paper, ["s1"], records)).toBe("已做 1 题 · 待做 2 题");
  });

  it("counts multi-student progress separately and excludes unselected students", () => {
    const records = [record("s1", "q1"), record("s2", "q1"), record("s3", "q2")];
    expect(documentStudentProgress(paper, ["s1", "s2"], records)).toEqual({ done: 2, pending: 4 });
    expect(documentStudentProgressLabel(paper, ["s1", "s2"], records)).toBe("已做 2 题次 · 待做 4 题次");
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
    expect(documentStudentProgress(lecture, ["s1"], [record("s1", "q1")])).toEqual({ done: 1, pending: 1 });
  });

  it("falls back to content blocks for documents with no structured questions", () => {
    const paper = {
      questions: [],
      contentBlocks: [{ id: "b1", type: "question", questionId: "q1" }, { id: "b2", type: "text" }],
    } as ExamPaper;
    expect(documentStudentProgress(paper, ["s1"], [record("s1", "q1")])).toEqual({ done: 1, pending: 0 });
  });

  it("handles question entries without linked question bank ids conservatively", () => {
    const paper = { questions: [{ id: "entry-a" }] } as ExamPaper;
    expect(documentStudentProgress(paper, ["s1"], [])).toEqual({ done: 0, pending: 1 });
  });

  it("returns zero when no students or questions are selected", () => {
    expect(documentStudentProgress(paper, [], [])).toEqual({ done: 0, pending: 0 });
    expect(documentStudentProgress({ questions: [] } as ExamPaper, ["s1"], [])).toEqual({ done: 0, pending: 0 });
  });
});
