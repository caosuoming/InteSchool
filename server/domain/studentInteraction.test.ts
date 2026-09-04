import { describe, expect, it, vi } from "vitest";
import type { AppState } from "../types.js";
import type { DatabaseStore } from "../database.js";
import type { SessionUser } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { invokeRpc } from "../rpc.js";
import { studentInteractionService } from "./studentInteraction.js";

const teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "任课教师",
  avatar: "任",
  schoolId: "school-1",
  subject: "数学",
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: [],
  prepGroupIds: [],
  teachingClassIds: ["class-1"],
  affiliations: [{
    id: "aff-1",
    teacherId: "teacher-1",
    schoolId: "school-1",
    schoolName: "测试学校",
    subject: "数学",
    status: "active",
    role: "teacher",
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    teachingClassIds: ["class-1"],
    homeroomClassIds: [],
    isCurrent: true,
    joinedAt: "2026-01-01T00:00:00.000Z",
  }],
  currentAffiliationId: "aff-1",
  createdAt: "2026-01-01T00:00:00.000Z",
} as any;

const homeroomTeacher = {
  ...teacher,
  id: "teacher-homeroom",
  email: "homeroom@example.com",
  name: "班主任",
  subject: "语文",
  teachingClassIds: [],
  homeroomClassIds: ["class-1"],
  affiliations: [{
    ...teacher.affiliations[0],
    id: "aff-homeroom",
    teacherId: "teacher-homeroom",
    subject: "语文",
    teachingClassIds: [],
    homeroomClassIds: ["class-1"],
  }],
  currentAffiliationId: "aff-homeroom",
} as any;

function state(): AppState {
  return {
    currentTeacherId: null,
    teachers: [teacher, homeroomTeacher],
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高一(1)班",
        grade: "高一",
        studentCount: 1,
        status: "active",
        createdBy: "teacher-2",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "class-2",
        type: "school",
        schoolId: "school-1",
        name: "高一(2)班",
        grade: "高一",
        studentCount: 1,
        status: "active",
        createdBy: "teacher-1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    personalClasses: [{
      id: "personal-1",
      type: "personal",
      teacherId: "teacher-1",
      name: "竞赛班",
      description: "个人教学班",
      studentIds: ["student-personal"],
      createdAt: "2026-01-01T00:00:00.000Z",
    }],
    students: [
      { id: "student-1", name: "已授权学生", studentNo: "001", classId: "class-1", schoolId: "school-1", grade: "高一", status: "active" },
      { id: "student-2", name: "未授权学生", studentNo: "002", classId: "class-2", schoolId: "school-1", grade: "高一", status: "active" },
      { id: "student-personal", name: "个人班学生", studentNo: "003", classId: "personal-1", schoolId: "school-1", grade: "高一", status: "active" },
    ],
    studentInteractionFollows: [],
    studentInteractions: [
      {
        id: "interaction-own",
        studentId: "student-1",
        teacherId: "teacher-1",
        schoolId: "school-1",
        type: "chat",
        content: "自己的记录",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "interaction-other",
        studentId: "student-1",
        teacherId: "teacher-2",
        schoolId: "school-1",
        type: "chat",
        content: "其他教师私密记录",
        createdAt: "2026-01-03T00:00:00.000Z",
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "interaction-shared",
        studentId: "student-1",
        teacherId: "teacher-2",
        schoolId: "school-1",
        type: "status",
        content: "需要班主任共同关注",
        sharedWithHomeroom: true,
        createdAt: "2026-01-04T00:00:00.000Z",
        updatedAt: "2026-01-04T00:00:00.000Z",
      },
    ],
  } as AppState;
}

describe("student interaction scope", () => {
  it("keeps records private by default and shares selected records anonymously with the homeroom teacher", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(studentInteractionService.listByStudent("student-1", teacher))
        .resolves.toEqual([
          expect.objectContaining({
            id: "interaction-own",
            teacherId: "teacher-1",
            isAnonymous: false,
            canDelete: true,
          }),
        ]);

      const homeroomRecords = await studentInteractionService.listByStudent("student-1", homeroomTeacher);
      expect(homeroomRecords).toEqual([
        expect.objectContaining({
          id: "interaction-shared",
          isAnonymous: true,
          canDelete: false,
        }),
      ]);
      expect(homeroomRecords[0]).not.toHaveProperty("teacherId");
      await expect(studentInteractionService.listByTeacher("teacher-homeroom", homeroomTeacher))
        .resolves.toEqual([
          expect.objectContaining({ id: "interaction-shared", isAnonymous: true }),
        ]);

      await expect(studentInteractionService.listByStudent("student-2", teacher))
        .rejects.toThrow("只能访问自己任教班级或个人教学班的学生");
      await expect(studentInteractionService.createInteraction(
        "teacher-1",
        "school-1",
        { studentId: "student-2", type: "chat", content: "越权记录" },
        teacher,
      )).rejects.toThrow("只能访问自己任教班级或个人教学班的学生");
      await expect(studentInteractionService.createInteraction(
        "teacher-1",
        "school-1",
        { studentId: "student-personal", type: "chat", content: "辅导记录" },
        teacher,
      )).resolves.toMatchObject({ studentId: "student-personal", teacherId: "teacher-1" });

      await expect(studentInteractionService.createInteraction(
        "teacher-1",
        "school-1",
        {
          studentId: "student-1",
          type: "chat",
          content: "请班主任关注",
          shareWithHomeroom: true,
        },
        teacher,
      )).resolves.toMatchObject({ sharedWithHomeroom: true });

      await expect(studentInteractionService.deleteInteraction("interaction-shared", homeroomTeacher))
        .rejects.toThrow("不能删除其他教师的互动记录");
    });
  });

  it("persists per-teacher followed students and rejects following inaccessible students", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(studentInteractionService.listFollowedStudentIds(teacher)).resolves.toEqual([]);
      await expect(studentInteractionService.setStudentFollowed("student-1", true, teacher)).resolves.toBeUndefined();
      await expect(studentInteractionService.listFollowedStudentIds(teacher)).resolves.toEqual(["student-1"]);

      await expect(studentInteractionService.setStudentFollowed("student-2", true, teacher))
        .rejects.toThrow("只能访问自己任教班级或个人教学班的学生");

      await expect(studentInteractionService.setStudentFollowed("student-1", false, teacher)).resolves.toBeUndefined();
      await expect(studentInteractionService.listFollowedStudentIds(teacher)).resolves.toEqual([]);
    });
  });

  it("accepts validated image-only chats and rejects invalid attachments", async () => {
    const appState = state();
    await runWithState(appState, async () => {
      await expect(studentInteractionService.createInteraction(
        "teacher-1",
        "school-1",
        {
          studentId: "student-1",
          type: "chat",
          content: "",
          attachments: [{
            id: "file-1",
            name: "截图.png",
            url: "/api/files/file-1",
            mimeType: "image/png",
            size: 128,
          }],
        },
        teacher,
      )).resolves.toMatchObject({
        content: "",
        attachments: [expect.objectContaining({ id: "file-1", mimeType: "image/png" })],
      });

      await expect(studentInteractionService.createInteraction(
        "teacher-1",
        "school-1",
        {
          studentId: "student-1",
          type: "chat",
          content: "",
          attachments: [{
            id: "file-2",
            name: "not-image.pdf",
            url: "/api/files/file-2",
            mimeType: "application/pdf",
            size: 128,
          }],
        },
        teacher,
      )).rejects.toThrow("聊天记录只能上传图片");
    });
  });

  it("injects the authenticated teacher and persists follow mutations through RPC", async () => {
    const appState = state();
    const store = {
      loadState: vi.fn(() => appState),
      saveState: vi.fn(),
    } as unknown as DatabaseStore;
    const session = {
      userId: "user-1",
      teacherId: teacher.id,
      email: teacher.email,
      csrfToken: "csrf",
      expiresAt: "2099-01-01T00:00:00.000Z",
    } as SessionUser;

    await expect(invokeRpc(
      store,
      session,
      "studentInteraction",
      "setStudentFollowed",
      ["student-1", true],
    )).resolves.toBeUndefined();

    expect(store.saveState).toHaveBeenCalledTimes(1);
    const persisted = vi.mocked(store.saveState).mock.calls[0][1] as AppState;
    expect(persisted.studentInteractionFollows).toEqual([
      expect.objectContaining({ teacherId: "teacher-1", studentId: "student-1", schoolId: "school-1" }),
    ]);
  });
});
