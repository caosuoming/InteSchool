import { describe, expect, it } from "vitest";
import { documentDirectoryTree } from "./document-directory-counts";
import type { TreeNode } from "@/types";

const node = (id: string, children: TreeNode[] = []): TreeNode => ({
  id, name: id, type: "chapter", count: 100, children,
});

describe("documentDirectoryTree", () => {
  it("hides fourth-level chapters but includes their distinct documents in ancestor counts", () => {
    const tree = node("root", [node("a", [node("b", [node("c", [node("d")])])])]);
    const result = documentDirectoryTree(tree, [
      { id: "p1", chapterIds: ["b", "d"], knowledgePointIds: [] },
      { id: "p2", chapterIds: ["d"], knowledgePointIds: [] },
    ], "chapterIds", 3);
    expect(result.children[0].count).toBe(2);
    expect(result.children[0].children[0].directCount).toBe(1);
    expect(result.children[0].children[0].children[0].count).toBe(2);
    expect(result.children[0].children[0].children[0].children).toEqual([]);
  });
  it("counts only associated documents, not question counts", () => {
    const result = documentDirectoryTree(node("root", [node("k")]), [
      { id: "l1", chapterIds: [], knowledgePointIds: ["k"] },
    ], "knowledgePointIds");
    expect(result.children[0].count).toBe(1);
    expect(result.children[0].directCount).toBe(1);
  });
});
