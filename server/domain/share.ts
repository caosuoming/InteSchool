import { db } from "../runtime-db.js";
import { appendCopySuffix, genId, delay } from "../domain-shared.js";
import { schoolBackupService } from "./schoolBackup.js";
import type {
  Chapter,
  Courseware,
  DonationContributor,
  DonationDirectoryEntry,
  DonationDirectorySnapshot,
  DonationPreview,
  DonationPrivileges,
  DonationRequest,
  ExamPaper,
  KnowledgePoint,
  Lecture,
  Material,
  PlatformResourceCorrection,
  PlatformResourceCorrectionAttachment,
  PlatformResourceCorrectionInput,
  PlatformResourceSetting,
  PlatformResourceSettingType,
  PlatformSaveCheckResult,
  PlatformSaveDecision,
  PlatformSaveResult,
  Question,
  ShareRecord,
  ShareableResourceType,
  ShareScope,
  ShareStatus,
  TreeNode,
  ResourceSemester,
} from "../../src/types/index.js";

type ShareableResource = Question | ExamPaper | Lecture | Courseware | Material;
type DonationPatch = Partial<{
  title: string;
  description: string;
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  originalFileName: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  recommendation: 1 | 2 | 3 | 4 | 5;
}>;

const RESOURCE_COLLECTIONS: Record<ShareableResourceType, string> = {
  question: "questions",
  examPaper: "examPapers",
  lecture: "lectures",
  courseware: "coursewares",
  material: "materials",
};

const DEFAULT_PLATFORM_SETTINGS: Record<PlatformResourceSettingType, string[]> = {
  grade: ["初一", "初二", "初三", "高一", "高二", "高三"],
  schoolYear: ["2025-2026", "2024-2025", "2023-2024"],
  source: ["手动", "导入", "共享", "平台捐赠"],
  questionType: ["单选", "多选", "判断", "填空", "解答"],
  category: ["练习", "考试", "作业", "复习"],
};

type PlatformTeacher = {
  id: string;
  role: "teacher" | "school_admin" | "platform_admin";
  subject?: string;
  nickname?: string;
  affiliations?: Array<Record<string, unknown>>;
  currentAffiliationId?: string | null;
  platformModeratorSubjects?: string[];
};

function platformTeachers(): PlatformTeacher[] {
  return (db.read("teachers") || []) as PlatformTeacher[];
}

function platformTeacher(teacherId: string): PlatformTeacher {
  const teacher = platformTeachers().find((item) => item.id === teacherId);
  if (!teacher) throw new Error("教师不存在");
  return teacher;
}

function activeAffiliation(teacher: PlatformTeacher): Record<string, unknown> | undefined {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent === true);
}

function activePlatformRole(teacher: PlatformTeacher): string {
  const affiliation = activeAffiliation(teacher);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function activePlatformSubject(teacher: PlatformTeacher): string {
  const affiliation = activeAffiliation(teacher);
  const subject = typeof affiliation?.subject === "string" ? affiliation.subject : teacher.subject;
  return subject?.trim() || "";
}

function isPlatformAdmin(teacherId: string): boolean {
  return activePlatformRole(platformTeacher(teacherId)) === "platform_admin";
}

function moderatedSubjects(teacherId: string): string[] {
  return [...new Set((platformTeacher(teacherId).platformModeratorSubjects || []).map((item) => item.trim()).filter(Boolean))];
}

function donationSubject(record: ShareRecord): string {
  if (record.platformSubject?.trim()) return record.platformSubject.trim();
  const donor = platformTeachers().find((item) => item.id === record.fromTeacherId);
  return donor ? activePlatformSubject(donor) || "未分类" : "未分类";
}

function canManageSubject(teacherId: string, subject: string): boolean {
  return isPlatformAdmin(teacherId) || moderatedSubjects(teacherId).includes(subject);
}

function visibleSubjectsFor(teacherId: string): string[] | null {
  if (isPlatformAdmin(teacherId)) return null;
  const teacher = platformTeacher(teacherId);
  return [...new Set([activePlatformSubject(teacher), ...moderatedSubjects(teacherId)].filter(Boolean))];
}

function canViewSubject(teacherId: string, subject: string): boolean {
  const visible = visibleSubjectsFor(teacherId);
  return visible === null || visible.includes(subject);
}

function nextPlatformOrder(subject: string): number {
  return primaryDonations()
    .filter((item) => donationSubject(item) === subject)
    .reduce((maximum, item) => Math.max(maximum, item.platformOrder || 0), 0) + 1;
}

function resourceTitle(type: ShareableResourceType, resource: ShareableResource): string {
  return type === "question" ? (resource as Question).stem : (resource as Exclude<ShareableResource, Question>).title;
}

function findOwnedResource(
  type: ShareableResourceType,
  id: string,
  teacherId: string,
  schoolId: string,
): ShareableResource {
  const collection = RESOURCE_COLLECTIONS[type];
  const resource = (db.read(collection) as ShareableResource[]).find((item) => item.id === id);
  if (!resource) throw new Error("捐赠资源不存在");
  if (resource.teacherId !== teacherId || resource.schoolId !== schoolId) {
    throw new Error("无权捐赠不属于自己的资源");
  }
  if (resource.platformSourceDonationIds?.length) {
    throw new Error("从平台资源创建的副本不能再次捐赠");
  }
  return resource;
}

function normalizeForSimilarity(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-zA-Z#0-9]+;/g, "")
    .replace(/\s+/g, "")
    .replace(/[，。、；：！？“”"'（）()【】[\]{}<>《》·…—_+\-=]/g, "")
    .toLowerCase();
}

function levenshteinSimilarity(left: string, right: string): number {
  const a = normalizeForSimilarity(left);
  const b = normalizeForSimilarity(right);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function questionSimilarity(source: Question, existing: Question): number {
  const sourceText = [source.stem, ...(source.options || []), source.answer].join("\n");
  const existingText = [existing.stem, ...(existing.options || []), existing.answer].join("\n");
  return levenshteinSimilarity(sourceText, existingText);
}

type CanonicalMergeChoice = "source" | "target" | "both";

function mergeTextField(
  targetValue: string | undefined,
  sourceValue: string | undefined,
  choice: CanonicalMergeChoice,
  secondLabel: string,
): string | undefined {
  if (choice === "source") return sourceValue;
  if (choice === "target") return targetValue;
  const target = targetValue?.trim() || "";
  const source = sourceValue?.trim() || "";
  if (!target) return sourceValue;
  if (!source) return targetValue;
  if (normalizeForSimilarity(target) === normalizeForSimilarity(source)) return targetValue;
  return `${targetValue}\n\n${secondLabel}：${sourceValue}`;
}

function mergeQuestionContent(
  target: Question,
  source: Question,
  fields: {
    stem: CanonicalMergeChoice;
    answer: CanonicalMergeChoice;
    analysis: CanonicalMergeChoice;
    summary: CanonicalMergeChoice;
  },
  updatedAt: string,
): Question {
  if (fields.stem === "both") throw new Error("题干只能二选一");
  return {
    ...target,
    stem: fields.stem === "source" ? source.stem : target.stem,
    options: fields.stem === "source" ? source.options : target.options,
    answer: mergeTextField(target.answer, source.answer, fields.answer, "答案二") || "",
    analysis: mergeTextField(target.analysis, source.analysis, fields.analysis, "解析二") || "",
    summary: mergeTextField(target.summary, source.summary, fields.summary, "总结二"),
    updatedAt,
  };
}

function pathHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) & 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

function chapterPath(chapterId: string, chapters: Chapter[]): string {
  const names: string[] = [];
  let current = chapters.find((item) => item.id === chapterId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? chapters.find((item) => item.id === current!.parentId) : undefined;
  }
  return names.join(" / ");
}

function knowledgePath(knowledgeId: string, points: KnowledgePoint[]): string {
  const names: string[] = [];
  let current = points.find((item) => item.id === knowledgeId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? points.find((item) => item.id === current!.parentId) : undefined;
  }
  return names.join(" / ");
}

function collectDirectorySnapshot(resource: ShareableResource): DonationDirectorySnapshot {
  const chapters = (db.read("chapters") as Chapter[]).filter((item) => item.schoolId === resource.schoolId);
  const points = (db.read("knowledgePoints") as KnowledgePoint[]).filter((item) => item.schoolId === resource.schoolId);
  const selectedChapterIds = new Set(resource.chapterIds || []);
  const selectedKnowledgeIds = new Set(resource.knowledgePointIds || []);
  const chapterIds = new Set<string>();
  const knowledgeIds = new Set<string>();

  for (const selectedId of selectedChapterIds) {
    let current = chapters.find((item) => item.id === selectedId);
    while (current && !chapterIds.has(current.id)) {
      chapterIds.add(current.id);
      current = current.parentId ? chapters.find((item) => item.id === current!.parentId) : undefined;
    }
  }

  for (const selectedId of selectedKnowledgeIds) {
    let current = points.find((item) => item.id === selectedId);
    while (current && !knowledgeIds.has(current.id)) {
      knowledgeIds.add(current.id);
      current = current.parentId ? points.find((item) => item.id === current!.parentId) : undefined;
    }
  }

  const chapterEntries = [...chapterIds]
    .map((id): DonationDirectoryEntry | null => {
      const chapter = chapters.find((item) => item.id === id);
      if (!chapter) return null;
      const path = chapterPath(id, chapters);
      const parentPath = chapter.parentId ? chapterPath(chapter.parentId, chapters) : "";
      return {
        id: `platform-chapter-${pathHash(path)}`,
        name: chapter.name,
        path,
        parentId: parentPath ? `platform-chapter-${pathHash(parentPath)}` : null,
        selected: selectedChapterIds.has(id),
      };
    })
    .filter((item): item is DonationDirectoryEntry => Boolean(item))
    .sort((a, b) => a.path.split(" / ").length - b.path.split(" / ").length);

  const knowledgeEntries = [...knowledgeIds]
    .map((id): DonationDirectoryEntry | null => {
      const point = points.find((item) => item.id === id);
      if (!point) return null;
      const path = knowledgePath(id, points);
      const parentPath = point.parentId ? knowledgePath(point.parentId, points) : "";
      return {
        id: `platform-knowledge-${pathHash(path)}`,
        name: point.name,
        path,
        parentId: parentPath ? `platform-knowledge-${pathHash(parentPath)}` : null,
        selected: selectedKnowledgeIds.has(id),
      };
    })
    .filter((item): item is DonationDirectoryEntry => Boolean(item))
    .sort((a, b) => a.path.split(" / ").length - b.path.split(" / ").length);

  return { chapters: chapterEntries, knowledgePoints: knowledgeEntries };
}

function mergeDirectorySnapshots(
  current: DonationDirectorySnapshot | undefined,
  incoming: DonationDirectorySnapshot,
): DonationDirectorySnapshot {
  const merge = (left: DonationDirectoryEntry[], right: DonationDirectoryEntry[]) => {
    const map = new Map<string, DonationDirectoryEntry>();
    for (const entry of [...left, ...right]) {
      const existing = map.get(entry.id);
      map.set(entry.id, existing ? { ...existing, selected: existing.selected || entry.selected } : entry);
    }
    return [...map.values()];
  };
  return {
    chapters: merge(current?.chapters || [], incoming.chapters),
    knowledgePoints: merge(current?.knowledgePoints || [], incoming.knowledgePoints),
  };
}

function primaryDonations(): ShareRecord[] {
  return (db.read("shareRecords") as ShareRecord[])
    .filter((item) => item.kind === "donation" && !item.mergedIntoDonationId && item.status === "pending");
}

function contributionDonations(): ShareRecord[] {
  return (db.read("shareRecords") as ShareRecord[])
    .filter((item) => item.kind === "donation");
}

function platformDonationById(donationId: string): ShareRecord {
  const donation = primaryDonations().find((item) => item.id === donationId);
  if (!donation?.resourceSnapshot) throw new Error("平台资源不存在");
  return donation;
}

function platformResourceCorrections(): PlatformResourceCorrection[] {
  return (db.read("platformResourceCorrections") || []) as PlatformResourceCorrection[];
}

function canReviewCorrection(teacherId: string, correction: PlatformResourceCorrection): boolean {
  if (correction.recipientTeacherId === teacherId) return true;
  const donation = primaryDonations().find((item) => item.id === correction.donationId);
  return Boolean(donation && canManageSubject(teacherId, donationSubject(donation)));
}

function normalizeCorrectionAttachments(
  attachments: PlatformResourceCorrectionAttachment[] | undefined,
): PlatformResourceCorrectionAttachment[] {
  const normalized = attachments || [];
  if (normalized.length > 4) throw new Error("一次最多上传 4 张纠错图片");
  return normalized.map((attachment) => {
    if (!attachment.mimeType.startsWith("image/")) throw new Error("纠错附件只能上传图片");
    if (!/^\/api\/files\/[^/?#]+$/.test(attachment.url)) throw new Error("纠错图片地址不合法");
    if (attachment.url !== `/api/files/${attachment.id}`) throw new Error("纠错图片信息不一致");
    return {
      id: attachment.id,
      name: attachment.name.trim().slice(0, 200) || "纠错图片",
      url: attachment.url,
      mimeType: attachment.mimeType,
      size: Math.max(0, attachment.size),
    };
  });
}

function teacherContributedToDonation(teacherId: string, donationId: string): boolean {
  return contributionDonations().some((item) =>
    item.fromTeacherId === teacherId
    && (item.id === donationId || item.mergedIntoDonationId === donationId),
  );
}

function checkPlatformSave(
  donation: ShareRecord,
  teacherId: string,
  schoolId: string,
): PlatformSaveCheckResult {
  if (teacherContributedToDonation(teacherId, donation.id)) {
    return {
      donationId: donation.id,
      resourceType: donation.resourceType,
      canSave: false,
      reason: "自己捐赠或合并贡献的平台资源不能创建副本",
      alreadySaved: false,
    };
  }

  const owned = (db.read(RESOURCE_COLLECTIONS[donation.resourceType]) as ShareableResource[])
    .filter((item) => item.teacherId === teacherId && item.schoolId === schoolId);
  const alreadySaved = owned.some((item) => item.platformSourceDonationIds?.includes(donation.id));
  if (alreadySaved) {
    return {
      donationId: donation.id,
      resourceType: donation.resourceType,
      canSave: false,
      reason: "该平台资源的副本已创建",
      alreadySaved: true,
    };
  }

  if (donation.resourceType !== "question") {
    return {
      donationId: donation.id,
      resourceType: donation.resourceType,
      canSave: true,
      alreadySaved: false,
    };
  }

  const sourceQuestion = donation.resourceSnapshot as Question;
  const conflict = (owned as Question[])
    .map((targetQuestion) => ({
      similarity: questionSimilarity(sourceQuestion, targetQuestion),
      sourceQuestion: structuredClone(sourceQuestion),
      targetResourceId: targetQuestion.id,
      targetQuestion: structuredClone(targetQuestion),
    }))
    .filter((candidate) => candidate.similarity > 0.8)
    .sort((left, right) => right.similarity - left.similarity)[0];

  return {
    donationId: donation.id,
    resourceType: donation.resourceType,
    canSave: true,
    alreadySaved: false,
    conflict,
  };
}

function contributorRanking(): DonationContributor[] {
  const teachers = platformTeachers();
  const counts = new Map<string, { count: number; firstAt: string; subjects: Set<string> }>();
  for (const donation of contributionDonations()) {
    const current = counts.get(donation.fromTeacherId);
    counts.set(donation.fromTeacherId, {
      count: (current?.count || 0) + 1,
      firstAt: current && current.firstAt < donation.createdAt ? current.firstAt : donation.createdAt,
      subjects: new Set([...(current?.subjects || []), donationSubject(donation)]),
    });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].firstAt.localeCompare(b[1].firstAt) || a[0].localeCompare(b[0]))
    .map(([teacherId, value], index) => ({
      teacherId,
      nickname: teachers.find((teacher) => teacher.id === teacherId)?.nickname?.trim() || "匿名用户",
      donationCount: value.count,
      rank: index + 1,
      isTopContributor: index < 10,
      subjects: [...value.subjects].sort((left, right) => left.localeCompare(right, "zh-CN")),
      moderatorSubjects: [...new Set(teachers.find((teacher) => teacher.id === teacherId)?.platformModeratorSubjects || [])]
        .sort((left, right) => left.localeCompare(right, "zh-CN")),
    }));
}

function privilegesFor(teacherId: string): DonationPrivileges {
  const contributor = contributorRanking().find((item) => item.teacherId === teacherId);
  const admin = isPlatformAdmin(teacherId);
  return {
    donationCount: contributor?.donationCount || 0,
    rank: contributor?.rank || null,
    isTopContributor: contributor?.isTopContributor || false,
    canManagePlatformSettings: admin,
    canManageAllSubjects: admin,
    moderatedSubjects: moderatedSubjects(teacherId),
  };
}

function buildPlatformTree(type: "chapter" | "knowledge", donations = primaryDonations()): TreeNode {
  const entries = new Map<string, DonationDirectoryEntry>();
  for (const donation of donations) {
    const source = type === "chapter"
      ? donation.directorySnapshot?.chapters || []
      : donation.directorySnapshot?.knowledgePoints || [];
    for (const entry of source) {
      const current = entries.get(entry.id);
      entries.set(entry.id, current ? { ...current, selected: current.selected || entry.selected } : entry);
    }
  }
  const resourceCounts = new Map<string, number>();
  for (const donation of donations) {
    const source = type === "chapter"
      ? donation.directorySnapshot?.chapters || []
      : donation.directorySnapshot?.knowledgePoints || [];
    for (const entry of source.filter((item) => item.selected)) {
      resourceCounts.set(entry.id, (resourceCounts.get(entry.id) || 0) + 1);
    }
  }
  const makeChildren = (parentId: string | null): TreeNode[] => [...entries.values()]
    .filter((entry) => entry.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      type,
      count: resourceCounts.get(entry.id) || 0,
      parentId: entry.parentId,
      children: makeChildren(entry.id),
    }));
  return {
    id: "root",
    name: type === "chapter" ? "全部章节" : "全部知识点",
    type,
    count: donations.length,
    children: makeChildren(null),
  };
}

function ensureDirectorySnapshot(
  snapshot: DonationDirectorySnapshot | undefined,
  schoolId: string,
): { chapterIds: string[]; knowledgePointIds: string[] } {
  if (!snapshot) return { chapterIds: [], knowledgePointIds: [] };
  const chapters = db.read("chapters") as Chapter[];
  const points = db.read("knowledgePoints") as KnowledgePoint[];
  const chapterMap = new Map<string, string>();
  const knowledgeMap = new Map<string, string>();

  for (const entry of [...snapshot.chapters].sort((a, b) => a.path.split(" / ").length - b.path.split(" / ").length)) {
    const parentId = entry.parentId ? chapterMap.get(entry.parentId) || null : null;
    let existing = chapters.find((item) => item.schoolId === schoolId && item.parentId === parentId && item.name === entry.name);
    if (!existing) {
      existing = {
        id: genId("ch"),
        schoolId,
        parentId,
        name: entry.name,
        order: chapters.filter((item) => item.schoolId === schoolId && item.parentId === parentId).length + 1,
        level: parentId ? (chapters.find((item) => item.id === parentId)?.level || 0) + 1 : 0,
        questionCount: 0,
      };
      chapters.push(existing);
    }
    chapterMap.set(entry.id, existing.id);
  }

  for (const entry of [...snapshot.knowledgePoints].sort((a, b) => a.path.split(" / ").length - b.path.split(" / ").length)) {
    const parentId = entry.parentId ? knowledgeMap.get(entry.parentId) || null : null;
    let existing = points.find((item) =>
      item.schoolId === schoolId
      && item.parentId === parentId
      && item.name === entry.name,
    );
    if (!existing) {
      existing = {
        id: genId("kp"),
        schoolId,
        parentId,
        name: entry.name,
        order: points.filter((item) => item.schoolId === schoolId && item.parentId === parentId).length + 1,
        level: parentId ? (points.find((item) => item.id === parentId)?.level || 0) + 1 : 0,
        questionCount: 0,
      };
      points.push(existing);
    }
    knowledgeMap.set(entry.id, existing.id);
  }

  db.write("chapters", chapters);
  db.write("knowledgePoints", points);
  return {
    chapterIds: snapshot.chapters.filter((item) => item.selected).map((item) => chapterMap.get(item.id)).filter((id): id is string => Boolean(id)),
    knowledgePointIds: snapshot.knowledgePoints.filter((item) => item.selected).map((item) => knowledgeMap.get(item.id)).filter((id): id is string => Boolean(id)),
  };
}

function copySnapshotToTeacher(
  share: ShareRecord,
  toTeacherId: string,
  toSchoolId: string,
): { newResourceId: string; resourceType: ShareableResourceType } {
  if (!share.resourceSnapshot) throw new Error("捐赠资源快照不存在");
  const now = new Date().toISOString();
  const directory = ensureDirectorySnapshot(share.directorySnapshot, toSchoolId);
  const original = share.resourceSnapshot;
  const platformSourceDonationIds = [
    ...new Set([
      ...(original.platformSourceDonationIds || []),
      ...(share.kind === "donation" ? [share.id] : []),
    ]),
  ];
  let copy: ShareableResource;
  let newResourceId: string;

  switch (share.resourceType) {
    case "question":
      newResourceId = genId("q");
      copy = {
        ...(original as Question),
        id: newResourceId,
        stem: appendCopySuffix((original as Question).stem),
        teacherId: toTeacherId,
        schoolId: toSchoolId,
        platformSourceDonationIds: platformSourceDonationIds.length ? platformSourceDonationIds : undefined,
        semester: original.semester || "上学期",
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        usageCount: 0,
        isShared: false,
        sourceType: "shared",
        createdAt: now,
        updatedAt: now,
      };
      break;
    case "examPaper":
      newResourceId = genId("exam");
      copy = {
        ...(original as ExamPaper),
        id: newResourceId,
        title: appendCopySuffix((original as ExamPaper).title),
        teacherId: toTeacherId,
        schoolId: toSchoolId,
        platformSourceDonationIds: platformSourceDonationIds.length ? platformSourceDonationIds : undefined,
        semester: original.semester || "上学期",
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      break;
    case "lecture":
      newResourceId = genId("lec");
      copy = {
        ...(original as Lecture),
        id: newResourceId,
        title: appendCopySuffix((original as Lecture).title),
        teacherId: toTeacherId,
        schoolId: toSchoolId,
        platformSourceDonationIds: platformSourceDonationIds.length ? platformSourceDonationIds : undefined,
        semester: original.semester || "上学期",
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        status: "draft",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      break;
    case "courseware":
      newResourceId = genId("cw");
      copy = {
        ...(original as Courseware),
        id: newResourceId,
        title: appendCopySuffix((original as Courseware).title),
        teacherId: toTeacherId,
        schoolId: toSchoolId,
        platformSourceDonationIds: platformSourceDonationIds.length ? platformSourceDonationIds : undefined,
        semester: original.semester || "上学期",
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        createdAt: now,
        updatedAt: now,
      };
      break;
    case "material":
      newResourceId = genId("mat");
      copy = {
        ...(original as Material),
        id: newResourceId,
        title: appendCopySuffix((original as Material).title),
        teacherId: toTeacherId,
        schoolId: toSchoolId,
        platformSourceDonationIds: platformSourceDonationIds.length ? platformSourceDonationIds : undefined,
        semester: original.semester || "上学期",
        chapterIds: directory.chapterIds,
        knowledgePointIds: directory.knowledgePointIds,
        createdAt: now,
        updatedAt: now,
      };
      break;
  }

  db.update(RESOURCE_COLLECTIONS[share.resourceType], (list) => [copy, ...list]);
  return { newResourceId, resourceType: share.resourceType };
}

/** 资源分享与平台捐赠服务。 */
export const shareService = {
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
    batchId?: string;
  }): Promise<ShareRecord> {
    await delay(200);
    const now = new Date().toISOString();
    const record: ShareRecord = {
      id: genId("share"),
      batchId: params.batchId,
      kind: "share",
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

    if (params.scope === "school" || params.scope === "public") {
      try {
        const scopeLabel = params.scope === "school" ? "校内分享" : "公开分享";
        await schoolBackupService.autoBackupForResource(
          params.fromSchoolId,
          params.fromTeacherId,
          params.resourceType,
          params.resourceId,
          [],
          `${scopeLabel}：${params.resourceTitle}`,
        );
      } catch (error) {
        console.error("校本备份失败（不影响分享）", error);
      }
    }
    return record;
  },

  async getBatchShare(batchId: string): Promise<ShareRecord[]> {
    await delay(100);
    const normalizedBatchId = batchId.trim();
    if (!normalizedBatchId) return [];
    return (db.read("shareRecords") as ShareRecord[])
      .filter((item) =>
        item.kind !== "donation"
        && item.scope === "public"
        && item.batchId === normalizedBatchId,
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async checkDonationCandidates(teacherId: string, requests: DonationRequest[]): Promise<DonationPreview[]> {
    await delay(100);
    const teacher = (db.read("teachers") as Array<{ id: string; schoolId: string | null }>).find((item) => item.id === teacherId);
    if (!teacher?.schoolId) throw new Error("请先完成学校认证");
    const subject = activePlatformSubject(platformTeacher(teacherId));
    if (!subject) throw new Error("请先在当前任教单位设置学科后再捐赠资源");
    const records = contributionDonations();
    const contributors = new Map(contributorRanking().map((item) => [item.teacherId, item.nickname]));
    return requests.map((request) => {
      const resource = findOwnedResource(request.resourceType, request.resourceId, teacherId, teacher.schoolId!);
      const alreadyDonated = records.some((item) =>
        item.fromTeacherId === teacherId
        && item.resourceType === request.resourceType
        && item.sourceResourceId === request.resourceId,
      );
      const duplicates = request.resourceType === "question"
        ? primaryDonations()
          .filter((item) => donationSubject(item) === subject)
          .filter((item) => item.resourceType === "question" && item.resourceSnapshot)
          .map((item) => ({
            donationId: item.id,
            similarity: questionSimilarity(resource as Question, item.resourceSnapshot as Question),
            question: item.resourceSnapshot as Question,
            contributorNickname: contributors.get(item.fromTeacherId) || "匿名用户",
          }))
          .filter((candidate) => candidate.similarity > 0.8)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)
        : [];
      return {
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        resourceTitle: resourceTitle(request.resourceType, resource),
        alreadyDonated,
        duplicates,
      };
    });
  },

  async donateResources(
    teacherId: string,
    schoolId: string,
    requests: DonationRequest[],
  ): Promise<ShareRecord[]> {
    await delay(200);
    if (!requests.length) throw new Error("请至少选择一项资源");
    const subject = activePlatformSubject(platformTeacher(teacherId));
    if (!subject) throw new Error("请先在当前任教单位设置学科后再捐赠资源");
    const now = new Date().toISOString();
    const existingRecords = contributionDonations();
    const created: ShareRecord[] = [];

    for (const request of requests) {
      const resource = findOwnedResource(request.resourceType, request.resourceId, teacherId, schoolId);
      const duplicateDonation = existingRecords.find((item) =>
        item.fromTeacherId === teacherId
        && item.resourceType === request.resourceType
        && item.sourceResourceId === request.resourceId,
      );
      if (duplicateDonation) continue;

      const directorySnapshot = collectDirectorySnapshot(resource);
      if (request.resourceType === "question" && request.duplicateAction === "merge") {
        const target = primaryDonations().find((item) =>
          item.id === request.duplicateTargetDonationId
          && item.resourceType === "question"
          && item.resourceSnapshot,
        );
        if (!target) throw new Error("要合并的平台题目不存在");
        if (donationSubject(target) !== subject) throw new Error("不能跨学科合并平台资源");
        const source = resource as Question;
        const existing = target.resourceSnapshot as Question;
        if (questionSimilarity(source, existing) <= 0.8) {
          throw new Error("仅相似度超过 80% 的题目可以合并");
        }
        const choices = request.mergeFields || {};
        const toCanonical = (choice: typeof choices.answer): CanonicalMergeChoice => {
          if (choice === "source" || choice === "both") return choice;
          return "target";
        };
        const merged = mergeQuestionContent(existing, source, {
          stem: toCanonical(choices.stem),
          answer: toCanonical(choices.answer),
          analysis: toCanonical(choices.analysis),
          summary: toCanonical(choices.summary),
        }, now);
        db.update("shareRecords", (list: ShareRecord[]) => list.map((item) =>
          item.id === target.id
            ? {
              ...item,
              resourceTitle: merged.stem,
              resourceSnapshot: merged,
              directorySnapshot: mergeDirectorySnapshots(item.directorySnapshot, directorySnapshot),
            }
            : item,
        ));
        const contribution: ShareRecord = {
          id: genId("donation"),
          kind: "donation",
          fromTeacherId: teacherId,
          fromSchoolId: schoolId,
          scope: "public",
          resourceType: "question",
          resourceId: target.resourceId,
          sourceResourceId: request.resourceId,
          resourceTitle: merged.stem,
          mergedIntoDonationId: target.id,
          directorySnapshot,
          platformSubject: subject,
          platformOrder: target.platformOrder,
          status: "pending",
          createdAt: now,
        };
        db.update("shareRecords", (list) => [...list, contribution]);
        created.push(contribution);
        continue;
      }

      const snapshot = structuredClone(resource);
      const record: ShareRecord = {
        id: genId("donation"),
        kind: "donation",
        fromTeacherId: teacherId,
        fromSchoolId: schoolId,
        scope: "public",
        resourceType: request.resourceType,
        resourceId: request.resourceId,
        sourceResourceId: request.resourceId,
        resourceTitle: resourceTitle(request.resourceType, resource),
        resourceSnapshot: snapshot,
        directorySnapshot,
        platformSubject: subject,
        platformOrder: nextPlatformOrder(subject),
        status: "pending",
        createdAt: now,
      };
      db.update("shareRecords", (list) => [...list, record]);
      created.push(record);
      existingRecords.push(record);
    }
    return created;
  },

  async listPublicDonations(teacherId?: string): Promise<ShareRecord[]> {
    await delay(50);
    const visibleSubjects = teacherId ? visibleSubjectsFor(teacherId) : null;
    const donations = primaryDonations()
      .filter((item) => visibleSubjects === null || visibleSubjects.includes(donationSubject(item)))
      .sort((left, right) => {
        const subjectOrder = donationSubject(left).localeCompare(donationSubject(right), "zh-CN");
        if (subjectOrder !== 0) return subjectOrder;
        return (left.platformOrder || Number.MAX_SAFE_INTEGER) - (right.platformOrder || Number.MAX_SAFE_INTEGER)
          || right.createdAt.localeCompare(left.createdAt);
      });
    const nextOrder = new Map<string, number>();
    return donations.map((item) => {
      const subject = donationSubject(item);
      const order = item.platformOrder || (nextOrder.get(subject) || 0) + 1;
      nextOrder.set(subject, Math.max(nextOrder.get(subject) || 0, order));
      return { ...item, platformSubject: subject, platformOrder: order };
    });
  },

  async listDonationStatus(teacherId: string): Promise<ShareRecord[]> {
    await delay(50);
    return contributionDonations()
      .filter((item) => item.fromTeacherId === teacherId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listDonationContributors(teacherId?: string): Promise<DonationContributor[]> {
    await delay(50);
    const visibleSubjects = teacherId ? visibleSubjectsFor(teacherId) : null;
    return contributorRanking().filter((item) =>
      visibleSubjects === null
      || item.subjects.some((subject) => visibleSubjects.includes(subject))
      || item.moderatorSubjects.some((subject) => visibleSubjects.includes(subject)),
    );
  },

  async getDonationPrivileges(teacherId: string): Promise<DonationPrivileges> {
    await delay(50);
    return privilegesFor(teacherId);
  },

  async getPlatformDirectoryTree(type: "chapter" | "knowledge", teacherId?: string): Promise<TreeNode> {
    await delay(50);
    const visibleSubjects = teacherId ? visibleSubjectsFor(teacherId) : null;
    const donations = primaryDonations().filter((item) =>
      visibleSubjects === null || visibleSubjects.includes(donationSubject(item)),
    );
    return buildPlatformTree(type, donations);
  },

  async checkSaveAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
  ): Promise<PlatformSaveCheckResult> {
    await delay(50);
    const donation = platformDonationById(donationId);
    if (!canViewSubject(teacherId, donationSubject(donation))) throw new Error("无权访问其他学科的平台资源");
    return checkPlatformSave(donation, teacherId, schoolId);
  },

  async saveDonationAsOwnResource(
    donationId: string,
    teacherId: string,
    schoolId: string,
    decision?: PlatformSaveDecision,
  ): Promise<PlatformSaveResult> {
    await delay(100);
    const donation = platformDonationById(donationId);
    if (!canViewSubject(teacherId, donationSubject(donation))) throw new Error("无权访问其他学科的平台资源");
    const check = checkPlatformSave(donation, teacherId, schoolId);
    if (!check.canSave) throw new Error(check.reason || "该平台资源不能创建副本");

    if (check.conflict && !decision) {
      throw new Error("发现相似题目，请先选择新增或合并");
    }

    if (decision?.action === "merge") {
      if (donation.resourceType !== "question" || !decision.targetResourceId) {
        throw new Error("仅相似题目支持合并");
      }
      const questions = db.read("questions") as Question[];
      const target = questions.find((item) =>
        item.id === decision.targetResourceId
        && item.teacherId === teacherId
        && item.schoolId === schoolId,
      );
      if (!target) throw new Error("要合并的个人题目不存在");
      const source = donation.resourceSnapshot as Question;
      if (questionSimilarity(source, target) <= 0.8) {
        throw new Error("仅相似度超过 80% 的题目可以合并");
      }
      const directory = ensureDirectorySnapshot(donation.directorySnapshot, schoolId);
      const now = new Date().toISOString();
      const merged = mergeQuestionContent(target, source, decision.fields, now);
      merged.chapterIds = [...new Set([...(target.chapterIds || []), ...directory.chapterIds])];
      merged.knowledgePointIds = [...new Set([...(target.knowledgePointIds || []), ...directory.knowledgePointIds])];
      merged.platformSourceDonationIds = [
        ...new Set([...(target.platformSourceDonationIds || []), donation.id]),
      ];
      db.write("questions", questions.map((item) => item.id === target.id ? merged : item));
      return { resourceType: "question", resourceId: target.id, merged: true };
    }

    const copied = copySnapshotToTeacher(donation, teacherId, schoolId);
    return {
      resourceType: copied.resourceType,
      resourceId: copied.newResourceId,
      merged: false,
    };
  },

  async updateDonationResource(
    teacherId: string,
    donationId: string,
    patch: DonationPatch,
  ): Promise<ShareRecord> {
    await delay(100);
    const donation = primaryDonations().find((item) => item.id === donationId);
    if (!donation || !donation.resourceSnapshot) throw new Error("平台资源不存在");
    const subject = donationSubject(donation);
    if (donation.fromTeacherId !== teacherId && !canManageSubject(teacherId, subject)) {
      throw new Error("仅捐赠者本人、该学科版主或平台超级管理员可以修改该平台资源");
    }
    const snapshot = structuredClone(donation.resourceSnapshot) as ShareableResource & Record<string, unknown>;
    if (typeof patch.grade === "string") snapshot.grade = patch.grade;
    if (typeof patch.schoolYear === "string") snapshot.schoolYear = patch.schoolYear;
    if (typeof patch.semester === "string") snapshot.semester = patch.semester;
    if (donation.resourceType === "question") {
      if (typeof patch.title === "string") (snapshot as Question).stem = patch.title.trim();
      if (typeof patch.difficulty === "number") (snapshot as Question).difficulty = patch.difficulty;
      if (typeof patch.recommendation === "number") (snapshot as Question).recommendation = patch.recommendation;
    } else {
      if (typeof patch.title === "string") (snapshot as Exclude<ShareableResource, Question>).title = patch.title.trim();
      if (typeof patch.description === "string") snapshot.description = patch.description;
      if (typeof patch.originalFileName === "string" && "originalFileName" in snapshot) {
        snapshot.originalFileName = patch.originalFileName.trim();
      }
    }
    snapshot.updatedAt = new Date().toISOString();
    let updated: ShareRecord | null = null;
    db.update("shareRecords", (list: ShareRecord[]) => list.map((item) => {
      if (item.id !== donationId) return item;
      updated = {
        ...item,
        resourceTitle: resourceTitle(item.resourceType, snapshot as ShareableResource),
        resourceSnapshot: snapshot as ShareableResource,
      };
      return updated;
    }));
    if (!updated) throw new Error("平台资源不存在");
    return updated;
  },

  async createDonationCorrection(
    teacherId: string,
    input: PlatformResourceCorrectionInput,
  ): Promise<PlatformResourceCorrection> {
    await delay(100);
    const donation = platformDonationById(input.donationId);
    if (!canViewSubject(teacherId, donationSubject(donation))) {
      throw new Error("无权访问其他学科的平台资源");
    }
    const message = input.message?.trim().slice(0, 2000) || undefined;
    const attachments = normalizeCorrectionAttachments(input.attachments);
    if (!message && attachments.length === 0) throw new Error("请填写纠错说明或上传图片");
    const reporter = platformTeacher(teacherId);
    const correction: PlatformResourceCorrection = {
      id: genId("correction"),
      donationId: donation.id,
      resourceType: donation.resourceType,
      resourceTitle: donation.resourceTitle,
      reporterTeacherId: teacherId,
      reporterNickname: reporter.nickname?.trim() || "匿名用户",
      recipientTeacherId: donation.fromTeacherId,
      message,
      attachments,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    db.update("platformResourceCorrections", (list: PlatformResourceCorrection[] = []) => [correction, ...list]);
    return correction;
  },

  async listDonationCorrections(
    teacherId: string,
    donationId?: string,
  ): Promise<PlatformResourceCorrection[]> {
    await delay(50);
    platformTeacher(teacherId);
    return platformResourceCorrections()
      .filter((correction) => !donationId || correction.donationId === donationId)
      .filter((correction) =>
        correction.reporterTeacherId === teacherId || canReviewCorrection(teacherId, correction),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async listCorrectionTodos(teacherId: string): Promise<PlatformResourceCorrection[]> {
    await delay(50);
    platformTeacher(teacherId);
    return platformResourceCorrections()
      .filter((correction) =>
        correction.recipientTeacherId === teacherId && correction.status === "pending",
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async resolveDonationCorrection(
    teacherId: string,
    correctionId: string,
  ): Promise<PlatformResourceCorrection> {
    await delay(50);
    const correction = platformResourceCorrections().find((item) => item.id === correctionId);
    if (!correction) throw new Error("纠错信息不存在");
    if (!canReviewCorrection(teacherId, correction)) throw new Error("无权处理该纠错信息");
    if (correction.status === "resolved") return correction;
    const resolved: PlatformResourceCorrection = {
      ...correction,
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      resolvedByTeacherId: teacherId,
    };
    db.update("platformResourceCorrections", (list: PlatformResourceCorrection[] = []) =>
      list.map((item) => item.id === correctionId ? resolved : item),
    );
    return resolved;
  },

  async listPlatformResourceSettings(): Promise<PlatformResourceSetting[]> {
    await delay(50);
    const stored = (db.read("platformResourceSettings") || []) as PlatformResourceSetting[];
    const now = new Date(0).toISOString();
    return (Object.keys(DEFAULT_PLATFORM_SETTINGS) as PlatformResourceSettingType[]).map((type) =>
      stored.find((item) => item.type === type) || {
        id: `platform-setting-${type}`,
        type,
        values: DEFAULT_PLATFORM_SETTINGS[type],
        updatedAt: now,
      },
    );
  },

  async updatePlatformResourceSettings(
    teacherId: string,
    settings: Array<{ type: PlatformResourceSettingType; values: string[] }>,
  ): Promise<PlatformResourceSetting[]> {
    await delay(100);
    if (!isPlatformAdmin(teacherId)) {
      throw new Error("仅平台超级管理员可以修改平台资源属性选项");
    }
    const now = new Date().toISOString();
    const normalized = settings.map((item) => ({
      id: `platform-setting-${item.type}`,
      type: item.type,
      values: [...new Set(item.values.map((value) => value.trim()).filter(Boolean))],
      updatedAt: now,
      updatedByTeacherId: teacherId,
    }));
    db.write("platformResourceSettings", normalized);
    return normalized;
  },

  async setSubjectModerator(
    teacherId: string,
    subject: string,
    targetTeacherId: string,
    enabled: boolean,
  ): Promise<DonationContributor[]> {
    await delay(100);
    if (!isPlatformAdmin(teacherId)) throw new Error("仅平台超级管理员可以管理学科版主");
    const normalizedSubject = subject.trim();
    if (!normalizedSubject) throw new Error("请选择学科");
    const target = platformTeacher(targetTeacherId);
    const teacherSubjects = new Set([
      target.subject?.trim() || "",
      ...(target.affiliations || [])
        .map((item) => typeof item.subject === "string" ? item.subject.trim() : ""),
    ].filter(Boolean));
    if (!teacherSubjects.has(normalizedSubject)) throw new Error("只能将该学科任课教师设为版主");

    db.update("teachers", (teachers: PlatformTeacher[]) => teachers.map((teacher) => {
      if (teacher.id !== targetTeacherId) return teacher;
      const subjects = new Set((teacher.platformModeratorSubjects || []).map((item) => item.trim()).filter(Boolean));
      if (enabled) subjects.add(normalizedSubject);
      else subjects.delete(normalizedSubject);
      return { ...teacher, platformModeratorSubjects: [...subjects].sort((left, right) => left.localeCompare(right, "zh-CN")) };
    }));
    return contributorRanking();
  },

  async updateDonationOrder(
    teacherId: string,
    subject: string,
    donationIds: string[],
  ): Promise<ShareRecord[]> {
    await delay(100);
    const normalizedSubject = subject.trim();
    if (!canManageSubject(teacherId, normalizedSubject)) {
      throw new Error("仅该学科版主或平台超级管理员可以调整资源布局");
    }
    const donations = primaryDonations().filter((item) => donationSubject(item) === normalizedSubject);
    const expectedIds = new Set(donations.map((item) => item.id));
    if (donationIds.length !== expectedIds.size || donationIds.some((id) => !expectedIds.has(id))) {
      throw new Error("资源排序列表不完整，请刷新后重试");
    }
    const orderById = new Map(donationIds.map((id, index) => [id, index + 1]));
    db.update("shareRecords", (records: ShareRecord[]) => records.map((record) => {
      const order = orderById.get(record.id);
      return order === undefined ? record : { ...record, platformSubject: normalizedSubject, platformOrder: order };
    }));
    return primaryDonations()
      .filter((item) => donationSubject(item) === normalizedSubject)
      .sort((left, right) => (left.platformOrder || 0) - (right.platformOrder || 0));
  },

  async deleteDonationResource(teacherId: string, donationId: string): Promise<void> {
    await delay(100);
    if (!isPlatformAdmin(teacherId)) throw new Error("仅平台超级管理员可以删除平台资源");
    const donation = primaryDonations().find((item) => item.id === donationId);
    if (!donation) throw new Error("平台资源不存在");
    db.update("shareRecords", (records: ShareRecord[]) => records.filter((record) =>
      record.id !== donationId && record.mergedIntoDonationId !== donationId,
    ));
    db.update("platformResourceCorrections", (records: PlatformResourceCorrection[] = []) =>
      records.filter((record) => record.donationId !== donationId),
    );
  },

  async listIncomingShares(teacherId: string): Promise<ShareRecord[]> {
    await delay(100);
    return (db.read("shareRecords") as ShareRecord[])
      .filter((item) =>
        item.kind !== "donation"
        &&
        !item.mergedIntoDonationId
        && (item.toTeacherId === teacherId || item.scope === "public")
        && item.status === "pending",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async listOutgoingShares(teacherId: string): Promise<ShareRecord[]> {
    await delay(100);
    return (db.read("shareRecords") as ShareRecord[])
      .filter((item) => item.kind !== "donation" && item.fromTeacherId === teacherId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async acceptShare(
    shareId: string,
    toTeacherId: string,
    toSchoolId: string,
  ): Promise<{ newResourceId: string; resourceType: ShareableResourceType }> {
    await delay(300);
    const share = (db.read("shareRecords") as ShareRecord[]).find((item) => item.id === shareId);
    if (!share) throw new Error("分享记录不存在");
    if (share.status !== "pending") throw new Error("该分享已处理");
    if (share.expiresAt && new Date(share.expiresAt) <= new Date()) throw new Error("该分享已过期");
    if (share.toTeacherId && share.toTeacherId !== toTeacherId) throw new Error("无权处理该分享");
    if (share.toSchoolId && share.toSchoolId !== toSchoolId) throw new Error("无权处理该分享");
    if (!share.toTeacherId && share.scope !== "public" && share.scope !== "school") {
      throw new Error("无权处理该分享");
    }

    let result: { newResourceId: string; resourceType: ShareableResourceType };
    if (share.kind === "donation") {
      const saved = await shareService.saveDonationAsOwnResource(share.id, toTeacherId, toSchoolId);
      result = { newResourceId: saved.resourceId, resourceType: saved.resourceType };
    } else {
      const original = (db.read(RESOURCE_COLLECTIONS[share.resourceType]) as ShareableResource[])
        .find((item) => item.id === share.resourceId);
      if (!original) throw new Error("分享资源不存在");
      const temporary: ShareRecord = {
        ...share,
        resourceSnapshot: structuredClone(original),
        directorySnapshot: collectDirectorySnapshot(original),
      };
      result = copySnapshotToTeacher(temporary, toTeacherId, toSchoolId);
    }

    const now = new Date().toISOString();
    if (share.kind !== "donation") {
      db.update("shareRecords", (list: ShareRecord[]) => list.map((item) =>
        item.id === shareId
          ? {
            ...item,
            status: "accepted" as ShareStatus,
            acceptedAt: now,
            acceptedResourceId: result.newResourceId,
          }
          : item,
      ));
    }
    return result;
  },

  async rejectShare(shareId: string): Promise<void> {
    await delay(100);
    db.update("shareRecords", (list: ShareRecord[]) => list.map((item) =>
      item.id === shareId ? { ...item, status: "rejected" as ShareStatus } : item,
    ));
  },

  async revokeShare(shareId: string): Promise<void> {
    await delay(100);
    const share = (db.read("shareRecords") as ShareRecord[]).find((item) => item.id === shareId);
    if (share?.kind === "donation") throw new Error("已捐赠的平台资源不可删除");
    db.update("shareRecords", (list: ShareRecord[]) => list.filter((item) => item.id !== shareId));
  },
};
