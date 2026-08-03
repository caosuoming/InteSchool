import type {
  Student,
  StudentInteraction,
  StudentInteractionView,
  InteractionType,
  Teacher,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { classService } from "./class.js";

export interface InteractionInput {
  studentId: string;
  type: InteractionType;
  content: string;
  attitude?: number;
  statusTag?: string;
  shareWithHomeroom?: boolean;
}

async function requireStudentAccess(teacher: Teacher, studentId: string): Promise<void> {
  const students = await classService.listMyStudents(teacher.schoolId, teacher.id);
  if (!students.some((student) => student.id === studentId)) {
    throw new Error("只能访问自己任教班级或个人教学班的学生");
  }
}

function getHomeroomClassIds(teacher: Teacher, schoolId: string): Set<string> {
  const affiliation = teacher.affiliations?.find((item) => item.schoolId === schoolId)
    || teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return new Set(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []);
}

function isHomeroomTeacherForStudent(teacher: Teacher, student: Student | undefined): boolean {
  if (!student || student.schoolId !== teacher.schoolId) return false;
  return getHomeroomClassIds(teacher, student.schoolId).has(student.classId);
}

function toVisibleInteraction(
  interaction: StudentInteraction,
  teacher: Teacher,
): StudentInteractionView {
  if (interaction.teacherId === teacher.id) {
    return {
      ...interaction,
      isAnonymous: false,
      canDelete: true,
    };
  }
  const { teacherId: _teacherId, ...anonymousInteraction } = interaction;
  return {
    ...anonymousInteraction,
    isAnonymous: true,
    canDelete: false,
  };
}

function canViewInteraction(
  interaction: StudentInteraction,
  teacher: Teacher,
  student: Student | undefined,
): boolean {
  return interaction.teacherId === teacher.id
    || (interaction.sharedWithHomeroom === true && isHomeroomTeacherForStudent(teacher, student));
}

export const studentInteractionService = {
  async listByStudent(studentId: string, teacher: Teacher): Promise<StudentInteractionView[]> {
    await delay(200);
    await requireStudentAccess(teacher, studentId);
    const student = db.read("students").find((item: Student) => item.id === studentId);
    return db
      .read("studentInteractions")
      .filter((interaction: StudentInteraction) =>
        interaction.studentId === studentId
        && canViewInteraction(interaction, teacher, student),
      )
      .sort((a: StudentInteraction, b: StudentInteraction) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((interaction: StudentInteraction) => toVisibleInteraction(interaction, teacher));
  },

  async listByTeacher(teacherId: string, teacher: Teacher): Promise<StudentInteractionView[]> {
    await delay(200);
    if (teacherId !== teacher.id) throw new Error("只能查看自己的师生互动页面");
    const students = new Map<string, Student>(
      db.read("students").map((student: Student) => [student.id, student]),
    );
    return db
      .read("studentInteractions")
      .filter((interaction: StudentInteraction) =>
        canViewInteraction(interaction, teacher, students.get(interaction.studentId)),
      )
      .sort((a: StudentInteraction, b: StudentInteraction) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((interaction: StudentInteraction) => toVisibleInteraction(interaction, teacher));
  },

  async createInteraction(
    teacherId: string,
    schoolId: string,
    input: InteractionInput,
    teacher: Teacher,
  ): Promise<StudentInteraction> {
    await delay(300);
    maybeThrowError();
    await requireStudentAccess(teacher, input.studentId);
    const now = new Date().toISOString();
    const interaction: StudentInteraction = {
      id: genId("si"),
      teacherId,
      schoolId,
      studentId: input.studentId,
      type: input.type,
      content: input.content,
      attitude: input.attitude,
      statusTag: input.statusTag,
      sharedWithHomeroom: input.shareWithHomeroom === true,
      createdAt: now,
    };
    db.update("studentInteractions", (list) => [interaction, ...list]);
    return interaction;
  },

  async deleteInteraction(id: string, teacher: Teacher): Promise<void> {
    await delay(200);
    const interaction = db
      .read("studentInteractions")
      .find((item: StudentInteraction) => item.id === id);
    if (interaction && interaction.teacherId !== teacher.id) {
      throw new Error("不能删除其他教师的互动记录");
    }
    db.update("studentInteractions", (list) => list.filter((i) => i.id !== id));
  },
};
