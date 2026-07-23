import type { Reflection, ReflectionTargetType } from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";

export interface ReflectionInput {
  lessonCoursewareId: string;
  targetId: string;
  targetType: ReflectionTargetType;
  content: string;
  rating?: number;
}

export const reflectionService = {
  async listByTarget(targetId: string): Promise<Reflection[]> {
    await delay(200);
    return db
      .read("reflections")
      .filter((r) => r.targetId === targetId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async listByLesson(lessonCoursewareId: string): Promise<Reflection[]> {
    await delay(200);
    return db
      .read("reflections")
      .filter((r) => r.lessonCoursewareId === lessonCoursewareId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async listByTeacher(teacherId: string): Promise<Reflection[]> {
    await delay(200);
    return db
      .read("reflections")
      .filter((r) => r.teacherId === teacherId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async createReflection(
    teacherId: string,
    schoolId: string,
    input: ReflectionInput,
  ): Promise<Reflection> {
    await delay(300);
    maybeThrowError();
    const now = new Date().toISOString();
    const reflection: Reflection = {
      id: genId("ref"),
      teacherId,
      schoolId,
      lessonCoursewareId: input.lessonCoursewareId,
      targetId: input.targetId,
      targetType: input.targetType,
      content: input.content,
      rating: input.rating,
      createdAt: now,
      updatedAt: now,
    };
    db.update("reflections", (list) => [reflection, ...list]);
    return reflection;
  },

  async updateReflection(id: string, patch: Partial<Reflection>): Promise<Reflection> {
    await delay(200);
    let updated: Reflection | null = null;
    db.update("reflections", (list) =>
      list.map((r) => {
        if (r.id === id) {
          updated = { ...r, ...patch, updatedAt: new Date().toISOString() };
          return updated;
        }
        return r;
      }),
    );
    if (!updated) throw new Error("反思不存在");
    return updated;
  },

  async deleteReflection(id: string): Promise<void> {
    await delay(200);
    db.update("reflections", (list) => list.filter((r) => r.id !== id));
  },

  /**
   * 复制反思到新资源（用于另存为场景）
   */
  async copyToTarget(
    teacherId: string,
    schoolId: string,
    fromTargetId: string,
    toTargetId: string,
    toLessonCoursewareId?: string,
  ): Promise<Reflection[]> {
    await delay(300);
    const sourceList = db
      .read("reflections")
      .filter((r) => r.targetId === fromTargetId);
    const now = new Date().toISOString();
    const copies: Reflection[] = sourceList.map((r) => ({
      ...r,
      id: genId("ref"),
      teacherId,
      schoolId,
      targetId: toTargetId,
      lessonCoursewareId: toLessonCoursewareId || r.lessonCoursewareId,
      createdAt: now,
      updatedAt: now,
    }));
    if (copies.length > 0) {
      db.update("reflections", (list) => [...copies, ...list]);
    }
    return copies;
  },
};
