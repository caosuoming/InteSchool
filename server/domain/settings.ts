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
  teacherId?: string;
  parentId?: string | null;
  sortOrder: number;
}

interface SettingsTeacher {
  id: string;
  schoolId?: string | null;
  currentAffiliationId?: string | null;
  affiliations?: Array<{
    id?: string;
    schoolId?: string | null;
    isCurrent?: boolean;
  }>;
}

const PERSONAL_SETTINGS_PREFIX = "personal-settings:";

function personalSettingsSchoolId(teacherId: string): string {
  return `${PERSONAL_SETTINGS_PREFIX}${teacherId}`;
}

function settingsTeacher(scopeId: string): SettingsTeacher | undefined {
  return ((db.read("teachers") || []) as SettingsTeacher[]).find((teacher) => teacher.id === scopeId);
}

function currentSchoolId(teacher: SettingsTeacher): string | null {
  const current = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return typeof current?.schoolId === "string"
    ? current.schoolId
    : typeof teacher.schoolId === "string"
      ? teacher.schoolId
      : null;
}

function teacherSchoolIds(teacher: SettingsTeacher): string[] {
  const current = currentSchoolId(teacher);
  const ids = new Set<string>();
  if (current) ids.add(current);
  for (const affiliation of teacher.affiliations || []) {
    if (typeof affiliation.schoolId === "string" && affiliation.schoolId.trim()) {
      ids.add(affiliation.schoolId);
    }
  }
  if (typeof teacher.schoolId === "string" && teacher.schoolId.trim()) ids.add(teacher.schoolId);
  return [...ids];
}

function orderedLegacyRecords<T extends { schoolId: string; teacherId?: string; sortOrder: number }>(
  records: T[],
  teacher: SettingsTeacher,
): T[] {
  const schoolIds = teacherSchoolIds(teacher);
  const schoolOrder = new Map(schoolIds.map((schoolId, index) => [schoolId, index]));
  return records
    .filter((record) => !record.teacherId && schoolOrder.has(record.schoolId))
    .sort((left, right) =>
      (schoolOrder.get(left.schoolId) ?? Number.MAX_SAFE_INTEGER)
      - (schoolOrder.get(right.schoolId) ?? Number.MAX_SAFE_INTEGER)
      || left.sortOrder - right.sortOrder,
    );
}

function normalizeSettingName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function ensurePersonalSettings(teacher: SettingsTeacher): void {
  const records = (db.read("schoolSettings") || []) as SchoolSetting[];
  if (records.some((record) => record.teacherId === teacher.id)) return;

  const legacy = orderedLegacyRecords(records, teacher);
  if (legacy.length === 0) return;
  const schoolId = personalSettingsSchoolId(teacher.id);
  const seen = new Set<string>();
  const personal: SchoolSetting[] = [];
  for (const record of legacy) {
    const key = `${record.type}\u0000${record.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    personal.push({
      ...record,
      id: genId("setting"),
      schoolId,
      teacherId: teacher.id,
      sortOrder: personal.filter((item) => item.type === record.type).length + 1,
    });
  }
  db.write("schoolSettings", [...records, ...personal]);
}

function ensurePersonalClassTypes(teacher: SettingsTeacher): void {
  const records = (db.read("classTypeCategories") || []) as ClassTypeCategory[];
  const legacy = orderedLegacyRecords(records, teacher);
  const existing = records.filter((record) => record.teacherId === teacher.id);
  if (existing.length > 0) {
    let changed = false;
    for (const record of legacy) {
      const target = existing.find((item) => normalizeSettingName(item.name) === normalizeSettingName(record.name));
      if (target && !target.legacyIds?.includes(record.id)) {
        target.legacyIds = [...(target.legacyIds || []), record.id];
        changed = true;
      }
    }
    if (changed) {
      const updates = new Map(existing.map((item) => [item.id, item]));
      db.write("classTypeCategories", records.map((record) => updates.get(record.id) || record));
    }
    return;
  }

  if (legacy.length === 0) return;
  const schoolId = personalSettingsSchoolId(teacher.id);
  const byName = new Map<string, ClassTypeCategory>();
  const personal: ClassTypeCategory[] = [];
  for (const record of legacy) {
    const key = normalizeSettingName(record.name);
    let target = byName.get(key);
    if (!target) {
      target = {
        ...record,
        id: genId("ct"),
        schoolId,
        teacherId: teacher.id,
        legacyIds: [record.id],
        sortOrder: personal.length + 1,
      };
      byName.set(key, target);
      personal.push(target);
    } else if (!target.legacyIds?.includes(record.id)) {
      target.legacyIds = [...(target.legacyIds || []), record.id];
    }
  }
  db.write("classTypeCategories", [...records, ...personal]);
}

function ensurePersonalHierarchicalTypes<T extends ExamPaperType | LectureType>(
  teacher: SettingsTeacher,
  collection: "examPaperTypes" | "lectureTypes",
  idPrefix: "ept" | "ltt",
  referenceCollection: "examPapers" | "lectures",
): void {
  const records = (db.read(collection) || []) as T[];
  if (records.some((record) => record.teacherId === teacher.id)) return;

  const legacy = orderedLegacyRecords(records, teacher);
  if (legacy.length === 0) return;
  const roots = legacy.filter((record) => !record.parentId);
  const children = legacy.filter((record) => Boolean(record.parentId));
  const schoolId = personalSettingsSchoolId(teacher.id);
  const semantic = new Map<string, T>();
  const replacements = new Map<string, string>();
  const personal: T[] = [];

  for (const record of [...roots, ...children]) {
    const parentId = record.parentId ? replacements.get(record.parentId) : undefined;
    if (record.parentId && !parentId) continue;
    const key = `${parentId || "root"}\u0000${normalizeSettingName(record.name)}\u0000${record.format}`;
    let target = semantic.get(key);
    if (!target) {
      target = {
        ...record,
        id: genId(idPrefix),
        schoolId,
        teacherId: teacher.id,
        parentId,
        sortOrder: personal.filter((item) => (item.parentId || undefined) === parentId).length + 1,
      } as T;
      semantic.set(key, target);
      personal.push(target);
    }
    replacements.set(record.id, target.id);
  }

  db.write(collection, [...records, ...personal]);
  if (replacements.size > 0) {
    db.update(referenceCollection, (items: Array<Record<string, unknown>> = []) =>
      items.map((item) => {
        if (item.teacherId !== teacher.id || typeof item.typeId !== "string") return item;
        const replacement = replacements.get(item.typeId);
        return replacement ? { ...item, typeId: replacement } : item;
      }),
    );
  }
}

function settingsScope(scopeId: string, kind: "setting" | "class" | "exam" | "lecture") {
  const teacher = settingsTeacher(scopeId);
  if (!teacher) return { schoolId: scopeId, teacherId: undefined };
  if (kind === "setting") ensurePersonalSettings(teacher);
  if (kind === "class") ensurePersonalClassTypes(teacher);
  if (kind === "exam") ensurePersonalHierarchicalTypes(teacher, "examPaperTypes", "ept", "examPapers");
  if (kind === "lecture") ensurePersonalHierarchicalTypes(teacher, "lectureTypes", "ltt", "lectures");
  return { schoolId: personalSettingsSchoolId(teacher.id), teacherId: teacher.id };
}

function belongsToScope(record: { schoolId: string; teacherId?: string }, scopeId?: string): boolean {
  if (!scopeId) return true;
  const teacher = settingsTeacher(scopeId);
  if (teacher) return record.teacherId === teacher.id;
  return !record.teacherId && record.schoolId === scopeId;
}

function requireOwnedRecord<T extends { schoolId: string; teacherId?: string }>(
  record: T | undefined,
  scopeId: string | undefined,
  message: string,
): T {
  if (!record || !belongsToScope(record, scopeId)) throw new Error(message);
  return record;
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
  async listSettings(scopeId: string, type?: SettingType): Promise<SchoolSetting[]> {
    await delay(200);
    const { schoolId, teacherId } = settingsScope(scopeId, "setting");
    const all = db.read("schoolSettings");
    let filtered = all.filter((s: SchoolSetting) =>
      teacherId ? s.teacherId === teacherId : !s.teacherId && s.schoolId === schoolId,
    );
    if (type) {
      filtered = filtered.filter((s) => s.type === type);
    }
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createSetting(scopeId: string, data: CreateSettingData): Promise<SchoolSetting> {
    await delay(300);
    const { schoolId, teacherId } = settingsScope(scopeId, "setting");
    const now = new Date().toISOString();
    const all = db.read("schoolSettings") as SchoolSetting[];
    const maxOrder = all
      .filter((s) => (teacherId ? s.teacherId === teacherId : !s.teacherId && s.schoolId === schoolId) && s.type === data.type)
      .reduce((max, s) => Math.max(max, s.sortOrder), 0);
    const newSetting: SchoolSetting = {
      id: genId("setting"),
      schoolId,
      ...(teacherId ? { teacherId } : {}),
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

  async updateSetting(id: string, patch: UpdateSettingData, scopeId?: string): Promise<SchoolSetting> {
    await delay(250);
    const current = requireOwnedRecord(
      (db.read("schoolSettings") as SchoolSetting[]).find((item) => item.id === id),
      scopeId,
      "设置项不存在",
    );
    let updated: SchoolSetting | null = null;
    db.update("schoolSettings", (list) =>
      list.map((s) => {
        if (s.id !== current.id) return s;
        updated = { ...s, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) throw new Error("设置项不存在");
    return updated;
  },

  async deleteSetting(id: string, scopeId?: string): Promise<void> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("schoolSettings") as SchoolSetting[]).find((item) => item.id === id),
      scopeId,
      "设置项不存在",
    );
    db.update("schoolSettings", (list) => list.filter((s) => s.id !== current.id));
  },

  async toggleSetting(id: string, scopeId?: string): Promise<SchoolSetting> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("schoolSettings") as SchoolSetting[]).find((item) => item.id === id),
      scopeId,
      "设置项不存在",
    );
    let updated: SchoolSetting | null = null;
    db.update("schoolSettings", (list) =>
      list.map((s) => {
        if (s.id !== current.id) return s;
        updated = { ...s, enabled: !s.enabled, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (!updated) throw new Error("设置项不存在");
    return updated;
  },

  async batchUpdateSortOrder(items: Array<{ id: string; sortOrder: number }>, scopeId?: string): Promise<void> {
    await delay(200);
    const now = new Date().toISOString();
    const records = db.read("schoolSettings") as SchoolSetting[];
    for (const item of items) {
      requireOwnedRecord(records.find((record) => record.id === item.id), scopeId, "设置项不存在");
    }
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
  async listClassTypes(scopeId: string): Promise<ClassTypeCategory[]> {
    await delay(200);
    const { schoolId, teacherId } = settingsScope(scopeId, "class");
    return db
      .read("classTypeCategories")
      .filter((c: ClassTypeCategory) => teacherId ? c.teacherId === teacherId : !c.teacherId && c.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createClassType(scopeId: string, data: CreateClassTypeData): Promise<ClassTypeCategory> {
    await delay(300);
    const { schoolId, teacherId } = settingsScope(scopeId, "class");
    const now = new Date().toISOString();
    const all = db.read("classTypeCategories") as ClassTypeCategory[];
    const maxOrder = all
      .filter((c) => teacherId ? c.teacherId === teacherId : !c.teacherId && c.schoolId === schoolId)
      .reduce((max, c) => Math.max(max, c.sortOrder), 0);
    const newClassType: ClassTypeCategory = {
      id: genId("ct"),
      schoolId,
      ...(teacherId ? { teacherId } : {}),
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

  async updateClassType(id: string, patch: UpdateClassTypeData, scopeId?: string): Promise<ClassTypeCategory> {
    await delay(250);
    const current = requireOwnedRecord(
      (db.read("classTypeCategories") as ClassTypeCategory[]).find((item) => item.id === id),
      scopeId,
      "班型不存在",
    );
    let updated: ClassTypeCategory | null = null;
    db.update("classTypeCategories", (list) =>
      list.map((c) => {
        if (c.id !== current.id) return c;
        updated = { ...c, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new Error("班型不存在");
    return updated;
  },

  async deleteClassType(id: string, scopeId?: string): Promise<void> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("classTypeCategories") as ClassTypeCategory[]).find((item) => item.id === id),
      scopeId,
      "班型不存在",
    );
    db.update("classTypeCategories", (list) => list.filter((c) => c.id !== current.id));
  },

  async toggleClassType(id: string, scopeId?: string): Promise<ClassTypeCategory> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("classTypeCategories") as ClassTypeCategory[]).find((item) => item.id === id),
      scopeId,
      "班型不存在",
    );
    let updated: ClassTypeCategory | null = null;
    db.update("classTypeCategories", (list) =>
      list.map((c) => {
        if (c.id !== current.id) return c;
        updated = { ...c, enabled: !c.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("班型不存在");
    return updated;
  },

  async batchUpdateClassTypeSortOrder(items: Array<{ id: string; sortOrder: number }>, scopeId?: string): Promise<void> {
    await delay(200);
    const records = db.read("classTypeCategories") as ClassTypeCategory[];
    for (const item of items) {
      requireOwnedRecord(records.find((record) => record.id === item.id), scopeId, "班型不存在");
    }
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
  async listExamPaperTypes(scopeId: string): Promise<ExamPaperType[]> {
    await delay(200);
    const { schoolId, teacherId } = settingsScope(scopeId, "exam");
    return db
      .read("examPaperTypes")
      .filter((t: ExamPaperType) => teacherId ? t.teacherId === teacherId : !t.teacherId && t.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createExamPaperType(scopeId: string, data: CreateExamPaperTypeData): Promise<ExamPaperType> {
    await delay(300);
    const { schoolId, teacherId } = settingsScope(scopeId, "exam");
    const now = new Date().toISOString();
    const all = (db.read("examPaperTypes") as ExamPaperType[]).filter((type) =>
      teacherId ? type.teacherId === teacherId : !type.teacherId && type.schoolId === schoolId,
    );
    const parentId = validateParentType(all, schoolId, data.parentId);
    const newType: ExamPaperType = {
      id: genId("ept"),
      schoolId,
      ...(teacherId ? { teacherId } : {}),
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

  async updateExamPaperType(id: string, patch: Partial<ExamPaperType>, scopeId?: string): Promise<ExamPaperType> {
    await delay(250);
    const records = db.read("examPaperTypes") as ExamPaperType[];
    const current = requireOwnedRecord(records.find((type) => type.id === id), scopeId, "试卷类型不存在");
    const all = records.filter((type) => belongsToScope(type, scopeId || current.schoolId));
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

  async deleteExamPaperType(id: string, scopeId?: string): Promise<void> {
    await delay(200);
    const records = db.read("examPaperTypes") as ExamPaperType[];
    const current = requireOwnedRecord(records.find((type) => type.id === id), scopeId, "试卷类型不存在");
    const all = records.filter((type) => belongsToScope(type, scopeId || current.schoolId));
    if (all.some((type) => type.parentId === id)) {
      throw new Error("请先删除或移动该类型下的二级类型");
    }
    db.update("examPaperTypes", (list) => list.filter((t) => t.id !== current.id));
  },

  async toggleExamPaperType(id: string, scopeId?: string): Promise<ExamPaperType> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("examPaperTypes") as ExamPaperType[]).find((type) => type.id === id),
      scopeId,
      "试卷类型不存在",
    );
    let updated: ExamPaperType | null = null;
    db.update("examPaperTypes", (list) =>
      list.map((t) => {
        if (t.id !== current.id) return t;
        updated = { ...t, enabled: !t.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("试卷类型不存在");
    return updated;
  },

  async batchUpdateExamPaperTypeSortOrder(items: Array<{ id: string; sortOrder: number }>, scopeId?: string): Promise<void> {
    await delay(200);
    const records = db.read("examPaperTypes") as ExamPaperType[];
    for (const item of items) {
      requireOwnedRecord(records.find((record) => record.id === item.id), scopeId, "试卷类型不存在");
    }
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
  async listLectureTypes(scopeId: string): Promise<LectureType[]> {
    await delay(200);
    const { schoolId, teacherId } = settingsScope(scopeId, "lecture");
    return db
      .read("lectureTypes")
      .filter((t: LectureType) => teacherId ? t.teacherId === teacherId : !t.teacherId && t.schoolId === schoolId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async createLectureType(scopeId: string, data: CreateLectureTypeData): Promise<LectureType> {
    await delay(300);
    const { schoolId, teacherId } = settingsScope(scopeId, "lecture");
    const now = new Date().toISOString();
    const all = (db.read("lectureTypes") as LectureType[]).filter((type) =>
      teacherId ? type.teacherId === teacherId : !type.teacherId && type.schoolId === schoolId,
    );
    const parentId = validateParentType(all, schoolId, data.parentId);
    const newType: LectureType = {
      id: genId("ltt"),
      schoolId,
      ...(teacherId ? { teacherId } : {}),
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

  async updateLectureType(id: string, patch: Partial<LectureType>, scopeId?: string): Promise<LectureType> {
    await delay(250);
    const records = db.read("lectureTypes") as LectureType[];
    const current = requireOwnedRecord(records.find((type) => type.id === id), scopeId, "讲义类型不存在");
    const all = records.filter((type) => belongsToScope(type, scopeId || current.schoolId));
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

  async deleteLectureType(id: string, scopeId?: string): Promise<void> {
    await delay(200);
    const records = db.read("lectureTypes") as LectureType[];
    const current = requireOwnedRecord(records.find((type) => type.id === id), scopeId, "讲义类型不存在");
    const all = records.filter((type) => belongsToScope(type, scopeId || current.schoolId));
    if (all.some((type) => type.parentId === id)) {
      throw new Error("请先删除或移动该类型下的二级类型");
    }
    db.update("lectureTypes", (list) => list.filter((t) => t.id !== current.id));
  },

  async toggleLectureType(id: string, scopeId?: string): Promise<LectureType> {
    await delay(200);
    const current = requireOwnedRecord(
      (db.read("lectureTypes") as LectureType[]).find((type) => type.id === id),
      scopeId,
      "讲义类型不存在",
    );
    let updated: LectureType | null = null;
    db.update("lectureTypes", (list) =>
      list.map((t) => {
        if (t.id !== current.id) return t;
        updated = { ...t, enabled: !t.enabled };
        return updated;
      }),
    );
    if (!updated) throw new Error("讲义类型不存在");
    return updated;
  },

  async batchUpdateLectureTypeSortOrder(items: Array<{ id: string; sortOrder: number }>, scopeId?: string): Promise<void> {
    await delay(200);
    const records = db.read("lectureTypes") as LectureType[];
    for (const item of items) {
      requireOwnedRecord(records.find((record) => record.id === item.id), scopeId, "讲义类型不存在");
    }
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
