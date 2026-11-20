import type { CoursewareType } from "../../src/types/index.js";

/** Platform-generated decks are stored separately; uploaded math courseware must be PPT. */
export function assertMathCoursewareUpload(
  subject: string | undefined,
  type: CoursewareType,
  fileUrl?: string,
  fileName?: string,
): void {
  if (subject !== "数学" || !fileUrl) return;
  if (type !== "ppt" || (fileName && !/\.pptx?$/i.test(fileName))) {
    throw new Error("数学课件库仅接受 PPT/PPTX；其他文件请保存到素材库");
  }
}
