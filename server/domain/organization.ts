import type {
  OrganizationDepartment,
  PrepGroup,
  SubjectGroup,
  Teacher,
  TeacherAffiliation,
  TeacherRole,
} from "../../src/types/index.js";
import { isTeacherRole, normalizeTeacherRoles } from "../../src/lib/teacher-roles.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";

// ============ 组织架构服务 ============

/** 角色中文标签 */
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

/** 角色颜色（用于 Badge） */
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

/** 权限检查：某角色是否可管理指定层级的资源 */
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

function departments(): OrganizationDepartment[] {
  return (db.read("organizationDepartments") || []) as OrganizationDepartment[];
}

function normalizeGrantedRoles(roles: readonly unknown[]): TeacherRole[] {
  if (!roles.every(isTeacherRole)) {
    throw new Error("包含不支持的教师角色");
  }
  return normalizeTeacherRoles(roles);
}

function teacherAffiliation(teacher: Teacher, schoolId: string): TeacherAffiliation | null {
  return teacher.affiliations.find((affiliation) => affiliation.schoolId === schoolId) || null;
}

function assignedRoles(affiliation: TeacherAffiliation): TeacherRole[] {
  return normalizeGrantedRoles(affiliation.assignedRoles?.length ? affiliation.assignedRoles : affiliation.roles);
}

function inheritedDepartmentRoles(schoolId: string, teacherId: string): TeacherRole[] {
  return departments()
    .filter((department) => department.schoolId === schoolId && department.leaderId === teacherId)
    .flatMap((department) => department.roles);
}

function effectiveRoles(schoolId: string, teacherId: string, directRoles: TeacherRole[]): TeacherRole[] {
  return normalizeTeacherRoles([...directRoles, ...inheritedDepartmentRoles(schoolId, teacherId)]);
}

function syncTeacherEffectiveRoles(schoolId: string): void {
  db.update("teachers", (list: Teacher[]) => list.map((teacher) => {
    const affiliation = teacherAffiliation(teacher, schoolId);
    if (!affiliation) return teacher;
    const directRoles = assignedRoles(affiliation);
    const roles = effectiveRoles(schoolId, teacher.id, directRoles);
    const affiliations = teacher.affiliations.map((item) => item.id === affiliation.id
      ? { ...item, assignedRoles: directRoles, roles }
      : item);
    const isCurrent = affiliation.id === teacher.currentAffiliationId || affiliation.isCurrent;
    return {
      ...teacher,
      ...(isCurrent ? { roles } : {}),
      affiliations,
    };
  }));
}

function validateDepartmentReference(
  schoolId: string,
  parentId?: string | null,
  leaderId?: string | null,
  selfId?: string,
): void {
  if (parentId) {
    const parent = departments().find((item) => item.id === parentId && item.schoolId === schoolId);
    if (!parent) throw new Error("上级部门不存在");
    if (parent.id === selfId) throw new Error("部门不能作为自己的上级部门");
    let cursor: OrganizationDepartment | undefined = parent;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor.id === selfId) throw new Error("部门层级不能形成循环");
      if (visited.has(cursor.id)) break;
      visited.add(cursor.id);
      cursor = cursor.parentId ? departments().find((item) => item.id === cursor?.parentId) : undefined;
    }
  }
  if (leaderId) {
    const teacher = (db.read("teachers") as Teacher[]).find((item) => item.id === leaderId);
    if (!teacher || !teacherAffiliation(teacher, schoolId)) throw new Error("部门负责人必须是本校教师");
  }
}

export const organizationService = {
  // ============ 自定义部门 ============

  async listDepartments(schoolId: string): Promise<OrganizationDepartment[]> {
    await delay(100);
    return departments()
      .filter((department) => department.schoolId === schoolId)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  },

  async createDepartment(
    schoolId: string,
    data: {
      name: string;
      parentId?: string;
      grade?: string;
      leaderId?: string;
      roles?: TeacherRole[];
      description?: string;
    },
  ): Promise<OrganizationDepartment> {
    await delay(100);
    const name = data.name.trim();
    if (!name) throw new Error("请填写部门名称");
    validateDepartmentReference(schoolId, data.parentId, data.leaderId);
    const department: OrganizationDepartment = {
      id: genId("dept"),
      schoolId,
      name,
      parentId: data.parentId || null,
      grade: data.grade?.trim() || undefined,
      leaderId: data.leaderId || null,
      roles: normalizeGrantedRoles(data.roles || ["teacher"]).filter((role) => role !== "teacher"),
      description: data.description?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    db.update("organizationDepartments", (list: OrganizationDepartment[] | undefined) => [...(list || []), department]);
    syncTeacherEffectiveRoles(schoolId);
    return department;
  },

  async updateDepartment(id: string, patch: Partial<OrganizationDepartment>): Promise<void> {
    await delay(100);
    const current = departments().find((department) => department.id === id);
    if (!current) throw new Error("部门不存在");
    const nextName = patch.name === undefined ? current.name : patch.name.trim();
    if (!nextName) throw new Error("请填写部门名称");
    const nextParentId = patch.parentId === undefined ? current.parentId : patch.parentId;
    const nextLeaderId = patch.leaderId === undefined ? current.leaderId : patch.leaderId;
    validateDepartmentReference(current.schoolId, nextParentId, nextLeaderId, current.id);
    db.update("organizationDepartments", (list: OrganizationDepartment[]) => list.map((department) => department.id === id
      ? {
          ...department,
          name: nextName,
          parentId: nextParentId || null,
          grade: patch.grade === undefined ? department.grade : patch.grade?.trim() || undefined,
          leaderId: nextLeaderId || null,
          roles: patch.roles === undefined
            ? department.roles
            : normalizeGrantedRoles(patch.roles).filter((role) => role !== "teacher"),
          description: patch.description === undefined
            ? department.description
            : patch.description?.trim() || undefined,
        }
      : department));
    syncTeacherEffectiveRoles(current.schoolId);
  },

  async deleteDepartment(id: string): Promise<void> {
    await delay(100);
    const current = departments().find((department) => department.id === id);
    if (!current) return;
    db.update("organizationDepartments", (list: OrganizationDepartment[]) => list
      .filter((department) => department.id !== id)
      .map((department) => department.parentId === id ? { ...department, parentId: null } : department));
    syncTeacherEffectiveRoles(current.schoolId);
  },

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

  async updateTeacherRoles(teacherId: string, schoolId: string, roles: TeacherRole[]): Promise<void> {
    await delay(200);
    const target = (db.read("teachers") as Teacher[]).find((teacher) => teacher.id === teacherId);
    if (!target || !teacherAffiliation(target, schoolId)) throw new Error("教师不属于该学校");
    const directRoles = normalizeGrantedRoles(roles);
    db.update("teachers", (list: Teacher[]) =>
      list.map((t) => {
        if (t.id !== teacherId) return t;
        const affiliations = t.affiliations.map((affiliation) =>
          affiliation.schoolId === schoolId
            ? {
                ...affiliation,
                assignedRoles: directRoles,
                roles: effectiveRoles(schoolId, teacherId, directRoles),
              }
            : affiliation,
        );
        const active = affiliations.find((affiliation) => affiliation.id === t.currentAffiliationId)
          || affiliations.find((affiliation) => affiliation.isCurrent);
        return {
          ...t,
          ...(active?.schoolId === schoolId ? { roles: active.roles } : {}),
          affiliations,
        };
      }),
    );
  },

  async setTeacherSchoolRole(
    teacherId: string,
    schoolId: string,
    role: "teacher" | "school_admin",
  ): Promise<void> {
    await delay(100);
    if (role !== "teacher" && role !== "school_admin") throw new Error("不支持的学校账号权限");
    const targetTeacher = (db.read("teachers") as Teacher[]).find((teacher) => teacher.id === teacherId);
    if (!targetTeacher || !teacherAffiliation(targetTeacher, schoolId)) throw new Error("教师不属于该学校");
    db.update("teachers", (list: Teacher[]) => list.map((teacher) => {
      if (teacher.id !== teacherId) return teacher;
      const target = teacherAffiliation(teacher, schoolId);
      if (!target) return teacher;
      const affiliations = teacher.affiliations.map((affiliation) => affiliation.id === target.id
        ? { ...affiliation, role }
        : affiliation);
      const isCurrent = target.id === teacher.currentAffiliationId || target.isCurrent;
      return { ...teacher, ...(isCurrent ? { role } : {}), affiliations };
    }));
  },

  // 获取学校下所有教师
  async listTeachers(schoolId: string): Promise<Teacher[]> {
    await delay(200);
    return (db.read("teachers") as Teacher[]).filter((teacher) =>
      teacher.affiliations.some((affiliation) => affiliation.schoolId === schoolId && affiliation.status === "active"));
  },
};
