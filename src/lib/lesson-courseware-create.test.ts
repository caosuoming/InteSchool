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

  it("extracts question images into movable slide elements", () => {
    const question = {
      id: "question-with-images",
      stem: '<p>观察图形：</p><img src="/stem.png" alt="题干图">',
      type: "single",
      options: [
        'A 文本 ![选项图](/option.png)',
        "B 文本",
      ],
      answer: '<img src="/answer.png" alt="答案图">答案',
      analysis: "解析 ![解析图](/analysis.png)",
      summary: '<img src="/summary.png">总结',
      boardImages: [],
      links: [],
    } as unknown as Question;

    const slide = createLessonQuestionSlide(question);

    expect(slide.questionSnapshot).toMatchObject({
      stem: "<p>观察图形：</p>",
      options: ["A 文本", "B 文本"],
      answer: "答案",
      analysis: "解析",
      summary: "总结",
    });
    expect(slide.elements).toEqual([
      expect.objectContaining({
        kind: "image",
        src: "/stem.png",
        alt: "题干图",
        questionSection: "stem",
      }),
      expect.objectContaining({
        kind: "image",
        src: "/option.png",
        alt: "选项图",
        questionSection: "options",
      }),
      expect.objectContaining({
        kind: "image",
        src: "/answer.png",
        alt: "答案图",
        questionSection: "answer",
      }),
      expect.objectContaining({
        kind: "image",
        src: "/analysis.png",
        alt: "解析图",
        questionSection: "analysis",
      }),
      expect.objectContaining({
        kind: "image",
        src: "/summary.png",
        alt: "题目图片",
        questionSection: "analysis",
      }),
    ]);
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
