import { rpcCall } from "./api";

import type { Question, QuestionFilter, QuestionType, QuestionRemark, ResourceSemester } from "@/types";

export interface QuestionInput {
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis: string;
  summary?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
  remark?: string;
  isShared?: boolean;
}

export const questionService = {
  async listQuestions(filter: QuestionFilter = {}): Promise<Question[]> {
    return rpcCall("question", "listQuestions", [filter]) as any;
  },

  async getQuestion(id: string): Promise<Question | null> {
    return rpcCall("question", "getQuestion", [id]) as any;
  },

  async checkDuplicate(stem: string, answer: string, options?: string[], schoolId?: string): Promise<Question[]> {
    return rpcCall("question", "checkDuplicate", [stem, answer, options, schoolId]) as any;
  },

  async createQuestion(teacherId: string, schoolId: string, input: QuestionInput): Promise<Question> {
    return rpcCall("question", "createQuestion", [teacherId, schoolId, input]) as any;
  },

  async updateQuestion(id: string, patch: Partial<Question>): Promise<Question> {
    return rpcCall("question", "updateQuestion", [id, patch]) as any;
  },

  async deleteQuestion(id: string): Promise<void> {
    return rpcCall("question", "deleteQuestion", [id]) as any;
  },

  async addRemark(questionId: string, content: string): Promise<QuestionRemark> {
    return rpcCall("question", "addRemark", [questionId, content]) as any;
  },

  async updateRemark(questionId: string, remarkId: string, content: string): Promise<QuestionRemark> {
    return rpcCall("question", "updateRemark", [questionId, remarkId, content]) as any;
  },

  async deleteRemark(questionId: string, remarkId: string): Promise<void> {
    return rpcCall("question", "deleteRemark", [questionId, remarkId]) as any;
  },

  async batchImport(teacherId: string, schoolId: string, questions: QuestionInput[]): Promise<Question[]> {
    return rpcCall("question", "batchImport", [teacherId, schoolId, questions]) as any;
  },

  async incrementUsage(questionId: string): Promise<void> {
    return rpcCall("question", "incrementUsage", [questionId]) as any;
  }
};
