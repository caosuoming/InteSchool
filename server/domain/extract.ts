import { questionCategories } from "../../src/lib/question-category-detection.js";
import type {
  DuplicateQuestionFieldChoice,
  DuplicateQuestionMergeFields,
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  Question,
  Material,
  ResourceSemester,
  ExtractedDocumentBlock,
} from "../../src/types/index.js";
import {
  createDuplicateConfirmationError,
  questionService,
  createVerifiedExtractQuestions,
} from "./question.js";
import { materialService } from "./material.js";
import { lectureService } from "./lecture.js";
import { examPaperService } from "./examPaper.js";
import { db } from "../runtime-db.js";
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
    sourceResourceType?: "examPaper" | "lecture",
    contentBlocks?: ExtractedDocumentBlock[],
  ): Promise<{
    createdQuestions: Question[];
    mergedQuestions: Question[];
    createdMaterials: Material[];
    questionIdByItemId: Record<string, string>;
    materialIdByItemId: Record<string, string>;
  }> {
    if (contentBlocks) {
      if (sourceResourceType !== "examPaper" && sourceResourceType !== "lecture") {
        throw new Error("文档类型不合法");
      }
      const collection = sourceResourceType === "examPaper" ? "examPapers" : "lectures";
      const source = (db.read(collection) || []).find((entry: { id: string }) => entry.id === sourceResourceId);
      if (!source || source.teacherId !== teacherId || source.schoolId !== schoolId) {
        throw new Error("源文档不存在或无权操作");
      }
      if ((db.read(collection) || []).some((entry: { sourceResourceId?: string; isExtractCopy?: boolean }) =>
        entry.isExtractCopy && entry.sourceResourceId === sourceResourceId)) {
        throw new Error("该文档已入库，请刷新后查看拆解副本");
      }
    }

    // Resolve all unreviewed items against a single library snapshot before
    // mutating anything. The RPC transaction persists only on full success.
    const unresolved = items.questions.filter((item) =>
      item.duplicateAction !== "merge"
      && !(item.status === "duplicate" && item.duplicateOf)
      && item.duplicateAction !== "add"
      && item.status !== "confirmed",
    );
    for (const item of items.questions) {
      if (item.duplicateAction !== "merge" && !(item.status === "duplicate" && item.duplicateOf) && !item.stem.trim()) {
        throw new Error("题干不能为空");
      }
    }
    const candidates = await questionService.findSimilarQuestionsBatch(
      unresolved.map((item) => item.stem), schoolId,
    );
    for (const matches of candidates) {
      if (matches[0]) throw createDuplicateConfirmationError(matches[0]);
    }

    const createdQuestions: Question[] = [];
    const mergedQuestions: Question[] = [];
    const createdMaterials: Material[] = [];
    const questionIdByItemId: Record<string, string> = {};
    const materialIdByItemId: Record<string, string> = {};
    const newQuestionItems: ExtractedQuestionItem[] = [];

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
            categories: [...new Set([...questionCategories(target), ...(item.categories || [])])],
          },
          "add",
        );
        mergedQuestions.push(updated);
        questionIdByItemId[item.id] = updated.id;
        continue;
      }
      if (item.status === "duplicate" && item.duplicateOf) {
        questionIdByItemId[item.id] = item.duplicateOf.id;
        continue;
      }
      if (!item.stem.trim()) throw new Error("题干不能为空");
      newQuestionItems.push(item);
    }

    const newQuestions = createVerifiedExtractQuestions(
      teacherId,
      schoolId,
      newQuestionItems.map((item) => {
        const answer = normalizeQuestionField(item.answer, ["待教师补充"]);
        const analysis = normalizeQuestionField(item.analysis, ["待教师补充解析"]);
        const summary = normalizeQuestionField(item.summary);
        return {
          type: item.type,
          stem: item.stem,
          options: item.options,
          answer,
          analysis,
          summary,
          chapterIds: [],
          knowledgePointIds: [],
          grade,
          schoolYear,
          semester,
          sourceType: questionSourceType,
          category: questionCategory,
          categories: [...new Set([questionCategory, ...(item.categories || [])].filter((value): value is string => Boolean(value)))],
          difficulty: item.difficulty as 1 | 2 | 3 | 4 | 5,
          recommendation: 3,
        };
      }),
    );
    newQuestions.forEach((created, index) => {
      createdQuestions.push(created);
      questionIdByItemId[newQuestionItems[index].id] = created.id;
    });

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

    if (contentBlocks && sourceResourceType) {
      const linkedBlocks = contentBlocks.map((block) => ({
        ...block,
        ...(block.type === "question" ? { questionId: questionIdByItemId[block.id] } : {}),
        ...(block.type === "knowledge" ? { materialId: materialIdByItemId[block.id] } : {}),
      }));
      if (sourceResourceType === "examPaper") {
        await examPaperService.createExtractCopy(sourceResourceId, linkedBlocks);
      } else {
        await lectureService.createExtractCopy(sourceResourceId, linkedBlocks);
      }
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
