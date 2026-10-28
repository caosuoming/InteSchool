import { describe, expect, it } from "vitest";
import { runWithState } from "../runtime-db.js";
import type { AppState, TeacherRecord } from "../types.js";
import type { SchoolResourceBackup } from "../../src/types/index.js";
import { knowledgeService } from "./knowledge.js";
import {
  getSchoolResourceChapterTree,
  getSchoolResourceKnowledgeTree,
  syncSchoolResourceDirectories,
} from "./school-resource-catalog.js";

function teacher(): TeacherRecord {
  return {
    id: "teacher-a",
    email: "teacher@example.com",
    name: "教师",
    avatar: "",
    schoolId: "school-a",
    subject: "数学",
    subjects: ["数学", "地理"],
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: "aff-a", schoolId: "school-a", subject: "数学", subjects: ["数学", "地理"], isCurrent: true,
    }],
    currentAffiliationId: "aff-a",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function switchSubject(state: AppState, subject: string): void {
  state.teachers[0].subject = subject;
  state.teachers[0].affiliations[0].subject = subject;
}

function schoolBackup(id: string, subject: string, chapterId: string, knowledgeId: string): SchoolResourceBackup {
  return {
    id,
    schoolId: "school-a",
    subject,
    resourceType: "question",
    sourceResourceId: id,
    title: id,
    contentSnapshot: "{}",
    fromTeacherId: "teacher-a",
    backupReason: "test",
    targetClassIds: [],
    chapterIds: [chapterId],
    knowledgePointIds: [knowledgeId],
    meta: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resource directories follow the active subject", () => {
  it("keeps the mathematics directory when switching to geography and back", async () => {
    const state = {
      teachers: [teacher()],
      currentTeacherId: "teacher-a",
      chapters: [{ id: "math", schoolId: "personal-directory:teacher-a", teacherId: "teacher-a", parentId: null, name: "函数", level: 0, order: 1 }],
      knowledgePoints: [],
      thoughtMethods: [],
      directoryCatalogs: [],
      questions: [],
    } as AppState;

    await runWithState(state, async () => {
      expect((await knowledgeService.getChapterTree("teacher-a")).children.map((node) => node.name)).toEqual(["函数"]);
      switchSubject(state, "地理");
      expect((await knowledgeService.getChapterTree("teacher-a")).children).toEqual([]);
      await knowledgeService.addChapter("teacher-a", null, "地球运动");
      expect((await knowledgeService.getChapterTree("teacher-a")).children.map((node) => node.name)).toEqual(["地球运动"]);
      const geographyCatalogs = await knowledgeService.listDirectoryCatalogs("teacher-a", "chapter");
      expect(geographyCatalogs).toHaveLength(1);
      expect(geographyCatalogs[0].subject).toBe("地理");

      switchSubject(state, "数学");
      expect((await knowledgeService.getChapterTree("teacher-a")).children.map((node) => node.name)).toEqual(["函数"]);
      expect(await knowledgeService.listDirectoryCatalogs("teacher-a", "chapter")).toHaveLength(1);
      switchSubject(state, "地理");
      expect((await knowledgeService.getChapterTree("teacher-a")).children.map((node) => node.name)).toEqual(["地球运动"]);
    });
  });

  it("only exposes the current subject's school directory and its ancestors", async () => {
    const state = {
      teachers: [teacher()],
      currentTeacherId: "teacher-a",
      schoolChapters: [
        { id: "m-parent", schoolId: "school-a", parentId: null, name: "数学", level: 0, order: 1 },
        { id: "m-child", schoolId: "school-a", parentId: "m-parent", name: "函数", level: 1, order: 1 },
        { id: "g-parent", schoolId: "school-a", parentId: null, name: "地理", level: 0, order: 2 },
      ],
      schoolKnowledgePoints: [
        { id: "m-kp", schoolId: "school-a", parentId: null, name: "集合", level: 0, order: 1 },
        { id: "g-kp", schoolId: "school-a", parentId: null, name: "经纬度", level: 0, order: 2 },
      ],
      schoolBackups: [
        schoolBackup("math-backup", "数学", "m-child", "m-kp"),
        schoolBackup("geo-backup", "地理", "g-parent", "g-kp"),
      ],
    } as AppState;

    await runWithState(state, async () => {
      const geography = getSchoolResourceChapterTree("school-a", "地理");
      expect(geography.children.map((node) => node.name)).toEqual(["地理"]);
      expect(geography.count).toBe(1);
      expect(getSchoolResourceKnowledgeTree("school-a", "地理").children.map((node) => node.name)).toEqual(["经纬度"]);
      const math = getSchoolResourceChapterTree("school-a", "数学");
      expect(math.children.map((node) => node.name)).toEqual(["数学"]);
      expect(math.children[0].children.map((node) => node.name)).toEqual(["函数"]);
    });
  });

  it("transfers a teacher-owned directory node into the school backup catalog", async () => {
    const state = {
      teachers: [teacher()],
      currentTeacherId: "teacher-a",
      chapters: [{ id: "personal-ch", teacherId: "teacher-a", subject: "地理", schoolId: "personal-directory:teacher-a", parentId: null, name: "地球运动", order: 1, level: 0 }],
      knowledgePoints: [{ id: "personal-kp", teacherId: "teacher-a", subject: "地理", schoolId: "personal-directory:teacher-a", parentId: null, name: "昼夜更替", order: 1, level: 0 }],
      schoolChapters: [],
      schoolKnowledgePoints: [],
    } as AppState;

    await runWithState(state, async () => {
      const result = syncSchoolResourceDirectories("school-a", ["personal-ch"], ["personal-kp"]);
      expect(result.chapterIds).toHaveLength(1);
      expect(result.knowledgePointIds).toHaveLength(1);
    });
  });
});
