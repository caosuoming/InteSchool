import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { extractService } from "./extract.js";

describe("extractService", () => {
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
        [],
        [],
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
        sourceType: "document-import",
        category: "mock-exam",
      });
      expect(state.questions).toEqual([
        expect.objectContaining({
          answer: "略",
          analysis: "略",
          summary: "略",
          sourceType: "document-import",
          category: "mock-exam",
        }),
      ]);
    });
  });
});
