export type LearningTreePlacement = "top" | "normal" | "bottom";

export interface LearningTreeNode {
  id: string;
  parentId: string | null;
  order: number;
}

export function applyLearningTreePlacement(
  placements: Readonly<Record<string, LearningTreePlacement>>,
  selectedIds: ReadonlySet<string>,
  placement: LearningTreePlacement,
): Record<string, LearningTreePlacement> {
  const next = { ...placements };
  for (const id of selectedIds) {
    if (placement === "normal") delete next[id];
    else next[id] = placement;
  }
  return next;
}

export function orderVisibleLearningTree<T extends LearningTreeNode>(
  nodes: T[],
  placements: Readonly<Record<string, LearningTreePlacement>>,
  collapsedIds: ReadonlySet<string>,
): T[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index] as const));
  const childrenByParent = new Map<string | null, T[]>();

  for (const node of nodes) {
    const effectiveParent = node.parentId && nodeById.has(node.parentId) ? node.parentId : null;
    const siblings = childrenByParent.get(effectiveParent) ?? [];
    siblings.push(node);
    childrenByParent.set(effectiveParent, siblings);
  }

  const sortNodes = (items: T[]) => items.sort((a, b) => (
    a.order - b.order
    || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0)
  ));

  const movedIds = new Set(
    nodes
      .filter((node) => {
        const placement = placements[node.id] ?? "normal";
        return placement === "top" || placement === "bottom";
      })
      .map((node) => node.id),
  );
  const topNodes = sortNodes(nodes.filter((node) => placements[node.id] === "top"));
  const bottomNodes = sortNodes(nodes.filter((node) => placements[node.id] === "bottom"));
  const rootNodes = sortNodes(
    (childrenByParent.get(null) ?? []).filter((node) => !movedIds.has(node.id)),
  );

  const ordered: T[] = [];
  const visited = new Set<string>();
  const reachable = new Set<string>();
  const markReachable = (node: T) => {
    if (reachable.has(node.id)) return;
    reachable.add(node.id);
    for (const child of childrenByParent.get(node.id) ?? []) markReachable(child);
  };
  const visit = (node: T) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    ordered.push(node);
    if (collapsedIds.has(node.id)) return;

    for (const child of sortNodes([...(childrenByParent.get(node.id) ?? [])])) {
      // Explicitly moved nodes are detached from their original parent until restored to normal.
      if (movedIds.has(child.id)) continue;
      visit(child);
    }
  };

  // Explicit top nodes are global roots, followed by the normal tree, then explicit bottom nodes.
  for (const node of topNodes) markReachable(node);
  for (const node of rootNodes) markReachable(node);
  for (const node of bottomNodes) markReachable(node);
  for (const node of topNodes) visit(node);
  for (const node of rootNodes) visit(node);
  for (const node of bottomNodes) visit(node);

  // Keep malformed/cyclic legacy data visible exactly once.
  for (const node of sortNodes([...nodes])) {
    if (!reachable.has(node.id)) visit(node);
  }

  return ordered;
}
