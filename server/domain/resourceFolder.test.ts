import { describe, expect, it } from "vitest";
import type { ResourceFolder } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { resourceFolderService } from "./resourceFolder.js";

function state(resourceFolders: ResourceFolder[] = []): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    resourceFolders,
  };
}

describe("resource folder persistence", () => {
  it("moves documents between folders and preserves manual order", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const first = await resourceFolderService.createFolder(
        "teacher-1",
        "school-1",
        "examPaper",
        "月考",
        ["paper-1", "paper-2"],
      );
      const second = await resourceFolderService.createFolder(
        "teacher-1",
        "school-1",
        "examPaper",
        "期中",
        ["paper-3"],
      );

      await resourceFolderService.moveResources(second.id, ["paper-2"]);
      await resourceFolderService.reorderResources(second.id, ["paper-2", "paper-3"]);

      const folders = await resourceFolderService.listFolders("teacher-1", "examPaper");
      expect(folders.find((folder) => folder.id === first.id)?.resourceIds).toEqual(["paper-1"]);
      expect(folders.find((folder) => folder.id === second.id)?.resourceIds).toEqual(["paper-2", "paper-3"]);
    });
  });

  it("pins folders first and deleting a folder keeps documents independent", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const first = await resourceFolderService.createFolder(
        "teacher-1",
        "school-1",
        "lecture",
        "第一章",
        ["lecture-1"],
      );
      const second = await resourceFolderService.createFolder(
        "teacher-1",
        "school-1",
        "lecture",
        "第二章",
        ["lecture-2"],
      );

      await resourceFolderService.updateFolder(second.id, { pinned: true, name: "重点章节" });
      expect((await resourceFolderService.listFolders("teacher-1", "lecture")).map((folder) => folder.id))
        .toEqual([second.id, first.id]);

      await resourceFolderService.deleteFolder(second.id);
      expect(await resourceFolderService.listFolders("teacher-1", "lecture"))
        .toEqual([expect.objectContaining({ id: first.id, resourceIds: ["lecture-1"] })]);
    });
  });
});
