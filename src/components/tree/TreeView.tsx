import { useState, useCallback, type DragEvent, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Circle,
} from "lucide-react";
import type { TreeNode } from "@/types";
import { cn } from "@/lib/utils";

interface TreeViewProps {
  data: TreeNode;
  checkable?: boolean;
  checkedIds?: string[];
  onCheck?: (ids: string[]) => void;
  selectedId?: string;
  onSelect?: (node: TreeNode) => void;
  showCount?: boolean;
  showDoneCount?: boolean;
  className?: string;
  defaultExpandAll?: boolean;
  expandLevel?: number;
  highlightedIds?: string[];
  highlightAccent?: "gold" | "teal";
  /** Optional per-node actions rendered at the right edge of each row. */
  renderNodeActions?: (node: TreeNode) => ReactNode;
  /** Optional tree reparenting handler. When provided, non-root rows become draggable. */
  onNodeDrop?: (source: TreeNode, target: TreeNode) => void | Promise<void>;
  /** Additional caller-specific validation for a drag target. */
  canDropNode?: (source: TreeNode, target: TreeNode) => boolean;
}

export function TreeView({
  data,
  checkable = false,
  checkedIds = [],
  onCheck,
  selectedId,
  onSelect,
  showCount = true,
  showDoneCount = false,
  className,
  defaultExpandAll = false,
  expandLevel = 1,
  highlightedIds = [],
  highlightAccent = "gold",
  renderNodeActions,
  onNodeDrop,
  canDropNode,
}: TreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpandAll) {
      const all = new Set<string>();
      const collect = (node: TreeNode) => {
        all.add(node.id);
        node.children.forEach(collect);
      };
      collect(data);
      return all;
    }
    // 默认展开到指定层级
    const initial = new Set<string>([data.id]);
    const collectToLevel = (node: TreeNode, level: number) => {
      if (level <= 0) return;
      initial.add(node.id);
      node.children.forEach((c) => collectToLevel(c, level - 1));
    };
    collectToLevel(data, expandLevel);
    return initial;
  });
  const [draggedNode, setDraggedNode] = useState<TreeNode | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 检查节点及其所有子节点
  const getNodeAndDescendants = useCallback((node: TreeNode): string[] => {
    return [node.id, ...node.children.flatMap(getNodeAndDescendants)];
  }, []);

  const isFullyChecked = useCallback(
    (node: TreeNode): boolean => {
      const all = getNodeAndDescendants(node);
      return all.every((id) => checkedIds.includes(id));
    },
    [checkedIds, getNodeAndDescendants],
  );

  const isPartiallyChecked = useCallback(
    (node: TreeNode): boolean => {
      const all = getNodeAndDescendants(node);
      const checked = all.filter((id) => checkedIds.includes(id));
      return checked.length > 0 && !all.every((id) => checkedIds.includes(id));
    },
    [checkedIds, getNodeAndDescendants],
  );

  const handleCheck = useCallback(
    (node: TreeNode) => {
      if (!onCheck) return;
      const ids = getNodeAndDescendants(node);
      if (isFullyChecked(node)) {
        onCheck(checkedIds.filter((id) => !ids.includes(id)));
      } else {
        onCheck(Array.from(new Set([...checkedIds, ...ids])));
      }
    },
    [onCheck, checkedIds, getNodeAndDescendants, isFullyChecked],
  );

  const containsNode = useCallback((root: TreeNode, id: string): boolean => {
    if (root.id === id) return true;
    return root.children.some((child) => containsNode(child, id));
  }, []);

  const canDrop = useCallback((source: TreeNode, target: TreeNode): boolean => {
    if (source.id === "root" || source.id === target.id || containsNode(source, target.id)) {
      return false;
    }
    return canDropNode ? canDropNode(source, target) : true;
  }, [canDropNode, containsNode]);

  const handleDragStart = useCallback((event: DragEvent<HTMLDivElement>, node: TreeNode) => {
    if (!onNodeDrop || node.id === "root") return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    setDraggedNode(node);
    setDropTargetId(null);
  }, [onNodeDrop]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>, target: TreeNode) => {
    if (!draggedNode) return;
    if (!canDrop(draggedNode, target)) {
      setDropTargetId(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(target.id);
  }, [canDrop, draggedNode]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>, target: TreeNode) => {
    if (!draggedNode || !onNodeDrop || !canDrop(draggedNode, target)) return;
    event.preventDefault();
    event.stopPropagation();
    setExpandedIds((prev) => new Set(prev).add(target.id));
    setDropTargetId(null);
    const source = draggedNode;
    setDraggedNode(null);
    void onNodeDrop(source, target);
  }, [canDrop, draggedNode, onNodeDrop]);

  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
    setDropTargetId(null);
  }, []);

  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const expanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const isChecked = isFullyChecked(node);
    const isPartial = isPartiallyChecked(node);
    const isRoot = node.id === "root";
    const isHighlighted = highlightedIds.includes(node.id);
    const isDragging = draggedNode?.id === node.id;
    const isDropTarget = dropTargetId === node.id
      && Boolean(draggedNode && canDrop(draggedNode, node));
    const indentDepth = isRoot
      ? 0
      : node.level !== undefined
        ? node.level + 1
        : depth;

    return (
      <div key={node.id} className="relative">
        <div
          data-search-match={isHighlighted ? "true" : undefined}
          data-drop-target={isDropTarget ? "true" : undefined}
          draggable={Boolean(onNodeDrop && !isRoot)}
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors group",
            !isRoot && "hover:bg-mist cursor-pointer",
            isSelected && "bg-gold-50 border border-gold-200",
            isRoot && "font-serif font-semibold text-ink-900",
            onNodeDrop && !isRoot && "cursor-grab active:cursor-grabbing",
            isDragging && "opacity-40",
            isDropTarget && "bg-gold-100 ring-2 ring-inset ring-gold-400",
            isHighlighted &&
              (highlightAccent === "gold"
                ? "bg-gold-100/80 ring-1 ring-inset ring-gold-300"
                : "bg-teal-100/80 ring-1 ring-inset ring-teal-300"),
            renderNodeActions && "pr-14",
          )}
          style={{ paddingLeft: `${indentDepth * 16 + 8}px` }}
          onClick={() => !isRoot && onSelect?.(node)}
          onDragStart={(event) => handleDragStart(event, node)}
          onDragOver={(event) => handleDragOver(event, node)}
          onDrop={(event) => handleDrop(event, node)}
          onDragEnd={handleDragEnd}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded hover:bg-ink-100 text-ink-400"
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="inline-block h-[18px] w-[18px] flex-shrink-0" />
          )}

          {checkable && !isRoot && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCheck(node);
              }}
              className="flex-shrink-0"
            >
              {isChecked ? (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gold-400 text-ink-900">
                  <svg
                    viewBox="0 0 12 12"
                    className="w-3 h-3"
                    fill="currentColor"
                  >
                    <path d="M10 3L4.5 8.5 2 6l-.7.7L4.5 9.9 10.7 3.7z" />
                  </svg>
                </span>
              ) : isPartial ? (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gold-400 text-ink-900">
                  <span className="block w-2 h-0.5 bg-ink-900" />
                </span>
              ) : (
                <span className="inline-block w-4 h-4 rounded border border-ink-300 bg-white" />
              )}
            </button>
          )}

          <span
            className={cn(
              "flex-shrink-0",
              node.type === "chapter" ? "text-gold-500" : "text-teal-400",
              isRoot && "text-ink-700",
            )}
          >
            {isRoot ? (
              <Folder className="w-4 h-4" />
            ) : hasChildren ? (
              expanded ? (
                <FolderOpen className="w-4 h-4" />
              ) : (
                <Folder className="w-4 h-4" />
              )
            ) : node.type === "chapter" ? (
              <FileText className="w-4 h-4" />
            ) : (
              <Circle className="w-2.5 h-2.5 fill-current" />
            )}
          </span>

          <span
            className={cn(
              "flex-1 whitespace-nowrap text-sm",
              isRoot ? "font-medium text-ink-900" : "text-ink-700",
              isHighlighted &&
                (highlightAccent === "gold"
                  ? "font-semibold text-gold-800"
                  : "font-semibold text-teal-800"),
            )}
            title={node.name}
          >
            {node.name}
          </span>

          {showCount && !isRoot && (
            <span className="text-xs font-mono flex-shrink-0 flex items-center gap-1">
              {showDoneCount && node.doneCount !== undefined && (
                <span className="text-emerald-600">{node.doneCount}/</span>
              )}
              <span className="text-ink-400">{node.count}</span>
            </span>
          )}

        </div>

        {renderNodeActions && (
          <div className="absolute right-1 top-1.5 z-10">
            {renderNodeActions(node)}
          </div>
        )}

        {hasChildren && expanded && (
          <div className="animate-fade-in">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return <div className={cn("text-sm", className)}>{renderNode(data, 0)}</div>;
}

export default TreeView;
