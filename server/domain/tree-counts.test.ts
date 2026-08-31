import { describe, expect, it } from "vitest";
import type { AnswerRecord, Chapter, KnowledgePoint, Question, TreeNode } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { analyticsService } from "./analytics.js";
import { knowledgeService } from "./knowledge.js";

const now = "2026-07-30T04:00:00.000Z";

function question(
  id: string,
  schoolId: string,
  chapterIds: string[],
  knowledgePointIds: string[],
): Question {
  return {
    id,
    teacherId: `${schoolId}-teacher`,
    schoolId,
    type: "single",
    stem: id,
    options: ["A", "B"],
    answer: "A",
    analysis: "",
    chapterIds,
    knowledgePointIds,
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    hiddenByExamIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function answer(
  id: string,
  studentId: string,
  questionId: string,
  answeredAt = now,
  score: AnswerRecord["score"] = "correct",
): AnswerRecord {
  return {
    id,
    studentId,
    questionId,
    lectureId: "manual",
    isCorrect: score === "correct",
    score,
    source: "manual",
    answeredAt,
  };
}

function searchNode(tree: TreeNode, id: string): TreeNode | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const match = searchNode(child, id);
    if (match) return match;
  }
  return undefined;
}

function findNode(tree: TreeNode, id: string): TreeNode {
  const match = searchNode(tree, id);
  if (!match) throw new Error(`Missing tree node: ${id}`);
  return match;
}

function state(): AppState {
  const chapters: Chapter[] = [
    {
      id: "ch-parent",
      schoolId: "school-a",
      parentId: null,
      name: "必修第一册",
      order: 1,
      level: 0,
      questionCount: 0,
    },
    {
      id: "ch-child",
      schoolId: "school-a",
      parentId: "ch-parent",
      name: "集合",
      order: 1,
      level: 1,
      questionCount: 0,
    },
    {
      id: "ch-other",
      schoolId: "school-b",
      parentId: null,
      name: "其他学校章节",
      order: 1,
      level: 0,
      questionCount: 99,
    },
  ];
  const knowledgePoints: KnowledgePoint[] = [
    {
      id: "kp-group-a",
      schoolId: "school-a",
      parentId: null,
      chapterId: "ch-parent",
      name: "路径 A",
      order: 1,
      level: 0,
      questionCount: 0,
    },
    {
      id: "kp-alias-a",
      schoolId: "school-a",
      parentId: "kp-group-a",
      chapterId: "ch-parent",
      name: "集合的概念",
      order: 1,
      level: 1,
      questionCount: 0,
    },
    {
      id: "kp-group-b",
      schoolId: "school-a",
      parentId: null,
      chapterId: "ch-child",
      name: "路径 B",
      order: 2,
      level: 0,
      questionCount: 0,
    },
    {
      id: "kp-alias-b",
      schoolId: "school-a",
      parentId: "kp-group-b",
      chapterId: "ch-child",
      name: "集合的概念",
      order: 1,
      level: 1,
      questionCount: 0,
    },
    {
      id: "kp-other",
      schoolId: "school-b",
      parentId: null,
      chapterId: "ch-other",
      name: "集合的概念",
      order: 1,
      level: 0,
      questionCount: 99,
    },
  ];

  return {
    teachers: [],
    currentTeacherId: null,
    chapters,
    knowledgePoints,
    questions: [
      question("q-parent", "school-a", ["ch-parent"], ["kp-alias-a"]),
      question("q-child", "school-a", ["ch-child"], ["kp-alias-b"]),
      question("q-both", "school-a", ["ch-parent", "ch-child"], ["kp-alias-a", "kp-alias-b"]),
      question("q-other", "school-b", ["ch-other"], ["kp-other"]),
    ],
    answerRecords: [
      answer("a-1", "student-1", "q-parent"),
      answer("a-2", "student-2", "q-parent"),
      answer("a-3", "student-2", "q-child"),
      answer("a-4", "student-1", "q-both", "2025-01-01T00:00:00.000Z"),
      answer("a-5", "student-1", "q-other"),
    ],
  };
}

describe("live directory counts", () => {
  it("derives chapter and knowledge counts from current questions instead of stale snapshots", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const chapterTree = await knowledgeService.getChapterTree("school-a");
      expect(findNode(chapterTree, "ch-parent").count).toBe(3);
      expect(findNode(chapterTree, "ch-child").count).toBe(2);

      const knowledgeTree = await knowledgeService.getKnowledgeTree("school-a");
      expect(findNode(knowledgeTree, "kp-alias-a")).toMatchObject({ count: 3 });
      expect(findNode(knowledgeTree, "kp-alias-a").description).toBeUndefined();
      expect(findNode(knowledgeTree, "kp-alias-a").chapterId).toBeUndefined();
      expect(findNode(knowledgeTree, "kp-alias-b").count).toBe(3);
      expect(knowledgeTree.count).toBe(3);

      (appState.questions as Question[]).push(
        question("q-new", "school-a", ["ch-child"], ["kp-alias-a"]),
      );

      const refreshedChapterTree = await knowledgeService.getChapterTree("school-a");
      expect(findNode(refreshedChapterTree, "ch-parent").count).toBe(4);
      expect(findNode(refreshedChapterTree, "ch-child").count).toBe(3);
    });
  });

  it("creates knowledge points without a chapter directory", async () => {
    const appState = state();
    appState.chapters = [];
    appState.knowledgePoints = [];
    appState.questions = [];

    await runWithState(appState, async () => {
      const point = await knowledgeService.addKnowledgePoint(
        "school-a",
        null,
        "独立知识点",
      );

      expect(point).toMatchObject({
        schoolId: "school-a",
        parentId: null,
        name: "独立知识点",
      });
      expect(point.chapterId).toBeUndefined();

      const tree = await knowledgeService.getKnowledgeTree("school-a");
      expect(findNode(tree, point.id).name).toBe("独立知识点");
    });
  });

  it("shows distinct completed-question counts and mastery for the selected students and date range", async () => {
    const appState = state();
    (appState.answerRecords as AnswerRecord[]).push(
      answer("a-6", "student-1", "q-child", now, "wrong"),
      answer("a-7", "student-1", "q-parent", now, "done"),
    );
    await runWithState(appState, async () => {
      const baseTree = await knowledgeService.getChapterTree("school-a");
      const annotated = await analyticsService.annotateTreeWithStudentProgress(
        baseTree,
        ["student-1", "student-2"],
        "chapter",
        { start: "2026-01-01T00:00:00.000Z", end: "2026-12-31T23:59:59.999Z" },
      );

      expect(findNode(annotated, "ch-parent")).toMatchObject({ count: 3, doneCount: 2, masteryRate: 0.75 });
      expect(findNode(annotated, "ch-child")).toMatchObject({ count: 2, doneCount: 1, masteryRate: 0.5 });
    });
  });
});
