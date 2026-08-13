import { lessonCoursewareService } from "@/services/lessonCourseware";
import type { LessonSlide, Question, ResourceSemester } from "@/types";
import { genId } from "@/lib/service-utils";

export interface BlankLessonCoursewareOptions {
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
}

export function createLessonQuestionSlide(question: Question): LessonSlide {
  return {
    id: genId("slide"),
    type: "question",
    title: "题目",
    questionId: question.id,
    questionSnapshot: {
      stem: question.stem,
      type: question.type,
      options: question.options ? [...question.options] : undefined,
      answer: question.answer,
      analysis: question.analysis,
      summary: question.summary,
      board: question.board,
      boardImages: question.boardImages ? [...question.boardImages] : [],
      links: question.links?.map((link) => ({ ...link })),
      explanationVideo: question.explanationVideo ? { ...question.explanationVideo } : null,
    },
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
