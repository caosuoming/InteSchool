import { rpcCall } from "./api";

import type {
  ExtractedDocumentBlock,
  Lecture,
  LectureColumnTemplate,
  LectureColumnTemplateItem,
  LectureFilter,
  LectureSection,
  ResourceSemester,
} from "@/types";

export interface LectureInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  classIds: string[];
  studentIds: string[];
  sections: LectureSection[];
  typeId?: string;
  questionSourceType?: string;
  questionCategory?: string;
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
}

export interface LectureColumnTemplateInput {
  name: string;
  description?: string;
  columns: LectureColumnTemplateItem[];
}

export const lectureService = {
  async listLectures(filter: LectureFilter = {}): Promise<Lecture[]> {
    return rpcCall("lecture", "listLectures", [filter]) as any;
  },

  async getLecture(id: string): Promise<Lecture | null> {
    return rpcCall("lecture", "getLecture", [id]) as any;
  },

  async listColumnTemplates(teacherId: string, schoolId: string): Promise<LectureColumnTemplate[]> {
    return rpcCall("lecture", "listColumnTemplates", [teacherId, schoolId]) as any;
  },

  async createColumnTemplate(
    teacherId: string,
    schoolId: string,
    input: LectureColumnTemplateInput,
  ): Promise<LectureColumnTemplate> {
    return rpcCall("lecture", "createColumnTemplate", [teacherId, schoolId, input]) as any;
  },

  async deleteColumnTemplate(templateId: string, teacherId: string): Promise<void> {
    return rpcCall("lecture", "deleteColumnTemplate", [templateId, teacherId]) as any;
  },

  async createLecture(teacherId: string, schoolId: string, input: LectureInput): Promise<Lecture> {
    return rpcCall("lecture", "createLecture", [teacherId, schoolId, input]) as any;
  },

  async updateLecture(id: string, patch: Partial<Lecture>): Promise<Lecture> {
    return rpcCall("lecture", "updateLecture", [id, patch]) as any;
  },

  async deleteLecture(id: string): Promise<void> {
    return rpcCall("lecture", "deleteLecture", [id]) as any;
  },

  async duplicateLecture(sourceId: string, newTitle?: string): Promise<Lecture> {
    return rpcCall("lecture", "duplicateLecture", [sourceId, newTitle]) as any;
  },

  async addQuestionToLecture(lectureId: string, questionId: string, position?: number): Promise<void> {
    return rpcCall("lecture", "addQuestionToLecture", [lectureId, questionId, position]) as any;
  },

  async addSectionToLecture(lectureId: string, section: Omit<LectureSection, "id">): Promise<LectureSection> {
    return rpcCall("lecture", "addSectionToLecture", [lectureId, section]) as any;
  },

  async removeSection(lectureId: string, sectionId: string): Promise<void> {
    return rpcCall("lecture", "removeSection", [lectureId, sectionId]) as any;
  },

  async reorderSections(lectureId: string, sectionIds: string[]): Promise<void> {
    return rpcCall("lecture", "reorderSections", [lectureId, sectionIds]) as any;
  },

  async publish(lectureId: string): Promise<void> {
    return rpcCall("lecture", "publish", [lectureId]) as any;
  },

  async createExtractCopy(
    sourceId: string,
    contentBlocks: ExtractedDocumentBlock[] = [],
  ): Promise<Lecture> {
    return rpcCall("lecture", "createExtractCopy", [sourceId, contentBlocks]) as any;
  },

  async getExtractCopy(sourceId: string): Promise<Lecture | null> {
    return rpcCall("lecture", "getExtractCopy", [sourceId]) as any;
  },

  async convertToExamPaper(lectureId: string): Promise<{ paperId: string }> {
    return rpcCall("lecture", "convertToExamPaper", [lectureId]) as any;
  }
};
