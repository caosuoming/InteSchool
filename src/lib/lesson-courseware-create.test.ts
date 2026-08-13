import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@/types";

const mocks = vi.hoisted(() => ({
  createCourseware: vi.fn(),
}));

vi.mock("@/services/lessonCourseware", () => ({
  lessonCoursewareService: {
    createCourseware: mocks.createCourseware,
  },
}));

import {
  createBlankLessonCourseware,
  createLessonQuestionSlide,
} from "./lesson-courseware-create";

describe("lesson courseware creation helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a question slide from a complete question snapshot", () => {
    const question = {
      id: "question-1",
      stem: "求 $x^2=4$ 的解",
      type: "single",
      options: ["$x=2$", "$x=-2$"],
      answer: "$x=\\pm2$",
      analysis: "平方根定义",
      summary: "注意正负根",
      boardImages: ["/board.png"],
      links: [{ id: "link-1", title: "参考", url: "https://example.com" }],
    } as unknown as Question;

    const slide = createLessonQuestionSlide(question);

    expect(slide.type).toBe("question");
    expect(slide.questionId).toBe(question.id);
    expect(slide.questionSnapshot).toMatchObject({
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
      summary: question.summary,
    });
    expect(slide.relatedQuestionIds).toEqual([]);
  });

  it("creates a blank manual courseware with one editable page", async () => {
    mocks.createCourseware.mockResolvedValue({ id: "lesson-1" });

    await createBlankLessonCourseware("teacher-1", "school-1", {
      grade: "高一",
      schoolYear: "2026-2027",
      semester: "上学期",
    });

    expect(mocks.createCourseware).toHaveBeenCalledWith(
      "teacher-1",
      "school-1",
      expect.objectContaining({
        title: "未命名课件",
        sourceType: "manual",
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "上学期",
        classIds: [],
        slides: [expect.objectContaining({
          type: "knowledge",
          title: "新页面",
          freeformLayout: true,
          elements: [],
        })],
      }),
    );
  });
});
