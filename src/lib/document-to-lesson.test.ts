import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExamPaper, Lecture, Teacher } from "@/types";
import { createLessonFromOwnedDocument } from "./document-to-lesson";
import { fallbackLessonBlocks } from "@/lib/lesson-resource-blocks";
import { lessonCoursewareService } from "@/services/lessonCourseware";

vi.mock("@/lib/lesson-resource-blocks", () => ({
  fallbackLessonBlocks: vi.fn(),
}));
vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    createFromLecture: vi.fn(),
    createFromExamPaper: vi.fn(),
  },
}));

const teacher = { id: "teacher-1", schoolId: "school-current", subject: "数学" } as Teacher;
const lecture = { id: "lecture-old", teacherId: "teacher-1", schoolId: "school-previous" } as Lecture;
const paper = { id: "paper-old", teacherId: "teacher-1", schoolId: "personal-directory:teacher-1" } as ExamPaper;
const blocks = [{ id: "block-1", type: "knowledge" as const, content: "课堂内容" }];

describe("document lesson creation across affiliations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fallbackLessonBlocks).mockResolvedValue(blocks);
    vi.mocked(lessonCoursewareService.createFromExamPaper).mockResolvedValue({ id: "lesson-paper" } as never);
    vi.mocked(lessonCoursewareService.createFromLecture).mockResolvedValue({ id: "lesson-lecture" } as never);
  });

  it("converts a historical lecture into a school lesson under the current school", async () => {
    const lesson = await createLessonFromOwnedDocument(teacher, "lecture", lecture);
    expect(lesson.id).toBe("lesson-lecture");
    expect(lessonCoursewareService.createFromLecture).toHaveBeenCalledWith(
      "teacher-1", "school-current", "lecture-old", blocks, undefined,
    );
  });

  it("uses the current affiliation for personal classes even when the paper belongs to the personal resource scope", async () => {
    const lesson = await createLessonFromOwnedDocument(teacher, "examPaper", paper, ["personal-1"]);
    expect(lesson.id).toBe("lesson-paper");
    expect(lessonCoursewareService.createFromExamPaper).toHaveBeenCalledWith(
      "teacher-1", "school-current", "paper-old", blocks, ["personal-1"],
    );
  });

  it("rejects school lesson creation without an active school instead of using a document's old school", async () => {
    await expect(createLessonFromOwnedDocument(
      { ...teacher, schoolId: null }, "lecture", lecture,
    )).rejects.toThrow("请先完成学校认证");
    expect(fallbackLessonBlocks).not.toHaveBeenCalled();
    expect(lessonCoursewareService.createFromLecture).not.toHaveBeenCalled();
  });
});
