import { rpcCall } from "./api";

import type { Chapter, KnowledgePoint, TreeNode } from "@/types";

export const knowledgeService = {
  async listChapters(schoolId: string): Promise<Chapter[]> {
    return rpcCall("knowledge", "listChapters", [schoolId]) as any;
  },

  async listKnowledgePoints(schoolId: string): Promise<KnowledgePoint[]> {
    return rpcCall("knowledge", "listKnowledgePoints", [schoolId]) as any;
  },

  async getAliasIds(knowledgePointId: string, schoolId: string): Promise<string[]> {
    return rpcCall("knowledge", "getAliasIds", [knowledgePointId, schoolId]);
  },

  async getChapterTree(schoolId: string): Promise<TreeNode> {
    return rpcCall("knowledge", "getChapterTree", [schoolId]) as any;
  },

  async getKnowledgeTree(schoolId: string): Promise<TreeNode> {
    return rpcCall("knowledge", "getKnowledgeTree", [schoolId]) as any;
  },

  async addChapter(schoolId: string, parentId: string | null, name: string): Promise<Chapter> {
    return rpcCall("knowledge", "addChapter", [schoolId, parentId, name]) as any;
  },

  async addKnowledgePoint(schoolId: string, parentId: string | null, name: string, questionCount: number = 0): Promise<KnowledgePoint> {
    return rpcCall("knowledge", "addKnowledgePoint", [schoolId, parentId, name, questionCount]) as any;
  },

  async getChapterPath(chapterId: string): Promise<string> {
    return rpcCall("knowledge", "getChapterPath", [chapterId]);
  },

  async getKnowledgePath(knowledgeId: string): Promise<string> {
    return rpcCall("knowledge", "getKnowledgePath", [knowledgeId]);
  },

  async renameNode(id: string, type: "chapter" | "knowledge", newName: string): Promise<void> {
    return rpcCall("knowledge", "renameNode", [id, type, newName]) as any;
  },

  async deleteNode(id: string, type: "chapter" | "knowledge"): Promise<void> {
    return rpcCall("knowledge", "deleteNode", [id, type]) as any;
  },

  async moveNode(id: string, type: "chapter" | "knowledge", newParentId: string | null): Promise<void> {
    return rpcCall("knowledge", "moveNode", [id, type, newParentId]) as any;
  },

  async reorderSiblings(ids: string[], type: "chapter" | "knowledge"): Promise<void> {
    return rpcCall("knowledge", "reorderSiblings", [ids, type]) as any;
  }
};
