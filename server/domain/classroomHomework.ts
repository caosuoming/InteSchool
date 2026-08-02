import type {
  ClassroomHomework,
  ClassroomHomeworkAttachment,
  ClassroomHomeworkFilter,
  TeacherAffiliation,
} from "../../src/types/index.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { db } from "../runtime-db.js";

export interface ClassroomHomeworkInput {
  content: string;
  attachments?: ClassroomHomeworkAttachment[];
  classIds: string[];
  assignedDate: string;
  publishAt: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILE_URL_PATTERN = /^\/api\/files\/([A-Za-z0-9-]+)$/;
const MAX_ATTACHMENTS = 8;

function normalizeAttachments(
  attachments: ClassroomHomeworkAttachment[] | undefined,
): ClassroomHomeworkAttachment[] {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) throw new Error("作业附件格式不正确");
  if (attachments.length > MAX_ATTACHMENTS) throw new Error(`作业附件不能超过 ${MAX_ATTACHMENTS} 个`);

  const ids = new Set<string>();
  return attachments.map((attachment) => {
    const id = String(attachment.id || "").trim();
    const name = String(attachment.name || "").trim().slice(0, 200);
    const url = String(attachment.url || "").trim();
    const mimeType = String(attachment.mimeType || "application/octet-stream").trim().slice(0, 120);
    const size = Number(attachment.size);
    const match = url.match(FILE_URL_PATTERN);
    if (!id || !name || !match || match[1] !== id) throw new Error("作业附件信息不完整");
    if (ids.has(id)) throw new Error("作业附件不能重复");
    if (!Number.isFinite(size) || size < 0) throw new Error("作业附件大小不正确");
    ids.add(id);
    return { id, name, url, mimeType, size };
  });
}

function currentAffiliation(teacher: {
  affiliations?: TeacherAffiliation[];
  currentAffiliationId?: string | null;
}): TeacherAffiliation | undefined {
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
}

function allowedClassIds(teacher: {
  teachingClassIds?: string[];
  homeroomClassIds?: string[];
  affiliations?: TeacherAffiliation[];
  currentAffiliationId?: string | null;
}): Set<string> {
  const affiliation = currentAffiliation(teacher);
  return new Set([
    ...(affiliation?.teachingClassIds || teacher.teachingClassIds || []),
    ...(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []),
  ]);
}

function matchesFilter(item: ClassroomHomework, filter: ClassroomHomeworkFilter): boolean {
  if (filter.schoolId && item.schoolId !== filter.schoolId) return false;
  if (filter.teacherId && item.teacherId !== filter.teacherId) return false;
  if (filter.classId && !item.classIds.includes(filter.classId)) return false;
  if (filter.assignedDate && item.assignedDate !== filter.assignedDate) return false;
  if (filter.publishedOnly && new Date(item.publishAt).getTime() > Date.now()) return false;
  return true;
}

function validateInput(input: ClassroomHomeworkInput): ClassroomHomeworkAttachment[] {
  const attachments = normalizeAttachments(input.attachments);
  if (!input.content.trim() && attachments.length === 0) throw new Error("请输入作业内容或添加附件");
  if (input.content.trim().length > 4000) throw new Error("作业内容不能超过 4000 字");
  if (input.classIds.length === 0) throw new Error("请选择至少一个发布班级");
  if (!DATE_PATTERN.test(input.assignedDate)) throw new Error("作业日期格式不正确");
  const publishAt = new Date(input.publishAt);
  if (Number.isNaN(publishAt.getTime())) throw new Error("发布时间格式不正确");
  return attachments;
}

export const classroomHomeworkService = {
  async listHomeworks(filter: ClassroomHomeworkFilter = {}): Promise<ClassroomHomework[]> {
    await delay(150);
    return db
      .read("classroomHomeworks")
      .filter((item: ClassroomHomework) => matchesFilter(item, filter))
      .sort((a: ClassroomHomework, b: ClassroomHomework) => {
        const dateDiff = b.assignedDate.localeCompare(a.assignedDate);
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
      });
  },

  async createHomework(
    teacherId: string,
    schoolId: string,
    input: ClassroomHomeworkInput,
  ): Promise<ClassroomHomework> {
    await delay(200);
    maybeThrowError();
    const attachments = validateInput(input);

    const teacher = db.read("teachers").find((item: { id: string }) => item.id === teacherId);
    if (!teacher || teacher.schoolId !== schoolId) throw new Error("教师或学校信息不存在");

    const uniqueClassIds = [...new Set(input.classIds)];
    const schoolClasses = db.read("schoolClasses") as Array<{
      id: string;
      schoolId: string;
      status?: "active" | "graduated";
    }>;
    const validSchoolClassIds = new Set(
      schoolClasses
        .filter((item) => item.schoolId === schoolId && item.status !== "graduated")
        .map((item) => item.id),
    );
    if (uniqueClassIds.some((classId) => !validSchoolClassIds.has(classId))) {
      throw new Error("发布班级不存在或已毕业");
    }

    const teacherClassIds = allowedClassIds(teacher);
    if (teacherClassIds.size > 0 && uniqueClassIds.some((classId) => !teacherClassIds.has(classId))) {
      throw new Error("只能向自己的任教班级发布作业");
    }

    const affiliation = currentAffiliation(teacher);
    const now = new Date().toISOString();
    const homework: ClassroomHomework = {
      id: genId("homework"),
      teacherId,
      teacherName: teacher.name,
      schoolId,
      subject: affiliation?.subject || teacher.subject || "其他学科",
      content: input.content.trim(),
      attachments,
      classIds: uniqueClassIds,
      assignedDate: input.assignedDate,
      publishAt: new Date(input.publishAt).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    db.update("classroomHomeworks", (items: ClassroomHomework[]) => [homework, ...items]);
    return homework;
  },

  async deleteHomework(id: string): Promise<void> {
    await delay(150);
    maybeThrowError();
    const exists = db.read("classroomHomeworks").some((item: ClassroomHomework) => item.id === id);
    if (!exists) throw new Error("作业不存在");
    db.update("classroomHomeworks", (items: ClassroomHomework[]) => items.filter((item) => item.id !== id));
  },
};
