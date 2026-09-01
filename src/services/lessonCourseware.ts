import { rpcCall } from "./api";

import type {
  Courseware,
  LessonCourseware,
  LessonCoursewareFilter,
  LessonDocumentBlock,
  LessonSlide,
  PptSlideImportElement,
  ResourceSemester,
  TeacherLessonSchedule,
  TeacherLessonScheduleEntry,
  TeacherLessonScheduleTimeRange,
} from "@/types";

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
  coursewareMode?: "editable" | "direct";
  slides: LessonSlide[];
  classIds: string[];
}

export const lessonCoursewareService = {
  async getLessonSchedule(): Promise<TeacherLessonSchedule> {
    return rpcCall("lessonCourseware", "getLessonSchedule", []) as any;
  },

  async saveLessonSchedule(
    entries: TeacherLessonScheduleEntry[],
    timeRanges: TeacherLessonScheduleTimeRange[],
  ): Promise<TeacherLessonSchedule> {
    return rpcCall("lessonCourseware", "saveLessonSchedule", [entries, timeRanges, undefined]) as any;
  },

  async listCoursewares(filter: LessonCoursewareFilter = {}): Promise<LessonCourseware[]> {
    return rpcCall("lessonCourseware", "listCoursewares", [filter]) as any;
  },

  async getCourseware(id: string): Promise<LessonCourseware | null> {
    return rpcCall("lessonCourseware", "getCourseware", [id]) as any;
  },

  async getCoursewareBySource(
    teacherId: string,
    schoolId: string,
    sourceType: "examPaper" | "lecture",
    sourceId: string,
  ): Promise<LessonCourseware | null> {
    const coursewares = await rpcCall("lessonCourseware", "listCoursewares", [{
      teacherId,
      schoolId,
      sourceType,
      sourceId,
    }]) as LessonCourseware[];
    return coursewares[0] || null;
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

  async completeCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "completeCourseware", [id]) as any;
  },

  async restoreCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "restoreCourseware", [id]) as any;
  },

  async publishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "publishCourseware", [id]) as any;
  },

  async unpublishCourseware(id: string): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "unpublishCourseware", [id]) as any;
  },

  async createFromExamPaper(
    teacherId: string,
    schoolId: string,
    examPaperId: string,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromExamPaper", [
      teacherId,
      schoolId,
      examPaperId,
      documentBlocks,
    ]) as any;
  },

  async createFromLecture(
    teacherId: string,
    schoolId: string,
    lectureId: string,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromLecture", [
      teacherId,
      schoolId,
      lectureId,
      documentBlocks,
    ]) as any;
  },

  async createFromCourseware(
    teacherId: string,
    schoolId: string,
    courseware: Courseware,
    pptSlides: Array<{ title: string; content: string; elements?: PptSlideImportElement[] }> = [],
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromCourseware", [teacherId, schoolId, courseware.id, {
      mode: "editable",
      pageCount: courseware.pageCount,
      pptSlides,
    }]) as any;
  },

  async createDirectFromCourseware(
    teacherId: string,
    schoolId: string,
    courseware: Courseware,
  ): Promise<LessonCourseware> {
    return rpcCall("lessonCourseware", "createFromCourseware", [teacherId, schoolId, courseware.id, {
      mode: "direct",
    }]) as any;
  }
};
