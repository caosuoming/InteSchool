import { z } from "zod";
import type {
  DocumentRecord,
  RecognitionResult,
  WebAnnotationStats,
  QuestionType,
  Question,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";
import { generateStructuredContent } from "../lib/ai-provider.js";
import { questionService } from "./question.js";

function detectQuestionType(content: string): QuestionType {
  if (/（\s*多选\s*）|多项选择|多选/.test(content)) return "multiple";
  if (/判断题|判断下列|正确还是错误/.test(content) && !/^[A-D][.、．)]/m.test(content)) return "judge";
  if (/证明|解答|论述/.test(content)) return "essay";
  if (/填空|___+|____+/.test(content)) return "short";
  if (/^[A-D][.、．)]/m.test(content)) return "single";
  return content.length > 120 ? "essay" : "short";
}

function extractOptions(content: string): string[] | undefined {
  const options = content
    .split("\n")
    .map((line) => line.trim().match(/^[A-H][.、．)]\s*(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  return options.length >= 2 ? options : undefined;
}

function extractLabel(content: string, label: "答案" | "解析"): string | null {
  const pattern = label === "答案"
    ? /(?:^|\n)\s*(?:参考)?答案\s*[:：]\s*([^\n]+)/i
    : /(?:^|\n)\s*(?:参考)?解析\s*[:：]\s*([^\n]+)/i;
  return content.match(pattern)?.[1]?.trim() || null;
}

function extractStem(content: string): string {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[A-H][.、．)]\s*/.test(line))
    .filter((line) => !/^(?:参考)?(?:答案|解析)\s*[:：]/.test(line));
  return lines.join(" ").replace(/^\d+[.、]\s*/, "").trim();
}

function splitQuestionBlocks(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const matches = [...normalized.matchAll(/(?:^|\n)\s*(\d+)[.、]\s*/g)];
  if (matches.length === 0) return normalized.length >= 5 ? [normalized] : [];
  return matches.map((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    return normalized.slice(start, end).trim();
  }).filter((block) => block.length >= 5);
}

function inferChapters(stem: string): string[] {
  const matched: Array<{ id: string; score: number }> = [];
  for (const chapter of db.read("chapters")) {
    const name = chapter.name
      .replace(/^第[一二三四五六七八九十百]+章\s*/, "")
      .replace(/^\d+(?:\.\d+)*\s*/, "");
    const keywords = name.split(/[、与和及]/).map((item) => item.trim()).filter((item) => item.length >= 2);
    const score = keywords.reduce((total, keyword) => total + (stem.includes(keyword) ? 2 : 0), 0);
    if (score > 0) matched.push({ id: chapter.id, score });
  }
  return matched.sort((left, right) => right.score - left.score).slice(0, 2).map((item) => item.id);
}

function inferKnowledgePoints(stem: string, _chapterIds: string[]): string[] {
  const candidates = db.read("knowledgePoints");
  const matched: Array<{ id: string; score: number }> = [];
  for (const point of candidates) {
    const keywords = point.name.split(/[、与和及]/).map((item) => item.trim()).filter((item) => item.length >= 2);
    const score = keywords.reduce((total, keyword) => total + (stem.includes(keyword) ? 2 : 0), 0);
    if (score > 0) matched.push({ id: point.id, score });
  }
  return matched.sort((left, right) => right.score - left.score).slice(0, 3).map((item) => item.id);
}

function emptyWebAnnotations(): WebAnnotationStats {
  return { totalSources: 0, topChapters: [], topKnowledgePoints: [] };
}

function buildRecognition(docId: string, sectionId: string, block: string): RecognitionResult | null {
  const stem = extractStem(block);
  if (!stem) return null;
  const type = detectQuestionType(block);
  const options = extractOptions(block);
  const explicitAnswer = extractLabel(block, "答案");
  const explicitAnalysis = extractLabel(block, "解析");
  const chapterIds = inferChapters(stem);
  const knowledgePointIds = inferKnowledgePoints(stem, chapterIds);
  const completeness = 0.45
    + (options ? 0.1 : 0)
    + (explicitAnswer ? 0.2 : 0)
    + (explicitAnalysis ? 0.15 : 0)
    + (chapterIds.length > 0 ? 0.05 : 0);

  return {
    id: genId("rec"),
    documentId: docId,
    sectionId,
    question: {
      type,
      stem,
      options,
      answer: explicitAnswer || "待教师补充",
      analysis: explicitAnalysis || "待教师补充解析",
      chapterIds,
      knowledgePointIds,
      difficulty: 3,
      recommendation: 3,
      usageCount: 0,
      remark: "",
      isShared: false,
    },
    confidence: Math.min(completeness, 0.95),
    webAnnotations: emptyWebAnnotations(),
    status: "pending",
  };
}

const generatedQuestionSchema = z.object({
  items: z.array(z.object({
    type: z.enum(["single", "multiple", "judge", "short", "essay"]),
    stem: z.string().min(1),
    options: z.array(z.string()).optional(),
    answer: z.string().min(1),
    analysis: z.string().min(1),
  })).min(1).max(20),
});

const generatedKnowledgeSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    content: z.string().min(1),
  })).min(1).max(10),
});

const knowledgeExplanationSchema = z.object({ content: z.string().min(1) });

export const aiService = {
  async generateTeachingResources(
    kind: "question" | "knowledge",
    keyword: string,
    difficulty: number,
    count: number,
  ): Promise<{ type: "question" | "knowledge"; items: Array<Record<string, unknown>> }> {
    const safeCount = Math.max(1, Math.min(Math.floor(count), kind === "question" ? 20 : 10));
    if (!keyword.trim()) throw new Error("请输入生成主题");
    if (kind === "question") {
      const result = await generateStructuredContent(
        "你是严谨的中学教师。只返回 JSON，不要输出 Markdown。题目必须自洽、答案明确、解析可核验。",
        `围绕“${keyword}”生成 ${safeCount} 道难度 ${difficulty}/5 的题目。返回 {"items":[{"type":"single|multiple|judge|short|essay","stem":"...","options":["..."],"answer":"...","analysis":"..."}]}。非选择题可省略 options。`,
        generatedQuestionSchema,
      );
      return { type: "question", items: result.items };
    }
    const result = await generateStructuredContent(
      "你是严谨的中学教师。只返回 JSON，不要输出 Markdown。内容应准确、适合直接用于教学讲义。",
      `围绕“${keyword}”生成 ${safeCount} 个知识块。返回 {"items":[{"title":"...","content":"..."}]}。`,
      generatedKnowledgeSchema,
    );
    return { type: "knowledge", items: result.items };
  },

  async getDocument(docId: string): Promise<DocumentRecord | null> {
    return db.read("documents").find((document) => document.id === docId) || null;
  },

  async listDocuments(teacherId: string): Promise<DocumentRecord[]> {
    return db.read("documents")
      .filter((document) => document.teacherId === teacherId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  },

  async recognize(docId: string): Promise<RecognitionResult[]> {
    const document = db.read("documents").find((item) => item.id === docId);
    if (!document) throw new Error("文档不存在");
    if (document.status === "confirmed") throw new Error("已确认入库的文档不能重复识别");

    db.update("documents", (list) => list.map((item) =>
      item.id === docId ? { ...item, status: "recognizing" as const } : item,
    ));

    const recognitions: RecognitionResult[] = [];
    for (const section of document.sections) {
      const sourceText = [
        section.title && section.title !== "文档正文" ? section.title : "",
        section.content,
      ].filter(Boolean).join("\n");
      for (const block of splitQuestionBlocks(sourceText)) {
        const recognition = buildRecognition(docId, section.id, block);
        if (recognition) recognitions.push(recognition);
      }
    }
    if (recognitions.length === 0) {
      db.update("documents", (list) => list.map((item) =>
        item.id === docId ? { ...item, status: "uploaded" as const } : item,
      ));
      throw new Error("未从文档中识别到题目，请检查文档结构或手动录入");
    }

    db.update("recognitions", (list) => [
      ...list.filter((item) => item.documentId !== docId || item.status === "confirmed"),
      ...recognitions,
    ]);
    db.update("documents", (list) => list.map((item) =>
      item.id === docId ? { ...item, status: "recognized" as const } : item,
    ));
    return recognitions;
  },

  async getRecognitions(docId: string): Promise<RecognitionResult[]> {
    return db.read("recognitions").filter((recognition) => recognition.documentId === docId);
  },

  async updateRecognition(recognitionId: string, patch: Partial<RecognitionResult>): Promise<void> {
    db.update("recognitions", (list) => list.map((recognition) =>
      recognition.id === recognitionId ? { ...recognition, ...patch, id: recognition.id, documentId: recognition.documentId } : recognition,
    ));
  },

  async reRecognize(recognitionId: string): Promise<RecognitionResult> {
    const existing = db.read("recognitions").find((recognition) => recognition.id === recognitionId);
    if (!existing) throw new Error("识别记录不存在");
    const chapterIds = inferChapters(existing.question.stem);
    const knowledgePointIds = inferKnowledgePoints(existing.question.stem, chapterIds);
    const updated: RecognitionResult = {
      ...existing,
      question: { ...existing.question, chapterIds, knowledgePointIds },
      confidence: Math.min(0.9, 0.55 + (chapterIds.length ? 0.1 : 0) + (knowledgePointIds.length ? 0.1 : 0)),
      webAnnotations: emptyWebAnnotations(),
      status: "pending",
    };
    db.update("recognitions", (list) => list.map((recognition) => recognition.id === recognitionId ? updated : recognition));
    return updated;
  },

  async confirmRecognition(recognitionId: string, teacherId: string, schoolId: string): Promise<Question> {
    const recognition = db.read("recognitions").find((item) => item.id === recognitionId);
    if (!recognition) throw new Error("识别记录不存在");
    const document = db.read("documents").find((item) => item.id === recognition.documentId);
    if (!document || document.teacherId !== teacherId || document.schoolId !== schoolId) throw new Error("无权确认该识别结果");
    if (recognition.question.answer === "待教师补充" || recognition.question.analysis === "待教师补充解析") {
      throw new Error("请先补充答案和解析再入库");
    }
    const question = await questionService.createQuestion(teacherId, schoolId, recognition.question);
    db.update("recognitions", (list) => list.map((item) =>
      item.id === recognitionId ? { ...item, status: "confirmed" as const } : item,
    ));
    return question;
  },

  async confirmAll(docId: string, teacherId: string, schoolId: string): Promise<Question[]> {
    const document = db.read("documents").find((item) => item.id === docId);
    if (!document || document.teacherId !== teacherId || document.schoolId !== schoolId) throw new Error("无权确认该文档");
    const pending = db.read("recognitions").filter((item) => item.documentId === docId && item.status === "pending");
    if (pending.some((item) => item.question.answer === "待教师补充" || item.question.analysis === "待教师补充解析")) {
      throw new Error("部分题目缺少答案或解析，请逐题补充后再批量入库");
    }
    const created: Question[] = [];
    for (const recognition of pending) {
      created.push(await questionService.createQuestion(teacherId, schoolId, recognition.question));
    }
    db.update("recognitions", (list) => list.map((item) =>
      item.documentId === docId && item.status === "pending" ? { ...item, status: "confirmed" as const } : item,
    ));
    db.update("documents", (list) => list.map((item) =>
      item.id === docId ? { ...item, status: "confirmed" as const } : item,
    ));
    return created;
  },

  async rejectRecognition(recognitionId: string): Promise<void> {
    db.update("recognitions", (list) => list.map((recognition) =>
      recognition.id === recognitionId ? { ...recognition, status: "rejected" as const } : recognition,
    ));
  },

  async generateKnowledgePoint(topic: string, context?: string): Promise<string> {
    if (!topic.trim()) throw new Error("请输入知识点主题");
    const result = await generateStructuredContent(
      "你是严谨的中学教师。只返回 JSON。内容必须准确，包含定义、主要性质、典型应用和易错点；不要编造不存在的定理。",
      `围绕“${topic}”生成可直接放入讲义的知识点讲解。${context ? `上下文：${context.slice(0, 10_000)}` : ""} 返回 {"content":"Markdown 内容"}。`,
      knowledgeExplanationSchema,
    );
    return result.content;
  },

  async webAnalyzeQuestion(_stem: string): Promise<WebAnnotationStats> {
    throw new Error("联网标注统计未配置；系统不会伪造来源数量或网上标注结果");
  },
};
