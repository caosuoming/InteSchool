import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { prepService } from "./prep.js";
import type { Lecture, PrepTask, Teacher } from "../../src/types/index.js";

const now = "2026-08-02T06:00:00.000Z";

const teacher: Teacher = {
  id: "teacher-1",
  email: "teacher@example.com",
  name: "王老师",
  avatar: "",
  schoolId: "school-1",
  subject: "数学",
  teachingGrades: ["高一"],
  status: "active",
  role: "teacher",
  roles: ["teacher"],
  subjectGroupIds: ["subject-group-1"],
  prepGroupIds: ["prep-group-1"],
  affiliations: [],
  currentAffiliationId: null,
  createdAt: now,
};

function task(status: "pending" | "accepted" | "in_progress" = "accepted"): PrepTask {
  return {
    id: "task-1",
    schoolId: "school-1",
    subjectGroupId: "subject-group-1",
    prepGroupId: "prep-group-1",
    title: "函数专题集体备课",
    grade: "高一",
    subject: "数学",
    workflows: [{
      id: "workflow-1",
      type: "lecture",
      name: "编写函数讲义",
      order: 1,
      status: status === "pending" ? "created" : "in_progress",
      assigneeIds: [teacher.id],
      createdAt: now,
      updatedAt: now,
    }],
    assignments: [{
      id: "assignment-1",
      taskId: "task-1",
      workflowId: "workflow-1",
      teacherId: teacher.id,
      status,
      createdAt: now,
      updatedAt: now,
    }],
    status: status === "pending" ? "created" : "in_progress",
    createdBy: "teacher-2",
    createdAt: now,
    updatedAt: now,
  };
}

function lecture(): Lecture {
  return {
    id: "lecture-1",
    teacherId: teacher.id,
    schoolId: teacher.schoolId!,
    title: "函数概念讲义",
    chapterIds: [],
    knowledgePointIds: [],
    grade: "高一",
    schoolYear: "2026-2027",
    classIds: [],
    studentIds: [],
    sections: [{
      id: "section-1",
      title: "函数概念",
      type: "text",
      content: "<p>函数是两个非空数集之间的对应关系。</p>",
      children: [],
    }],
    version: 1,
    status: "draft",
    originalFileUrl: "/api/files/lecture-file",
    originalFileName: "函数讲义.docx",
    createdAt: now,
    updatedAt: now,
  };
}

function state(prepTask = task()): AppState {
  return {
    teachers: [teacher],
    prepTasks: [prepTask],
    lectures: [lecture()],
    examPapers: [],
    questions: [],
    questionReferences: [],
  } as unknown as AppState;
}

describe("prep task submissions", () => {
  it("requires a submitted deliverable before completing an assignment", async () => {
    const appState = state(task("in_progress"));

    await runWithState(appState, async () => {
      await expect(
        prepService.updateAssignment("task-1", "assignment-1", "completed", teacher),
      ).rejects.toThrow("请先提交文档、讲义、试卷或图片");

      await prepService.submitAssignment(
        "task-1",
        "assignment-1",
        {
          kind: "document",
          assets: [{
            id: "file-1",
            name: "函数教学设计.docx",
            url: "/api/files/file-1",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 2048,
          }],
        },
        teacher,
      );

      expect(appState.prepTasks[0].assignments[0]).toMatchObject({
        status: "in_progress",
        submission: {
          kind: "document",
          title: "函数教学设计.docx",
          submittedBy: teacher.id,
        },
      });

      await prepService.updateAssignment("task-1", "assignment-1", "completed", teacher);
      expect(appState.prepTasks[0].assignments[0].status).toBe("completed");
      expect(appState.prepTasks[0].workflows[0].status).toBe("completed");
      expect(appState.prepTasks[0].status).toBe("completed");
    });
  });

  it("only accepts resource links from the assignee's own resources", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      await prepService.submitAssignment(
        "task-1",
        "assignment-1",
        { kind: "resource", resourceType: "lecture", resourceId: "lecture-1" },
        teacher,
      );

      expect(appState.prepTasks[0].assignments[0].submission).toMatchObject({
        kind: "resource",
        resourceType: "lecture",
        resourceId: "lecture-1",
        resourceTitle: "函数概念讲义",
        resourceFileUrl: "/api/files/lecture-file",
      });
      expect(appState.prepTasks[0].assignments[0].submission?.resourcePreviewText)
        .toContain("函数是两个非空数集之间的对应关系");

      appState.prepTasks[0].assignments[0].status = "accepted";
      await expect(
        prepService.submitAssignment(
          "task-1",
          "assignment-1",
          { kind: "resource", resourceType: "lecture", resourceId: "missing" },
          teacher,
        ),
      ).rejects.toThrow("只能关联“我的资源”中的讲义");
    });
  });

  it("stores annotations only after the whole board is completed", async () => {
    const completedTask = task("in_progress");
    const appState = state(completedTask);

    await runWithState(appState, async () => {
      const submission = await prepService.submitAssignment(
        "task-1",
        "assignment-1",
        {
          kind: "images",
          assets: [{
            id: "image-1",
            name: "板书.png",
            url: "/api/files/image-1",
            mimeType: "image/png",
            size: 1024,
          }],
        },
        teacher,
      );

      await expect(
        prepService.saveSubmissionAnnotations(
          "task-1",
          "assignment-1",
          submission.assets[0].id,
          [{
            id: "stroke-1",
            tool: "pen",
            color: "red",
            points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
          }],
          teacher,
        ),
      ).rejects.toThrow("看板全部完成后才可以批注");

      await prepService.updateAssignment("task-1", "assignment-1", "completed", teacher);
      const saved = await prepService.saveSubmissionAnnotations(
        "task-1",
        "assignment-1",
        submission.assets[0].id,
        [{
          id: "stroke-1",
          tool: "highlighter",
          color: "yellow",
          points: [{ x: -1, y: 0.2 }, { x: 2, y: 0.4 }],
        }],
        teacher,
      );

      expect(saved).toEqual([
        expect.objectContaining({
          id: "stroke-1",
          targetId: "image-1",
          tool: "highlighter",
          color: "yellow",
          createdBy: teacher.id,
          points: [{ x: 0, y: 0.2 }, { x: 1, y: 0.4 }],
        }),
      ]);
    });
  });
});
