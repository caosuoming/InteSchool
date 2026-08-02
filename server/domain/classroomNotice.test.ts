import { describe, expect, it } from "vitest";
import type { ClassroomNotice } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { classroomNoticeService } from "./classroomNotice.js";

const now = "2026-08-02T08:00:00.000Z";

function createState(): AppState {
  return {
    currentTeacherId: "teacher-1",
    teachers: [{
      id: "teacher-1",
      email: "teacher@example.com",
      name: "王老师",
      avatar: "王",
      schoolId: "school-1",
      subject: "数学",
      teachingClassIds: ["class-1"],
      homeroomClassIds: [],
      status: "active",
      role: "teacher",
      roles: ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      affiliations: [{
        id: "affiliation-1",
        teacherId: "teacher-1",
        schoolId: "school-1",
        schoolName: "示例中学",
        subject: "数学",
        teachingClassIds: ["class-1"],
        homeroomClassIds: [],
        status: "active",
        role: "teacher",
        roles: ["teacher"],
        subjectGroupIds: [],
        prepGroupIds: [],
        isCurrent: true,
        joinedAt: now,
      }],
      currentAffiliationId: "affiliation-1",
      createdAt: now,
    }],
    schoolClasses: [
      {
        id: "class-1",
        type: "school",
        schoolId: "school-1",
        name: "高一（1）班",
        grade: "高一",
        studentCount: 40,
        status: "active",
        createdBy: "teacher-1",
        createdAt: now,
      },
      {
        id: "class-2",
        type: "school",
        schoolId: "school-1",
        name: "高一（2）班",
        grade: "高一",
        studentCount: 39,
        status: "active",
        createdBy: "teacher-2",
        createdAt: now,
      },
    ],
    classroomNotices: [],
  };
}

function notice(overrides: Partial<ClassroomNotice>): ClassroomNotice {
  return {
    id: "notice-1",
    teacherId: "teacher-1",
    teacherName: "王老师",
    schoolId: "school-1",
    content: "今天放学后进行卫生检查",
    classIds: ["class-1"],
    startsAt: "2000-01-01T00:00:00.000Z",
    endsAt: "2999-01-01T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("classroomNoticeService", () => {
  it("publishes a trimmed notice to the teacher's assigned class", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const created = await classroomNoticeService.createNotice("teacher-1", "school-1", {
        content: "  今天放学后进行卫生检查  ",
        classIds: ["class-1", "class-1"],
        startsAt: "2026-08-02T08:00:00.000Z",
        endsAt: "2026-08-02T18:00:00.000Z",
      });

      expect(created).toMatchObject({
        teacherName: "王老师",
        content: "今天放学后进行卫生检查",
        classIds: ["class-1"],
      });
      await expect(classroomNoticeService.listNotices({
        schoolId: "school-1",
        classId: "class-1",
      })).resolves.toEqual([created]);
    });
  });

  it("only returns notices inside their display interval", async () => {
    const state = createState();
    state.classroomNotices = [
      notice({ id: "active" }),
      notice({ id: "future", startsAt: "2998-01-01T00:00:00.000Z", endsAt: "2999-01-01T00:00:00.000Z" }),
      notice({ id: "expired", startsAt: "2000-01-01T00:00:00.000Z", endsAt: "2001-01-01T00:00:00.000Z" }),
    ];

    await runWithState(state, async () => {
      const visible = await classroomNoticeService.listNotices({ classId: "class-1", activeOnly: true });
      expect(visible.map((item) => item.id)).toEqual(["active"]);
    });
  });

  it("rejects other classes and invalid time ranges", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await expect(classroomNoticeService.createNotice("teacher-1", "school-1", {
        content: "通知",
        classIds: ["class-2"],
        startsAt: now,
        endsAt: "2026-08-02T18:00:00.000Z",
      })).rejects.toThrow("只能向自己的任教班级发布通知");

      await expect(classroomNoticeService.createNotice("teacher-1", "school-1", {
        content: "通知",
        classIds: ["class-1"],
        startsAt: "2026-08-02T18:00:00.000Z",
        endsAt: now,
      })).rejects.toThrow("通知结束时间必须晚于开始时间");
    });
  });
});
