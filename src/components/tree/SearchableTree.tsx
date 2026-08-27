import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { TreeView } from "./TreeView";
import type { TreeNode, FilterLogic } from "@/types";
import { cn } from "@/lib/utils";
import { knowledgeService } from "@/services/knowledge";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";

export interface SearchableTreeProps {
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
  /** 是否允许直接新增子节点和改名。 */
  editable?: boolean;
  /** 可显式指定编辑所用学校；通常由当前教师身份自动提供。 */
  editableSchoolId?: string;
  /** 目录发生结构变更后把最新树同步给父组件。 */
  onDataChange?: (data: TreeNode) => void;
}

type DirectoryTreeUpdateDetail = {
  schoolId: string;
  type: TreeNode["type"];
  data: TreeNode;
};

const DIRECTORY_TREE_UPDATED_EVENT = "inteschool:directory-tree-updated";

function findMatchingNodeIds(node: TreeNode, keyword: string): string[] {
  const normalizedKeyword = keyword.toLowerCase();
  const matches = node.name.toLowerCase().includes(normalizedKeyword)
    ? [node.id]
    : [];
  return [
    ...matches,
    ...node.children.flatMap((child) => findMatchingNodeIds(child, keyword)),
  ];
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
  editable = false,
  editableSchoolId,
  onDataChange,
}: SearchableTreeProps) {
  const currentSchoolId = useAuthStore((state) => state.teacher?.schoolId);
  const activeEditableSchoolId = editableSchoolId ?? (editable ? currentSchoolId ?? undefined : undefined);
  const [keyword, setKeyword] = useState("");
  const [displayData, setDisplayData] = useState(data);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const normalizedKeyword = keyword.trim();

  useEffect(() => {
    setDisplayData(data);
  }, [data]);

  useEffect(() => {
    if (!activeEditableSchoolId) return;
    const handleDirectoryTreeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<DirectoryTreeUpdateDetail>).detail;
      if (detail.schoolId !== activeEditableSchoolId || detail.type !== data.type) return;
      setDisplayData(detail.data);
      onDataChange?.(detail.data);
    };
    window.addEventListener(DIRECTORY_TREE_UPDATED_EVENT, handleDirectoryTreeUpdated);
    return () => window.removeEventListener(DIRECTORY_TREE_UPDATED_EVENT, handleDirectoryTreeUpdated);
  }, [data.type, activeEditableSchoolId, onDataChange]);

  const filteredData = useMemo(() => {
    if (!normalizedKeyword) return displayData;
    return filterTree(displayData, normalizedKeyword) ?? displayData;
  }, [displayData, normalizedKeyword]);

  const matchingIds = useMemo(
    () =>
      normalizedKeyword
        ? findMatchingNodeIds(displayData, normalizedKeyword)
        : [],
    [displayData, normalizedKeyword],
  );

  const refreshDirectoryTree = useCallback(async () => {
    if (!activeEditableSchoolId) return null;
    const nextTree =
      displayData.type === "chapter"
        ? await knowledgeService.getChapterTree(activeEditableSchoolId)
        : await knowledgeService.getKnowledgeTree(activeEditableSchoolId);
    window.dispatchEvent(new CustomEvent<DirectoryTreeUpdateDetail>(DIRECTORY_TREE_UPDATED_EVENT, {
      detail: { schoolId: activeEditableSchoolId, type: displayData.type, data: nextTree },
    }));
    return nextTree;
  }, [displayData.type, activeEditableSchoolId]);

  const handleAddNode = useCallback(
    async (parent: TreeNode) => {
      if (!activeEditableSchoolId || editingNodeId) return;
      const entered = window.prompt(
        `在「${parent.name}」下添加新节点，请输入名称`,
      );
      if (entered === null) return;
      const name = entered.trim();
      if (!name) return;

      const type = displayData.type;
      const parentId = parent.id === "root" ? null : parent.id;
      setEditingNodeId(parent.id);
      try {
        if (type === "chapter") {
          const chapters =
            await knowledgeService.listChapters(activeEditableSchoolId);
          if (
            chapters.some(
              (item) => item.parentId === parentId && item.name === name,
            )
          ) {
            toast.error("同一父节点下已存在同名节点");
            return;
          }
          await knowledgeService.addChapter(activeEditableSchoolId, parentId, name);
          toast.success("节点已添加");
        } else {
          const points =
            await knowledgeService.listKnowledgePoints(activeEditableSchoolId);
          if (
            points.some(
              (item) => item.parentId === parentId && item.name === name,
            )
          ) {
            toast.error("同一父节点下已存在同名节点");
            return;
          }
          const existingPoint = points.find((item) => item.name === name);
          await knowledgeService.addKnowledgePoint(
            activeEditableSchoolId,
            parentId,
            name,
            existingPoint?.questionCount,
          );
          toast.success(existingPoint ? "已克隆同名节点" : "节点已添加");
        }
        await refreshDirectoryTree();
      } catch (error) {
        toast.error(
          "添加节点失败",
          error instanceof Error ? error.message : undefined,
        );
      } finally {
        setEditingNodeId(null);
      }
    },
    [displayData.type, activeEditableSchoolId, editingNodeId, refreshDirectoryTree],
  );

  const handleRenameNode = useCallback(
    async (node: TreeNode) => {
      if (!activeEditableSchoolId || editingNodeId || node.id === "root") return;
      const entered = window.prompt("请输入新名称", node.name);
      if (entered === null) return;
      const name = entered.trim();
      if (!name || name === node.name) return;

      setEditingNodeId(node.id);
      try {
        await knowledgeService.renameNode(node.id, displayData.type, name);
        toast.success("已改名");
        await refreshDirectoryTree();
      } catch (error) {
        toast.error(
          "改名失败",
          error instanceof Error ? error.message : undefined,
        );
      } finally {
        setEditingNodeId(null);
      }
    },
    [displayData.type, activeEditableSchoolId, editingNodeId, refreshDirectoryTree],
  );

  const renderNodeActions = activeEditableSchoolId
    ? (node: TreeNode) => (
        <span className="ml-1 flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void handleAddNode(node);
            }}
            disabled={editingNodeId !== null}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="添加新节点"
            aria-label={`在${node.name}下添加新节点`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {node.id !== "root" && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleRenameNode(node);
              }}
              disabled={editingNodeId !== null}
              className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-40"
              title="改名"
              aria-label={`改名：${node.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      )
    : undefined;

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
    accent === "gold"
      ? "text-gold-700 border-gold-200 bg-gold-50/40"
      : "text-teal-700 border-teal-200 bg-teal-50/40";

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
                <div className="min-w-0 font-serif text-sm font-semibold">
                  {title}
                </div>
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

        <div
          className={cn(
            "max-h-[500px] overflow-auto -mx-1 px-1",
            treeMaxHeightClassName,
          )}
        >
          {isSearching && !hasSearchResults ? (
            <div className="py-6 text-center text-xs text-ink-400">
              未匹配到节点
            </div>
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
              renderNodeActions={renderNodeActions}
              className="text-xs"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchableTree;
