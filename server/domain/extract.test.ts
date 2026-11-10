import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { Material } from "../../src/types/index.js";
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


describe("knowledge answers in extraction storage", () => {
  it("persists ordered underlined answers separately from knowledge content", async () => {
    const state: AppState = { teachers: [], currentTeacherId: null, questions: [], knowledgePoints: [], materials: [] };
    await runWithState(state, async () => {
      const result = await extractService.confirmExtract(
        "teacher-1", "school-1",
        { questions: [], knowledgeBlocks: [{
          id: "knowledge-1", title: "等式", content: '等式的右边是 <span class="knowledge-answer-blank" data-answer-index="1">____</span>',
          inlineAnswers: ["6"], status: "new",
        }] },
        [], [], "高一", "2026-2027", "上学期", "lecture-1",
      );
      expect(result.createdMaterials[0]).toMatchObject({ inlineAnswers: ["6"] });
      expect(result.createdMaterials[0].content).not.toContain("右边是 6");
    });
  });
});


describe("English listening audio extraction", () => {
  const audioMaterial = {
    id: "audio-material-1", teacherId: "teacher-1", schoolId: "school-1",
    title: "全卷听力.mp3", type: "audio", fileUrl: "/api/files/1234-5678",
  } as Material;
  const ref = { materialId: audioMaterial.id, title: audioMaterial.title, fileUrl: audioMaterial.fileUrl! };
  const item = (id: string) => ({
    id, type: "englishListeningChoice", stem: `${id} Which recording?`,
    answer: "A", analysis: "略", difficulty: 3, status: "new" as const,
    listeningAudios: [ref],
  });

  it("links a shared audio asset to multiple listening questions without duplicating it", async () => {
    const state: AppState = {
      teachers: [], currentTeacherId: null, questions: [], knowledgePoints: [],
      materials: [audioMaterial],
    };
    await runWithState(state, async () => {
      const result = await extractService.confirmExtract(
        "teacher-1", "school-1",
        { questions: [item("1"), item("2")], knowledgeBlocks: [] },
        [], [], "高三", "2026-2027", "上学期", "paper-1",
      );
      expect(result.createdQuestions).toHaveLength(2);
      expect(result.createdQuestions.every((question) => question.listeningAudios?.[0].materialId === ref.materialId)).toBe(true);
      expect(state.materials).toHaveLength(1);
    });
  });

  it("rejects references to foreign, deleted or non-audio materials", async () => {
    const state: AppState = {
      teachers: [], currentTeacherId: null, questions: [], knowledgePoints: [],
      materials: [{ ...audioMaterial, teacherId: "other-teacher" }],
    };
    await runWithState(state, async () => {
      await expect(extractService.confirmExtract(
        "teacher-1", "school-1",
        { questions: [item("1")], knowledgeBlocks: [] },
        [], [], "高三", "2026-2027", "上学期", "paper-1",
      )).rejects.toThrow(/无权关联/);
      expect(state.questions).toHaveLength(0);
    });
  });
});
