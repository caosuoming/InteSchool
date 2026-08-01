import type {
  PrepTask,
  PrepWorkflow,
  PrepAssignment,
  PrepTaskType,
  PrepTaskStatus,
  AssignmentStatus,
  QuestionReference,
  Question,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId } from "../domain-shared.js";

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

export const prepService = {
  // ============ 备课任务管理 ============

  async listTasks(schoolId: string, teacherId?: string): Promise<PrepTask[]> {
    await delay(200);
    let tasks = db.read("prepTasks").filter((t) => t.schoolId === schoolId);

    if (teacherId) {
      tasks = tasks.filter(
        (t) =>
          t.createdBy === teacherId ||
          t.assignments.some((a) => a.teacherId === teacherId),
      );
    }

    return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getTask(taskId: string): Promise<PrepTask | null> {
    await delay(150);
    return db.read("prepTasks").find((t) => t.id === taskId) || null;
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

  async updateAssignment(taskId: string, assignmentId: string, status: AssignmentStatus): Promise<void> {
    await delay(200);
    db.update("prepTasks", (list) =>
      list.map((t) =>
        t.id === taskId
          ? {
              ...t,
              assignments: t.assignments.map((a) =>
                a.id === assignmentId ? { ...a, status, updatedAt: new Date().toISOString() } : a,
              ),
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    );

    // 更新流程状态
    const task = db.read("prepTasks").find((t) => t.id === taskId);
    if (task) {
      const workflow = task.workflows.find((w) => {
        const assignment = task.assignments.find((a) => a.id === assignmentId);
        return assignment && w.id === assignment.workflowId;
      });

      if (workflow) {
        const workflowAssignments = task.assignments.filter((a) => a.workflowId === workflow.id);
        const allCompleted = workflowAssignments.every((a) => a.status === "completed");
        const anyInProgress = workflowAssignments.some((a) => a.status === "in_progress");

        let newStatus: PrepTaskStatus = workflow.status;
        if (allCompleted) {
          newStatus = "completed";
        } else if (anyInProgress) {
          newStatus = "in_progress";
        }

        if (newStatus !== workflow.status) {
          db.update("prepTasks", (list) =>
            list.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    workflows: t.workflows.map((w) =>
                      w.id === workflow.id ? { ...w, status: newStatus, updatedAt: new Date().toISOString() } : w,
                    ),
                    updatedAt: new Date().toISOString(),
                  }
                : t,
            ),
          );
        }
      }

      // 更新任务整体状态
      const allWorkflowsCompleted = task.workflows.every((w) => w.status === "completed");
      const anyWorkflowInProgress = task.workflows.some((w) => w.status === "in_progress");

      let taskStatus: PrepTaskStatus = task.status;
      if (allWorkflowsCompleted) {
        taskStatus = "completed";
      } else if (anyWorkflowInProgress) {
        taskStatus = "in_progress";
      }

      if (taskStatus !== task.status) {
        db.update("prepTasks", (list) =>
          list.map((t) =>
            t.id === taskId ? { ...t, status: taskStatus, updatedAt: new Date().toISOString() } : t,
          ),
        );
      }
    }
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
