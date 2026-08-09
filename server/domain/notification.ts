import type { AppNotification, AppNotificationType } from "../../src/types/index.js";
import { genId } from "../domain-shared.js";
import { db } from "../runtime-db.js";
import type { AppState } from "../types.js";

export interface CreateNotificationInput {
  recipientTeacherId: string;
  type: AppNotificationType;
  title: string;
  content: string;
  actionUrl?: string;
}

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
  const notification = buildNotification(input);
  const notifications = Array.isArray(state.notifications) ? state.notifications as AppNotification[] : [];
  state.notifications = [notification, ...notifications];
  return notification;
}

export function createNotification(input: CreateNotificationInput): AppNotification {
  const notification = buildNotification(input);
  db.update("notifications", (items: AppNotification[] = []) => [notification, ...items]);
  return notification;
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
