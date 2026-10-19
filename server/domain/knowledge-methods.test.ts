import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question, ThoughtMethod } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";
import { questionService } from "./question.js";

function state(): AppState {
  return {
    teachers: [{
      id: "t1", name: "教师", schoolId: "school-1", affiliations: [],
      currentAffiliationId: null,
    }],
    currentTeacherId: "t1",
    thoughtMethods: [],
    questions: [
      { id: "q1", schoolId: "school-1", teacherId: "t1", chapterIds: [], knowledgePointIds: [], thoughtMethodIds: [] },
      { id: "q2", schoolId: "school-1", teacherId: "t1", chapterIds: [], knowledgePointIds: [], thoughtMethodIds: [] },
    ] as Question[],
    directoryCatalogs: [],
    directoryDonations: [],
    directoryNodeAssociations: [],
  } as unknown as AppState;
}

describe("thought method directories", () => {
  it("creates independent nested directories, assigns questions, and counts descendants", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const root = await knowledgeService.addThoughtMethod("t1", null, "数形结合");
      const child = await knowledgeService.addThoughtMethod("t1", root.id, "函数图像");
      expect(child.level).toBe(1);
      await expect(knowledgeService.addThoughtMethod("t1", root.id, "函数图像"))
        .rejects.toThrow("同一父节点下已存在同名节点");
      await questionService.updateQuestion("q1", { thoughtMethodIds: [child.id] });
      await questionService.updateQuestion("q2", { thoughtMethodIds: [root.id, child.id] });

      const tree = await knowledgeService.getMethodTree("t1");
      expect(tree.name).toBe("全部思想方法");
      expect(tree.children[0].count).toBe(2);
      expect(tree.children[0].directCount).toBe(1);
      expect(tree.children[0].children[0].count).toBe(2);
      expect((appState.thoughtMethods as ThoughtMethod[]).length).toBe(2);

      await knowledgeService.deleteNode(root.id, "method");
      expect((appState.thoughtMethods as ThoughtMethod[])).toEqual([]);
      expect((appState.questions as Question[]).every((question) => question.thoughtMethodIds?.length === 0)).toBe(true);
    });
  });

  it("merges method directories and preserves question assignments", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const source = await knowledgeService.addThoughtMethod("t1", null, "源");
      const target = await knowledgeService.addThoughtMethod("t1", null, "目标");
      await questionService.updateQuestion("q1", { thoughtMethodIds: [source.id] });
      await knowledgeService.mergeNodes(source.id, target.id, "method");
      expect((appState.questions as Question[])[0].thoughtMethodIds).toEqual([target.id]);
      expect((await knowledgeService.listThoughtMethods("t1")).map((item) => item.name)).toEqual(["目标"]);
    });
  });
});
