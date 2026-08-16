// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { DatabaseStore } from "./database.js";
import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import { invokeRpc } from "./rpc.js";

function teacher(role: "teacher" | "school_admin" = "teacher", personal = false): TeacherRecord {
  const schoolId = personal ? null : "school-1";
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "Teacher",
    nickname: "老师",
    avatar: "",
    schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: "aff-1",
      schoolId,
      role,
      isCurrent: true,
    }],
    currentAffiliationId: "aff-1",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
}

function state(record: TeacherRecord): AppState {
  return {
    teachers: [record],
    currentTeacherId: record.id,
    helpTopics: [],
    helpReplies: [],
    helpCategories: [],
  } as AppState;
}

function session(): SessionUser {
  return {
    userId: "user-1",
    teacherId: "teacher-1",
    email: "teacher@example.com",
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

describe("help RPC authorization", () => {
  it("allows a personal identity to read and post on the help board", async () => {
    const appState = state(teacher("teacher", true));
    const store = storeFor(appState);

    const initial = await invokeRpc(store, session(), "help", "getBoard", [null]) as { topics: unknown[] };
    expect(initial.topics).toEqual([]);

    await invokeRpc(store, session(), "help", "createTopic", [{
      type: "question",
      title: "怎么使用？",
      content: "需要帮助",
    }, null]);
    expect(appState.helpTopics).toHaveLength(1);
  });

  it("injects the authenticated teacher and enforces administrator moderation", async () => {
    const ordinaryState = state(teacher("teacher"));
    await expect(invokeRpc(storeFor(ordinaryState), session(), "help", "createCategory", ["使用帮助", null]))
      .rejects.toThrow("学校管理员");

    const adminState = state(teacher("school_admin"));
    await invokeRpc(storeFor(adminState), session(), "help", "createCategory", ["使用帮助", null]);
    expect(adminState.helpCategories).toHaveLength(1);
  });
});
