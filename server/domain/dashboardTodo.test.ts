import { describe, expect, it } from "vitest";
import { runWithState } from "../runtime-db.js";
import { dashboardTodoService } from "./dashboardTodo.js";
import type { AppState } from "../types.js";

const sample = {
  type: "document" as const, resourceId: "doc1", title: "批量导入.docx",
  detail: "等待入库", href: "/import", status: "completed" as const,
};

function state(): AppState {
  return {
    teachers: [], currentTeacherId: null, dashboardTodos: [],
    documents: [{ id: "doc1", teacherId: "teacher1" }],
  };
}

describe("dashboardTodoService", () => {
  it("persists completed and cancelled snapshots independently per teacher", async () => {
    const data = state();
    await runWithState(data, async () => {
      const completed = await dashboardTodoService.setTodoStatus("teacher1", sample);
      expect(completed.id).toBe("teacher1:document:doc1");
      expect((await dashboardTodoService.listTodoRecords("teacher1"))[0]?.status).toBe("completed");
      await dashboardTodoService.setTodoStatus("teacher1", { ...sample, status: "cancelled" });
      const items = await dashboardTodoService.listTodoRecords("teacher1");
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("cancelled");
      expect(await dashboardTodoService.listTodoRecords("teacher2")).toEqual([]);
    });
  });

  it("rejects tasks that do not belong to the teacher and invalid URLs", async () => {
    await runWithState(state(), async () => {
      await expect(dashboardTodoService.setTodoStatus("teacher2", sample))
        .rejects.toThrow("待办事项不存在或无权操作");
      await expect(dashboardTodoService.setTodoStatus("teacher1", { ...sample, href: "//example.com" }))
        .rejects.toThrow("待办事项参数不合法");
      await expect(dashboardTodoService.setTodoStatus("teacher1", { ...sample, type: "unknown" as never }))
        .rejects.toThrow("待办事项参数不合法");
    });
  });
});
