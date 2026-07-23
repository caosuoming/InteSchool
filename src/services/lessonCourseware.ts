import type { LessonCourseware, LessonCoursewareFilter, LessonSlide, Question, ExamPaper, Lecture, ExamPaperQuestion } from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";

function matchFilter(c: LessonCourseware, filter: LessonCoursewareFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${c.title} ${c.description || ""}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.grade && c.grade !== filter.grade) return false;
  if (filter.schoolYear && c.schoolYear !== filter.schoolYear) return false;
  if (filter.status && c.status !== filter.status) return false;
  if (filter.teacherId && c.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && c.schoolId !== filter.schoolId) return false;
  if (filter.chapterIds?.length) {
    if (!filter.chapterIds.some((ch) => c.chapterIds.includes(ch))) return false;
  }
  if (filter.knowledgePointIds?.length) {
    if (!filter.knowledgePointIds.some((k) => c.knowledgePointIds.includes(k))) return false;
  }
  return true;
}

export interface LessonCoursewareInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  sourceType: "examPaper" | "lecture" | "manual";
  sourceId?: string;
  sourceTitle?: string;
  slides: LessonSlide[];
  classIds: string[];
}

export const lessonCoursewareService = {
  async listCoursewares(filter: LessonCoursewareFilter = {}): Promise<LessonCourseware[]> {
    await delay(300);
    return db
      .read("lessonCoursewares")
      .filter((c) => matchFilter(c, filter))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getCourseware(id: string): Promise<LessonCourseware | null> {
    await delay(200);
    return db.read("lessonCoursewares").find((c) => c.id === id) || null;
  },

  async createCourseware(
    teacherId: string,
    schoolId: string,
    input: LessonCoursewareInput,
  ): Promise<LessonCourseware> {
    await delay(400);
    maybeThrowError();
    const now = new Date().toISOString();
    const courseware: LessonCourseware = {
      id: genId("lc"),
      teacherId,
      schoolId,
      title: input.title,
      description: input.description,
      chapterIds: input.chapterIds,
      knowledgePointIds: input.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      slides: input.slides,
      classIds: input.classIds,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    db.update("lessonCoursewares", (list) => [courseware, ...list]);
    return courseware;
  },

  async updateCourseware(id: string, patch: Partial<LessonCourseware>): Promise<LessonCourseware> {
    await delay(300);
    maybeThrowError();
    let updated: LessonCourseware | null = null;
    db.update("lessonCoursewares", (list) =>
      list.map((c) => {
        if (c.id === id) {
          updated = {
            ...c,
            ...patch,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return c;
      }),
    );
    if (!updated) throw new Error("课件不存在");
    return updated;
  },

  async deleteCourseware(id: string): Promise<void> {
    await delay(300);
    db.update("lessonCoursewares", (list) => list.filter((c) => c.id !== id));
  },

  async publishCourseware(id: string): Promise<LessonCourseware> {
    await delay(400);
    return this.updateCourseware(id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
  },

  async unpublishCourseware(id: string): Promise<LessonCourseware> {
    await delay(300);
    return this.updateCourseware(id, {
      status: "draft",
      publishedAt: undefined,
    });
  },

  /**
   * 从试卷创建课件（每页一道题）
   */
  async createFromExamPaper(
    teacherId: string,
    schoolId: string,
    examPaper: ExamPaper,
  ): Promise<LessonCourseware> {
    const slides: LessonSlide[] = examPaper.questions.map((q, i) => ({
      id: genId("slide"),
      type: "question",
      title: `第 ${i + 1} 题`,
      questionId: q.questionId,
      questionSnapshot: {
        stem: q.stem,
        type: q.type,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
      },
      relatedQuestionIds: [],
      askableStudentIds: [],
    }));

    return this.createCourseware(teacherId, schoolId, {
      title: `${examPaper.title}（上课课件）`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2025-2026",
      sourceType: "examPaper",
      sourceId: examPaper.id,
      sourceTitle: examPaper.title,
      slides,
      classIds: [],
    });
  },

  /**
   * 从讲义创建课件（知识块+题目分开成页）
   */
  async createFromLecture(
    teacherId: string,
    schoolId: string,
    lecture: Lecture,
  ): Promise<LessonCourseware> {
    const slides: LessonSlide[] = [];

    lecture.sections.forEach((sec) => {
      if (sec.type === "question" && sec.questionId) {
        slides.push({
          id: genId("slide"),
          type: "question",
          title: sec.title,
          questionId: sec.questionId,
          relatedQuestionIds: [],
          askableStudentIds: [],
        });
      } else {
        slides.push({
          id: genId("slide"),
          type: "knowledge",
          title: sec.title,
          content: sec.content,
        });
      }
    });

    return this.createCourseware(teacherId, schoolId, {
      title: `${lecture.title}（上课课件）`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2025-2026",
      sourceType: "lecture",
      sourceId: lecture.id,
      sourceTitle: lecture.title,
      slides,
      classIds: [],
    });
  },
};
