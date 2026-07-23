import type {
  ExtractResult,
  ExtractedQuestionItem,
  ExtractedKnowledgeItem,
  QuestionType,
  Question,
  Material,
} from "@/types";
import { delay, genId } from "./_shared";
import { questionService } from "./question";
import { materialService } from "./material";

// ============ Mock 数据生成 ============

function generateMockQuestions(): Array<{
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  difficulty: number;
}> {
  return [
    {
      type: "single",
      stem: "已知集合 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∩ B =",
      options: ["{1}", "{2, 3}", "{2, 3, 4}", "{1, 2, 3, 4}"],
      answer: "B",
      analysis: "集合 A 与 B 的交集为两个集合的共同元素，即 {2, 3}。",
      summary: "",
      difficulty: 2,
    },
    {
      type: "multiple",
      stem: "下列函数中，在定义域内单调递增的是（多选）",
      options: ["y = 2x + 1", "y = -x²", "y = log₂x", "y = (1/2)ˣ"],
      answer: "AC",
      analysis: "y=2x+1 斜率为正单调递增；y=log₂x 在定义域内单调递增。",
      summary: "",
      difficulty: 3,
    },
    {
      type: "judge",
      stem: "函数 y = √(x-1) 的定义域为 [1, +∞)。",
      answer: "正确",
      analysis: "要使根号内非负，需 x-1 ≥ 0，即 x ≥ 1，故定义域为 [1, +∞)。",
      summary: "",
      difficulty: 2,
    },
    {
      type: "short",
      stem: "设集合 A = {x | 0 < x < 2}，B = {x | 1 ≤ x ≤ 3}，则 A ∩ B = ___",
      answer: "[1, 2)",
      analysis: "A ∩ B 即两集合的交集，x 同时满足 0<x<2 和 1≤x≤3，得 1≤x<2。",
      summary: "",
      difficulty: 3,
    },
    {
      type: "essay",
      stem: "已知集合 A = {x | x² - 3x + 2 = 0}，B = {x | x² - mx + 1 = 0}，若 B ⊆ A，求 m 的取值范围。",
      answer: "m ∈ [-2, 2]",
      analysis: "A = {1, 2}。B ⊆ A 分情况讨论：B=∅、B={1}、B={2}、B={1,2}，分别求解后取并集。",
      summary: "",
      difficulty: 4,
    },
  ];
}

function generateMockKnowledgeBlocks(): Array<{
  title: string;
  content: string;
}> {
  return [
    {
      title: "集合的基本概念",
      content: "集合是由确定的对象组成的整体。集合中的对象称为元素。集合具有确定性、互异性、无序性三个特征。",
    },
    {
      title: "交集与并集",
      content: "交集：A ∩ B = {x | x ∈ A 且 x ∈ B}。并集：A ∪ B = {x | x ∈ A 或 x ∈ B}。交集取共同元素，并集取所有元素。",
    },
    {
      title: "子集与真子集",
      content: "若集合A的所有元素都属于B，则称A是B的子集，记作A⊆B。若A⊆B且A≠B，则称A是B的真子集，记作A⊂B。",
    },
  ];
}

// ============ AI 拆解服务 ============

export const extractService = {
  /**
   * AI 拆解：识别文档中的题目和知识块，并进行查重
   */
  async extract(
    resourceId: string,
    resourceType: "examPaper" | "lecture",
    schoolId: string,
    onProgress?: (progress: number) => void,
  ): Promise<ExtractResult> {
    await delay(500);
    const mockQuestions = generateMockQuestions();
    const mockBlocks = generateMockKnowledgeBlocks();

    const questions: ExtractedQuestionItem[] = [];
    const knowledgeBlocks: ExtractedKnowledgeItem[] = [];

    const total = mockQuestions.length + mockBlocks.length;
    let done = 0;

    for (const q of mockQuestions) {
      const existing = await questionService.checkDuplicate(
        q.stem, q.answer, q.options, schoolId,
      );
      done++;
      onProgress?.(Math.round((done / total) * 100));

      if (existing.length > 0) {
        questions.push({
          id: `ext-q-${genId("ext")}`,
          type: q.type,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
          summary: q.summary,
          difficulty: q.difficulty,
          status: "duplicate",
          duplicateOf: existing[0],
        });
      } else {
        questions.push({
          id: `ext-q-${genId("ext")}`,
          type: q.type,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
          summary: q.summary,
          difficulty: q.difficulty,
          status: "new",
        });
      }
    }

    for (const b of mockBlocks) {
      const existing = await materialService.checkKnowledgeBlockDuplicate(
        b.title, b.content, schoolId,
      );
      done++;
      onProgress?.(Math.round((done / total) * 100));

      if (existing.length > 0) {
        knowledgeBlocks.push({
          id: `ext-k-${genId("ext")}`,
          title: b.title,
          content: b.content,
          status: "duplicate",
          duplicateOf: existing[0],
        });
      } else {
        knowledgeBlocks.push({
          id: `ext-k-${genId("ext")}`,
          title: b.title,
          content: b.content,
          status: "new",
        });
      }
    }

    return { questions, knowledgeBlocks };
  },

  /**
   * 确认入库：将审阅后的题目和知识块保存到题库和素材库
   */
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
    sourceResourceId: string,
  ): Promise<{ createdQuestions: Question[]; createdMaterials: Material[] }> {
    await delay(400);
    const createdQuestions: Question[] = [];
    const createdMaterials: Material[] = [];

    for (const q of items.questions) {
      if (q.status === "duplicate" && q.duplicateOf) continue;
      const created = await questionService.createQuestion(
        teacherId, schoolId, {
          type: q.type,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          analysis: q.analysis,
          summary: q.summary || "",
          chapterIds,
          knowledgePointIds,
          difficulty: q.difficulty as 1 | 2 | 3 | 4 | 5,
          recommendation: 3,
        },
      );
      createdQuestions.push(created);
    }

    for (const k of items.knowledgeBlocks) {
      if (k.status === "duplicate" && k.duplicateOf) continue;
      const created = await materialService.createMaterial(
        teacherId, schoolId, {
          title: k.title,
          chapterIds,
          knowledgePointIds,
          grade,
          schoolYear,
          type: "knowledgeBlock",
          content: k.content,
          tags: [],
        },
      );
      // 标记源资源ID
      await materialService.updateMaterial(created.id, { sourceResourceId });
      createdMaterials.push(created);
    }

    return { createdQuestions, createdMaterials };
  },
};
