import { rpcCall } from "./api";
import type {
  GradeCohort,
  GradeExam,
  GradeExamImportInput,
  GradeExamSettings,
  GradeImportContext,
} from "@/types";

export const gradeService = {
  async listCohorts(schoolId: string): Promise<GradeCohort[]> {
    return rpcCall("grade", "listCohorts", [schoolId]) as Promise<GradeCohort[]>;
  },

  async getImportContext(schoolId: string, cohortKey: string): Promise<GradeImportContext> {
    return rpcCall("grade", "getImportContext", [schoolId, cohortKey]) as Promise<GradeImportContext>;
  },

  async listExams(schoolId: string, cohortKey?: string): Promise<GradeExam[]> {
    return rpcCall("grade", "listExams", [schoolId, cohortKey]) as Promise<GradeExam[]>;
  },

  async getExam(examId: string): Promise<GradeExam | null> {
    return rpcCall("grade", "getExam", [examId]) as Promise<GradeExam | null>;
  },

  async importExam(schoolId: string, teacherId: string, input: GradeExamImportInput): Promise<GradeExam> {
    return rpcCall("grade", "importExam", [schoolId, teacherId, input]) as Promise<GradeExam>;
  },

  async updateExamSettings(examId: string, settings: GradeExamSettings): Promise<GradeExam> {
    return rpcCall("grade", "updateExamSettings", [examId, settings]) as Promise<GradeExam>;
  },

  async deleteExam(examId: string): Promise<void> {
    return rpcCall("grade", "deleteExam", [examId]) as Promise<void>;
  },
};
