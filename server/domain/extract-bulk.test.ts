import { describe, expect, it } from "vitest";
import type { DatabaseStore } from "../database.js";
import type { AppState } from "../types.js";
import type { Lecture, Question } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { withSerializedState } from "../rpc.js";
import { extractService } from "./extract.js";

const importedQuestions = Array.from({ length: 180 }, (_, i) => ({
  id: `block-${i}`,
  type: "short" as const,
  stem: `独立练习第 ${i} 题：写出本题的不同解法 ${i * 7919}`,
  answer: "略",
  analysis: "略",
  difficulty: 3,
  status: "new" as const,
}));

function initialState(): AppState {
  const source = {
    id: "source-lecture", teacherId: "teacher-1", schoolId: "school-1",
    title: "批量拆解测试", sections: [], chapterIds: [], knowledgePointIds: [],
    thoughtMethodIds: [], classIds: [], studentIds: [], grade: "高一",
    schoolYear: "2026-2027", status: "draft", version: 1,
  } as unknown as Lecture;
  return {
    teachers: [], currentTeacherId: null, questions: [], materials: [],
    lectures: [source], examPapers: [],
  };
}

function transactionalStore(initial: AppState) {
  let persisted = initial;
  let saves = 0;
  const store = {
    readState: () => persisted,
    loadState: () => structuredClone(persisted),
    saveState: async (_before: AppState, next: AppState) => { persisted = next; saves += 1; },
  } as unknown as DatabaseStore;
  return {
    get state() { return persisted; },
    get saves() { return saves; },
    execute: <T>(fn: () => Promise<T>) => withSerializedState(store, (state) => runWithState(state, fn)),
  };
}

function confirm(sourceBlocks: typeof importedQuestions = importedQuestions) {
  return extractService.confirmExtract(
    "teacher-1", "school-1", { questions: sourceBlocks, knowledgeBlocks: [
      { id: "knowledge-1", title: "关键知识", content: "解题公式", status: "new" },
    ] },
    [], [], "高一", "2026-2027", "上学期", "source-lecture",
    "document-import", "practice", "lecture",
    [
      { id: "intro", type: "documentTitle", content: "批量拆解测试" },
      { id: "knowledge-1", type: "knowledge", title: "关键知识", content: "解题公式" },
      ...sourceBlocks.map((item) => ({
        id: item.id, type: "question" as const, content: item.stem, questionType: item.type,
      })),
    ],
  );
}

describe("bulk extracted document confirmation", () => {
  it("persists a large reviewed batch and its linked document copy in one save", async () => {
    const tx = transactionalStore(initialState());
    const result = await tx.execute(() => confirm());
    expect(tx.saves).toBe(1);
    expect(result.createdQuestions).toHaveLength(importedQuestions.length);
    expect(tx.state.questions).toHaveLength(importedQuestions.length);
    expect(tx.state.materials).toHaveLength(1);
    expect(tx.state.lectures).toHaveLength(2);
    const copy = (tx.state.lectures as Lecture[]).find((lecture) => lecture.isExtractCopy)!;
    expect(copy.sourceResourceId).toBe("source-lecture");
    expect(copy.contentBlocks?.find((block) => block.type === "knowledge")?.materialId)
      .toBe(result.materialIdByItemId["knowledge-1"]);
    for (const item of importedQuestions) {
      const id = result.questionIdByItemId[item.id];
      expect(id).toBeTruthy();
      expect((tx.state.questions as Question[]).some((question) => question.id === id)).toBe(true);
      expect(copy.contentBlocks?.find((block) => block.content === item.stem)?.questionId).toBe(id);
    }
    await expect(tx.execute(() => confirm())).rejects.toThrow(/已入库/);
    expect(tx.saves).toBe(1);
    expect(tx.state.questions).toHaveLength(importedQuestions.length);
  });

  it("rolls back question insertion when creating the document copy fails", async () => {
    const original = initialState();
    original.lectures[0].answerSheetPublishedAt = "2026-10-01T08:00:00Z";
    const tx = transactionalStore(original);
    await expect(tx.execute(() => confirm(importedQuestions.slice(0, 20))))
      .rejects.toThrow(/答题卡已发布/);
    expect(tx.saves).toBe(0);
    expect(tx.state).toEqual(original);
  });
});
