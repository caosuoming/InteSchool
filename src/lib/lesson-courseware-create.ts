import { lessonCoursewareService } from "@/services/lessonCourseware";
import type {
  LessonQuestionContentSection,
  LessonSlide,
  LessonSlideElement,
  Question,
  ResourceSemester,
} from "@/types";
import { genId } from "@/lib/service-utils";

const HTML_IMAGE_PATTERN = /<img\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g;

export interface BlankLessonCoursewareOptions {
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
}

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

function createQuestionImageElement(
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

function extractFloatingImages(
  content: string | undefined,
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
    elements.push(createQuestionImageElement(
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
    elements.push(createQuestionImageElement(
      src,
      alt || "题目图片",
      offset + elements.length,
      questionSection,
    ));
    return "";
  });

  return { content: cleaned.trim(), elements };
}

export function createLessonQuestionSlide(question: Question): LessonSlide {
  const stem = extractFloatingImages(question.stem, "stem");
  let imageOffset = stem.elements.length;
  const options = question.options?.map((option) => {
    const extracted = extractFloatingImages(option, "options", imageOffset);
    imageOffset += extracted.elements.length;
    return extracted;
  });
  const answer = extractFloatingImages(question.answer, "answer", imageOffset);
  imageOffset += answer.elements.length;
  const analysis = extractFloatingImages(question.analysis, "analysis", imageOffset);
  imageOffset += analysis.elements.length;
  const summary = extractFloatingImages(question.summary, "analysis", imageOffset);

  const elements = [
    ...stem.elements,
    ...(options?.flatMap((option) => option.elements) || []),
    ...answer.elements,
    ...analysis.elements,
    ...summary.elements,
  ];

  return {
    id: genId("slide"),
    type: "question",
    title: "题目",
    questionId: question.id,
    questionSnapshot: {
      stem: stem.content,
      type: question.type,
      options: options?.map((option) => option.content),
      answer: answer.content,
      analysis: analysis.content,
      summary: question.summary === undefined ? undefined : summary.content,
      board: question.board,
      boardImages: question.boardImages ? [...question.boardImages] : [],
      links: question.links?.map((link) => ({ ...link })),
      explanationVideo: question.explanationVideo ? { ...question.explanationVideo } : null,
    },
    elements,
    relatedQuestionIds: [],
    askableStudentIds: [],
  };
}

export async function createBlankLessonCourseware(
  teacherId: string,
  schoolId: string,
  options: BlankLessonCoursewareOptions,
) {
  return lessonCoursewareService.createCourseware(teacherId, schoolId, {
    title: "未命名课件",
    description: "",
    chapterIds: [],
    knowledgePointIds: [],
    grade: options.grade,
    schoolYear: options.schoolYear,
    semester: options.semester,
    sourceType: "manual",
    slides: [{
      id: genId("slide"),
      type: "knowledge",
      title: "新页面",
      content: "",
      freeformLayout: true,
      elements: [],
      relatedQuestionIds: [],
      askableStudentIds: [],
    }],
    classIds: [],
  });
}
