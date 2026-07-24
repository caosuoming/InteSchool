import type { Basket } from "../../src/types/index.js";
import { db } from "../runtime-db.js";
import { delay, genId, maybeThrowError } from "../domain-shared.js";

export const basketService = {
  async listBaskets(teacherId: string): Promise<Basket[]> {
    await delay(200);
    return db
      .read("baskets")
      .filter((b) => b.teacherId === teacherId)
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  },

  async getBasket(id: string): Promise<Basket | null> {
    await delay(150);
    return db.read("baskets").find((b) => b.id === id) || null;
  },

  async getDefaultBasket(teacherId: string): Promise<Basket | null> {
    await delay(100);
    return db.read("baskets").find((b) => b.teacherId === teacherId && b.isDefault) || null;
  },

  async setDefaultBasket(teacherId: string, basketId: string): Promise<void> {
    await delay(200);
    db.update("baskets", (list) =>
      list.map((b) =>
        b.teacherId === teacherId
          ? { ...b, isDefault: b.id === basketId }
          : b,
      ),
    );
  },

  async createBasket(teacherId: string, name: string, description?: string, isDefault = false): Promise<Basket> {
    await delay(300);
    maybeThrowError();
    const now = new Date().toISOString();
    const basket: Basket = {
      id: genId("bsk"),
      teacherId,
      name,
      description,
      questionIds: [],
      materialIds: [],
      isDefault,
      createdAt: now,
      updatedAt: now,
    };
    if (isDefault) {
      db.update("baskets", (list) =>
        list.map((b) => b.teacherId === teacherId ? { ...b, isDefault: false } : b),
      );
    }
    db.update("baskets", (list) => [...list, basket]);
    return basket;
  },

  async updateBasket(id: string, patch: Partial<Basket>): Promise<Basket> {
    await delay(200);
    let updated: Basket | null = null;
    db.update("baskets", (list) => {
      if (patch.isDefault) {
        const target = list.find((b) => b.id === id);
        if (target) {
          list = list.map((b) =>
            b.teacherId === target.teacherId ? { ...b, isDefault: false } : b,
          );
        }
      }
      return list.map((b) => {
        if (b.id === id) {
          updated = { ...b, ...patch, updatedAt: new Date().toISOString() };
          return updated;
        }
        return b;
      });
    });
    if (!updated) throw new Error("试题篮不存在");
    return updated;
  },

  async deleteBasket(id: string): Promise<void> {
    await delay(200);
    db.update("baskets", (list) => list.filter((b) => b.id !== id));
  },

  async addQuestion(basketId: string, questionId: string): Promise<void> {
    await delay(150);
    db.update("baskets", (list) =>
      list.map((b) =>
        b.id === basketId && !b.questionIds.includes(questionId)
          ? { ...b, questionIds: [...b.questionIds, questionId], updatedAt: new Date().toISOString() }
          : b,
      ),
    );
  },

  async addMaterial(basketId: string, materialId: string): Promise<void> {
    await delay(150);
    db.update("baskets", (list) =>
      list.map((b) =>
        b.id === basketId && !b.materialIds.includes(materialId)
          ? { ...b, materialIds: [...b.materialIds, materialId], updatedAt: new Date().toISOString() }
          : b,
      ),
    );
  },

  async addQuestionToDefault(teacherId: string, questionId: string): Promise<Basket | null> {
    await delay(200);
    const defaultBasket = db
      .read("baskets")
      .find((b) => b.teacherId === teacherId && b.isDefault);
    if (!defaultBasket) return null;
    if (!defaultBasket.questionIds.includes(questionId)) {
      db.update("baskets", (list) =>
        list.map((b) =>
          b.id === defaultBasket.id
            ? { ...b, questionIds: [...b.questionIds, questionId], updatedAt: new Date().toISOString() }
            : b,
        ),
      );
      return { ...defaultBasket, questionIds: [...defaultBasket.questionIds, questionId] };
    }
    return defaultBasket;
  },

  async removeQuestion(basketId: string, questionId: string): Promise<void> {
    await delay(150);
    db.update("baskets", (list) =>
      list.map((b) =>
        b.id === basketId
          ? {
              ...b,
              questionIds: b.questionIds.filter((id) => id !== questionId),
              updatedAt: new Date().toISOString(),
            }
          : b,
      ),
    );
  },

  async removeMaterial(basketId: string, materialId: string): Promise<void> {
    await delay(150);
    db.update("baskets", (list) =>
      list.map((b) =>
        b.id === basketId
          ? {
              ...b,
              materialIds: b.materialIds.filter((id) => id !== materialId),
              updatedAt: new Date().toISOString(),
            }
          : b,
      ),
    );
  },

  async moveQuestion(
    fromBasketId: string,
    toBasketId: string,
    questionId: string,
  ): Promise<void> {
    await delay(250);
    await this.removeQuestion(fromBasketId, questionId);
    await this.addQuestion(toBasketId, questionId);
  },
};
