// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { SchoolSetting } from "../src/types/index.js";
import type { DatabaseStore } from "./database.js";
import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import { invokeRpc } from "./rpc.js";

function teacher(id: string, schoolId: string): TeacherRecord {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: "",
    schoolId,
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [
      { id: `${id}-a`, schoolId: "school-a", subject: "数学", status: "active", isCurrent: schoolId === "school-a", role: "teacher" },
      { id: `${id}-b`, schoolId: "school-b", subject: "数学", status: "active", isCurrent: schoolId === "school-b", role: "teacher" },
    ],
    currentAffiliationId: `${id}-${schoolId === "school-a" ? "a" : "b"}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function session(teacherId: string): SessionUser {
  return {
    userId: `user-${teacherId}`,
    teacherId,
    email: `${teacherId}@example.com`,
    csrfToken: "csrf",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

function storeFor(appState: AppState): DatabaseStore {
  return {
    loadState: vi.fn(() => appState),
    saveState: vi.fn(),
  } as unknown as DatabaseStore;
}

function switchToSchoolB(appState: AppState): void {
  const current = appState.teachers[0];
  appState.teachers[0] = {
    ...current,
    schoolId: "school-b",
    currentAffiliationId: "teacher-1-b",
    affiliations: current.affiliations.map((item) => ({ ...item, isCurrent: item.id === "teacher-1-b" })),
  };
}

describe("personal settings RPC authorization", () => {
  it("uses authenticated-user scope across schools and isolates mutations between users", async () => {
    const now = "2026-01-01T00:00:00.000Z";
    const appState = {
      teachers: [teacher("teacher-1", "school-a"), teacher("teacher-2", "school-a")],
      currentTeacherId: "teacher-1",
      schoolSettings: [
        { id: "legacy-a", schoolId: "school-a", type: "source", name: "校本", value: "school", sortOrder: 1, enabled: true, createdAt: now, updatedAt: now },
        { id: "legacy-b", schoolId: "school-b", type: "source", name: "自编", value: "self", sortOrder: 1, enabled: true, createdAt: now, updatedAt: now },
      ] satisfies SchoolSetting[],
      classTypeCategories: [],
      examPaperTypes: [],
      lectureTypes: [],
    } as AppState;
    const store = storeFor(appState);

    const first = await invokeRpc(store, session("teacher-1"), "settings", "listSettings", ["school-a", "source"]) as SchoolSetting[];
    expect(first.map((item) => item.value)).toEqual(["school", "self"]);
    expect(first.every((item) => item.teacherId === "teacher-1")).toBe(true);
    expect(store.saveState).toHaveBeenCalled();

    const created = await invokeRpc(store, session("teacher-1"), "settings", "createSetting", ["school-a", {
      type: "source",
      name: "个人新增",
      value: "mine",
    }]) as SchoolSetting;
    expect(created).toMatchObject({ teacherId: "teacher-1", schoolId: "personal-settings:teacher-1" });

    switchToSchoolB(appState);
    const second = await invokeRpc(store, session("teacher-1"), "settings", "listSettings", ["school-b", "source"]) as SchoolSetting[];
    expect(second.map((item) => item.id)).toEqual([...first.map((item) => item.id), created.id]);

    await expect(invokeRpc(store, session("teacher-2"), "settings", "updateSetting", [created.id, { name: "越权修改" }]))
      .rejects.toThrow();
    expect((appState.schoolSettings as SchoolSetting[]).find((item) => item.id === created.id)?.name).toBe("个人新增");
  });
});
