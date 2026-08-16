import type {
  HelpAttachment,
  HelpBoardSnapshot,
  HelpCategory,
  HelpReply,
  HelpReplyType,
  HelpTopic,
  HelpTopicType,
  Teacher,
} from "../../src/types/index.js";
import { genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";

const TOPIC_TYPES = new Set<HelpTopicType>(["question", "suggestion", "wish"]);
const REPLY_TYPES = new Set<HelpReplyType>(["follow_up", "answer"]);

function activeRole(teacher: Teacher): string {
  const affiliation = teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent);
  return affiliation?.role || teacher.role;
}

function canManage(teacher: Teacher): boolean {
  return ["school_admin", "platform_admin"].includes(activeRole(teacher));
}

function requireManager(teacher: Teacher): void {
  if (!canManage(teacher)) throw new Error("该操作需要学校管理员权限");
}

function publicAuthor(teacher: Teacher): { name: string; avatar: string } {
  const nickname = teacher.nickname?.trim();
  return {
    name: nickname || "匿名用户",
    avatar: nickname ? teacher.avatar : "",
  };
}

function normalizeAttachments(input: HelpAttachment[] | undefined): HelpAttachment[] {
  if (!input?.length) return [];
  if (input.length > 6) throw new Error("每次最多上传 6 张图片");
  const seen = new Set<string>();
  return input.map((item) => {
    const id = String(item.id || "").trim();
    if (!id || seen.has(id)) throw new Error("图片附件不合法");
    seen.add(id);
    const mimeType = String(item.mimeType || "").trim().toLowerCase();
    if (!mimeType.startsWith("image/")) throw new Error("这里只支持上传图片");
    return {
      id,
      name: String(item.name || "图片").trim().slice(0, 200) || "图片",
      mimeType,
      size: Math.max(0, Number(item.size) || 0),
      url: `/api/files/${encodeURIComponent(id)}`,
    };
  });
}

function topicById(topicId: string): HelpTopic {
  const topic = (db.read("helpTopics") as HelpTopic[]).find((item) => item.id === topicId);
  if (!topic) throw new Error("话题不存在");
  return topic;
}

function sortedTopics(): HelpTopic[] {
  return [...(db.read("helpTopics") as HelpTopic[])].sort((left, right) => {
    const orderDiff = right.sortOrder - left.sortOrder;
    if (orderDiff !== 0) return orderDiff;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export interface HelpTopicInput {
  type: HelpTopicType;
  title: string;
  content: string;
  categoryId?: string | null;
  attachments?: HelpAttachment[];
}

export interface HelpReplyInput {
  type: HelpReplyType;
  content: string;
  attachments?: HelpAttachment[];
}

export const helpService = {
  async getBoard(teacher: Teacher): Promise<HelpBoardSnapshot> {
    const replies = [...(db.read("helpReplies") as HelpReply[])]
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    const repliesByTopic = new Map<string, HelpReply[]>();
    for (const reply of replies) {
      const bucket = repliesByTopic.get(reply.topicId) || [];
      bucket.push(reply);
      repliesByTopic.set(reply.topicId, bucket);
    }
    const topics = sortedTopics().map((topic) => ({
      ...topic,
      replies: repliesByTopic.get(topic.id) || [],
    }));
    const categories = [...(db.read("helpCategories") as HelpCategory[])]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"));
    return { topics, categories, canManage: canManage(teacher) };
  },

  async createTopic(input: HelpTopicInput, teacher: Teacher): Promise<HelpTopic> {
    if (!TOPIC_TYPES.has(input.type)) throw new Error("请选择正确的话题类型");
    const title = String(input.title || "").trim();
    const content = String(input.content || "").trim();
    if (!title) throw new Error("请输入话题标题");
    if (title.length > 100) throw new Error("话题标题不能超过 100 字");
    if (!content) throw new Error("请输入话题内容");
    if (content.length > 5000) throw new Error("话题内容不能超过 5000 字");
    const categoryId = input.categoryId || null;
    if (categoryId && !(db.read("helpCategories") as HelpCategory[]).some((item) => item.id === categoryId)) {
      throw new Error("分类不存在");
    }
    const now = new Date().toISOString();
    const existing = db.read("helpTopics") as HelpTopic[];
    const maxOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);
    const author = publicAuthor(teacher);
    const topic: HelpTopic = {
      id: genId("help-topic"),
      authorId: teacher.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      type: input.type,
      title,
      content,
      categoryId,
      attachments: normalizeAttachments(input.attachments),
      sortOrder: Math.max(Date.now(), maxOrder + 1),
      createdAt: now,
      updatedAt: now,
    };
    db.update("helpTopics", (items: HelpTopic[]) => [topic, ...items]);
    return topic;
  },

  async addReply(topicId: string, input: HelpReplyInput, teacher: Teacher): Promise<HelpReply> {
    if (!REPLY_TYPES.has(input.type)) throw new Error("请选择补充或回答");
    const content = String(input.content || "").trim();
    if (!content) throw new Error("请输入回复内容");
    if (content.length > 5000) throw new Error("回复内容不能超过 5000 字");
    const topic = topicById(topicId);
    const now = new Date().toISOString();
    const author = publicAuthor(teacher);
    const reply: HelpReply = {
      id: genId("help-reply"),
      topicId,
      authorId: teacher.id,
      authorName: author.name,
      authorAvatar: author.avatar,
      type: input.type,
      content,
      attachments: normalizeAttachments(input.attachments),
      createdAt: now,
      updatedAt: now,
    };
    db.update("helpReplies", (items: HelpReply[]) => [...items, reply]);
    db.update("helpTopics", (items: HelpTopic[]) => items.map((item) => (
      item.id === topic.id ? { ...item, updatedAt: now } : item
    )));
    return reply;
  },

  async createCategory(nameInput: string, teacher: Teacher): Promise<HelpCategory> {
    requireManager(teacher);
    const name = String(nameInput || "").trim();
    if (!name) throw new Error("请输入分类名称");
    if (name.length > 30) throw new Error("分类名称不能超过 30 字");
    const categories = db.read("helpCategories") as HelpCategory[];
    if (categories.some((item) => item.name.localeCompare(name, "zh-CN", { sensitivity: "accent" }) === 0)) {
      throw new Error("该分类已经存在");
    }
    const now = new Date().toISOString();
    const category: HelpCategory = {
      id: genId("help-category"),
      name,
      sortOrder: categories.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1,
      createdBy: teacher.id,
      createdAt: now,
      updatedAt: now,
    };
    db.update("helpCategories", (items: HelpCategory[]) => [...items, category]);
    return category;
  },

  async deleteCategory(categoryId: string, teacher: Teacher): Promise<void> {
    requireManager(teacher);
    if (!(db.read("helpCategories") as HelpCategory[]).some((item) => item.id === categoryId)) {
      throw new Error("分类不存在");
    }
    db.update("helpCategories", (items: HelpCategory[]) => items.filter((item) => item.id !== categoryId));
    db.update("helpTopics", (items: HelpTopic[]) => items.map((item) => (
      item.categoryId === categoryId ? { ...item, categoryId: null, updatedAt: new Date().toISOString() } : item
    )));
  },

  async setTopicCategory(topicId: string, categoryId: string | null, teacher: Teacher): Promise<void> {
    requireManager(teacher);
    topicById(topicId);
    if (categoryId && !(db.read("helpCategories") as HelpCategory[]).some((item) => item.id === categoryId)) {
      throw new Error("分类不存在");
    }
    const now = new Date().toISOString();
    db.update("helpTopics", (items: HelpTopic[]) => items.map((item) => (
      item.id === topicId ? { ...item, categoryId: categoryId || null, updatedAt: now } : item
    )));
  },

  async moveTopic(topicId: string, direction: "up" | "down", teacher: Teacher): Promise<void> {
    requireManager(teacher);
    if (direction !== "up" && direction !== "down") throw new Error("排序方向不合法");
    const ordered = sortedTopics();
    const index = ordered.findIndex((item) => item.id === topicId);
    if (index < 0) throw new Error("话题不存在");
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    const peer = ordered[targetIndex];
    const current = ordered[index];
    db.update("helpTopics", (items: HelpTopic[]) => items.map((item) => {
      if (item.id === current.id) return { ...item, sortOrder: peer.sortOrder };
      if (item.id === peer.id) return { ...item, sortOrder: current.sortOrder };
      return item;
    }));
  },

  async deleteTopic(topicId: string, teacher: Teacher): Promise<void> {
    requireManager(teacher);
    topicById(topicId);
    db.update("helpTopics", (items: HelpTopic[]) => items.filter((item) => item.id !== topicId));
    db.update("helpReplies", (items: HelpReply[]) => items.filter((item) => item.topicId !== topicId));
  },

  async deleteReply(replyId: string, teacher: Teacher): Promise<void> {
    requireManager(teacher);
    const replies = db.read("helpReplies") as HelpReply[];
    if (!replies.some((item) => item.id === replyId)) throw new Error("回复不存在");
    db.update("helpReplies", (items: HelpReply[]) => items.filter((item) => item.id !== replyId));
  },
};
