import type {
  Courseware,
  LessonCourseware,
  LessonCoursewareFilter,
  LessonDocumentBlock,
  LessonQuestionContentSection,
  LessonSlide,
  LessonSlideElement,
  ExamPaper,
  Lecture,
  LectureSection,
  Question,
  ResourceSemester,
  Teacher,
  TeacherAffiliation,
  TeacherLessonSchedule,
  TeacherLessonScheduleEntry,
  TeacherLessonSchedulePeriod,
  TeacherLessonScheduleTimeRange,
  TeacherLessonScheduleWeekParity,
} from "../../src/types/index.js";
import {
  TEACHER_SCHEDULE_SLOTS,
  teacherScheduleEntryParity,
  teacherScheduleSlotIndex,
  withDefaultTeacherScheduleTimeRanges,
} from "../../src/lib/teacher-schedule.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

function matchFilter(c: LessonCourseware, filter: LessonCoursewareFilter): boolean {
  const lifecycleStatus = c.lifecycleStatus || "active";
  if (filter.lifecycleStatus) {
    if (lifecycleStatus !== filter.lifecycleStatus) return false;
  } else if (lifecycleStatus !== "active") {
    return false;
  }
  if (filter.keyword) {
    const kw = filter.keyword.toLowerCase();
    const haystack = `${c.title} ${c.description || ""}`.toLowerCase();
    if (!haystack.includes(kw)) return false;
  }
  if (filter.grade && c.grade !== filter.grade) return false;
  if (filter.schoolYear && c.schoolYear !== filter.schoolYear) return false;
  if (filter.semester && (c.semester || "上学期") !== filter.semester) return false;
  if (filter.sourceType && c.sourceType !== filter.sourceType) return false;
  if (filter.sourceId && c.sourceId !== filter.sourceId) return false;
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

function currentAffiliation(
  teacher: {
    affiliations?: TeacherAffiliation[];
    currentAffiliationId?: string | null;
  },
  schoolId: string,
): TeacherAffiliation | undefined {
  return teacher.affiliations?.find((item) => (
    item.schoolId === schoolId && item.id === teacher.currentAffiliationId
  )) || teacher.affiliations?.find((item) => (
    item.schoolId === schoolId && item.isCurrent
  )) || teacher.affiliations?.find((item) => item.schoolId === schoolId);
}

function defaultClassIds(
  teacher: {
    teachingClassIds?: string[];
    homeroomClassIds?: string[];
    affiliations?: TeacherAffiliation[];
    currentAffiliationId?: string | null;
  } | undefined,
  schoolId: string,
): string[] {
  if (!teacher) return [];
  const affiliation = currentAffiliation(teacher, schoolId);
  const assignedIds = new Set([
    ...(affiliation?.teachingClassIds || teacher.teachingClassIds || []),
    ...(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []),
  ]);
  return db.read("schoolClasses")
    .filter((item) => (
      item.schoolId === schoolId
      && item.status !== "graduated"
      && assignedIds.has(item.id)
    ))
    .map((item) => item.id);
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

function createImageElement(
  src: string,
  alt: string,
  index: number,
  questionSection: LessonQuestionContentSection,
): LessonSlideElement {
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
    questionSection,
  };
}

function createTextElement(
  content: string,
  position: Pick<LessonSlideElement, "x" | "y" | "width" | "height">,
  options: {
    fontSize?: number;
    textAlign?: "left" | "center" | "right";
    questionSection?: LessonQuestionContentSection;
  } = {},
): LessonSlideElement {
  return {
    id: genId("element"),
    kind: "text",
    content,
    ...position,
    fontSize: options.fontSize || 24,
    textAlign: options.textAlign || "left",
    questionSection: options.questionSection,
  };
}

function extractFloatingImages(
  content: string,
  questionSection: LessonQuestionContentSection,
  offset = 0,
): {
  content: string;
  elements: LessonSlideElement[];
} {
  const elements: LessonSlideElement[] = [];
  let cleaned = content || "";

  cleaned = cleaned.replace(HTML_IMAGE_PATTERN, (match, doubleQuoted, singleQuoted, unquoted) => {
    const src = safeImageSource(doubleQuoted || singleQuoted || unquoted || "");
    if (!src) return match;
    elements.push(createImageElement(
      src,
      imageAlt(match),
      offset + elements.length,
      questionSection,
    ));
    return "";
  });

  cleaned = cleaned.replace(MARKDOWN_IMAGE_PATTERN, (match, alt, rawSource) => {
    const src = safeImageSource(rawSource);
    if (!src) return match;
    elements.push(createImageElement(
      src,
      alt || "题目图片",
      offset + elements.length,
      questionSection,
    ));
    return "";
  });

  return { content: cleaned.trim(), elements };
}

function questionSlide(
  question: Pick<Question, "id" | "stem" | "type" | "options" | "answer" | "analysis">
    & Partial<Pick<Question, "summary" | "board" | "links" | "explanationVideo">>,
  title: string,
): LessonSlide {
  const stem = extractFloatingImages(question.stem, "stem");
  let imageOffset = stem.elements.length;
  const options = question.options?.map((option) => {
    const extracted = extractFloatingImages(option, "options", imageOffset);
    imageOffset += extracted.elements.length;
    return extracted;
  });
  const optionImageCount = options?.reduce((sum, item) => sum + item.elements.length, 0) || 0;
  const answer = extractFloatingImages(
    question.answer,
    "answer",
    stem.elements.length + optionImageCount,
  );
  const analysis = extractFloatingImages(
    question.analysis,
    "analysis",
    stem.elements.length + optionImageCount + answer.elements.length,
  );

  const textElements: LessonSlideElement[] = [];
  if (stem.content) {
    textElements.push(createTextElement(stem.content, {
      x: 5,
      y: 5,
      width: 90,
      height: options?.length ? 24 : 42,
    }, {
      fontSize: 26,
      questionSection: "stem",
    }));
  }
  options?.forEach((option, index) => {
    if (!option.content) return;
    const label = String.fromCharCode(65 + index);
    const content = new RegExp(`^${label}[.、:：)]\\s*`, "i").test(option.content)
      ? option.content
      : `${label}. ${option.content}`;
    textElements.push(createTextElement(
      content,
      {
        x: index % 2 === 0 ? 6 : 52,
        y: 34 + Math.floor(index / 2) * 15,
        width: 42,
        height: 12,
      },
      {
        fontSize: 20,
        questionSection: "options",
      },
    ));
  });
  if (answer.content) {
    textElements.push(createTextElement(`参考答案\n${answer.content}`, {
      x: 5,
      y: 68,
      width: 42,
      height: 24,
    }, {
      fontSize: 18,
      questionSection: "answer",
    }));
  }
  if (analysis.content || question.summary) {
    textElements.push(createTextElement(
      ["解析", analysis.content, question.summary ? `总结：${question.summary}` : ""]
        .filter(Boolean)
        .join("\n"),
      {
        x: 53,
        y: 68,
        width: 42,
        height: 24,
      },
      {
        fontSize: 18,
        questionSection: "analysis",
      },
    ));
  }

  const boardElements: LessonSlideElement[] = question.board ? [{
    id: genId("element"),
    kind: "image",
    src: question.board,
    alt: "题目板书",
    x: 58,
    y: 38,
    width: 34,
    height: 26,
    questionSection: "analysis",
  }] : [];

  return {
    id: genId("slide"),
    type: "question",
    title,
    freeformLayout: true,
    questionId: question.id,
    questionSnapshot: {
      stem: stem.content,
      type: question.type,
      options: options?.map((item) => item.content),
      answer: answer.content,
      analysis: analysis.content,
      summary: question.summary,
      board: question.board,
      links: question.links?.map((link) => ({ ...link })),
      explanationVideo: question.explanationVideo ? { ...question.explanationVideo } : null,
    },
    elements: [
      ...textElements,
      ...stem.elements,
      ...(options?.flatMap((item) => item.elements) || []),
      ...answer.elements,
      ...analysis.elements,
      ...boardElements,
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
    freeformLayout: true,
    elements: [
      createTextElement(title, {
        x: 10,
        y: 24,
        width: 80,
        height: 18,
      }, {
        fontSize: 42,
        textAlign: "center",
      }),
      ...(subtitle ? [createTextElement(subtitle, {
        x: 15,
        y: 50,
        width: 70,
        height: 10,
      }, {
        fontSize: 22,
        textAlign: "center",
      })] : []),
    ],
    relatedQuestionIds: [],
    askableStudentIds: [],
  };
}

function knowledgeSlide(title: string, content: string): LessonSlide {
  return {
    id: genId("slide"),
    type: "knowledge",
    title,
    content,
    freeformLayout: true,
    elements: content ? [createTextElement(content, {
      x: 6,
      y: 6,
      width: 88,
      height: 88,
    }, {
      fontSize: 24,
    })] : [],
    relatedQuestionIds: [],
    askableStudentIds: [],
  };
}

function reviewedDocumentTitle(
  blocks: Array<{ type: string; content: string }> | undefined,
): string | undefined {
  return blocks
    ?.find((block) => block.type === "documentTitle")
    ?.content.trim() || undefined;
}

function examPaperSlides(examPaper: ExamPaper, canonicalQuestions: Question[]): LessonSlide[] {
  let questionNumber = 0;
  let knowledgeNumber = 0;
  const usedQuestionIds = new Set<string>();
  const structuredSlides = (examPaper.contentBlocks || []).flatMap((block) => {
    if (block.type === "knowledge") {
      knowledgeNumber += 1;
      return [knowledgeSlide(block.title || `知识块 ${knowledgeNumber}`, block.content)];
    }
    if (block.type !== "question") return [];

    questionNumber += 1;
    const sourceQuestion = examPaper.questions.find((question) =>
      question.id === block.examPaperQuestionId
      || question.questionId === block.questionId
      || question.id === block.questionId
      || question.stem === block.content,
    );
    const canonicalQuestion = canonicalQuestions.find((question) =>
      question.id === sourceQuestion?.questionId || question.id === block.questionId,
    );
    if (sourceQuestion) usedQuestionIds.add(sourceQuestion.id);
    return [questionSlide({
      id: canonicalQuestion?.id || sourceQuestion?.questionId || sourceQuestion?.id || block.questionId || block.id,
      stem: canonicalQuestion?.stem || sourceQuestion?.stem || block.content,
      type: canonicalQuestion?.type || sourceQuestion?.type || block.questionType || "essay",
      options: canonicalQuestion?.options || sourceQuestion?.options,
      answer: canonicalQuestion?.answer || sourceQuestion?.answer || "",
      analysis: canonicalQuestion?.analysis || sourceQuestion?.analysis || "",
      summary: canonicalQuestion?.summary,
      board: canonicalQuestion?.board,
      links: canonicalQuestion?.links,
      explanationVideo: canonicalQuestion?.explanationVideo,
    }, block.title || `第 ${questionNumber} 题`)];
  });

  if (structuredSlides.length > 0) {
    const remainingQuestions = examPaper.questions
      .filter((question) => !usedQuestionIds.has(question.id))
      .map((question) => {
        questionNumber += 1;
        const canonicalQuestion = canonicalQuestions.find((item) => item.id === question.questionId);
        return questionSlide({
          id: canonicalQuestion?.id || question.questionId || question.id,
          stem: canonicalQuestion?.stem || question.stem,
          type: canonicalQuestion?.type || question.type,
          options: canonicalQuestion?.options || question.options,
          answer: canonicalQuestion?.answer || question.answer,
          analysis: canonicalQuestion?.analysis || question.analysis,
          summary: canonicalQuestion?.summary,
          board: canonicalQuestion?.board,
          links: canonicalQuestion?.links,
          explanationVideo: canonicalQuestion?.explanationVideo,
        }, `第 ${questionNumber} 题`);
      });
    return [...structuredSlides, ...remainingQuestions];
  }
  return examPaper.questions.map((question, index) => {
    const canonicalQuestion = canonicalQuestions.find((item) => item.id === question.questionId);
    return questionSlide({
      id: canonicalQuestion?.id || question.questionId || question.id,
      stem: canonicalQuestion?.stem || question.stem,
      type: canonicalQuestion?.type || question.type,
      options: canonicalQuestion?.options || question.options,
      answer: canonicalQuestion?.answer || question.answer,
      analysis: canonicalQuestion?.analysis || question.analysis,
      summary: canonicalQuestion?.summary,
      board: canonicalQuestion?.board,
      links: canonicalQuestion?.links,
      explanationVideo: canonicalQuestion?.explanationVideo,
    }, `第 ${index + 1} 题`);
  });
}

function documentBlockSlides(blocks: LessonDocumentBlock[]): LessonSlide[] {
  let questionNumber = 0;
  let knowledgeNumber = 0;
  return blocks.flatMap((block) => {
    if (block.type === "knowledge") {
      knowledgeNumber += 1;
      return [knowledgeSlide(block.title || `知识块 ${knowledgeNumber}`, block.content)];
    }
    if (block.type !== "question") return [];

    questionNumber += 1;
    return [questionSlide({
      id: block.id,
      stem: block.content,
      type: block.questionType || "essay",
      options: block.options,
      answer: block.answer || "",
      analysis: block.analysis || "",
    }, block.title || `第 ${questionNumber} 题`)];
  });
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
  libraryCoursewareId?: string;
  coursewareMode?: "editable" | "direct";
  slides: LessonSlide[];
  classIds: string[];
}

function generatedCoursewareContent(
  sourceType: "examPaper" | "lecture",
  sourceTitle: string,
  slideCount: number,
): string {
  const sourceLabel = sourceType === "examPaper" ? "试卷" : "讲义";
  return `由${sourceLabel}《${sourceTitle}》生成的上课课件，共 ${slideCount} 页。`;
}

function saveGeneratedCoursewareToLibrary(
  lesson: LessonCourseware,
  libraryCoursewareId: string,
  sourceType: "examPaper" | "lecture",
  sourceId: string,
  sourceTitle: string,
): void {
  const now = lesson.createdAt;
  const courseware: Courseware = {
    id: libraryCoursewareId,
    teacherId: lesson.teacherId,
    schoolId: lesson.schoolId,
    title: lesson.title,
    description: lesson.description,
    chapterIds: lesson.chapterIds,
    knowledgePointIds: lesson.knowledgePointIds,
    grade: lesson.grade,
    schoolYear: lesson.schoolYear,
    semester: lesson.semester || "上学期",
    type: "other",
    content: generatedCoursewareContent(sourceType, sourceTitle, lesson.slides.length),
    lessonCoursewareId: lesson.id,
    sourceResourceType: sourceType,
    sourceResourceId: sourceId,
    sourceResourceTitle: sourceTitle,
    tags: ["上课课件"],
    createdAt: now,
    updatedAt: now,
  };
  db.update("coursewares", (list) => [courseware, ...list]);
}

const TEACHER_SCHEDULE_PERIODS = new Set<number>(
  TEACHER_SCHEDULE_SLOTS.map((slot) => slot.period),
);
const SCHEDULE_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function sortTeacherScheduleEntries(
  entries: TeacherLessonScheduleEntry[],
): TeacherLessonScheduleEntry[] {
  return entries.sort((left, right) => (
    left.day - right.day
    || (teacherScheduleEntryParity(left) === "even" ? 1 : 0)
      - (teacherScheduleEntryParity(right) === "even" ? 1 : 0)
    || teacherScheduleSlotIndex(left.period) - teacherScheduleSlotIndex(right.period)
  ));
}

function normalizeStoredScheduleEntries(
  entries: readonly TeacherLessonScheduleEntry[] | undefined,
): TeacherLessonScheduleEntry[] {
  const normalized = new Map<string, TeacherLessonScheduleEntry>();
  for (const rawEntry of entries || []) {
    const entry = rawEntry as TeacherLessonScheduleEntry & {
      day?: number;
      period?: number;
      weekParity?: unknown;
      classId?: unknown;
    };
    if (!Number.isInteger(entry.day) || entry.day! < 1 || entry.day! > 7) continue;
    if (!TEACHER_SCHEDULE_PERIODS.has(entry.period!)) continue;
    if (typeof entry.classId !== "string" || !entry.classId) continue;
    const day = entry.day as TeacherLessonScheduleEntry["day"];
    const period = entry.period as TeacherLessonSchedulePeriod;
    const weekParity: TeacherLessonScheduleWeekParity = day <= 5
      ? "all"
      : entry.weekParity === "even" ? "even" : "odd";
    normalized.set(`${day}:${weekParity}:${period}`, {
      day,
      period,
      weekParity,
      classId: entry.classId,
    });
  }
  return sortTeacherScheduleEntries([...normalized.values()]);
}

function normalizeScheduleTimeRanges(
  timeRanges: readonly TeacherLessonScheduleTimeRange[] | undefined,
  strict: boolean,
): TeacherLessonScheduleTimeRange[] {
  const normalized = new Map<TeacherLessonSchedulePeriod, TeacherLessonScheduleTimeRange>();
  for (const rawRange of timeRanges || []) {
    const range = rawRange as TeacherLessonScheduleTimeRange & {
      period?: number;
      startTime?: unknown;
      endTime?: unknown;
    };
    const periodValid = TEACHER_SCHEDULE_PERIODS.has(range.period!);
    const startValid = typeof range.startTime === "string" && SCHEDULE_TIME_PATTERN.test(range.startTime);
    const endValid = typeof range.endTime === "string" && SCHEDULE_TIME_PATTERN.test(range.endTime);
    const orderValid = startValid && endValid && range.startTime < range.endTime;
    if (!periodValid || !startValid || !endValid || !orderValid) {
      if (strict) throw new Error("课表时间区间设置不合法");
      continue;
    }
    const period = range.period as TeacherLessonSchedulePeriod;
    normalized.set(period, {
      period,
      startTime: range.startTime as string,
      endTime: range.endTime as string,
    });
  }
  return withDefaultTeacherScheduleTimeRanges([...normalized.values()]);
}

export const lessonCoursewareService = {
  async getLessonSchedule(teacher: Teacher): Promise<TeacherLessonSchedule> {
    await delay(100);
    return {
      entries: normalizeStoredScheduleEntries(teacher.lessonSchedule?.entries),
      timeRanges: normalizeScheduleTimeRanges(teacher.lessonSchedule?.timeRanges, false),
      updatedAt: teacher.lessonSchedule?.updatedAt,
    };
  },

  async saveLessonSchedule(
    entries: TeacherLessonScheduleEntry[],
    timeRanges: TeacherLessonScheduleTimeRange[] | undefined,
    teacher: Teacher,
  ): Promise<TeacherLessonSchedule> {
    await delay(200);
    maybeThrowError();
    if (!teacher.schoolId) throw new Error("请先完成学校认证");

    const allowedClassIds = new Set(defaultClassIds(teacher, teacher.schoolId));
    const uniqueEntries = new Map<string, TeacherLessonScheduleEntry>();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!Number.isInteger(entry.day) || entry.day < 1 || entry.day > 7) {
        throw new Error("课表星期设置不合法");
      }
      if (!TEACHER_SCHEDULE_PERIODS.has(entry.period)) {
        throw new Error("课表节次设置不合法");
      }
      let weekParity: TeacherLessonScheduleWeekParity;
      if (entry.day <= 5) {
        if (entry.weekParity !== undefined && entry.weekParity !== "all") {
          throw new Error("工作日课表不区分单双周");
        }
        weekParity = "all";
      } else {
        if (entry.weekParity !== "odd" && entry.weekParity !== "even") {
          throw new Error("周末课表必须设置单周或双周");
        }
        weekParity = entry.weekParity;
      }
      if (!allowedClassIds.has(entry.classId)) {
        throw new Error("课表中包含非本人任教班级");
      }
      uniqueEntries.set(`${entry.day}:${weekParity}:${entry.period}`, {
        day: entry.day,
        period: entry.period,
        weekParity,
        classId: entry.classId,
      });
    }

    const schedule: TeacherLessonSchedule = {
      entries: sortTeacherScheduleEntries([...uniqueEntries.values()]),
      timeRanges: normalizeScheduleTimeRanges(timeRanges, true),
      updatedAt: new Date().toISOString(),
    };
    db.update("teachers", (items: Teacher[]) => items.map((item) => (
      item.id === teacher.id ? { ...item, lessonSchedule: schedule } : item
    )));
    return schedule;
  },

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
    const classIds = input.classIds.length > 0
      ? [...new Set(input.classIds)]
      : defaultClassIds(teacher, schoolId);
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
      libraryCoursewareId: input.libraryCoursewareId,
      coursewareMode: input.coursewareMode,
      slides: input.slides,
      classIds,
      subject: teacher?.subject,
      teacherName: teacher?.name,
      status: "draft",
      lifecycleStatus: "active",
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
    const linkedSourceType = updated.sourceType;
    if (updated.libraryCoursewareId
      && (linkedSourceType === "examPaper" || linkedSourceType === "lecture")) {
      const linkedLesson = updated;
      db.update("coursewares", (list) => list.map((courseware) => (
        courseware.id === linkedLesson.libraryCoursewareId
          ? {
            ...courseware,
            title: linkedLesson.title,
            description: linkedLesson.description,
            chapterIds: linkedLesson.chapterIds,
            knowledgePointIds: linkedLesson.knowledgePointIds,
            grade: linkedLesson.grade,
            schoolYear: linkedLesson.schoolYear,
            semester: linkedLesson.semester || "上学期",
            content: generatedCoursewareContent(
              linkedSourceType,
              linkedLesson.sourceTitle || courseware.sourceResourceTitle || linkedLesson.title,
              linkedLesson.slides.length,
            ),
            updatedAt: linkedLesson.updatedAt,
          }
          : courseware
      )));
    }
    return updated;
  },

  async deleteCourseware(id: string): Promise<void> {
    await delay(300);
    const courseware = db.read("lessonCoursewares").find((item) => item.id === id);
    if (!courseware) throw new Error("课件不存在");
    await this.updateCourseware(id, {
      lifecycleStatus: "trashed",
      deletedAt: new Date().toISOString(),
      completedAt: null,
      status: "draft",
      publishedAt: undefined,
    });
  },

  async completeCourseware(id: string): Promise<LessonCourseware> {
    await delay(300);
    const courseware = db.read("lessonCoursewares").find((item) => item.id === id);
    if (!courseware) throw new Error("课件不存在");
    return this.updateCourseware(id, {
      lifecycleStatus: "completed",
      completedAt: new Date().toISOString(),
      deletedAt: null,
      status: "draft",
      publishedAt: undefined,
    });
  },

  async restoreCourseware(id: string): Promise<LessonCourseware> {
    await delay(300);
    const courseware = db.read("lessonCoursewares").find((item) => item.id === id);
    if (!courseware) throw new Error("课件不存在");
    return this.updateCourseware(id, {
      lifecycleStatus: "active",
      completedAt: null,
      deletedAt: null,
      status: "draft",
      publishedAt: undefined,
    });
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
    source: string | Pick<ExamPaper, "id">,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    const sourceId = typeof source === "string" ? source : source.id;
    const examPaper = db.read("examPapers").find((item) =>
      item.id === sourceId && item.teacherId === teacherId && item.schoolId === schoolId);
    if (!examPaper) throw new Error("试卷不存在或无权访问");

    const bodySlides = examPaperSlides(examPaper, db.read("questions"));
    const coverTitle = reviewedDocumentTitle(examPaper.contentBlocks)
      || reviewedDocumentTitle(documentBlocks)
      || examPaper.title;
    const slides: LessonSlide[] = [
      titleSlide(coverTitle, `${examPaper.grade} · ${examPaper.schoolYear}`),
      ...(bodySlides.length > 0 ? bodySlides : documentBlockSlides(documentBlocks)),
    ];

    const libraryCoursewareId = genId("cw");
    const lesson = await this.createCourseware(teacherId, schoolId, {
      title: `${examPaper.title}（上课课件）`,
      chapterIds: examPaper.chapterIds,
      knowledgePointIds: examPaper.knowledgePointIds,
      grade: examPaper.grade,
      schoolYear: examPaper.schoolYear,
      semester: examPaper.semester || "上学期",
      sourceType: "examPaper",
      sourceId: examPaper.id,
      sourceTitle: examPaper.title,
      libraryCoursewareId,
      slides,
      classIds: [],
    });
    saveGeneratedCoursewareToLibrary(
      lesson,
      libraryCoursewareId,
      "examPaper",
      examPaper.id,
      examPaper.title,
    );
    return lesson;
  },

  /**
   * 从讲义创建课件（知识块+题目分开成页）
   */
  async createFromLecture(
    teacherId: string,
    schoolId: string,
    source: string | Pick<Lecture, "id">,
    documentBlocks: LessonDocumentBlock[] = [],
  ): Promise<LessonCourseware> {
    const sourceId = typeof source === "string" ? source : source.id;
    const lecture = db.read("lectures").find((item) =>
      item.id === sourceId && item.teacherId === teacherId && item.schoolId === schoolId);
    if (!lecture) throw new Error("讲义不存在或无权访问");

    const questions = db.read("questions");
    const coverTitle = reviewedDocumentTitle(lecture.contentBlocks)
      || reviewedDocumentTitle(documentBlocks)
      || lecture.title;
    const slides: LessonSlide[] = [
      titleSlide(coverTitle, lecture.description || `${lecture.grade} · ${lecture.schoolYear}`),
    ];

    flattenLectureSections(lecture.sections).forEach((sec) => {
      if (sec.type === "question") {
        const question = sec.questionId
          ? questions.find((item) => item.id === sec.questionId)
          : undefined;
        if (question) {
          slides.push(questionSlide(question, sec.title));
        } else {
          slides.push(questionSlide({
            id: sec.questionId || sec.id,
            stem: sec.content,
            type: "essay",
            answer: "",
            analysis: "",
          }, sec.title));
        }
      } else if (sec.type === "knowledge") {
        slides.push(knowledgeSlide(sec.title, sec.content));
      }
    });
    if (slides.length === 1) slides.push(...documentBlockSlides(documentBlocks));

    const libraryCoursewareId = genId("cw");
    const lesson = await this.createCourseware(teacherId, schoolId, {
      title: `${lecture.title}（上课课件）`,
      chapterIds: lecture.chapterIds,
      knowledgePointIds: lecture.knowledgePointIds,
      grade: lecture.grade,
      schoolYear: lecture.schoolYear,
      semester: lecture.semester || "上学期",
      sourceType: "lecture",
      sourceId: lecture.id,
      sourceTitle: lecture.title,
      libraryCoursewareId,
      slides,
      classIds: [],
    });
    saveGeneratedCoursewareToLibrary(
      lesson,
      libraryCoursewareId,
      "lecture",
      lecture.id,
      lecture.title,
    );
    return lesson;
  },

  async createFromCourseware(
    teacherId: string,
    schoolId: string,
    sourceId: string,
    options: {
      mode?: "editable" | "direct";
      pageCount?: number;
      pptSlides?: Array<{ title?: string; content?: string }>;
    } = {},
  ): Promise<LessonCourseware> {
    const source = db.read("coursewares").find((item) =>
      item.id === sourceId && item.teacherId === teacherId && item.schoolId === schoolId);
    if (!source) throw new Error("课件不存在或无权访问");
    const mode = options.mode === "direct" ? "direct" : "editable";
    const baseExternalFields = {
      coursewareType: source.type,
      fileUrl: source.fileUrl,
      fileName: source.fileName,
      onlineAccessToken: source.onlineAccessToken,
      editorUrl: source.editorUrl,
      relatedQuestionIds: [] as string[],
      askableStudentIds: [] as string[],
    };

    let slides: LessonSlide[];
    if (source.type === "ppt" && mode === "editable") {
      const suppliedSlides = Array.isArray(options.pptSlides)
        ? options.pptSlides.slice(0, 500)
        : [];
      const requestedCount = Number.isFinite(options.pageCount)
        ? Math.floor(options.pageCount as number)
        : source.pageCount;
      const pageCount = suppliedSlides.length > 0
        ? suppliedSlides.length
        : Math.min(Math.max(requestedCount || 1, 1), 500);
      slides = Array.from({ length: pageCount }, (_, index) => {
        const page = suppliedSlides[index];
        const pageNumber = index + 1;
        const title = page?.title?.trim().slice(0, 300)
          || `${source.title} · 第 ${pageNumber} 页`;
        const content = page?.content?.trim().slice(0, 20_000)
          || `原 PPT 第 ${pageNumber} 页。可在此页继续编辑文字与课堂内容。`;
        return {
          id: genId("slide"),
          type: "knowledge",
          title,
          content,
          pptSlideNumber: pageNumber,
          ...baseExternalFields,
        };
      });
    } else {
      slides = [{
        id: genId("slide"),
        type: "courseware",
        title: source.title,
        content: source.description || source.content,
        openInWps: source.type === "ppt" && mode === "direct",
        ...baseExternalFields,
      }];
    }
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
      coursewareMode: mode,
      slides,
      classIds: [],
    });
  },
};
