// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { invokeRpc } from "./rpc.js";
import type { AppState, SessionUser } from "./types.js";
import type { DatabaseStore } from "./database.js";

const teacher = {
  id: "teacher-1", email: "teacher@test.example", name: "张老师", avatar: "",
  schoolId: "school-1", subject: "数学", status: "active", role: "teacher",
  roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [],
  affiliations: [{ id: "aff-1", teacherId: "teacher-1", schoolId: "school-1", schoolName: "第一学校",
    subject: "数学", status: "active", role: "teacher", roles: ["teacher"],
    subjectGroupIds: [], prepGroupIds: [], teachingClassIds: ["c-own"], homeroomClassIds: [],
    isCurrent: true, joinedAt: "2026-09-01" }],
  currentAffiliationId: "aff-1", createdAt: "2026-09-01",
};
const schoolClass = (id: string, schoolId: string, status: "active" | "graduated" = "active") => ({
  id, schoolId, type: "school", status, name: id, grade: "高一",
  studentCount: 1, createdBy: "teacher-1", createdAt: "2026-09-01",
});
const student = (id: string, schoolId: string, classId: string, status = "active") => ({
  id, name: id, studentNo: `no-${id}`, grade: "高一", schoolId, classId,
  status, contacts: { guardian1Phone: "13800000000" }, archiveStatus: "attending",
});
const state = {
  teachers: [teacher],
  schools: [{ id: "school-1", name: "第一学校" }, { id: "school-2", name: "第二学校" }],
  schoolClasses: [schoolClass("c-own", "school-1"), schoolClass("c-grade", "school-1"),
    schoolClass("c-out", "school-2"), schoolClass("c-graduated", "school-2", "graduated")],
  personalClasses: [{ id: "pc", teacherId: "teacher-1", type: "personal",
    name: "个人教学班", studentIds: ["s-out"], createdAt: "2026-09-01", description: "" }],
  students: [student("s-own", "school-1", "c-own"),
    student("s-grade", "school-1", "c-grade"),
    student("s-out", "school-2", "c-out"),
    student("s-foreign", "school-2", "c-out"),
    student("s-inactive", "school-2", "c-out", "suspended"),
    student("s-grad", "school-2", "c-graduated")],
} as unknown as AppState;

const store = { loadState: vi.fn(() => state), saveState: vi.fn() } as unknown as DatabaseStore;
const session: SessionUser = {
  userId: "user-1", teacherId: "teacher-1", email: "teacher@test.example",
  csrfToken: "csrf", expiresAt: "2099-01-01",
};

describe("resource student choices", () => {
  it("shows active school and personal-class students without unrelated external students", async () => {
    const result = await invokeRpc(store, session, "class", "listResourceStudentChoices", [null, null]) as Array<{ id: string; studentNo?: string }>;
    expect(result.map((item) => item.id).sort()).toEqual(["s-grade", "s-out", "s-own"]);
    expect(result.find((item) => item.id === "s-out")?.studentNo).toBe("no-s-out");
    expect(result[0]).not.toHaveProperty("contacts");
    expect(result[0]).not.toHaveProperty("archiveStatus");
  });

  it("loads a requested school with minimal identities and no inactive or graduated class members", async () => {
    const result = await invokeRpc(store, session, "class", "listResourceStudentChoices", [
      "school-2", { id: "untrusted-admin", role: "platform_admin" },
    ]) as Array<{ id: string; name: string; studentNo?: string }>;
    expect(result.map((item) => item.id).sort()).toEqual(["s-foreign", "s-out"]);
    expect(result.find((item) => item.id === "s-foreign")?.studentNo).toBeUndefined();
    expect(result.find((item) => item.id === "s-out")?.studentNo).toBeUndefined();
    expect(result.every((item) => !("contacts" in item))).toBe(true);
  });

  it("rejects unknown school IDs and unauthenticated calls", async () => {
    await expect(invokeRpc(store, session, "class", "listResourceStudentChoices", ["not-a-school"]))
      .rejects.toThrow("学校不存在");
    await expect(invokeRpc(store, null, "class", "listResourceStudentChoices", ["school-2"]))
      .rejects.toThrow("请先登录");
  });
});
