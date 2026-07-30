import { db } from "../runtime-db.js";
import { genId, delay } from "../domain-shared.js";
import { schoolBackupService } from "./schoolBackup.js";
import { classService } from "./class.js";
import type { ExamPublication, ExamPublishTarget } from "../../src/types/index.js";
import { hashPassword, verifyPassword as verifyPasswordHash } from "../lib/password.js";

/**
 * 试卷发布服务（校际统一考试）
 * 支持发布给本校班级或其他学校
 * 正规考试支持密码保护和到期日期
 * 发布时关联题目自动从题库隐藏
 * 当发布给非自己所教班级时，自动备份到校本资源库
 */
export const examPublishService = {
  /** 发布试卷 */
  async publishExam(params: {
    examPaperId: string;
    publisherId: string;
    publisherSchoolId: string;
    title: string;
    targetType: ExamPublishTarget;
    targetClassIds?: string[];
    targetStudentIds?: string[];
    targetSchoolIds?: string[];
    isFormalExam?: boolean;
    viewPassword?: string;
    unlockAt?: string;
    questionIds: string[];
  }): Promise<ExamPublication> {
    await delay(300);
    const now = new Date().toISOString();
    const publication: ExamPublication = {
      id: genId("ep"),
      examPaperId: params.examPaperId,
      publisherId: params.publisherId,
      publisherSchoolId: params.publisherSchoolId,
      title: params.title,
      targetType: params.targetType,
      targetClassIds: params.targetClassIds || [],
      targetStudentIds: params.targetStudentIds || [],
      targetSchoolIds: params.targetSchoolIds || [],
      isFormalExam: params.isFormalExam || false,
      viewPassword: params.viewPassword ? hashPassword(params.viewPassword) : undefined,
      unlockAt: params.unlockAt,
      questionIds: params.questionIds,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    db.update("examPublications", (list) => [...list, publication]);

    // 将关联题目在题库中隐藏（同校老师题库中相同题目也隐藏）
    if (params.questionIds.length > 0) {
      db.update("questions", (list) =>
        list.map((q) => {
          // 通过查重哈希匹配同校老师题库中的相同题目
          const shouldHide =
            params.questionIds.includes(q.id) ||
            (q.schoolId === params.publisherSchoolId &&
              list.some((orig) =>
                params.questionIds.includes(orig.id) &&
                orig.duplicateHash &&
                orig.duplicateHash === q.duplicateHash,
              ));
          if (shouldHide) {
            const hiddenIds = q.hiddenByExamIds || [];
            if (!hiddenIds.includes(publication.id)) {
              return {
                ...q,
                hiddenByExamIds: [...hiddenIds, publication.id],
                updatedAt: now,
              };
            }
          }
          return q;
        }),
      );
    }

    // 校本资源自动备份：发布到非自己所教的班级或学生时，备份试卷和关联题目
    if (params.targetType === "schoolClass") {
      try {
        const [myClassIds, myStudents] = await Promise.all([
          classService.listMyClassIds(params.publisherSchoolId, params.publisherId),
          classService.listMyStudents(params.publisherSchoolId, params.publisherId),
        ]);
        const myStudentIds = new Set(myStudents.map((student) => student.id));
        const nonMyClassIds = (params.targetClassIds || []).filter((id) => !myClassIds.has(id));
        const nonMyStudentIds = (params.targetStudentIds || []).filter((id) => !myStudentIds.has(id));
        if (nonMyClassIds.length > 0 || nonMyStudentIds.length > 0) {
          const reasonParts = [];
          if (nonMyClassIds.length > 0) reasonParts.push(`${nonMyClassIds.length} 个非所教班级`);
          if (nonMyStudentIds.length > 0) reasonParts.push(`${nonMyStudentIds.length} 名非所教学生`);
          // 备份试卷
          await schoolBackupService.autoBackupForResource(
            params.publisherSchoolId,
            params.publisherId,
            "examPaper",
            params.examPaperId,
            nonMyClassIds,
            `试卷发布到${reasonParts.join("、")}`,
            nonMyStudentIds,
          );
          // 备份关联题目（去重）
          const uniqueQuestionIds = Array.from(new Set(params.questionIds));
          for (const qid of uniqueQuestionIds) {
            await schoolBackupService.autoBackupForResource(
              params.publisherSchoolId,
              params.publisherId,
              "question",
              qid,
              nonMyClassIds,
              `随试卷「${params.title}」发布`,
              nonMyStudentIds,
            );
          }
        }
      } catch (e) {
        console.error("校本备份失败（不影响发布）", e);
      }
    }

    return publication;
  },

  /** 查询已发布的考试 */
  async listPublications(schoolId?: string): Promise<ExamPublication[]> {
    await delay(100);
    return db
      .read("examPublications")
      .filter((p) => !schoolId || p.publisherSchoolId === schoolId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /** 验证查看密码 */
  async verifyPassword(publicationId: string, password: string): Promise<boolean> {
    await delay(100);
    const pub = db.read("examPublications").find((p) => p.id === publicationId);
    if (!pub) return false;
    if (!pub.isFormalExam || !pub.viewPassword) return true;
    return verifyPasswordHash(password, pub.viewPassword);
  },

  /** 检查考试是否已解锁（到期日期已过） */
  isUnlocked(publication: ExamPublication): boolean {
    if (!publication.unlockAt) return true;
    return new Date() >= new Date(publication.unlockAt);
  },

  /** 撤回发布（解锁隐藏的题目） */
  async revokePublication(publicationId: string): Promise<void> {
    await delay(200);
    const now = new Date().toISOString();
    const pub = db.read("examPublications").find((p) => p.id === publicationId);
    if (!pub) return;

    // 解除题目隐藏
    db.update("questions", (list) =>
      list.map((q) => {
        if (q.hiddenByExamIds && q.hiddenByExamIds.includes(publicationId)) {
          return {
            ...q,
            hiddenByExamIds: q.hiddenByExamIds.filter((id) => id !== publicationId),
            updatedAt: now,
          };
        }
        return q;
      }),
    );

    // 更新发布状态
    db.update("examPublications", (list) =>
      list.map((p) =>
        p.id === publicationId ? { ...p, status: "revoked" as const, updatedAt: now } : p,
      ),
    );
  },

  /** 自动过期检查：到期后自动解锁题目 */
  async checkExpiry(): Promise<void> {
    const now = new Date();
    const pubs = db.read("examPublications").filter(
      (p) => p.status === "active" && p.unlockAt && new Date(p.unlockAt) <= now,
    );
    if (pubs.length === 0) return;

    for (const pub of pubs) {
      db.update("questions", (list) =>
        list.map((q) => {
          if (q.hiddenByExamIds && q.hiddenByExamIds.includes(pub.id)) {
            return {
              ...q,
              hiddenByExamIds: q.hiddenByExamIds.filter((id) => id !== pub.id),
              updatedAt: now.toISOString(),
            };
          }
          return q;
        }),
      );
      db.update("examPublications", (list) =>
        list.map((p) =>
          p.id === pub.id ? { ...p, status: "expired" as const, updatedAt: now.toISOString() } : p,
        ),
      );
    }
  },
};
