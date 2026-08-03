import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { prepService } from "./prep.js";
import type { ExamPaper, Teacher } from "../../src/types/index.js";

const now = "2026-08-03T03:00:00.000Z";

function teacher(id: string, schoolId = "school-1"): Teacher {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: "",
    schoolId,
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
}

const owner = teacher("owner");
const collaborator = teacher("collaborator");
const outsider = teacher("outsider");

function paper(): ExamPaper {
  return {
    id: "paper-1",
    teacherId: owner.id,
    schoolId: owner.schoolId!,
    title: "函数单元测试卷",
    description: "协作测试",
    grade: "高一",
    schoolYear: "2026-2027",
    semester: "上学期",
    duration: 90,
    totalScore: 10,
    chapterIds: [],
    knowledgePointIds: [],
    questions: [{
      id: "paper-question-1",
      stem: "函数的定义是什么？",
      answer: "略",
      analysis: "略",
      score: 10,
      type: "essay",
    }],
    contentBlocks: [],
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

function state(): AppState {
  return {
    teachers: [owner, collaborator, outsider],
    prepTasks: [],
    examPapers: [paper()],
    lectures: [],
    questions: [],
    questionReferences: [],
  } as unknown as AppState;
}

describe("prep linked-resource collaboration", () => {
  it("creates a protected shared task visible only to participants", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const created = await prepService.createResourceTask({
        resourceType: "examPaper",
        resourceId: "paper-1",
        collaboratorIds: [collaborator.id],
        password: "team-secret",
        passwordExpiresAt: "2027-08-03T03:00:00.000Z",
      }, owner);

      expect(created).toMatchObject({
        linkedResource: { type: "examPaper", id: "paper-1" },
        accessProtected: true,
      });
      expect(created.viewPasswordHash).toBeUndefined();
      expect(appState.prepTasks[0].viewPasswordHash).toMatch(/^scrypt\$/);
      expect(appState.prepTasks[0].assignments.map((item) => item.teacherId).sort())
        .toEqual([collaborator.id, owner.id].sort());

      const collaboratorTasks = await prepService.listTasks("school-1", undefined, collaborator);
      expect(collaboratorTasks).toHaveLength(1);
      expect(collaboratorTasks[0].viewPasswordHash).toBeUndefined();

      const outsiderTasks = await prepService.listTasks("school-1", undefined, outsider);
      expect(outsiderTasks).toHaveLength(0);
    });
  });

  it("requires the password for collaborators and supports shared edits and comments", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const task = await prepService.createResourceTask({
        resourceType: "examPaper",
        resourceId: "paper-1",
        collaboratorIds: [collaborator.id],
        password: "team-secret",
      }, owner);

      await expect(
        prepService.getLinkedResource(task.id, undefined, collaborator),
      ).rejects.toThrow("需要访问密码");
      await expect(
        prepService.getLinkedResource(task.id, "wrong", collaborator),
      ).rejects.toThrow("访问密码错误");
      await expect(
        prepService.getLinkedResource(task.id, "team-secret", outsider),
      ).rejects.toThrow("无权访问");

      const opened = await prepService.getLinkedResource(task.id, "team-secret", collaborator);
      expect(opened.resource.title).toBe("函数单元测试卷");

      const updated = await prepService.updateLinkedResource(
        task.id,
        { title: "函数单元协作终稿" },
        "team-secret",
        collaborator,
      );
      expect(updated.title).toBe("函数单元协作终稿");
      expect(appState.examPapers[0].title).toBe("函数单元协作终稿");
      expect(appState.prepTasks[0].title).toBe("函数单元协作终稿");

      const comment = await prepService.addResourceComment(
        task.id,
        { targetId: "paper-question-1", content: "建议补充定义域条件。" },
        "team-secret",
        collaborator,
      );
      expect(comment).toMatchObject({
        targetId: "paper-question-1",
        createdBy: collaborator.id,
      });
      expect(appState.prepTasks[0].resourceComments).toHaveLength(1);

      await prepService.deleteResourceComment(task.id, comment.id, undefined, owner);
      expect(appState.prepTasks[0].resourceComments).toEqual([]);
    });
  });

  it("rejects duplicate tasks and invalid comment targets", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const task = await prepService.createResourceTask({
        resourceType: "examPaper",
        resourceId: "paper-1",
        collaboratorIds: [collaborator.id],
      }, owner);

      await expect(prepService.createResourceTask({
        resourceType: "examPaper",
        resourceId: "paper-1",
        collaboratorIds: [collaborator.id],
      }, owner)).rejects.toThrow("已经加入集体备课");

      await expect(prepService.addResourceComment(
        task.id,
        { targetId: "missing", content: "无效批注" },
        undefined,
        collaborator,
      )).rejects.toThrow("批注段落不存在");
    });
  });
});
