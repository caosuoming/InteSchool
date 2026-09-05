// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Chapter, KnowledgePoint } from "../src/types/index.js";
import type { DatabaseStore } from "./database.js";
import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import { invokeRpc } from "./rpc.js";

function personalTeacher(): TeacherRecord {
  return {
    id: "teacher-1",
    email: "teacher@example.com",
    name: "Teacher",
    avatar: "",
    schoolId: null,
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [
      { id: "aff-school", schoolId: "school-1", subject: "数学", status: "active", isCurrent: false },
      { id: "aff-personal", schoolId: null, subject: "数学", status: "active", isCurrent: true },
    ],
    currentAffiliationId: "aff-personal",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as TeacherRecord;
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

describe("personal directory RPC authorization", () => {
  it("injects the authenticated teacher scope and works without an active school", async () => {
    const appState = {
      teachers: [personalTeacher()],
      currentTeacherId: "teacher-1",
      chapters: [
        { id: "legacy-chapter", schoolId: "school-1", parentId: null, name: "原目录", order: 1, level: 0 },
      ] satisfies Chapter[],
      knowledgePoints: [
        { id: "legacy-knowledge", schoolId: "school-1", parentId: null, name: "同名知识点", order: 1, level: 0 },
        { id: "legacy-knowledge-alias", schoolId: "school-1", parentId: null, name: "同名知识点", order: 2, level: 0 },
      ] satisfies KnowledgePoint[],
      questions: [],
      directoryCatalogs: [],
      directoryDonations: [],
    } as AppState;
    const store = storeFor(appState);

    const initial = await invokeRpc(store, session(), "knowledge", "getChapterTree", [null]) as {
      children: Array<{ id: string; name: string }>;
    };
    expect(initial.children.map((item) => item.name)).toEqual(["原目录"]);
    expect(initial.children[0].id).not.toBe("legacy-chapter");

    await invokeRpc(store, session(), "knowledge", "addChapter", [null, null, "个人新增"]);
    const after = await invokeRpc(store, session(), "knowledge", "getChapterTree", ["school-1"]) as {
      children: Array<{ name: string }>;
    };
    expect(after.children.map((item) => item.name)).toEqual(["原目录", "个人新增"]);
    expect((appState.chapters as Chapter[]).filter((item) => item.teacherId === "teacher-1")).toHaveLength(2);

    const personalKnowledge = await invokeRpc(store, session(), "knowledge", "listKnowledgePoints", [null]) as KnowledgePoint[];
    const aliasIds = await invokeRpc(store, session(), "knowledge", "getAliasIds", [personalKnowledge[0].id, null]) as string[];
    expect(aliasIds).toEqual([personalKnowledge[0].id]);
    expect(store.saveState).toHaveBeenCalled();
  });
});
