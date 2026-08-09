import type {
  DuplicateQuestionFieldChoice,
  DuplicateQuestionMergeFields,
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  Question,
  Material,
  ResourceSemester,
} from "../../src/types/index.js";
import {
  createDuplicateConfirmationError,
  questionService,
} from "./question.js";
import { materialService } from "./material.js";
import {
  HIGH_SIMILARITY_THRESHOLD,
  questionStemSimilarity,
} from "../../src/lib/question-similarity.js";

const OMITTED_CONTENT = "略";

function normalizeQuestionField(value: string | undefined, missingMarkers: string[] = []): string {
  const normalized = value?.trim() || "";
  return normalized && !missingMarkers.includes(normalized) ? normalized : OMITTED_CONTENT;
}

function mergeTextField(
  existingValue: string | undefined,
  incomingValue: string | undefined,
  choice: DuplicateQuestionFieldChoice,
  secondLabel: string,
): string {
  const existing = existingValue?.trim() || "";
  const incoming = incomingValue?.trim() || "";
  if (choice === "existing") return existing || OMITTED_CONTENT;
  if (choice === "incoming") return incoming || OMITTED_CONTENT;
  if (!existing) return incoming || OMITTED_CONTENT;
  if (!incoming || existing === incoming) return existing;
  return `${existingValue}\n\n${secondLabel}：${incomingValue}`;
}

function validateMergeFields(fields: DuplicateQuestionMergeFields | undefined): DuplicateQuestionMergeFields {
  if (!fields) throw new Error("重题合并字段未选择完整");
  if (!["existing", "incoming"].includes(fields.stem)) {
    throw new Error("题干只能选择库中题或上传题");
  }
  for (const key of ["answer", "analysis", "summary"] as const) {
    if (!["existing", "incoming", "both"].includes(fields[key])) {
      throw new Error(`${key} 至少需要保留一侧内容`);
    }
  }
  return fields;
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
    questionSourceType?: string,
    questionCategory?: string,
  ): Promise<{
    createdQuestions: Question[];
    mergedQuestions: Question[];
    createdMaterials: Material[];
    questionIdByItemId: Record<string, string>;
    materialIdByItemId: Record<string, string>;
  }> {
    for (const item of items.questions) {
      if (item.duplicateAction === "merge" || (item.status === "duplicate" && item.duplicateOf)) {
        continue;
      }
      if (!item.stem.trim()) throw new Error("题干不能为空");
      if (item.duplicateAction === "add" || item.status === "confirmed") continue;
      const existingCandidate = (
        await questionService.findSimilarQuestions(item.stem, schoolId)
      )[0];
      if (existingCandidate) throw createDuplicateConfirmationError(existingCandidate);
    }

    const createdQuestions: Question[] = [];
    const mergedQuestions: Question[] = [];
    const createdMaterials: Material[] = [];
    const questionIdByItemId: Record<string, string> = {};
    const materialIdByItemId: Record<string, string> = {};
    // Duplicate review compares uploads with the library before this loop starts.
    // Do not let writes from the same reviewed batch become new library conflicts.
    const mutatedQuestionIds = new Set<string>();

    for (const item of items.questions) {
      if (item.duplicateAction === "merge") {
        if (!item.duplicateTargetId) throw new Error("未指定要合并的库中题目");
        const target = await questionService.getQuestion(item.duplicateTargetId);
        if (!target) throw new Error("要合并的库中题目不存在");
        if (target.teacherId !== teacherId || target.schoolId !== schoolId) {
          throw new Error("只能将上传题合并到自己的题目");
        }
        if (questionStemSimilarity(item.stem, target.stem) < HIGH_SIMILARITY_THRESHOLD) {
          throw new Error("题目相似度不足，不能执行合并");
        }
        const fields = validateMergeFields(item.duplicateFields);
        const updated = await questionService.updateQuestion(
          target.id,
          {
            stem: fields.stem === "incoming" ? item.stem : target.stem,
            options: fields.stem === "incoming" ? item.options : target.options,
            answer: mergeTextField(target.answer, item.answer, fields.answer, "答案2"),
            analysis: mergeTextField(target.analysis, item.analysis, fields.analysis, "解析2"),
            summary: mergeTextField(target.summary, item.summary, fields.summary, "总结2"),
          },
          "add",
        );
        mergedQuestions.push(updated);
        mutatedQuestionIds.add(updated.id);
        questionIdByItemId[item.id] = updated.id;
        continue;
      }
      if (item.status === "duplicate" && item.duplicateOf) {
        questionIdByItemId[item.id] = item.duplicateOf.id;
        continue;
      }
      if (!item.stem.trim()) throw new Error("题干不能为空");
      const answer = normalizeQuestionField(item.answer, ["待教师补充"]);
      const analysis = normalizeQuestionField(item.analysis, ["待教师补充解析"]);
      const summary = normalizeQuestionField(item.summary);
      const created = await questionService.createQuestion(
        teacherId,
        schoolId,
        {
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
          sourceType: questionSourceType,
          category: questionCategory,
          difficulty: item.difficulty as 1 | 2 | 3 | 4 | 5,
          recommendation: 3,
          duplicateDecision:
            item.duplicateAction === "add" || item.status === "confirmed" ? "add" : undefined,
        },
        Array.from(mutatedQuestionIds),
      );
      createdQuestions.push(created);
      mutatedQuestionIds.add(created.id);
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
      mergedQuestions,
      createdMaterials,
      questionIdByItemId,
      materialIdByItemId,
    };
  },
};
