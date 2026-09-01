import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Chapter, KnowledgePoint } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";

function baseState(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    chapters: [],
    knowledgePoints: [],
    questions: [],
    examPapers: [],
    coursewares: [],
    materials: [],
    lectures: [],
    lessonCoursewares: [],
    schoolBackups: [],
  };
}

describe("knowledge tree node moving", () => {
  it("reparents a chapter subtree and appends it after the target siblings", async () => {
    const state = baseState();
    state.chapters = [
      { id: "target-parent", schoolId: "school-1", parentId: null, name: "目标父节点", order: 1, level: 0 },
      { id: "existing-child", schoolId: "school-1", parentId: "target-parent", name: "已有子节点", order: 3, level: 1 },
      { id: "source", schoolId: "school-1", parentId: null, name: "待移动节点", order: 2, level: 0 },
      { id: "source-child", schoolId: "school-1", parentId: "source", name: "子节点", order: 1, level: 1 },
    ] satisfies Chapter[];

    await runWithState(state, () => knowledgeService.moveNode("source", "chapter", "target-parent"));

    expect((state.chapters as Chapter[]).find((item) => item.id === "source")).toMatchObject({
      parentId: "target-parent",
      level: 1,
      order: 4,
    });
    expect((state.chapters as Chapter[]).find((item) => item.id === "source-child")).toMatchObject({
      parentId: "source",
      level: 2,
    });
  });

  it("rejects moving a node into its own descendant", async () => {
    const state = baseState();
    state.chapters = [
      { id: "source", schoolId: "school-1", parentId: null, name: "父", order: 1, level: 0 },
      { id: "child", schoolId: "school-1", parentId: "source", name: "子", order: 1, level: 1 },
      { id: "grandchild", schoolId: "school-1", parentId: "child", name: "孙", order: 1, level: 2 },
    ] satisfies Chapter[];

    await expect(
      runWithState(state, () => knowledgeService.moveNode("source", "chapter", "grandchild")),
    ).rejects.toThrow("不能将节点移动到自身或其子节点下");

    expect((state.chapters as Chapter[]).find((item) => item.id === "source")?.parentId).toBeNull();
  });

  it("rejects moving a node below a parent from another school", async () => {
    const state = baseState();
    state.knowledgePoints = [
      { id: "source", schoolId: "school-1", parentId: null, name: "知识点", order: 1, level: 0 },
      { id: "foreign", schoolId: "school-2", parentId: null, name: "外校节点", order: 1, level: 0 },
    ] satisfies KnowledgePoint[];

    await expect(
      runWithState(state, () => knowledgeService.moveNode("source", "knowledge", "foreign")),
    ).rejects.toThrow("不能跨学校移动目录节点");
  });

  it("rejects creating duplicate sibling names through a move", async () => {
    const state = baseState();
    state.knowledgePoints = [
      { id: "target-parent", schoolId: "school-1", parentId: null, name: "父", order: 1, level: 0 },
      { id: "existing", schoolId: "school-1", parentId: "target-parent", name: "同名", order: 1, level: 1 },
      { id: "source", schoolId: "school-1", parentId: null, name: "同名", order: 2, level: 0 },
    ] satisfies KnowledgePoint[];

    await expect(
      runWithState(state, () => knowledgeService.moveNode("source", "knowledge", "target-parent")),
    ).rejects.toThrow("目标父节点下已存在同名节点");
  });
});
