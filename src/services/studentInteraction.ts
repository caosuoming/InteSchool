import type { StudentInteraction, InteractionType } from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";

export interface InteractionInput {
  studentId: string;
  type: InteractionType;
  content: string;
  attitude?: number;
  statusTag?: string;
}

export const studentInteractionService = {
  async listByStudent(studentId: string): Promise<StudentInteraction[]> {
    await delay(200);
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
  ): Promise<StudentInteraction> {
    await delay(300);
    maybeThrowError();
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
