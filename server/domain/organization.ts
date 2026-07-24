import type { SubjectGroup, PrepGroup, Teacher, TeacherRole } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";

// ============ 组织架构服务 ============

/** 角色中文标签 */
export const roleLabels: Record<TeacherRole, string> = {
  teacher: "教师",
  gradeLeader: "年级组长",
  subjectLeader: "学科组长",
  prepLeader: "备课组长",
  dean: "教务主任",
  principal: "校长",
};

/** 角色颜色（用于 Badge） */
export const roleBadgeVariants: Record<TeacherRole, "ink" | "gold" | "teal" | "blue" | "purple" | "red"> = {
  teacher: "ink",
  prepLeader: "teal",
  subjectLeader: "blue",
  gradeLeader: "purple",
  dean: "gold",
  principal: "red",
};

/** 权限检查：某角色是否可管理指定层级的资源 */
export function canManage(
  roles: TeacherRole[],
  level: "personal" | "prep" | "subject" | "grade" | "school",
): boolean {
  if (roles.includes("principal") || roles.includes("dean")) return true;
  if (level === "personal") return true;
  if (level === "prep" && roles.includes("prepLeader")) return true;
  if (level === "subject" && roles.includes("subjectLeader")) return true;
  if (level === "grade" && roles.includes("gradeLeader")) return true;
  return false;
}

export const organizationService = {
  // ============ 学科组 ============

  async listSubjectGroups(schoolId: string): Promise<SubjectGroup[]> {
    await delay(200);
    return db
      .read("subjectGroups")
      .filter((g) => g.schoolId === schoolId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getSubjectGroup(id: string): Promise<SubjectGroup | null> {
    await delay(150);
    return db.read("subjectGroups").find((g) => g.id === id) || null;
  },

  async createSubjectGroup(
    schoolId: string,
    data: { name: string; subject: string; description?: string; leaderId?: string },
  ): Promise<SubjectGroup> {
    await delay(300);
    const group: SubjectGroup = {
      id: genId("sg"),
      schoolId,
      name: data.name,
      subject: data.subject,
      leaderId: data.leaderId || null,
      memberIds: data.leaderId ? [data.leaderId] : [],
      description: data.description,
      createdAt: new Date().toISOString(),
    };
    db.update("subjectGroups", (list) => [...list, group]);
    // 同步教师信息
    if (data.leaderId) {
      db.update("teachers", (list) =>
        list.map((t) =>
          t.id === data.leaderId
            ? {
                ...t,
                subjectGroupIds: [...new Set([...t.subjectGroupIds, group.id])],
                roles: [...new Set([...t.roles, "subjectLeader" as TeacherRole])],
              }
            : t,
        ),
      );
    }
    return group;
  },

  async updateSubjectGroup(id: string, patch: Partial<SubjectGroup>): Promise<void> {
    await delay(200);
    db.update("subjectGroups", (list) =>
      list.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  },

  async deleteSubjectGroup(id: string): Promise<void> {
    await delay(200);
    db.update("subjectGroups", (list) => list.filter((g) => g.id !== id));
    // 同步移除教师中的引用
    db.update("teachers", (list) =>
      list.map((t) => ({
        ...t,
        subjectGroupIds: t.subjectGroupIds.filter((sid) => sid !== id),
      })),
    );
    // 同时删除该组下的备课组
    const preps = db.read("prepGroups").filter((p) => p.subjectGroupId === id);
    db.update("prepGroups", (list) => list.filter((p) => p.subjectGroupId !== id));
    // 清理备课组教师引用
    for (const p of preps) {
      db.update("teachers", (list) =>
        list.map((t) => ({
          ...t,
          prepGroupIds: t.prepGroupIds.filter((pid) => pid !== p.id),
        })),
      );
    }
  },

  async addMember(groupId: string, teacherId: string): Promise<void> {
    await delay(200);
    db.update("subjectGroups", (list) =>
      list.map((g) =>
        g.id === groupId && !g.memberIds.includes(teacherId)
          ? { ...g, memberIds: [...g.memberIds, teacherId] }
          : g,
      ),
    );
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId && !t.subjectGroupIds.includes(groupId)
          ? { ...t, subjectGroupIds: [...t.subjectGroupIds, groupId] }
          : t,
      ),
    );
  },

  async removeMember(groupId: string, teacherId: string): Promise<void> {
    await delay(200);
    db.update("subjectGroups", (list) =>
      list.map((g) =>
        g.id === groupId
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== teacherId) }
          : g,
      ),
    );
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, subjectGroupIds: t.subjectGroupIds.filter((id) => id !== groupId) }
          : t,
      ),
    );
  },

  // ============ 备课组 ============

  async listPrepGroups(schoolId: string, subjectGroupId?: string): Promise<PrepGroup[]> {
    await delay(200);
    return db
      .read("prepGroups")
      .filter((p) => p.schoolId === schoolId && (!subjectGroupId || p.subjectGroupId === subjectGroupId))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getPrepGroup(id: string): Promise<PrepGroup | null> {
    await delay(150);
    return db.read("prepGroups").find((g) => g.id === id) || null;
  },

  async createPrepGroup(
    schoolId: string,
    data: {
      subjectGroupId: string;
      name: string;
      grade: string;
      description?: string;
      leaderId?: string;
    },
  ): Promise<PrepGroup> {
    await delay(300);
    const group: PrepGroup = {
      id: genId("pg"),
      schoolId,
      subjectGroupId: data.subjectGroupId,
      name: data.name,
      grade: data.grade,
      leaderId: data.leaderId || null,
      memberIds: data.leaderId ? [data.leaderId] : [],
      description: data.description,
      createdAt: new Date().toISOString(),
    };
    db.update("prepGroups", (list) => [...list, group]);
    if (data.leaderId) {
      db.update("teachers", (list) =>
        list.map((t) =>
          t.id === data.leaderId
            ? {
                ...t,
                prepGroupIds: [...new Set([...t.prepGroupIds, group.id])],
                roles: [...new Set([...t.roles, "prepLeader" as TeacherRole])],
              }
            : t,
        ),
      );
    }
    return group;
  },

  async updatePrepGroup(id: string, patch: Partial<PrepGroup>): Promise<void> {
    await delay(200);
    db.update("prepGroups", (list) =>
      list.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  },

  async deletePrepGroup(id: string): Promise<void> {
    await delay(200);
    db.update("prepGroups", (list) => list.filter((g) => g.id !== id));
    db.update("teachers", (list) =>
      list.map((t) => ({
        ...t,
        prepGroupIds: t.prepGroupIds.filter((pid) => pid !== id),
      })),
    );
  },

  async addPrepMember(groupId: string, teacherId: string): Promise<void> {
    await delay(200);
    db.update("prepGroups", (list) =>
      list.map((g) =>
        g.id === groupId && !g.memberIds.includes(teacherId)
          ? { ...g, memberIds: [...g.memberIds, teacherId] }
          : g,
      ),
    );
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId && !t.prepGroupIds.includes(groupId)
          ? { ...t, prepGroupIds: [...t.prepGroupIds, groupId] }
          : t,
      ),
    );
  },

  async removePrepMember(groupId: string, teacherId: string): Promise<void> {
    await delay(200);
    db.update("prepGroups", (list) =>
      list.map((g) =>
        g.id === groupId
          ? { ...g, memberIds: g.memberIds.filter((id) => id !== teacherId) }
          : g,
      ),
    );
    db.update("teachers", (list) =>
      list.map((t) =>
        t.id === teacherId
          ? { ...t, prepGroupIds: t.prepGroupIds.filter((id) => id !== groupId) }
          : t,
      ),
    );
  },

  // ============ 教师角色管理 ============

  async updateTeacherRoles(teacherId: string, roles: TeacherRole[]): Promise<void> {
    await delay(200);
    db.update("teachers", (list) =>
      list.map((t) => (t.id === teacherId ? { ...t, roles } : t)),
    );
  },

  // 获取学校下所有教师
  async listTeachers(schoolId: string): Promise<Teacher[]> {
    await delay(200);
    return db.read("teachers").filter((t) => t.schoolId === schoolId);
  },
};
