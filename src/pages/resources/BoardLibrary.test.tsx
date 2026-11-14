import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BoardDocument, TreeNode } from "@/types";
import { BoardLibrary } from "./BoardLibrary";

const master: BoardDocument = {
  id: "master:alice", kind: "master", teacherId: "alice", schoolId: "school-a", subject: "数学",
  title: "总导图", rootNodeId: "root",
  nodes: [{ id: "root", parentId: null, x: 50, y: 8, label: "总导图" }],
  edges: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
const chapter: TreeNode = {
  id: "root", name: "全部章节", type: "chapter", count: 0, children: [
    { id: "chapter-a", name: "第一章", type: "chapter", count: 0, children: [] },
  ],
};
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ teacher: { id: "alice", schoolId: "school-a" } }),
}));
vi.mock("@/stores/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/services/board", () => ({
  boardService: {
    listBoards: vi.fn(async () => [master]),
    getBoard: vi.fn(async () => master),
    createBoard: vi.fn(),
    deleteBoard: vi.fn(),
    saveBoard: vi.fn(),
  },
}));
vi.mock("@/services/knowledge", () => ({
  knowledgeService: { getChapterTree: vi.fn(async () => chapter) },
}));

describe("board library layout", () => {
  it("folds each navigation panel and property sidebar, and toggles fullscreen with Escape", async () => {
    render(<BoardLibrary />);
    await waitFor(() => expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument());
    expect(screen.getByRole("navigation", { name: "章节课目录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "向上折叠导图库" }));
    expect(screen.getByRole("button", { name: "展开导图库" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "向上折叠章节课目录" }));
    expect(screen.queryByRole("navigation", { name: "章节课目录" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "向左折叠目录" }));
    expect(screen.getByRole("button", { name: "展开左侧目录" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "向右折叠编辑属性" }));
    expect(screen.getByRole("button", { name: "展开编辑属性" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全屏" }));
    expect(screen.getByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "展开编辑属性" })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument();
  });
});
