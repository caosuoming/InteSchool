import { rpcCall } from "./api";

import type { Reflection, ReflectionTargetType } from "@/types";

export interface ReflectionInput {
  lessonCoursewareId: string;
  targetId: string;
  targetType: ReflectionTargetType;
  content: string;
  rating?: number;
}

export const reflectionService = {
  async listByTarget(targetId: string): Promise<Reflection[]> {
    return rpcCall("reflection", "listByTarget", [targetId]) as any;
  },

  async listByLesson(lessonCoursewareId: string): Promise<Reflection[]> {
    return rpcCall("reflection", "listByLesson", [lessonCoursewareId]) as any;
  },

  async listByTeacher(teacherId: string): Promise<Reflection[]> {
    return rpcCall("reflection", "listByTeacher", [teacherId]) as any;
  },

  async createReflection(teacherId: string, schoolId: string, input: ReflectionInput): Promise<Reflection> {
    return rpcCall("reflection", "createReflection", [teacherId, schoolId, input]) as any;
  },

  async updateReflection(id: string, patch: Partial<Reflection>): Promise<Reflection> {
    return rpcCall("reflection", "updateReflection", [id, patch]) as any;
  },

  async deleteReflection(id: string): Promise<void> {
    return rpcCall("reflection", "deleteReflection", [id]) as any;
  },

  async copyToTarget(teacherId: string, schoolId: string, fromTargetId: string, toTargetId: string, toLessonCoursewareId?: string): Promise<Reflection[]> {
    return rpcCall("reflection", "copyToTarget", [teacherId, schoolId, fromTargetId, toTargetId, toLessonCoursewareId]) as any;
  }
};
