import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { DashboardQuickActions } from "./DashboardQuickActions";

const KEY = "inteschool:dashboard:quick-actions:test";
const renderActions = (schoolAccess = true) => render(<MemoryRouter><DashboardQuickActions storageKey={KEY} schoolAccess={schoolAccess} /></MemoryRouter>);

beforeEach(() => localStorage.clear());

describe("custom dashboard quick actions", () => {
  it("keeps existing defaults and saves selected actions across mounts", () => {
    const view = renderActions();
    expect(screen.getByRole("link", { name: /导入文档/ })).toHaveAttribute("href", "/upload");
    expect(screen.queryByRole("link", { name: /作业记录/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /作业记录/ }));
    fireEvent.click(screen.getByRole("button", { name: "上移作业记录" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByRole("link", { name: /作业记录/ })).toHaveAttribute("href", "/my-students/homework");
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as string[];
    expect(saved).toEqual(["import", "new-lecture", "questions", "homework-record", "new-basket"]);
    view.unmount();
    renderActions();
    const quickLinks = screen.getByRole("link", { name: /作业记录/ }).parentElement!.querySelectorAll("a");
    expect([...quickLinks].map((link) => link.getAttribute("href"))).toEqual([
      "/upload", "/lectures/new", "/my-resources/questions", "/my-students/homework", "/baskets",
    ]);
    expect(screen.getByRole("link", { name: /作业记录/ })).toBeInTheDocument();
  });

  it("supports restoring defaults and cancelling without writing", () => {
    localStorage.setItem(KEY, JSON.stringify(["homework-record"]));
    renderActions();
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("link", { name: /作业记录/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复默认" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.queryByRole("link", { name: /作业记录/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /导入文档/ })).toBeInTheDocument();
  });

  it("ignores invalid saved IDs and prevents selecting more than eight", () => {
    localStorage.setItem(KEY, JSON.stringify(["import", "import", "nonsense", "scanner"]));
    renderActions(false);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "自定义" }));
    for (const label of ["新建讲义", "题库管理", "新建试题篮", "出作业", "资源篮出卷", "作业记录", "师生互动"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(label) }));
    }
    expect(screen.getByRole("checkbox", { name: /学生学情/ })).toBeDisabled();
  });
});
