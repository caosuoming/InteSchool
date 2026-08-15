import { describe, expect, it } from "vitest";
import type { AppNotification } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import {
  createNotification,
  notificationService,
  platformAdminTeacherIds,
  schoolReviewTeacherIds,
} from "./notification.js";

function stateWithNotifications(notifications: AppNotification[] = []): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    notifications,
  };
}

function teacher(
  id: string,
  schoolId: string | null,
  role: TeacherRecord["role"],
): TeacherRecord {
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    avatar: "",
    schoolId,
    subject: "数学",
    status: "active",
    role,
    roles: [],
    subjectGroupIds: [],
    prepGroupIds: [],
    affiliations: [{
      id: `${id}-affiliation`,
      schoolId,
      role,
      status: "active",
      isCurrent: true,
    }],
    currentAffiliationId: `${id}-affiliation`,
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

describe("notificationService", () => {
  it("lists only the recipient's messages newest first", async () => {
    const state = stateWithNotifications([
      {
        id: "older", recipientTeacherId: "teacher-1", type: "system", title: "旧消息", content: "old",
        createdAt: "2026-08-08T00:00:00.000Z", readAt: null,
      },
      {
        id: "other", recipientTeacherId: "teacher-2", type: "admin", title: "别人的消息", content: "other",
        createdAt: "2026-08-09T00:00:00.000Z", readAt: null,
      },
      {
        id: "newer", recipientTeacherId: "teacher-1", type: "approval", title: "新消息", content: "new",
        createdAt: "2026-08-09T01:00:00.000Z", readAt: null,
      },
    ]);

    const result = await runWithState(state, () => notificationService.listNotifications("teacher-1"));
    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("marks one or all recipient messages read without touching other recipients", async () => {
    const state = stateWithNotifications();
    await runWithState(state, async () => {
      const first = createNotification({
        recipientTeacherId: "teacher-1", type: "approval", title: "审批", content: "通过",
      });
      const second = createNotification({
        recipientTeacherId: "teacher-1", type: "reward", title: "奖励", content: "到账",
      });
      const other = createNotification({
        recipientTeacherId: "teacher-2", type: "system", title: "系统", content: "维护",
      });

      const marked = await notificationService.markNotificationRead(first.id, "teacher-1");
      expect(marked.readAt).not.toBeNull();
      expect(await notificationService.markAllNotificationsRead("teacher-1")).toBe(1);

      const all = state.notifications as AppNotification[];
      expect(all.find((item) => item.id === first.id)?.readAt).not.toBeNull();
      expect(all.find((item) => item.id === second.id)?.readAt).not.toBeNull();
      expect(all.find((item) => item.id === other.id)?.readAt).toBeNull();
    });
  });

  it("does not allow a recipient id mismatch when marking a message", async () => {
    const state = stateWithNotifications();
    await runWithState(state, async () => {
      const notification = createNotification({
        recipientTeacherId: "teacher-1", type: "admin", title: "管理员消息", content: "内容",
      });
      await expect(notificationService.markNotificationRead(notification.id, "teacher-2"))
        .rejects.toThrow("消息不存在");
    });
  });

  it("selects only teachers who can actually review school or platform applications", () => {
    const teachers = [
      teacher("school-1-admin", "school-1", "school_admin"),
      teacher("school-2-admin", "school-2", "school_admin"),
      teacher("platform-admin", "school-2", "platform_admin"),
      teacher("ordinary", "school-1", "teacher"),
    ];

    expect(schoolReviewTeacherIds(teachers, "school-1").sort())
      .toEqual(["platform-admin", "school-1-admin"]);
    expect(schoolReviewTeacherIds(teachers, "school-1", false))
      .toEqual(["school-1-admin"]);
    expect(platformAdminTeacherIds(teachers)).toEqual(["platform-admin"]);
  });
});
