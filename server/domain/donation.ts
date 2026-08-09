import type {
  DonationCheckResult,
  DonationDecision,
  DonationItem,
  DonorStatus,
  PlatformAttributeOption,
  PlatformAttributeOptionType,
  PlatformDonation,
  PlatformResourceSnapshot,
  PlatformSaveCheckResult,
  PlatformSaveDecision,
  PlatformSaveResult,
  Question,
  ShareRecord,
  ShareableResourceType,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { shareService } from "./share.js";
import { createNotification } from "./notification.js";

const resourceCollections: Record<ShareableResourceType, string> = {
  question: "questions",
  examPaper: "examPapers",
  lecture: "lectures",
  courseware: "coursewares",
  material: "materials",
};

function sourceSnapshot(record: ShareRecord): PlatformResourceSnapshot {
  if (record.resourceSnapshot) return structuredClone(record.resourceSnapshot);
  const sourceId = record.sourceResourceId || record.resourceId;
  const source = (db.read(resourceCollections[record.resourceType]) || [])
    .find((item: { id: string }) => item.id === sourceId);
  if (!source) throw new Error("捐赠源资源不存在");
  return structuredClone(source) as PlatformResourceSnapshot;
}

function teacherNickname(teacherId: string): string {
  return (db.read("teachers") || [])
    .find((item: { id: string; nickname?: string }) => item.id === teacherId)
    ?.nickname?.trim() || "匿名用户";
}

function teacherSubject(teacherId: string): string {
  const teacher = (db.read("teachers") || [])
    .find((item: { id: string }) => item.id === teacherId) as {
      subject?: string;
      affiliations?: Array<Record<string, unknown>>;
      currentAffiliationId?: string | null;
    } | undefined;
  const affiliation = teacher?.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher?.affiliations?.find((item) => item.isCurrent === true);
  return (typeof affiliation?.subject === "string" ? affiliation.subject : teacher?.subject)?.trim() || "未分类";
}

function toPlatformDonation(record: ShareRecord): PlatformDonation {
  const snapshot = sourceSnapshot(record);
  return {
    id: record.id,
    donorTeacherId: record.fromTeacherId,
    donorSchoolId: record.fromSchoolId,
    donorNickname: teacherNickname(record.fromTeacherId),
    resourceType: record.resourceType,
    sourceResourceId: record.sourceResourceId || record.resourceId,
    subject: record.platformSubject?.trim() || teacherSubject(record.fromTeacherId),
    order: record.platformOrder || 0,
    status: record.mergedIntoDonationId ? "merged" : "active",
    mergedIntoDonationId: record.mergedIntoDonationId,
    snapshot,
    contributorTeacherIds: [record.fromTeacherId],
    createdAt: record.createdAt,
    updatedAt: snapshot.updatedAt || record.createdAt,
  };
}

function ownedQuestion(teacherId: string, resourceId: string): Question {
  const question = (db.read("questions") as Question[]).find((item) =>
    item.id === resourceId && item.teacherId === teacherId,
  );
  if (!question) throw new Error("待捐赠题目不存在");
  return question;
}

const settingTypeMap: Partial<Record<PlatformAttributeOptionType, "grade" | "schoolYear" | "questionType">> = {
  grade: "grade",
  schoolYear: "schoolYear",
  questionType: "questionType",
};

export const donationService = {
  async listDonations(teacherId?: string): Promise<PlatformDonation[]> {
    return (await shareService.listPublicDonations(teacherId)).map(toPlatformDonation);
  },

  async listTeacherDonations(teacherId: string): Promise<PlatformDonation[]> {
    return (await shareService.listDonationStatus(teacherId)).map(toPlatformDonation);
  },

  async getDonorStatus(teacherId: string): Promise<DonorStatus> {
    const privileges = await shareService.getDonationPrivileges(teacherId);
    return {
      donationCount: privileges.donationCount,
      rank: privileges.rank,
      isTopTen: privileges.isTopContributor,
    };
  },

  async getCatalogTrees(teacherId: string) {
    const [chapterTree, knowledgeTree] = await Promise.all([
      shareService.getPlatformDirectoryTree("chapter", teacherId),
      shareService.getPlatformDirectoryTree("knowledge", teacherId),
    ]);
    return { chapterTree, knowledgeTree };
  },

  async checkDonation(
    teacherId: string,
    _schoolId: string,
    items: DonationItem[],
  ): Promise<DonationCheckResult> {
    const previews = await shareService.checkDonationCandidates(teacherId, items);
    const alreadyDonated = previews
      .filter((preview) => preview.alreadyDonated)
      .map((preview) => ({ resourceType: preview.resourceType, resourceId: preview.resourceId }));
    const conflicts = previews.flatMap((preview) => {
      if (preview.resourceType !== "question" || preview.alreadyDonated || preview.duplicates.length === 0) return [];
      const duplicate = preview.duplicates[0];
      return [{
        item: { resourceType: preview.resourceType, resourceId: preview.resourceId },
        similarity: duplicate.similarity,
        sourceQuestion: structuredClone(ownedQuestion(teacherId, preview.resourceId)),
        targetDonationId: duplicate.donationId,
        targetQuestion: structuredClone(duplicate.question),
        targetDonorNickname: duplicate.contributorNickname,
      }];
    });
    return { alreadyDonated, conflicts };
  },

  async donateResources(
    teacherId: string,
    schoolId: string,
    items: DonationItem[],
    decisions: DonationDecision[] = [],
  ): Promise<{ created: PlatformDonation[]; skipped: DonationItem[] }> {
    const decisionsById = new Map(decisions.map((decision) => [decision.sourceResourceId, decision]));
    const previews = await shareService.checkDonationCandidates(teacherId, items);
    const skipped = previews
      .filter((preview) => preview.alreadyDonated)
      .map((preview) => ({ resourceType: preview.resourceType, resourceId: preview.resourceId }));
    const requests = items
      .filter((item) => !skipped.some((entry) => entry.resourceType === item.resourceType && entry.resourceId === item.resourceId))
      .map((item) => {
        const decision = decisionsById.get(item.resourceId);
        if (!decision) return item;
        const toRequestChoice = (choice: typeof decision.fields.answer) =>
          choice === "target" ? "existing" as const : choice;
        return {
          ...item,
          duplicateAction: decision.action === "merge" ? "merge" as const : "add" as const,
          duplicateTargetDonationId: decision.targetDonationId,
          mergeFields: {
            stem: toRequestChoice(decision.fields.stem),
            answer: toRequestChoice(decision.fields.answer),
            analysis: toRequestChoice(decision.fields.analysis),
            summary: toRequestChoice(decision.fields.summary),
          },
        };
      });
    const beforePrivileges = await shareService.getDonationPrivileges(teacherId);
    const records = await shareService.donateResources(teacherId, schoolId, requests);
    const afterPrivileges = await shareService.getDonationPrivileges(teacherId);
    if (records.length > 0 && !beforePrivileges.isTopContributor && afterPrivileges.isTopContributor) {
      createNotification({
        recipientTeacherId: teacherId,
        type: "reward",
        title: "平台资源贡献奖励已解锁",
        content: `你已进入平台资源贡献榜前 30 名，当前排名第 ${afterPrivileges.rank} 名。`,
        actionUrl: "/platform-resources",
      });
    }
    return { created: records.map(toPlatformDonation), skipped };
  },

  async checkSaveAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
  ): Promise<PlatformSaveCheckResult> {
    return shareService.checkSaveAsOwnResource(donationId, teacherId, schoolId);
  },

  async saveAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
    decision?: PlatformSaveDecision,
  ): Promise<PlatformSaveResult> {
    return shareService.saveDonationAsOwnResource(donationId, teacherId, schoolId, decision);
  },

  async updateDonation(
    donationId: string,
    teacherId: string,
    patch: Record<string, unknown>,
  ): Promise<PlatformDonation> {
    const updated = await shareService.updateDonationResource(teacherId, donationId, {
      title: typeof patch.title === "string" ? patch.title : typeof patch.stem === "string" ? patch.stem : undefined,
      description: typeof patch.description === "string" ? patch.description : undefined,
      grade: typeof patch.grade === "string" ? patch.grade : undefined,
      schoolYear: typeof patch.schoolYear === "string" ? patch.schoolYear : undefined,
      originalFileName: typeof patch.originalFileName === "string" ? patch.originalFileName : undefined,
      difficulty: typeof patch.difficulty === "number" ? patch.difficulty as 1 | 2 | 3 | 4 | 5 : undefined,
      recommendation: typeof patch.recommendation === "number" ? patch.recommendation as 1 | 2 | 3 | 4 | 5 : undefined,
    });
    return toPlatformDonation(updated);
  },

  async listAttributeOptions(): Promise<Record<PlatformAttributeOptionType, string[]>> {
    const settings = await shareService.listPlatformResourceSettings();
    const values = Object.fromEntries(settings.map((setting) => [setting.type, setting.values]));
    return {
      grade: values.grade || [],
      schoolYear: values.schoolYear || [],
      questionType: values.questionType || [],
      coursewareType: [],
      materialType: [],
    };
  },

  async updateAttributeOptions(
    teacherId: string,
    type: PlatformAttributeOptionType,
    values: string[],
  ): Promise<PlatformAttributeOption> {
    const mappedType = settingTypeMap[type];
    if (!mappedType) throw new Error("该属性选项由资源类型固定定义");
    const current = await shareService.listPlatformResourceSettings();
    const updated = await shareService.updatePlatformResourceSettings(
      teacherId,
      current.map((setting) => ({
        type: setting.type,
        values: setting.type === mappedType ? values : setting.values,
      })),
    );
    const record = updated.find((setting) => setting.type === mappedType)!;
    return {
      id: record.id,
      type,
      values: record.values,
      updatedByTeacherId: record.updatedByTeacherId || teacherId,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt,
    };
  },
};
