import { rpcCall } from "./api";

import type { Courseware, CoursewareType, ResourceFilter, ResourceSemester } from "@/types";

export interface CoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: CoursewareType;
  content: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  editorUrl?: string;
  tags: string[];
}

export const coursewareService = {
  async listCoursewares(filter: ResourceFilter = {}): Promise<Courseware[]> {
    return rpcCall("courseware", "listCoursewares", [filter]) as any;
  },

  async getCourseware(id: string): Promise<Courseware | null> {
    return rpcCall("courseware", "getCourseware", [id]) as any;
  },

  async createCourseware(teacherId: string, schoolId: string, input: CoursewareInput): Promise<Courseware> {
    return rpcCall("courseware", "createCourseware", [teacherId, schoolId, input]) as any;
  },

  async updateCourseware(id: string, patch: Partial<Courseware>): Promise<Courseware> {
    return rpcCall("courseware", "updateCourseware", [id, patch]) as any;
  },

  async deleteCourseware(id: string): Promise<void> {
    return rpcCall("courseware", "deleteCourseware", [id]) as any;
  },

  async duplicateCourseware(sourceId: string, newTitle?: string): Promise<Courseware> {
    return rpcCall("courseware", "duplicateCourseware", [sourceId, newTitle]) as any;
  }
};
