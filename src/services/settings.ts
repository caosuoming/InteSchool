import { rpcCall } from "./api";

import type { SchoolSetting, ClassTypeCategory, ExamPaperType, LectureType, ExamPaperFormat, LectureFormat } from "@/types";

type SettingType = SchoolSetting["type"];

interface CreateSettingData {
  type: SettingType;
  name: string;
  value: string;
  sortOrder?: number;
  enabled?: boolean;
}

interface UpdateSettingData {
  name?: string;
  value?: string;
  sortOrder?: number;
  enabled?: boolean;
}

interface CreateClassTypeData {
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  enabled?: boolean;
}

interface UpdateClassTypeData {
  name?: string;
  description?: string;
  color?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export const settingsService = {
  async listSettings(schoolId: string, type?: SettingType): Promise<SchoolSetting[]> {
    return rpcCall("settings", "listSettings", [schoolId, type]) as any;
  },

  async createSetting(schoolId: string, data: CreateSettingData): Promise<SchoolSetting> {
    return rpcCall("settings", "createSetting", [schoolId, data]) as any;
  },

  async updateSetting(id: string, patch: UpdateSettingData): Promise<SchoolSetting> {
    return rpcCall("settings", "updateSetting", [id, patch]) as any;
  },

  async deleteSetting(id: string): Promise<void> {
    return rpcCall("settings", "deleteSetting", [id]) as any;
  },

  async toggleSetting(id: string): Promise<SchoolSetting> {
    return rpcCall("settings", "toggleSetting", [id]) as any;
  },

  async batchUpdateSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    return rpcCall("settings", "batchUpdateSortOrder", [items]) as any;
  },

  async listClassTypes(schoolId: string): Promise<ClassTypeCategory[]> {
    return rpcCall("settings", "listClassTypes", [schoolId]) as any;
  },

  async createClassType(schoolId: string, data: CreateClassTypeData): Promise<ClassTypeCategory> {
    return rpcCall("settings", "createClassType", [schoolId, data]) as any;
  },

  async updateClassType(id: string, patch: UpdateClassTypeData): Promise<ClassTypeCategory> {
    return rpcCall("settings", "updateClassType", [id, patch]) as any;
  },

  async deleteClassType(id: string): Promise<void> {
    return rpcCall("settings", "deleteClassType", [id]) as any;
  },

  async toggleClassType(id: string): Promise<ClassTypeCategory> {
    return rpcCall("settings", "toggleClassType", [id]) as any;
  },

  async batchUpdateClassTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    return rpcCall("settings", "batchUpdateClassTypeSortOrder", [items]) as any;
  },

  async listExamPaperTypes(schoolId: string): Promise<ExamPaperType[]> {
    return rpcCall("settings", "listExamPaperTypes", [schoolId]) as any;
  },

  async createExamPaperType(schoolId: string, data: { name: string; description?: string; parentId?: string | null; format: ExamPaperFormat; sortOrder?: number; enabled?: boolean }): Promise<ExamPaperType> {
    return rpcCall("settings", "createExamPaperType", [schoolId, data]) as any;
  },

  async updateExamPaperType(id: string, patch: Partial<ExamPaperType>): Promise<ExamPaperType> {
    return rpcCall("settings", "updateExamPaperType", [id, patch]) as any;
  },

  async deleteExamPaperType(id: string): Promise<void> {
    return rpcCall("settings", "deleteExamPaperType", [id]) as any;
  },

  async toggleExamPaperType(id: string): Promise<ExamPaperType> {
    return rpcCall("settings", "toggleExamPaperType", [id]) as any;
  },

  async batchUpdateExamPaperTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    return rpcCall("settings", "batchUpdateExamPaperTypeSortOrder", [items]) as any;
  },

  async listLectureTypes(schoolId: string): Promise<LectureType[]> {
    return rpcCall("settings", "listLectureTypes", [schoolId]) as any;
  },

  async createLectureType(schoolId: string, data: { name: string; description?: string; parentId?: string | null; format: LectureFormat; sortOrder?: number; enabled?: boolean }): Promise<LectureType> {
    return rpcCall("settings", "createLectureType", [schoolId, data]) as any;
  },

  async updateLectureType(id: string, patch: Partial<LectureType>): Promise<LectureType> {
    return rpcCall("settings", "updateLectureType", [id, patch]) as any;
  },

  async deleteLectureType(id: string): Promise<void> {
    return rpcCall("settings", "deleteLectureType", [id]) as any;
  },

  async toggleLectureType(id: string): Promise<LectureType> {
    return rpcCall("settings", "toggleLectureType", [id]) as any;
  },

  async batchUpdateLectureTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    return rpcCall("settings", "batchUpdateLectureTypeSortOrder", [items]) as any;
  }
};
