import type { AppNotification, AppNotificationType } from "../../src/types/index.js";
import { genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";
import type { AppState, TeacherRecord } from "../types.js";

export interface CreateNotificationInput {
  recipientTeacherId: string;
  type: AppNotificationType;
  title: string;
  content: string;
  actionUrl?: string;
}

export type CreateNotificationDetails = Omit<CreateNotificationInput, "recipientTeacherId">;

function buildNotification(input: CreateNotificationInput): AppNotification {
  return {
    id: genId("notification"),
    recipientTeacherId: input.recipientTeacherId,
    type: input.type,
    title: input.title.trim(),
    content: input.content.trim(),
    actionUrl: input.actionUrl,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
}

export function createNotificationInState(state: AppState, input: CreateNotificationInput): AppNotification {
  return createNotificationsInState(state, [input.recipientTeacherId], input)[0];
}

export function createNotificationsInState(
  state: AppState,
  recipientTeacherIds: Iterable<string>,
  input: CreateNotificationDetails,
): AppNotification[] {
  const recipientIds = [...new Set(recipientTeacherIds)].filter(Boolean);
  const created = recipientIds.map((recipientTeacherId) => buildNotification({
    ...input,
    recipientTeacherId,
  }));
  const notifications = Array.isArray(state.notifications) ? state.notifications as AppNotification[] : [];
  state.notifications = [...created, ...notifications];
  return created;
}

export function createNotification(input: CreateNotificationInput): AppNotification {
  const notification = buildNotification(input);
  db.update("notifications", (items: AppNotification[] = []) => [notification, ...items]);
  return notification;
}

function hasAccountRole(teacher: TeacherRecord, role: "school_admin" | "platform_admin"): boolean {
  if (teacher.status === "active" && teacher.role === role) return true;
  return teacher.affiliations.some((affiliation) =>
    affiliation.status === "active" && affiliation.role === role,
  );
}

/** 返回拥有平台超级管理员身份的教师账号。 */
export function platformAdminTeacherIds(teachers: TeacherRecord[]): string[] {
  return teachers
    .filter((teacher) => hasAccountRole(teacher, "platform_admin"))
    .map((teacher) => teacher.id);
}

/** 返回指定学校的管理员；可选同时包含拥有全平台审核权的超级管理员。 */
export function schoolReviewTeacherIds(
  teachers: TeacherRecord[],
  schoolId: string,
  includePlatformAdmins = true,
): string[] {
  return teachers
    .filter((teacher) => {
      if (includePlatformAdmins && hasAccountRole(teacher, "platform_admin")) return true;
      if (teacher.status === "active" && teacher.schoolId === schoolId && teacher.role === "school_admin") return true;
      return teacher.affiliations.some((affiliation) =>
        affiliation.status === "active"
        && affiliation.schoolId === schoolId
        && affiliation.role === "school_admin",
      );
    })
    .map((teacher) => teacher.id);
}

export const notificationService = {
  async listNotifications(teacherId: string): Promise<AppNotification[]> {
    return (db.read("notifications") as AppNotification[] || [])
      .filter((item) => item.recipientTeacherId === teacherId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 50);
  },

  async markNotificationRead(notificationId: string, teacherId: string): Promise<AppNotification> {
    const notifications = (db.read("notifications") as AppNotification[] || []);
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.recipientTeacherId !== teacherId) throw new Error("消息不存在");
    if (notification.readAt) return notification;

    const updated = { ...notification, readAt: new Date().toISOString() };
    db.write("notifications", notifications.map((item) => item.id === notificationId ? updated : item));
    return updated;
  },

  async markAllNotificationsRead(teacherId: string): Promise<number> {
    const now = new Date().toISOString();
    let updatedCount = 0;
    db.update("notifications", (items: AppNotification[] = []) => items.map((item) => {
      if (item.recipientTeacherId !== teacherId || item.readAt) return item;
      updatedCount += 1;
      return { ...item, readAt: now };
    }));
    return updatedCount;
  },
};
