import { rpcCall } from "./api";

import type {
  PrepTask,
  PrepWorkflow,
  PrepAssignment,
  PrepTaskType,
  PrepTaskStatus,
  AssignmentStatus,
  QuestionReference,
  Question,
} from "@/types";

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

export const taskStatusLabels: Record<PrepTaskStatus, string> = {
  created: "已创建",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export const assignmentStatusLabels: Record<AssignmentStatus, string> = {
  pending: "待认领",
  accepted: "已认领",
  in_progress: "进行中",
  completed: "已完成",
  rejected: "已拒绝",
};

export const prepService = {
  async listTasks(schoolId: string, teacherId?: string): Promise<PrepTask[]> {
    return rpcCall("prep", "listTasks", [schoolId, teacherId]) as any;
  },

  async getTask(taskId: string): Promise<PrepTask | null> {
    return rpcCall("prep", "getTask", [taskId]) as any;
  },

  async createTask(schoolId: string, subjectGroupId: string, data: {
      title: string;
      description?: string;
      grade: string;
      subject: string;
      prepGroupId?: string;
      workflows: { type: PrepTaskType; name: string; description?: string }[];
    }, createdBy: string): Promise<PrepTask> {
    return rpcCall("prep", "createTask", [schoolId, subjectGroupId, data, createdBy]) as any;
  },

  async updateTask(taskId: string, patch: Partial<PrepTask>): Promise<void> {
    return rpcCall("prep", "updateTask", [taskId, patch]) as any;
  },

  async deleteTask(taskId: string): Promise<void> {
    return rpcCall("prep", "deleteTask", [taskId]) as any;
  },

  async addWorkflow(taskId: string, data: { type: PrepTaskType; name: string; description?: string }): Promise<PrepWorkflow> {
    return rpcCall("prep", "addWorkflow", [taskId, data]) as any;
  },

  async updateWorkflow(taskId: string, workflowId: string, patch: Partial<PrepWorkflow>): Promise<void> {
    return rpcCall("prep", "updateWorkflow", [taskId, workflowId, patch]) as any;
  },

  async deleteWorkflow(taskId: string, workflowId: string): Promise<void> {
    return rpcCall("prep", "deleteWorkflow", [taskId, workflowId]) as any;
  },

  async assignTask(taskId: string, workflowId: string, teacherIds: string[]): Promise<PrepAssignment[]> {
    return rpcCall("prep", "assignTask", [taskId, workflowId, teacherIds]) as any;
  },

  async updateAssignment(taskId: string, assignmentId: string, status: AssignmentStatus): Promise<void> {
    return rpcCall("prep", "updateAssignment", [taskId, assignmentId, status]) as any;
  },

  async addQuestionReference(questionId: string, teacherId: string, studentIds: string[], sourceTaskId?: string, sourceType: "personal" | "prep" | "subject" = "personal"): Promise<QuestionReference> {
    return rpcCall("prep", "addQuestionReference", [questionId, teacherId, studentIds, sourceTaskId, sourceType]) as any;
  },

  async getQuestionReferences(teacherId: string): Promise<QuestionReference[]> {
    return rpcCall("prep", "getQuestionReferences", [teacherId]) as any;
  },

  async getUsedQuestionIds(teacherId: string): Promise<string[]> {
    return rpcCall("prep", "getUsedQuestionIds", [teacherId]) as any;
  },

  async checkDuplicateQuestion(stem: string, teacherId: string, excludeQuestionId?: string): Promise<{ isDuplicate: boolean; similarQuestions: Question[] }> {
    return rpcCall("prep", "checkDuplicateQuestion", [stem, teacherId, excludeQuestionId]) as any;
  },

  async mergeQuestions(targetQuestionId: string, sourceQuestionId: string): Promise<void> {
    return rpcCall("prep", "mergeQuestions", [targetQuestionId, sourceQuestionId]) as any;
  }
};
