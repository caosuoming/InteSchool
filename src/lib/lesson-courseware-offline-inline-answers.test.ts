import { describe, expect, it, vi } from "vitest";
import type { LessonCourseware } from "@/types";
import { buildOfflineLessonCoursewareHtml } from "./lesson-courseware-offline";

vi.mock("@/lib/math-html", () => ({ renderMathHtml: (value: string) => value }));

describe("offline inline knowledge answers", () => {
  it("contains valid reveal-step controls for separate inline answers", async () => {
    const lesson: LessonCourseware = {
      id: "lesson-answers", teacherId: "teacher-1", schoolId: "school-1",
      title: "填空知识课", chapterIds: [], knowledgePointIds: [],
      grade: "高一", schoolYear: "2026-2027", sourceType: "manual",
      slides: [{
        id: "slide-answers", type: "knowledge", title: "重点",
        content: '知识甲 <span class="lesson-inline-answer" data-answer-step="1">甲</span> 知识乙 <span class="lesson-inline-answer" data-answer-step="2">乙</span>',
        freeformLayout: true,
        elements: [{
          id: "text-answers", kind: "text",
          content: '知识甲 <span class="lesson-inline-answer" data-answer-step="1">甲</span> 知识乙 <span class="lesson-inline-answer" data-answer-step="2">乙</span>',
          x: 5, y: 5, width: 90, height: 30,
        }], relatedQuestionIds: [], askableStudentIds: [],
      }],
      classIds: [], status: "draft", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z",
    };
    const { html } = await buildOfflineLessonCoursewareHtml(lesson);
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toContain("maskInlineAnswers");
    expect(script).toContain("animationSteps");
    expect(script).toContain('data-answer-step');
    expect(() => new Function(script!)).not.toThrow();
  });
});
