import { randomUUID } from "node:crypto";
import type {
  School,
  SchoolCreationApplication,
} from "../../src/types/index.js";
import type { TeacherRecord } from "../types.js";
import { db } from "../runtime-db.js";
import { delay } from "../domain-shared.js";

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

    if (approved) {
      assertNoSchoolConflict(application);
      const school: School = {
        id: randomUUID(),
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
    }

    application.status = approved ? "approved" : "rejected";
    application.reviewedAt = new Date().toISOString();
    application.reviewedBy = teacher.id;
    return application;
  },
};
