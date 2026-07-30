import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { basketService } from "./basket.js";

function state(): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    baskets: [],
  };
}

describe("basket audience persistence", () => {
  it("stores deduplicated class and student targets when creating a basket", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const created = await basketService.createBasket(
        "teacher-1",
        "分层练习",
        undefined,
        false,
        {
          classIds: ["class-1", "class-1"],
          studentIds: ["student-1", "student-1", "student-2"],
        },
      );

      expect(created).toMatchObject({
        classIds: ["class-1"],
        studentIds: ["student-1", "student-2"],
      });
      expect(appState.baskets).toEqual([created]);
    });
  });

  it("updates an existing basket audience", async () => {
    const appState = state();

    await runWithState(appState, async () => {
      const created = await basketService.createBasket("teacher-1", "课堂练习");
      const updated = await basketService.updateBasket(created.id, {
        classIds: ["class-2"],
        studentIds: ["student-3"],
      });

      expect(updated).toMatchObject({
        classIds: ["class-2"],
        studentIds: ["student-3"],
      });
      expect(appState.baskets[0]).toMatchObject({
        classIds: ["class-2"],
        studentIds: ["student-3"],
      });
    });
  });
});
