import { describe, expect, it } from "vitest";
import type { StudentAnswerDetail } from "@/services/analytics";
import type { Chapter, KnowledgePoint, Question } from "@/types";
import {
  expandedChapterSelection,
  expandedKnowledgePointSelection,
  filterAnsweredQuestionDetails,
  filterUnansweredQuestions,
} from "./student-learning-questions";

function question(id: string, chapterIds: string[], knowledgePointIds: string[]): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: `题目 ${id}`,
    options: ["A", "B"],
    answer: "A",
    analysis: "解析",
    chapterIds,
    knowledgePointIds,
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
  };
}

function detail(q: Question | null, recordId: string, questionId = q?.id ?? "deleted"): StudentAnswerDetail {
  return {
    record: {
      id: recordId,
      studentId: "student-1",
      questionId,
      lectureId: "lecture-1",
      isCorrect: true,
      score: "correct",
      answeredAt: "2026-08-25T00:00:00.000Z",
    },
    question: q,
  };
}

const chapters = [
  { id: "chapter-root", parentId: null },
  { id: "chapter-child", parentId: "chapter-root" },
  { id: "chapter-leaf", parentId: "chapter-child" },
  { id: "chapter-other", parentId: null },
] as Chapter[];

const knowledgePoints = [
  { id: "kp-root", parentId: null },
  { id: "kp-child", parentId: "kp-root" },
  { id: "kp-other", parentId: null },
] as KnowledgePoint[];

const rootQuestion = question("q-root", ["chapter-root"], ["kp-root"]);
const childQuestion = question("q-child", ["chapter-leaf"], ["kp-child"]);
const otherQuestion = question("q-other", ["chapter-other"], ["kp-other"]);

const answerDetails = [
  detail(rootQuestion, "record-root"),
  detail(childQuestion, "record-child"),
  detail(null, "record-deleted"),
];

describe("student learning question filters", () => {
  it("expands a selected chapter or knowledge directory to all descendants", () => {
    expect([...expandedChapterSelection(chapters, new Set(["chapter-root"]))]).toEqual([
      "chapter-root",
      "chapter-child",
      "chapter-leaf",
    ]);
    expect([...expandedKnowledgePointSelection(knowledgePoints, new Set(["kp-root"]))]).toEqual([
      "kp-root",
      "kp-child",
    ]);
  });

  it("shows all answered records when no directory is selected", () => {
    expect(filterAnsweredQuestionDetails(
      answerDetails,
      "chapter",
      new Set(),
      new Set(),
    )).toEqual(answerDetails);
  });

  it("filters answered records by the active selected directory including descendants", () => {
    const selectedChapters = expandedChapterSelection(chapters, new Set(["chapter-root"]));
    expect(filterAnsweredQuestionDetails(
      answerDetails,
      "chapter",
      selectedChapters,
      new Set(),
    ).map((item) => item.record.id)).toEqual(["record-root", "record-child"]);

    const selectedKnowledgePoints = expandedKnowledgePointSelection(knowledgePoints, new Set(["kp-root"]));
    expect(filterAnsweredQuestionDetails(
      answerDetails,
      "knowledge",
      new Set(),
      selectedKnowledgePoints,
    ).map((item) => item.record.id)).toEqual(["record-root", "record-child"]);
  });

  it("builds unanswered questions from the current answer set and selected directory", () => {
    const selectedChapters = expandedChapterSelection(chapters, new Set(["chapter-other"]));
    expect(filterUnansweredQuestions(
      [rootQuestion, childQuestion, otherQuestion],
      answerDetails,
      "chapter",
      selectedChapters,
      new Set(),
    ).map((item) => item.id)).toEqual(["q-other"]);
  });
});
