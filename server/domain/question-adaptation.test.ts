import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Question } from "../../src/types/index.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { questionService } from "./question.js";

const source: Question = {
  id: "question-source",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "single",
  stem: "原始题干",
  options: ["选项 A", "选项 B"],
  answer: "A",
  analysis: "原始解析",
  summary: "原始总结",
  board: "/api/files/board.png",
  links: [{ id: "link-1", name: "拓展阅读", url: "https://example.com/read" }],
  explanationVideo: {
    materialId: "material-video-1",
    title: "讲解视频",
    fileUrl: "/api/files/video.mp4",
  },
  chapterIds: ["chapter-1"],
  knowledgePointIds: ["knowledge-1"],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  sourceType: "manual",
  category: "practice",
  difficulty: 3,
  recommendation: 4,
  usageCount: 8,
  lastUsedAt: "2026-08-02T00:00:00.000Z",
  remark: "保留备注",
  remarks: [{
    id: "remark-1",
    content: "保留批注",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }],
  isShared: false,
  duplicateHash: computeDuplicateHash("原始题干", "A", ["选项 A", "选项 B"]),
  hiddenByExamIds: ["exam-1"],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    questions: [structuredClone(source)],
  };
}

describe("question adaptation", () => {
  it("creates a new question with the adapted content and reset identity fields", async () => {
    await runWithState(state(), async () => {
      const adapted = await questionService.adaptQuestion("question-source", {
        stem: "改编后的题干",
        answer: "B",
        analysis: "改编后的解析",
        summary: "改编后的总结",
      });

      expect(adapted.id).not.toBe(source.id);
      expect(adapted.stem).toBe("改编后的题干");
      expect(adapted.options).toEqual(source.options);
      expect(adapted.answer).toBe("B");
      expect(adapted.analysis).toBe("改编后的解析");
      expect(adapted.summary).toBe("改编后的总结");
      expect(adapted.board).toBe(source.board);
      expect(adapted.links).toEqual(source.links);
      expect(adapted.links).not.toBe(source.links);
      expect(adapted.explanationVideo).toEqual(source.explanationVideo);
      expect(adapted.chapterIds).toEqual(source.chapterIds);
      expect(adapted.knowledgePointIds).toEqual(source.knowledgePointIds);
      expect(adapted.remark).toBe(source.remark);
      expect(adapted.usageCount).toBe(0);
      expect(adapted.lastUsedAt).toBeUndefined();
      expect(adapted.hiddenByExamIds).toEqual([]);
      expect(adapted.duplicateHash).toBe(
        computeDuplicateHash("改编后的题干", "B", source.options),
      );

      const questions = await questionService.listQuestions();
      expect(questions).toHaveLength(2);
      expect(questions.find((item) => item.id === source.id)?.stem).toBe("原始题干");
    });
  });

  it("requires all four adapted fields to be non-empty and changed", async () => {
    await runWithState(state(), async () => {
      await expect(questionService.adaptQuestion("question-source", {
        stem: "   ",
        answer: "B",
        analysis: "新解析",
        summary: "新总结",
      })).rejects.toThrow("题干不能为空");
      await expect(questionService.adaptQuestion("question-source", {
        stem: "新题干",
        answer: "A",
        analysis: "新解析",
        summary: "新总结",
      })).rejects.toThrow("请同步修改答案");
      expect(await questionService.listQuestions()).toHaveLength(1);
    });
  });
});
