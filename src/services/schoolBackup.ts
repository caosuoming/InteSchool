import type {
  SchoolResourceBackup,
  SchoolBackupResourceType,
  ExamPaper,
  Lecture,
  Courseware,
  Material,
  Question,
  Teacher,
} from "@/types";
import { db, computeDuplicateHash } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";

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
  chapterIds: string[];
  knowledgePointIds: string[];
  grade?: string;
  schoolYear?: string;
  meta?: Record<string, string>;
}

/**
 * 判断教师是否具有"备课组长及以上"权限
 * 备课组长/prepLeader、学科组长/subjectLeader、年级组长/gradeLeader、
 * 教务主任/dean、校长/principal、学校管理员/school_admin、平台管理员/platform_admin
 * 均视为有修改校本资源属性的权限
 */
export function canEditSchoolBackup(teacher: Teacher | null | undefined): boolean {
  if (!teacher) return false;
  if (teacher.role === "school_admin" || teacher.role === "platform_admin") return true;
  const privilegedRoles = [
    "prepLeader",
    "subjectLeader",
    "gradeLeader",
    "dean",
    "principal",
  ];
  return teacher.roles.some((r) => privilegedRoles.includes(r));
}

export const schoolBackupService = {
  /** 创建一份备份 */
  async createBackup(input: BackupInput): Promise<SchoolResourceBackup> {
    await delay(200);
    maybeThrowError();
    const now = new Date().toISOString();
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
      chapterIds: input.chapterIds,
      knowledgePointIds: input.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      meta: input.meta || {},
      createdAt: now,
      updatedAt: now,
    };
    db.update("schoolBackups", (list) => [backup, ...list]);
    return backup;
  },

  /** 列出本校所有备份 */
  async listBackups(schoolId: string): Promise<SchoolResourceBackup[]> {
    await delay(200);
    return db
      .read("schoolBackups")
      .filter((b) => b.schoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /** 按 ID 获取备份 */
  async getBackup(id: string): Promise<SchoolResourceBackup | null> {
    await delay(100);
    return db.read("schoolBackups").find((b) => b.id === id) || null;
  },

  /**
   * 修改备份的属性（仅备课组长及以上）
   * 仅允许修改：章节、知识点、年级、学年、标题、描述
   */
  async updateBackupProperties(
    id: string,
    patch: Partial<Pick<SchoolResourceBackup,
      "title" | "description" | "chapterIds" | "knowledgePointIds" | "grade" | "schoolYear">>,
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
  ): Promise<SchoolResourceBackup | null> {
    await delay(150);
    // 加载源资源
    let snapshot: Omit<BackupInput, "schoolId" | "fromTeacherId" | "resourceType" | "sourceResourceId" | "targetClassIds" | "backupReason"> | null = null;
    if (resourceType === "examPaper") {
      const p = db.read("examPapers").find((x) => x.id === resourceId) as ExamPaper | undefined;
      if (p) {
        snapshot = {
          title: p.title,
          description: p.description,
          contentSnapshot: JSON.stringify({
            questions: p.questions,
            totalScore: p.totalScore,
            duration: p.duration,
          }),
          chapterIds: p.chapterIds,
          knowledgePointIds: p.knowledgePointIds,
          grade: p.grade,
          schoolYear: p.schoolYear,
          meta: {
            题目数: String(p.questions.length),
            总分: String(p.totalScore),
            时长: `${p.duration}分钟`,
            状态: p.status === "published" ? "已发布" : "草稿",
          },
        };
      }
    } else if (resourceType === "lecture") {
      const l = db.read("lectures").find((x) => x.id === resourceId) as Lecture | undefined;
      if (l) {
        snapshot = {
          title: l.title,
          description: l.description,
          contentSnapshot: JSON.stringify({ sections: l.sections }),
          chapterIds: l.chapterIds,
          knowledgePointIds: l.knowledgePointIds,
          grade: l.grade,
          schoolYear: l.schoolYear,
          meta: {
            节数: String(l.sections.length),
            状态: l.status === "published" ? "已发布" : "草稿",
          },
        };
      }
    } else if (resourceType === "courseware") {
      const c = db.read("coursewares").find((x) => x.id === resourceId) as Courseware | undefined;
      if (c) {
        snapshot = {
          title: c.title,
          description: c.description,
          contentSnapshot: c.content,
          chapterIds: c.chapterIds,
          knowledgePointIds: c.knowledgePointIds,
          grade: c.grade,
          schoolYear: c.schoolYear,
          meta: {
            类型: c.type,
            标签: c.tags.join("、"),
          },
        };
      }
    } else if (resourceType === "material") {
      const m = db.read("materials").find((x) => x.id === resourceId) as Material | undefined;
      if (m) {
        snapshot = {
          title: m.title,
          description: m.description,
          contentSnapshot: m.content,
          chapterIds: m.chapterIds,
          knowledgePointIds: m.knowledgePointIds,
          grade: m.grade,
          schoolYear: m.schoolYear,
          meta: {
            类型: m.type,
            标签: m.tags.join("、"),
          },
        };
      }
    } else if (resourceType === "question") {
      const q = db.read("questions").find((x) => x.id === resourceId) as Question | undefined;
      if (q) {
        snapshot = {
          title: q.stem.slice(0, 60),
          contentSnapshot: JSON.stringify({
            stem: q.stem,
            options: q.options,
            answer: q.answer,
            analysis: q.analysis,
            type: q.type,
            difficulty: q.difficulty,
          }),
          chapterIds: q.chapterIds,
          knowledgePointIds: q.knowledgePointIds,
          grade: q.grade,
          schoolYear: q.schoolYear,
          meta: {
            题型: q.type,
            难度: String(q.difficulty),
            推荐度: String(q.recommendation),
          },
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
      backupReason,
      ...snapshot,
    });
  },

  /**
   * 另存为我的资源：将一份校本备份复制为当前教师自己的资源
   * 所有老师均可调用（不限备课组长权限）
   * 优先使用源资源进行完整复制；若源资源已被删除，则从 contentSnapshot 尽量还原
   * 返回新资源的类型与ID
   */
  async saveAsOwnResource(
    backupId: string,
    teacher: Teacher,
  ): Promise<{ newResourceId: string; resourceType: SchoolBackupResourceType }> {
    await delay(300);
    maybeThrowError();
    const backup = db.read("schoolBackups").find((b) => b.id === backupId);
    if (!backup) throw new Error("备份不存在或已被删除");

    const now = new Date().toISOString();
    const teacherId = teacher.id;
    const schoolId = teacher.schoolId || backup.schoolId;
    let newResourceId = "";

    switch (backup.resourceType) {
      case "question": {
        // 优先从源题库读取，找不到时从快照还原
        let original = db.read("questions").find((q) => q.id === backup.sourceResourceId);
        let snapshotData: any = null;
        if (!original) {
          try { snapshotData = JSON.parse(backup.contentSnapshot); } catch { /* ignore */ }
        }
        if (!original && snapshotData) {
          original = {
            id: backup.sourceResourceId,
            teacherId: backup.fromTeacherId,
            schoolId: backup.schoolId,
            type: snapshotData.type,
            stem: snapshotData.stem || backup.title,
            options: snapshotData.options,
            answer: snapshotData.answer || "",
            analysis: snapshotData.analysis || "",
            chapterIds: backup.chapterIds,
            knowledgePointIds: backup.knowledgePointIds,
            difficulty: snapshotData.difficulty || 3,
            recommendation: 3,
            usageCount: 0,
            remark: "",
            remarks: [],
            grade: backup.grade,
            schoolYear: backup.schoolYear,
            isShared: false,
            createdAt: backup.createdAt,
            updatedAt: backup.createdAt,
          } as Question;
        }
        if (!original) throw new Error("无法还原题目，源资源已删除且快照不完整");

        newResourceId = genId("q");
        const copy: Question = {
          ...original,
          id: newResourceId,
          teacherId,
          schoolId,
          usageCount: 0,
          isShared: false,
          sourceType: "shared",
          duplicateHash: computeDuplicateHash(original.stem, original.answer, original.options),
          hiddenByExamIds: [],
          lastUsedAt: undefined,
          createdAt: now,
          updatedAt: now,
        };
        db.update("questions", (list) => [...list, copy]);
        break;
      }
      case "examPaper": {
        const original = db.read("examPapers").find((p) => p.id === backup.sourceResourceId);
        if (!original) throw new Error("无法还原试卷，源资源已删除");
        newResourceId = genId("exam");
        const copy: ExamPaper = {
          ...original,
          id: newResourceId,
          teacherId,
          schoolId,
          status: "draft",
          createdAt: now,
          updatedAt: now,
        };
        db.update("examPapers", (list) => [...list, copy]);
        break;
      }
      case "lecture": {
        const original = db.read("lectures").find((l) => l.id === backup.sourceResourceId);
        if (!original) throw new Error("无法还原讲义，源资源已删除");
        newResourceId = genId("lec");
        const copy: Lecture = {
          ...original,
          id: newResourceId,
          teacherId,
          schoolId,
          status: "draft",
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        db.update("lectures", (list) => [...list, copy]);
        break;
      }
      case "courseware": {
        const original = db.read("coursewares").find((c) => c.id === backup.sourceResourceId);
        if (!original) throw new Error("无法还原课件，源资源已删除");
        newResourceId = genId("cw");
        const copy: Courseware = {
          ...original,
          id: newResourceId,
          teacherId,
          schoolId,
          createdAt: now,
          updatedAt: now,
        };
        db.update("coursewares", (list) => [...list, copy]);
        break;
      }
      case "material": {
        const original = db.read("materials").find((m) => m.id === backup.sourceResourceId);
        if (!original) throw new Error("无法还原素材，源资源已删除");
        newResourceId = genId("mat");
        const copy: Material = {
          ...original,
          id: newResourceId,
          teacherId,
          schoolId,
          createdAt: now,
          updatedAt: now,
        };
        db.update("materials", (list) => [...list, copy]);
        break;
      }
    }

    return { newResourceId, resourceType: backup.resourceType };
  },
};
