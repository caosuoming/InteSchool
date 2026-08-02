import type { StudentInteraction, InteractionType, Teacher } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { classService } from "./class.js";

export interface InteractionInput {
  studentId: string;
  type: InteractionType;
  content: string;
  attitude?: number;
  statusTag?: string;
}

async function requireStudentAccess(teacher: Teacher, studentId: string): Promise<void> {
  const students = await classService.listMyStudents(teacher.schoolId, teacher.id);
  if (!students.some((student) => student.id === studentId)) {
    throw new Error("只能访问自己任教班级或个人教学班的学生");
  }
}

export const studentInteractionService = {
  async listByStudent(studentId: string, teacher: Teacher): Promise<StudentInteraction[]> {
    await delay(200);
    await requireStudentAccess(teacher, studentId);
    return db
      .read("studentInteractions")
      .filter((i) => i.studentId === studentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async listByTeacher(teacherId: string): Promise<StudentInteraction[]> {
    await delay(200);
    return db
      .read("studentInteractions")
      .filter((i) => i.teacherId === teacherId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      createdAt: now,
    };
    db.update("studentInteractions", (list) => [interaction, ...list]);
    return interaction;
  },

  async deleteInteraction(id: string): Promise<void> {
    await delay(200);
    db.update("studentInteractions", (list) => list.filter((i) => i.id !== id));
  },
};
