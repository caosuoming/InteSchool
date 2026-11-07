import type { DashboardTodoInput, DashboardTodoRecord, DashboardTodoType } from "../../src/types/index.js";
import { db } from "../runtime-db.js";

const SOURCE_COLLECTIONS: Record<DashboardTodoType, string> = {
  correction: "platformResourceCorrections",
  document: "documents",
  courseware: "lessonCoursewares",
  scan: "examPapers",
  lecture: "lectures",
};

function records(): DashboardTodoRecord[] {
  return (db.read("dashboardTodos") || []) as DashboardTodoRecord[];
}

export const dashboardTodoService = {
  async listTodoRecords(teacherId: string): Promise<DashboardTodoRecord[]> {
    return records()
      .filter((record) => record.teacherId === teacherId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async setTodoStatus(teacherId: string, input: DashboardTodoInput): Promise<DashboardTodoRecord> {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || !Object.hasOwn(SOURCE_COLLECTIONS, input.type)
      || !["completed", "cancelled"].includes(input.status)
      || typeof input.resourceId !== "string" || !input.resourceId.trim() || input.resourceId.length > 200
      || typeof input.title !== "string" || !input.title.trim() || input.title.length > 250
      || typeof input.detail !== "string" || input.detail.length > 600
      || typeof input.href !== "string" || !/^\/(?!\/)[^\s]*$/.test(input.href) || input.href.length > 600) {
      throw new Error("待办事项参数不合法");
    }

    const id = `${teacherId}:${input.type}:${input.resourceId}`;
    const source = ((db.read(SOURCE_COLLECTIONS[input.type]) || []) as Array<{
      id: string; teacherId?: string; recipientTeacherId?: string;
    }>).find((item) => item.id === input.resourceId);
    const owner = input.type === "correction" ? source?.recipientTeacherId : source?.teacherId;
    if (owner !== teacherId && !records().some((item) => item.id === id && item.teacherId === teacherId)) {
      throw new Error("待办事项不存在或无权操作");
    }

    const record: DashboardTodoRecord = {
      id, teacherId, type: input.type, resourceId: input.resourceId,
      title: input.title.trim(), detail: input.detail, href: input.href,
      status: input.status, updatedAt: new Date().toISOString(),
    };
    db.update("dashboardTodos", (items: DashboardTodoRecord[] = []) =>
      [...items.filter((item) => item.id !== id), record]);
    return record;
  },
};
