import type {
  DocumentRecord, DocumentSection, RecognitionResult, WebAnnotationStats,
  QuestionType, Question,
} from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";
import { questionService } from "./question";

// ============ AI 识别 Mock 服务 ============

// 题型智能识别
function detectQuestionType(content: string): QuestionType {
  if (/（\s*多选\s*）|多选/.test(content)) return "multiple";
  if (/判断|正确|错误/.test(content) && !/[ABCD]/.test(content)) return "judge";
  if (/求|证明|计算|化简/.test(content) && content.length > 30) return "essay";
  if (content.length > 20 || /求|计算/.test(content)) return "short";
  return "single";
}

// 选项提取
function extractOptions(content: string): string[] | undefined {
  const lines = content.split("\n");
  const options: string[] = [];
  for (const line of lines) {
    const m = line.match(/^[A-D][.、．)]\s*(.+)/);
    if (m) options.push(m[1].trim());
  }
  return options.length >= 2 ? options : undefined;
}

// 题干提取
function extractStem(content: string): string {
  const lines = content.split("\n").filter((l) => l.trim());
  const stopIndex = lines.findIndex((l) => /^[A-D][.、．)]/.test(l));
  if (stopIndex > 0) {
    return lines.slice(0, stopIndex).join(" ").trim();
  }
  return lines[0] || content;
}

// 答案推断（Mock）
function inferAnswer(type: QuestionType, options?: string[]): string {
  if (type === "judge") return "正确";
  if (type === "essay" || type === "short") return "（参考答案请结合知识点判断）";
  if (options && options.length) {
    const idx = Math.floor(Math.random() * options.length);
    return String.fromCharCode(65 + idx);
  }
  return "A";
}

// 解析生成（Mock）
function generateAnalysis(stem: string, type: QuestionType): string {
  const templates = [
    "本题考察基础概念的理解与应用，需要准确把握定义内涵。",
    "通过分析题目条件，结合相关公式进行推导，注意运算过程中的符号问题。",
    "关键在于识别题目类型，应用对应的方法求解，建议结合图象辅助分析。",
    "需要分类讨论，对每种情况分别求解后再综合得出结论。",
  ];
  return templates[Math.floor(Math.random() * templates.length)] + ` 题目核心：${stem.slice(0, 30)}...`;
}

// 智能识别章节
function inferChapters(stem: string): string[] {
  const allChapters = db.read("chapters");
  const matched: { id: string; score: number }[] = [];

  for (const ch of allChapters) {
    let score = 0;
    const name = ch.name.replace(/^第[一二三四五六七八九十]+章\s*/, "").replace(/^\d+\.\d+\s*/, "");
    // 简单关键词匹配
    const keywords = name.split(/[、与和及和]/).filter((k) => k.length >= 2);
    for (const kw of keywords) {
      if (stem.includes(kw)) score += 2;
    }
    if (score > 0) matched.push({ id: ch.id, score });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, 2).map((m) => m.id);
}

// 智能识别知识点
function inferKnowledgePoints(stem: string, chapterIds: string[]): string[] {
  const allPoints = db.read("knowledgePoints");
  const filtered = chapterIds.length
    ? allPoints.filter((p) => chapterIds.includes(p.chapterId))
    : allPoints;

  const matched: { id: string; score: number }[] = [];
  for (const kp of filtered) {
    let score = 0;
    const keywords = kp.name.split(/[、与和及]/).filter((k) => k.length >= 2);
    for (const kw of keywords) {
      if (stem.includes(kw)) score += 2;
    }
    if (score > 0) matched.push({ id: kp.id, score });
  }

  matched.sort((a, b) => b.score - a.score);
  if (matched.length === 0 && filtered.length) {
    return [filtered[0].id];
  }
  return matched.slice(0, 3).map((m) => m.id);
}

// 联网分析（Mock）
function webAnalyze(stem: string): WebAnnotationStats {
  const chapters = db.read("chapters");
  const points = db.read("knowledgePoints");

  // 模拟网上来源数据
  const totalSources = Math.floor(Math.random() * 80) + 20;

  const topChapters = chapters
    .map((c) => ({
      chapter: c.name.replace(/^第[一二三四五六七八九十]+章\s*/, ""),
      count: Math.floor(Math.random() * 30) + 5,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const topKnowledgePoints = points
    .map((p) => ({
      point: p.name,
      count: Math.floor(Math.random() * 25) + 3,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { totalSources, topChapters, topKnowledgePoints };
}

export const aiService = {
  // 文档上传
  async uploadDocument(
    teacherId: string,
    schoolId: string,
    fileName: string,
    fileSize: number,
    fileType: DocumentRecord["fileType"],
  ): Promise<DocumentRecord> {
    await delay(800);
    maybeThrowError();

    // 模拟解析文档结构
    const sampleSections: DocumentSection[] = [
      {
        id: genId("doc-sec"),
        title: "一、选择题",
        content: "1. 已知集合 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∩ B =\nA. {1}\nB. {2, 3}\nC. {2, 3, 4}\nD. {1, 2, 3, 4}\n\n2. 函数 f(x) = √(x - 1) 的定义域为\nA. [1, +∞)\nB. (1, +∞)\nC. (-∞, 1]\nD. R",
        level: 1,
        children: [],
      },
      {
        id: genId("doc-sec"),
        title: "二、填空题",
        content: "1. 设集合 A = {x | 0 < x < 2}，B = {x | 1 ≤ x ≤ 3}，则 A ∩ B = ___\n\n2. 函数 y = log₂(x + 1) 的定义域为 ___",
        level: 1,
        children: [],
      },
      {
        id: genId("doc-sec"),
        title: "三、解答题",
        content: "1. 已知集合 A = {x | x² - 3x + 2 = 0}，B = {x | x² - mx + 1 = 0}，若 B ⊆ A，求 m 的取值范围。",
        level: 1,
        children: [],
      },
    ];

    const doc: DocumentRecord = {
      id: genId("doc"),
      teacherId,
      schoolId,
      fileName,
      fileType,
      fileSize,
      sections: sampleSections,
      status: "uploaded",
      createdAt: new Date().toISOString(),
    };
    db.update("documents", (list) => [doc, ...list]);
    return doc;
  },

  // 获取文档
  async getDocument(docId: string): Promise<DocumentRecord | null> {
    await delay(150);
    return db.read("documents").find((d) => d.id === docId) || null;
  },

  async listDocuments(teacherId: string): Promise<DocumentRecord[]> {
    await delay(200);
    return db
      .read("documents")
      .filter((d) => d.teacherId === teacherId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  // AI 识别
  async recognize(docId: string): Promise<RecognitionResult[]> {
    // 模拟识别耗时
    await delay(200);

    const doc = db.read("documents").find((d) => d.id === docId);
    if (!doc) throw new Error("文档不存在");

    db.update("documents", (list) =>
      list.map((d) => (d.id === docId ? { ...d, status: "recognizing" as const } : d)),
    );

    // 模拟分批识别
    const recognitions: RecognitionResult[] = [];
    for (const section of doc.sections) {
      // 将 section 内容按题目拆分
      const questionBlocks = section.content
        .split(/\n\s*\d+[.、]\s*/)
        .filter((b) => b.trim().length > 5);

      for (const block of questionBlocks) {
        await delay(400); // 每题识别延迟
        const stem = extractStem(block);
        const type = detectQuestionType(block);
        const options = extractOptions(block);
        const answer = inferAnswer(type, options);
        const analysis = generateAnalysis(stem, type);
        const chapterIds = inferChapters(stem);
        const knowledgePointIds = inferKnowledgePoints(stem, chapterIds);
        const webAnnotations = webAnalyze(stem);

        const recognition: RecognitionResult = {
          id: genId("rec"),
          documentId: docId,
          sectionId: section.id,
          question: {
            type,
            stem,
            options,
            answer,
            analysis,
            chapterIds,
            knowledgePointIds,
            difficulty: (Math.floor(Math.random() * 3) + 2) as 2 | 3 | 4,
            recommendation: (Math.floor(Math.random() * 3) + 3) as 3 | 4 | 5,
            usageCount: 0,
            remark: "",
            isShared: false,
          },
          confidence: 0.85 + Math.random() * 0.13,
          webAnnotations,
          status: "pending",
        };
        recognitions.push(recognition);
      }
    }

    db.update("recognitions", (list) => [...list, ...recognitions]);
    db.update("documents", (list) =>
      list.map((d) => (d.id === docId ? { ...d, status: "recognized" as const } : d)),
    );

    return recognitions;
  },

  // 获取识别结果
  async getRecognitions(docId: string): Promise<RecognitionResult[]> {
    await delay(200);
    return db.read("recognitions").filter((r) => r.documentId === docId);
  },

  // 更新识别结果（用户编辑）
  async updateRecognition(recognitionId: string, patch: Partial<RecognitionResult>): Promise<void> {
    await delay(200);
    db.update("recognitions", (list) =>
      list.map((r) => (r.id === recognitionId ? { ...r, ...patch } : r)),
    );
  },

  // 重新识别单个题目
  async reRecognize(recognitionId: string): Promise<RecognitionResult> {
    await delay(1000);
    const rec = db.read("recognitions").find((r) => r.id === recognitionId);
    if (!rec) throw new Error("识别记录不存在");

    // 重新生成章节与知识点（结果可能略有不同）
    const newChapterIds = inferChapters(rec.question.stem);
    const newKpIds = inferKnowledgePoints(rec.question.stem, newChapterIds);
    const newWeb = webAnalyze(rec.question.stem);

    const updated: RecognitionResult = {
      ...rec,
      question: {
        ...rec.question,
        chapterIds: newChapterIds,
        knowledgePointIds: newKpIds,
      },
      confidence: 0.88 + Math.random() * 0.1,
      webAnnotations: newWeb,
      status: "pending",
    };

    db.update("recognitions", (list) =>
      list.map((r) => (r.id === recognitionId ? updated : r)),
    );
    return updated;
  },

  // 确认识别结果并入库
  async confirmRecognition(
    recognitionId: string,
    teacherId: string,
    schoolId: string,
  ): Promise<Question> {
    await delay(300);
    const rec = db.read("recognitions").find((r) => r.id === recognitionId);
    if (!rec) throw new Error("识别记录不存在");

    const question = await questionService.createQuestion(teacherId, schoolId, {
      ...rec.question,
    });

    db.update("recognitions", (list) =>
      list.map((r) =>
        r.id === recognitionId ? { ...r, status: "confirmed" as const } : r,
      ),
    );

    return question;
  },

  // 批量确认
  async confirmAll(
    docId: string,
    teacherId: string,
    schoolId: string,
  ): Promise<Question[]> {
    await delay(800);
    const recs = db.read("recognitions").filter(
      (r) => r.documentId === docId && r.status === "pending",
    );
    const created: Question[] = [];
    for (const rec of recs) {
      const q = await questionService.createQuestion(teacherId, schoolId, rec.question);
      created.push(q);
    }
    db.update("recognitions", (list) =>
      list.map((r) =>
        r.documentId === docId && r.status === "pending"
          ? { ...r, status: "confirmed" as const }
          : r,
      ),
    );
    db.update("documents", (list) =>
      list.map((d) => (d.id === docId ? { ...d, status: "confirmed" as const } : d)),
    );
    return created;
  },

  // 拒绝识别结果
  async rejectRecognition(recognitionId: string): Promise<void> {
    await delay(200);
    db.update("recognitions", (list) =>
      list.map((r) =>
        r.id === recognitionId ? { ...r, status: "rejected" as const } : r,
      ),
    );
  },

  // AI 生成知识点讲解
  async generateKnowledgePoint(topic: string, context?: string): Promise<string> {
    await delay(1500);
    maybeThrowError();

    // 模拟生成内容
    const intro = `**${topic}** 是本章节的核心概念之一。`;
    const definition = context
      ? `结合您提供的上下文（${context.slice(0, 30)}...），可以从以下几个维度展开：`
      : "可以从定义、性质、典型例题三个维度展开：";

    const sections = [
      `\n\n**一、定义与基本概念**\n${topic}指在特定条件下成立的数学关系，需要满足对应的前提条件。理解时要注意概念的内涵与外延。`,
      `\n\n**二、主要性质**\n1. 唯一性：在满足条件下结果唯一确定。\n2. 可逆性：运算过程可在适当条件下逆向推导。\n3. 传递性：关系可通过中间量进行传递。`,
      `\n\n**三、典型应用**\n例题：已知条件 A、B，求目标量 C。\n解：根据${topic}的定义，结合已知条件可得 C = f(A, B)。代入数据即得最终结果。`,
      `\n\n**四、易错点提示**\n- 注意定义域的限制条件。\n- 区分相似概念（如子集与真子集、并集与交集）。\n- 计算过程中关注符号变化。`,
    ];

    return intro + definition + sections.join("");
  },

  // 联网查询某题的标注统计
  async webAnalyzeQuestion(stem: string): Promise<WebAnnotationStats> {
    await delay(700);
    return webAnalyze(stem);
  },
};
