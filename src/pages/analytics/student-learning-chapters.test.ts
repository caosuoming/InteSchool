import { describe, expect, it } from "vitest";
import type { StudentAnswerDetail } from "@/services/analytics";
import type { AnswerRecord, Chapter, Question } from "@/types";
import {
  applyChapterPlacement,
  buildChapterMastery,
  orderVisibleChapterMastery,
} from "./student-learning-chapters";

const chapters: Chapter[] = [
  { id: "chapter-root", schoolId: "school-1", parentId: null, name: "必修第一章", order: 1, level: 0 },
  { id: "chapter-a", schoolId: "school-1", parentId: "chapter-root", name: "集合", order: 1, level: 1 },
  { id: "chapter-b", schoolId: "school-1", parentId: "chapter-root", name: "函数", order: 2, level: 1 },
];

function question(id: string, chapterIds: string[]): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: id,
    answer: "A",
    analysis: "",
    chapterIds,
    knowledgePointIds: [],
    difficulty: 1,
    recommendation: 1,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

function detail(id: string, score: AnswerRecord["score"], chapterIds: string[]): StudentAnswerDetail {
  return {
    record: {
      id: `record-${id}`,
      studentId: "student-1",
      questionId: id,
      lectureId: "lecture-1",
      score,
      isCorrect: score === "correct",
      answeredAt: "2026-08-15T00:00:00.000Z",
    },
    question: question(id, chapterIds),
  };
}

describe("buildChapterMastery", () => {
  it("aggregates descendant chapter records into parents without double counting", () => {
    const mastery = buildChapterMastery(chapters, [
      detail("q-1", "correct", ["chapter-a"]),
      detail("q-2", "wrong", ["chapter-root", "chapter-a"]),
      detail("q-3", "partial", ["chapter-b"]),
      detail("q-4", "done", ["chapter-a"]),
    ]);

    expect(mastery.map((item) => item.chapterId)).toEqual(["chapter-root", "chapter-a", "chapter-b"]);
    expect(mastery[0]).toMatchObject({
      parentId: null,
      chapterPath: ["必修第一章"],
      totalAttempts: 3,
      correctCount: 1,
      partialCount: 1,
      wrongCount: 1,
      masteryLevel: "weak",
    });
    expect(mastery[1]).toMatchObject({
      parentId: "chapter-root",
      chapterPath: ["必修第一章", "集合"],
      totalAttempts: 2,
      correctCount: 1,
      wrongCount: 1,
    });
    expect(mastery[2]).toMatchObject({ totalAttempts: 1, partialCount: 1 });
  });

  it("keeps untrained chapters visible", () => {
    const mastery = buildChapterMastery(chapters, []);
    expect(mastery).toHaveLength(3);
    expect(mastery.every((item) => item.masteryLevel === "untrained")).toBe(true);
  });

  it("moves a selected node globally while preserving its attached subtree", () => {
    const mastery = buildChapterMastery([
      ...chapters,
      { id: "chapter-second", schoolId: "school-1", parentId: null, name: "必修第二章", order: 2, level: 0 },
    ], []);

    const placements = applyChapterPlacement(
      {},
      new Set(["chapter-root"]),
      "bottom",
    );
    expect(placements).toEqual({ "chapter-root": "bottom" });
    expect(orderVisibleChapterMastery(mastery, placements, new Set()).map((item) => item.chapterId)).toEqual([
      "chapter-second",
      "chapter-root",
      "chapter-a",
      "chapter-b",
    ]);
    expect(orderVisibleChapterMastery(mastery, placements, new Set(["chapter-root"])).map((item) => item.chapterId)).toEqual([
      "chapter-second",
      "chapter-root",
    ]);
  });

  it("returns a detached child to its parent when restored to normal", () => {
    const mastery = buildChapterMastery([
      ...chapters,
      { id: "chapter-second", schoolId: "school-1", parentId: null, name: "必修第二章", order: 2, level: 0 },
    ], []);

    const bottom = applyChapterPlacement({}, new Set(["chapter-a"]), "bottom");
    expect(orderVisibleChapterMastery(mastery, bottom, new Set()).map((item) => item.chapterId)).toEqual([
      "chapter-root",
      "chapter-b",
      "chapter-second",
      "chapter-a",
    ]);

    const restored = applyChapterPlacement(bottom, new Set(["chapter-a"]), "normal");
    expect(restored).toEqual({});
    expect(orderVisibleChapterMastery(mastery, restored, new Set()).map((item) => item.chapterId)).toEqual([
      "chapter-root",
      "chapter-a",
      "chapter-b",
      "chapter-second",
    ]);
  });
});
