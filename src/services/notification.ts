import { rpcCall } from "./api";
import type { AppNotification } from "@/types";

export const notificationService = {
  async listNotifications(teacherId: string): Promise<AppNotification[]> {
    return rpcCall("notification", "listNotifications", [teacherId]) as Promise<AppNotification[]>;
  },

  async markRead(notificationId: string, teacherId: string): Promise<AppNotification> {
    return rpcCall("notification", "markNotificationRead", [notificationId, teacherId]) as Promise<AppNotification>;
  },

  async markAllRead(teacherId: string): Promise<number> {
    return rpcCall("notification", "markAllNotificationsRead", [teacherId]) as Promise<number>;
  },
};
