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

  it("keeps extracted documents editable after switching schools without changing their usage audience", async () => {
    const appState = state();
    const teacher = appState.teachers[0];
    teacher.schoolId = "school-a";
    teacher.affiliations = [
      { id: "a", schoolId: "school-a", subject: "数学", status: "active", isCurrent: true },
      { id: "b", schoolId: "school-b", subject: "英语", status: "active", isCurrent: false },
    ];
    teacher.currentAffiliationId = "a";
    const store = storeFor(appState);

    const created = await invokeRpc(store, session(), "lecture", "createLecture", [
      teacher.id, "school-a", {
        title: "跨校讲义", chapterIds: [], knowledgePointIds: [], grade: "高一",
        schoolYear: "2026-2027", classIds: ["class-at-school-a"], studentIds: [],
        sections: [],
      },
    ]) as Lecture;
    expect(created.schoolId).toBe("school-a");

    teacher.schoolId = "school-b";
    teacher.subject = "英语";
    teacher.currentAffiliationId = "b";
    teacher.affiliations[0].isCurrent = false;
    teacher.affiliations[1].isCurrent = true;
    const listed = await invokeRpc(store, session(), "lecture", "listLectures", [{
      teacherId: teacher.id,
    }]) as Lecture[];
    expect(listed.map((item) => item.id)).toContain(created.id);
    expect((await invokeRpc(store, session(), "lecture", "getLecture", [created.id]) as Lecture)?.schoolId)
      .toBe("school-a");

    // Extracted copies retain the original school's ownership and classification.
    const source = (appState.lectures as Lecture[]).find((item) => item.id === created.id)!;
    source.subject = undefined;
    const extracted = await invokeRpc(store, session(), "lecture", "createExtractCopy",
      [created.id, []]) as Lecture;
    expect(extracted).toMatchObject({
      schoolId: "school-a", subject: "数学", isExtractCopy: true,
      sourceResourceId: created.id,
    });

    const updated = await invokeRpc(store, session(), "lecture", "updateLecture", [
      created.id, { title: "跨校讲义修订" },
    ]) as Lecture;
    expect(updated).toMatchObject({
      title: "跨校讲义修订", schoolId: "school-a",
      classIds: ["class-at-school-a"],
    });

    const shared = await invokeRpc(store, session(), "share", "createShare", [{
      fromTeacherId: teacher.id, fromSchoolId: "school-b",
      toTeacherId: "teacher-2", scope: "friends", resourceType: "lecture",
      resourceId: created.id, resourceTitle: "跨校讲义修订",
    }]) as { fromSchoolId: string; resourceId: string };
    expect(shared).toMatchObject({ fromSchoolId: "school-b", resourceId: created.id });
    await expect(invokeRpc(store, session(), "lecture", "listLectures", [{
      teacherId: teacher.id, schoolId: "school-a",
    }])).rejects.toThrow("无权访问其他学校的数据");

    teacher.schoolId = "school-a";
    teacher.subject = "数学";
    teacher.currentAffiliationId = "a";
    const backInOriginalSchool = await invokeRpc(store, session(), "lecture", "listLectures",
      [{ teacherId: teacher.id }]) as Lecture[];
    expect(backInOriginalSchool.map((item) => item.id)).toContain(extracted.id);
  });

  it("still rejects another school's scope embedded in resource filters", async () => {
    const store = storeFor(state());

    await expect(invokeRpc(store, session(), "lecture", "listLectures", [{
      teacherId: "teacher-1",
      schoolId: "school-other",
    }])).rejects.toThrow("无权访问其他学校的数据");
  });
});
