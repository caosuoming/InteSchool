import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "../types.js";
import type { Chapter, DirectoryCatalog, KnowledgePoint, Question } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";

function teacher(): TeacherRecord {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "教师一",
    avatar: "",
    schoolId: "school-a",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [
      { id: "aff-a", schoolId: "school-a", subject: "数学", status: "active", isCurrent: true },
      { id: "aff-b", schoolId: "school-b", subject: "数学", status: "active", isCurrent: false },
      { id: "aff-personal", schoolId: null, subject: "数学", status: "active", isCurrent: false },
    ],
    currentAffiliationId: "aff-a",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function otherTeacher(): TeacherRecord {
  return {
    ...teacher(),
    id: "teacher-2",
    email: "teacher2@example.com",
    name: "教师二",
    affiliations: [
      { id: "aff-2", schoolId: "school-a", subject: "数学", status: "active", isCurrent: true },
    ],
    currentAffiliationId: "aff-2",
  } as TeacherRecord;
}

function question(): Question {
  return {
    id: "question-1",
    teacherId: "teacher-1",
    schoolId: "school-a",
    type: "single",
    stem: "测试题",
    options: ["A", "B"],
    answer: "A",
    analysis: "",
    chapterIds: ["chapter-a"],
    knowledgePointIds: ["knowledge-a"],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    isShared: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function state(): AppState {
  return {
    teachers: [teacher(), otherTeacher()],
    currentTeacherId: "teacher-1",
    chapters: [
      { id: "chapter-a", schoolId: "school-a", parentId: null, name: "原学校章节", order: 1, level: 0 },
      { id: "chapter-b", schoolId: "school-b", parentId: null, name: "新学校章节", order: 1, level: 0 },
    ] satisfies Chapter[],
    knowledgePoints: [
      { id: "knowledge-a", schoolId: "school-a", parentId: null, name: "原学校知识点", order: 1, level: 0 },
      { id: "knowledge-b", schoolId: "school-b", parentId: null, name: "新学校知识点", order: 1, level: 0 },
    ] satisfies KnowledgePoint[],
    questions: [question()],
    directoryCatalogs: [
      {
        id: "catalog-a",
        schoolId: "school-a",
        type: "chapter",
        name: "A目录",
        nodes: [{ id: "chapter-a", parentId: null, name: "原学校章节", order: 1, level: 0 }],
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "catalog-b",
        schoolId: "school-b",
        type: "chapter",
        name: "B目录",
        nodes: [{ id: "chapter-b", parentId: null, name: "新学校章节", order: 1, level: 0 }],
        isActive: true,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ] satisfies DirectoryCatalog[],
    directoryDonations: [],
  } as AppState;
}

function switchAffiliation(appState: AppState, affiliationId: string): void {
  const target = appState.teachers[0].affiliations.find((item) => item.id === affiliationId)!;
  appState.teachers[0] = {
    ...appState.teachers[0],
    schoolId: typeof target.schoolId === "string" ? target.schoolId : null,
    currentAffiliationId: affiliationId,
    affiliations: appState.teachers[0].affiliations.map((item) => ({
      ...item,
      isCurrent: item.id === affiliationId,
    })),
  };
}

describe("personal chapter and knowledge directories", () => {
  it("keeps one personal directory across schools and personal identity", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const chapterAtSchoolA = await knowledgeService.getChapterTree("teacher-1");
      const knowledgeAtSchoolA = await knowledgeService.getKnowledgeTree("teacher-1");
      expect(chapterAtSchoolA.children.map((item) => item.name)).toEqual(["原学校章节", "新学校章节"]);
      expect(knowledgeAtSchoolA.children.map((item) => item.name)).toEqual(["原学校知识点", "新学校知识点"]);

      const migratedQuestion = (appState.questions as Question[])[0];
      expect(migratedQuestion.chapterIds[0]).not.toBe("chapter-a");
      expect(migratedQuestion.knowledgePointIds[0]).not.toBe("knowledge-a");

      const catalogs = await knowledgeService.listDirectoryCatalogs("teacher-1", "chapter");
      expect(catalogs.map((item) => item.name)).toEqual(["A目录", "B目录"]);
      expect(catalogs.every((item) => item.teacherId === "teacher-1")).toBe(true);

      await knowledgeService.addChapter("teacher-1", null, "个人新增章节");
      const expectedChapters = await knowledgeService.listChapters("teacher-1");
      const expectedKnowledge = await knowledgeService.listKnowledgePoints("teacher-1");

      switchAffiliation(appState, "aff-b");
      expect(await knowledgeService.listChapters("teacher-1")).toEqual(expectedChapters);
      expect(await knowledgeService.listKnowledgePoints("teacher-1")).toEqual(expectedKnowledge);

      switchAffiliation(appState, "aff-personal");
      expect(await knowledgeService.listChapters("teacher-1")).toEqual(expectedChapters);
      expect(await knowledgeService.listKnowledgePoints("teacher-1")).toEqual(expectedKnowledge);

      expect((appState.chapters as Chapter[]).filter((item) => !item.teacherId).map((item) => item.id))
        .toEqual(["chapter-a", "chapter-b"]);
      expect((await knowledgeService.listChapters("teacher-2")).map((item) => item.name))
        .toEqual(["原学校章节"]);
    });
  });

  it("does not resurrect legacy nodes after the personal directory is emptied", async () => {
    const appState = state();
    appState.directoryCatalogs = [];

    await runWithState(appState, async () => {
      const personal = await knowledgeService.listChapters("teacher-1");
      for (const node of personal.filter((item) => item.parentId === null)) {
        await knowledgeService.deleteNode(node.id, "chapter");
      }

      expect(await knowledgeService.listChapters("teacher-1")).toEqual([]);
      expect((appState.chapters as Chapter[]).filter((item) => !item.teacherId)).toHaveLength(2);
      expect((appState.directoryCatalogs as DirectoryCatalog[]).some(
        (item) => item.teacherId === "teacher-1" && item.type === "chapter",
      )).toBe(true);
    });
  });
});
