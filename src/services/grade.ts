import { rpcCall } from "./api";
import type {
  GradeCohort,
  GradeExam,
  GradeExamImportInput,
  GradeExamSettings,
  GradeImportContext,
  GradeStatisticsTemplate,
  GradeTemplateProfile,
} from "@/types";

export const gradeService = {
  async listCohorts(schoolId: string): Promise<GradeCohort[]> {
    return rpcCall("grade", "listCohorts", [schoolId]) as Promise<GradeCohort[]>;
  },

  async getImportContext(schoolId: string, cohortKey: string): Promise<GradeImportContext> {
    return rpcCall("grade", "getImportContext", [schoolId, cohortKey]) as Promise<GradeImportContext>;
  },

  async getCohortTemplateProfile(schoolId: string, cohortKey: string): Promise<GradeTemplateProfile | null> {
    return rpcCall("grade", "getCohortTemplateProfile", [schoolId, cohortKey]) as Promise<GradeTemplateProfile | null>;
  },

  async saveCohortTemplateProfile(
    schoolId: string,
    cohortKey: string,
    teacherId: string,
    subjects: string[],
    templates: GradeStatisticsTemplate[],
  ): Promise<GradeTemplateProfile> {
    return rpcCall("grade", "saveCohortTemplateProfile", [
      schoolId,
      cohortKey,
      teacherId,
      subjects,
      templates,
    ]) as Promise<GradeTemplateProfile>;
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
