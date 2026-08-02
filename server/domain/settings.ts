import type { SchoolSetting, ClassTypeCategory, ExamPaperType, LectureType, ExamPaperFormat, LectureFormat } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";

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

interface CreateExamPaperTypeData {
  name: string;
  description?: string;
  parentId?: string | null;
  format: ExamPaperFormat;
  sortOrder?: number;
  enabled?: boolean;
}

interface CreateLectureTypeData {
  name: string;
  description?: string;
  parentId?: string | null;
  format: LectureFormat;
  sortOrder?: number;
  enabled?: boolean;
}

interface HierarchicalType {
  id: string;
  schoolId: string;
  parentId?: string | null;
  sortOrder: number;
}

function validateParentType<T extends HierarchicalType>(
  types: T[],
  schoolId: string,
  parentId: string | null | undefined,
  currentId?: string,
): string | undefined {
  if (!parentId) return undefined;
  if (parentId === currentId) throw new Error("类型不能将自身设为上级类型");

  const parent = types.find((type) => type.id === parentId && type.schoolId === schoolId);
  if (!parent) throw new Error("上级类型不存在");
  if (parent.parentId) throw new Error("仅支持二级类型，上级类型必须是一级类型");
  return parent.id;
}

function nextSiblingOrder<T extends HierarchicalType>(
  types: T[],
  schoolId: string,
  parentId: string | undefined,
): number {
  return types
    .filter((type) => type.schoolId === schoolId && (type.parentId || undefined) === parentId)
    .reduce((max, type) => Math.max(max, type.sortOrder), 0) + 1;
}

export const settingsService = {
  async listSettings(schoolId: string, type?: SettingType): Promise<SchoolSetting[]> {
    await delay(200);
    const all = db.read("schoolSettings");
    let filtered = all.filter((s) => s.schoolId === schoolId);
    if (type) {
      filtered = filtered.filter((s) => s.type === type);
    }
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createSetting(schoolId: string, data: CreateSettingData): Promise<SchoolSetting> {
    await delay(300);
    const now = new Date().toISOString();
    const all = db.read("schoolSettings");
    const maxOrder = all
      .filter((s) => s.schoolId === schoolId && s.type === data.type)
      .reduce((max, s) => Math.max(max, s.sortOrder), 0);
    const newSetting: SchoolSetting = {
      id: genId("setting"),
      schoolId,
      type: data.type,
      name: data.name,
      value: data.value,
      sortOrder: data.sortOrder ?? maxOrder + 1,
      enabled: data.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    db.update("schoolSettings", (list) => [...list, newSetting]);
    return newSetting;
  },

  async updateSetting(id: string, patch: UpdateSettingData): Promise<SchoolSetting> {
    await delay(250);
    let updated: SchoolSetting | null = null;
    db.update("schoolSettings", (list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        updated = { ...s, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) throw new Error("设置项不存在");
    return updated;
  },

  async deleteSetting(id: string): Promise<void> {
    await delay(200);
    db.update("schoolSettings", (list) => list.filter((s) => s.id !== id));
  },

  async toggleSetting(id: string): Promise<SchoolSetting> {
    await delay(200);
    let updated: SchoolSetting | null = null;
    db.update("schoolSettings", (list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        updated = { ...s, enabled: !s.enabled, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) throw new Error("设置项不存在");
    return updated;
  },

  async batchUpdateSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await delay(200);
    const now = new Date().toISOString();
    const orderMap = new Map(items.map((item) => [item.id, item.sortOrder]));
    db.update("schoolSettings", (list) =>
      list.map((s) => {
        const order = orderMap.get(s.id);
        if (order === undefined) return s;
        return { ...s, sortOrder: order, updatedAt: now };
      }),
    );
  },

  // ============ 班型分类 ============
  async listClassTypes(schoolId: string): Promise<ClassTypeCategory[]> {
    await delay(200);
    return db
      .read("classTypeCategories")
      .filter((c) => c.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createClassType(schoolId: string, data: CreateClassTypeData): Promise<ClassTypeCategory> {
    await delay(300);
    const now = new Date().toISOString();
    const all = db.read("classTypeCategories");
    const maxOrder = all
      .filter((c) => c.schoolId === schoolId)
      .reduce((max, c) => Math.max(max, c.sortOrder), 0);
    const newClassType: ClassTypeCategory = {
      id: genId("ct"),
      schoolId,
      name: data.name,
      description: data.description,
      color: data.color,
      sortOrder: data.sortOrder ?? maxOrder + 1,
      enabled: data.enabled ?? true,
      createdAt: now,
    };
    db.update("classTypeCategories", (list) => [...list, newClassType]);
    return newClassType;
  },

  async updateClassType(id: string, patch: UpdateClassTypeData): Promise<ClassTypeCategory> {
    await delay(250);
    let updated: ClassTypeCategory | null = null;
    db.update("classTypeCategories", (list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new Error("班型不存在");
    return updated;
  },

  async deleteClassType(id: string): Promise<void> {
    await delay(200);
    db.update("classTypeCategories", (list) => list.filter((c) => c.id !== id));
  },

  async toggleClassType(id: string): Promise<ClassTypeCategory> {
    await delay(200);
    let updated: ClassTypeCategory | null = null;
    db.update("classTypeCategories", (list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, enabled: !c.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("班型不存在");
    return updated;
  },

  async batchUpdateClassTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await delay(200);
    const orderMap = new Map(items.map((item) => [item.id, item.sortOrder]));
    db.update("classTypeCategories", (list) =>
      list.map((c) => {
        const order = orderMap.get(c.id);
        if (order === undefined) return c;
        return { ...c, sortOrder: order };
      }),
    );
  },

  // ============ 试卷类型 ============
  async listExamPaperTypes(schoolId: string): Promise<ExamPaperType[]> {
    await delay(200);
    return db
      .read("examPaperTypes")
      .filter((t) => t.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createExamPaperType(schoolId: string, data: CreateExamPaperTypeData): Promise<ExamPaperType> {
    await delay(300);
    const now = new Date().toISOString();
    const all = db.read("examPaperTypes");
    const parentId = validateParentType(all, schoolId, data.parentId);
    const newType: ExamPaperType = {
      id: genId("ept"),
      schoolId,
      name: data.name,
      description: data.description,
      parentId,
      format: data.format,
      sortOrder: data.sortOrder ?? nextSiblingOrder(all, schoolId, parentId),
      enabled: data.enabled ?? true,
      createdAt: now,
    };
    db.update("examPaperTypes", (list) => [...list, newType]);
    return newType;
  },

  async updateExamPaperType(id: string, patch: Partial<ExamPaperType>): Promise<ExamPaperType> {
    await delay(250);
    const all = db.read("examPaperTypes") as ExamPaperType[];
    const current = all.find((type) => type.id === id);
    if (!current) throw new Error("试卷类型不存在");
    const nextParentId = Object.prototype.hasOwnProperty.call(patch, "parentId")
      ? validateParentType(all, current.schoolId, patch.parentId, id)
      : current.parentId || undefined;
    const parentChanged = nextParentId !== (current.parentId || undefined);
    const nextSortOrder = parentChanged && patch.sortOrder === undefined
      ? nextSiblingOrder(all.filter((type) => type.id !== id), current.schoolId, nextParentId)
      : patch.sortOrder ?? current.sortOrder;
    if (nextParentId && all.some((type) => type.parentId === id)) {
      throw new Error("存在二级类型的一级类型不能再设为二级类型");
    }

    let updated: ExamPaperType | null = null;
    db.update("examPaperTypes", (list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...patch, parentId: nextParentId, sortOrder: nextSortOrder };
        return updated;
      }),
    );
    if (!updated) throw new Error("试卷类型不存在");
    return updated;
  },

  async deleteExamPaperType(id: string): Promise<void> {
    await delay(200);
    const all = db.read("examPaperTypes") as ExamPaperType[];
    if (all.some((type) => type.parentId === id)) {
      throw new Error("请先删除或移动该类型下的二级类型");
    }
    db.update("examPaperTypes", (list) => list.filter((t) => t.id !== id));
  },

  async toggleExamPaperType(id: string): Promise<ExamPaperType> {
    await delay(200);
    let updated: ExamPaperType | null = null;
    db.update("examPaperTypes", (list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, enabled: !t.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("试卷类型不存在");
    return updated;
  },

  async batchUpdateExamPaperTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await delay(200);
    const orderMap = new Map(items.map((item) => [item.id, item.sortOrder]));
    db.update("examPaperTypes", (list) =>
      list.map((t) => {
        const order = orderMap.get(t.id);
        if (order === undefined) return t;
        return { ...t, sortOrder: order };
      }),
    );
  },

  // ============ 讲义类型 ============
  async listLectureTypes(schoolId: string): Promise<LectureType[]> {
    await delay(200);
    return db
      .read("lectureTypes")
      .filter((t) => t.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createLectureType(schoolId: string, data: CreateLectureTypeData): Promise<LectureType> {
    await delay(300);
    const now = new Date().toISOString();
    const all = db.read("lectureTypes");
    const parentId = validateParentType(all, schoolId, data.parentId);
    const newType: LectureType = {
      id: genId("ltt"),
      schoolId,
      name: data.name,
      description: data.description,
      parentId,
      format: data.format,
      sortOrder: data.sortOrder ?? nextSiblingOrder(all, schoolId, parentId),
      enabled: data.enabled ?? true,
      createdAt: now,
    };
    db.update("lectureTypes", (list) => [...list, newType]);
    return newType;
  },

  async updateLectureType(id: string, patch: Partial<LectureType>): Promise<LectureType> {
    await delay(250);
    const all = db.read("lectureTypes") as LectureType[];
    const current = all.find((type) => type.id === id);
    if (!current) throw new Error("讲义类型不存在");
    const nextParentId = Object.prototype.hasOwnProperty.call(patch, "parentId")
      ? validateParentType(all, current.schoolId, patch.parentId, id)
      : current.parentId || undefined;
    const parentChanged = nextParentId !== (current.parentId || undefined);
    const nextSortOrder = parentChanged && patch.sortOrder === undefined
      ? nextSiblingOrder(all.filter((type) => type.id !== id), current.schoolId, nextParentId)
      : patch.sortOrder ?? current.sortOrder;
    if (nextParentId && all.some((type) => type.parentId === id)) {
      throw new Error("存在二级类型的一级类型不能再设为二级类型");
    }

    let updated: LectureType | null = null;
    db.update("lectureTypes", (list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...patch, parentId: nextParentId, sortOrder: nextSortOrder };
        return updated;
      }),
    );
    if (!updated) throw new Error("讲义类型不存在");
    return updated;
  },

  async deleteLectureType(id: string): Promise<void> {
    await delay(200);
    const all = db.read("lectureTypes") as LectureType[];
    if (all.some((type) => type.parentId === id)) {
      throw new Error("请先删除或移动该类型下的二级类型");
    }
    db.update("lectureTypes", (list) => list.filter((t) => t.id !== id));
  },

  async toggleLectureType(id: string): Promise<LectureType> {
    await delay(200);
    let updated: LectureType | null = null;
    db.update("lectureTypes", (list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, enabled: !t.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("讲义类型不存在");
    return updated;
  },

  async batchUpdateLectureTypeSortOrder(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await delay(200);
    const orderMap = new Map(items.map((item) => [item.id, item.sortOrder]));
    db.update("lectureTypes", (list) =>
      list.map((t) => {
        const order = orderMap.get(t.id);
        if (order === undefined) return t;
        return { ...t, sortOrder: order };
      }),
    );
  },
};
