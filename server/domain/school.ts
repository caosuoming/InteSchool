import { randomUUID } from "node:crypto";
import type {
  School,
  SchoolCreationApplication,
} from "../../src/types/index.js";
import type { TeacherRecord } from "../types.js";
import { db } from "../runtime-db.js";
import { delay } from "../domain-shared.js";
import { createNotification, platformAdminTeacherIds } from "./notification.js";
import { isTeacherRole, normalizeTeacherRoles } from "../../src/lib/teacher-roles.js";

interface SchoolCreationInput {
  name: string;
  code: string;
  city: string;
  description?: string;
}

function activeRole(teacher: TeacherRecord): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return typeof affiliation?.role === "string" ? affiliation.role : teacher.role;
}

function requirePlatformAdmin(teacher: TeacherRecord): void {
  if (activeRole(teacher) !== "platform_admin") {
    throw new Error("该操作需要平台超级管理员权限");
  }
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function schoolApplications(): SchoolCreationApplication[] {
  return db.read("schoolCreationApplications") as SchoolCreationApplication[];
}

function validateSchoolInput(input: SchoolCreationInput): Required<SchoolCreationInput> {
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const city = input.city.trim();
  const description = input.description?.trim() || "由用户申请新增";
  if (name.length < 2 || name.length > 100) throw new Error("学校名称应为 2-100 个字符");
  if (!/^[A-Z0-9_-]{2,24}$/.test(code)) throw new Error("学校代码应为 2-24 位字母、数字、下划线或短横线");
  if (city.length < 2 || city.length > 50) throw new Error("所在城市应为 2-50 个字符");
  if (description.length > 500) throw new Error("学校简介不能超过 500 个字符");
  return { name, code, city, description };
}

function assertNoSchoolConflict(input: Pick<SchoolCreationInput, "name" | "code">): void {
  const name = normalized(input.name);
  const code = normalized(input.code);
  const duplicateSchool = (db.read("schools") as School[]).find((school) =>
    normalized(school.name) === name || normalized(school.code) === code);
  if (duplicateSchool) throw new Error("学校名称或代码已存在，请直接搜索并选择该学校");
}

export const schoolService = {
  async listSchools(): Promise<School[]> {
    await delay(200);
    return db.read("schools");
  },

  async searchSchools(keyword: string): Promise<School[]> {
    await delay(300);
    const kw = keyword.trim().toLowerCase();
    if (!kw) return db.read("schools");
    return db
      .read("schools")
      .filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          s.code.toLowerCase().includes(kw) ||
          s.city.toLowerCase().includes(kw),
      );
  },

  async getSchool(schoolId: string): Promise<School | null> {
    await delay(150);
    return db.read("schools").find((s) => s.id === schoolId) || null;
  },

  async submitSchoolCreationApplication(
    input: SchoolCreationInput,
    teacher: TeacherRecord,
  ): Promise<SchoolCreationApplication> {
    const school = validateSchoolInput(input);
    assertNoSchoolConflict(school);
    const duplicateApplication = schoolApplications().find((application) =>
      application.status === "pending"
      && (normalized(application.name) === normalized(school.name)
        || normalized(application.code) === normalized(school.code)));
    if (duplicateApplication) throw new Error("该学校已有待审核申请，请勿重复提交");

    const application: SchoolCreationApplication = {
      id: randomUUID(),
      requesterId: teacher.id,
      requesterName: teacher.name,
      ...school,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    schoolApplications().push(application);
    for (const recipientTeacherId of platformAdminTeacherIds(db.read("teachers") as TeacherRecord[])) {
      if (recipientTeacherId === teacher.id) continue;
      createNotification({
        recipientTeacherId,
        type: "admin",
        title: "新的学校新增申请",
        content: `${teacher.name} 申请新增“${application.name}”，请及时审核。`,
        actionUrl: "/admin/school-creation-applications",
      });
    }
    return application;
  },

  async listMySchoolCreationApplications(
    teacher: TeacherRecord,
  ): Promise<SchoolCreationApplication[]> {
    return schoolApplications()
      .filter((application) => application.requesterId === teacher.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  },

  async listPendingSchoolCreationApplications(
    teacher: TeacherRecord,
  ): Promise<SchoolCreationApplication[]> {
    requirePlatformAdmin(teacher);
    return schoolApplications()
      .filter((application) => application.status === "pending")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  },

  async reviewSchoolCreationApplication(
    applicationId: string,
    approved: boolean,
    teacher: TeacherRecord,
  ): Promise<SchoolCreationApplication> {
    requirePlatformAdmin(teacher);
    const application = schoolApplications().find((item) => item.id === applicationId);
    if (!application) throw new Error("学校新增申请不存在");
    if (application.status !== "pending") throw new Error("该申请已处理");

    const reviewedAt = new Date().toISOString();
    const linkedApplications = db.read("applications") as Array<Record<string, unknown>>;
    const linkedApplication = linkedApplications.find((item) =>
      item.registrationApplication === true
      && item.teacherId === application.requesterId
      && typeof application.schoolId === "string"
      && item.schoolId === application.schoolId
      && item.status === "pending"
      && (application.registrationApplicationId === undefined
        || item.id === application.registrationApplicationId));
    let joinedRequester = false;

    if (approved) {
      assertNoSchoolConflict(application);
      const schoolId = application.schoolId || randomUUID();
      const school: School = {
        id: schoolId,
        name: application.name,
        code: application.code,
        logo: application.name.charAt(0) || "校",
        description: application.description,
        teacherCount: 0,
        studentCount: 0,
        city: application.city,
      };
      (db.read("schools") as School[]).push(school);
      application.schoolId = school.id;

      const requester = (db.read("teachers") as TeacherRecord[]).find((item) => item.id === application.requesterId);
      if (requester && linkedApplication) {
        const schoolAffiliation = requester.affiliations.find((item) => item.schoolId === school.id);
        if (schoolAffiliation && typeof schoolAffiliation.id === "string") {
          const requestedRoles = normalizeTeacherRoles(
            Array.isArray(linkedApplication.roles)
              ? linkedApplication.roles.filter(isTeacherRole)
              : ["teacher"],
          );
          const role = linkedApplication.requestSchoolAdmin === true ? "school_admin" : "teacher";
          const subject = typeof linkedApplication.subject === "string" ? linkedApplication.subject : requester.subject;
          const subjects = Array.isArray(linkedApplication.subjects)
            ? linkedApplication.subjects.filter((item): item is string => typeof item === "string")
            : [subject];
          const teachingGrades = Array.isArray(linkedApplication.teachingGrades)
            ? linkedApplication.teachingGrades.filter((grade): grade is string => typeof grade === "string")
            : [];
          const teachingClassIds = Array.isArray(linkedApplication.teachingClassIds)
            ? linkedApplication.teachingClassIds.filter((classId): classId is string => typeof classId === "string")
            : [];
          const employeeNo = typeof linkedApplication.employeeNo === "string" ? linkedApplication.employeeNo : "";
          const position = typeof linkedApplication.position === "string" ? linkedApplication.position : "";
          requester.affiliations = requester.affiliations.map((item) => item.id === schoolAffiliation.id
            ? {
              ...item,
              schoolName: school.name,
              subject,
              subjects,
              teachingGrades,
              teachingClassIds,
              employeeNo,
              position,
              status: "active",
              role,
              roles: requestedRoles,
              isCurrent: true,
            }
            : { ...item, isCurrent: false });
          requester.schoolId = school.id;
          requester.subject = subject;
          requester.subjects = subjects;
          requester.teachingGrades = teachingGrades;
          requester.teachingClassIds = teachingClassIds;
          requester.employeeNo = employeeNo;
          requester.position = position;
          requester.status = "active";
          requester.role = role;
          requester.roles = requestedRoles;
          requester.currentAffiliationId = schoolAffiliation.id;
          school.teacherCount = 1;
          linkedApplication.status = "approved";
          linkedApplication.awaitingSchoolCreation = false;
          linkedApplication.reviewedAt = reviewedAt;
          linkedApplication.reviewedBy = teacher.id;
          joinedRequester = true;
        }
      }
    } else if (linkedApplication) {
      linkedApplication.status = "rejected";
      linkedApplication.awaitingSchoolCreation = false;
      linkedApplication.reviewedAt = reviewedAt;
      linkedApplication.reviewedBy = teacher.id;
      const requester = (db.read("teachers") as TeacherRecord[]).find((item) => item.id === application.requesterId);
      if (requester && application.schoolId) {
        requester.affiliations = requester.affiliations.map((item) => item.schoolId === application.schoolId
          ? { ...item, status: "rejected", isCurrent: false }
          : item);
      }
    }

    application.status = approved ? "approved" : "rejected";
    application.reviewedAt = reviewedAt;
    application.reviewedBy = teacher.id;
    createNotification({
      recipientTeacherId: application.requesterId,
      type: "approval",
      title: approved ? "新增学校申请已通过" : "新增学校申请未通过",
      content: approved
        ? joinedRequester
          ? `“${application.name}”已创建，您的学校身份也已通过，可以直接进入该学校。`
          : `“${application.name}”已创建，可以继续提交学校认证。`
        : `“${application.name}”的新增学校申请未通过。`,
      actionUrl: approved && joinedRequester ? "/dashboard" : "/school-auth",
    });
    return application;
  },
};
