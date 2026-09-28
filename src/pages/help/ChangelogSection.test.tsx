import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChangelogSection } from "@/pages/help/ChangelogSection";
import type { HelpBoardSnapshot } from "@/types";

function board(canManageChangelog: boolean): HelpBoardSnapshot {
  return {
    topics: [],
    categories: [],
    canManage: false,
    changelog: [{
      id: "change-1",
      title: "九月更新",
      content: "新增更新日志。",
      createdAt: "2026-09-28T12:00:00.000Z",
      updatedAt: "2026-09-28T12:00:00.000Z",
    }],
    canManageChangelog,
    changelogShareToken: canManageChangelog ? "share-token" : null,
  };
}

describe("ChangelogSection", () => {
  it("keeps changelog controls read-only for ordinary users", () => {
    render(<ChangelogSection board={board(false)} loading={false} onRefresh={vi.fn()} />);

    expect(screen.getByText("九月更新")).toBeInTheDocument();
    expect(screen.getByText("新增更新日志。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增日志" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("编辑更新日志")).not.toBeInTheDocument();
    expect(screen.queryByTitle("删除更新日志")).not.toBeInTheDocument();
  });

  it("shows maintenance and sharing controls to platform administrators", () => {
    render(<ChangelogSection board={board(true)} loading={false} onRefresh={vi.fn()} />);

    expect(screen.getByRole("button", { name: "新增日志" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分享链接" })).toBeInTheDocument();
    expect(screen.getByTitle("编辑更新日志")).toBeInTheDocument();
    expect(screen.getByTitle("删除更新日志")).toBeInTheDocument();
  });
});
