import { rpcCall } from "./api";
import type {
  HomeworkAttitudeKeyword,
  HomeworkAttitudeRecord,
  HomeworkKnowledgeRecord,
  HomeworkKnowledgeStatus,
} from "@/types";

export const homeworkRecordService = {
  async listPinnedKnowledgePointIds(): Promise<string[]> {
    return rpcCall("homeworkRecord", "listPinnedKnowledgePointIds", []) as any;
  },

  async setPinnedKnowledgePointIds(knowledgePointIds: string[]): Promise<string[]> {
    return rpcCall("homeworkRecord", "setPinnedKnowledgePointIds", [knowledgePointIds]) as any;
  },

  async listByStudent(studentId: string): Promise<HomeworkKnowledgeRecord[]> {
    return rpcCall("homeworkRecord", "listByStudent", [studentId]) as any;
  },

  async getAttitudeByStudent(studentId: string): Promise<HomeworkAttitudeRecord | null> {
    return rpcCall("homeworkRecord", "getAttitudeByStudent", [studentId]) as any;
  },

  async setAttitudeKeywords(input: {
    studentId: string;
    keywords: HomeworkAttitudeKeyword[];
  }): Promise<HomeworkAttitudeRecord | null> {
    return rpcCall("homeworkRecord", "setAttitudeKeywords", [input]) as any;
  },

  async setRecord(input: {
    studentId: string;
    knowledgePointId: string;
    status: HomeworkKnowledgeStatus | null;
  }): Promise<HomeworkKnowledgeRecord | null> {
    return rpcCall("homeworkRecord", "setRecord", [input]) as any;
  },
};
