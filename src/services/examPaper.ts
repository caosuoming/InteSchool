import { rpcCall } from "./api";

import type {
  ExamPaper,
  ExamPaperQuestion,
  ResourceFilter,
  ResourceSemester,
} from "@/types";

export interface ExamPaperInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  duration: number;
  totalScore: number;
  questions: ExamPaperQuestion[];
  typeId?: string;
  status?: "draft" | "published";
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
}

export const examPaperService = {
  async listPapers(filter: ResourceFilter = {}): Promise<ExamPaper[]> {
    return rpcCall("examPaper", "listPapers", [filter]) as any;
  },

  async getPaper(id: string): Promise<ExamPaper | null> {
    return rpcCall("examPaper", "getPaper", [id]) as any;
  },

  async createPaper(teacherId: string, schoolId: string, input: ExamPaperInput): Promise<ExamPaper> {
    return rpcCall("examPaper", "createPaper", [teacherId, schoolId, input]) as any;
  },

  async updatePaper(id: string, patch: Partial<ExamPaper>): Promise<ExamPaper> {
    return rpcCall("examPaper", "updatePaper", [id, patch]) as any;
  },

  async deletePaper(id: string): Promise<void> {
    return rpcCall("examPaper", "deletePaper", [id]) as any;
  },

  async duplicatePaper(sourceId: string, newTitle?: string): Promise<ExamPaper> {
    return rpcCall("examPaper", "duplicatePaper", [sourceId, newTitle]) as any;
  },

  async extractToQuestionBank(paperId: string): Promise<string[]> {
    return rpcCall("examPaper", "extractToQuestionBank", [paperId]) as any;
  },

  async createExtractCopy(sourceId: string): Promise<ExamPaper> {
    return rpcCall("examPaper", "createExtractCopy", [sourceId]) as any;
  },

  async getExtractCopy(sourceId: string): Promise<ExamPaper | null> {
    return rpcCall("examPaper", "getExtractCopy", [sourceId]) as any;
  },

  async convertToLecture(paperId: string): Promise<{ lectureId: string }> {
    return rpcCall("examPaper", "convertToLecture", [paperId]) as any;
  }
};
