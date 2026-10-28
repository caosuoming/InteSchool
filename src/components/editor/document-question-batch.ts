import type { Question } from "@/types";

export type DirectoryBatchMode = "chapter" | "knowledge" | "method";

export function batchQuestionCatalogPatch(question: Question, mode: DirectoryBatchMode, ids: string[]): Partial<Question> {
  if (mode === "chapter") return { chapterIds: [...ids] };
  if (mode === "knowledge") {
    return { knowledgePointIds: [...new Set([...question.knowledgePointIds, ...ids])] };
  }
  return { thoughtMethodIds: [...new Set([...(question.thoughtMethodIds || []), ...ids])] };
}
