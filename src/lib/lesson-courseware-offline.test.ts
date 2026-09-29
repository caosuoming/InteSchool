import { describe, expect, it, vi } from "vitest";
import type { Courseware, LessonCourseware } from "@/types";
import {
  buildOfflineLessonCoursewareHtml,
  offlineLessonFromLibraryCourseware,
} from "./lesson-courseware-offline";

function lesson(overrides: Partial<LessonCourseware> = {}): LessonCourseware {
  return {
    id: "lesson-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    title: "函数课",
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    sourceType: "manual",
    slides: [{
      id: "slide-1",
      type: "knowledge",
      title: "函数",
      content: "一次函数 $y=kx+b$",
      relatedQuestionIds: [],
      askableStudentIds: [],
    }],
    classIds: [],
    status: "draft",
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("offline lesson courseware export", () => {
  it("builds a self-contained classroom operation page", async () => {
    const { html, warnings } = await buildOfflineLessonCoursewareHtml(lesson());

    expect(warnings).toEqual([]);
    expect(html).toContain("InteSchool 脱机课件");
    expect(html).toContain('id="toggleSidebar"');
    expect(html).toContain('id="fullscreen"');
    expect(html).toContain('id="prev"');
    expect(html).toContain('id="next"');
    expect(html).toContain('id="toggleAnswer"');
    expect(html).toContain('id="pen"');
    expect(html).toContain('id="eraser"');
    expect(html).toContain("一次函数");

    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();
  });

  it("inlines slide media so it remains available offline", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["image-bytes"], { type: "image/png" }),
    } as Response);

    try {
      const { html, warnings } = await buildOfflineLessonCoursewareHtml(lesson({
        slides: [{
          id: "slide-image",
          type: "knowledge",
          title: "图片页",
          content: "",
          freeformLayout: true,
          elements: [{
            id: "image-1",
            kind: "image",
            src: "/api/files/example.png",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
          }],
        }],
      }));

      expect(warnings).toEqual([]);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(html).toContain("data:image/png;base64,aW1hZ2UtYnl0ZXM=");
      expect(html).not.toContain("/api/files/example.png");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("falls back to an offline lesson wrapper for a raw library courseware", () => {
    const courseware: Courseware = {
      id: "courseware-1",
      teacherId: "teacher-1",
      schoolId: "school-1",
      title: "原始 PPT",
      chapterIds: [],
      knowledgePointIds: [],
      grade: "高一",
      schoolYear: "2026-2027",
      type: "ppt",
      content: "",
      fileUrl: "/api/files/courseware-1",
      fileName: "原始 PPT.pptx",
      tags: [],
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    };

    const wrapped = offlineLessonFromLibraryCourseware(courseware);

    expect(wrapped.libraryCoursewareId).toBe(courseware.id);
    expect(wrapped.slides).toHaveLength(1);
    expect(wrapped.slides[0]).toMatchObject({
      type: "courseware",
      coursewareType: "ppt",
      fileUrl: "/api/files/courseware-1",
      fileName: "原始 PPT.pptx",
      openInWps: true,
    });
  });

  it("escapes script delimiters from serialized courseware content", async () => {
    const { html } = await buildOfflineLessonCoursewareHtml(lesson({
      title: "</script><script>alert(1)</script>",
      slides: [{
        id: "slide-unsafe",
        type: "knowledge",
        title: "安全测试",
        content: "</script><script>alert(2)</script>",
      }],
    }));

    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(script).not.toContain("</script><script>alert(2)");
    expect(() => new Function(script!)).not.toThrow();
  });
});
