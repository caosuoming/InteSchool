import { describe, expect, it } from "vitest";
import type { Courseware, Material } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { migrateMathCoursewareMaterials } from "./math-courseware-migration.js";

const makeCourseware = (overrides: Partial<Courseware> = {}): Courseware => ({
  id: "cw-1", teacherId: "math-teacher", schoolId: "school-1", title: "函数演示",
  chapterIds: ["chapter-1"], knowledgePointIds: [], grade: "高一", schoolYear: "2026",
  type: "ggb", content: "演示", fileUrl: "/api/files/ggb1", fileName: "function.ggb",
  tags: ["数学"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeState = (coursewares: Courseware[], materials: Material[] = []): AppState => ({
  teachers: [
    { id: "math-teacher", subject: "数学" },
    { id: "other-teacher", subject: "物理" },
  ] as AppState["teachers"],
  currentTeacherId: null,
  coursewares,
  materials,
});

describe("math courseware library migration", () => {
  it("moves legacy GGB and HTML into the material library without destroying original references", () => {
    const state = makeState([
      makeCourseware(),
      makeCourseware({ id: "cw-html", type: "other", fileName: "animation.html" }),
      makeCourseware({ id: "cw-ppt", type: "ppt", fileName: "slides.pptx" }),
    ]);
    expect(migrateMathCoursewareMaterials(state)).toBe(2);
    expect((state.materials as Material[]).map((material) => [material.id, material.type]))
      .toEqual([["cw-1", "file"], ["cw-html", "file"]]);
    expect((state.materials as Material[])[0]).toMatchObject({
      fileUrl: "/api/files/ggb1", chapterIds: ["chapter-1"], subject: "数学",
    });
    expect((state.coursewares as Courseware[])[0]).toMatchObject({
      id: "cw-1", migratedToMaterial: true, type: "ggb",
    });
    expect((state.coursewares as Courseware[])[2].migratedToMaterial).toBeUndefined();
    expect(migrateMathCoursewareMaterials(state)).toBe(0);
    expect(state.materials).toHaveLength(2);
  });

  it("preserves generated, linked, non-math and fileless courseware", () => {
    const state = makeState([
      makeCourseware({ id: "linked", lessonCoursewareId: "lesson-1" }),
      makeCourseware({ id: "generated", sourceResourceType: "lecture" }),
      makeCourseware({ id: "physics", teacherId: "other-teacher" }),
      makeCourseware({ id: "fileless", fileUrl: undefined }),
    ]);
    expect(migrateMathCoursewareMaterials(state)).toBe(0);
    expect(state.materials).toEqual([]);
  });
});
