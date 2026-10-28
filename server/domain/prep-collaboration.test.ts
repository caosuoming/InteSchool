import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { db, runWithState } from "../runtime-db.js";
import { prepService } from "./prep.js";
import { examPaperService } from "./examPaper.js";
import { lectureService } from "./lecture.js";
import { buildAnswerSheetQrPayload } from "../../src/lib/answer-sheet-qr.js";
import type { AnswerRecord, AppNotification, ExamPaper, Teacher } from "../../src/types/index.js";

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
    notifications: [],
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
      expect(appState.notifications as AppNotification[]).toEqual([
        expect.objectContaining({
          recipientTeacherId: collaborator.id,
          type: "mention",
          title: "你被 @ 到新的协作任务",
          actionUrl: `/prep/tasks/${created.id}`,
          readAt: null,
        }),
      ]);

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

  it("invalidates collaborative paper edits and issues a different answer sheet QR", async () => {
    await runWithState(state(), async () => {
      const task = await prepService.createResourceTask({
        resourceType: "examPaper", resourceId: "paper-1", collaboratorIds: [collaborator.id],
      }, owner);
      const original = (await examPaperService.markAnswerSheetCreated("paper-1"))!;
      const qrBefore = buildAnswerSheetQrPayload("exam-paper", original.id, original.answerSheetRevisionId);

      const administrativeEdit = await prepService.updateLinkedResource(task.id, { classIds: ["class-1"] }, undefined, collaborator);
      expect(administrativeEdit.answerSheetRevisionId).toBe(original.answerSheetRevisionId);

      const changed = await prepService.updateLinkedResource(task.id, { layoutMode: "flat" }, undefined, collaborator);
      expect(changed).toMatchObject({ layoutMode: "flat", hasAnswerSheet: undefined });
      expect(changed.answerSheetRevisionId).toBeUndefined();
      expect(changed.answerSheetCreatedAt).toBeUndefined();
      expect(changed.answerSheetSettings).toBeUndefined();
      await expect(examPaperService.publishAnswerSheet("paper-1")).rejects.toThrow("请先制作答题卡");

      const remade = (await examPaperService.markAnswerSheetCreated("paper-1"))!;
      expect(buildAnswerSheetQrPayload("exam-paper", remade.id, remade.answerSheetRevisionId)).not.toBe(qrBefore);
      const replaced = await prepService.updateLinkedResource(task.id, {
        questions: [{ ...paper().questions[0], stem: "修改后的题目" }],
      }, undefined, collaborator);
      expect(replaced.hasAnswerSheet).toBeUndefined();
      await examPaperService.markAnswerSheetCreated("paper-1");
      await examPaperService.publishAnswerSheet("paper-1");
      await expect(prepService.updateLinkedResource(task.id, { title: "不可编辑" }, undefined, collaborator))
        .rejects.toThrow("撤回发布");
    });
  });

  it("invalidates collaborative lecture edits and respects the used-document lock", async () => {
    await runWithState(state(), async () => {
      const lecture = await lectureService.createLecture(owner.id, owner.schoolId!, {
        title: "函数讲义", chapterIds: [], knowledgePointIds: [], grade: "高一", schoolYear: "2026-2027",
        classIds: [], studentIds: [], sections: [{ id: "sec-1", title: "题一", type: "question", content: "原题", children: [] }],
      });
      const task = await prepService.createResourceTask({
        resourceType: "lecture", resourceId: lecture.id, collaboratorIds: [collaborator.id],
      }, owner);
      const original = (await lectureService.markAnswerSheetCreated(lecture.id))!;
      const updated = await prepService.updateLinkedResource(task.id, {
        sections: [{ ...lecture.sections[0], content: "替换后的题目" }],
      }, undefined, collaborator);
      expect(updated.hasAnswerSheet).toBeUndefined();
      expect(updated.answerSheetRevisionId).toBeUndefined();
      expect((await lectureService.getLecture(lecture.id))?.version).toBe(lecture.version + 1);
      const remade = (await lectureService.markAnswerSheetCreated(lecture.id))!;
      expect(remade.answerSheetRevisionId).not.toBe(original.answerSheetRevisionId);
      expect(buildAnswerSheetQrPayload("lecture", lecture.id, remade.answerSheetRevisionId))
        .not.toBe(buildAnswerSheetQrPayload("lecture", lecture.id, original.answerSheetRevisionId));

      await lectureService.publishAnswerSheet(lecture.id);
      await expect(prepService.updateLinkedResource(task.id, { title: "已发布仍修改" }, undefined, collaborator))
        .rejects.toThrow("撤回发布");
      await lectureService.unpublishAnswerSheet(lecture.id);
      const record: AnswerRecord = {
        id: "answer-1", studentId: "student-1", questionId: "question-1", lectureId: lecture.id,
        isCorrect: true, score: "correct", answeredAt: now,
      };
      db.update("answerRecords", (records: AnswerRecord[] = []) => [...records, record]);
      await expect(prepService.updateLinkedResource(task.id, { title: "已使用仍修改" }, undefined, collaborator))
        .rejects.toThrow("文档已用");
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

  it("creates an unread mention when a teacher is @ assigned to a board workflow", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const task = await prepService.createTask(
        "school-1",
        "subject-group-1",
        {
          title: "高一函数集体备课",
          grade: "高一",
          subject: "数学",
          workflows: [{ type: "review", name: "复习计划" }],
        },
        owner.id,
      );
      await prepService.assignTask(task.id, task.workflows[0].id, [owner.id, collaborator.id]);

      const notifications = appState.notifications as AppNotification[];
      expect(notifications).toEqual([
        expect.objectContaining({
          recipientTeacherId: collaborator.id,
          type: "mention",
          title: "你被 @ 到新的备课任务",
          actionUrl: `/prep/tasks/${task.id}`,
          readAt: null,
        }),
      ]);
      expect(notifications.some((item) => item.recipientTeacherId === owner.id)).toBe(false);
    });
  });
});
