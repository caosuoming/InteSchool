import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { extractService } from "./extract.js";

describe("extractService", () => {
  it("persists reviewed multi-label categories without replacing the legacy category", async () => {
    const state: AppState = { teachers: [], currentTeacherId: null, questions: [], knowledgePoints: [] };
    await runWithState(state, async () => {
      const result = await extractService.confirmExtract(
        "teacher-1", "school-1",
        { questions: [{ id: "question-1", type: "essay", stem: "（1）求值（2）化简（3）证明", answer: "略", analysis: "法一、法二", categories: ["一题多解", "一题多问"], difficulty: 3, status: "new" }], knowledgeBlocks: [] },
        [], [], "高一", "2026-2027", "上学期", "lecture-1", "document-import", "practice",
      );
      expect(result.createdQuestions[0].category).toBe("practice");
      expect(result.createdQuestions[0].categories).toEqual(["practice", "一题多解", "一题多问"]);
    });
  });

  it("stores omitted answer, analysis, and summary as 略", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      questions: [],
      knowledgePoints: [],
    };

    await runWithState(state, async () => {
      const result = await extractService.confirmExtract(
        "teacher-1",
        "school-1",
        {
          questions: [{
            id: "question-1",
            type: "essay",
            stem: "请说明该结论。",
            answer: "待教师补充",
            analysis: "待教师补充解析",
            summary: " ",
            difficulty: 3,
            status: "new",
          }],
          knowledgeBlocks: [],
        },
        ["chapter-document"],
        ["knowledge-document"],
        "高一",
        "2026-2027",
        "上学期",
        "lecture-1",
        "document-import",
        "mock-exam",
      );

      expect(result.createdQuestions).toHaveLength(1);
      expect(result.createdQuestions[0]).toMatchObject({
        answer: "略",
        analysis: "略",
        summary: "略",
        chapterIds: [],
        knowledgePointIds: [],
        sourceType: "document-import",
        category: "mock-exam",
      });
      expect(state.questions).toEqual([
        expect.objectContaining({
          answer: "略",
          analysis: "略",
          summary: "略",
          chapterIds: [],
          knowledgePointIds: [],
          sourceType: "document-import",
          category: "mock-exam",
        }),
      ]);
    });
  });
});
