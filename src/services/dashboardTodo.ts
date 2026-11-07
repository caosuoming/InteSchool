import { rpcCall } from "./api";
import type { DashboardTodoInput, DashboardTodoRecord } from "@/types";

export const dashboardTodoService = {
  async listTodoRecords(teacherId: string): Promise<DashboardTodoRecord[]> {
    return rpcCall("dashboardTodo", "listTodoRecords", [teacherId]);
  },

  async setTodoStatus(teacherId: string, input: DashboardTodoInput): Promise<DashboardTodoRecord> {
    return rpcCall("dashboardTodo", "setTodoStatus", [teacherId, input]);
  },
};
