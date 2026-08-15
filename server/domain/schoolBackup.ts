import type {
  SchoolResourceBackup,
  SchoolBackupResourceType,
  ExamPaper,
  Lecture,
  Courseware,
  Material,
  Question,
  Teacher,
  ResourceSemester,
} from "../../src/types/index.js";
import { db, computeDuplicateHash } from "../runtime-db.js";
import { appendCopySuffix, delay, genId, maybeThrowError } from "../domain-shared.js";
import { assertResourceCapacity } from "./quota.js";
import {
  getSchoolResourceChapterTree,
  getSchoolResourceKnowledgeTree,
  syncPersonalResourceDirectories,
  syncSchoolResourceDirectories,
} from "./school-resource-catalog.js";

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

/**
 * 判断教师是否具有"备课组长及以上"权限
 * 备课组长/prepLeader、学科组长/subjectLeader、年级组长/gradeLeader、
 * 教务主任/dean、副校长/vicePrincipal、校长/principal、学校管理员/school_admin、平台管理员/platform_admin
 * 均视为有修改校本资源属性的权限
 */
export function canEditSchoolBackup(
  teacher: Teacher | null | undefined,
): boolean {
  if (!teacher) return false;
  if (teacher.role === "school_admin" || teacher.role === "platform_admin")
    return true;
  const privilegedRoles = [
    "prepLeader",
    "subjectLeader",
    "gradeLeader",
    "dean",
    "vicePrincipal",
    "principal",
  ];
  return teacher.roles.some((r) => privilegedRoles.includes(r));
}

function parseSnapshot<T>(backup: SchoolResourceBackup): T | null {
  try {
    return JSON.parse(backup.contentSnapshot) as T;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function questionBackupHash(backup: SchoolResourceBackup): string | undefined {
  if (backup.resourceType !== "question") return undefined;
  if (backup.duplicateHash) return backup.duplicateHash;
  const snapshot = parseSnapshot<Partial<Question>>(backup);
  if (snapshot?.stem && snapshot.answer !== undefined) {
    return computeDuplicateHash(snapshot.stem, snapshot.answer, snapshot.options);
  }
  return undefined;
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

type SchoolCopyResource = Question | ExamPaper | Lecture | Courseware | Material;
type SchoolCopyCollection = "questions" | "examPapers" | "lectures" | "coursewares" | "materials";

const schoolCopyCollections: Record<SchoolBackupResourceType, SchoolCopyCollection> = {
  question: "questions",
  examPaper: "examPapers",
  lecture: "lectures",
  courseware: "coursewares",
  material: "materials",
};

function stripCopySuffix(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/(?:（副本）)+$/, "") : value;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function duplicateComparableResource(
  resourceType: SchoolBackupResourceType,
  resource: SchoolCopyResource,
): string {
  const comparable = structuredClone(resource) as unknown as Record<string, unknown>;
  for (const key of [
    "id",
    "teacherId",
    "schoolId",
    "chapterIds",
    "knowledgePointIds",
    "createdAt",
    "updatedAt",
    "platformSourceDonationIds",
    "schoolSourceBackupIds",
  ]) {
    delete comparable[key];
  }
  if ("title" in comparable) comparable.title = stripCopySuffix(comparable.title);
  if ("stem" in comparable) comparable.stem = stripCopySuffix(comparable.stem);

  if (resourceType === "question") {
    for (const key of ["usageCount", "lastUsedAt", "isShared", "sourceType", "hiddenByExamIds"])
      delete comparable[key];
  } else if (resourceType === "examPaper") {
    delete comparable.status;
  } else if (resourceType === "lecture") {
    delete comparable.status;
    delete comparable.version;
  } else if (resourceType === "courseware") {
    for (const key of ["lessonCoursewareId", "sourceResourceType", "sourceResourceId", "sourceResourceTitle"])
      delete comparable[key];
  }

  return JSON.stringify(stableValue(comparable));
}

function findExistingPersonalResource(
  backup: SchoolResourceBackup,
  teacherId: string,
  schoolId: string,
): SchoolCopyResource | undefined {
  const collection = schoolCopyCollections[backup.resourceType];
  const owned = (db.read(collection) as SchoolCopyResource[]).filter(
    (resource) => resource.teacherId === teacherId && resource.schoolId === schoolId,
  );
  const backups = db.read("schoolBackups") as SchoolResourceBackup[];
  const sameSourceBackupIds = new Set(
    backups
      .filter((item) =>
        item.resourceType === backup.resourceType
        && item.schoolId === backup.schoolId
        && item.fromTeacherId === backup.fromTeacherId
        && item.sourceResourceId === backup.sourceResourceId,
      )
      .map((item) => item.id),
  );
  const byProvenance = owned.find((resource) =>
    resource.schoolSourceBackupIds?.some((id) => sameSourceBackupIds.has(id)),
  );
  if (byProvenance) return byProvenance;

  const snapshot = parseSnapshot<SchoolCopyResource>(backup);
  if (!snapshot) return undefined;
  if (backup.resourceType === "question") {
    const expectedHash = questionBackupHash(backup);
    if (!expectedHash) return undefined;
    return (owned as Question[]).find((question) =>
      question.duplicateHash === expectedHash
      || computeDuplicateHash(
        stripCopySuffix(question.stem) as string,
        question.answer,
        question.options,
      ) === expectedHash,
    );
  }
  const expected = duplicateComparableResource(backup.resourceType, snapshot);
  return owned.find((resource) =>
    duplicateComparableResource(backup.resourceType, resource) === expected,
  );
}

function addSchoolBackupSource(
  resourceType: SchoolBackupResourceType,
  resourceId: string,
  backupId: string,
): void {
  const collection = schoolCopyCollections[resourceType];
  db.update(collection, (list: SchoolCopyResource[]) => list.map((resource) =>
    resource.id === resourceId
      ? {
          ...resource,
          schoolSourceBackupIds: [
            ...new Set([...(resource.schoolSourceBackupIds || []), backupId]),
          ],
        }
      : resource,
  ));
}

function normalizeSchoolBackups(schoolId: string): SchoolResourceBackup[] {
  const current = db.read("schoolBackups") as SchoolResourceBackup[];
  let changed = false;
  const normalized = current.map((backup) => {
    if (backup.schoolId !== schoolId) return backup;
    const directory = syncSchoolResourceDirectories(
      schoolId,
      backup.chapterIds || [],
      backup.knowledgePointIds || [],
    );
    const targetStudentIds = backup.targetStudentIds || [];
    const duplicateHash = questionBackupHash(backup);
    if (
      backup.targetStudentIds === undefined ||
      !sameIds(backup.chapterIds, directory.chapterIds) ||
      !sameIds(backup.knowledgePointIds, directory.knowledgePointIds) ||
      backup.duplicateHash !== duplicateHash
    ) {
      changed = true;
      return {
        ...backup,
        targetStudentIds,
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        duplicateHash,
      };
    }
    return backup;
  });
  if (changed) db.write("schoolBackups", normalized);
  return normalized.filter((backup) => backup.schoolId === schoolId);
}

export const schoolBackupService = {
  /** 创建一份备份 */
  async createBackup(input: BackupInput): Promise<SchoolResourceBackup> {
    await delay(200);
    maybeThrowError();
    const now = new Date().toISOString();
    const directory = syncSchoolResourceDirectories(
      input.schoolId,
      input.chapterIds,
      input.knowledgePointIds,
    );
    if (input.resourceType === "question") {
      const existing = (
        db.read("schoolBackups") as SchoolResourceBackup[]
      ).find(
        (item) =>
          item.schoolId === input.schoolId &&
          item.resourceType === "question" &&
          (item.sourceResourceId === input.sourceResourceId ||
            (input.duplicateHash &&
              questionBackupHash(item) === input.duplicateHash)),
      );
      if (existing) {
        const merged: SchoolResourceBackup = {
          ...existing,
          title: input.title,
          description: input.description,
          contentSnapshot: input.contentSnapshot,
          backupReason: input.backupReason,
          targetClassIds: [
            ...new Set([...existing.targetClassIds, ...input.targetClassIds]),
          ],
          targetStudentIds: [
            ...new Set([
              ...(existing.targetStudentIds || []),
              ...(input.targetStudentIds || []),
            ]),
          ],
          chapterIds: [
            ...new Set([...existing.chapterIds, ...directory.chapterIds]),
          ],
          knowledgePointIds: [
            ...new Set([
              ...existing.knowledgePointIds,
              ...directory.knowledgePointIds,
            ]),
          ],
          grade: input.grade,
          schoolYear: input.schoolYear,
          semester: input.semester || "上学期",
          meta: input.meta || {},
          duplicateHash: input.duplicateHash || existing.duplicateHash,
          updatedAt: now,
        };
        db.update("schoolBackups", (list) =>
          list.map((item) => (item.id === existing.id ? merged : item)),
        );
        return merged;
      }
    }
    const backup: SchoolResourceBackup = {
      id: genId("sbk"),
      schoolId: input.schoolId,
      resourceType: input.resourceType,
      sourceResourceId: input.sourceResourceId,
      title: input.title,
      description: input.description,
      contentSnapshot: input.contentSnapshot,
      fromTeacherId: input.fromTeacherId,
      backupReason: input.backupReason,
      targetClassIds: input.targetClassIds,
      targetStudentIds: input.targetStudentIds || [],
      chapterIds: directory.chapterIds,
      knowledgePointIds: directory.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      semester: input.semester || "上学期",
      meta: input.meta || {},
      duplicateHash: input.duplicateHash,
      createdAt: now,
      updatedAt: now,
    };
    db.update("schoolBackups", (list) => [backup, ...list]);
    return backup;
  },

  /** 列出本校所有备份 */
  async listBackups(schoolId: string): Promise<SchoolResourceBackup[]> {
    await delay(200);
    return normalizeSchoolBackups(schoolId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  /** 按 ID 获取备份 */
  async getBackup(id: string): Promise<SchoolResourceBackup | null> {
    await delay(100);
    return db.read("schoolBackups").find((b) => b.id === id) || null;
  },

  async getChapterTree(schoolId: string) {
    await delay(100);
    normalizeSchoolBackups(schoolId);
    return getSchoolResourceChapterTree(schoolId);
  },

  async getKnowledgeTree(schoolId: string) {
    await delay(100);
    normalizeSchoolBackups(schoolId);
    return getSchoolResourceKnowledgeTree(schoolId);
  },

  /**
   * 修改备份的属性（仅备课组长及以上）
   * 仅允许修改：章节、知识点、年级、学年、标题、描述
   */
  async updateBackupProperties(
    id: string,
    patch: Partial<
      Pick<
        SchoolResourceBackup,
        | "title"
        | "description"
        | "chapterIds"
        | "knowledgePointIds"
        | "grade"
        | "schoolYear"
        | "semester"
      >
    >,
    teacher: Teacher,
  ): Promise<SchoolResourceBackup> {
    await delay(200);
    maybeThrowError();
    if (!canEditSchoolBackup(teacher)) {
      throw new Error("无权限：仅备课组长及以上可修改校本资源属性");
    }
    let updated: SchoolResourceBackup | null = null;
    db.update("schoolBackups", (list) =>
      list.map((b) => {
        if (b.id === id) {
          updated = {
            ...b,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return b;
      }),
    );
    if (!updated) throw new Error("备份不存在");
    return updated;
  },

  /** 删除备份（仅备课组长及以上） */
  async deleteBackup(id: string, teacher: Teacher): Promise<void> {
    await delay(200);
    if (!canEditSchoolBackup(teacher)) {
      throw new Error("无权限：仅备课组长及以上可删除校本资源");
    }
    db.update("schoolBackups", (list) => list.filter((b) => b.id !== id));
  },

  /**
   * 自动备份：将指定资源生成快照并写入校本库
   * 用于"发布给非所教班级"或"分享给其他教师"时调用
   */
  async autoBackupForResource(
    schoolId: string,
    fromTeacherId: string,
    resourceType: SchoolBackupResourceType,
    resourceId: string,
    targetClassIds: string[],
    backupReason: string,
    targetStudentIds: string[] = [],
  ): Promise<SchoolResourceBackup | null> {
    await delay(150);
    // 加载源资源
    let snapshot: Omit<
      BackupInput,
      | "schoolId"
      | "fromTeacherId"
      | "resourceType"
      | "sourceResourceId"
      | "targetClassIds"
      | "targetStudentIds"
      | "backupReason"
    > | null = null;
    if (resourceType === "examPaper") {
      const p = db.read("examPapers").find((x) => x.id === resourceId) as
        ExamPaper | undefined;
      if (p) {
        snapshot = {
          title: p.title,
          description: p.description,
          contentSnapshot: JSON.stringify(p),
          chapterIds: p.chapterIds,
          knowledgePointIds: p.knowledgePointIds,
          grade: p.grade,
          schoolYear: p.schoolYear,
          semester: p.semester || "上学期",
          meta: {
            题目数: String(p.questions.length),
            总分: String(p.totalScore),
            时长: `${p.duration}分钟`,
            状态: p.status === "published" ? "已发布" : "草稿",
          },
        };
      }
    } else if (resourceType === "lecture") {
      const l = db.read("lectures").find((x) => x.id === resourceId) as
        Lecture | undefined;
      if (l) {
        snapshot = {
          title: l.title,
          description: l.description,
          contentSnapshot: JSON.stringify(l),
          chapterIds: l.chapterIds,
          knowledgePointIds: l.knowledgePointIds,
          grade: l.grade,
          schoolYear: l.schoolYear,
          semester: l.semester || "上学期",
          meta: {
            节数: String(l.sections.length),
            状态: l.status === "published" ? "已发布" : "草稿",
          },
        };
      }
    } else if (resourceType === "courseware") {
      const c = db.read("coursewares").find((x) => x.id === resourceId) as
        Courseware | undefined;
      if (c) {
        snapshot = {
          title: c.title,
          description: c.description,
          contentSnapshot: JSON.stringify(c),
          chapterIds: c.chapterIds,
          knowledgePointIds: c.knowledgePointIds,
          grade: c.grade,
          schoolYear: c.schoolYear,
          semester: c.semester || "上学期",
          meta: {
            类型: c.type,
            标签: c.tags.join("、"),
          },
        };
      }
    } else if (resourceType === "material") {
      const m = db.read("materials").find((x) => x.id === resourceId) as
        Material | undefined;
      if (m) {
        snapshot = {
          title: m.title,
          description: m.description,
          contentSnapshot: JSON.stringify(m),
          chapterIds: m.chapterIds,
          knowledgePointIds: m.knowledgePointIds,
          grade: m.grade,
          schoolYear: m.schoolYear,
          semester: m.semester || "上学期",
          meta: {
            类型: m.type,
            标签: m.tags.join("、"),
          },
        };
      }
    } else if (resourceType === "question") {
      const q = db.read("questions").find((x) => x.id === resourceId) as
        Question | undefined;
      if (q) {
        snapshot = {
          title: q.stem.slice(0, 60),
          contentSnapshot: JSON.stringify(q),
          chapterIds: q.chapterIds,
          knowledgePointIds: q.knowledgePointIds,
          grade: q.grade,
          schoolYear: q.schoolYear,
          semester: q.semester || "上学期",
          meta: {
            题型: q.type,
            难度: String(q.difficulty),
            推荐度: String(q.recommendation),
          },
          duplicateHash:
            q.duplicateHash ||
            computeDuplicateHash(q.stem, q.answer, q.options),
        };
      }
    }
    if (!snapshot) return null;
    return this.createBackup({
      schoolId,
      fromTeacherId,
      resourceType,
      sourceResourceId: resourceId,
      targetClassIds,
      targetStudentIds,
      backupReason,
      ...snapshot,
    });
  },

  /**
   * 创建副本：将一份校本备份复制为当前教师自己的资源
   * 所有老师均可调用（不限备课组长权限）
   * 优先使用源资源进行完整复制；若源资源已被删除，则从 contentSnapshot 尽量还原
   * 返回新资源的类型与ID
   */
  async saveAsOwnResource(
    backupId: string,
    teacher: Teacher,
  ): Promise<{
    newResourceId: string;
    resourceType: SchoolBackupResourceType;
    deduplicated: boolean;
  }> {
    await delay(300);
    maybeThrowError();
    const backup = (db.read("schoolBackups") as SchoolResourceBackup[])
      .find((item) => item.id === backupId);
    if (!backup) throw new Error("备份不存在或已被删除");
    if (backup.fromTeacherId === teacher.id) {
      throw new Error("资源提供者不能再次另存自己的校本资源");
    }
    if (!teacher.schoolId || teacher.schoolId !== backup.schoolId) {
      throw new Error("只能另存当前学校的校本资源");
    }

    const now = new Date().toISOString();
    const teacherId = teacher.id;
    const schoolId = teacher.schoolId;
    const existing = findExistingPersonalResource(backup, teacherId, schoolId);
    if (existing) {
      addSchoolBackupSource(backup.resourceType, existing.id, backup.id);
      return {
        newResourceId: existing.id,
        resourceType: backup.resourceType,
        deduplicated: true,
      };
    }
    assertResourceCapacity(teacherId, backup.resourceType);
    const directory = syncPersonalResourceDirectories(
      schoolId,
      backup.chapterIds || [],
      backup.knowledgePointIds || [],
    );
    let newResourceId = "";

    switch (backup.resourceType) {
      case "question": {
        let original = db.read("questions").find(
          (q) => q.id === backup.sourceResourceId,
        ) as Question | undefined;
        const snapshotData = original
          ? null
          : parseSnapshot<Partial<Question>>(backup);
        if (!original && snapshotData) {
          original = {
            ...(snapshotData as Question),
            id: snapshotData.id || backup.sourceResourceId,
            teacherId: snapshotData.teacherId || backup.fromTeacherId,
            schoolId: snapshotData.schoolId || backup.schoolId,
            type: snapshotData.type || "short",
            stem: snapshotData.stem || backup.title,
            options: snapshotData.options,
            answer: snapshotData.answer || "",
            analysis: snapshotData.analysis || "",
            chapterIds: directory.chapterIds,
            knowledgePointIds: directory.knowledgePointIds,
            difficulty: snapshotData.difficulty || 3,
            recommendation: snapshotData.recommendation || 3,
            usageCount: snapshotData.usageCount || 0,
            remark: snapshotData.remark || "",
            remarks: snapshotData.remarks || [],
            grade: snapshotData.grade || backup.grade,
            schoolYear: snapshotData.schoolYear || backup.schoolYear,
            semester: snapshotData.semester || backup.semester || "上学期",
            isShared: false,
            createdAt: snapshotData.createdAt || backup.createdAt,
            updatedAt: snapshotData.updatedAt || backup.createdAt,
          };
        }
        if (!original)
          throw new Error("无法还原题目，源资源已删除且快照不完整");

        newResourceId = genId("q");
        const copy: Question = {
          ...original,
          id: newResourceId,
          stem: appendCopySuffix(original.stem),
          teacherId,
          schoolId,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          usageCount: 0,
          isShared: false,
          sourceType: "shared",
          schoolSourceBackupIds: [backup.id],
          duplicateHash: computeDuplicateHash(
            original.stem,
            original.answer,
            original.options,
          ),
          hiddenByExamIds: [],
          lastUsedAt: undefined,
          createdAt: now,
          updatedAt: now,
        };
        db.update("questions", (list) => [...list, copy]);
        break;
      }
      case "examPaper": {
        const source = db.read("examPapers").find(
          (p) => p.id === backup.sourceResourceId,
        ) as ExamPaper | undefined;
        const snapshot = source
          ? null
          : parseSnapshot<Partial<ExamPaper>>(backup);
        const original = source || (snapshot ? {
          ...(snapshot as ExamPaper),
          id: snapshot.id || backup.sourceResourceId,
          teacherId: snapshot.teacherId || backup.fromTeacherId,
          schoolId: snapshot.schoolId || backup.schoolId,
          title: snapshot.title || backup.title,
          description: snapshot.description || backup.description,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          grade: snapshot.grade || backup.grade || "",
          schoolYear: snapshot.schoolYear || backup.schoolYear || "",
          semester: snapshot.semester || backup.semester || "上学期",
          duration: snapshot.duration || 0,
          totalScore: snapshot.totalScore || 0,
          questions: snapshot.questions || [],
          status: snapshot.status || "draft",
          createdAt: snapshot.createdAt || backup.createdAt,
          updatedAt: snapshot.updatedAt || backup.createdAt,
        } satisfies ExamPaper : null);
        if (!original) throw new Error("无法还原试卷，源资源已删除");
        newResourceId = genId("exam");
        const copy: ExamPaper = {
          ...original,
          id: newResourceId,
          title: appendCopySuffix(original.title),
          teacherId,
          schoolId,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          status: "draft",
          schoolSourceBackupIds: [backup.id],
          createdAt: now,
          updatedAt: now,
        };
        db.update("examPapers", (list) => [...list, copy]);
        break;
      }
      case "lecture": {
        const source = db.read("lectures").find(
          (l) => l.id === backup.sourceResourceId,
        ) as Lecture | undefined;
        const snapshot = source
          ? null
          : parseSnapshot<Partial<Lecture>>(backup);
        const original = source || (snapshot ? {
          ...(snapshot as Lecture),
          id: snapshot.id || backup.sourceResourceId,
          teacherId: snapshot.teacherId || backup.fromTeacherId,
          schoolId: snapshot.schoolId || backup.schoolId,
          title: snapshot.title || backup.title,
          description: snapshot.description || backup.description,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          grade: snapshot.grade || backup.grade || "",
          schoolYear: snapshot.schoolYear || backup.schoolYear || "",
          semester: snapshot.semester || backup.semester || "上学期",
          classIds: snapshot.classIds || [],
          studentIds: snapshot.studentIds || [],
          sections: snapshot.sections || [],
          version: snapshot.version || 1,
          status: snapshot.status || "draft",
          createdAt: snapshot.createdAt || backup.createdAt,
          updatedAt: snapshot.updatedAt || backup.createdAt,
        } satisfies Lecture : null);
        if (!original) throw new Error("无法还原讲义，源资源已删除");
        newResourceId = genId("lec");
        const copy: Lecture = {
          ...original,
          id: newResourceId,
          title: appendCopySuffix(original.title),
          teacherId,
          schoolId,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          status: "draft",
          version: 1,
          schoolSourceBackupIds: [backup.id],
          createdAt: now,
          updatedAt: now,
        };
        db.update("lectures", (list) => [...list, copy]);
        break;
      }
      case "courseware": {
        const original = (db.read("coursewares").find(
          (c) => c.id === backup.sourceResourceId,
        ) as Courseware | undefined) || parseSnapshot<Courseware>(backup);
        if (!original) throw new Error("无法还原课件，源资源已删除");
        newResourceId = genId("cw");
        const copy: Courseware = {
          ...original,
          id: newResourceId,
          title: appendCopySuffix(original.title),
          teacherId,
          schoolId,
          lessonCoursewareId: undefined,
          sourceResourceType: undefined,
          sourceResourceId: undefined,
          sourceResourceTitle: undefined,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          schoolSourceBackupIds: [backup.id],
          createdAt: now,
          updatedAt: now,
        };
        db.update("coursewares", (list) => [...list, copy]);
        break;
      }
      case "material": {
        const original = (db.read("materials").find(
          (m) => m.id === backup.sourceResourceId,
        ) as Material | undefined) || parseSnapshot<Material>(backup);
        if (!original) throw new Error("无法还原素材，源资源已删除");
        newResourceId = genId("mat");
        const copy: Material = {
          ...original,
          id: newResourceId,
          title: appendCopySuffix(original.title),
          teacherId,
          schoolId,
          chapterIds: directory.chapterIds,
          knowledgePointIds: directory.knowledgePointIds,
          schoolSourceBackupIds: [backup.id],
          createdAt: now,
          updatedAt: now,
        };
        db.update("materials", (list) => [...list, copy]);
        break;
      }
    }

    return {
      newResourceId,
      resourceType: backup.resourceType,
      deduplicated: false,
    };
  },
};
