import { z } from "zod";
import type {
  OnlineParsedQuestion,
  OnlineResource,
  OnlineResourceSearchParams,
  Question,
} from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";
import { generateStructuredContent } from "../lib/ai-provider.js";
import { fetchPublicText } from "../lib/safe-fetch.js";
import { questionService } from "./question.js";

const parsedQuestionsSchema = z.object({
  items: z.array(z.object({
    type: z.enum(["single", "multiple", "judge", "short", "essay"]),
    stem: z.string().min(1),
    options: z.array(z.string()).optional(),
    answer: z.string().min(1),
    analysis: z.string().min(1),
    difficulty: z.number().int().min(1).max(5),
    chapterNames: z.array(z.string()).max(5).default([]),
    knowledgePointNames: z.array(z.string()).max(8).default([]),
    confidence: z.number().min(0).max(1),
  })).min(1).max(100),
});

export const onlineResourceService = {
  async search(params: OnlineResourceSearchParams): Promise<OnlineResource[]> {
    let results = [...db.read("onlineResources")];
    if (params.keyword) {
      const keyword = params.keyword.trim().toLowerCase();
      results = results.filter((resource) =>
        resource.title.toLowerCase().includes(keyword)
        || resource.description.toLowerCase().includes(keyword)
        || resource.tags.some((tag) => tag.toLowerCase().includes(keyword)),
      );
    }
    if (params.subject) results = results.filter((resource) => resource.subject === params.subject);
    if (params.grade) results = results.filter((resource) => resource.grade === params.grade);
    if (params.year) results = results.filter((resource) => resource.year === params.year);
    if (params.region) results = results.filter((resource) => resource.region === params.region);
    if (params.type) results = results.filter((resource) => resource.type === params.type);
    return results.sort((left, right) => right.hotness - left.hotness);
  },

  async getResource(resourceId: string): Promise<OnlineResource | null> {
    return db.read("onlineResources").find((resource) => resource.id === resourceId) || null;
  },

  async parseResource(resourceId: string): Promise<OnlineParsedQuestion[]> {
    const resource = db.read("onlineResources").find((item) => item.id === resourceId);
    if (!resource) throw new Error("资源不存在");

    db.update("onlineResources", (list) => list.map((item) =>
      item.id === resourceId ? { ...item, status: "parsing" as const } : item,
    ));

    try {
      const fetched = await fetchPublicText(resource.sourceUrl);
      if (fetched.text.length < 30) throw new Error("在线资源正文过短，无法解析");
      const result = await generateStructuredContent(
        "你是教学资源结构化服务。只返回 JSON。只提取原文真实存在的题目、答案和解析；不得编造答案。原文缺失答案或解析时，分别写“待教师补充”和“待教师补充解析”。",
        `资源标题：${resource.title}\n资源来源：${resource.source}\n最终 URL：${fetched.finalUrl}\n\n请从以下正文提取题目，返回 {"items":[{"type":"single|multiple|judge|short|essay","stem":"...","options":["..."],"answer":"...","analysis":"...","difficulty":3,"chapterNames":[],"knowledgePointNames":[],"confidence":0.8}]}。confidence 仅表示原文提取完整度。\n\n正文：\n${fetched.text.slice(0, 100_000)}`,
        parsedQuestionsSchema,
      );
      const parsedQuestions: OnlineParsedQuestion[] = result.items.map((item) => ({
        ...item,
        difficulty: item.difficulty as 1 | 2 | 3 | 4 | 5,
        id: genId("olq"),
        resourceId,
        selected: true,
      }));
      db.update("onlineResources", (list) => list.map((item) =>
        item.id === resourceId
          ? {
              ...item,
              sourceUrl: fetched.finalUrl,
              status: "parsed" as const,
              parsedQuestions,
              questionCount: parsedQuestions.length,
            }
          : item,
      ));
      return parsedQuestions;
    } catch (error) {
      db.update("onlineResources", (list) => list.map((item) =>
        item.id === resourceId ? { ...item, status: "failed" as const } : item,
      ));
      throw error;
    }
  },

  async getParsedQuestions(resourceId: string): Promise<OnlineParsedQuestion[]> {
    const resource = db.read("onlineResources").find((item) => item.id === resourceId);
    return resource?.parsedQuestions || [];
  },

  async importQuestions(
    resourceId: string,
    teacherId: string,
    schoolId: string,
    selectedQuestionIds: string[],
  ): Promise<Question[]> {
    const resource = db.read("onlineResources").find((item) => item.id === resourceId);
    if (!resource?.parsedQuestions) throw new Error("资源未解析或不存在");
    const chapters = db.read("chapters");
    const points = db.read("knowledgePoints");
    const created: Question[] = [];

    for (const parsed of resource.parsedQuestions) {
      if (!selectedQuestionIds.includes(parsed.id)) continue;
      const chapterIds = chapters
        .filter((chapter) => parsed.chapterNames.some((name) => chapter.name.includes(name)))
        .map((chapter) => chapter.id);
      const knowledgePointIds = points
        .filter((point) => parsed.knowledgePointNames.some((name) => point.name.includes(name)))
        .map((point) => point.id);
      created.push(await questionService.createQuestion(teacherId, schoolId, {
        type: parsed.type,
        stem: parsed.stem,
        options: parsed.options,
        answer: parsed.answer,
        analysis: parsed.analysis,
        chapterIds,
        knowledgePointIds,
        grade: resource.grade,
        schoolYear: resource.year,
        semester: "上学期",
        difficulty: parsed.difficulty,
        recommendation: 3,
        remark: `来源：${resource.title}（${resource.sourceUrl}）`,
        isShared: false,
      }));
    }

    db.update("onlineResources", (list) => list.map((item) =>
      item.id === resourceId ? { ...item, status: "imported" as const } : item,
    ));
    return created;
  },

  async updateQuestionSelection(resourceId: string, questionId: string, selected: boolean): Promise<void> {
    db.update("onlineResources", (list) => list.map((resource) =>
      resource.id === resourceId && resource.parsedQuestions
        ? {
            ...resource,
            parsedQuestions: resource.parsedQuestions.map((question) =>
              question.id === questionId ? { ...question, selected } : question,
            ),
          }
        : resource,
    ));
  },

  async getHotResources(limit = 6): Promise<OnlineResource[]> {
    return [...db.read("onlineResources")]
      .sort((left, right) => right.hotness - left.hotness)
      .slice(0, Math.max(0, limit));
  },
};
