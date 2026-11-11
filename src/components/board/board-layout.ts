import type { BoardDocument, BoardNode } from "@/types";

export interface PositionedNode { node: BoardNode; x: number; y: number; distance: number }

/** 总导图的焦点展示：父级在上、子级在下、兄弟在两侧；外围字号逐层缩小。 */
export function focusBoardNodes(board: BoardDocument, focusedId: string): PositionedNode[] {
  const byId = new Map(board.nodes.filter((node) => !node.hidden).map((node) => [node.id, node]));
  const focus = byId.get(focusedId) || byId.get(board.rootNodeId);
  if (!focus) return [];
  const result = new Map<string, PositionedNode>();
  const put = (node: BoardNode | undefined, x: number, y: number, distance: number) => {
    if (node) result.set(node.id, { node, x, y, distance });
  };
  put(focus, 50, 47, 0);
  const parent = focus.parentId ? byId.get(focus.parentId) : undefined;
  put(parent, 50, 16, 1);
  put(parent?.parentId ? byId.get(parent.parentId) : undefined, 50, 4, 2);
  const siblings = parent ? board.nodes.filter((node) => !node.hidden && node.parentId === parent.id && node.id !== focus.id).slice(0, 6) : [];
  siblings.forEach((node, index) => {
    const side = index % 2 === 0 ? 18 : 82;
    put(node, side, 35 + Math.floor(index / 2) * 16, 1);
  });
  const children = board.nodes.filter((node) => !node.hidden && node.parentId === focus.id).slice(0, 9);
  children.forEach((child, index) => {
    const x = 10 + (index + 0.5) * 80 / children.length;
    put(child, x, 75, 1);
    const grandchildren = board.nodes.filter((node) => !node.hidden && node.parentId === child.id).slice(0, 3);
    grandchildren.forEach((node, subindex) => put(node,
      Math.max(4, Math.min(96, x + (subindex - (grandchildren.length - 1) / 2) * 9)), 94, 2));
  });
  return [...result.values()];
}
