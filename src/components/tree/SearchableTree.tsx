import { useState, useMemo, type ReactNode } from "react";
import { Search, X, RotateCcw } from "lucide-react";
import { TreeView } from "./TreeView";
import type { TreeNode, FilterLogic } from "@/types";
import { cn } from "@/lib/utils";

interface SearchableTreeProps {
  data: TreeNode;
  title: ReactNode;
  accent?: "gold" | "teal";
  checkable?: boolean;
  checkedIds?: string[];
  onCheck?: (ids: string[]) => void;
  showDoneCount?: boolean;
  expandLevel?: number;
  className?: string;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
  /** 显示逻辑选择器（或/且） */
  showLogicSelector?: boolean;
  /** 当前逻辑 */
  logic?: FilterLogic;
  /** 逻辑变更回调 */
  onLogicChange?: (logic: FilterLogic) => void;
  /** 自定义重置行为；未提供时仅清空当前树的勾选 */
  onReset?: () => void;
  /** 标题栏右侧的附加内容 */
  headerActions?: ReactNode;
  /** 是否显示标题栏 */
  showHeader?: boolean;
  /** 是否显示标题文字 */
  showTitle?: boolean;
  /** 是否显示重置按钮 */
  showResetButton?: boolean;
  /** 目录滚动区域的高度类名 */
  treeMaxHeightClassName?: string;
}

function findMatchingNodeIds(node: TreeNode, keyword: string): string[] {
  const normalizedKeyword = keyword.toLowerCase();
  const matches = node.name.toLowerCase().includes(normalizedKeyword) ? [node.id] : [];
  return [...matches, ...node.children.flatMap((child) => findMatchingNodeIds(child, keyword))];
}

/**
 * 在搜索时过滤树：保留命中节点及其所有祖先
 */
function filterTree(node: TreeNode, keyword: string): TreeNode | null {
  if (!keyword) return node;
  const kw = keyword.toLowerCase();
  const nameMatch = node.name.toLowerCase().includes(kw);
  const filteredChildren = node.children
    .map((c) => filterTree(c, keyword))
    .filter((c): c is TreeNode => c !== null);
  if (nameMatch || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
}

export function SearchableTree({
  data,
  title,
  accent = "gold",
  checkable = false,
  checkedIds = [],
  onCheck,
  showDoneCount = false,
  expandLevel = 1,
  className,
  searchPlaceholder = "搜索目录...",
  showLogicSelector = false,
  logic = "or",
  onLogicChange,
  onReset,
  headerActions,
  showHeader = true,
  showTitle = true,
  showResetButton = true,
  treeMaxHeightClassName,
}: SearchableTreeProps) {
  const [keyword, setKeyword] = useState("");
  const normalizedKeyword = keyword.trim();

  const filteredData = useMemo(() => {
    if (!normalizedKeyword) return data;
    return filterTree(data, normalizedKeyword) ?? data;
  }, [data, normalizedKeyword]);

  const matchingIds = useMemo(
    () => normalizedKeyword ? findMatchingNodeIds(data, normalizedKeyword) : [],
    [data, normalizedKeyword],
  );

  const isSearching = normalizedKeyword.length > 0;
  const hasSearchResults = matchingIds.length > 0;

  const handleReset = () => {
    setKeyword("");
    if (onReset) {
      onReset();
    } else {
      onCheck?.([]);
    }
  };

  const accentClass =
    accent === "gold" ? "text-gold-700 border-gold-200 bg-gold-50/40" : "text-teal-700 border-teal-200 bg-teal-50/40";

  const logicAccentClass =
    accent === "gold"
      ? "bg-gold-100 text-gold-800 border-gold-300"
      : "bg-teal-100 text-teal-800 border-teal-300";

  return (
    <div className={cn("flex flex-col", className)}>
      {showHeader && (
        <div className={cn("px-3 py-2 border-b", accentClass)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {showLogicSelector && checkable && (
                <div className="flex items-center gap-0.5 text-[10px]">
                  <button
                    onClick={() => onLogicChange?.("or")}
                    className={cn(
                      "px-1.5 py-0.5 rounded border transition-colors",
                      logic === "or"
                        ? logicAccentClass
                        : "bg-paper/60 text-ink-500 border-ink-200 hover:text-ink-700",
                    )}
                    title="或：满足任一选中目录的题目"
                  >
                    或
                  </button>
                  <button
                    onClick={() => onLogicChange?.("and")}
                    className={cn(
                      "px-1.5 py-0.5 rounded border transition-colors",
                      logic === "and"
                        ? logicAccentClass
                        : "bg-paper/60 text-ink-500 border-ink-200 hover:text-ink-700",
                    )}
                    title="且：同时满足所有选中目录的题目"
                  >
                    且
                  </button>
                </div>
              )}
              {showTitle && (
                <div className="min-w-0 font-serif text-sm font-semibold">{title}</div>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {headerActions}
              {showResetButton && checkable && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-800 transition-colors"
                  title="重置搜索和勾选"
                >
                  <RotateCcw className="w-3 h-3" />
                  重置
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={cn("space-y-2", showHeader ? "p-3" : "p-0")}>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={searchPlaceholder}
            className="input-base pl-8 pr-7 py-1.5 text-xs"
          />
          {keyword && (
            <button
              onClick={() => setKeyword("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-mist text-ink-400"
              aria-label="清除搜索"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className={cn("max-h-[500px] overflow-auto -mx-1 px-1", treeMaxHeightClassName)}>
          {isSearching && !hasSearchResults ? (
            <div className="py-6 text-center text-xs text-ink-400">未匹配到节点</div>
          ) : (
            <TreeView
              key={isSearching ? `search:${normalizedKeyword}` : "default"}
              data={filteredData}
              checkable={checkable}
              checkedIds={checkedIds}
              onCheck={onCheck}
              defaultExpandAll={isSearching}
              expandLevel={expandLevel}
              highlightedIds={matchingIds}
              highlightAccent={accent}
              showDoneCount={showDoneCount}
              className="text-xs"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchableTree;
