import { beforeEach, describe, expect, it, vi } from "vitest";
import { authService } from "@/services/auth";
import { db } from "@/services/db";

describe("auth service", () => {
  beforeEach(() => {
    db.reset();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("persists the session after registration", async () => {
    const teacher = await authService.register("new@example.com", "password", "新教师");

    expect(db.read("currentTeacherId")).toBe(teacher.id);
    expect(authService.getCurrentTeacher()?.id).toBe(teacher.id);
  });

  it("keeps the active affiliation in sync after school approval", async () => {
    const teacher = await authService.register("school@example.com", "password", "认证教师");
    const school = db.read("schools")[0];

    const application = await authService.applySchool(
      teacher.id,
      school.id,
      "T-001",
      "数学",
      "proof.pdf",
    );

    const current = authService.getCurrentTeacher();
    const affiliation = authService.getCurrentAffiliation(teacher.id);
    expect(current?.schoolId).toBe(school.id);
    expect(affiliation).toMatchObject({
      schoolId: school.id,
      schoolName: school.name,
      employeeNo: "T-001",
      subject: "数学",
      status: "active",
      isCurrent: true,
    });
    expect(application.status).toBe("approved");
  });

  it("logs in and clears the persisted session on logout", async () => {
    const teacher = await authService.login("li.zhang@bj04.edu.cn", "demo1234");
    expect(authService.getCurrentTeacher()?.id).toBe(teacher.id);

    await authService.logout();
    expect(db.read("currentTeacherId")).toBeNull();
    expect(authService.getCurrentTeacher()).toBeNull();
  });

  it("rejects invalid credentials without changing the session", async () => {
    await expect(authService.login("missing@example.com", "wrong"))
      .rejects.toThrow("邮箱或密码错误");
    expect(db.read("currentTeacherId")).toBeNull();
  });
});
