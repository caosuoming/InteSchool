// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Lecture } from "../src/types/index.js";
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
    affiliations: [{
      id: "aff-personal",
      schoolId: null,
      subject: "数学",
      status: "active",
      isCurrent: true,
    }],
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

function state(): AppState {
  return {
    teachers: [personalTeacher()],
    currentTeacherId: "teacher-1",
    questions: [],
    examPapers: [],
    lectures: [],
    coursewares: [],
    materials: [],
    shareRecords: [],
    platformResourceCorrections: [],
    resourceFolders: [],
    chapters: [],
    knowledgePoints: [],
    directoryCatalogs: [],
    directoryDonations: [],
    creditTransactions: [],
    platformCreditSettings: [],
  } as unknown as AppState;
}

function storeFor(appState: AppState): DatabaseStore {
  return {
    loadState: vi.fn(() => appState),
    saveState: vi.fn(),
  } as unknown as DatabaseStore;
}

describe("personal resource RPC authorization", () => {
  it("creates resources in the authenticated user's personal scope", async () => {
    const appState = state();
    const store = storeFor(appState);

    const created = await invokeRpc(store, session(), "lecture", "createLecture", [
      "teacher-1",
      "school-spoofed",
      {
        title: "个人讲义",
        chapterIds: [],
        knowledgePointIds: [],
        grade: "高一",
        schoolYear: "2026-2027",
        semester: "上学期",
        classIds: [],
        studentIds: [],
        sections: [],
      },
    ]) as Lecture;

    expect(created).toMatchObject({
      teacherId: "teacher-1",
      schoolId: "personal-directory:teacher-1",
      title: "个人讲义",
    });
  });

  it("allows platform-resource reads and save-status checks without an active school", async () => {
    const store = storeFor(state());

    await expect(invokeRpc(store, session(), "share", "listPublicDonations", ["teacher-1"]))
      .resolves.toEqual([]);
    await expect(invokeRpc(store, session(), "donation", "getSaveStatus", ["teacher-1", "school-spoofed"]))
      .resolves.toEqual({ savedDonationIds: [], savedAlbumKeys: [] });
  });

  it("still rejects another school's scope embedded in resource filters", async () => {
    const store = storeFor(state());

    await expect(invokeRpc(store, session(), "lecture", "listLectures", [{
      teacherId: "teacher-1",
      schoolId: "school-other",
    }])).rejects.toThrow("无权访问其他学校的数据");
  });
});
