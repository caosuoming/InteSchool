import { rpcCall } from "./api";
import type {
  HelpAttachment,
  HelpBoardSnapshot,
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
};
