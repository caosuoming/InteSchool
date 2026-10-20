import type { SchoolApplication, Teacher, TeacherAffiliation, TeacherPermissionApplication, TeacherPermissionFields, TeacherRoleApplication } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  setCsrfToken: vi.fn(),
}));

vi.mock("../api", () => apiMocks);

function affiliation(overrides: Partial<TeacherAffiliation> = {}): TeacherAffiliation {
  return {
    id: "affiliation-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "测试学校",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    isCurrent: true,
    joinedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  } as TeacherAffiliation;
}

function teacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "测试教师",
    avatar: "测",
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [affiliation()],
    currentAffiliationId: "affiliation-1",
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  } as Teacher;
}

let authService: typeof import("../auth").authService;

beforeEach(async () => {
  vi.resetModules();
  apiMocks.apiRequest.mockReset();
  apiMocks.setCsrfToken.mockReset();
  ({ authService } = await import("../auth"));
});

describe("auth service", () => {
  it("initializes an anonymous session and clears CSRF state", async () => {
    apiMocks.apiRequest.mockResolvedValueOnce({ teacher: null, csrfToken: null });

    await expect(authService.init()).resolves.toBeNull();
    expect(authService.getCurrentTeacher()).toBeNull();
    expect(apiMocks.apiRequest).toHaveBeenCalledWith("/api/auth/current");
    expect(apiMocks.setCsrfToken).toHaveBeenCalledWith(null);
  });

  it("initializes, refreshes, registers, and logs in authenticated teachers", async () => {
    const first = teacher();
    const refreshed = teacher({ name: "刷新教师" });
    const registered = teacher({ id: "teacher-registered", email: "registered@example.com" });
    const loggedIn = teacher({ id: "teacher-login", email: "login@example.com" });
    apiMocks.apiRequest
      .mockResolvedValueOnce({ teacher: first, csrfToken: "csrf-init" })
      .mockResolvedValueOnce({ teacher: refreshed, csrfToken: "csrf-refresh" })
      .mockResolvedValueOnce({ teacher: registered, csrfToken: "csrf-register" })
      .mockResolvedValueOnce({ teacher: loggedIn, csrfToken: "csrf-login" });

    await expect(authService.init()).resolves.toEqual(first);
    expect(authService.getCurrentTeacher()).toEqual(first);
    await expect(authService.refreshCurrentTeacher()).resolves.toEqual(refreshed);
    await expect(authService.register("registered@example.com", "StrongPass123", "注册教师", "13800138000"))
      .resolves.toEqual(registered);
    await expect(authService.login("login@example.com", "StrongPass123"))
      .resolves.toEqual(loggedIn);
    expect(authService.getCurrentTeacher()).toEqual(loggedIn);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: "registered@example.com",
        password: "StrongPass123",
        name: "注册教师",
        phone: "13800138000",
      }),
    });
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier: "login@example.com", password: "StrongPass123" }),
    });
    expect(apiMocks.setCsrfToken).toHaveBeenLastCalledWith("csrf-login");
  });

  it("keeps a reviewed registration anonymous until approval", async () => {
    apiMocks.apiRequest.mockResolvedValueOnce({ teacher: null, csrfToken: null, pending: true });

    await expect(authService.register({
      email: "pending@example.com",
      password: "StrongPass123",
      name: "待审核教师",
      phone: "13800138000",
      schoolId: "school-1",
      subject: "数学",
      teachingGrades: ["高一"],
      roles: ["teacher", "gradeLeader"],
    })).resolves.toBeNull();
    expect(authService.getCurrentTeacher()).toBeNull();
    expect(apiMocks.setCsrfToken).toHaveBeenCalledWith(null);
  });

  it("manages registration authorizations through protected endpoints", async () => {
    const authorization = {
      id: "authorization-1",
      phone: "13800138000",
      kind: "guarantee",
    };
    apiMocks.apiRequest
      .mockResolvedValueOnce([authorization])
      .mockResolvedValueOnce(authorization)
      .mockResolvedValueOnce({ ok: true });

    await expect(authService.listRegistrationAuthorizations()).resolves.toEqual([authorization]);
    await expect(authService.createRegistrationAuthorization("13800138000", "guarantee"))
      .resolves.toEqual(authorization);
    await authService.revokeRegistrationAuthorization("authorization / 1");

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/registration-authorizations");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/registration-authorizations", {
      method: "POST",
      body: JSON.stringify({ phone: "13800138000", kind: "guarantee" }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(
      3,
      "/api/auth/registration-authorizations/authorization%20%2F%201",
      { method: "DELETE" },
      true,
    );
  });

  it("changes password and clears all cached state on logout", async () => {
    const current = teacher();
    const cached = teacher({ id: "teacher-2", email: "other@example.com" });
    apiMocks.apiRequest
      .mockResolvedValueOnce({ teacher: current, csrfToken: "csrf" })
      .mockResolvedValueOnce([cached])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await authService.init();
    await authService.listTeachers();
    expect(authService.getTeacherById("teacher-2")).toEqual(cached);
    await authService.changePassword("OldPassword123", "NewPassword123");
    await authService.logout();

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "OldPassword123", newPassword: "NewPassword123" }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/logout", { method: "POST" }, true);
    expect(authService.getCurrentTeacher()).toBeNull();
    expect(authService.getTeacherById("teacher-2")).toBeNull();
    expect(apiMocks.setCsrfToken).toHaveBeenLastCalledWith(null);
  });

  it("resets a managed teacher password with random or specified credentials", async () => {
    apiMocks.apiRequest
      .mockResolvedValueOnce({ password: "RandomPassword123" })
      .mockResolvedValueOnce({ password: "SpecifiedPass123" });

    await expect(authService.resetTeacherPassword("teacher / 2")).resolves.toEqual({ password: "RandomPassword123" });
    await expect(authService.resetTeacherPassword("teacher / 2", "SpecifiedPass123"))
      .resolves.toEqual({ password: "SpecifiedPass123" });

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/auth/teachers/teacher%20%2F%202/password-reset",
      { method: "POST", body: JSON.stringify({}) },
      true,
    );
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/auth/teachers/teacher%20%2F%202/password-reset",
      { method: "POST", body: JSON.stringify({ newPassword: "SpecifiedPass123" }) },
      true,
    );
  });

  it("lists teachers and resolves current, cached, and missing identities", async () => {
    const current = teacher();
    const other = teacher({ id: "teacher-2", email: "other@example.com" });
    apiMocks.apiRequest
      .mockResolvedValueOnce({ teacher: current, csrfToken: "csrf" })
      .mockResolvedValueOnce([other]);

    await authService.init();
    await expect(authService.listTeachers()).resolves.toEqual([other]);
    expect(authService.getTeacherById(current.id)).toEqual(current);
    expect(authService.getTeacherById(other.id)).toEqual(other);
    expect(authService.getTeacherById("missing")).toBeNull();
    expect(apiMocks.apiRequest).toHaveBeenLastCalledWith("/api/auth/teachers");
  });

  it("submits and reviews school applications through protected endpoints", async () => {
    const application = { id: "application-1", status: "pending" } as SchoolApplication;
    apiMocks.apiRequest
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce({ ok: true });

    await expect(authService.applySchool(
      "ignored-teacher",
      "school-1",
      "EMP-001",
      ["数学", "物理"],
      "file-1",
      ["高一", "高二"],
      "年级组长",
      true,
      ["teacher", "headTeacher", "gradeLeader"],
    )).resolves.toEqual(application);
    await expect(authService.getApplicationsByTeacher("ignored-teacher")).resolves.toEqual([application]);
    await expect(authService.getPendingApplications("ignored-school")).resolves.toEqual([application]);
    await authService.reviewApplication("application / 1", true);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/applications", {
      method: "POST",
      body: JSON.stringify({
        schoolId: "school-1",
        employeeNo: "EMP-001",
        subjects: ["数学", "物理"],
        proofFileId: "file-1",
        teachingGrades: ["高一", "高二"],
        position: "年级组长",
        requestSchoolAdmin: true,
        roles: ["teacher", "headTeacher", "gradeLeader"],
      }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/applications/mine");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/applications/pending");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/applications/application%20%2F%201/review", {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    }, true);
  });

  it("submits, lists, and reviews school administrator applications", async () => {
    const application = { id: "admin-application-1", status: "pending" };
    apiMocks.apiRequest
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce({ ok: true });

    await expect(authService.applySchoolAdmin("负责学校平台管理工作")).resolves.toEqual(application);
    await expect(authService.getMySchoolAdminApplications()).resolves.toEqual([application]);
    await expect(authService.getPendingSchoolAdminApplications()).resolves.toEqual([application]);
    await authService.reviewSchoolAdminApplication("admin / application", false);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/admin-applications", {
      method: "POST",
      body: JSON.stringify({ reason: "负责学校平台管理工作" }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/admin-applications/mine");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/admin-applications/pending");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/admin-applications/admin%20%2F%20application/review", {
      method: "POST",
      body: JSON.stringify({ approved: false }),
    }, true);
  });

  it("reads identity and access policies and updates managed teaching and account permissions", async () => {
    const registrationContext = { mode: "open" };
    const identityContext = { phone: "13800000000", teacher: true, parent: false };
    const accessSettings = { registrationMode: "open", schoolCreationMode: "review" } as const;
    const updated = teacher({ name: "新姓名" });
    apiMocks.apiRequest
      .mockResolvedValueOnce(registrationContext)
      .mockResolvedValueOnce(identityContext)
      .mockResolvedValueOnce(accessSettings)
      .mockResolvedValueOnce(accessSettings)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(updated)
      .mockResolvedValueOnce(updated);

    await expect(authService.getRegistrationContext("138 00000000")).resolves.toEqual(registrationContext);
    await expect(authService.getIdentityContext("138 00000000")).resolves.toEqual(identityContext);
    await expect(authService.getAccessSettings()).resolves.toEqual(accessSettings);
    await expect(authService.updateAccessSettings(accessSettings)).resolves.toEqual(accessSettings);
    await authService.setTeacherDisabled("teacher / 1", true);
    await authService.setSchoolAccountsDisabled("school / 1", false);
    await expect(authService.updateTeacherTeachingProfile("teacher / 1", {
      teachingClassIds: ["class-1"], homeroomClassIds: ["class-2"],
    })).resolves.toEqual(updated);
    await expect(authService.updateProfile({ nickname: "新昵称" })).resolves.toEqual(updated);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/registration-context?phone=138%2000000000");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/identity-context?phone=138%2000000000");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/access-settings");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/access-settings", {
      method: "PUT", body: JSON.stringify(accessSettings),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(5, "/api/auth/teachers/teacher%20%2F%201/disabled", {
      method: "PATCH", body: JSON.stringify({ disabled: true }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(6, "/api/auth/schools/school%20%2F%201/accounts-disabled", {
      method: "PATCH", body: JSON.stringify({ disabled: false }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(7, "/api/auth/teachers/teacher%20%2F%201/teaching-profile", {
      method: "PATCH", body: JSON.stringify({ teachingClassIds: ["class-1"], homeroomClassIds: ["class-2"] }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(8, "/api/auth/profile", {
      method: "PATCH", body: JSON.stringify({ nickname: "新昵称" }),
    }, true);
    expect(authService.getCurrentTeacher()).toEqual(updated);
  });

  it("submits, reads, approves adjusted permissions, and rejects without adjustments", async () => {
    const fields: TeacherPermissionFields = {
      roles: ["teacher", "gradeLeader"],
      teachingClassIds: ["class-1"],
      homeroomClassIds: [],
      position: "年级负责人",
    };
    const adjusted: TeacherPermissionFields = {
      ...fields,
      teachingClassIds: ["class-2"],
      homeroomClassIds: ["class-2"],
    };
    const application = {
      id: "permission-1", teacherId: "teacher-1", teacherName: "测试教师",
      schoolId: "school-1", schoolName: "测试学校",
      requestedRoles: fields.roles,
      requestedTeachingClassIds: fields.teachingClassIds,
      requestedHomeroomClassIds: fields.homeroomClassIds,
      requestedPosition: fields.position,
      previous: { roles: ["teacher"], teachingClassIds: [], homeroomClassIds: [], position: "" },
      reason: "更新教学职责权限", status: "pending", createdAt: "2026-10-19T00:00:00.000Z",
    } as TeacherPermissionApplication;
    apiMocks.apiRequest
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    await expect(authService.applyTeacherPermissions(fields, "更新教学职责权限")).resolves.toEqual(application);
    await expect(authService.getMyTeacherPermissionApplications()).resolves.toEqual([application]);
    await expect(authService.getPendingTeacherPermissionApplications()).resolves.toEqual([application]);
    await authService.reviewTeacherPermissionApplication("permission / 1", true, adjusted);
    await authService.reviewTeacherPermissionApplication("permission / 2", false);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/permission-applications", {
      method: "POST", body: JSON.stringify({ ...fields, reason: "更新教学职责权限" }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/permission-applications/mine");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/permission-applications/pending");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/permission-applications/permission%20%2F%201/review", {
      method: "POST", body: JSON.stringify({ approved: true, adjustments: adjusted }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(5, "/api/auth/permission-applications/permission%20%2F%202/review", {
      method: "POST", body: JSON.stringify({ approved: false }),
    }, true);
  });

  it("submits, lists, and reviews teacher role applications", async () => {
    const application = {
      id: "role-application-1",
      teacherId: "teacher-1",
      teacherName: "测试教师",
      schoolId: "school-1",
      schoolName: "测试学校",
      requestedRoles: ["gradeLeader"],
      reason: "负责年级教学管理",
      status: "pending",
      createdAt: "2026-08-14T00:00:00.000Z",
    } as TeacherRoleApplication;
    apiMocks.apiRequest
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce([application])
      .mockResolvedValueOnce({ ok: true });

    await expect(authService.applyTeacherRoles(["teacher", "gradeLeader"], "负责年级教学管理"))
      .resolves.toEqual(application);
    await expect(authService.getMyTeacherRoleApplications()).resolves.toEqual([application]);
    await expect(authService.getPendingTeacherRoleApplications()).resolves.toEqual([application]);
    await authService.reviewTeacherRoleApplication("role / application", true, ["subjectLeader"]);

    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(1, "/api/auth/role-applications", {
      method: "POST",
      body: JSON.stringify({ roles: ["teacher", "gradeLeader"], reason: "负责年级教学管理" }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/role-applications/mine");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/role-applications/pending");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/role-applications/role%20%2F%20application/review", {
      method: "POST",
      body: JSON.stringify({ approved: true, approvedRoles: ["subjectLeader"] }),
    }, true);
  });

  it("resolves affiliation fallbacks and rejects access for another teacher", async () => {
    const explicit = affiliation({ id: "explicit", isCurrent: false });
    const marked = affiliation({ id: "marked", isCurrent: true });
    const current = teacher({
      affiliations: [explicit, marked],
      currentAffiliationId: "explicit",
    });
    apiMocks.apiRequest.mockResolvedValueOnce({ teacher: current, csrfToken: "csrf" });
    await authService.init();

    expect(authService.getAffiliations("teacher-2")).toEqual([]);
    expect(authService.getAffiliations(current.id)).toEqual([explicit, marked]);
    expect(authService.getCurrentAffiliation(current.id)).toEqual(explicit);

    current.currentAffiliationId = "missing";
    expect(authService.getCurrentAffiliation(current.id)).toEqual(marked);
    marked.isCurrent = false;
    expect(authService.getCurrentAffiliation(current.id)).toEqual(explicit);
    current.affiliations = [];
    expect(authService.getCurrentAffiliation(current.id)).toBeNull();
  });

  it("switches affiliations and detects an invalid server response", async () => {
    const switchedAffiliation = affiliation({ id: "school / role" });
    const switchedTeacher = teacher({
      affiliations: [switchedAffiliation],
      currentAffiliationId: switchedAffiliation.id,
    });
    apiMocks.apiRequest.mockResolvedValueOnce(switchedTeacher);

    await expect(authService.switchAffiliation("ignored", switchedAffiliation.id))
      .resolves.toEqual(switchedAffiliation);
    expect(authService.getCurrentTeacher()).toEqual(switchedTeacher);
    expect(apiMocks.apiRequest).toHaveBeenCalledWith(
      "/api/auth/affiliations/school%20%2F%20role/activate",
      { method: "POST" },
      true,
    );

    apiMocks.apiRequest.mockResolvedValueOnce(teacher({ affiliations: [], currentAffiliationId: "missing" }));
    await expect(authService.switchAffiliation("ignored", "missing"))
      .rejects.toThrow("身份切换失败");
  });
});
