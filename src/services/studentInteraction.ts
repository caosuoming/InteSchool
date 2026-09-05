import { rpcCall } from "./api";

import type {
  StudentInteraction,
  StudentInteractionAttachment,
  StudentInteractionView,
  InteractionType,
} from "@/types";

export interface InteractionInput {
  studentId: string;
  type: InteractionType;
  content: string;
  attachments?: StudentInteractionAttachment[];
  attitude?: number;
  statusTag?: string;
  shareWithHomeroom?: boolean;
}

export const studentInteractionService = {
  async listByStudent(studentId: string): Promise<StudentInteractionView[]> {
    return rpcCall("studentInteraction", "listByStudent", [studentId]) as any;
  },

  async listByTeacher(teacherId: string): Promise<StudentInteractionView[]> {
    return rpcCall("studentInteraction", "listByTeacher", [teacherId]) as any;
  },

  async listFollowedStudentIds(): Promise<string[]> {
    return rpcCall("studentInteraction", "listFollowedStudentIds", []) as any;
  },

  async setStudentFollowed(studentId: string, followed: boolean): Promise<void> {
    return rpcCall("studentInteraction", "setStudentFollowed", [studentId, followed]) as any;
  },

  async createInteraction(teacherId: string, schoolId: string, input: InteractionInput): Promise<StudentInteraction> {
    return rpcCall("studentInteraction", "createInteraction", [teacherId, schoolId, input]) as any;
  },

  async deleteInteraction(id: string): Promise<void> {
    return rpcCall("studentInteraction", "deleteInteraction", [id]) as any;
  }
};
