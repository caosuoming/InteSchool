import type { SchoolApplication, Teacher, TeacherAffiliation } from "@/types";
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
      }),
    }, true);
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(2, "/api/auth/applications/mine");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(3, "/api/auth/applications/pending");
    expect(apiMocks.apiRequest).toHaveBeenNthCalledWith(4, "/api/auth/applications/application%20%2F%201/review", {
      method: "POST",
      body: JSON.stringify({ approved: true }),
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
