import { rpcCall } from "./api";

import type {
  SchoolResourceBackup,
  SchoolBackupResourceType,
  Teacher,
  ResourceSemester,
} from "@/types";

export interface BackupInput {
  schoolId: string;
  resourceType: SchoolBackupResourceType;
  sourceResourceId: string;
  title: string;
  description?: string;
  contentSnapshot: string;
  fromTeacherId: string;
  backupReason: string;
  targetClassIds: string[];
  targetStudentIds?: string[];
  chapterIds: string[];
  knowledgePointIds: string[];
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  meta?: Record<string, string>;
  duplicateHash?: string;
}

export function canEditSchoolBackup(teacher: Teacher | null | undefined): boolean {
  if (!teacher) return false;
  if (teacher.role === "school_admin" || teacher.role === "platform_admin") return true;
  return teacher.roles.some((role) => [
    "prepLeader",
    "subjectLeader",
    "gradeLeader",
    "dean",
    "principal",
  ].includes(role));
}

export const schoolBackupService = {
  async createBackup(input: BackupInput): Promise<SchoolResourceBackup> {
    return rpcCall("schoolBackup", "createBackup", [input]) as any;
  },

  async listBackups(schoolId: string): Promise<SchoolResourceBackup[]> {
    return rpcCall("schoolBackup", "listBackups", [schoolId]) as any;
  },

  async getBackup(id: string): Promise<SchoolResourceBackup | null> {
    return rpcCall("schoolBackup", "getBackup", [id]) as any;
  },

  async getChapterTree(schoolId: string) {
    return rpcCall("schoolBackup", "getChapterTree", [schoolId]) as any;
  },

  async getKnowledgeTree(schoolId: string) {
    return rpcCall("schoolBackup", "getKnowledgeTree", [schoolId]) as any;
  },

  async updateBackupProperties(id: string, patch: Partial<Pick<SchoolResourceBackup,
      "title" | "description" | "chapterIds" | "knowledgePointIds" | "grade" | "schoolYear" | "semester">>, teacher: Teacher): Promise<SchoolResourceBackup> {
    return rpcCall("schoolBackup", "updateBackupProperties", [id, patch, teacher]) as any;
  },

  async deleteBackup(id: string, teacher: Teacher): Promise<void> {
    return rpcCall("schoolBackup", "deleteBackup", [id, teacher]) as any;
  },

  async autoBackupForResource(schoolId: string, fromTeacherId: string, resourceType: SchoolBackupResourceType, resourceId: string, targetClassIds: string[], backupReason: string, targetStudentIds: string[] = []): Promise<SchoolResourceBackup | null> {
    return rpcCall("schoolBackup", "autoBackupForResource", [schoolId, fromTeacherId, resourceType, resourceId, targetClassIds, backupReason, targetStudentIds]) as any;
  },

  async saveAsOwnResource(backupId: string, teacher: Teacher): Promise<{ newResourceId: string; resourceType: SchoolBackupResourceType }> {
    return rpcCall("schoolBackup", "saveAsOwnResource", [backupId, teacher]) as any;
  }
};
