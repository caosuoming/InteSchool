import { rpcCall } from "./api";

import type {
  OnlineResource,
  OnlineResourceSearchParams,
  OnlineParsedQuestion,
  Question,
} from "@/types";

export const onlineResourceService = {
  async search(params: OnlineResourceSearchParams): Promise<OnlineResource[]> {
    return rpcCall("onlineResource", "search", [params]) as any;
  },

  async getResource(resourceId: string): Promise<OnlineResource | null> {
    return rpcCall("onlineResource", "getResource", [resourceId]) as any;
  },

  async parseResource(resourceId: string): Promise<OnlineParsedQuestion[]> {
    return rpcCall("onlineResource", "parseResource", [resourceId]) as any;
  },

  async getParsedQuestions(resourceId: string): Promise<OnlineParsedQuestion[]> {
    return rpcCall("onlineResource", "getParsedQuestions", [resourceId]) as any;
  },

  async importQuestions(resourceId: string, teacherId: string, schoolId: string, selectedQuestionIds: string[]): Promise<Question[]> {
    return rpcCall("onlineResource", "importQuestions", [resourceId, teacherId, schoolId, selectedQuestionIds]) as any;
  },

  async updateQuestionSelection(resourceId: string, questionId: string, selected: boolean): Promise<void> {
    return rpcCall("onlineResource", "updateQuestionSelection", [resourceId, questionId, selected]) as any;
  },

  async getHotResources(limit: number = 6): Promise<OnlineResource[]> {
    return rpcCall("onlineResource", "getHotResources", [limit]) as any;
  }
};
