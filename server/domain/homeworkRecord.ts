import type {
  HomeworkKnowledgeRecord,
  HomeworkKnowledgeStatus,
  HomeworkRecordPreference,
  KnowledgePoint,
  Teacher,
} from "../../src/types/index.js";
import { delay, genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";
import { classService } from "./class.js";

const VALID_STATUSES = new Set<HomeworkKnowledgeStatus>([
  "done",
  "correct",
  "partial",
  "wrong",
]);

async function requireStudentAccess(teacher: Teacher, studentId: string): Promise<void> {
  const students = await classService.listMyStudents(teacher.schoolId, teacher.id);
  if (!students.some((student) => student.id === studentId)) {
    throw new Error("只能记录自己任教班级或个人教学班的学生");
  }
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
