import type {
  OnlineResource,
  OnlineResourceSearchParams,
  OnlineParsedQuestion,
  Question,
  QuestionType,
} from "@/types";
import { db } from "./db";
import { delay, genId, maybeThrowError } from "./_shared";
import { questionService } from "./question";

// ============ 在线资源 Mock 服务 ============

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

// 答案推断
function inferAnswer(type: QuestionType, options?: string[]): string {
  if (type === "judge") return "正确";
  if (type === "essay" || type === "short") return "（参考答案请结合知识点判断）";
  if (options && options.length) {
    const idx = Math.floor(Math.random() * options.length);
    return String.fromCharCode(65 + idx);
  }
  return "A";
}

// 生成解析
function generateAnalysis(stem: string, type: QuestionType): string {
  const templates = [
    "本题考察基础概念的理解与应用，需要准确把握定义内涵。",
    "通过分析题目条件，结合相关公式进行推导，注意运算过程中的符号问题。",
    "关键在于识别题目类型，应用对应的方法求解，建议结合图象辅助分析。",
    "需要分类讨论，对每种情况分别求解后再综合得出结论。",
  ];
  return templates[Math.floor(Math.random() * templates.length)] + ` 题目核心：${stem.slice(0, 30)}...`;
}

// 模拟从网络抓取试卷内容
function mockFetchPaperContent(resource: OnlineResource): string {
  const samples = [
    `1. 已知集合 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∩ B =\nA. {1}\nB. {2, 3}\nC. {2, 3, 4}\nD. {1, 2, 3, 4}\n\n2. 函数 f(x) = √(x - 1) 的定义域为\nA. [1, +∞)\nB. (1, +∞)\nC. (-∞, 1]\nD. R`,
    `1. 设集合 A = {x | 0 < x < 2}，B = {x | 1 ≤ x ≤ 3}，则 A ∩ B =\nA. (0, 3)\nB. (1, 2)\nC. [1, 2)\nD. (1, 2]\n\n2. 已知函数 f(x) = 2x + 1，则 f(f(2)) =\nA. 5\nB. 7\nC. 9\nD. 11`,
    `1. 下列函数中，在区间 (0, +∞) 上单调递增的是\nA. y = 1/x\nB. y = -x²\nC. y = √x\nD. y = log₀.₅(x)\n\n2. 函数 y = x² - 2x + 3 的最小值为\nA. 1\nB. 2\nC. 3\nD. 4`,
  ];
  // 根据 resource 生成不同内容
  const idx = resource.id.charCodeAt(resource.id.length - 1) % samples.length;
  return samples[idx];
}

// AI 解析题目
function parseQuestions(resource: OnlineResource): OnlineParsedQuestion[] {
  const content = mockFetchPaperContent(resource);
  const questionBlocks = content
    .split(/\n\s*\d+[.、]\s*/)
    .filter((b) => b.trim().length > 5);

  const chapters = db.read("chapters");
  const points = db.read("knowledgePoints");

  return questionBlocks.map((block) => {
    const stem = extractStem(block);
    const type = detectQuestionType(block);
    const options = extractOptions(block);
    const answer = inferAnswer(type, options);
    const analysis = generateAnalysis(stem, type);

    // 随机匹配章节和知识点
    const chapterNames = chapters
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((c) => c.name.replace(/^第[一二三四五六七八九十]+章\s*/, ""));
    const pointNames = points
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((p) => p.name);

    return {
      id: genId("olq"),
      resourceId: resource.id,
      type,
      stem,
      options,
      answer,
      analysis,
      difficulty: (Math.floor(Math.random() * 3) + 2) as 2 | 3 | 4,
      chapterNames,
      knowledgePointNames: pointNames,
      confidence: 0.85 + Math.random() * 0.13,
      selected: true,
    };
  });
}

export const onlineResourceService = {
  // 搜索在线资源
  async search(params: OnlineResourceSearchParams): Promise<OnlineResource[]> {
    await delay(800);
    maybeThrowError(0.02);

    let results = db.read("onlineResources");

    if (params.keyword) {
      const kw = params.keyword.trim().toLowerCase();
      results = results.filter(
        (r) =>
          r.title.toLowerCase().includes(kw) ||
          r.description.toLowerCase().includes(kw) ||
          r.tags.some((t) => t.toLowerCase().includes(kw)),
      );
    }
    if (params.subject) {
      results = results.filter((r) => r.subject === params.subject);
    }
    if (params.grade) {
      results = results.filter((r) => r.grade === params.grade);
    }
    if (params.year) {
      results = results.filter((r) => r.year === params.year);
    }
    if (params.region) {
      results = results.filter((r) => r.region === params.region);
    }
    if (params.type) {
      results = results.filter((r) => r.type === params.type);
    }

    // 按热度排序
    return results.sort((a, b) => b.hotness - a.hotness);
  },

  // 获取资源详情
  async getResource(resourceId: string): Promise<OnlineResource | null> {
    await delay(150);
    return db.read("onlineResources").find((r) => r.id === resourceId) || null;
  },

  // AI 解析资源
  async parseResource(resourceId: string): Promise<OnlineParsedQuestion[]> {
    await delay(1500);
    maybeThrowError();

    const resource = db.read("onlineResources").find((r) => r.id === resourceId);
    if (!resource) throw new Error("资源不存在");

    // 更新状态为解析中
    db.update("onlineResources", (list) =>
      list.map((r) =>
        r.id === resourceId ? { ...r, status: "parsing" as const } : r,
      ),
    );

    await delay(1000);

    const parsedQuestions = parseQuestions(resource);

    // 更新资源和解析结果
    db.update("onlineResources", (list) =>
      list.map((r) =>
        r.id === resourceId
          ? {
              ...r,
              status: "parsed" as const,
              parsedQuestions,
              questionCount: parsedQuestions.length,
            }
          : r,
      ),
    );

    return parsedQuestions;
  },

  // 获取已解析的题目
  async getParsedQuestions(resourceId: string): Promise<OnlineParsedQuestion[]> {
    await delay(200);
    const resource = db.read("onlineResources").find((r) => r.id === resourceId);
    return resource?.parsedQuestions || [];
  },

  // 导入选中的题目到题库
  async importQuestions(
    resourceId: string,
    teacherId: string,
    schoolId: string,
    selectedQuestionIds: string[],
  ): Promise<Question[]> {
    await delay(600);
    maybeThrowError();

    const resource = db.read("onlineResources").find((r) => r.id === resourceId);
    if (!resource || !resource.parsedQuestions) {
      throw new Error("资源未解析或不存在");
    }

    const chapters = db.read("chapters");
    const points = db.read("knowledgePoints");

    const created: Question[] = [];
    for (const pq of resource.parsedQuestions) {
      if (!selectedQuestionIds.includes(pq.id)) continue;

      // 根据名称匹配章节和知识点 ID
      const chapterIds = chapters
        .filter((c) => pq.chapterNames.some((n) => c.name.includes(n)))
        .map((c) => c.id);
      const knowledgePointIds = points
        .filter((p) => pq.knowledgePointNames.some((n) => p.name.includes(n)))
        .map((p) => p.id);

      const question = await questionService.createQuestion(teacherId, schoolId, {
        type: pq.type,
        stem: pq.stem,
        options: pq.options,
        answer: pq.answer,
        analysis: pq.analysis,
        chapterIds,
        knowledgePointIds,
        difficulty: pq.difficulty,
        recommendation: 4,
        remark: `来源：${resource.title}`,
        isShared: false,
      });
      created.push(question);
    }

    // 更新资源状态为已导入
    db.update("onlineResources", (list) =>
      list.map((r) =>
        r.id === resourceId ? { ...r, status: "imported" as const } : r,
      ),
    );

    return created;
  },

  // 更新解析题目的选中状态
  async updateQuestionSelection(
    resourceId: string,
    questionId: string,
    selected: boolean,
  ): Promise<void> {
    await delay(100);
    db.update("onlineResources", (list) =>
      list.map((r) =>
        r.id === resourceId && r.parsedQuestions
          ? {
              ...r,
              parsedQuestions: r.parsedQuestions.map((q) =>
                q.id === questionId ? { ...q, selected } : q,
              ),
            }
          : r,
      ),
    );
  },

  // 获取推荐资源（热门）
  async getHotResources(limit: number = 6): Promise<OnlineResource[]> {
    await delay(300);
    return db
      .read("onlineResources")
      .sort((a, b) => b.hotness - a.hotness)
      .slice(0, limit);
  },
};
