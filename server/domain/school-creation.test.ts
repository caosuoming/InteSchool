import { describe, expect, it } from "vitest";
import type { AppNotification, School } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { schoolService } from "./school.js";

function teacher(
  id: string,
  role: TeacherRecord["role"] = "teacher",
): TeacherRecord {
  return {
    id,
    email: `${id}@example.com`,
    name: id === "applicant" ? "申请教师" : "平台管理员",
    avatar: "测",
    schoolId: role === "platform_admin" ? "school-existing" : null,
    subject: "数学",
    status: "active",
    role,
    roles: [],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `${id}-affiliation`,
      schoolId: role === "platform_admin" ? "school-existing" : null,
      role,
      isCurrent: true,
    }],
    currentAffiliationId: `${id}-affiliation`,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function state(): AppState {
  const existingSchool: School = {
    id: "school-existing",
    name: "现有中学",
    code: "EXISTING",
    logo: "现",
    description: "现有学校",
    teacherCount: 1,
    studentCount: 0,
    city: "南京",
  };
  return {
    teachers: [teacher("applicant"), teacher("admin", "platform_admin")],
    currentTeacherId: null,
    schools: [existingSchool],
    applications: [],
    schoolCreationApplications: [],
    notifications: [],
  };
}

describe("school creation applications", () => {
  it("normalizes and stores a new application", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const application = await schoolService.submitSchoolCreationApplication({
        name: "  新建实验学校  ",
        code: " new-school ",
        city: " 南京 ",
        description: "  测试学校  ",
      }, teacher("applicant"));

      expect(application).toMatchObject({
        requesterId: "applicant",
        requesterName: "申请教师",
        name: "新建实验学校",
        code: "NEW-SCHOOL",
        city: "南京",
        description: "测试学校",
        status: "pending",
      });
      expect(appState.schoolCreationApplications).toEqual([application]);
      expect(appState.notifications as AppNotification[]).toEqual([
        expect.objectContaining({
          recipientTeacherId: "admin",
          type: "admin",
          title: "新的学校新增申请",
          actionUrl: "/admin/school-creation-applications",
          readAt: null,
        }),
      ]);
      expect(await schoolService.listMySchoolCreationApplications(teacher("applicant")))
        .toEqual([application]);
    });
  });

  it("rejects existing schools and duplicate pending applications", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(schoolService.submitSchoolCreationApplication({
        name: "现有中学",
        code: "OTHER",
        city: "南京",
      }, teacher("applicant"))).rejects.toThrow("学校名称或代码已存在");

      await schoolService.submitSchoolCreationApplication({
        name: "新学校",
        code: "NEW",
        city: "南京",
      }, teacher("applicant"));
      await expect(schoolService.submitSchoolCreationApplication({
        name: "另一名称",
        code: "new",
        city: "苏州",
      }, teacher("applicant"))).rejects.toThrow("已有待审核申请");
    });
  });

  it("allows only platform admins to review and creates the school when approved", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      const application = await schoolService.submitSchoolCreationApplication({
        name: "审批学校",
        code: "APPROVED",
        city: "无锡",
      }, teacher("applicant"));

      await expect(schoolService.listPendingSchoolCreationApplications(teacher("applicant")))
        .rejects.toThrow("平台超级管理员权限");
      await expect(schoolService.reviewSchoolCreationApplication(
        application.id,
        true,
        teacher("applicant"),
      )).rejects.toThrow("平台超级管理员权限");

      const reviewed = await schoolService.reviewSchoolCreationApplication(
        application.id,
        true,
        teacher("admin", "platform_admin"),
      );
      expect(reviewed).toMatchObject({
        status: "approved",
        reviewedBy: "admin",
        schoolId: expect.any(String),
      });
      expect(appState.schools).toContainEqual(expect.objectContaining({
        id: reviewed.schoolId,
        name: "审批学校",
        code: "APPROVED",
        city: "无锡",
        teacherCount: 0,
        studentCount: 0,
      }));
      await expect(schoolService.reviewSchoolCreationApplication(
        application.id,
        false,
        teacher("admin", "platform_admin"),
      )).rejects.toThrow("已处理");
    });
  });

  it("automatically joins the requester when approving a school submitted during registration", async () => {
    const appState = state();
    const applicant = appState.teachers.find((item) => item.id === "applicant")!;
    applicant.affiliations = [
      {
        id: "pending-school-affiliation",
        teacherId: applicant.id,
        schoolId: "school-pending",
        schoolName: "注册新校",
        subject: "数学",
        teachingGrades: ["高一"],
        teachingClassIds: [],
        status: "pending",
        role: "teacher",
        roles: ["teacher", "gradeLeader"],
        subjectGroupIds: [],
        prepGroupIds: [],
        isCurrent: false,
        joinedAt: "2026-09-17T00:00:00.000Z",
      },
      {
        id: "personal-affiliation",
        teacherId: applicant.id,
        schoolId: null,
        schoolName: null,
        subject: "数学",
        status: "active",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        isCurrent: true,
        joinedAt: "2026-09-17T00:00:00.000Z",
      },
    ];
    applicant.currentAffiliationId = "personal-affiliation";
    appState.applications = [{
      id: "membership-application",
      teacherId: applicant.id,
      schoolId: "school-pending",
      schoolName: "注册新校",
      subject: "数学",
      teachingGrades: ["高一"],
      roles: ["teacher", "gradeLeader"],
      requestSchoolAdmin: false,
      registrationApplication: true,
      awaitingSchoolCreation: true,
      status: "pending",
      createdAt: "2026-09-17T00:00:00.000Z",
    }];
    appState.schoolCreationApplications = [{
      id: "creation-application",
      requesterId: applicant.id,
      requesterName: applicant.name,
      name: "注册新校",
      code: "REGNEW",
      city: "南京",
      description: "注册时申请",
      schoolId: "school-pending",
      registrationApplicationId: "membership-application",
      status: "pending",
      createdAt: "2026-09-17T00:00:00.000Z",
    }];

    await runWithState(appState, async () => {
      const reviewed = await schoolService.reviewSchoolCreationApplication(
        "creation-application",
        true,
        teacher("admin", "platform_admin"),
      );

      expect(reviewed).toMatchObject({ status: "approved", schoolId: "school-pending" });
      expect(appState.schools).toContainEqual(expect.objectContaining({
        id: "school-pending",
        name: "注册新校",
        teacherCount: 1,
      }));
      expect(applicant).toMatchObject({
        schoolId: "school-pending",
        subject: "数学",
        teachingGrades: ["高一"],
        roles: ["teacher", "gradeLeader"],
        currentAffiliationId: "pending-school-affiliation",
      });
      expect(applicant.affiliations).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "pending-school-affiliation",
          status: "active",
          isCurrent: true,
          roles: ["teacher", "gradeLeader"],
        }),
        expect.objectContaining({ id: "personal-affiliation", isCurrent: false }),
      ]));
      expect(appState.applications).toEqual([
        expect.objectContaining({
          id: "membership-application",
          status: "approved",
          awaitingSchoolCreation: false,
          reviewedBy: "admin",
        }),
      ]);
      expect(appState.notifications as AppNotification[]).toContainEqual(expect.objectContaining({
        recipientTeacherId: applicant.id,
        title: "新增学校申请已通过",
        actionUrl: "/dashboard",
      }));
    });
  });
});
