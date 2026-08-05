import type {
  PrepTask,
  PrepWorkflow,
  PrepAssignment,
  PrepTaskType,
  PrepTaskStatus,
  AssignmentStatus,
  PrepSubmission,
  PrepSubmissionAsset,
  PrepSubmissionInput,
  PrepAnnotationStroke,
  PrepResourceComment,
  PrepResourceTaskInput,
  QuestionReference,
  Question,
  Teacher,
  LectureSection,
  ExamPaper,
  Lecture,
} from "../../src/types/index.js";
import { sanitizeExamPaperPatch, sanitizeLecturePatch } from "./document-resource-lock.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

/** 流程类型中文标签 */
export const taskTypeLabels: Record<PrepTaskType, string> = {
  paper: "出试卷",
  lecture: "编讲义",
  exercise: "出作业",
  review: "复习计划",
  literatureReview: "文献综述",
  examAnalysis: "试卷分析",
  research: "专题研究",
  gradeAnalysis: "学生成绩分析",
};

/** 任务状态中文标签 */
export const taskStatusLabels: Record<PrepTaskStatus, string> = {
  created: "已创建",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

/** 分配状态中文标签 */
export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  pending: "待认领",
  accepted: "已认领",
  in_progress: "进行中",
  completed: "已完成",
  rejected: "已拒绝",
};

const PREP_MANAGER_ROLES = new Set([
  "prepLeader",
  "subjectLeader",
  "dean",
  "vicePrincipal",
  "principal",
  "school_admin",
  "platform_admin",
]);

function canManageTask(task: PrepTask, teacher: Teacher): boolean {
  return task.createdBy === teacher.id || teacher.roles.some((role) => PREP_MANAGER_ROLES.has(role));
}

function assertAssignmentAccess(
  task: PrepTask,
  assignment: PrepAssignment,
  teacher: Teacher | undefined,
): void {
  if (!teacher) return;
  if (assignment.teacherId !== teacher.id && !canManageTask(task, teacher)) {
    throw new Error("只能操作分配给自己的任务");
  }
}

function recalculateTask(task: PrepTask): PrepTask {
  const workflows = task.workflows.map((workflow) => {
    const assignments = task.assignments.filter((assignment) => assignment.workflowId === workflow.id);
    let status: PrepTaskStatus = "created";
    if (assignments.length > 0 && assignments.every((assignment) => assignment.status === "completed")) {
      status = "completed";
    } else if (
      assignments.some((assignment) =>
        ["accepted", "in_progress", "completed"].includes(assignment.status),
      )
    ) {
      status = "in_progress";
    }
    return status === workflow.status
      ? workflow
      : { ...workflow, status, updatedAt: new Date().toISOString() };
  });

  let status: PrepTaskStatus = task.status === "cancelled" ? "cancelled" : "created";
  if (status !== "cancelled") {
    if (workflows.length > 0 && workflows.every((workflow) => workflow.status === "completed")) {
      status = "completed";
    } else if (workflows.some((workflow) => workflow.status === "in_progress" || workflow.status === "completed")) {
      status = "in_progress";
    }
  }

  return {
    ...task,
    workflows,
    status,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAsset(asset: PrepSubmissionAsset): PrepSubmissionAsset {
  const id = String(asset.id || "").trim();
  const name = String(asset.name || "").trim().slice(0, 200);
  const url = String(asset.url || "").trim();
  const mimeType = String(asset.mimeType || "application/octet-stream").trim().slice(0, 120);
  const size = Number(asset.size);
  if (!id || !name || !/^\/api\/files\/[A-Za-z0-9-]+$/.test(url)) {
    throw new Error("上传文件信息不合法");
  }
  if (!Number.isFinite(size) || size < 0) throw new Error("上传文件大小不合法");
  return { id, name, url, mimeType, size };
}

function plainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lecturePreview(sections: LectureSection[], depth = 0): string[] {
  return sections.flatMap((section) => [
    `${"  ".repeat(depth)}${section.title}`,
    section.content ? plainText(section.content) : "",
    ...lecturePreview(section.children || [], depth + 1),
  ].filter(Boolean));
}

function buildResourceSubmission(
  input: Extract<PrepSubmissionInput, { kind: "resource" }>,
  teacher: Teacher,
): Omit<PrepSubmission, "id" | "submittedAt" | "updatedAt" | "annotations"> {
  if (input.resourceType === "lecture") {
    const lecture = db.read("lectures").find((item) => item.id === input.resourceId);
    if (!lecture || lecture.teacherId !== teacher.id || lecture.schoolId !== teacher.schoolId) {
      throw new Error("只能关联“我的资源”中的讲义");
    }
    return {
      kind: "resource",
      title: lecture.title,
      submittedBy: teacher.id,
      assets: [],
      resourceType: "lecture",
      resourceId: lecture.id,
      resourceTitle: lecture.title,
      resourceFileUrl: lecture.originalFileUrl,
      resourceFileName: lecture.originalFileName,
      resourcePreviewText: lecturePreview(lecture.sections || []).join("\n\n").slice(0, 200_000),
    };
  }

  const paper = db.read("examPapers").find((item) => item.id === input.resourceId);
  if (!paper || paper.teacherId !== teacher.id || paper.schoolId !== teacher.schoolId) {
    throw new Error("只能关联“我的资源”中的试卷");
  }
  const preview = (paper.questions || []).flatMap((question, index) => [
    `${index + 1}. ${plainText(question.stem || "")}`,
    ...(question.options || []).map((option, optionIndex) =>
      `${String.fromCharCode(65 + optionIndex)}. ${plainText(option)}`,
    ),
    question.answer ? `答案：${plainText(question.answer)}` : "",
    question.analysis ? `解析：${plainText(question.analysis)}` : "",
  ].filter(Boolean));
  return {
    kind: "resource",
    title: paper.title,
    submittedBy: teacher.id,
    assets: [],
    resourceType: "examPaper",
    resourceId: paper.id,
    resourceTitle: paper.title,
    resourceFileUrl: paper.originalFileUrl,
    resourceFileName: paper.originalFileName,
    resourcePreviewText: preview.join("\n\n").slice(0, 200_000),
  };
}

function submissionTargetIds(submission: PrepSubmission): Set<string> {
  const ids = new Set(submission.assets.map((asset) => asset.id));
  if (submission.resourceId) ids.add(`resource:${submission.resourceId}`);
  return ids;
}

function publicTask(task: PrepTask): PrepTask {
  const { viewPasswordHash, ...visible } = task;
  return {
    ...visible,
    accessProtected: Boolean(viewPasswordHash),
    resourceComments: task.resourceComments || [],
  };
}

function isTaskParticipant(task: PrepTask, teacherId: string): boolean {
  return task.createdBy === teacherId
    || task.assignments.some((assignment) => assignment.teacherId === teacherId);
}

function assertLinkedResourceAccess(
  task: PrepTask,
  teacher: Teacher,
  password?: string,
): void {
  if (!task.linkedResource) throw new Error("该任务未关联协作文档");
  if (task.schoolId !== teacher.schoolId || !isTaskParticipant(task, teacher.id)) {
    throw new Error("无权访问该协作文档");
  }
  if (task.createdBy === teacher.id || !task.viewPasswordHash) return;
  if (task.passwordExpiresAt && new Date(task.passwordExpiresAt) <= new Date()) {
    throw new Error("访问密码已过期，请联系创建人更新");
  }
  if (!password) throw new Error("需要访问密码");
  if (!verifyPassword(password, task.viewPasswordHash)) throw new Error("访问密码错误");
}

function linkedResource(task: PrepTask): ExamPaper | Lecture {
  if (!task.linkedResource) throw new Error("该任务未关联协作文档");
  const collection = task.linkedResource.type === "examPaper" ? "examPapers" : "lectures";
  const resource = db.read(collection).find((item) => item.id === task.linkedResource?.id);
  if (!resource) throw new Error("协作文档不存在");
  return resource;
}

function lectureTargetIds(sections: LectureSection[]): string[] {
  return sections.flatMap((section) => [section.id, ...lectureTargetIds(section.children || [])]);
}

function linkedResourceTargetIds(resource: ExamPaper | Lecture): Set<string> {
  if ("questions" in resource) {
    return new Set([
      ...resource.questions.map((question) => question.id),
      ...(resource.contentBlocks || []).map((block) => block.id),
    ]);
  }
  return new Set(lectureTargetIds(resource.sections));
}

function normalizePasswordSettings(input: PrepResourceTaskInput): {
  viewPasswordHash?: string;
  passwordExpiresAt?: string;
} {
  const password = input.password?.trim() || "";
  if (password.length > 128) throw new Error("访问密码过长");
  if (input.passwordExpiresAt && !password) throw new Error("设置失效时间前请先设置访问密码");
  if (!input.passwordExpiresAt) {
    return password ? { viewPasswordHash: hashPassword(password) } : {};
  }
  const expiresAt = new Date(input.passwordExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new Error("密码失效时间必须晚于当前时间");
  }
  return {
    viewPasswordHash: hashPassword(password),
    passwordExpiresAt: expiresAt.toISOString(),
  };
}

export const prepService = {
  // ============ 备课任务管理 ============

  async listTasks(schoolId: string, teacherId?: string, teacher?: Teacher): Promise<PrepTask[]> {
    await delay(200);
    let tasks = db.read("prepTasks").filter((t) => t.schoolId === schoolId);

    const viewerId = teacher?.id || teacherId;
    if (viewerId) {
      tasks = tasks.filter((task) => !task.linkedResource || isTaskParticipant(task, viewerId));
    }

    if (teacherId) {
      tasks = tasks.filter(
        (t) =>
          t.createdBy === teacherId ||
          t.assignments.some((a) => a.teacherId === teacherId),
      );
    }

    return tasks
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(publicTask);
  },

  async getTask(taskId: string, password?: string, teacher?: Teacher): Promise<PrepTask | null> {
    await delay(150);
    const task = db.read("prepTasks").find((t) => t.id === taskId) || null;
    if (!task) return null;
    if (task.linkedResource && teacher) assertLinkedResourceAccess(task, teacher, password);
    return publicTask(task);
  },

  async createResourceTask(input: PrepResourceTaskInput, teacher: Teacher): Promise<PrepTask> {
    await delay(250);
    const collection = input.resourceType === "examPaper" ? "examPapers" : "lectures";
    const resource = db.read(collection).find((item) => item.id === input.resourceId);
    if (!resource) throw new Error("资源不存在");
    if (resource.teacherId !== teacher.id || resource.schoolId !== teacher.schoolId) {
      throw new Error("只能将自己的试卷或讲义添加到集体备课");
    }

    const collaboratorIds = [...new Set(input.collaboratorIds.filter(Boolean))]
      .filter((id) => id !== teacher.id);
    if (collaboratorIds.length === 0) throw new Error("请至少选择一位协作教师");
    const schoolTeacherIds = new Set(
      db.read("teachers")
        .filter((item) => item.schoolId === teacher.schoolId)
        .map((item) => item.id),
    );
    if (collaboratorIds.some((id) => !schoolTeacherIds.has(id))) {
      throw new Error("协作对象必须是本校教师");
    }

    const existing = db.read("prepTasks").find((task) =>
      task.linkedResource?.type === input.resourceType
      && task.linkedResource.id === input.resourceId
      && task.status !== "cancelled",
    );
    if (existing) throw new Error("该文档已经加入集体备课");

    const now = new Date().toISOString();
    const taskId = genId("pt");
    const workflowId = genId("wf");
    const participantIds = [teacher.id, ...collaboratorIds];
    const workflow: PrepWorkflow = {
      id: workflowId,
      type: input.resourceType === "examPaper" ? "paper" : "lecture",
      name: input.resourceType === "examPaper" ? "协作编辑试卷" : "协作编辑讲义",
      description: "共同编辑文档并在段落旁添加批注",
      order: 1,
      status: "in_progress",
      assigneeIds: participantIds,
      createdAt: now,
      updatedAt: now,
    };
    const assignments: PrepAssignment[] = participantIds.map((teacherId) => ({
      id: genId("as"),
      taskId,
      workflowId,
      teacherId,
      status: "in_progress",
      createdAt: now,
      updatedAt: now,
    }));
    const passwordSettings = normalizePasswordSettings(input);
    const task: PrepTask = {
      id: taskId,
      schoolId: teacher.schoolId!,
      subjectGroupId: teacher.subjectGroupIds?.[0] || "",
      prepGroupId: teacher.prepGroupIds?.[0],
      title: resource.title,
      description: input.resourceType === "examPaper"
        ? "试卷协作编辑"
        : "讲义协作编辑",
      grade: resource.grade,
      subject: teacher.subject || "未设置学科",
      workflows: [workflow],
      assignments,
      status: "in_progress",
      createdBy: teacher.id,
      linkedResource: {
        type: input.resourceType,
        id: resource.id,
        title: resource.title,
      },
      resourceComments: [],
      ...passwordSettings,
      createdAt: now,
      updatedAt: now,
    };
    db.update("prepTasks", (list) => [task, ...list]);
    return publicTask(task);
  },

  async getLinkedResource(
    taskId: string,
    password: string | undefined,
    teacher: Teacher,
  ): Promise<{ task: PrepTask; resource: ExamPaper | Lecture; comments: PrepResourceComment[] }> {
    await delay(120);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("集体备课任务不存在");
    assertLinkedResourceAccess(task, teacher, password);
    return {
      task: publicTask(task),
      resource: linkedResource(task),
      comments: task.resourceComments || [],
    };
  },

  async updateLinkedResource(
    taskId: string,
    patch: Partial<ExamPaper> | Partial<Lecture>,
    password: string | undefined,
    teacher: Teacher,
  ): Promise<ExamPaper | Lecture> {
    await delay(180);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("集体备课任务不存在");
    assertLinkedResourceAccess(task, teacher, password);
    const now = new Date().toISOString();
    const { id: _id, teacherId: _teacherId, schoolId: _schoolId, createdAt: _createdAt, ...safePatch } = patch;

    let updated: ExamPaper | Lecture | null = null;
    if (task.linkedResource!.type === "examPaper") {
      db.update("examPapers", (list) => list.map((paper) => {
        if (paper.id !== task.linkedResource!.id) return paper;
        const sanitized = sanitizeExamPaperPatch(paper, safePatch as Partial<ExamPaper>);
        updated = { ...paper, ...sanitized, updatedAt: now };
        return updated as ExamPaper;
      }));
    } else {
      db.update("lectures", (list) => list.map((lecture) => {
        if (lecture.id !== task.linkedResource!.id) return lecture;
        const lecturePatch = sanitizeLecturePatch(lecture, safePatch as Partial<Lecture>);
        updated = {
          ...lecture,
          ...lecturePatch,
          version: lecturePatch.sections ? lecture.version + 1 : lecture.version,
          updatedAt: now,
        };
        return updated as Lecture;
      }));
    }
    if (!updated) throw new Error("协作文档不存在");

    const updatedTitle = updated.title;
    db.update("prepTasks", (list) => list.map((item) =>
      item.id === taskId
        ? {
            ...item,
            title: updatedTitle,
            linkedResource: item.linkedResource
              ? { ...item.linkedResource, title: updatedTitle }
              : item.linkedResource,
            updatedAt: now,
          }
        : item,
    ));
    return updated;
  },

  async addResourceComment(
    taskId: string,
    input: { targetId: string; content: string },
    password: string | undefined,
    teacher: Teacher,
  ): Promise<PrepResourceComment> {
    await delay(100);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("集体备课任务不存在");
    assertLinkedResourceAccess(task, teacher, password);
    const targetId = input.targetId.trim();
    const content = input.content.trim();
    if (!targetId || !linkedResourceTargetIds(linkedResource(task)).has(targetId)) {
      throw new Error("批注段落不存在");
    }
    if (!content) throw new Error("请输入批注内容");
    if (content.length > 2000) throw new Error("批注内容不能超过 2000 字");

    const now = new Date().toISOString();
    const comment: PrepResourceComment = {
      id: genId("comment"),
      targetId,
      content,
      createdBy: teacher.id,
      createdAt: now,
      updatedAt: now,
    };
    db.update("prepTasks", (list) => list.map((item) =>
      item.id === taskId
        ? {
            ...item,
            resourceComments: [...(item.resourceComments || []), comment],
            updatedAt: now,
          }
        : item,
    ));
    return comment;
  },

  async deleteResourceComment(
    taskId: string,
    commentId: string,
    password: string | undefined,
    teacher: Teacher,
  ): Promise<void> {
    await delay(80);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("集体备课任务不存在");
    assertLinkedResourceAccess(task, teacher, password);
    const comment = (task.resourceComments || []).find((item) => item.id === commentId);
    if (!comment) return;
    if (comment.createdBy !== teacher.id && task.createdBy !== teacher.id) {
      throw new Error("只能删除自己的批注");
    }
    db.update("prepTasks", (list) => list.map((item) =>
      item.id === taskId
        ? {
            ...item,
            resourceComments: (item.resourceComments || []).filter((current) => current.id !== commentId),
            updatedAt: new Date().toISOString(),
          }
        : item,
    ));
  },

  async createTask(
    schoolId: string,
    subjectGroupId: string,
    data: {
      title: string;
      description?: string;
      grade: string;
      subject: string;
      prepGroupId?: string;
      workflows: { type: PrepTaskType; name: string; description?: string }[];
    },
    createdBy: string,
  ): Promise<PrepTask> {
    await delay(300);

    const workflows: PrepWorkflow[] = data.workflows.map((w, idx) => ({
      id: genId("wf"),
      type: w.type,
      name: w.name,
      description: w.description,
      order: idx + 1,
      status: "created",
      assigneeIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const task: PrepTask = {
      id: genId("pt"),
      schoolId,
      subjectGroupId,
      prepGroupId: data.prepGroupId,
      title: data.title,
      description: data.description,
      grade: data.grade,
      subject: data.subject,
      workflows,
      assignments: [],
      status: "created",
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.update("prepTasks", (list) => [...list, task]);
    return task;
  },

  async updateTask(taskId: string, patch: Partial<PrepTask>): Promise<void> {
    await delay(200);
    db.update("prepTasks", (list) =>
      list.map((t) => (t.id === taskId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    );
  },

  async deleteTask(taskId: string): Promise<void> {
    await delay(200);
    db.update("prepTasks", (list) => list.filter((t) => t.id !== taskId));
  },

  // ============ 流程管理 ============

  async addWorkflow(
    taskId: string,
    data: { type: PrepTaskType; name: string; description?: string },
  ): Promise<PrepWorkflow> {
    await delay(200);
    const task = db.read("prepTasks").find((t) => t.id === taskId);
    if (!task) throw new Error("任务不存在");

    const workflow: PrepWorkflow = {
      id: genId("wf"),
      type: data.type,
      name: data.name,
      description: data.description,
      order: task.workflows.length + 1,
      status: "created",
      assigneeIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.update("prepTasks", (list) =>
      list.map((t) =>
        t.id === taskId
          ? { ...t, workflows: [...t.workflows, workflow], updatedAt: new Date().toISOString() }
          : t,
      ),
    );

    return workflow;
  },

  async updateWorkflow(taskId: string, workflowId: string, patch: Partial<PrepWorkflow>): Promise<void> {
    await delay(200);
    db.update("prepTasks", (list) =>
      list.map((t) =>
        t.id === taskId
          ? {
              ...t,
              workflows: t.workflows.map((w) =>
                w.id === workflowId ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
  },

  async deleteWorkflow(taskId: string, workflowId: string): Promise<void> {
    await delay(200);
    db.update("prepTasks", (list) =>
      list.map((t) =>
        t.id === taskId
          ? {
              ...t,
              workflows: t.workflows.filter((w) => w.id !== workflowId),
              assignments: t.assignments.filter((a) => a.workflowId !== workflowId),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );
  },

  // ============ 任务分配 ============

  async assignTask(taskId: string, workflowId: string, teacherIds: string[]): Promise<PrepAssignment[]> {
    await delay(200);

    const assignments: PrepAssignment[] = teacherIds.map((tid) => ({
      id: genId("as"),
      taskId,
      workflowId,
      teacherId: tid,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    db.update("prepTasks", (list) =>
      list.map((t) =>
        t.id === taskId
          ? {
              ...t,
              workflows: t.workflows.map((w) =>
                w.id === workflowId
                  ? { ...w, assigneeIds: [...new Set([...w.assigneeIds, ...teacherIds])], updatedAt: new Date().toISOString() }
                  : w,
              ),
              assignments: [...t.assignments, ...assignments],
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );

    return assignments;
  },

  async updateAssignment(
    taskId: string,
    assignmentId: string,
    status: AssignmentStatus,
    teacher?: Teacher,
  ): Promise<void> {
    await delay(200);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("任务不存在");
    const assignment = task.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error("任务分配不存在");
    assertAssignmentAccess(task, assignment, teacher);
    if (status === "completed" && !assignment.submission) {
      throw new Error("请先提交文档、讲义、试卷或图片，再完成任务");
    }

    db.update("prepTasks", (list) =>
      list.map((item) => {
        if (item.id !== taskId) return item;
        const updated = {
          ...item,
          assignments: item.assignments.map((current) =>
            current.id === assignmentId
              ? { ...current, status, updatedAt: new Date().toISOString() }
              : current,
          ),
        };
        return recalculateTask(updated);
      }),
    );
  },

  async submitAssignment(
    taskId: string,
    assignmentId: string,
    input: PrepSubmissionInput,
    teacher: Teacher,
  ): Promise<PrepSubmission> {
    await delay(200);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("任务不存在");
    const assignment = task.assignments.find((item) => item.id === assignmentId);
    if (!assignment) throw new Error("任务分配不存在");
    assertAssignmentAccess(task, assignment, teacher);
    if (!["accepted", "in_progress"].includes(assignment.status)) {
      throw new Error(assignment.status === "pending" ? "请先认领任务" : "当前状态不能提交成果");
    }

    const now = new Date().toISOString();
    let base: Omit<PrepSubmission, "id" | "submittedAt" | "updatedAt" | "annotations">;
    if (input.kind === "resource") {
      base = buildResourceSubmission(input, teacher);
    } else {
      const assets = input.assets.map(normalizeAsset);
      if (input.kind === "document" && assets.length !== 1) {
        throw new Error("文档成果只能上传一个文件");
      }
      if (input.kind === "images") {
        if (assets.length === 0 || assets.length > 12) throw new Error("请上传 1 至 12 张图片");
        if (assets.some((asset) => !asset.mimeType.startsWith("image/"))) {
          throw new Error("图片成果只能包含图片文件");
        }
      }
      base = {
        kind: input.kind,
        title: input.kind === "document" ? assets[0].name : `${assets.length} 张图片`,
        submittedBy: teacher.id,
        assets,
      };
    }

    const submission: PrepSubmission = {
      ...base,
      id: genId("submission"),
      submittedAt: now,
      updatedAt: now,
      annotations: [],
    };

    db.update("prepTasks", (list) =>
      list.map((item) => {
        if (item.id !== taskId) return item;
        const updated = {
          ...item,
          assignments: item.assignments.map((current) =>
            current.id === assignmentId
              ? {
                  ...current,
                  submission,
                  status: current.status === "accepted" ? "in_progress" as const : current.status,
                  updatedAt: now,
                }
              : current,
          ),
        };
        return recalculateTask(updated);
      }),
    );
    return submission;
  },

  async saveSubmissionAnnotations(
    taskId: string,
    assignmentId: string,
    targetId: string,
    strokes: Array<Pick<PrepAnnotationStroke, "id" | "tool" | "color" | "points">>,
    teacher: Teacher,
  ): Promise<PrepAnnotationStroke[]> {
    await delay(120);
    const task = db.read("prepTasks").find((item) => item.id === taskId);
    if (!task) throw new Error("任务不存在");
    if (task.schoolId !== teacher.schoolId) throw new Error("无权批注其他学校的成果");
    if (task.status !== "completed") throw new Error("看板全部完成后才可以批注");
    const assignment = task.assignments.find((item) => item.id === assignmentId);
    if (!assignment?.submission) throw new Error("成果不存在");
    if (!submissionTargetIds(assignment.submission).has(targetId)) throw new Error("批注目标不存在");
    if (strokes.length > 300) throw new Error("单个成果的批注笔迹过多");

    const now = new Date().toISOString();
    const normalized: PrepAnnotationStroke[] = strokes.map((stroke) => {
      if (!["pen", "highlighter"].includes(stroke.tool)) throw new Error("批注工具不合法");
      const allowedColors = stroke.tool === "pen"
        ? ["black", "red", "blue"]
        : ["yellow", "green"];
      if (!allowedColors.includes(stroke.color)) throw new Error("批注颜色不合法");
      if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 2000) {
        throw new Error("批注轨迹不合法");
      }
      return {
        id: String(stroke.id || genId("stroke")).slice(0, 100),
        targetId,
        tool: stroke.tool,
        color: stroke.color,
        points: stroke.points.map((point) => ({
          x: Math.min(1, Math.max(0, Number(point.x) || 0)),
          y: Math.min(1, Math.max(0, Number(point.y) || 0)),
        })),
        createdBy: teacher.id,
        createdAt: now,
      };
    });

    let saved: PrepAnnotationStroke[] = [];
    db.update("prepTasks", (list) =>
      list.map((item) => {
        if (item.id !== taskId) return item;
        return {
          ...item,
          assignments: item.assignments.map((current) => {
            if (current.id !== assignmentId || !current.submission) return current;
            const annotations = [
              ...current.submission.annotations.filter((stroke) =>
                stroke.targetId !== targetId || stroke.createdBy !== teacher.id,
              ),
              ...normalized,
            ];
            saved = annotations;
            return {
              ...current,
              submission: {
                ...current.submission,
                annotations,
                updatedAt: now,
              },
              updatedAt: now,
            };
          }),
          updatedAt: now,
        };
      }),
    );
    return saved;
  },

  // ============ 题目引用与查重 ============

  async addQuestionReference(
    questionId: string,
    teacherId: string,
    studentIds: string[],
    sourceTaskId?: string,
    sourceType: "personal" | "prep" | "subject" = "personal",
  ): Promise<QuestionReference> {
    await delay(100);

    const existingRef = db.read("questionReferences").find(
      (r) => r.questionId === questionId && r.teacherId === teacherId,
    );

    if (existingRef) {
      db.update("questionReferences", (list) =>
        list.map((r) =>
          r.id === existingRef.id
            ? {
                ...r,
                usedInStudentIds: [...new Set([...r.usedInStudentIds, ...studentIds])],
                usageCount: r.usageCount + studentIds.length,
                markedAsUsed: true,
                updatedAt: new Date().toISOString(),
              }
            : r,
        ),
      );
      return existingRef;
    }

    const ref: QuestionReference = {
      id: genId("qr"),
      questionId,
      teacherId,
      sourceTaskId,
      sourceType,
      usedInStudentIds: studentIds,
      usageCount: studentIds.length,
      markedAsUsed: true,
    };

    db.update("questionReferences", (list) => [...list, ref]);
    return ref;
  },

  async getQuestionReferences(teacherId: string): Promise<QuestionReference[]> {
    await delay(150);
    return db.read("questionReferences").filter((r) => r.teacherId === teacherId);
  },

  async getUsedQuestionIds(teacherId: string): Promise<string[]> {
    await delay(100);
    const refs = db.read("questionReferences").filter(
      (r) => r.teacherId === teacherId && r.markedAsUsed,
    );
    return refs.map((r) => r.questionId);
  },

  async checkDuplicateQuestion(
    stem: string,
    teacherId: string,
    excludeQuestionId?: string,
  ): Promise<{ isDuplicate: boolean; similarQuestions: Question[] }> {
    await delay(200);

    const allQuestions = db.read("questions");
    const teacherQuestions = allQuestions.filter((q) => q.teacherId === teacherId);

    const similarQuestions = teacherQuestions.filter((q) => {
      if (q.id === excludeQuestionId) return false;
      const stemClean = stem.replace(/\s+/g, "").toLowerCase();
      const qStemClean = q.stem.replace(/\s+/g, "").toLowerCase();
      // 简单的相似度匹配：超过70%相同认为相似
      const commonChars = stemClean.split("").filter((c) => qStemClean.includes(c)).length;
      const similarity = commonChars / Math.max(stemClean.length, qStemClean.length);
      return similarity > 0.7;
    });

    return {
      isDuplicate: similarQuestions.length > 0,
      similarQuestions,
    };
  },

  async mergeQuestions(
    targetQuestionId: string,
    sourceQuestionId: string,
  ): Promise<void> {
    await delay(300);

    const target = db.read("questions").find((q) => q.id === targetQuestionId);
    const source = db.read("questions").find((q) => q.id === sourceQuestionId);

    if (!target || !source) throw new Error("题目不存在");

    // 更新目标题目的使用记录
    const targetRefs = db.read("questionReferences").filter((r) => r.questionId === targetQuestionId);
    const sourceRefs = db.read("questionReferences").filter((r) => r.questionId === sourceQuestionId);

    // 合并引用记录
    for (const sourceRef of sourceRefs) {
      const existingTargetRef = targetRefs.find((r) => r.teacherId === sourceRef.teacherId);
      if (existingTargetRef) {
        db.update("questionReferences", (list) =>
          list.map((r) =>
            r.id === existingTargetRef.id
              ? {
                  ...r,
                  usedInStudentIds: [...new Set([...r.usedInStudentIds, ...sourceRef.usedInStudentIds])],
                  usageCount: r.usageCount + sourceRef.usageCount,
                }
              : r,
          ),
        );
      } else {
        db.update("questionReferences", (list) =>
          [...list, { ...sourceRef, id: genId("qr"), questionId: targetQuestionId }],
        );
      }
    }

    // 删除源题目
    db.update("questions", (list) => list.filter((q) => q.id !== sourceQuestionId));
    db.update("questionReferences", (list) => list.filter((r) => r.questionId !== sourceQuestionId));

    // 更新答题记录中的题目ID引用
    db.update("answerRecords", (list) =>
      list.map((r) => (r.questionId === sourceQuestionId ? { ...r, questionId: targetQuestionId } : r)),
    );

    // 更新讲义中的题目引用
    db.update("lectures", (list) =>
      list.map((l) => ({
        ...l,
        sections: updateSectionQuestionId(l.sections, sourceQuestionId, targetQuestionId),
      })),
    );

    // 更新试题篮中的题目引用
    db.update("baskets", (list) =>
      list.map((b) => ({
        ...b,
        questionIds: b.questionIds.map((id) => (id === sourceQuestionId ? targetQuestionId : id)),
      })),
    );
  },
};

function updateSectionQuestionId(
  sections: any[],
  oldId: string,
  newId: string,
): any[] {
  return sections.map((sec) => ({
    ...sec,
    questionId: sec.questionId === oldId ? newId : sec.questionId,
    children: sec.children ? updateSectionQuestionId(sec.children, oldId, newId) : [],
  }));
}
