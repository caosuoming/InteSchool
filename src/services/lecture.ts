import type { Lecture, LectureFilter, LectureSection } from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";
import { questionService } from "./question";
import { reflectionService } from "./reflection";

function matchFilter(l: Lecture, filter: LectureFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    if (!l.title.toLowerCase().includes(kw)) return false;
  }
  if (filter.chapterIds?.length) {
    const logic = filter.chapterLogic || "or";
    if (logic === "and") {
      if (!filter.chapterIds.every((c) => l.chapterIds.includes(c))) return false;
    } else {
      if (!filter.chapterIds.some((c) => l.chapterIds.includes(c))) return false;
    }
  }
  if (filter.knowledgePointIds?.length) {
    const logic = filter.knowledgeLogic || "or";
    if (logic === "and") {
      if (!filter.knowledgePointIds.every((k) => l.knowledgePointIds.includes(k))) return false;
    } else {
      if (!filter.knowledgePointIds.some((k) => l.knowledgePointIds.includes(k))) return false;
    }
  }
  if (filter.grade && l.grade !== filter.grade) return false;
  if (filter.schoolYear && l.schoolYear !== filter.schoolYear) return false;
  if (filter.status && l.status !== filter.status) return false;
  if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && l.schoolId !== filter.schoolId) return false;
  return true;
}

export interface LectureInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  classIds: string[];
  studentIds: string[];
  sections: LectureSection[];
  typeId?: string;
  originalFileUrl?: string;
  originalFileName?: string;
  originalFileType?: "word" | "pdf";
  originalFileSize?: number;
}

export const lectureService = {
  async listLectures(filter: LectureFilter = {}): Promise<Lecture[]> {
    await delay(300);
    return db
      .read("lectures")
      .filter((l) => matchFilter(l, filter))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  async getLecture(id: string): Promise<Lecture | null> {
    await delay(200);
    return db.read("lectures").find((l) => l.id === id) || null;
  },

  async createLecture(
    teacherId: string,
    schoolId: string,
    input: LectureInput,
  ): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    const now = new Date().toISOString();
    const lecture: Lecture = {
      id: genId("lec"),
      teacherId,
      schoolId,
      title: input.title,
      description: input.description,
      chapterIds: input.chapterIds,
      knowledgePointIds: input.knowledgePointIds,
      grade: input.grade,
      schoolYear: input.schoolYear,
      classIds: input.classIds,
      studentIds: input.studentIds,
      sections: input.sections,
      typeId: input.typeId,
      version: 1,
      status: "draft",
      originalFileUrl: input.originalFileUrl,
      originalFileName: input.originalFileName,
      originalFileType: input.originalFileType,
      originalFileSize: input.originalFileSize,
      createdAt: now,
      updatedAt: now,
    };
    db.update("lectures", (list) => [lecture, ...list]);
    return lecture;
  },

  async updateLecture(id: string, patch: Partial<Lecture>): Promise<Lecture> {
    await delay(300);
    maybeThrowError();
    let updated: Lecture | null = null;
    db.update("lectures", (list) =>
      list.map((l) => {
        if (l.id === id) {
          updated = {
            ...l,
            ...patch,
            version: patch.sections ? l.version + 1 : l.version,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return l;
      }),
    );
    if (!updated) throw new Error("讲义不存在");
    return updated;
  },

  async deleteLecture(id: string): Promise<void> {
    await delay(200);
    db.update("lectures", (list) => list.filter((l) => l.id !== id));
  },

  /**
   * 另存为：复制讲义（含 sections），并复制关联的课后反思
   */
  async duplicateLecture(
    sourceId: string,
    newTitle?: string,
  ): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    const source = db.read("lectures").find((l) => l.id === sourceId);
    if (!source) throw new Error("原讲义不存在");
    const now = new Date().toISOString();
    // 递归复制 sections，生成新 id（保留 questionId 引用）
    const copySections = (secs: LectureSection[]): LectureSection[] =>
      secs.map((s) => ({
        ...s,
        id: genId("sec"),
        children: copySections(s.children || []),
      }));
    const duplicated: Lecture = {
      ...source,
      id: genId("lec"),
      title: newTitle || `${source.title}（副本）`,
      status: "draft",
      version: 1,
      sections: copySections(source.sections),
      createdAt: now,
      updatedAt: now,
    };
    db.update("lectures", (list) => [duplicated, ...list]);
    // 复制关联反思
    await reflectionService.copyToTarget(
      source.teacherId,
      source.schoolId,
      source.id,
      duplicated.id,
    );
    return duplicated;
  },

  async addQuestionToLecture(
    lectureId: string,
    questionId: string,
    position?: number,
  ): Promise<void> {
    await delay(200);
    const lecture = db.read("lectures").find((l) => l.id === lectureId);
    if (!lecture) throw new Error("讲义不存在");
    const question = db.read("questions").find((q) => q.id === questionId);
    if (!question) throw new Error("题目不存在");

    const newSection: LectureSection = {
      id: genId("sec"),
      title: `题目·${question.stem.slice(0, 20)}${question.stem.length > 20 ? "..." : ""}`,
      type: "question",
      content: "",
      questionId,
      children: [],
    };

    const sections = [...lecture.sections];
    if (position === undefined || position >= sections.length) {
      sections.push(newSection);
    } else {
      sections.splice(position, 0, newSection);
    }

    await this.updateLecture(lectureId, { sections });
    await questionService.incrementUsage(questionId);
  },

  async addSectionToLecture(
    lectureId: string,
    section: Omit<LectureSection, "id">,
  ): Promise<LectureSection> {
    await delay(250);
    const newSection: LectureSection = { ...section, id: genId("sec") };
    const lecture = db.read("lectures").find((l) => l.id === lectureId);
    if (!lecture) throw new Error("讲义不存在");
    await this.updateLecture(lectureId, {
      sections: [...lecture.sections, newSection],
    });
    return newSection;
  },

  async removeSection(lectureId: string, sectionId: string): Promise<void> {
    await delay(200);
    const lecture = db.read("lectures").find((l) => l.id === lectureId);
    if (!lecture) throw new Error("讲义不存在");
    await this.updateLecture(lectureId, {
      sections: lecture.sections.filter((s) => s.id !== sectionId),
    });
  },

  async reorderSections(lectureId: string, sectionIds: string[]): Promise<void> {
    await delay(200);
    const lecture = db.read("lectures").find((l) => l.id === lectureId);
    if (!lecture) throw new Error("讲义不存在");
    const sectionMap = new Map(lecture.sections.map((s) => [s.id, s]));
    const newSections = sectionIds
      .map((id) => sectionMap.get(id))
      .filter((s): s is LectureSection => Boolean(s));
    await this.updateLecture(lectureId, { sections: newSections });
  },

  async publish(lectureId: string): Promise<void> {
    await delay(300);
    await this.updateLecture(lectureId, { status: "published" });
  },

  /**
   * 创建拆解副本：复制源讲义结构，标记为拆解副本，关联源资源ID
   */
  async createExtractCopy(sourceId: string): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    const source = db.read("lectures").find((l) => l.id === sourceId);
    if (!source) throw new Error("源讲义不存在");
    const now = new Date().toISOString();
    const copySections = (secs: LectureSection[]): LectureSection[] =>
      secs.map((s) => ({
        ...s,
        id: genId("sec"),
        children: copySections(s.children || []),
      }));
    const copy: Lecture = {
      ...source,
      id: genId("lec"),
      title: `${source.title}（拆解版）`,
      sections: copySections(source.sections),
      isExtractCopy: true,
      sourceResourceId: sourceId,
      extractStatus: "done",
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      version: 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    db.update("lectures", (list) => [copy, ...list]);
    // 标记源讲义已拆解
    await this.updateLecture(sourceId, { extractStatus: "done" });
    return copy;
  },

  /**
   * 获取讲义的拆解副本
   */
  async getExtractCopy(sourceId: string): Promise<Lecture | null> {
    await delay(200);
    return db.read("lectures").find(
      (l) => l.sourceResourceId === sourceId && l.isExtractCopy,
    ) || null;
  },

  /**
   * 将讲义转换为试卷
   * 将讲义中的题目section提取出来，转换为试卷的题目列表
   */
  async convertToExamPaper(lectureId: string): Promise<{ paperId: string }> {
    await delay(500);
    maybeThrowError();
    const lecture = db.read("lectures").find((l) => l.id === lectureId);
    if (!lecture) throw new Error("讲义不存在");

    const now = new Date().toISOString();

    // 递归收集所有题目类型的section
    const collectQuestions = (secs: LectureSection[]): import("@/types").ExamPaperQuestion[] => {
      const result: import("@/types").ExamPaperQuestion[] = [];
      for (const sec of secs) {
        if (sec.type === "question") {
          // 尝试从题库获取题目信息
          let questionData: Partial<import("@/types").ExamPaperQuestion> = {};
          if (sec.questionId) {
            const q = db.read("questions").find((q) => q.id === sec.questionId);
            if (q) {
              questionData = {
                stem: q.stem,
                options: q.options,
                answer: q.answer,
                analysis: q.analysis,
                type: q.type,
                questionId: q.id,
              };
            }
          }
          result.push({
            id: genId("epq"),
            stem: sec.content || sec.title,
            options: questionData.options,
            answer: questionData.answer || "",
            analysis: questionData.analysis || "",
            score: 5,
            type: (questionData.type as import("@/types").QuestionType) || "short",
            questionId: questionData.questionId,
          });
        }
        if (sec.children && sec.children.length > 0) {
          result.push(...collectQuestions(sec.children));
        }
      }
      return result;
    };

    const questions = collectQuestions(lecture.sections);
    const totalScore = questions.reduce((sum, q) => sum + q.score, 0);

    const paper: import("@/types").ExamPaper = {
      id: genId("exam"),
      teacherId: lecture.teacherId,
      schoolId: lecture.schoolId,
      title: `${lecture.title}（转试卷）`,
      description: lecture.description,
      chapterIds: lecture.chapterIds,
      knowledgePointIds: lecture.knowledgePointIds,
      grade: lecture.grade,
      schoolYear: lecture.schoolYear,
      duration: 60,
      totalScore,
      questions,
      typeId: undefined,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };

    db.update("examPapers", (list) => [paper, ...list]);

    return { paperId: paper.id };
  },
};
