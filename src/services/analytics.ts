import { rpcCall } from "./api";

import type { AnswerRecord, AnswerScore, AnswerSource, Question, Student, TreeNode } from "@/types";

export interface KnowledgeMastery {
  knowledgePointId: string;
  knowledgePointName: string;
  chapterName: string;
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  correctRate: number;
  masteryLevel: "mastered" | "basic" | "weak" | "untrained";
}

export interface StudentAnswerDetail {
  record: AnswerRecord;
  question: Question | null;
  lectureTitle?: string;
}

export interface DateRange {
  start?: string;
  end?: string;
}

export interface QuestionStat {
  question: Question;
  answerCount: number;
  correctRate: number;
  studentIds: string[];
}

export interface StudentStat {
  student: Student;
  answerCount: number;
  correctRate: number;
}

export function inferScore(record: AnswerRecord): AnswerScore {
  if (record.score) return record.score;
  return record.isCorrect ? "correct" : "wrong";
}

export const analyticsService = {
  async listAnswerRecordsByQuestion(questionId: string, range?: DateRange): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "listAnswerRecordsByQuestion", [questionId, range]) as any;
  },

  async listAnswerRecordsByStudent(studentId: string, range?: DateRange): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "listAnswerRecordsByStudent", [studentId, range]) as any;
  },

  async listAnswerRecordsByLecture(lectureId: string, range?: DateRange): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "listAnswerRecordsByLecture", [lectureId, range]) as any;
  },

  async listAnswerRecordsByStudents(studentIds: string[], range?: DateRange): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "listAnswerRecordsByStudents", [studentIds, range]) as any;
  },

  async listAllAnswerRecordsByQuestion(questionId: string): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "listAllAnswerRecordsByQuestion", [questionId]) as any;
  },

  async saveAnswerRecord(input: {
    studentId: string;
    questionId: string;
    lectureId: string;
    score?: AnswerScore | null;
    source?: AnswerSource;
  }): Promise<AnswerRecord | null> {
    return rpcCall("analytics", "saveAnswerRecord", [input]) as any;
  },

  async batchSaveAnswerRecords(items: Array<{
    studentId: string;
    questionId: string;
    lectureId: string;
    score: AnswerScore;
    source?: AnswerSource;
  }>): Promise<AnswerRecord[]> {
    return rpcCall("analytics", "batchSaveAnswerRecords", [items]) as any;
  },

  async getAnsweredQuestionIds(studentIds: string[], range?: DateRange): Promise<Set<string>> {
    return rpcCall("analytics", "getAnsweredQuestionIds", [studentIds, range]) as any;
  },

  async getQuestionWeaknessScore(schoolId: string, studentIds: string[], range?: DateRange): Promise<Map<string, number>> {
    return rpcCall("analytics", "getQuestionWeaknessScore", [schoolId, studentIds, range]) as any;
  },

  async annotateTreeWithStudentProgress(tree: TreeNode, studentIds: string[], type: "chapter" | "knowledge", range?: DateRange): Promise<TreeNode> {
    return rpcCall("analytics", "annotateTreeWithStudentProgress", [tree, studentIds, type, range]) as any;
  },

  async getQuestionStats(schoolId: string, range?: DateRange): Promise<QuestionStat[]> {
    return rpcCall("analytics", "getQuestionStats", [schoolId, range]) as any;
  },

  async getStudentStats(schoolId: string, range?: DateRange): Promise<StudentStat[]> {
    return rpcCall("analytics", "getStudentStats", [schoolId, range]) as any;
  },

  async getKnowledgeMastery(studentIds: string[], schoolId: string, range?: DateRange): Promise<KnowledgeMastery[]> {
    return rpcCall("analytics", "getKnowledgeMastery", [studentIds, schoolId, range]) as any;
  },

  async getSameGradeTypeAverage(classId: string, schoolId: string, range?: DateRange): Promise<KnowledgeMastery[]> {
    return rpcCall("analytics", "getSameGradeTypeAverage", [classId, schoolId, range]) as any;
  },

  async getPrevGradeBestClass(classId: string, schoolId: string, range?: DateRange): Promise<{ mastery: KnowledgeMastery[]; className: string } | null> {
    return rpcCall("analytics", "getPrevGradeBestClass", [classId, schoolId, range]) as any;
  },

  async getClassAverageMastery(classId: string, schoolId: string, range?: DateRange): Promise<KnowledgeMastery[]> {
    return rpcCall("analytics", "getClassAverageMastery", [classId, schoolId, range]) as any;
  },

  async getStudentAnswerDetails(studentIds: string[], range?: DateRange): Promise<StudentAnswerDetail[]> {
    return rpcCall("analytics", "getStudentAnswerDetails", [studentIds, range]) as any;
  }
};
