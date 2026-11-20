import type { TreeNode } from "@/types";

type DirectoryKey = "chapterIds" | "knowledgePointIds" | "thoughtMethodIds";
export type DirectoryDocument = {
  id: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  thoughtMethodIds?: string[];
};

/** Count distinct documents in each subtree, including descendants beyond the visible depth. */
export function documentDirectoryTree(
  root: TreeNode,
  documents: DirectoryDocument[],
  key: DirectoryKey,
  maxDepth = Infinity,
): TreeNode {
  const byNode = new Map<string, Set<string>>();
  for (const document of documents) {
    for (const id of document[key] || []) {
      if (!byNode.has(id)) byNode.set(id, new Set());
      byNode.get(id)!.add(document.id);
    }
  }
  const walk = (node: TreeNode, depth: number): { tree: TreeNode; ids: Set<string> } => {
    const ids = new Set(byNode.get(node.id) || []);
    const children = node.children.map((child) => walk(child, depth + 1));
    for (const child of children) for (const id of child.ids) ids.add(id);
    return {
      ids,
      tree: {
        ...node,
        count: ids.size,
        directCount: byNode.get(node.id)?.size ?? 0,
        children: depth >= maxDepth ? [] : children.map((child) => child.tree),
      },
    };
  };
  return walk(root, 0).tree;
}
