import type {
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  Question,
  Material,
  ResourceSemester,
} from "../../src/types/index.js";
import { questionService } from "./question.js";
import { materialService } from "./material.js";

const OMITTED_CONTENT = "略";

function normalizeQuestionField(value: string | undefined, missingMarkers: string[] = []): string {
  const normalized = value?.trim() || "";
  return normalized && !missingMarkers.includes(normalized) ? normalized : OMITTED_CONTENT;
}

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
      const answer = normalizeQuestionField(item.answer, ["待教师补充"]);
      const analysis = normalizeQuestionField(item.analysis, ["待教师补充解析"]);
      const summary = normalizeQuestionField(item.summary);
      const created = await questionService.createQuestion(teacherId, schoolId, {
        type: item.type,
        stem: item.stem,
        options: item.options,
        answer,
        analysis,
        summary,
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
