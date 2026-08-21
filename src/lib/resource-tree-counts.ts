import type { TreeNode } from "@/types";

type DirectoryType = "chapter" | "knowledge";

type DirectoryResource = {
  id: string;
  chapterIds?: string[];
  knowledgePointIds?: string[];
};

/**
 * Recalculate a directory tree's counts for an arbitrary resource collection.
 * Parent nodes include resources attached to any descendant, and a resource is
 * counted at most once even when it is linked to multiple nodes in the subtree.
 */
export function annotateTreeWithResourceCounts(
  tree: TreeNode,
  resources: readonly DirectoryResource[],
  type: DirectoryType,
): TreeNode {
  const field = type === "chapter" ? "chapterIds" : "knowledgePointIds";
  const resourceIdsByDirectoryId = new Map<string, Set<string>>();

  for (const resource of resources) {
    for (const directoryId of resource[field] ?? []) {
      const resourceIds = resourceIdsByDirectoryId.get(directoryId) ?? new Set<string>();
      resourceIds.add(resource.id);
      resourceIdsByDirectoryId.set(directoryId, resourceIds);
    }
  }

  const annotate = (
    node: TreeNode,
    isRoot = false,
  ): { node: TreeNode; subtreeIds: Set<string> } => {
    const annotatedChildren = node.children.map((child) => annotate(child));
    const subtreeIds = new Set<string>();
    if (!isRoot) subtreeIds.add(node.id);
    for (const child of annotatedChildren) {
      for (const id of child.subtreeIds) subtreeIds.add(id);
    }

    const matchedResourceIds = new Set<string>();
    for (const directoryId of subtreeIds) {
      for (const resourceId of resourceIdsByDirectoryId.get(directoryId) ?? []) {
        matchedResourceIds.add(resourceId);
      }
    }

    return {
      subtreeIds,
      node: {
        ...node,
        count: matchedResourceIds.size,
        children: annotatedChildren.map((child) => child.node),
      },
    };
  };

  return annotate(tree, true).node;
}
