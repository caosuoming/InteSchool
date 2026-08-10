import { rpcCall } from "./api";
import type { ResourceFolder, ResourceFolderType } from "@/types";

export const resourceFolderService = {
  async listFolders(teacherId: string, resourceType: ResourceFolderType): Promise<ResourceFolder[]> {
    return rpcCall("resourceFolder", "listFolders", [teacherId, resourceType]) as any;
  },

  async createFolder(
    teacherId: string,
    schoolId: string,
    resourceType: ResourceFolderType,
    name: string,
    resourceIds: string[],
  ): Promise<ResourceFolder> {
    return rpcCall("resourceFolder", "createFolder", [teacherId, schoolId, resourceType, name, resourceIds]) as any;
  },

  async updateFolder(
    id: string,
    patch: Pick<Partial<ResourceFolder>, "name" | "pinned">,
  ): Promise<ResourceFolder> {
    return rpcCall("resourceFolder", "updateFolder", [id, patch]) as any;
  },

  async deleteFolder(id: string): Promise<void> {
    return rpcCall("resourceFolder", "deleteFolder", [id]) as any;
  },

  async moveResources(folderId: string, resourceIds: string[]): Promise<ResourceFolder> {
    return rpcCall("resourceFolder", "moveResources", [folderId, resourceIds]) as any;
  },

  async removeResource(folderId: string, resourceId: string): Promise<ResourceFolder> {
    return rpcCall("resourceFolder", "removeResource", [folderId, resourceId]) as any;
  },

  async reorderResources(folderId: string, resourceIds: string[]): Promise<ResourceFolder> {
    return rpcCall("resourceFolder", "reorderResources", [folderId, resourceIds]) as any;
  },

  async removeResourceFromAll(
    teacherId: string,
    resourceType: ResourceFolderType,
    resourceId: string,
  ): Promise<void> {
    return rpcCall("resourceFolder", "removeResourceFromAll", [teacherId, resourceType, resourceId]) as any;
  },
};
