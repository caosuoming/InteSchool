import { describe, expect, it } from "vitest";
import type { ClassroomHomework } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import type { AppState } from "../types.js";
import { classroomHomeworkService } from "./classroomHomework.js";

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
    classroomHomeworks: [],
  };
}

function homework(overrides: Partial<ClassroomHomework>): ClassroomHomework {
  return {
    id: "homework-1",
    teacherId: "teacher-1",
    teacherName: "王老师",
    schoolId: "school-1",
    subject: "数学",
    content: "完成课本第 42 页第 1—6 题",
    classIds: ["class-1"],
    assignedDate: "2026-08-02",
    publishAt: "2020-01-01T00:00:00.000Z",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("classroomHomeworkService", () => {
  it("publishes homework with the active affiliation subject and lists it by class", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const created = await classroomHomeworkService.createHomework("teacher-1", "school-1", {
        content: "  完成课本第 42 页第 1—6 题  ",
        classIds: ["class-1", "class-1"],
        assignedDate: "2026-08-02",
        publishAt: "2026-08-02T08:00:00.000Z",
      });

      expect(created).toMatchObject({
        teacherName: "王老师",
        subject: "数学",
        content: "完成课本第 42 页第 1—6 题",
        classIds: ["class-1"],
      });
      await expect(classroomHomeworkService.listHomeworks({
        schoolId: "school-1",
        classId: "class-1",
        assignedDate: "2026-08-02",
      })).resolves.toEqual([created]);
    });
  });

  it("publishes attachment-only homework and normalizes stored file metadata", async () => {
    const state = createState();

    await runWithState(state, async () => {
      const created = await classroomHomeworkService.createHomework("teacher-1", "school-1", {
        content: "",
        attachments: [{
          id: "file-1",
          name: "  函数图像.pdf  ",
          url: "/api/files/file-1",
          mimeType: "application/pdf",
          size: 4096,
        }],
        classIds: ["class-1"],
        assignedDate: "2026-08-02",
        publishAt: now,
      });

      expect(created).toMatchObject({
        content: "",
        attachments: [{
          id: "file-1",
          name: "函数图像.pdf",
          url: "/api/files/file-1",
          mimeType: "application/pdf",
          size: 4096,
        }],
      });
    });
  });

  it("rejects mismatched attachment identifiers", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await expect(classroomHomeworkService.createHomework("teacher-1", "school-1", {
        content: "查看附件",
        attachments: [{
          id: "file-1",
          name: "函数图像.pdf",
          url: "/api/files/file-2",
          mimeType: "application/pdf",
          size: 4096,
        }],
        classIds: ["class-1"],
        assignedDate: "2026-08-02",
        publishAt: now,
      })).rejects.toThrow("作业附件信息不完整");
    });
  });

  it("only returns scheduled homework after its publish time", async () => {
    const state = createState();
    state.classroomHomeworks = [
      homework({ id: "published", publishAt: "2020-01-01T00:00:00.000Z" }),
      homework({ id: "scheduled", publishAt: "2999-01-01T00:00:00.000Z" }),
    ];

    await runWithState(state, async () => {
      const visible = await classroomHomeworkService.listHomeworks({
        classId: "class-1",
        assignedDate: "2026-08-02",
        publishedOnly: true,
      });
      expect(visible.map((item) => item.id)).toEqual(["published"]);
    });
  });

  it("rejects publishing to a class outside the teacher assignment", async () => {
    const state = createState();

    await runWithState(state, async () => {
      await expect(classroomHomeworkService.createHomework("teacher-1", "school-1", {
        content: "完成练习",
        classIds: ["class-2"],
        assignedDate: "2026-08-02",
        publishAt: now,
      })).rejects.toThrow("只能向自己的任教班级发布作业");
    });
  });

  it("deletes an existing homework", async () => {
    const state = createState();
    state.classroomHomeworks = [homework({})];

    await runWithState(state, async () => {
      await classroomHomeworkService.deleteHomework("homework-1");
      expect(state.classroomHomeworks).toEqual([]);
      await expect(classroomHomeworkService.deleteHomework("missing")).rejects.toThrow("作业不存在");
    });
  });
});
