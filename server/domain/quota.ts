import type {
  CreditTransaction,
  ExamUsageQuotaKey,
  PlatformCreditSettings,
  ResourceQuotaKey,
  ResourceQuotaStatus,
  ShareRecord,
  Teacher,
  UserQuotaOverrides,
  UserQuotaSnapshot,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";

export const DEFAULT_RESOURCE_CAPACITIES: Record<ResourceQuotaKey, number> = {
  question: 10_000,
  examPaper: 1_000,
  lecture: 1_000,
  courseware: 1_000,
  material: 1_000,
};

export const DEFAULT_EXAM_REMAINING_USES = 50;

const RESOURCE_KEYS: ResourceQuotaKey[] = [
  "question",
  "examPaper",
  "lecture",
  "courseware",
  "material",
];

export const DEFAULT_CREDIT_SETTINGS: PlatformCreditSettings = {
  donationCredits: {
    question: 1,
    examPaper: 1,
    lecture: 1,
    courseware: 1,
    material: 1,
  },
  capacityPerCredit: {
    question: 10,
    examPaper: 10,
    lecture: 10,
    courseware: 10,
    material: 10,
  },
};

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

function normalizedPositiveInteger(value: unknown, label: string): number {
  const normalized = normalizedNonNegativeInteger(value, label);
  if (normalized < 1) throw new Error(`${label}必须大于 0`);
  return normalized;
}

function creditTransactions(): CreditTransaction[] {
  const value = db.read("creditTransactions");
  return Array.isArray(value) ? value as CreditTransaction[] : [];
}

function normalizeCreditSettings(value: unknown): PlatformCreditSettings {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<PlatformCreditSettings>
    : {};
  const donationCredits = { ...DEFAULT_CREDIT_SETTINGS.donationCredits };
  const capacityPerCredit = { ...DEFAULT_CREDIT_SETTINGS.capacityPerCredit };
  for (const key of RESOURCE_KEYS) {
    const donation = record.donationCredits?.[key];
    if (typeof donation === "number" && Number.isInteger(donation) && donation >= 0) {
      donationCredits[key] = donation;
    }
    const capacity = record.capacityPerCredit?.[key];
    if (typeof capacity === "number" && Number.isInteger(capacity) && capacity > 0) {
      capacityPerCredit[key] = capacity;
    }
  }
  return { donationCredits, capacityPerCredit };
}

export function getCreditSettingsInternal(): PlatformCreditSettings {
  const records = db.read("platformCreditSettings");
  if (!Array.isArray(records)) return structuredClone(DEFAULT_CREDIT_SETTINGS);
  const record = records.find((item: { id?: string }) => item?.id === "platform-credit-settings") as
    | ({ donationCredits?: PlatformCreditSettings["donationCredits"]; capacityPerCredit?: PlatformCreditSettings["capacityPerCredit"] })
    | undefined;
  return normalizeCreditSettings(record);
}

export function getCreditBalance(teacherId: string): number {
  return creditTransactions()
    .filter((transaction) => transaction.teacherId === teacherId)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function redeemedCapacity(teacherId: string, resourceType: ResourceQuotaKey): number {
  return creditTransactions()
    .filter((transaction) => (
      transaction.teacherId === teacherId
      && transaction.kind === "redemption"
      && transaction.resourceType === resourceType
    ))
    .reduce((sum, transaction) => sum + (transaction.capacityGranted || 0), 0);
}

function appendCreditTransaction(transaction: Omit<CreditTransaction, "id" | "createdAt">): CreditTransaction {
  const created: CreditTransaction = {
    id: genId("credit"),
    createdAt: new Date().toISOString(),
    ...transaction,
  };
  db.update("creditTransactions", (items: CreditTransaction[] | undefined) => [...(items || []), created]);
  return created;
}

export function awardDonationCredits(
  teacherId: string,
  sourceResourceId: string,
  resourceType: ResourceQuotaKey,
): number {
  teacherById(teacherId);
  const existing = creditTransactions().find((transaction) => (
    transaction.kind === "donation"
    && transaction.teacherId === teacherId
    && transaction.resourceType === resourceType
    && transaction.sourceId === sourceResourceId
  ));
  if (existing) return existing.amount;

  const amount = getCreditSettingsInternal().donationCredits[resourceType];
  if (amount <= 0) return 0;
  appendCreditTransaction({
    teacherId,
    amount,
    kind: "donation",
    resourceType,
    sourceId: sourceResourceId,
  });
  return amount;
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
  const creditCapacityBonus = redeemedCapacity(teacherId, key);
  const capacity = baseCapacity + creditCapacityBonus;
  return {
    key,
    used,
    baseCapacity,
    creditCapacityBonus,
    effectiveDonations: 0,
    donationBonus: creditCapacityBonus,
    capacity,
    remaining: Math.max(0, capacity - used),
  };
}

export function buildQuotaSnapshot(teacherId: string): UserQuotaSnapshot {
  const teacher = teacherById(teacherId);
  const examRemaining = teacher.quotaOverrides?.examRemainingUses || {};
  return {
    teacherId,
    creditBalance: getCreditBalance(teacherId),
    creditSettings: getCreditSettingsInternal(),
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
    + "，可使用积分兑换扩容或联系平台超级管理员调整",
  );
}

export function recordDonationDownload(donationId: string, downloaderTeacherId: string): void {
  db.update("shareRecords", (records: ShareRecord[] | undefined) => (records || []).map((record) => {
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

function validateCreditSettings(settings: PlatformCreditSettings): PlatformCreditSettings {
  const donationCredits = { ...DEFAULT_CREDIT_SETTINGS.donationCredits };
  const capacityPerCredit = { ...DEFAULT_CREDIT_SETTINGS.capacityPerCredit };
  for (const key of RESOURCE_KEYS) {
    donationCredits[key] = normalizedNonNegativeInteger(
      settings?.donationCredits?.[key],
      `${RESOURCE_LABELS[key]}捐赠奖励积分`,
    );
    capacityPerCredit[key] = normalizedPositiveInteger(
      settings?.capacityPerCredit?.[key],
      `${RESOURCE_LABELS[key]}每积分兑换容量`,
    );
  }
  return { donationCredits, capacityPerCredit };
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

  async getCreditSettings(): Promise<PlatformCreditSettings> {
    return getCreditSettingsInternal();
  },

  async updateCreditSettings(
    settings: PlatformCreditSettings,
    teacher: Teacher,
  ): Promise<PlatformCreditSettings> {
    if (!isPlatformAdmin(teacher)) throw new Error("仅平台超级管理员可以调整积分规则");
    const validated = validateCreditSettings(settings);
    db.write("platformCreditSettings", [{ id: "platform-credit-settings", ...validated }]);
    return validated;
  },

  async grantCredits(
    targetTeacherId: string,
    amount: number,
    teacher: Teacher,
  ): Promise<UserQuotaSnapshot> {
    if (!isPlatformAdmin(teacher)) throw new Error("仅平台超级管理员可以赠送积分");
    teacherById(targetTeacherId);
    const normalized = normalizedPositiveInteger(amount, "赠送积分");
    appendCreditTransaction({
      teacherId: targetTeacherId,
      amount: normalized,
      kind: "admin_grant",
      createdByTeacherId: teacher.id,
    });
    return buildQuotaSnapshot(targetTeacherId);
  },

  async redeemCredits(
    resourceType: ResourceQuotaKey,
    credits: number,
    teacher: Teacher,
  ): Promise<UserQuotaSnapshot> {
    if (!RESOURCE_KEYS.includes(resourceType)) throw new Error("未知资源库类型");
    teacherById(teacher.id);
    const normalized = normalizedPositiveInteger(credits, "兑换积分");
    const balance = getCreditBalance(teacher.id);
    if (normalized > balance) throw new Error(`积分不足（当前 ${balance} 分）`);
    const capacityGranted = normalized * getCreditSettingsInternal().capacityPerCredit[resourceType];
    appendCreditTransaction({
      teacherId: teacher.id,
      amount: -normalized,
      kind: "redemption",
      resourceType,
      capacityGranted,
    });
    return buildQuotaSnapshot(teacher.id);
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
