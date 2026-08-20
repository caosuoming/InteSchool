import type {
  ExtractedDocumentBlock,
  Lecture,
  LectureColumnTemplate,
  LectureColumnTemplateItem,
  LectureFilter,
  LectureSection,
  ResourceSemester,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";
import { questionService, recordQuestionUsage } from "./question.js";
import { reflectionService } from "./reflection.js";
import { schoolBackupService } from "./schoolBackup.js";
import { classService } from "./class.js";
import { sanitizeLecturePatch } from "./document-resource-lock.js";
import { assertResourceCapacity } from "./quota.js";
import { moveLectureToExamPaper } from "./document-library-move.js";

function collectQuestionIds(sections: LectureSection[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    if (section.questionId) ids.push(section.questionId);
    if (section.children.length > 0) ids.push(...collectQuestionIds(section.children));
  }
  return ids;
}

function copyLectureSections(sections: LectureSection[]): LectureSection[] {
  return sections.map((section) => ({
    ...section,
    id: genId("sec"),
    children: copyLectureSections(section.children || []),
  }));
}

/**
 * Extracted documents keep their original order as a flat sequence where a
 * chapter/group heading is followed by its text, knowledge blocks and
 * questions. Once such a document becomes an authored copy, the editor uses
 * chapter.children as the canonical editable structure, so restore that
 * hierarchy while preserving any leading content that has no chapter.
 */
function restoreEditableChapterHierarchy(sections: LectureSection[]): LectureSection[] {
  const roots: LectureSection[] = [];
  let currentChapter: LectureSection | null = null;

  for (const section of sections) {
    if (section.type === "chapter") {
      currentChapter = section;
      roots.push(section);
    } else if (currentChapter) {
      currentChapter.children.push(section);
    } else {
      roots.push(section);
    }
  }

  return roots;
}

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
  if (filter.semester && (l.semester || "上学期") !== filter.semester) return false;
  if (filter.status && l.status !== filter.status) return false;
  if (filter.teacherId && l.teacherId !== filter.teacherId) return false;
  if (filter.schoolId && l.schoolId !== filter.schoolId) return false;
  if (filter.typeId && l.typeId !== filter.typeId) return false;
  return true;
}

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

  async listColumnTemplates(
    teacherId: string,
    schoolId: string,
  ): Promise<LectureColumnTemplate[]> {
    await delay(150);
    return db
      .read("lectureColumnTemplates")
      .filter((template: LectureColumnTemplate) => (
        template.teacherId === teacherId && template.schoolId === schoolId
      ))
      .sort((a: LectureColumnTemplate, b: LectureColumnTemplate) => (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
  },

  async createColumnTemplate(
    teacherId: string,
    schoolId: string,
    input: LectureColumnTemplateInput,
  ): Promise<LectureColumnTemplate> {
    await delay(250);
    maybeThrowError();
    const name = input.name.trim();
    const columns = input.columns
      .map((column) => ({
        title: column.title.trim(),
        content: column.content.trim(),
      }))
      .filter((column) => column.title.length > 0);
    if (!name) throw new Error("请填写模板名称");
    if (columns.length === 0) throw new Error("请至少保存一个栏目");

    const now = new Date().toISOString();
    const template: LectureColumnTemplate = {
      id: genId("lectpl"),
      teacherId,
      schoolId,
      name,
      description: input.description?.trim() || undefined,
      columns,
      createdAt: now,
      updatedAt: now,
    };
    db.update("lectureColumnTemplates", (list) => [template, ...list]);
    return template;
  },

  async deleteColumnTemplate(
    templateId: string,
    teacherId: string,
  ): Promise<void> {
    await delay(150);
    const template = db
      .read("lectureColumnTemplates")
      .find((item: LectureColumnTemplate) => item.id === templateId);
    if (!template) return;
    if (template.teacherId !== teacherId) throw new Error("无权删除该栏目模板");
    db.update(
      "lectureColumnTemplates",
      (list) => list.filter((item: LectureColumnTemplate) => item.id !== templateId),
    );
  },

  async createLecture(
    teacherId: string,
    schoolId: string,
    input: LectureInput,
  ): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    assertResourceCapacity(teacherId, "lecture");
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
      semester: input.semester || "上学期",
      classIds: input.classIds,
      studentIds: input.studentIds,
      sections: input.sections,
      typeId: input.typeId,
      questionSourceType: input.questionSourceType,
      questionCategory: input.questionCategory,
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
          const safePatch = sanitizeLecturePatch(l, patch);
          updated = {
            ...l,
            ...safePatch,
            version: safePatch.sections ? l.version + 1 : l.version,
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
   * 创建副本：复制讲义（含 sections），并复制关联的课后反思
   */
  async duplicateLecture(
    sourceId: string,
    newTitle?: string,
  ): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    const source = db.read("lectures").find((l) => l.id === sourceId);
    if (!source) throw new Error("原讲义不存在");
    assertResourceCapacity(source.teacherId, "lecture");
    const now = new Date().toISOString();
    const copiedSections = copyLectureSections(source.sections);
    const editableSections = source.isExtractCopy || source.originalFileUrl
      ? restoreEditableChapterHierarchy(copiedSections)
      : copiedSections;
    const duplicated: Lecture = {
      ...source,
      id: genId("lec"),
      title: newTitle || `${source.title}（副本）`,
      status: "draft",
      version: 1,
      sections: editableSections,
      contentBlocks: undefined,
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      isExtractCopy: undefined,
      sourceResourceId: undefined,
      extractStatus: undefined,
      versionType: undefined,
      hasOrigin: undefined,
      hasPreview: undefined,
      hasAnswerSheet: undefined,
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
    const lecture = db.read("lectures").find((item) => item.id === lectureId) as Lecture | undefined;
    if (!lecture) throw new Error("讲义不存在");
    await this.updateLecture(lectureId, { status: "published" });

    try {
      const [myClassIds, myStudents] = await Promise.all([
        classService.listMyClassIds(lecture.schoolId, lecture.teacherId),
        classService.listMyStudents(lecture.schoolId, lecture.teacherId),
      ]);
      const myStudentIds = new Set(myStudents.map((student) => student.id));
      const targetClassIds = lecture.classIds || [];
      const targetStudentIds = lecture.studentIds || [];
      const nonMyClassIds = targetClassIds.filter((id) => !myClassIds.has(id));
      const nonMyStudentIds = targetStudentIds.filter((id) => !myStudentIds.has(id));
      if (nonMyClassIds.length === 0 && nonMyStudentIds.length === 0) return;

      const reasonParts = [];
      if (nonMyClassIds.length > 0) reasonParts.push(`${nonMyClassIds.length} 个非所教班级`);
      if (nonMyStudentIds.length > 0) reasonParts.push(`${nonMyStudentIds.length} 名非所教学生`);
      const backupReason = `讲义发布到${reasonParts.join("、")}`;
      await schoolBackupService.autoBackupForResource(
        lecture.schoolId,
        lecture.teacherId,
        "lecture",
        lecture.id,
        nonMyClassIds,
        backupReason,
        nonMyStudentIds,
      );

      for (const questionId of [...new Set(collectQuestionIds(lecture.sections))]) {
        await schoolBackupService.autoBackupForResource(
          lecture.schoolId,
          lecture.teacherId,
          "question",
          questionId,
          nonMyClassIds,
          `随讲义「${lecture.title}」发布`,
          nonMyStudentIds,
        );
      }
    } catch (error) {
      console.error("校本备份失败（不影响讲义发布）", error);
    }
  },

  /**
   * 创建拆解副本：复制源讲义结构，标记为拆解副本，关联源资源ID
   */
  async createExtractCopy(
    sourceId: string,
    contentBlocks: ExtractedDocumentBlock[] = [],
  ): Promise<Lecture> {
    await delay(400);
    maybeThrowError();
    const source = db.read("lectures").find((l) => l.id === sourceId);
    if (!source) throw new Error("源讲义不存在");
    assertResourceCapacity(source.teacherId, "lecture");
    const now = new Date().toISOString();
    const normalizedBlocks = contentBlocks.map((block) => ({
      ...block,
      id: genId("doc-block"),
    }));
    const extractedSections: LectureSection[] = normalizedBlocks.map((block, index) => {
      if (block.type === "documentTitle") {
        return {
          id: genId("sec"),
          title: block.content,
          type: "chapter",
          content: "",
          children: [],
        };
      }
      if (block.type === "groupTitle" || block.type === "heading") {
        return {
          id: genId("sec"),
          title: block.content,
          type: "chapter",
          content: "",
          children: [],
        };
      }
      if (block.type === "knowledge") {
        return {
          id: genId("sec"),
          title: block.title || `知识块 ${index + 1}`,
          type: "knowledge",
          content: block.content,
          children: [],
        };
      }
      if (block.type === "question") {
        return {
          id: genId("sec"),
          title: `题目·${block.content.slice(0, 18)}${block.content.length > 18 ? "..." : ""}`,
          type: "question",
          content: block.content,
          questionId: block.questionId,
          children: [],
          customLabel: block.customLabel,
          displayMode: "stem-only",
        };
      }
      return {
        id: genId("sec"),
        title: block.title || `正文 ${index + 1}`,
        type: "text",
        content: block.content,
        children: [],
      };
    });
    const copy: Lecture = {
      ...source,
      id: genId("lec"),
      title: `${source.title}（拆解版）`,
      sections: extractedSections.length > 0 ? extractedSections : copyLectureSections(source.sections),
      contentBlocks: normalizedBlocks.length > 0 ? normalizedBlocks : source.contentBlocks,
      isExtractCopy: true,
      sourceResourceId: sourceId,
      extractStatus: "done",
      originalFileUrl: undefined,
      originalFileName: undefined,
      originalFileType: undefined,
      originalFileSize: undefined,
      version: 1,
      versionType: "extract",
      hasOrigin: true,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    db.update("lectures", (list) => [copy, ...list]);
    // 拆解状态属于系统来源信息，不通过普通属性更新接口写入。
    db.update("lectures", (list) => list.map((lecture) => (
      lecture.id === sourceId
        ? { ...lecture, extractStatus: "done", updatedAt: now }
        : lecture
    )));
    recordQuestionUsage(
      collectQuestionIds(copy.sections),
    );
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

  /** 将讲义连同其文档状态一起移动到试卷库。 */
  async convertToExamPaper(lectureId: string): Promise<{ paperId: string }> {
    await delay(500);
    maybeThrowError();
    return moveLectureToExamPaper(lectureId);
  },
};
