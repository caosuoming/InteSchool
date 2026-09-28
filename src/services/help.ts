import { rpcCall } from "./api";
import type {
  HelpAttachment,
  HelpBoardSnapshot,
  HelpChangelogEntry,
  HelpReply,
  HelpReplyType,
  HelpTopic,
  HelpTopicType,
} from "@/types";

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

export interface HelpChangelogInput {
  title: string;
  content: string;
}

export const helpService = {
  async getBoard(): Promise<HelpBoardSnapshot> {
    return rpcCall("help", "getBoard", [null]) as Promise<HelpBoardSnapshot>;
  },

  async createTopic(input: HelpTopicInput): Promise<HelpTopic> {
    return rpcCall("help", "createTopic", [input, null]) as Promise<HelpTopic>;
  },

  async addReply(topicId: string, input: HelpReplyInput): Promise<HelpReply> {
    return rpcCall("help", "addReply", [topicId, input, null]) as Promise<HelpReply>;
  },

  async createCategory(name: string): Promise<void> {
    await rpcCall("help", "createCategory", [name, null]);
  },

  async deleteCategory(categoryId: string): Promise<void> {
    await rpcCall("help", "deleteCategory", [categoryId, null]);
  },

  async setTopicCategory(topicId: string, categoryId: string | null): Promise<void> {
    await rpcCall("help", "setTopicCategory", [topicId, categoryId, null]);
  },

  async moveTopic(topicId: string, direction: "up" | "down"): Promise<void> {
    await rpcCall("help", "moveTopic", [topicId, direction, null]);
  },

  async deleteTopic(topicId: string): Promise<void> {
    await rpcCall("help", "deleteTopic", [topicId, null]);
  },

  async deleteReply(replyId: string): Promise<void> {
    await rpcCall("help", "deleteReply", [replyId, null]);
  },

  async createChangelogEntry(input: HelpChangelogInput): Promise<HelpChangelogEntry> {
    return rpcCall("help", "createChangelogEntry", [input, null]) as Promise<HelpChangelogEntry>;
  },

  async updateChangelogEntry(entryId: string, input: HelpChangelogInput): Promise<HelpChangelogEntry> {
    return rpcCall("help", "updateChangelogEntry", [entryId, input, null]) as Promise<HelpChangelogEntry>;
  },

  async deleteChangelogEntry(entryId: string): Promise<void> {
    await rpcCall("help", "deleteChangelogEntry", [entryId, null]);
  },

  async generateChangelogShare(): Promise<string> {
    return rpcCall("help", "generateChangelogShare", [null]) as Promise<string>;
  },

  async getSharedChangelog(token: string): Promise<HelpChangelogEntry[]> {
    return rpcCall("help", "getSharedChangelog", [token]) as Promise<HelpChangelogEntry[]>;
  },
};
