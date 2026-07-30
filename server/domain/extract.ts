import type {
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  Question,
  Material,
  ResourceSemester,
} from "../../src/types/index.js";
import { questionService } from "./question.js";
import { materialService } from "./material.js";

export const extractService = {
  async confirmExtract(
    teacherId: string,
    schoolId: string,
    items: {
      questions: ExtractedQuestionItem[];
      knowledgeBlocks: ExtractedKnowledgeItem[];
    },
    chapterIds: string[],
    knowledgePointIds: string[],
    grade: string,
    schoolYear: string,
    semester: ResourceSemester,
    sourceResourceId: string,
  ): Promise<{
    createdQuestions: Question[];
    createdMaterials: Material[];
    questionIdByItemId: Record<string, string>;
    materialIdByItemId: Record<string, string>;
  }> {
    const createdQuestions: Question[] = [];
    const createdMaterials: Material[] = [];
    const questionIdByItemId: Record<string, string> = {};
    const materialIdByItemId: Record<string, string> = {};

    for (const item of items.questions) {
      if (item.status === "duplicate" && item.duplicateOf) {
        questionIdByItemId[item.id] = item.duplicateOf.id;
        continue;
      }
      if (!item.stem.trim()) throw new Error("题干不能为空");
      if (!item.answer.trim() || item.answer === "待教师补充") throw new Error("题目答案尚未补充");
      if (!item.analysis.trim() || item.analysis === "待教师补充解析") throw new Error("题目解析尚未补充");
      const created = await questionService.createQuestion(teacherId, schoolId, {
        type: item.type,
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        analysis: item.analysis,
        summary: item.summary || "",
        chapterIds,
        knowledgePointIds,
        grade,
        schoolYear,
        semester,
        difficulty: item.difficulty as 1 | 2 | 3 | 4 | 5,
        recommendation: 3,
      });
      createdQuestions.push(created);
      questionIdByItemId[item.id] = created.id;
    }

    for (const item of items.knowledgeBlocks) {
      if (item.status === "duplicate" && item.duplicateOf) {
        materialIdByItemId[item.id] = item.duplicateOf.id;
        continue;
      }
      if (!item.title.trim() || !item.content.trim()) throw new Error("知识块标题和内容不能为空");
      const created = await materialService.createMaterial(teacherId, schoolId, {
        title: item.title,
        chapterIds,
        knowledgePointIds,
        grade,
        schoolYear,
        semester,
        type: "knowledgeBlock",
        content: item.content,
        tags: [],
      });
      await materialService.updateMaterial(created.id, { sourceResourceId });
      createdMaterials.push(created);
      materialIdByItemId[item.id] = created.id;
    }

    return {
      createdQuestions,
      createdMaterials,
      questionIdByItemId,
      materialIdByItemId,
    };
  },
};
