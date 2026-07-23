import { db } from "./db";
import { genId, delay } from "./_shared";
import { schoolBackupService } from "./schoolBackup";
import type {
  ShareRecord, ShareableResourceType, ShareScope, ShareStatus,
  Question, ExamPaper, Lecture, Courseware, Material,
} from "@/types";

/**
 * 资源分享服务
 * 支持将资源分享给同校老师、好友或不确定对象
 * 不确定对象如果也使用本平台，可通过"接受分享"添加到自己的资源库
 * 当分享范围包含学校或公开时，自动备份到校本资源库
 */
export const shareService = {
  /** 发起分享 */
  async createShare(params: {
    fromTeacherId: string;
    fromSchoolId: string;
    toTeacherId?: string;
    toSchoolId?: string;
    scope: ShareScope;
    resourceType: ShareableResourceType;
    resourceId: string;
    resourceTitle: string;
    message?: string;
    expiresAt?: string;
  }): Promise<ShareRecord> {
    await delay(200);
    const now = new Date().toISOString();
    const record: ShareRecord = {
      id: genId("share"),
      fromTeacherId: params.fromTeacherId,
      fromSchoolId: params.fromSchoolId,
      toTeacherId: params.toTeacherId,
      toSchoolId: params.toSchoolId,
      scope: params.scope,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      resourceTitle: params.resourceTitle,
      message: params.message,
      status: "pending",
      createdAt: now,
      expiresAt: params.expiresAt,
    };
    db.update("shareRecords", (list) => [...list, record]);

    // 当分享范围为"学校"或"公开"时，自动备份到校本资源库
    if (params.scope === "school" || params.scope === "public") {
      try {
        const scopeLabel = params.scope === "school" ? "校内分享" : "公开分享";
        await schoolBackupService.autoBackupForResource(
          params.fromSchoolId,
          params.fromTeacherId,
          params.resourceType,
          params.resourceId,
          [], // 分享场景不针对特定班级
          `${scopeLabel}：${params.resourceTitle}`,
        );
      } catch (e) {
        console.error("校本备份失败（不影响分享）", e);
      }
    }

    return record;
  },

  /** 查询收到的分享（待接受） */
  async listIncomingShares(teacherId: string): Promise<ShareRecord[]> {
    await delay(100);
    return db
      .read("shareRecords")
      .filter(
        (s) =>
          (s.toTeacherId === teacherId || s.scope === "public") &&
          s.status === "pending",
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /** 查询发出的分享 */
  async listOutgoingShares(teacherId: string): Promise<ShareRecord[]> {
    await delay(100);
    return db
      .read("shareRecords")
      .filter((s) => s.fromTeacherId === teacherId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /** 接受分享：将资源复制到自己的资源库 */
  async acceptShare(
    shareId: string,
    toTeacherId: string,
    toSchoolId: string,
  ): Promise<{ newResourceId: string; resourceType: ShareableResourceType }> {
    await delay(300);
    const share = db.read("shareRecords").find((s) => s.id === shareId);
    if (!share) throw new Error("分享记录不存在");
    if (share.status !== "pending") throw new Error("该分享已处理");

    const now = new Date().toISOString();
    let newResourceId = "";

    // 根据资源类型复制资源到接收者的资源库
    switch (share.resourceType) {
      case "question": {
        const original = db.read("questions").find((q) => q.id === share.resourceId);
        if (original) {
          newResourceId = genId("q");
          const copy: Question = {
            ...original,
            id: newResourceId,
            teacherId: toTeacherId,
            schoolId: toSchoolId,
            usageCount: 0,
            isShared: false,
            sourceType: "shared",
            createdAt: now,
            updatedAt: now,
          };
          db.update("questions", (list) => [...list, copy]);
        }
        break;
      }
      case "examPaper": {
        const original = db.read("examPapers").find((p) => p.id === share.resourceId);
        if (original) {
          newResourceId = genId("exam");
          const copy: ExamPaper = {
            ...original,
            id: newResourceId,
            teacherId: toTeacherId,
            schoolId: toSchoolId,
            status: "draft",
            createdAt: now,
            updatedAt: now,
          };
          db.update("examPapers", (list) => [...list, copy]);
        }
        break;
      }
      case "lecture": {
        const original = db.read("lectures").find((l) => l.id === share.resourceId);
        if (original) {
          newResourceId = genId("lec");
          const copy: Lecture = {
            ...original,
            id: newResourceId,
            teacherId: toTeacherId,
            schoolId: toSchoolId,
            status: "draft",
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          db.update("lectures", (list) => [...list, copy]);
        }
        break;
      }
      case "courseware": {
        const original = db.read("coursewares").find((c) => c.id === share.resourceId);
        if (original) {
          newResourceId = genId("cw");
          const copy: Courseware = {
            ...original,
            id: newResourceId,
            teacherId: toTeacherId,
            schoolId: toSchoolId,
            createdAt: now,
            updatedAt: now,
          };
          db.update("coursewares", (list) => [...list, copy]);
        }
        break;
      }
      case "material": {
        const original = db.read("materials").find((m) => m.id === share.resourceId);
        if (original) {
          newResourceId = genId("mat");
          const copy: Material = {
            ...original,
            id: newResourceId,
            teacherId: toTeacherId,
            schoolId: toSchoolId,
            createdAt: now,
            updatedAt: now,
          };
          db.update("materials", (list) => [...list, copy]);
        }
        break;
      }
    }

    // 更新分享记录状态
    db.update("shareRecords", (list) =>
      list.map((s) =>
        s.id === shareId
          ? { ...s, status: "accepted" as ShareStatus, acceptedAt: now, acceptedResourceId: newResourceId }
          : s,
      ),
    );

    return { newResourceId, resourceType: share.resourceType };
  },

  /** 拒绝分享 */
  async rejectShare(shareId: string): Promise<void> {
    await delay(100);
    db.update("shareRecords", (list) =>
      list.map((s) => (s.id === shareId ? { ...s, status: "rejected" as ShareStatus } : s)),
    );
  },

  /** 撤回分享 */
  async revokeShare(shareId: string): Promise<void> {
    await delay(100);
    db.update("shareRecords", (list) => list.filter((s) => s.id !== shareId));
  },
};
