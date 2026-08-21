import { describe, expect, it } from "vitest";
import type { TreeNode } from "@/types";
import { annotateTreeWithResourceCounts } from "@/lib/resource-tree-counts";

function node(id: string, children: TreeNode[] = []): TreeNode {
  return {
    id,
    name: id,
    type: "chapter",
    count: 99,
    children,
  };
}

function findNode(tree: TreeNode, id: string): TreeNode {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    try {
      return findNode(child, id);
    } catch {
      // Continue searching sibling branches.
    }
  }
  throw new Error(`Missing tree node: ${id}`);
}

describe("annotateTreeWithResourceCounts", () => {
  it("counts only resources from the supplied library", () => {
    const tree = node("chapter-root", [
      node("chapter-a", [node("chapter-a-1")]),
      node("chapter-b"),
    ]);

    const examTree = annotateTreeWithResourceCounts(tree, [
      { id: "paper-1", chapterIds: ["chapter-a-1"] },
      { id: "paper-2", chapterIds: ["chapter-a"] },
      { id: "paper-3", chapterIds: ["chapter-b"] },
    ], "chapter");
    const lectureTree = annotateTreeWithResourceCounts(tree, [
      { id: "lecture-1", chapterIds: ["chapter-b"] },
    ], "chapter");

    expect(findNode(examTree, "chapter-a").count).toBe(2);
    expect(findNode(examTree, "chapter-b").count).toBe(1);
    expect(findNode(lectureTree, "chapter-a").count).toBe(0);
    expect(findNode(lectureTree, "chapter-b").count).toBe(1);
  });

  it("counts a resource once when it is linked to multiple nodes in one subtree", () => {
    const tree = node("root", [node("parent", [node("child")])]);
    const annotated = annotateTreeWithResourceCounts(tree, [
      { id: "resource-1", chapterIds: ["parent", "child"] },
      { id: "resource-2", chapterIds: ["child"] },
    ], "chapter");

    expect(findNode(annotated, "parent").count).toBe(2);
    expect(findNode(annotated, "child").count).toBe(2);
  });

  it("uses knowledge-point associations independently of chapter associations", () => {
    const tree: TreeNode = {
      id: "knowledge-root",
      name: "全部知识点",
      type: "knowledge",
      count: 99,
      children: [{
        id: "knowledge-a",
        name: "知识点 A",
        type: "knowledge",
        count: 99,
        children: [],
      }],
    };

    const annotated = annotateTreeWithResourceCounts(tree, [
      { id: "material-1", chapterIds: ["knowledge-a"], knowledgePointIds: [] },
      { id: "material-2", knowledgePointIds: ["knowledge-a"] },
    ], "knowledge");

    expect(findNode(annotated, "knowledge-a").count).toBe(1);
  });
});
