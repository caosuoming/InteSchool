import { rpcCall } from "./api";
import type {
  HomeworkAttitudeKeyword,
  HomeworkAttitudeRecord,
  HomeworkClassOverviewRecord,
  HomeworkKnowledgeRecord,
  HomeworkKnowledgeStatus,
  StudentMissingHomeworkRecord,
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

  async getAttitudeByStudent(studentId: string, homeworkDate?: string): Promise<HomeworkAttitudeRecord | null> {
    return rpcCall("homeworkRecord", "getAttitudeByStudent", [studentId, homeworkDate]) as any;
  },

  async listAttitudesByStudent(studentId: string): Promise<HomeworkAttitudeRecord[]> {
    return rpcCall("homeworkRecord", "listAttitudesByStudent", [studentId]) as any;
  },

  async getClassOverview(classId: string, homeworkDate: string): Promise<HomeworkClassOverviewRecord | null> {
    return rpcCall("homeworkRecord", "getClassOverview", [classId, homeworkDate]) as any;
  },

  async listClassOverviews(classId: string): Promise<HomeworkClassOverviewRecord[]> {
    return rpcCall("homeworkRecord", "listClassOverviews", [classId]) as any;
  },

  async saveClassOverview(input: {
    classId: string;
    homeworkDate: string;
    summary?: string;
    submittedStudentIds?: string[];
    absentStudentIds?: string[];
    attendanceTaken?: boolean;
  }): Promise<HomeworkClassOverviewRecord> {
    return rpcCall("homeworkRecord", "saveClassOverview", [input]) as any;
  },

  async listMissingByStudent(studentId: string): Promise<StudentMissingHomeworkRecord[]> {
    return rpcCall("homeworkRecord", "listMissingByStudent", [studentId]) as any;
  },

  async setAttitudeKeywords(input: {
    studentId: string;
    homeworkDate?: string;
    keywords: HomeworkAttitudeKeyword[];
  }): Promise<HomeworkAttitudeRecord | null> {
    return rpcCall("homeworkRecord", "setAttitudeKeywords", [input]) as any;
  },

  async setEvaluation(input: {
    studentId: string;
    homeworkDate?: string;
    evaluation: string;
  }): Promise<HomeworkAttitudeRecord | null> {
    return rpcCall("homeworkRecord", "setEvaluation", [input]) as any;
  },

  async setRecord(input: {
    studentId: string;
    knowledgePointId: string;
    status: HomeworkKnowledgeStatus | null;
  }): Promise<HomeworkKnowledgeRecord | null> {
    return rpcCall("homeworkRecord", "setRecord", [input]) as any;
  },
};
