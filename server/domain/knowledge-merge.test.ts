import { describe, expect, it } from "vitest";
import type { Chapter, KnowledgePoint, Question } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";

const now = "2026-08-01T00:00:00.000Z";

function question(
  id: string,
  chapterIds: string[],
  knowledgePointIds: string[],
): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
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
    createdAt: now,
    updatedAt: now,
  };
}

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

function referencedRecord(id: string, field: "chapterIds" | "knowledgePointIds", ids: string[]) {
  return {
    id,
    schoolId: "school-1",
    [field]: ids,
  };
}

describe("knowledge tree node merging", () => {
  it("merges chapter siblings recursively and migrates every persisted reference", async () => {
    const chapters: Chapter[] = [
      { id: "parent", schoolId: "school-1", parentId: null, name: "父节点", order: 1, level: 0 },
      { id: "source", schoolId: "school-1", parentId: "parent", name: "旧章节", order: 1, level: 1 },
      { id: "target", schoolId: "school-1", parentId: "parent", name: "保留章节", order: 2, level: 1 },
      { id: "source-common", schoolId: "school-1", parentId: "source", name: "共同子节点", order: 1, level: 2 },
      { id: "target-common", schoolId: "school-1", parentId: "target", name: "共同子节点", order: 1, level: 2 },
      { id: "source-grandchild", schoolId: "school-1", parentId: "source-common", name: "孙节点", order: 1, level: 3 },
      { id: "source-unique", schoolId: "school-1", parentId: "source", name: "独有子节点", order: 2, level: 2 },
      { id: "other", schoolId: "school-2", parentId: null, name: "其他学校", order: 1, level: 0 },
    ];
    const knowledgePoints: KnowledgePoint[] = [
      {
        id: "legacy-point",
        schoolId: "school-1",
        parentId: null,
        chapterId: "source",
        name: "旧数据知识点",
        order: 1,
        level: 0,
      },
    ];
    const state = baseState();
    state.chapters = chapters;
    state.knowledgePoints = knowledgePoints;
    state.questions = [
      question(
        "question-1",
        ["source", "target", "source-common", "source-grandchild"],
        [],
      ),
    ];
    for (const collection of [
      "examPapers",
      "coursewares",
      "materials",
      "lectures",
      "lessonCoursewares",
      "schoolBackups",
    ]) {
      state[collection] = [referencedRecord(`${collection}-1`, "chapterIds", ["source", "target"])];
    }

    await runWithState(state, () => knowledgeService.mergeNodes("source", "target", "chapter"));

    const mergedChapters = state.chapters as Chapter[];
    expect(mergedChapters.map((item) => item.id)).not.toContain("source");
    expect(mergedChapters.map((item) => item.id)).not.toContain("source-common");
    expect(mergedChapters.find((item) => item.id === "source-unique")).toMatchObject({
      parentId: "target",
      order: 2,
      level: 2,
    });
    expect(mergedChapters.find((item) => item.id === "source-grandchild")).toMatchObject({
      parentId: "target-common",
      level: 3,
    });
    expect((state.questions as Question[])[0].chapterIds).toEqual([
      "target",
      "target-common",
      "source-grandchild",
    ]);
    expect((state.knowledgePoints as KnowledgePoint[])[0].chapterId).toBe("target");
    for (const collection of [
      "examPapers",
      "coursewares",
      "materials",
      "lectures",
      "lessonCoursewares",
      "schoolBackups",
    ]) {
      expect((state[collection] as Array<{ chapterIds: string[] }>)[0].chapterIds).toEqual(["target"]);
    }
  });

  it("merges knowledge-point siblings, preserves target metadata, and remaps aliases", async () => {
    const points: KnowledgePoint[] = [
      { id: "source", schoolId: "school-1", parentId: null, name: "旧知识点", description: "来源说明", order: 1, level: 0 },
      { id: "target", schoolId: "school-1", parentId: null, name: "保留知识点", order: 2, level: 0 },
      { id: "source-child", schoolId: "school-1", parentId: "source", name: "子知识点", order: 1, level: 1 },
      { id: "target-child", schoolId: "school-1", parentId: "target", name: "子知识点", order: 1, level: 1 },
    ];
    const state = baseState();
    state.knowledgePoints = points;
    state.questions = [question("question-1", [], ["source", "target", "source-child"])];
    state.materials = [referencedRecord("material-1", "knowledgePointIds", ["source", "target"])];

    await runWithState(state, () => knowledgeService.mergeNodes("source", "target", "knowledge"));

    const mergedPoints = state.knowledgePoints as KnowledgePoint[];
    expect(mergedPoints.map((item) => item.id)).toEqual(["target", "target-child"]);
    expect(mergedPoints.find((item) => item.id === "target")?.description).toBe("来源说明");
    expect((state.questions as Question[])[0].knowledgePointIds).toEqual([
      "target",
      "target-child",
    ]);
    expect((state.materials as Array<{ knowledgePointIds: string[] }>)[0].knowledgePointIds).toEqual([
      "target",
    ]);
  });

  it("rejects merging nodes that do not share the same parent", async () => {
    const state = baseState();
    state.chapters = [
      { id: "source", schoolId: "school-1", parentId: null, name: "源", order: 1, level: 0 },
      { id: "parent", schoolId: "school-1", parentId: null, name: "父", order: 2, level: 0 },
      { id: "target", schoolId: "school-1", parentId: "parent", name: "目标", order: 1, level: 1 },
    ] satisfies Chapter[];

    await expect(
      runWithState(state, () => knowledgeService.mergeNodes("source", "target", "chapter")),
    ).rejects.toThrow("只能合并同一父节点下的子节点");
  });
});
