import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BoardDocument, TreeNode } from "@/types";
import { chapterBoardCount } from "./board-chapters";

interface Props {
  tree: TreeNode;
  boards: BoardDocument[];
  selectedChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  onSelectBoard: (boardId: string) => void;
  activeBoardId: string;
}

export function BoardChapterTree({ tree, boards, selectedChapterId, onSelectChapter, onSelectBoard, activeBoardId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(tree.children.map((node) => node.id)));
  const toggle = (id: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const children = depth < 3 ? node.children : [];
    const direct = boards.filter((board) => board.kind === "structure" && board.chapterId === node.id);
    const isExpanded = expanded.has(node.id);
    return <div key={node.id}>
      <div className="flex min-w-0 items-center" style={{ paddingLeft: (depth - 1) * 10 }}>
        <button type="button" aria-label={`展开或收起 ${node.name}`}
          aria-expanded={isExpanded} onClick={() => toggle(node.id)}
          className="shrink-0 rounded p-1 text-ink-500 hover:bg-mist">
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button type="button" onClick={() => { onSelectChapter(node.id); if (!isExpanded) toggle(node.id); }}
          aria-current={selectedChapterId === node.id ? "true" : undefined}
          className={`flex min-w-0 flex-1 items-center justify-between gap-1 rounded px-1 py-1.5 text-left text-xs hover:bg-mist ${selectedChapterId === node.id ? "bg-amber-50 text-amber-900" : "text-ink-700"}`}>
          <span className="truncate">{node.name}</span>
          <span aria-label={`${chapterBoardCount(node, boards)} 个结构化板书`}
            className="shrink-0 text-[10px] text-ink-400">{chapterBoardCount(node, boards)}</span>
        </button>
      </div>
      {isExpanded && <div>
        {direct.map((board) => <button type="button" key={board.id}
          onClick={() => onSelectBoard(board.id)}
          className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] hover:bg-mist ${activeBoardId === board.id ? "text-amber-900" : "text-ink-500"}`}
          style={{ paddingLeft: depth * 10 + 18 }} title={board.title}>{board.title}</button>)}
        {children.map((child) => renderNode(child, depth + 1))}
      </div>}
    </div>;
  };
  return <nav aria-label="章节课目录" className="max-h-[45vh] space-y-0.5 overflow-y-auto">
    {tree.children.length ? tree.children.map((node) => renderNode(node, 1))
      : <p className="p-2 text-xs text-ink-400">暂无章节课目录</p>}
  </nav>;
}
