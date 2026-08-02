import { rpcCall } from "./api";
import type {
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  Question,
  Material,
  ResourceSemester,
} from "@/types";

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
    questionSourceType?: string,
    questionCategory?: string,
  ): Promise<{
    createdQuestions: Question[];
    mergedQuestions: Question[];
    createdMaterials: Material[];
    questionIdByItemId: Record<string, string>;
    materialIdByItemId: Record<string, string>;
  }> {
    return rpcCall("extract", "confirmExtract", [
      teacherId,
      schoolId,
      items,
      chapterIds,
      knowledgePointIds,
      grade,
      schoolYear,
      semester,
      sourceResourceId,
      questionSourceType,
      questionCategory,
    ]);
  },
};
