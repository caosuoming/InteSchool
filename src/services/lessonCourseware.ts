import { rpcCall } from "./api";

import type { LessonCourseware, LessonCoursewareFilter, LessonSlide, ExamPaper, Lecture, Courseware, ResourceSemester } from "@/types";

export interface LessonCoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  sourceType: "examPaper" | "lecture" | "courseware" | "manual";
  sourceId?: string;
  sourceTitle?: string;
  slides: LessonSlide[];
  classIds: string[];
}

export const lessonCoursewareService = {
  async listCoursewares(filter: LessonCoursewareFilter = {}): Promise<LessonCourseware[]> {
    return rpcCall("lessonCourseware", "listCoursewares", [filter]) as any;
  },

  async getCourseware(id: string): Promise<LessonCourseware | null> {
    return rpcCall("lessonCourseware", "getCourseware", [id]) as any;
  },

  async createCourseware(teacherId: string, schoolId: string, input: LessonCoursewareInput): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createCourseware", [teacherId, schoolId, input]) as any;
  },

  async updateCourseware(id: string, patch: Partial<LessonCourseware>): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "updateCourseware", [id, patch]) as any;
  },

  async deleteCourseware(id: string): Promise<void> {
    return rpcCall("lessonCourseware", "deleteCourseware", [id]) as any;
  },

  async publishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "publishCourseware", [id]) as any;
  },

  async unpublishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "unpublishCourseware", [id]) as any;
  },

  async createFromExamPaper(teacherId: string, schoolId: string, examPaper: ExamPaper): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromExamPaper", [teacherId, schoolId, examPaper]) as any;
  },

  async createFromLecture(teacherId: string, schoolId: string, lecture: Lecture): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromLecture", [teacherId, schoolId, lecture]) as any;
  },

  async createFromCourseware(teacherId: string, schoolId: string, courseware: Courseware): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromCourseware", [teacherId, schoolId, courseware.id]) as any;
  }
};
