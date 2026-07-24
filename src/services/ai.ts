import { rpcCall } from "./api";

import type {
  DocumentRecord, RecognitionResult, WebAnnotationStats, Question,
} from "@/types";
import { importStoredFile, uploadFile } from "./api";

export const aiService = {
  async generateTeachingResources(
    kind: "question" | "knowledge",
    keyword: string,
    difficulty: number,
    count: number,
  ): Promise<{ type: "question" | "knowledge"; items: Array<Record<string, unknown>> }> {
    return rpcCall("ai", "generateTeachingResources", [kind, keyword, difficulty, count]);
  },

  async importDocument(file: File): Promise<DocumentRecord> {
    const uploaded = await uploadFile(file);
    return importStoredFile<DocumentRecord>(uploaded.id);
  },

  async getDocument(docId: string): Promise<DocumentRecord | null> {
    return rpcCall("ai", "getDocument", [docId]) as any;
  },

  async listDocuments(teacherId: string): Promise<DocumentRecord[]> {
    return rpcCall("ai", "listDocuments", [teacherId]) as any;
  },

  async recognize(docId: string): Promise<RecognitionResult[]> {
    return rpcCall("ai", "recognize", [docId]) as any;
  },

  async getRecognitions(docId: string): Promise<RecognitionResult[]> {
    return rpcCall("ai", "getRecognitions", [docId]) as any;
  },

  async updateRecognition(recognitionId: string, patch: Partial<RecognitionResult>): Promise<void> {
    return rpcCall("ai", "updateRecognition", [recognitionId, patch]) as any;
  },

  async reRecognize(recognitionId: string): Promise<RecognitionResult> {
    return rpcCall("ai", "reRecognize", [recognitionId]) as any;
  },

  async confirmRecognition(recognitionId: string, teacherId: string, schoolId: string): Promise<Question> {
    return rpcCall("ai", "confirmRecognition", [recognitionId, teacherId, schoolId]) as any;
  },

  async confirmAll(docId: string, teacherId: string, schoolId: string): Promise<Question[]> {
    return rpcCall("ai", "confirmAll", [docId, teacherId, schoolId]) as any;
  },

  async rejectRecognition(recognitionId: string): Promise<void> {
    return rpcCall("ai", "rejectRecognition", [recognitionId]) as any;
  },

  async generateKnowledgePoint(topic: string, context?: string): Promise<string> {
    return rpcCall("ai", "generateKnowledgePoint", [topic, context]) as any;
  },

  async webAnalyzeQuestion(stem: string): Promise<WebAnnotationStats> {
    return rpcCall("ai", "webAnalyzeQuestion", [stem]) as any;
  }
};
