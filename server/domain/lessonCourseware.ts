import type {
  LessonCourseware,
  LessonCoursewareFilter,
  LessonSlide,
  LessonSlideElement,
  ExamPaper,
  Lecture,
  LectureSection,
  Question,
  ResourceSemester,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

function matchFilter(c: LessonCourseware, filter: LessonCoursewareFilter): boolean {
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${c.title} ${c.description || ""}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.grade && c.grade !== filter.grade) return false;
  if (filter.schoolYear && c.schoolYear !== filter.schoolYear) return false;
  if (filter.semester && (c.semester || "上学期") !== filter.semester) return false;
  if (filter.status && c.status !== filter.status) return false;
  if (filter.classId && !c.classIds.includes(filter.classId)) return false;
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

const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

function safeImageSource(value: string): string | null {
  const source = value.trim();
  return /^(?:https?:\/\/|data:image\/[a-z0-9.+-]+;base64,|\/)/i.test(source)
    ? source
    : null;
}

function imageAlt(html: string): string {
  const match = html.match(/\balt=(?:"([^"]*)"|'([^']*)')/i);
  return (match?.[1] || match?.[2] || "题目图片").trim() || "题目图片";
}

function createImageElement(src: string, alt: string, index: number): LessonSlideElement {
  const row = index % 3;
  const column = Math.floor(index / 3);
  return {
    id: genId("element"),
    kind: "image",
    src,
    alt,
    x: Math.max(4, 64 - column * 8),
    y: 18 + row * 24,
    width: 30,
    height: 20,
    animation: "fade",
  };
}

function extractFloatingImages(content: string, offset = 0): {
  content: string;
  elements: LessonSlideElement[];
} {
  const elements: LessonSlideElement[] = [];
  let cleaned = content || "";

  cleaned = cleaned.replace(HTML_IMAGE_PATTERN, (match, doubleQuoted, singleQuoted, unquoted) => {
    const src = safeImageSource(doubleQuoted || singleQuoted || unquoted || "");
    if (!src) return match;
    elements.push(createImageElement(src, imageAlt(match), offset + elements.length));
    return "";
  });

  cleaned = cleaned.replace(MARKDOWN_IMAGE_PATTERN, (match, alt, rawSource) => {
    const src = safeImageSource(rawSource);
    if (!src) return match;
    elements.push(createImageElement(src, alt || "题目图片", offset + elements.length));
    return "";
  });

  return { content: cleaned.trim(), elements };
}

function questionSlide(
  question: Pick<Question, "id" | "stem" | "type" | "options" | "answer" | "analysis">,
  title: string,
): LessonSlide {
  const stem = extractFloatingImages(question.stem);
  let imageOffset = stem.elements.length;
  const options = question.options?.map((option) => {
    const extracted = extractFloatingImages(option, imageOffset);
    imageOffset += extracted.elements.length;
    return extracted;
  });
  const optionImageCount = options?.reduce((sum, item) => sum + item.elements.length, 0) || 0;
  const answer = extractFloatingImages(question.answer, stem.elements.length + optionImageCount);
  const analysis = extractFloatingImages(
    question.analysis,
    stem.elements.length + optionImageCount + answer.elements.length,
  );

  return {
    id: genId("slide"),
    type: "question",
    title,
    questionId: question.id,
    questionSnapshot: {
      stem: stem.content,
      type: question.type,
      options: options?.map((item) => item.content),
      answer: answer.content,
      analysis: analysis.content,
    },
    elements: [
      ...stem.elements,
      ...(options?.flatMap((item) => item.elements) || []),
      ...answer.elements,
      ...analysis.elements,
    ],
    relatedQuestionIds: [],
    askableStudentIds: [],
  };
}

function titleSlide(title: string, subtitle: string): LessonSlide {
  return {
    id: genId("slide"),
    type: "section",
    title,
    content: subtitle,
    relatedQuestionIds: [],
    askableStudentIds: [],
  };
}

function flattenLectureSections(sections: LectureSection[]): LectureSection[] {
  return sections.flatMap((section) => [section, ...flattenLectureSections(section.children || [])]);
}

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
    const teacher = db.read("teachers").find((item) => item.id === teacherId);
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
      semester: input.semester || "上学期",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      slides: input.slides,
      classIds: input.classIds,
      subject: teacher?.subject,
      teacherName: teacher?.name,
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
    const courseware = db.read("lessonCoursewares").find((item) => item.id === id);
    if (!courseware) throw new Error("课件不存在");
    if (courseware.classIds.length === 0) throw new Error("请先选择至少一个授课班级");
    const teacher = db.read("teachers").find((item) => item.id === courseware.teacherId);
    return this.updateCourseware(id, {
      subject: teacher?.subject || courseware.subject,
      teacherName: teacher?.name || courseware.teacherName,
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
    const slides: LessonSlide[] = [
      titleSlide(examPaper.title, `${examPaper.grade} · ${examPaper.schoolYear}`),
      ...examPaper.questions.map((q, i) => questionSlide({
        id: q.questionId || q.id,
        stem: q.stem,
        type: q.type,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
      }, `第 ${i + 1} 题`)),
    ];

    return this.createCourseware(teacherId, schoolId, {
      title: `${examPaper.title}（上课课件）`,
      chapterIds: examPaper.chapterIds,
      knowledgePointIds: examPaper.knowledgePointIds,
      grade: examPaper.grade,
      schoolYear: examPaper.schoolYear,
      semester: examPaper.semester || "上学期",
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
    const questions = db.read("questions");
    const slides: LessonSlide[] = [
      titleSlide(lecture.originalFileName || lecture.title, lecture.description || `${lecture.grade} · ${lecture.schoolYear}`),
    ];

    flattenLectureSections(lecture.sections).forEach((sec) => {
      if (sec.type === "question") {
        const question = sec.questionId
          ? questions.find((item) => item.id === sec.questionId)
          : undefined;
        if (question) {
          slides.push(questionSlide(question, sec.title));
        } else {
          slides.push({
            id: genId("slide"),
            type: "question",
            title: sec.title,
            questionId: sec.questionId,
            questionSnapshot: {
              stem: sec.content,
              type: "essay",
              answer: "",
              analysis: "",
            },
            relatedQuestionIds: [],
            askableStudentIds: [],
          });
        }
      } else {
        slides.push({
          id: genId("slide"),
          type: sec.type === "chapter" ? "section" : "knowledge",
          title: sec.title,
          content: sec.content,
          relatedQuestionIds: [],
          askableStudentIds: [],
        });
      }
    });

    return this.createCourseware(teacherId, schoolId, {
      title: `${lecture.title}（上课课件）`,
      chapterIds: lecture.chapterIds,
      knowledgePointIds: lecture.knowledgePointIds,
      grade: lecture.grade,
      schoolYear: lecture.schoolYear,
      semester: lecture.semester || "上学期",
      sourceType: "lecture",
      sourceId: lecture.id,
      sourceTitle: lecture.title,
      slides,
      classIds: [],
    });
  },

  async createFromCourseware(
    teacherId: string,
    schoolId: string,
    sourceId: string,
  ): Promise<LessonCourseware> {
    const source = db.read("coursewares").find((item) =>
      item.id === sourceId && item.teacherId === teacherId && item.schoolId === schoolId);
    if (!source) throw new Error("课件不存在或无权访问");
    const slide: LessonSlide = {
      id: genId("slide"),
      type: "courseware",
      title: source.title,
      content: source.description || source.content,
      coursewareType: source.type,
      fileUrl: source.fileUrl,
      fileName: source.fileName,
      onlineAccessToken: source.onlineAccessToken,
      editorUrl: source.editorUrl,
      relatedQuestionIds: [],
      askableStudentIds: [],
    };
    return this.createCourseware(teacherId, schoolId, {
      title: `${source.title}（上课课件）`,
      description: source.description,
      chapterIds: source.chapterIds,
      knowledgePointIds: source.knowledgePointIds,
      grade: source.grade,
      schoolYear: source.schoolYear,
      semester: source.semester || "上学期",
      sourceType: "courseware",
      sourceId: source.id,
      sourceTitle: source.title,
      slides: [slide],
      classIds: [],
    });
  },
};
