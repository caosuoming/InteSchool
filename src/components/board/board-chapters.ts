import type { BoardDocument, TreeNode } from "@/types";

export function chapterBoardCount(node: TreeNode, boards: BoardDocument[]): number {
  const direct = boards.filter((board) => board.kind === "structure" && board.chapterId === node.id).length;
  return direct + node.children.reduce((total, child) => total + chapterBoardCount(child, boards), 0);
}

export function chapterOptions(tree: TreeNode): Array<{ id: string; name: string; depth: number }> {
  const entries: Array<{ id: string; name: string; depth: number }> = [];
  function visit(node: TreeNode, depth: number) {
    if (depth > 3) return;
    if (depth > 0) entries.push({ id: node.id, name: node.name, depth });
    if (depth < 3) node.children.forEach((child) => visit(child, depth + 1));
  }
  visit(tree, 0);
  return entries;
}

