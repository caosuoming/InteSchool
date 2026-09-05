import { rpcCall } from "./api";
import type { HomeworkKnowledgeRecord, HomeworkKnowledgeStatus } from "@/types";

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

  async setRecord(input: {
    studentId: string;
    knowledgePointId: string;
    status: HomeworkKnowledgeStatus | null;
  }): Promise<HomeworkKnowledgeRecord | null> {
    return rpcCall("homeworkRecord", "setRecord", [input]) as any;
  },
};
