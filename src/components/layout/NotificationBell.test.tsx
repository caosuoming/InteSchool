import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { notificationService } from "@/services/notification";

vi.mock("@/services/notification", () => ({
  notificationService: {
    listNotifications: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const unread = {
  id: "notification-1",
  recipientTeacherId: "teacher-1",
  type: "approval" as const,
  title: "学校认证已通过",
  content: "你加入测试学校的认证已通过。",
  actionUrl: "/dashboard",
  createdAt: new Date().toISOString(),
  readAt: null,
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.mocked(notificationService.listNotifications).mockResolvedValue([unread]);
    vi.mocked(notificationService.markRead).mockResolvedValue({ ...unread, readAt: new Date().toISOString() });
    vi.mocked(notificationService.markAllRead).mockResolvedValue(1);
  });

  it("shows unread count and rings when unread messages exist", async () => {
    render(
      <MemoryRouter>
        <NotificationBell teacherId="teacher-1" />
      </MemoryRouter>,
    );

    const button = await screen.findByRole("button", { name: "消息，1 条未读" });
    expect(button.querySelector("svg")).toHaveClass("notification-bell-unread");
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("opens the notification target in a new tab and marks it as read", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <MemoryRouter>
        <NotificationBell teacherId="teacher-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "消息，1 条未读" }));
    expect(await screen.findByText("学校认证已通过")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /学校认证已通过/ }));

    expect(openSpy).toHaveBeenCalledWith("/dashboard", "_blank", "noopener,noreferrer");
    await waitFor(() => {
      expect(notificationService.markRead).toHaveBeenCalledWith("notification-1", "teacher-1");
    });
  });

  it("marks all unread messages as read", async () => {
    render(
      <MemoryRouter>
        <NotificationBell teacherId="teacher-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "消息，1 条未读" }));
    fireEvent.click(await screen.findByRole("button", { name: "全部已读" }));

    await waitFor(() => {
      expect(notificationService.markAllRead).toHaveBeenCalledWith("teacher-1");
    });
    expect(screen.getByText("暂无未读消息")).toBeInTheDocument();
  });
});
