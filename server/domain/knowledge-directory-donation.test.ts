import { describe, expect, it } from "vitest";
import type {
  AppState,
} from "../types.js";
import type {
  Chapter,
  DirectoryCatalog,
  DirectoryDonation,
  KnowledgePoint,
} from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { knowledgeService } from "./knowledge.js";

function teacher(id: string, schoolId: string, subject: string, nickname: string) {
  return {
    id,
    schoolId,
    subject,
    nickname,
    name: nickname,
    affiliations: [{
      id: `${id}-affiliation`,
      schoolId,
      subject,
      isCurrent: true,
    }],
    currentAffiliationId: `${id}-affiliation`,
  } as any;
}

function state(): AppState {
  return {
    teachers: [
      teacher("teacher-a", "school-a", "数学", "甲老师"),
      teacher("teacher-b", "school-b", "数学", "乙老师"),
      teacher("teacher-c", "school-c", "物理", "丙老师"),
    ],
    currentTeacherId: null,
    chapters: [
      {
        id: "a-chapter-root",
        schoolId: "school-a",
        parentId: null,
        name: "必修一",
        order: 1,
        level: 0,
      },
      {
        id: "b-chapter-local",
        schoolId: "school-b",
        parentId: null,
        name: "本地目录",
        order: 1,
        level: 0,
      },
    ] satisfies Chapter[],
    knowledgePoints: [
      {
        id: "a-knowledge-root",
        schoolId: "school-a",
        parentId: null,
        name: "集合",
        description: "集合基础",
        order: 1,
        level: 0,
      },
    ] satisfies KnowledgePoint[],
    questions: [],
    directoryCatalogs: [],
    directoryDonations: [],
  } as AppState;
}

describe("knowledge directory donations", () => {
  it("overwrites repeated donations and only exposes them to the same subject", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const firstChapter = await knowledgeService.donateDirectory("teacher-a", "chapter");
      const firstKnowledge = await knowledgeService.donateDirectory("teacher-a", "knowledge");

      appState.chapters = (appState.chapters as Chapter[]).map((item) =>
        item.id === "a-chapter-root" ? { ...item, name: "必修一（修订）" } : item,
      );
      appState.knowledgePoints = (appState.knowledgePoints as KnowledgePoint[]).map((item) =>
        item.id === "a-knowledge-root" ? { ...item, description: "集合修订说明" } : item,
      );

      const secondChapter = await knowledgeService.donateDirectory("teacher-a", "chapter");
      const secondKnowledge = await knowledgeService.donateDirectory("teacher-a", "knowledge");

      expect(secondChapter.replaced).toBe(true);
      expect(secondChapter.donation.id).toBe(firstChapter.donation.id);
      expect(secondChapter.donation.nodes[0].name).toBe("必修一（修订）");
      expect(secondKnowledge.replaced).toBe(true);
      expect(secondKnowledge.donation.id).toBe(firstKnowledge.donation.id);
      expect(secondKnowledge.donation.nodes[0].description).toBe("集合修订说明");

      const stored = appState.directoryDonations as DirectoryDonation[];
      expect(stored).toHaveLength(2);
      expect(await knowledgeService.listDirectoryDonations("teacher-b", "chapter")).toHaveLength(1);
      expect(await knowledgeService.listDirectoryDonations("teacher-c", "chapter")).toEqual([]);
    });
  });

  it("accepts a donation as an independent catalog and switches without following later donor updates", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const { donation } = await knowledgeService.donateDirectory("teacher-a", "chapter");
      const accepted = await knowledgeService.acceptDirectoryDonation("teacher-b", donation.id, "new");

      expect(accepted.isActive).toBe(true);
      expect((appState.chapters as Chapter[]).filter((item) => item.schoolId === "school-b").map((item) => item.name))
        .toEqual(["必修一"]);

      const catalogsAfterAccept = await knowledgeService.listDirectoryCatalogs("teacher-b", "chapter");
      expect(catalogsAfterAccept).toHaveLength(2);
      const defaultCatalog = catalogsAfterAccept.find((item) => item.id !== accepted.id)!;
      expect(defaultCatalog.name).toBe("默认章节课目录");

      appState.chapters = (appState.chapters as Chapter[]).map((item) =>
        item.id === "a-chapter-root" ? { ...item, name: "捐赠者后续版本" } : item,
      );
      const updatedDonation = await knowledgeService.donateDirectory("teacher-a", "chapter");
      expect(updatedDonation.replaced).toBe(true);

      expect((appState.chapters as Chapter[]).filter((item) => item.schoolId === "school-b").map((item) => item.name))
        .toEqual(["必修一"]);

      await knowledgeService.activateDirectoryCatalog("teacher-b", defaultCatalog.id);
      expect((appState.chapters as Chapter[]).filter((item) => item.schoolId === "school-b").map((item) => item.name))
        .toEqual(["本地目录"]);

      await knowledgeService.activateDirectoryCatalog("teacher-b", accepted.id);
      expect((appState.chapters as Chapter[]).filter((item) => item.schoolId === "school-b").map((item) => item.name))
        .toEqual(["必修一"]);
    });
  });

  it("merges an accepted donation into the active catalog while preserving existing node ids", async () => {
    const appState = state();
    appState.chapters = [
      {
        id: "a-parent",
        schoolId: "school-a",
        parentId: null,
        name: "必修一",
        order: 1,
        level: 0,
      },
      {
        id: "a-function",
        schoolId: "school-a",
        parentId: "a-parent",
        name: "函数",
        order: 1,
        level: 1,
      },
      {
        id: "b-parent",
        schoolId: "school-b",
        parentId: null,
        name: "必修一",
        order: 1,
        level: 0,
      },
      {
        id: "b-set",
        schoolId: "school-b",
        parentId: "b-parent",
        name: "集合",
        order: 1,
        level: 1,
      },
    ] satisfies Chapter[];

    await runWithState(appState, async () => {
      const { donation } = await knowledgeService.donateDirectory("teacher-a", "chapter");
      const before = await knowledgeService.listDirectoryCatalogs("teacher-b", "chapter");
      expect(before).toHaveLength(1);

      const mergedCatalog = await knowledgeService.acceptDirectoryDonation("teacher-b", donation.id, "merge");
      const schoolB = (appState.chapters as Chapter[]).filter((item) => item.schoolId === "school-b");
      expect(schoolB.find((item) => item.name === "必修一")?.id).toBe("b-parent");
      expect(schoolB.find((item) => item.name === "集合")?.id).toBe("b-set");
      expect(schoolB.find((item) => item.name === "函数")?.parentId).toBe("b-parent");

      const catalogs = appState.directoryCatalogs as DirectoryCatalog[];
      expect(catalogs.filter((item) => item.schoolId === "school-b" && item.type === "chapter")).toHaveLength(1);
      expect(catalogs.find((item) => item.id === mergedCatalog.id)?.nodes.map((item) => item.name))
        .toEqual(["必修一", "集合", "函数"]);
    });
  });
});
