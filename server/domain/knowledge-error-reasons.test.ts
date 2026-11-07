import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";
import { questionService } from "./question.js";

function state(): AppState {
  return {
    teachers: [{
      id: "t1", name: "教师", schoolId: "school-1", subject: "数学",
      affiliations: [], currentAffiliationId: null,
    }],
    currentTeacherId: "t1",
    errorReasons: [],
    questions: [
      { id: "q1", teacherId: "t1", schoolId: "school-1", chapterIds: [], knowledgePointIds: [] },
      { id: "q2", teacherId: "t1", schoolId: "school-1", chapterIds: [], knowledgePointIds: [] },
    ] as Question[],
    directoryCatalogs: [],
    directoryDonations: [],
    directoryNodeAssociations: [],
  } as unknown as AppState;
}

describe("error reason dictionaries", () => {
  it("supports nested reasons, question associations, OR/AND filters and descendant counts", async () => {
    await runWithState(state(), async () => {
      const root = await knowledgeService.addErrorReason("t1", null, "审题问题");
      const child = await knowledgeService.addErrorReason("t1", root.id, "忽略条件");
      expect(child.level).toBe(1);
      await expect(knowledgeService.addErrorReason("t1", root.id, "忽略条件"))
        .rejects.toThrow("同一父节点下已存在同名节点");
      await expect(knowledgeService.addErrorReason("t1", "missing", "其他"))
        .rejects.toThrow("父错因不存在");

      await questionService.updateQuestion("q1", { errorReasonIds: [child.id] });
      await questionService.updateQuestion("q2", { errorReasonIds: [root.id, child.id] });
      const tree = await knowledgeService.getErrorReasonTree("t1");
      expect(tree.name).toBe("全部错因");
      expect(tree.children[0].count).toBe(2);
      expect(tree.children[0].directCount).toBe(1);
      expect(tree.children[0].children[0].count).toBe(2);
      expect((await questionService.listQuestions({ errorReasonIds: [root.id, child.id], errorReasonLogic: "and" })).map((item) => item.id)).toEqual(["q2"]);
      expect((await questionService.listQuestions({ errorReasonIds: [root.id, child.id] })).length).toBe(2);
    });
  });

  it("remaps on merge, clears deleted node references, and preserves independent catalogs", async () => {
    await runWithState(state(), async () => {
      const source = await knowledgeService.addErrorReason("t1", null, "计算失误");
      const target = await knowledgeService.addErrorReason("t1", null, "运算错误");
      await questionService.updateQuestion("q1", { errorReasonIds: [source.id] });
      await knowledgeService.mergeNodes(source.id, target.id, "error");
      expect((await questionService.getQuestion("q1"))?.errorReasonIds).toEqual([target.id]);
      const catalogs = await knowledgeService.listDirectoryCatalogs("t1", "error");
      await knowledgeService.createDirectoryCatalog("t1", "error", "另一套错因字典");
      expect((await knowledgeService.getErrorReasonTree("t1")).children).toEqual([]);
      await knowledgeService.activateDirectoryCatalog("t1", catalogs[0].id);
      expect((await knowledgeService.getErrorReasonTree("t1")).children[0].name).toBe("运算错误");
      await knowledgeService.deleteNode(target.id, "error");
      expect((await questionService.getQuestion("q1"))?.errorReasonIds).toEqual([]);
    });
  });
});
