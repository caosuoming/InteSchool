import { describe, expect, it } from "vitest";
import type { Teacher } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { helpService } from "./help.js";

function teacher(
  id: string,
  role: "teacher" | "school_admin" | "platform_admin" = "teacher",
  nickname = id,
): Teacher {
  return {
    id,
    email: `${id}@example.com`,
    name: `Teacher ${id}`,
    nickname,
    avatar: "",
    schoolId: "school-1",
    subject: "数学",
    status: "active",
    role,
    roles: ["teacher"],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `aff-${id}`,
      teacherId: id,
      schoolId: "school-1",
      schoolName: "学校一",
      subject: "数学",
      status: "active",
      role,
      roles: ["teacher"],
      subjectGroupIds: [],
      prepGroupIds: [],
      isCurrent: true,
      joinedAt: new Date().toISOString(),
    }],
    currentAffiliationId: `aff-${id}`,
    createdAt: new Date().toISOString(),
  };
}

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    helpTopics: [],
    helpReplies: [],
    helpCategories: [],
    helpChangelogEntries: [],
    helpChangelogShares: [],
  };
}

describe("helpService", () => {
  it("lets teachers publish topics and threaded replies, newest topic first", async () => {
    const appState = state();
    const alice = teacher("alice");
    const bob = teacher("bob");

    await runWithState(appState, async () => {
      const first = await helpService.createTopic({
        type: "question",
        title: "怎样上传试卷？",
        content: "找不到入口",
      }, alice);
      const second = await helpService.createTopic({
        type: "wish",
        title: "希望增加快捷键",
        content: "常用操作可以更快",
      }, bob);
      await helpService.addReply(first.id, {
        type: "answer",
        content: "可以从左侧获取资源进入。",
      }, bob);

      const board = await helpService.getBoard(alice);
      expect(board.canManage).toBe(false);
      expect(board.topics.map((item) => item.id)).toEqual([second.id, first.id]);
      expect(board.topics[1].replies).toHaveLength(1);
      expect(board.topics[1].replies[0].authorName).toBe("bob");
    });
  });

  it("uses the public nickname and keeps users without one anonymous", async () => {
    const appState = state();
    const anonymous = teacher("anonymous", "teacher", "");
    await runWithState(appState, async () => {
      const topic = await helpService.createTopic({
        type: "suggestion",
        title: "建议",
        content: "内容",
      }, anonymous);
      expect(topic.authorName).toBe("匿名用户");
      expect(topic.authorAvatar).toBe("");
    });
  });

  it("reserves categories, ordering, and deletion for administrators", async () => {
    const appState = state();
    const user = teacher("user");
    const admin = teacher("admin", "school_admin");

    await runWithState(appState, async () => {
      const first = await helpService.createTopic({ type: "question", title: "A", content: "A" }, user);
      const second = await helpService.createTopic({ type: "question", title: "B", content: "B" }, user);
      await expect(helpService.createCategory("使用帮助", user)).rejects.toThrow("学校管理员");

      const category = await helpService.createCategory("使用帮助", admin);
      await expect(helpService.createTopic({
        type: "question",
        title: "普通用户不能自行归类",
        content: "分类由管理员维护",
        categoryId: category.id,
      }, user)).rejects.toThrow("学校管理员");
      await helpService.setTopicCategory(first.id, category.id, admin);
      await helpService.moveTopic(first.id, "up", admin);
      let board = await helpService.getBoard(admin);
      expect(board.canManage).toBe(true);
      expect(board.topics[0].id).toBe(first.id);
      expect(board.topics[0].categoryId).toBe(category.id);

      const reply = await helpService.addReply(first.id, { type: "follow_up", content: "补充" }, user);
      await helpService.deleteReply(reply.id, admin);
      await helpService.deleteTopic(second.id, admin);
      board = await helpService.getBoard(admin);
      expect(board.topics).toHaveLength(1);
      expect(board.topics[0].replies).toHaveLength(0);
    });
  });

  it("lets administrators assign a category while creating a topic", async () => {
    const appState = state();
    const admin = teacher("admin", "school_admin");

    await runWithState(appState, async () => {
      const category = await helpService.createCategory("使用帮助", admin);
      const topic = await helpService.createTopic({
        type: "question",
        title: "管理员直接归类",
        content: "管理员发帖时可以指定分类",
        categoryId: category.id,
      }, admin);
      expect(topic.categoryId).toBe(category.id);
    });
  });

  it("allows only platform administrators to maintain and share the changelog", async () => {
    const appState = state();
    const user = teacher("user");
    const schoolAdmin = teacher("school-admin", "school_admin");
    const platformAdmin = teacher("platform-admin", "platform_admin");

    await runWithState(appState, async () => {
      await expect(helpService.createChangelogEntry({
        title: "普通用户更新",
        content: "不应成功",
      }, user)).rejects.toThrow("平台管理员");

      await expect(helpService.createChangelogEntry({
        title: "学校管理员更新",
        content: "也不应成功",
      }, schoolAdmin)).rejects.toThrow("平台管理员");

      const entry = await helpService.createChangelogEntry({
        title: "九月更新",
        content: "新增更新日志。",
      }, platformAdmin);
      expect((await helpService.getBoard(user)).canManageChangelog).toBe(false);
      expect((await helpService.getBoard(schoolAdmin)).changelogShareToken).toBeNull();

      await helpService.updateChangelogEntry(entry.id, {
        title: "九月更新（修订）",
        content: "新增更新日志和分享链接。",
      }, platformAdmin);

      const token = await helpService.generateChangelogShare(platformAdmin);
      const adminBoard = await helpService.getBoard(platformAdmin);
      expect(adminBoard.canManageChangelog).toBe(true);
      expect(adminBoard.changelogShareToken).toBe(token);
      expect(adminBoard.changelog[0].title).toBe("九月更新（修订）");
      expect(await helpService.getSharedChangelog(token)).toHaveLength(1);

      const replacementToken = await helpService.generateChangelogShare(platformAdmin);
      expect(replacementToken).not.toBe(token);
      await expect(helpService.getSharedChangelog(token)).rejects.toThrow("已失效");
      expect(await helpService.getSharedChangelog(replacementToken)).toHaveLength(1);

      await helpService.deleteChangelogEntry(entry.id, platformAdmin);
      expect(await helpService.getSharedChangelog(replacementToken)).toEqual([]);
    });
  });

  it("accepts only image attachments and caps them at six", async () => {
    const appState = state();
    const user = teacher("user");
    await runWithState(appState, async () => {
      await expect(helpService.createTopic({
        type: "question",
        title: "附件",
        content: "附件",
        attachments: [{ id: "file-1", name: "a.pdf", mimeType: "application/pdf", size: 10, url: "/ignored" }],
      }, user)).rejects.toThrow("只支持上传图片");

      await expect(helpService.createTopic({
        type: "question",
        title: "附件",
        content: "附件",
        attachments: Array.from({ length: 7 }, (_, index) => ({
          id: `file-${index}`,
          name: `${index}.png`,
          mimeType: "image/png",
          size: 10,
          url: "/ignored",
        })),
      }, user)).rejects.toThrow("最多上传 6 张图片");
    });
  });
});
