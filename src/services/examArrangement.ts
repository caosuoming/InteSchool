import { rpcCall } from "./api";
import type {
  ExamArrangement,
  ExamArrangementContext,
  ExamArrangementInput,
  ExamInvigilationConfig,
  ExamInvigilationProfile,
  GradeCohort,
} from "@/types";

export const examArrangementService = {
  async listCohorts(schoolId: string): Promise<GradeCohort[]> {
    return rpcCall("examArrangement", "listCohorts", [schoolId]) as Promise<GradeCohort[]>;
  },

  async getContext(schoolId: string, cohortKey: string): Promise<ExamArrangementContext> {
    return rpcCall("examArrangement", "getContext", [schoolId, cohortKey]) as Promise<ExamArrangementContext>;
  },

  async getInvigilationProfile(schoolId: string, cohortKey: string): Promise<ExamInvigilationProfile | null> {
    return rpcCall("examArrangement", "getInvigilationProfile", [schoolId, cohortKey]) as Promise<ExamInvigilationProfile | null>;
  },

  async listArrangements(schoolId: string, cohortKey?: string): Promise<ExamArrangement[]> {
    return rpcCall("examArrangement", "listArrangements", [schoolId, cohortKey]) as Promise<ExamArrangement[]>;
  },

  async saveArrangement(
    schoolId: string,
    teacherId: string,
    input: ExamArrangementInput,
  ): Promise<ExamArrangement> {
    return rpcCall("examArrangement", "saveArrangement", [schoolId, teacherId, input]) as Promise<ExamArrangement>;
  },

  async saveInvigilationConfig(
    schoolId: string,
    arrangementId: string,
    config: ExamInvigilationConfig,
  ): Promise<ExamArrangement> {
    return rpcCall("examArrangement", "saveInvigilationConfig", [schoolId, arrangementId, config]) as Promise<ExamArrangement>;
  },

  async deleteInvigilationConfig(arrangementId: string): Promise<void> {
    return rpcCall("examArrangement", "deleteInvigilationConfig", [arrangementId]) as Promise<void>;
  },

  async listInvigilationRecycleBin(schoolId: string): Promise<ExamArrangement[]> {
    return rpcCall("examArrangement", "listInvigilationRecycleBin", [schoolId]) as Promise<ExamArrangement[]>;
  },

  async restoreInvigilationConfig(arrangementId: string): Promise<ExamArrangement> {
    return rpcCall("examArrangement", "restoreInvigilationConfig", [arrangementId]) as Promise<ExamArrangement>;
  },

  async deleteArrangement(arrangementId: string): Promise<void> {
    return rpcCall("examArrangement", "deleteArrangement", [arrangementId]) as Promise<void>;
  },

  async listArrangementRecycleBin(schoolId: string): Promise<ExamArrangement[]> {
    return rpcCall("examArrangement", "listArrangementRecycleBin", [schoolId]) as Promise<ExamArrangement[]>;
  },

  async restoreArrangement(arrangementId: string): Promise<ExamArrangement> {
    return rpcCall("examArrangement", "restoreArrangement", [arrangementId]) as Promise<ExamArrangement>;
  },
};
