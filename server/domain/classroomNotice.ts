import type {
  ClassroomNotice,
  ClassroomNoticeFilter,
  TeacherAffiliation,
} from "../../src/types/index.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { db } from "../runtime-db.js";

export interface ClassroomNoticeInput {
  content: string;
  classIds: string[];
  startsAt: string;
  endsAt: string;
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

function matchesFilter(item: ClassroomNotice, filter: ClassroomNoticeFilter): boolean {
  if (filter.schoolId && item.schoolId !== filter.schoolId) return false;
  if (filter.teacherId && item.teacherId !== filter.teacherId) return false;
  if (filter.classId && !item.classIds.includes(filter.classId)) return false;
  if (filter.activeOnly) {
    const now = Date.now();
    if (new Date(item.startsAt).getTime() > now || new Date(item.endsAt).getTime() < now) return false;
  }
  return true;
}

function validateInput(input: ClassroomNoticeInput): void {
  const content = input.content.trim();
  if (!content) throw new Error("请输入通知内容");
  if (content.length > 500) throw new Error("通知内容不能超过 500 字");
  if (input.classIds.length === 0) throw new Error("请选择至少一个通知班级");

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("通知起止时间格式不正确");
  }
  if (endsAt.getTime() <= startsAt.getTime()) throw new Error("通知结束时间必须晚于开始时间");
}

export const classroomNoticeService = {
  async listNotices(filter: ClassroomNoticeFilter = {}): Promise<ClassroomNotice[]> {
    await delay(100);
    return db
      .read("classroomNotices")
      .filter((item: ClassroomNotice) => matchesFilter(item, filter))
      .sort((left: ClassroomNotice, right: ClassroomNotice) => {
        const startDiff = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
        if (startDiff !== 0) return startDiff;
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });
  },

  async createNotice(
    teacherId: string,
    schoolId: string,
    input: ClassroomNoticeInput,
  ): Promise<ClassroomNotice> {
    await delay(150);
    maybeThrowError();
    validateInput(input);

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
      throw new Error("通知班级不存在或已毕业");
    }

    const teacherClassIds = allowedClassIds(teacher);
    if (uniqueClassIds.some((classId) => !teacherClassIds.has(classId))) {
      throw new Error("只能向自己的任教班级发布通知");
    }

    const now = new Date().toISOString();
    const notice: ClassroomNotice = {
      id: genId("notice"),
      teacherId,
      teacherName: teacher.name,
      schoolId,
      content: input.content.trim(),
      classIds: uniqueClassIds,
      startsAt: new Date(input.startsAt).toISOString(),
      endsAt: new Date(input.endsAt).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    db.update("classroomNotices", (items: ClassroomNotice[]) => [notice, ...items]);
    return notice;
  },
};
