import { describe, expect, it } from "vitest";
import { runWithState } from "../runtime-db.js";
import type { AppState, TeacherRecord } from "../types.js";
import { knowledgeService } from "./knowledge.js";
import type { Chapter, KnowledgePoint } from "../../src/types/index.js";

function teacher(id: string): TeacherRecord {
  return {
    id, schoolId: "school-1", subject: "数学",
    email: id + "@example.org", name: id, avatar: "",
    status: "active", role: "teacher", roles: ["teacher"],
    subjectGroupIds: [], prepGroupIds: [], affiliations: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function state(): AppState {
  return {
    currentTeacherId: "t1",
    teachers: [teacher("t1"), teacher("t2")],
    chapters: [
      { id: "c1", teacherId: "t1", schoolId: "personal-directory:t1", parentId: null, name: "基础", order: 1, level: 0 },
      { id: "c2", teacherId: "t1", schoolId: "personal-directory:t1", parentId: null, name: "进阶", order: 2, level: 0 },
      { id: "foreign", teacherId: "t2", schoolId: "personal-directory:t2", parentId: null, name: "其他教师", order: 1, level: 0 },
    ] satisfies Chapter[],
    knowledgePoints: [
      { id: "k1", teacherId: "t1", schoolId: "personal-directory:t1", parentId: null, name: "知识点一", order: 1, level: 0 },
      { id: "k2", teacherId: "t1", schoolId: "personal-directory:t1", parentId: null, name: "知识点二", order: 2, level: 0 },
    ] satisfies KnowledgePoint[],
    questions: [],
    directoryCatalogs: [],
    directoryDonations: [],
  } as AppState;
}

describe("knowledge prerequisites", () => {
  it("supports cross-type references and rejects self links, cycles, duplicates and foreign nodes", async () => {
    const data = state();
    await runWithState(data, async () => {
      await knowledgeService.setNodePrerequisites("t1", "chapter", "c2", [
        { type: "chapter", id: "c1" }, { type: "knowledge", id: "k1" },
      ]);
      expect((await knowledgeService.getChapterTree("t1")).children[1].prerequisites).toEqual([
        { type: "chapter", id: "c1" }, { type: "knowledge", id: "k1" },
      ]);
      await knowledgeService.setNodePrerequisites("t1", "knowledge", "k1", [{ type: "knowledge", id: "k2" }]);
      await expect(knowledgeService.setNodePrerequisites("t1", "knowledge", "k2", [
        { type: "chapter", id: "c2" },
      ])).rejects.toThrow("循环");
      await expect(knowledgeService.setNodePrerequisites("t1", "chapter", "c1", [
        { type: "chapter", id: "c1" },
      ])).rejects.toThrow("自身");
      await expect(knowledgeService.setNodePrerequisites("t1", "chapter", "c1", [
        { type: "chapter", id: "c2" }, { type: "chapter", id: "c2" },
      ])).rejects.toThrow("重复");
      await expect(knowledgeService.setNodePrerequisites("t1", "chapter", "c1", [
        { type: "chapter", id: "foreign" },
      ])).rejects.toThrow("当前目录");
      await expect(knowledgeService.setNodePrerequisites("t1", "chapter", "foreign", [])).rejects.toThrow("当前目录");
      expect((await knowledgeService.listChapters("t1")).find((item) => item.id === "c1")?.prerequisites).toBeUndefined();
    });
  });

  it("retains same-directory prerequisites when switching catalogs and removes deleted references", async () => {
    const data = state();
    await runWithState(data, async () => {
      await knowledgeService.setNodePrerequisites("t1", "chapter", "c2", [
        { type: "chapter", id: "c1" }, { type: "knowledge", id: "k1" },
      ]);
      const original = (await knowledgeService.listDirectoryCatalogs("t1", "chapter"))[0];
      const fresh = await knowledgeService.createDirectoryCatalog("t1", "chapter", "新的章节目录");
      expect(fresh.id).not.toBe(original.id);
      expect((await knowledgeService.listChapters("t1"))).toEqual([]);
      await knowledgeService.activateDirectoryCatalog("t1", original.id);
      expect((await knowledgeService.listChapters("t1")).find((item) => item.id === "c2")?.prerequisites).toEqual([
        { type: "chapter", id: "c1" }, { type: "knowledge", id: "k1" },
      ]);
      await knowledgeService.deleteNode("k1", "knowledge");
      expect((await knowledgeService.listChapters("t1")).find((item) => item.id === "c2")?.prerequisites)
        .toEqual([{ type: "chapter", id: "c1" }]);
    });
  });

  it("remaps references when merging knowledge points too", async () => {
    const data = state();
    await runWithState(data, async () => {
      await knowledgeService.setNodePrerequisites("t1", "chapter", "c1", [{ type: "knowledge", id: "k1" }]);
      await knowledgeService.mergeNodes("k1", "k2", "knowledge");
      expect((await knowledgeService.listChapters("t1")).find((item) => item.id === "c1")?.prerequisites)
        .toEqual([{ type: "knowledge", id: "k2" }]);
    });
  });

  it("remaps incoming references when merging two chapters", async () => {
    const data = state();
    await runWithState(data, async () => {
      await knowledgeService.setNodePrerequisites("t1", "knowledge", "k1", [{ type: "chapter", id: "c1" }]);
      await knowledgeService.mergeNodes("c1", "c2", "chapter");
      expect((await knowledgeService.listKnowledgePoints("t1")).find((item) => item.id === "k1")?.prerequisites)
        .toEqual([{ type: "chapter", id: "c2" }]);
    });
  });
});
