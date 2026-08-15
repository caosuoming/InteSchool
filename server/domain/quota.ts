import type {
  ExamUsageQuotaKey,
  ResourceQuotaKey,
  ResourceQuotaStatus,
  Teacher,
  UserQuotaOverrides,
  UserQuotaSnapshot,
  ShareRecord,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";

export const DEFAULT_RESOURCE_CAPACITIES: Record<ResourceQuotaKey, number> = {
  question: 10_000,
  examPaper: 1_000,
  lecture: 1_000,
  courseware: 1_000,
  material: 1_000,
};

export const DEFAULT_EXAM_REMAINING_USES = 50;
export const EFFECTIVE_DONATION_DOWNLOAD_THRESHOLD = 5;
export const EFFECTIVE_DONATION_CAPACITY_BONUS = 10;

const RESOURCE_COLLECTIONS: Record<ResourceQuotaKey, string> = {
  question: "questions",
  examPaper: "examPapers",
  lecture: "lectures",
  courseware: "coursewares",
  material: "materials",
};

const RESOURCE_LABELS: Record<ResourceQuotaKey, string> = {
  question: "题库",
  examPaper: "试卷库",
  lecture: "讲义库",
  courseware: "课件库",
  material: "素材库",
};

const EXAM_USAGE_LABELS: Record<ExamUsageQuotaKey, string> = {
  examRoom: "考场布置",
  invigilation: "监考表",
  gradeStatistics: "成绩统计",
};

function currentRole(teacher: Teacher): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return affiliation?.role || teacher.role;
}

function isPlatformAdmin(teacher: Teacher): boolean {
  return currentRole(teacher) === "platform_admin";
}

function teachers(): Teacher[] {
  const value = db.read("teachers");
  return Array.isArray(value) ? value as Teacher[] : [];
}

function teacherById(teacherId: string): Teacher {
  const teacher = teachers().find((item) => item.id === teacherId);
  if (!teacher) throw new Error("用户不存在");
  return teacher;
}

function normalizedNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label}必须是非负整数`);
  }
  return value;
}

function effectiveDonationCount(teacherId: string, resourceType: ResourceQuotaKey): number {
  const records = db.read("shareRecords");
  if (!Array.isArray(records)) return 0;
  return (records as ShareRecord[]).filter((record) => {
    if (
      record.kind !== "donation"
      || record.fromTeacherId !== teacherId
      || record.resourceType !== resourceType
      || record.mergedIntoDonationId
      || record.status !== "pending"
      || !record.resourceSnapshot
    ) return false;
    const downloaders = new Set(
      (record.downloadedByTeacherIds || []).filter((id) => id && id !== teacherId),
    );
    return downloaders.size >= EFFECTIVE_DONATION_DOWNLOAD_THRESHOLD;
  }).length;
}

function resourceStatusForTeacherId(
  teacherId: string,
  key: ResourceQuotaKey,
  teacher?: Teacher,
): ResourceQuotaStatus {
  const records = db.read(RESOURCE_COLLECTIONS[key]);
  const used = Array.isArray(records)
    ? records.filter((record: { teacherId?: string }) => record.teacherId === teacherId).length
    : 0;
  const configured = teacher?.quotaOverrides?.resourceBaseCapacities?.[key];
  const baseCapacity = configured === undefined ? DEFAULT_RESOURCE_CAPACITIES[key] : configured;
  const effectiveDonations = effectiveDonationCount(teacherId, key);
  const donationBonus = effectiveDonations * EFFECTIVE_DONATION_CAPACITY_BONUS;
  const capacity = baseCapacity + donationBonus;
  return {
    key,
    used,
    baseCapacity,
    effectiveDonations,
    donationBonus,
    capacity,
    remaining: Math.max(0, capacity - used),
  };
}

export function buildQuotaSnapshot(teacherId: string): UserQuotaSnapshot {
  const teacher = teacherById(teacherId);
  const examRemaining = teacher.quotaOverrides?.examRemainingUses || {};
  return {
    teacherId,
    resources: {
      question: resourceStatusForTeacherId(teacherId, "question", teacher),
      examPaper: resourceStatusForTeacherId(teacherId, "examPaper", teacher),
      lecture: resourceStatusForTeacherId(teacherId, "lecture", teacher),
      courseware: resourceStatusForTeacherId(teacherId, "courseware", teacher),
      material: resourceStatusForTeacherId(teacherId, "material", teacher),
    },
    exam: {
      examRoom: {
        key: "examRoom",
        remaining: examRemaining.examRoom ?? DEFAULT_EXAM_REMAINING_USES,
      },
      invigilation: {
        key: "invigilation",
        remaining: examRemaining.invigilation ?? DEFAULT_EXAM_REMAINING_USES,
      },
      gradeStatistics: {
        key: "gradeStatistics",
        remaining: examRemaining.gradeStatistics ?? DEFAULT_EXAM_REMAINING_USES,
      },
    },
  };
}

export function assertResourceCapacity(
  teacherId: string,
  resourceType: ResourceQuotaKey,
  additional = 1,
): void {
  const requested = normalizedNonNegativeInteger(additional, "新增数量");
  if (requested === 0) return;
  // Some legacy data/tests can contain resources before their owner record is loaded.
  // Capacity enforcement still applies using the documented defaults in that case;
  // public quota APIs continue to require a real user via buildQuotaSnapshot().
  const teacher = teachers().find((item) => item.id === teacherId);
  const status = resourceStatusForTeacherId(teacherId, resourceType, teacher);
  if (status.used + requested <= status.capacity) return;
  throw new Error(
    `${RESOURCE_LABELS[resourceType]}容量不足（已使用 ${status.used}/${status.capacity}，本次需新增 ${requested}）`
    + "，可通过有效捐赠扩容或联系平台超级管理员调整",
  );
}

export function recordDonationDownload(donationId: string, downloaderTeacherId: string): void {
  db.update("shareRecords", (records: ShareRecord[]) => records.map((record) => {
    if (
      record.id !== donationId
      || record.kind !== "donation"
      || record.mergedIntoDonationId
      || record.fromTeacherId === downloaderTeacherId
    ) return record;
    const downloadedByTeacherIds = [...new Set([
      ...(record.downloadedByTeacherIds || []),
      downloaderTeacherId,
    ])];
    return { ...record, downloadedByTeacherIds };
  }));
}

export function consumeExamUsageInternal(
  teacherId: string,
  feature: ExamUsageQuotaKey,
): number {
  const teacher = teacherById(teacherId);
  const snapshot = buildQuotaSnapshot(teacherId);
  const remaining = snapshot.exam[feature].remaining;
  if (remaining <= 0) {
    throw new Error(`${EXAM_USAGE_LABELS[feature]}可使用次数已用完，请联系平台超级管理员调整`);
  }
  const nextRemaining = remaining - 1;
  db.update("teachers", (items: Teacher[]) => items.map((item) => {
    if (item.id !== teacher.id) return item;
    return {
      ...item,
      quotaOverrides: {
        ...item.quotaOverrides,
        resourceBaseCapacities: { ...(item.quotaOverrides?.resourceBaseCapacities || {}) },
        examRemainingUses: {
          ...(item.quotaOverrides?.examRemainingUses || {}),
          [feature]: nextRemaining,
        },
      },
    };
  }));
  return nextRemaining;
}

function validateQuotaPatch(patch: UserQuotaOverrides): UserQuotaOverrides {
  const resourceBaseCapacities: UserQuotaOverrides["resourceBaseCapacities"] = {};
  const examRemainingUses: UserQuotaOverrides["examRemainingUses"] = {};
  for (const key of Object.keys(patch.resourceBaseCapacities || {}) as ResourceQuotaKey[]) {
    resourceBaseCapacities[key] = normalizedNonNegativeInteger(
      patch.resourceBaseCapacities?.[key],
      `${RESOURCE_LABELS[key]}基础容量`,
    );
  }
  for (const key of Object.keys(patch.examRemainingUses || {}) as ExamUsageQuotaKey[]) {
    examRemainingUses[key] = normalizedNonNegativeInteger(
      patch.examRemainingUses?.[key],
      `${EXAM_USAGE_LABELS[key]}可使用次数`,
    );
  }
  return { resourceBaseCapacities, examRemainingUses };
}

export const quotaService = {
  async getQuota(targetTeacherId: string, teacher: Teacher): Promise<UserQuotaSnapshot> {
    if (targetTeacherId !== teacher.id && !isPlatformAdmin(teacher)) {
      throw new Error("只能查看自己的使用量");
    }
    return buildQuotaSnapshot(targetTeacherId);
  },

  async updateQuota(
    targetTeacherId: string,
    patch: UserQuotaOverrides,
    teacher: Teacher,
  ): Promise<UserQuotaSnapshot> {
    if (!isPlatformAdmin(teacher)) throw new Error("仅平台超级管理员可以调整用户使用量");
    teacherById(targetTeacherId);
    const validated = validateQuotaPatch(patch || {});
    db.update("teachers", (items: Teacher[]) => items.map((item) => (
      item.id === targetTeacherId
        ? {
          ...item,
          quotaOverrides: {
            resourceBaseCapacities: {
              ...(item.quotaOverrides?.resourceBaseCapacities || {}),
              ...(validated.resourceBaseCapacities || {}),
            },
            examRemainingUses: {
              ...(item.quotaOverrides?.examRemainingUses || {}),
              ...(validated.examRemainingUses || {}),
            },
          },
        }
        : item
    )));
    return buildQuotaSnapshot(targetTeacherId);
  },

  async consumeExamUsage(
    teacherId: string,
    feature: ExamUsageQuotaKey,
  ): Promise<{ key: ExamUsageQuotaKey; remaining: number }> {
    if (!(["examRoom", "invigilation", "gradeStatistics"] as string[]).includes(feature)) {
      throw new Error("未知考试功能");
    }
    return { key: feature, remaining: consumeExamUsageInternal(teacherId, feature) };
  },
};
