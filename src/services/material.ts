import { rpcCall } from "./api";

import type {
  Material,
  MaterialType,
  QuestionVideoReference,
  ResourceFilter,
  ResourceSemester,
} from "@/types";

export interface MaterialInput {
  title: string;
  description?: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  semester?: ResourceSemester;
  type: MaterialType;
  content: string;
  fileUrl?: string;
  fileSize?: number;
  explanationVideo?: QuestionVideoReference | null;
  tags: string[];
}

export const materialService = {
  async listMaterials(filter: ResourceFilter = {}): Promise<Material[]> {
    return rpcCall("material", "listMaterials", [filter]) as any;
  },

  async getMaterial(id: string): Promise<Material | null> {
    return rpcCall("material", "getMaterial", [id]) as any;
  },

  async createMaterial(teacherId: string, schoolId: string, input: MaterialInput): Promise<Material> {
    return rpcCall("material", "createMaterial", [teacherId, schoolId, input]) as any;
  },

  async updateMaterial(id: string, patch: Partial<Material>): Promise<Material> {
    return rpcCall("material", "updateMaterial", [id, patch]) as any;
  },

  async deleteMaterial(id: string): Promise<void> {
    return rpcCall("material", "deleteMaterial", [id]) as any;
  },

  async checkKnowledgeBlockDuplicate(title: string, content: string, schoolId?: string): Promise<Material[]> {
    return rpcCall("material", "checkKnowledgeBlockDuplicate", [title, content, schoolId]) as any;
  }
};
