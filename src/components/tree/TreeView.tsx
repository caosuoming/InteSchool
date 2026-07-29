import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Circle } from "lucide-react";
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

  const renderNode = (node: TreeNode, depth: number = 0): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const expanded = expandedIds.has(node.id);
    const isSelected = selectedId === node.id;
    const isChecked = isFullyChecked(node);
    const isPartial = isPartiallyChecked(node);
    const isRoot = node.id === "root";
    const isHighlighted = highlightedIds.includes(node.id);
    const indentDepth = isRoot
      ? 0
      : node.level !== undefined
        ? node.level + 1
        : depth;

    return (
      <div key={node.id}>
        <div
          data-search-match={isHighlighted ? "true" : undefined}
          className={cn(
            "flex items-center gap-1.5 py-1.5 px-2 rounded-md transition-colors group",
            !isRoot && "hover:bg-mist cursor-pointer",
            isSelected && "bg-gold-50 border border-gold-200",
            isRoot && "font-serif font-semibold text-ink-900",
            isHighlighted && (
              highlightAccent === "gold"
                ? "bg-gold-100/80 ring-1 ring-inset ring-gold-300"
                : "bg-teal-100/80 ring-1 ring-inset ring-teal-300"
            ),
          )}
          style={{ paddingLeft: `${indentDepth * 16 + 8}px` }}
          onClick={() => !isRoot && onSelect?.(node)}
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
                  <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor">
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
              isHighlighted && (
                highlightAccent === "gold"
                  ? "font-semibold text-gold-800"
                  : "font-semibold text-teal-800"
              ),
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
