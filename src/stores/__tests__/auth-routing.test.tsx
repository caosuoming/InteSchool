import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { db } from "@/services/db";
import { useAuthStore } from "@/stores/auth";

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock("@/pages/resources/MyResourcesPage", () => ({
  default: () => <div>我的资源页面内容</div>,
}));

vi.mock("@/pages/dashboard/DashboardPage", () => ({
  default: () => <div>工作台页面内容</div>,
}));

vi.mock("@/pages/auth/LoginPage", () => ({
  default: () => <div>登录页面内容</div>,
}));

describe("protected route initialization", () => {
  beforeEach(() => {
    db.reset();
    db.write("currentTeacherId", "tch-1");
    useAuthStore.setState(useAuthStore.getInitialState(), true);
    window.history.replaceState({}, "", "/my-resources");
  });

  it("waits for persisted authentication before deciding redirects", async () => {
    expect(useAuthStore.getInitialState().loading).toBe(true);

    render(<App />);

    expect(await screen.findByText("我的资源页面内容")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/my-resources");
    expect(screen.queryByText("工作台页面内容")).not.toBeInTheDocument();
    expect(screen.queryByText("登录页面内容")).not.toBeInTheDocument();
  });
});
