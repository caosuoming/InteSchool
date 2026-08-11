import type { ResourceFolder, ResourceFolderType } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function removeFromSiblingFolders(
  folders: ResourceFolder[],
  target: Pick<ResourceFolder, "id" | "teacherId" | "resourceType">,
  resourceIds: Set<string>,
): ResourceFolder[] {
  const now = new Date().toISOString();
  return folders.map((folder) => {
    if (
      folder.id === target.id
      || folder.teacherId !== target.teacherId
      || folder.resourceType !== target.resourceType
    ) return folder;
    const nextIds = folder.resourceIds.filter((id) => !resourceIds.has(id));
    return nextIds.length === folder.resourceIds.length
      ? folder
      : { ...folder, resourceIds: nextIds, updatedAt: now };
  });
}

export const resourceFolderService = {
  async listFolders(teacherId: string, resourceType: ResourceFolderType): Promise<ResourceFolder[]> {
    await delay(80);
    return db
      .read("resourceFolders")
      .filter((folder) => folder.teacherId === teacherId && folder.resourceType === resourceType)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  },

  async createFolder(
    teacherId: string,
    schoolId: string,
    resourceType: ResourceFolderType,
    name: string,
    resourceIds: string[],
  ): Promise<ResourceFolder> {
    await delay(120);
    maybeThrowError();
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("专辑名称不能为空");
    const now = new Date().toISOString();
    const folder: ResourceFolder = {
      id: genId("folder"),
      teacherId,
      schoolId,
      resourceType,
      name: trimmedName,
      resourceIds: uniqueIds(resourceIds),
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    db.update("resourceFolders", (list) => {
      const cleaned = removeFromSiblingFolders(list, folder, new Set(folder.resourceIds));
      return [...cleaned, folder];
    });
    return folder;
  },

  async updateFolder(
    id: string,
    patch: Pick<Partial<ResourceFolder>, "name" | "pinned">,
  ): Promise<ResourceFolder> {
    await delay(80);
    let updated: ResourceFolder | null = null;
    db.update("resourceFolders", (list) => list.map((folder) => {
      if (folder.id !== id) return folder;
      const name = patch.name === undefined ? folder.name : patch.name.trim();
      if (!name) throw new Error("专辑名称不能为空");
      updated = {
        ...folder,
        ...patch,
        name,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    }));
    if (!updated) throw new Error("专辑不存在");
    return updated;
  },

  async deleteFolder(id: string): Promise<void> {
    await delay(80);
    db.update("resourceFolders", (list) => list.filter((folder) => folder.id !== id));
  },

  async moveResources(folderId: string, resourceIds: string[]): Promise<ResourceFolder> {
    await delay(100);
    const additions = uniqueIds(resourceIds);
    let target: ResourceFolder | null = null;
    db.update("resourceFolders", (list) => {
      const found = list.find((folder) => folder.id === folderId);
      if (!found) throw new Error("专辑不存在");
      const cleaned = removeFromSiblingFolders(list, found, new Set(additions));
      const now = new Date().toISOString();
      return cleaned.map((folder) => {
        if (folder.id !== folderId) return folder;
        target = {
          ...folder,
          resourceIds: uniqueIds([...folder.resourceIds, ...additions]),
          updatedAt: now,
        };
        return target;
      });
    });
    if (!target) throw new Error("专辑不存在");
    return target;
  },

  async removeResource(folderId: string, resourceId: string): Promise<ResourceFolder> {
    await delay(80);
    let updated: ResourceFolder | null = null;
    db.update("resourceFolders", (list) => list.map((folder) => {
      if (folder.id !== folderId) return folder;
      updated = {
        ...folder,
        resourceIds: folder.resourceIds.filter((id) => id !== resourceId),
        updatedAt: new Date().toISOString(),
      };
      return updated;
    }));
    if (!updated) throw new Error("专辑不存在");
    return updated;
  },

  async reorderResources(folderId: string, resourceIds: string[]): Promise<ResourceFolder> {
    await delay(80);
    let updated: ResourceFolder | null = null;
    db.update("resourceFolders", (list) => list.map((folder) => {
      if (folder.id !== folderId) return folder;
      const nextIds = uniqueIds(resourceIds);
      if (
        nextIds.length !== folder.resourceIds.length
        || nextIds.some((id) => !folder.resourceIds.includes(id))
      ) throw new Error("排序列表与专辑内容不一致");
      updated = { ...folder, resourceIds: nextIds, updatedAt: new Date().toISOString() };
      return updated;
    }));
    if (!updated) throw new Error("专辑不存在");
    return updated;
  },

  async removeResourceFromAll(
    teacherId: string,
    resourceType: ResourceFolderType,
    resourceId: string,
  ): Promise<void> {
    await delay(50);
    const now = new Date().toISOString();
    db.update("resourceFolders", (list) => list.map((folder) => {
      if (
        folder.teacherId !== teacherId
        || folder.resourceType !== resourceType
        || !folder.resourceIds.includes(resourceId)
      ) return folder;
      return {
        ...folder,
        resourceIds: folder.resourceIds.filter((id) => id !== resourceId),
        updatedAt: now,
      };
    }));
  },
};
