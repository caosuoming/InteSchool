import type { ExamPaper, Lecture, LessonCourseware, Teacher } from "@/types";
import { fallbackLessonBlocks } from "@/lib/lesson-resource-blocks";
import { lessonCoursewareService } from "@/services/lessonCourseware";

/** A teacher's own document may have been saved under a previous school. */
export async function createLessonFromOwnedDocument(
  teacher: Pick<Teacher, "id" | "schoolId" | "subject">,
  type: "examPaper" | "lecture",
  document: ExamPaper | Lecture,
  personalClassIds?: string[],
): Promise<LessonCourseware> {
  const schoolId = teacher.schoolId;
  if (!schoolId) throw new Error("请先完成学校认证");
  const blocks = await fallbackLessonBlocks(document, type, teacher.subject);
  return type === "lecture"
    ? lessonCoursewareService.createFromLecture(teacher.id, schoolId, document.id, blocks, personalClassIds)
    : lessonCoursewareService.createFromExamPaper(teacher.id, schoolId, document.id, blocks, personalClassIds);
}
