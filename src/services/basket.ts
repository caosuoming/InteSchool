import { rpcCall } from "./api";

import type { Basket } from "@/types";

export const basketService = {
  async listBaskets(teacherId: string): Promise<Basket[]> {
    return rpcCall("basket", "listBaskets", [teacherId]) as any;
  },

  async getBasket(id: string): Promise<Basket | null> {
    return rpcCall("basket", "getBasket", [id]) as any;
  },

  async getDefaultBasket(teacherId: string): Promise<Basket | null> {
    return rpcCall("basket", "getDefaultBasket", [teacherId]) as any;
  },

  async setDefaultBasket(teacherId: string, basketId: string): Promise<void> {
    return rpcCall("basket", "setDefaultBasket", [teacherId, basketId]) as any;
  },

  async createBasket(teacherId: string, name: string, description?: string, isDefault = false): Promise<Basket> {
    return rpcCall("basket", "createBasket", [teacherId, name, description, isDefault]) as any;
  },

  async updateBasket(id: string, patch: Partial<Basket>): Promise<Basket> {
    return rpcCall("basket", "updateBasket", [id, patch]) as any;
  },

  async deleteBasket(id: string): Promise<void> {
    return rpcCall("basket", "deleteBasket", [id]) as any;
  },

  async addQuestion(basketId: string, questionId: string): Promise<void> {
    return rpcCall("basket", "addQuestion", [basketId, questionId]) as any;
  },

  async addMaterial(basketId: string, materialId: string): Promise<void> {
    return rpcCall("basket", "addMaterial", [basketId, materialId]) as any;
  },

  async addQuestionToDefault(teacherId: string, questionId: string): Promise<Basket | null> {
    return rpcCall("basket", "addQuestionToDefault", [teacherId, questionId]) as any;
  },

  async removeQuestion(basketId: string, questionId: string): Promise<void> {
    return rpcCall("basket", "removeQuestion", [basketId, questionId]) as any;
  },

  async removeMaterial(basketId: string, materialId: string): Promise<void> {
    return rpcCall("basket", "removeMaterial", [basketId, materialId]) as any;
  },

  async moveQuestion(fromBasketId: string, toBasketId: string, questionId: string): Promise<void> {
    return rpcCall("basket", "moveQuestion", [fromBasketId, toBasketId, questionId]) as any;
  }
};
