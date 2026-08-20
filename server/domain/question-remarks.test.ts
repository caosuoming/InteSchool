import { describe, expect, it } from "vitest";
import type { Question } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { questionService } from "./question.js";

const timestamp = "2026-08-20T00:00:00.000Z";

function state(question: Question): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    questions: [question],
  };
}

describe("question remarks", () => {
  it("preserves a legacy remark when adding a structured remark", async () => {
    const question: Question = {
      id: "question-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      type: "single",
      stem: "测试题目",
      options: ["A", "B"],
      answer: "A",
      analysis: "测试解析",
      chapterIds: [],
      knowledgePointIds: [],
      difficulty: 2,
      recommendation: 3,
      usageCount: 0,
      remark: "原有备注",
      isShared: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await runWithState(state(question), async () => {
      const added = await questionService.addRemark(question.id, "新增备注");
      const updated = await questionService.getQuestion(question.id);

      expect(updated?.remarks).toHaveLength(2);
      expect(updated?.remarks?.map((remark) => remark.content)).toEqual(["原有备注", "新增备注"]);
      expect(updated?.remark).toBe("新增备注");
      expect(updated?.remarks?.[1]).toEqual(added);
    });
  });
});
