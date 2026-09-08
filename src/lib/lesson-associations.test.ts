import { describe, expect, it } from "vitest";
import type { KnowledgeMastery } from "@/services/analytics";
import type { Question, Student } from "@/types";
import {
  getStudentKnowledgeWeakness,
  rankLessonStudents,
  rankRelatedQuestions,
} from "./lesson-associations";

const students = [
  { id: "student-a", name: "甲同学" },
  { id: "student-b", name: "乙同学" },
  { id: "student-c", name: "丙同学" },
] as Student[];

describe("lesson associations", () => {
  it("computes weakness only from the current question knowledge points", () => {
    const mastery = [
      {
        knowledgePointId: "kp-1",
        knowledgePointName: "函数",
        totalAttempts: 4,
        correctCount: 1,
        partialCount: 2,
        wrongCount: 1,
        correctRate: 0.25,
        masteryLevel: "weak",
      },
      {
        knowledgePointId: "kp-other",
        knowledgePointName: "数列",
        totalAttempts: 10,
        correctCount: 10,
        partialCount: 0,
        wrongCount: 0,
        correctRate: 1,
        masteryLevel: "mastered",
      },
    ] as KnowledgeMastery[];

    expect(getStudentKnowledgeWeakness(mastery, ["kp-1"])).toBe(0.5);
    expect(getStudentKnowledgeWeakness(mastery, ["kp-missing"])).toBeNull();
  });

  it("puts known weak students first on question pages and uses followed students as the tie-breaker", () => {
    const ranked = rankLessonStudents(
      students,
      new Set(["student-b"]),
      {
        "student-a": 0.8,
        "student-b": 0.8,
        "student-c": null,
      },
      true,
    );

    expect(ranked.map((student) => student.id)).toEqual([
      "student-b",
      "student-a",
      "student-c",
    ]);
  });

  it("puts followed students first when the page is not a question", () => {
    const ranked = rankLessonStudents(
      students,
      new Set(["student-c"]),
      {},
      false,
    );

    expect(ranked[0].id).toBe("student-c");
  });

  it("recommends questions with the largest knowledge-point overlap first", () => {
    const source = {
      id: "source",
      chapterIds: ["chapter-1"],
      knowledgePointIds: ["kp-1", "kp-2"],
    } as Question;
    const candidates = [
      {
        id: "q-one",
        chapterIds: ["chapter-1"],
        knowledgePointIds: ["kp-1"],
        recommendation: 5,
        usageCount: 20,
      },
      {
        id: "q-two",
        chapterIds: [],
        knowledgePointIds: ["kp-1", "kp-2"],
        recommendation: 1,
        usageCount: 1,
      },
      {
        id: "q-unrelated",
        chapterIds: ["chapter-1"],
        knowledgePointIds: ["kp-other"],
      },
    ] as Question[];

    expect(rankRelatedQuestions(source, candidates).map((question) => question.id)).toEqual([
      "q-two",
      "q-one",
    ]);
  });
});
