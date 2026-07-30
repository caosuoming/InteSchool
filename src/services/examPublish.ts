import { rpcCall } from "./api";

import type { ExamPublication, ExamPublishTarget } from "@/types";

export const examPublishService = {
  async publishExam(params: {
    examPaperId: string;
    publisherId: string;
    publisherSchoolId: string;
    title: string;
    targetType: ExamPublishTarget;
    targetClassIds?: string[];
    targetStudentIds?: string[];
    targetSchoolIds?: string[];
    isFormalExam?: boolean;
    viewPassword?: string;
    unlockAt?: string;
    questionIds: string[];
  }): Promise<ExamPublication> {
    return rpcCall("examPublish", "publishExam", [params]) as any;
  },

  async listPublications(schoolId?: string): Promise<ExamPublication[]> {
    return rpcCall("examPublish", "listPublications", [schoolId]) as any;
  },

  async verifyPassword(publicationId: string, password: string): Promise<boolean> {
    return rpcCall("examPublish", "verifyPassword", [publicationId, password]) as any;
  },

  isUnlocked(publication: ExamPublication): boolean {
    if (!publication.unlockAt) return true;
    return new Date() >= new Date(publication.unlockAt);
  },

  async revokePublication(publicationId: string): Promise<void> {
    return rpcCall("examPublish", "revokePublication", [publicationId]) as any;
  },

  async checkExpiry(): Promise<void> {
    return rpcCall("examPublish", "checkExpiry", []) as any;
  }
};
