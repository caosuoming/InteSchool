import { rpcCall } from "./api";

import type { SubjectGroup, PrepGroup, Teacher, TeacherRole } from "@/types";

export const roleLabels: Record<TeacherRole, string> = {
  teacher: "教师",
  headTeacher: "班主任",
  gradeLeader: "年级组长",
  subjectLeader: "学科组长",
  prepLeader: "备课组长",
  dean: "教务主任",
  vicePrincipal: "副校长",
  principal: "校长",
};

export const roleBadgeVariants: Record<TeacherRole, "ink" | "gold" | "teal" | "blue" | "purple" | "red"> = {
  teacher: "ink",
  headTeacher: "teal",
  prepLeader: "teal",
  subjectLeader: "blue",
  gradeLeader: "purple",
  dean: "gold",
  vicePrincipal: "red",
  principal: "red",
};

export function canManage(
  roles: TeacherRole[],
  level: "personal" | "prep" | "subject" | "grade" | "school",
): boolean {
  if (roles.includes("principal") || roles.includes("vicePrincipal") || roles.includes("dean")) return true;
  if (level === "personal") return true;
  if (level === "prep" && roles.includes("prepLeader")) return true;
  if (level === "subject" && roles.includes("subjectLeader")) return true;
  if (level === "grade" && roles.includes("gradeLeader")) return true;
  return false;
}

export const organizationService = {
  async listSubjectGroups(schoolId: string): Promise<SubjectGroup[]> {
    return rpcCall("organization", "listSubjectGroups", [schoolId]) as any;
  },

  async getSubjectGroup(id: string): Promise<SubjectGroup | null> {
    return rpcCall("organization", "getSubjectGroup", [id]) as any;
  },

  async createSubjectGroup(schoolId: string, data: { name: string; subject: string; description?: string; leaderId?: string }): Promise<SubjectGroup> {
    return rpcCall("organization", "createSubjectGroup", [schoolId, data]) as any;
  },

  async updateSubjectGroup(id: string, patch: Partial<SubjectGroup>): Promise<void> {
    return rpcCall("organization", "updateSubjectGroup", [id, patch]) as any;
  },

  async deleteSubjectGroup(id: string): Promise<void> {
    return rpcCall("organization", "deleteSubjectGroup", [id]) as any;
  },

  async addMember(groupId: string, teacherId: string): Promise<void> {
    return rpcCall("organization", "addMember", [groupId, teacherId]) as any;
  },

  async removeMember(groupId: string, teacherId: string): Promise<void> {
    return rpcCall("organization", "removeMember", [groupId, teacherId]) as any;
  },

  async listPrepGroups(schoolId: string, subjectGroupId?: string): Promise<PrepGroup[]> {
    return rpcCall("organization", "listPrepGroups", [schoolId, subjectGroupId]) as any;
  },

  async getPrepGroup(id: string): Promise<PrepGroup | null> {
    return rpcCall("organization", "getPrepGroup", [id]) as any;
  },

  async createPrepGroup(schoolId: string, data: {
      subjectGroupId: string;
      name: string;
      grade: string;
      description?: string;
      leaderId?: string;
    }): Promise<PrepGroup> {
    return rpcCall("organization", "createPrepGroup", [schoolId, data]) as any;
  },

  async updatePrepGroup(id: string, patch: Partial<PrepGroup>): Promise<void> {
    return rpcCall("organization", "updatePrepGroup", [id, patch]) as any;
  },

  async deletePrepGroup(id: string): Promise<void> {
    return rpcCall("organization", "deletePrepGroup", [id]) as any;
  },

  async addPrepMember(groupId: string, teacherId: string): Promise<void> {
    return rpcCall("organization", "addPrepMember", [groupId, teacherId]) as any;
  },

  async removePrepMember(groupId: string, teacherId: string): Promise<void> {
    return rpcCall("organization", "removePrepMember", [groupId, teacherId]) as any;
  },

  async updateTeacherRoles(teacherId: string, roles: TeacherRole[]): Promise<void> {
    return rpcCall("organization", "updateTeacherRoles", [teacherId, roles]) as any;
  },

  async listTeachers(schoolId: string): Promise<Teacher[]> {
    return rpcCall("organization", "listTeachers", [schoolId]) as any;
  }
};
