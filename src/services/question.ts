import { normalizeLegacyQuestionMeanNotation } from "@/lib/legacy-question-math";
import { rpcCall } from "./api";
import { clearResourceCache } from "@/lib/resource-cache";

import type {
  Question,
  QuestionAdaptationInput,
  QuestionFilter,
  QuestionLink,
  QuestionType,
  QuestionRemark,
  QuestionVideoReference,
  ResourceSemester,
  SimilarQuestionCandidate,
} from "@/types";

export interface QuestionInput {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  board?: string;
  boardImages?: string[];
  links?: QuestionLink[];
  explanationVideo?: QuestionVideoReference | null;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  sourceType?: string;
  category?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
  remark?: string;
  isShared?: boolean;
  duplicateDecision?: "add";
}

export type QuestionSortKey = "usage" | "weakness" | "recommendation" | "newest" | "recentUse";

export interface QuestionPage {
  items: Question[];
  total: number;
}

export const questionService = {
  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    const questions = await rpcCall("question", "listQuestions", [filter]) as Question[];
    return questions.map(normalizeLegacyQuestionMeanNotation);
  },

  async listQuestionPage(
    filter: QuestionFilter = {},
    page = 1,
    pageSize = 20,
    sortKey: QuestionSortKey = "newest",
  ): Promise<QuestionPage> {
    const result = await rpcCall(
      "question",
      "listQuestionPage",
      [filter, page, pageSize, sortKey, null],
    ) as QuestionPage;
    return {
      ...result,
      items: result.items.map(normalizeLegacyQuestionMeanNotation),
    };
  },

  async getQuestion(id: string): Promise<Question | null> {
    const question = await rpcCall("question", "getQuestion", [id]) as Question | null;
    return question ? normalizeLegacyQuestionMeanNotation(question) : null;
  },

  async checkDuplicate(stem: string, answer: string, options?: string[], schoolId?: string): Promise<Question[]> {
    const questions = await rpcCall(
      "question",
      "checkDuplicate",
      [stem, answer, options, schoolId],
    ) as Question[];
    return questions.map(normalizeLegacyQuestionMeanNotation);
  },

  async findSimilarQuestionsBatch(stems: string[], schoolId: string): Promise<SimilarQuestionCandidate[][]> {
    const results = await rpcCall<SimilarQuestionCandidate[][]>(
      "question", "findSimilarQuestionsBatch", [stems, schoolId],
    );
    return results.map((candidates) => candidates.map((candidate) => ({
      ...candidate,
      question: normalizeLegacyQuestionMeanNotation(candidate.question),
    })));
  },

  async findSimilarQuestions(
    stem: string,
    schoolId: string,
    excludeQuestionId?: string,
  ): Promise<SimilarQuestionCandidate[]> {
    const candidates = await rpcCall(
      "question",
      "findSimilarQuestions",
      [stem, schoolId, excludeQuestionId],
    ) as SimilarQuestionCandidate[];
    return candidates.map((candidate) => ({
      ...candidate,
      question: normalizeLegacyQuestionMeanNotation(candidate.question),
    }));
  },

  async createQuestion(teacherId: string, schoolId: string, input: QuestionInput): Promise<Question> {
    const result = await rpcCall<Question>("question", "createQuestion", [teacherId, schoolId, input]);
    clearResourceCache("question");
    return result;
  },

  async adaptQuestion(id: string, input: QuestionAdaptationInput): Promise<Question> {
    const result = await rpcCall<Question>("question", "adaptQuestion", [id, input]);
    clearResourceCache("question");
    return result;
  },

  async updateQuestion(id: string, patch: Partial<Question>, duplicateDecision?: "add"): Promise<Question> {
    const result = await rpcCall<Question>("question", "updateQuestion", [id, patch, duplicateDecision]);
    clearResourceCache("question");
    return result;
  },

  async deleteQuestion(id: string): Promise<void> {
    await rpcCall("question", "deleteQuestion", [id]);
    clearResourceCache("question");
  },

  async addRemark(questionId: string, content: string): Promise<QuestionRemark> {
    const result = await rpcCall<QuestionRemark>("question", "addRemark", [questionId, content]);
    clearResourceCache("question");
    return result;
  },

  async updateRemark(questionId: string, remarkId: string, content: string): Promise<QuestionRemark> {
    const result = await rpcCall<QuestionRemark>("question", "updateRemark", [questionId, remarkId, content]);
    clearResourceCache("question");
    return result;
  },

  async deleteRemark(questionId: string, remarkId: string): Promise<void> {
    await rpcCall("question", "deleteRemark", [questionId, remarkId]);
    clearResourceCache("question");
  },

  async batchImport(teacherId: string, schoolId: string, questions: QuestionInput[]): Promise<Question[]> {
    const result = await rpcCall<Question[]>("question", "batchImport", [teacherId, schoolId, questions]);
    clearResourceCache("question");
    return result;
  },

  async incrementUsage(questionId: string): Promise<void> {
    await rpcCall("question", "incrementUsage", [questionId]);
    clearResourceCache("question");
  }
};
