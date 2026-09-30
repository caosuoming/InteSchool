import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "../types.js";
import type {
  Chapter,
  DirectoryCatalog,
  DirectoryNodeAssociation,
  Question,
} from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";

function state(): AppState {
  const teacher = {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "教师一",
    avatar: "",
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [
      {
        id: "aff-1",
        schoolId: "school-1",
        subject: "数学",
        status: "active",
        isCurrent: true,
      },
    ],
    currentAffiliationId: "aff-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;

  return {
    teachers: [teacher],
    currentTeacherId: teacher.id,
    chapters: [
      {
        id: "chapter-a",
        schoolId: "personal-directory:teacher-1",
        teacherId: "teacher-1",
        parentId: null,
        name: "集合",
        order: 1,
        level: 0,
      },
    ] as Chapter[],
    knowledgePoints: [],
    questions: [
      {
        id: "question-1",
        teacherId: "teacher-1",
        schoolId: "school-1",
        type: "single",
        stem: "测试题",
        options: ["A", "B"],
        answer: "A",
        analysis: "",
        chapterIds: ["chapter-a"],
        knowledgePointIds: [],
        difficulty: 2,
        recommendation: 3,
        usageCount: 0,
        remark: "",
        isShared: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as Question,
    ],
    directoryCatalogs: [],
    directoryDonations: [],
    directoryNodeAssociations: [],
  } as AppState;
}

describe("named directory catalogs and cross-catalog node associations", () => {
  it("renames the root, creates multiple catalogs, and keeps exactly one active", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const [defaultCatalog] = await knowledgeService.listDirectoryCatalogs(
        "teacher-1",
        "chapter",
      );
      expect(defaultCatalog.isActive).toBe(true);

      const renamed = await knowledgeService.renameDirectoryCatalog(
        "teacher-1",
        defaultCatalog.id,
        "人教A版",
      );
      expect(renamed.name).toBe("人教A版");
      expect(renamed.rootName).toBe("人教A版");
      expect((await knowledgeService.getChapterTree("teacher-1")).name).toBe(
        "人教A版",
      );

      const created = await knowledgeService.createDirectoryCatalog(
        "teacher-1",
        "chapter",
        "苏教版",
      );
      expect(created.isActive).toBe(true);
      expect(created.rootName).toBe("苏教版");
      expect((await knowledgeService.getChapterTree("teacher-1")).name).toBe(
        "苏教版",
      );

      const catalogs = await knowledgeService.listDirectoryCatalogs(
        "teacher-1",
        "chapter",
      );
      expect(catalogs).toHaveLength(2);
      expect(catalogs.filter((item) => item.isActive)).toHaveLength(1);
      expect(catalogs.find((item) => item.isActive)?.id).toBe(created.id);
    });
  });

  it("uses node associations to preserve references when activating another catalog", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const [catalogA] = await knowledgeService.listDirectoryCatalogs(
        "teacher-1",
        "chapter",
      );
      await knowledgeService.renameDirectoryCatalog(
        "teacher-1",
        catalogA.id,
        "人教A版",
      );

      const catalogB = await knowledgeService.createDirectoryCatalog(
        "teacher-1",
        "chapter",
        "苏教版",
      );
      const chapterB = await knowledgeService.addChapter(
        "teacher-1",
        null,
        "集合（苏教版）",
      );

      // Persist the currently materialized nodes into the active catalog snapshot.
      await knowledgeService.listDirectoryCatalogs("teacher-1", "chapter");

      const association = await knowledgeService.createDirectoryNodeAssociation(
        "teacher-1",
        catalogA.id,
        "chapter-a",
        catalogB.id,
        chapterB.id,
      );
      expect(association.sourceNodeId).toBe("chapter-a");
      expect(
        (appState.directoryNodeAssociations as DirectoryNodeAssociation[]),
      ).toHaveLength(1);
      expect((appState.questions as Question[])[0].chapterIds).toEqual([
        chapterB.id,
      ]);

      await knowledgeService.activateDirectoryCatalog("teacher-1", catalogA.id);
      expect(
        (appState.directoryCatalogs as DirectoryCatalog[]).filter(
          (item) => item.isActive,
        ),
      ).toHaveLength(1);
      expect((appState.questions as Question[])[0].chapterIds).toEqual([
        "chapter-a",
      ]);

      await knowledgeService.activateDirectoryCatalog("teacher-1", catalogB.id);
      expect(
        (appState.directoryCatalogs as DirectoryCatalog[]).filter(
          (item) => item.isActive,
        ),
      ).toHaveLength(1);
      expect((appState.questions as Question[])[0].chapterIds).toEqual([
        chapterB.id,
      ]);
    });
  });
});
