import { describe, expect, it } from "vitest";
import type { LectureColumnTemplate } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { lectureService } from "./lecture.js";

function state(templates: LectureColumnTemplate[] = []): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    lectures: [],
    lectureColumnTemplates: templates,
  };
}

describe("lecture column templates", () => {
  it("creates, normalizes, and lists templates within the teacher and school scope", async () => {
    const appState = state([
      {
        id: "foreign-template",
        teacherId: "teacher-2",
        schoolId: "school-1",
        name: "其他教师模板",
        columns: [{ title: "栏目", content: "" }],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);

    await runWithState(appState, async () => {
      const created = await lectureService.createColumnTemplate("teacher-1", "school-1", {
        name: "  专题复习  ",
        description: "  用于期末复习  ",
        columns: [
          { title: "  知识梳理  ", content: "  核心概念  " },
          { title: "例题精讲", content: "" },
          { title: "   ", content: "ignored" },
        ],
      });

      expect(created).toMatchObject({
        teacherId: "teacher-1",
        schoolId: "school-1",
        name: "专题复习",
        description: "用于期末复习",
        columns: [
          { title: "知识梳理", content: "核心概念" },
          { title: "例题精讲", content: "" },
        ],
      });

      const listed = await lectureService.listColumnTemplates("teacher-1", "school-1");
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(created.id);
    });
  });

  it("deletes owned templates and rejects deleting another teacher's template", async () => {
    const owned: LectureColumnTemplate = {
      id: "owned-template",
      teacherId: "teacher-1",
      schoolId: "school-1",
      name: "我的模板",
      columns: [{ title: "栏目", content: "" }],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const foreign: LectureColumnTemplate = {
      ...owned,
      id: "foreign-template",
      teacherId: "teacher-2",
      name: "他人模板",
    };
    const appState = state([owned, foreign]);

    await runWithState(appState, async () => {
      await lectureService.deleteColumnTemplate(owned.id, "teacher-1");
      expect(appState.lectureColumnTemplates).toEqual([foreign]);

      await expect(
        lectureService.deleteColumnTemplate(foreign.id, "teacher-1"),
      ).rejects.toThrow("无权删除该栏目模板");
      expect(appState.lectureColumnTemplates).toEqual([foreign]);
    });
  });

  it("requires a template name and at least one named column", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      await expect(lectureService.createColumnTemplate("teacher-1", "school-1", {
        name: "",
        columns: [{ title: "栏目", content: "" }],
      })).rejects.toThrow("请填写模板名称");

      await expect(lectureService.createColumnTemplate("teacher-1", "school-1", {
        name: "空模板",
        columns: [{ title: "   ", content: "" }],
      })).rejects.toThrow("请至少保存一个栏目");
    });
  });
});
