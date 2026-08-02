import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { settingsService } from "./settings.js";

function createState(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    schoolSettings: [],
    classTypeCategories: [],
    examPaperTypes: [],
    lectureTypes: [],
  };
}

describe("resource type hierarchy settings", () => {
  it("creates second-level exam-paper types and numbers siblings independently", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const exam = await settingsService.createExamPaperType("school-1", {
        name: "考试",
        format: "gaokao",
      });
      const practice = await settingsService.createExamPaperType("school-1", {
        name: "练习",
        format: "simple",
      });
      const monthly = await settingsService.createExamPaperType("school-1", {
        name: "月考",
        parentId: exam.id,
        format: "gaokao",
      });
      const weekly = await settingsService.createExamPaperType("school-1", {
        name: "周测",
        parentId: exam.id,
        format: "gaokao",
      });

      expect(exam).toMatchObject({ parentId: undefined, sortOrder: 1 });
      expect(practice).toMatchObject({ parentId: undefined, sortOrder: 2 });
      expect(monthly).toMatchObject({ parentId: exam.id, sortOrder: 1 });
      expect(weekly).toMatchObject({ parentId: exam.id, sortOrder: 2 });
    });
  });

  it("rejects a third hierarchy level and protects parents with children", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const root = await settingsService.createLectureType("school-1", {
        name: "教辅",
        format: "mixed",
      });
      const child = await settingsService.createLectureType("school-1", {
        name: "同步训练",
        parentId: root.id,
        format: "mixed",
      });

      await expect(settingsService.createLectureType("school-1", {
        name: "三级类型",
        parentId: child.id,
        format: "mixed",
      })).rejects.toThrow("仅支持二级类型");
      await expect(settingsService.deleteLectureType(root.id)).rejects.toThrow("请先删除或移动");
      await expect(settingsService.updateLectureType(root.id, { parentId: child.id })).rejects.toThrow();
    });
  });

  it("allows moving a child back to the first level", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const root = await settingsService.createExamPaperType("school-1", {
        name: "考试",
        format: "gaokao",
      });
      const child = await settingsService.createExamPaperType("school-1", {
        name: "月考",
        parentId: root.id,
        format: "gaokao",
      });

      const updated = await settingsService.updateExamPaperType(child.id, { parentId: null });
      expect(updated).toMatchObject({ parentId: undefined, sortOrder: 2 });
      await expect(settingsService.deleteExamPaperType(root.id)).resolves.toBeUndefined();
    });
  });
});
