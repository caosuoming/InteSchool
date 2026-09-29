import type {
  AnyClass,
  HomeworkAttitudeKeyword,
  HomeworkAttitudeRecord,
  HomeworkClassOverviewRecord,
  HomeworkKnowledgeRecord,
  HomeworkKnowledgeStatus,
  HomeworkRecordPreference,
  KnowledgePoint,
  Student,
  StudentMissingHomeworkRecord,
  Teacher,
} from "../../src/types/index.js";
import { HOMEWORK_ATTITUDE_KEYWORDS } from "../../src/types/index.js";
import { delay, genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";
import { classService } from "./class.js";

const VALID_STATUSES = new Set<HomeworkKnowledgeStatus>([
  "done",
  "correct",
  "partial",
  "wrong",
]);

const VALID_ATTITUDE_KEYWORDS = new Set<string>(HOMEWORK_ATTITUDE_KEYWORDS);

function normalizeHomeworkDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("作业日期格式不正确");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("作业日期格式不正确");
  }
  return date;
}

function homeworkDateOf(record: HomeworkAttitudeRecord): string {
  return record.homeworkDate || record.createdAt.slice(0, 10);
}

async function requireStudentAccess(teacher: Teacher, studentId: string): Promise<void> {
  const students = await classService.listMyStudents(teacher.schoolId, teacher.id);
  if (!students.some((student) => student.id === studentId)) {
    throw new Error("只能记录自己任教班级或个人教学班的学生");
  }
}

async function requireClassAccess(teacher: Teacher, classId: string): Promise<AnyClass> {
  const classes = await classService.listMyClasses(teacher.schoolId, teacher.id);
  const classInfo = classes.find((item) => item.id === classId);
  if (!classInfo) throw new Error("只能记录自己的任教班级或个人教学班");
  return classInfo;
}

function classStudentIds(classInfo: AnyClass): string[] {
  const students = ((db.read("students") || []) as Student[]).filter((student) => student.status === "active");
  if (classInfo.type === "school") {
    return students.filter((student) => student.classId === classInfo.id).map((student) => student.id);
  }
  const allowed = new Set(classInfo.studentIds);
  return students.filter((student) => allowed.has(student.id)).map((student) => student.id);
}

function normalizeStudentIds(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${fieldName}格式不正确`);
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function teacherKnowledgePoints(teacher: Teacher): KnowledgePoint[] {
  return ((db.read("knowledgePoints") || []) as KnowledgePoint[]).filter(
    (point) => point.teacherId === teacher.id,
  );
}

function requireKnowledgePoint(teacher: Teacher, knowledgePointId: string): KnowledgePoint {
  const point = teacherKnowledgePoints(teacher).find((item) => item.id === knowledgePointId);
  if (!point) throw new Error("只能选择自己当前知识点目录中的知识点");
  return point;
}

export const homeworkRecordService = {
  async listPinnedKnowledgePointIds(teacher: Teacher): Promise<string[]> {
    await delay(80);
    const validIds = new Set(teacherKnowledgePoints(teacher).map((point) => point.id));
    const preference = ((db.read("homeworkRecordPreferences") || []) as HomeworkRecordPreference[])
      .find((item) => item.teacherId === teacher.id);
    return (preference?.knowledgePointIds || []).filter((id) => validIds.has(id));
  },

  async setPinnedKnowledgePointIds(
    knowledgePointIds: string[],
    teacher: Teacher,
  ): Promise<string[]> {
    await delay(100);
    if (!Array.isArray(knowledgePointIds)) throw new Error("知识点列表格式不正确");
    const uniqueIds = [...new Set(knowledgePointIds.map((id) => String(id).trim()).filter(Boolean))];
    uniqueIds.forEach((id) => requireKnowledgePoint(teacher, id));
    if (!teacher.schoolId) throw new Error("当前教师未加入学校");

    const now = new Date().toISOString();
    const current = ((db.read("homeworkRecordPreferences") || []) as HomeworkRecordPreference[])
      .find((item) => item.teacherId === teacher.id);
    const next: HomeworkRecordPreference = current
      ? { ...current, schoolId: teacher.schoolId, knowledgePointIds: uniqueIds, updatedAt: now }
      : {
          id: genId("hrp"),
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
          knowledgePointIds: uniqueIds,
          updatedAt: now,
        };
    db.update("homeworkRecordPreferences", (items: HomeworkRecordPreference[] = []) => current
      ? items.map((item) => item.id === current.id ? next : item)
      : [next, ...items]);
    return uniqueIds;
  },

  async listByStudent(studentId: string, teacher: Teacher): Promise<HomeworkKnowledgeRecord[]> {
    await delay(100);
    await requireStudentAccess(teacher, studentId);
    return ((db.read("homeworkKnowledgeRecords") || []) as HomeworkKnowledgeRecord[])
      .filter((item) => item.teacherId === teacher.id && item.studentId === studentId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getAttitudeByStudent(
    studentId: string,
    homeworkDate: string | undefined,
    teacher: Teacher,
  ): Promise<HomeworkAttitudeRecord | null> {
    await delay(80);
    await requireStudentAccess(teacher, studentId);
    const normalizedDate = normalizeHomeworkDate(homeworkDate);
    const records = ((db.read("homeworkAttitudeRecords") || []) as HomeworkAttitudeRecord[])
      .filter((item) => item.teacherId === teacher.id && item.studentId === studentId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!normalizedDate) return records[0] || null;
    return records.find((item) => homeworkDateOf(item) === normalizedDate) || null;
  },

  async listAttitudesByStudent(
    studentId: string,
    teacher: Teacher,
  ): Promise<HomeworkAttitudeRecord[]> {
    await delay(80);
    await requireStudentAccess(teacher, studentId);
    return ((db.read("homeworkAttitudeRecords") || []) as HomeworkAttitudeRecord[])
      .filter((item) => (
        item.teacherId === teacher.id
        && item.studentId === studentId
        && (item.keywords.length > 0 || Boolean(item.evaluation?.trim()))
      ))
      .sort((a, b) => {
        const dateOrder = homeworkDateOf(b).localeCompare(homeworkDateOf(a));
        return dateOrder || b.updatedAt.localeCompare(a.updatedAt);
      });
  },

  async getClassOverview(
    classId: string,
    homeworkDate: string,
    teacher: Teacher,
  ): Promise<HomeworkClassOverviewRecord | null> {
    await delay(80);
    const normalizedClassId = String(classId || "").trim();
    if (!normalizedClassId) throw new Error("班级不能为空");
    const normalizedDate = normalizeHomeworkDate(homeworkDate);
    if (!normalizedDate) throw new Error("作业日期不能为空");
    await requireClassAccess(teacher, normalizedClassId);
    return ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .find((item) => (
        item.teacherId === teacher.id
        && item.classId === normalizedClassId
        && item.homeworkDate === normalizedDate
      )) || null;
  },

  async listClassOverviews(
    classId: string,
    teacher: Teacher,
  ): Promise<HomeworkClassOverviewRecord[]> {
    await delay(80);
    const normalizedClassId = String(classId || "").trim();
    if (!normalizedClassId) throw new Error("班级不能为空");
    await requireClassAccess(teacher, normalizedClassId);
    return ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .filter((item) => (
        item.teacherId === teacher.id
        && item.classId === normalizedClassId
        && (item.attendanceTaken || Boolean(item.summary?.trim()))
      ))
      .sort((left, right) => {
        const dateOrder = right.homeworkDate.localeCompare(left.homeworkDate);
        return dateOrder || right.updatedAt.localeCompare(left.updatedAt);
      });
  },

  async saveClassOverview(
    input: {
      classId: string;
      homeworkDate: string;
      summary?: string;
      submittedStudentIds?: string[];
      absentStudentIds?: string[];
      attendanceTaken?: boolean;
    },
    teacher: Teacher,
  ): Promise<HomeworkClassOverviewRecord> {
    await delay(100);
    const classId = String(input?.classId || "").trim();
    if (!classId) throw new Error("班级不能为空");
    const homeworkDate = normalizeHomeworkDate(input?.homeworkDate);
    if (!homeworkDate) throw new Error("作业日期不能为空");
    const classInfo = await requireClassAccess(teacher, classId);
    if (!teacher.schoolId) throw new Error("当前教师未加入学校");

    const records = ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[]);
    const existing = records.find((item) => (
      item.teacherId === teacher.id
      && item.classId === classId
      && item.homeworkDate === homeworkDate
    ));
    const summary = input.summary === undefined ? existing?.summary || "" : String(input.summary).trim();
    if (summary.length > 4000) throw new Error("作业概况不能超过 4000 字");

    let studentIds = existing?.studentIds || [];
    let submittedStudentIds = existing?.submittedStudentIds || [];
    let absentStudentIds = existing?.absentStudentIds || [];
    let attendanceTaken = existing?.attendanceTaken === true;

    const updatingAttendance = input.submittedStudentIds !== undefined
      || input.absentStudentIds !== undefined
      || input.attendanceTaken !== undefined;
    if (updatingAttendance) {
      studentIds = classStudentIds(classInfo);
      const allowedStudentIds = new Set(studentIds);
      submittedStudentIds = normalizeStudentIds(
        input.submittedStudentIds ?? submittedStudentIds,
        "已交作业学生列表",
      );
      absentStudentIds = normalizeStudentIds(
        input.absentStudentIds ?? absentStudentIds,
        "请假学生列表",
      );
      if (submittedStudentIds.some((id) => !allowedStudentIds.has(id))
        || absentStudentIds.some((id) => !allowedStudentIds.has(id))) {
        throw new Error("作业点名中包含不属于该班级的学生");
      }
      const absentSet = new Set(absentStudentIds);
      if (submittedStudentIds.some((id) => absentSet.has(id))) {
        throw new Error("同一学生不能同时标记为已交作业和请假");
      }
      attendanceTaken = input.attendanceTaken ?? true;
    }

    const now = new Date().toISOString();
    const next: HomeworkClassOverviewRecord = existing
      ? {
          ...existing,
          summary,
          studentIds,
          submittedStudentIds,
          absentStudentIds,
          attendanceTaken,
          updatedAt: now,
        }
      : {
          id: genId("hco"),
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
          classId,
          homeworkDate,
          summary,
          studentIds,
          submittedStudentIds,
          absentStudentIds,
          attendanceTaken,
          createdAt: now,
          updatedAt: now,
        };
    db.update("homeworkClassOverviewRecords", (items: HomeworkClassOverviewRecord[] = []) => existing
      ? items.map((item) => item.id === existing.id ? next : item)
      : [next, ...items]);
    return next;
  },

  async listMissingByStudent(
    studentId: string,
    teacher: Teacher,
  ): Promise<StudentMissingHomeworkRecord[]> {
    await delay(80);
    const normalizedStudentId = String(studentId || "").trim();
    if (!normalizedStudentId) throw new Error("学生不能为空");
    await requireStudentAccess(teacher, normalizedStudentId);
    return ((db.read("homeworkClassOverviewRecords") || []) as HomeworkClassOverviewRecord[])
      .filter((item) => (
        item.teacherId === teacher.id
        && item.attendanceTaken === true
        && (item.studentIds || []).includes(normalizedStudentId)
        && !(item.submittedStudentIds || []).includes(normalizedStudentId)
        && !(item.absentStudentIds || []).includes(normalizedStudentId)
      ))
      .sort((left, right) => {
        const dateOrder = right.homeworkDate.localeCompare(left.homeworkDate);
        return dateOrder || right.updatedAt.localeCompare(left.updatedAt);
      })
      .map((item) => ({
        id: `${item.id}:${normalizedStudentId}`,
        classOverviewId: item.id,
        teacherId: item.teacherId,
        schoolId: item.schoolId,
        classId: item.classId,
        studentId: normalizedStudentId,
        homeworkDate: item.homeworkDate,
        summary: item.summary || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
  },

  async setAttitudeKeywords(
    input: {
      studentId: string;
      homeworkDate?: string;
      keywords: HomeworkAttitudeKeyword[];
    },
    teacher: Teacher,
  ): Promise<HomeworkAttitudeRecord | null> {
    await delay(100);
    const studentId = String(input?.studentId || "").trim();
    if (!studentId) throw new Error("学生不能为空");
    if (!Array.isArray(input?.keywords)) throw new Error("作业态度关键词格式不正确");
    await requireStudentAccess(teacher, studentId);

    const homeworkDate = normalizeHomeworkDate(input.homeworkDate);
    const keywords = [...new Set(input.keywords.map((keyword) => String(keyword).trim()).filter(Boolean))];
    if (keywords.some((keyword) => !VALID_ATTITUDE_KEYWORDS.has(keyword))) {
      throw new Error("作业态度关键词不正确");
    }

    const items = (db.read("homeworkAttitudeRecords") || []) as HomeworkAttitudeRecord[];
    const existing = items.find((item) =>
      item.teacherId === teacher.id
      && item.studentId === studentId
      && (homeworkDate ? homeworkDateOf(item) === homeworkDate : !item.homeworkDate),
    );
    if (keywords.length === 0 && !existing?.evaluation?.trim()) {
      if (existing) {
        db.update("homeworkAttitudeRecords", (records: HomeworkAttitudeRecord[] = []) =>
          records.filter((item) => item.id !== existing.id));
      }
      return null;
    }
    if (!teacher.schoolId) throw new Error("当前教师未加入学校");

    const now = new Date().toISOString();
    const typedKeywords = keywords as HomeworkAttitudeKeyword[];
    const next: HomeworkAttitudeRecord = existing
      ? {
          ...existing,
          ...(homeworkDate ? { homeworkDate } : {}),
          keywords: typedKeywords,
          updatedAt: now,
        }
      : {
          id: genId("har"),
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
          studentId,
          ...(homeworkDate ? { homeworkDate } : {}),
          keywords: typedKeywords,
          createdAt: now,
          updatedAt: now,
        };
    db.update("homeworkAttitudeRecords", (records: HomeworkAttitudeRecord[] = []) => existing
      ? records.map((item) => item.id === existing.id ? next : item)
      : [next, ...records]);
    return next;
  },

  async setEvaluation(
    input: {
      studentId: string;
      homeworkDate?: string;
      evaluation: string;
    },
    teacher: Teacher,
  ): Promise<HomeworkAttitudeRecord | null> {
    await delay(100);
    const studentId = String(input?.studentId || "").trim();
    if (!studentId) throw new Error("学生不能为空");
    if (typeof input?.evaluation !== "string") throw new Error("作业评价格式不正确");
    await requireStudentAccess(teacher, studentId);

    const homeworkDate = normalizeHomeworkDate(input.homeworkDate);
    const evaluation = input.evaluation.trim();
    const items = (db.read("homeworkAttitudeRecords") || []) as HomeworkAttitudeRecord[];
    const existing = items.find((item) =>
      item.teacherId === teacher.id
      && item.studentId === studentId
      && (homeworkDate ? homeworkDateOf(item) === homeworkDate : !item.homeworkDate),
    );
    if (!evaluation && (!existing || existing.keywords.length === 0)) {
      if (existing) {
        db.update("homeworkAttitudeRecords", (records: HomeworkAttitudeRecord[] = []) =>
          records.filter((item) => item.id !== existing.id));
      }
      return null;
    }
    if (!teacher.schoolId) throw new Error("当前教师未加入学校");

    const now = new Date().toISOString();
    const next: HomeworkAttitudeRecord = existing
      ? {
          ...existing,
          ...(homeworkDate ? { homeworkDate } : {}),
          evaluation: evaluation || undefined,
          updatedAt: now,
        }
      : {
          id: genId("har"),
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
          studentId,
          ...(homeworkDate ? { homeworkDate } : {}),
          keywords: [],
          evaluation,
          createdAt: now,
          updatedAt: now,
        };
    db.update("homeworkAttitudeRecords", (records: HomeworkAttitudeRecord[] = []) => existing
      ? records.map((item) => item.id === existing.id ? next : item)
      : [next, ...records]);
    return next;
  },

  async setRecord(
    input: {
      studentId: string;
      knowledgePointId: string;
      status: HomeworkKnowledgeStatus | null;
    },
    teacher: Teacher,
  ): Promise<HomeworkKnowledgeRecord | null> {
    await delay(100);
    const studentId = String(input?.studentId || "").trim();
    const knowledgePointId = String(input?.knowledgePointId || "").trim();
    if (!studentId || !knowledgePointId) throw new Error("学生和知识点不能为空");
    await requireStudentAccess(teacher, studentId);
    requireKnowledgePoint(teacher, knowledgePointId);
    if (input.status !== null && !VALID_STATUSES.has(input.status)) {
      throw new Error("作业记录状态不正确");
    }

    const items = (db.read("homeworkKnowledgeRecords") || []) as HomeworkKnowledgeRecord[];
    const existing = items.find((item) =>
      item.teacherId === teacher.id
      && item.studentId === studentId
      && item.knowledgePointId === knowledgePointId,
    );
    if (input.status === null) {
      if (existing) {
        db.update("homeworkKnowledgeRecords", (records: HomeworkKnowledgeRecord[] = []) =>
          records.filter((item) => item.id !== existing.id));
      }
      return null;
    }
    if (!teacher.schoolId) throw new Error("当前教师未加入学校");

    const now = new Date().toISOString();
    const next: HomeworkKnowledgeRecord = existing
      ? { ...existing, status: input.status, updatedAt: now }
      : {
          id: genId("hkr"),
          teacherId: teacher.id,
          schoolId: teacher.schoolId,
          studentId,
          knowledgePointId,
          status: input.status,
          createdAt: now,
          updatedAt: now,
        };
    db.update("homeworkKnowledgeRecords", (records: HomeworkKnowledgeRecord[] = []) => existing
      ? records.map((item) => item.id === existing.id ? next : item)
      : [next, ...records]);
    return next;
  },
};
