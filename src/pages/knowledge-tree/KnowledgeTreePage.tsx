import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  GitBranch, Search, Plus, Folder, FolderOpen, FileText,
  BookOpen, ArrowRight, ShoppingBasket,
  Pencil, Trash2, ChevronUp, ChevronDown, FolderInput,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { TreeView } from "@/components/tree/TreeView";
import { QuestionCard } from "@/components/question/QuestionCard";
import type { TreeNode, Question, Basket } from "@/types";
import { cn } from "@/lib/utils";

type TreeKind = "chapter" | "knowledge";

export default function KnowledgeTreePage() {
  const { teacher } = useAuthStore();
  const [kind, setKind] = useState<TreeKind>("chapter");
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [addToBasketFor, setAddToBasketFor] = useState<Question | null>(null);
  const [search, setSearch] = useState("");
  const [addNodeOpen, setAddNodeOpen] = useState(false);
  const [newNodeName, setNewNodeName] = useState("");
  const [parentNode, setParentNode] = useState<TreeNode | null>(null);
  const [moveToOpen, setMoveToOpen] = useState(false);

  const loadTree = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);
    const t =
      kind === "chapter"
        ? await knowledgeService.getChapterTree(teacher.schoolId!)
        : await knowledgeService.getKnowledgeTree(teacher.schoolId!);
    setTree(t);
    setLoading(false);
  }, [kind, teacher]);

  const loadQuestions = useCallback(async () => {
    if (!teacher || !selectedNode) return;
    setQuestionsLoading(true);
    let filter;
    if (kind === "chapter") {
      filter = { schoolId: teacher.schoolId!, chapterIds: [selectedNode.id] };
    } else {
      // 扩展为所有同名知识点的ID（分身）
      const aliasIds = await knowledgeService.getAliasIds(selectedNode.id, teacher.schoolId!);
      filter = { schoolId: teacher.schoolId!, knowledgePointIds: aliasIds };
    }
    const qs = await questionService.listQuestions(filter);
    setQuestions(qs);
    setQuestionsLoading(false);
  }, [kind, selectedNode, teacher]);

  useEffect(() => {
    if (!teacher) return;
    loadTree();
    basketService.listBaskets(teacher.id).then(setBaskets);
  }, [loadTree, teacher]);

  useEffect(() => {
    if (selectedNode) {
      loadQuestions();
    }
  }, [loadQuestions, selectedNode]);

  const handleAddToBasket = async (basketId: string, q: Question) => {
    await basketService.addQuestion(basketId, q.id);
    toast.success("已加入试题篮");
    setAddToBasketFor(null);
  };

  const handleAddNode = async () => {
    if (!teacher || !parentNode || !newNodeName.trim()) return;
    const name = newNodeName.trim();
    
    if (kind === "chapter") {
      const allChapters = await knowledgeService.listChapters(teacher.schoolId!);
      const siblings = allChapters.filter((c) => c.parentId === (parentNode.id === "root" ? null : parentNode.id));
      if (siblings.some((s) => s.name === name)) {
        toast.error("同一父节点下已存在同名节点");
        return;
      }
      await knowledgeService.addChapter(teacher.schoolId!, parentNode.id === "root" ? null : parentNode.id, name);
    } else {
      const allPoints = await knowledgeService.listKnowledgePoints(teacher.schoolId!);
      const targetParentId = parentNode.id === "root" ? null : parentNode.id;
      const siblings = allPoints.filter((p) => p.parentId === targetParentId);
      
      if (siblings.some((s) => s.name === name)) {
        toast.error("同一父节点下已存在同名节点");
        return;
      }
      
      const existingPoint = allPoints.find((p) => p.name === name);
      
      const chapters = await knowledgeService.listChapters(teacher.schoolId!);
      if (chapters.length === 0) {
        toast.error("请先创建章节");
        return;
      }
      
      if (existingPoint) {
        await knowledgeService.addKnowledgePoint(
          teacher.schoolId!,
          existingPoint.chapterId,
          targetParentId,
          name,
          existingPoint.questionCount,
        );
        toast.success("已克隆同名节点");
      } else {
        await knowledgeService.addKnowledgePoint(
          teacher.schoolId!,
          chapters[0].id,
          targetParentId,
          name,
        );
        toast.success("节点已添加");
      }
    }
    
    setAddNodeOpen(false);
    setNewNodeName("");
    setParentNode(null);
    await loadTree();
  };

  // 在树中查找指定节点的父节点
  const findParentTreeNode = (root: TreeNode, id: string): TreeNode | null => {
    for (const child of root.children) {
      if (child.id === id) return root;
      const found = findParentTreeNode(child, id);
      if (found) return found;
    }
    return null;
  };

  // 收集节点及其所有子孙 ID
  const collectDescendantIds = (node: TreeNode): Set<string> => {
    const ids = new Set<string>();
    const walk = (n: TreeNode) => {
      ids.add(n.id);
      n.children.forEach(walk);
    };
    walk(node);
    return ids;
  };

  // 将树扁平化为带路径的列表（不含 root）
  const flattenTreeWithPaths = (root: TreeNode): Array<{ node: TreeNode; path: string[] }> => {
    const result: Array<{ node: TreeNode; path: string[] }> = [];
    const walk = (n: TreeNode, path: string[]) => {
      const currentPath = n.id === "root" ? [] : [...path, n.name];
      if (n.id !== "root") {
        result.push({ node: n, path: currentPath });
      }
      n.children.forEach((c) => walk(c, currentPath));
    };
    walk(root, []);
    return result;
  };

  const handleRename = async () => {
    if (!selectedNode) return;
    const newName = window.prompt("请输入新名称", selectedNode.name);
    if (newName === null || !newName.trim() || newName.trim() === selectedNode.name) return;
    try {
      await knowledgeService.renameNode(selectedNode.id, kind, newName.trim());
      toast.success("已改名");
      await loadTree();
      setSelectedNode((prev) => (prev ? { ...prev, name: newName.trim() } : prev));
    } catch {
      toast.error("改名失败");
    }
  };

  const handleDelete = async () => {
    if (!selectedNode) return;
    if (!window.confirm(`确定要删除「${selectedNode.name}」吗？将同时删除其所有子节点。`)) return;
    try {
      await knowledgeService.deleteNode(selectedNode.id, kind);
      toast.success("已删除");
      setSelectedNode(null);
      await loadTree();
    } catch {
      toast.error("删除失败");
    }
  };

  const handleMoveUp = async () => {
    if (!selectedNode || !tree) return;
    const parent = findParentTreeNode(tree, selectedNode.id);
    if (!parent) return;
    const siblings = parent.children;
    const idx = siblings.findIndex((c) => c.id === selectedNode.id);
    if (idx <= 0) return;
    const newOrder = [...siblings];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    try {
      await knowledgeService.reorderSiblings(newOrder.map((c) => c.id), kind);
      toast.success("已上移");
      await loadTree();
    } catch {
      toast.error("移动失败");
    }
  };

  const handleMoveDown = async () => {
    if (!selectedNode || !tree) return;
    const parent = findParentTreeNode(tree, selectedNode.id);
    if (!parent) return;
    const siblings = parent.children;
    const idx = siblings.findIndex((c) => c.id === selectedNode.id);
    if (idx < 0 || idx >= siblings.length - 1) return;
    const newOrder = [...siblings];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    try {
      await knowledgeService.reorderSiblings(newOrder.map((c) => c.id), kind);
      toast.success("已下移");
      await loadTree();
    } catch {
      toast.error("移动失败");
    }
  };

  const handleMoveTo = async (targetParentId: string | null) => {
    if (!selectedNode) return;
    try {
      await knowledgeService.moveNode(selectedNode.id, kind, targetParentId);
      toast.success("已移动");
      setMoveToOpen(false);
      await loadTree();
    } catch {
      toast.error("移动失败");
    }
  };

  // 搜索高亮过滤
  const filterTree = (node: TreeNode, kw: string): TreeNode | null => {
    if (!kw) return node;
    const matches = node.name.toLowerCase().includes(kw.toLowerCase());
    const filteredChildren = node.children
      .map((c) => filterTree(c, kw))
      .filter((c): c is TreeNode => c !== null);
    if (matches || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  };

  const displayedTree = tree && search ? filterTree(tree, search) : tree;

  return (
    <div>
      <PageHeader
        title="知识树"
        description="以树形结构浏览章节与知识点，每个目录前可复选筛选题目"
        icon={<GitBranch className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-1.5 p-1 rounded-md bg-ink-100">
            <button
              onClick={() => setKind("chapter")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all",
                kind === "chapter" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
              )}
            >
              章节目录
            </button>
            <button
              onClick={() => setKind("knowledge")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all",
                kind === "knowledge" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
              )}
            >
              知识点
            </button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-5 gap-5">
        {/* 左：树形 */}
        <div className="lg:col-span-2">
          <Card className="sticky top-6">
            <div className="mb-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                type="text"
                placeholder="搜索节点名称"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-base pl-10"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : displayedTree ? (
              <TreeView
                data={displayedTree}
                selectedId={selectedNode?.id}
                onSelect={(node) => setSelectedNode(node)}
                defaultExpandAll={Boolean(search)}
                expandLevel={1}
                className="max-h-[600px] overflow-auto"
              />
            ) : (
              <EmptyState
                icon={<Folder className="w-7 h-7" />}
                title="未找到匹配的节点"
              />
            )}

            <div className="mt-3 pt-3 border-t border-ink-100">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setParentNode(selectedNode || tree);
                  setAddNodeOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                添加节点
                {selectedNode && selectedNode.id !== "root" ? `到「${selectedNode.name}」` : ""}
              </Button>
            </div>
          </Card>
        </div>

        {/* 右：节点详情与题目 */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedNode ? (
            <Card>
              <EmptyState
                icon={<BookOpen className="w-7 h-7" />}
                title="请选择一个节点"
                description="点击左侧树节点，查看该章节或知识点下的所有题目"
              />
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
                    kind === "chapter" ? "bg-gold-50 text-gold-600" : "bg-teal-50 text-teal-600",
                  )}>
                    {kind === "chapter" ? <FolderOpen className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="font-serif text-xl font-bold text-ink-900">{selectedNode.name}</h2>
                      <Badge variant="ink">
                        {kind === "chapter" ? "章节" : "知识点"}
                      </Badge>
                    </div>
                    {selectedNode.id !== "root" && (
                      <div className="flex items-center gap-0.5 mb-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleRename}
                          className="h-7 px-2.5"
                        >
                          <Pencil className="w-3 h-3 mr-1" />
                          改名
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleMoveUp}
                          className="h-7 px-2.5"
                        >
                          <ChevronUp className="w-3 h-3 mr-1" />
                          上移
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleMoveDown}
                          className="h-7 px-2.5"
                        >
                          <ChevronDown className="w-3 h-3 mr-1" />
                          下移
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMoveToOpen(true)}
                          className="h-7 px-2.5"
                        >
                          <FolderInput className="w-3 h-3 mr-1" />
                          移动
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDelete}
                          className="h-7 px-2.5 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          删除
                        </Button>
                      </div>
                    )}
                    <div className="text-sm text-ink-500">
                      包含 <span className="font-mono font-semibold text-ink-700">{questions.length}</span> 道题目 · 子节点 {selectedNode.children.length} 个
                    </div>
                    {selectedNode.description && (
                      <div className="text-xs text-ink-500 mt-1">{selectedNode.description}</div>
                    )}
                  </div>
                  <Link to={`/question-bank?${kind === "chapter" ? "chapter" : "point"}=${selectedNode.id}`}>
                    <Button variant="ghost" size="sm">
                      在题库中查看
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>

                {/* 子节点列表 */}
                {selectedNode.children.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    <div className="text-xs font-medium text-ink-600 mb-2">子节点</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNode.children.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedNode(c)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-ink-200 hover:border-gold-300 hover:bg-gold-50/30 transition-colors text-xs"
                        >
                          {c.children.length > 0 ? (
                            <Folder className="w-3 h-3 text-gold-500" />
                          ) : (
                            <FileText className="w-3 h-3 text-teal-400" />
                          )}
                          <span className="text-ink-700">{c.name}</span>
                          <span className="text-ink-400 font-mono">{c.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-serif font-semibold text-ink-900">关联题目</h3>
                  <span className="text-xs text-ink-500">{questions.length} 道</span>
                </div>
                {questionsLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner size={20} />
                  </div>
                ) : questions.length === 0 ? (
                  <EmptyState
                    icon={<FileText className="w-7 h-7" />}
                    title="该节点下暂无题目"
                    description="可通过文档导入添加题目，AI 将自动识别章节与知识点"
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {questions.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        onAddToBasket={setAddToBasketFor}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* 加入试题篮 */}
      <Modal
        open={Boolean(addToBasketFor)}
        onClose={() => setAddToBasketFor(null)}
        size="sm"
        title="加入试题篮"
      >
        <div className="space-y-2">
          {baskets.length === 0 ? (
            <div className="text-center py-6 text-sm text-ink-500">您还没有试题篮</div>
          ) : (
            baskets.map((b) => (
              <button
                key={b.id}
                onClick={() => addToBasketFor && handleAddToBasket(b.id, addToBasketFor)}
                className="w-full text-left p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShoppingBasket className="w-4 h-4 text-gold-600" />
                  <span className="text-sm font-medium text-ink-900">{b.name}</span>
                </div>
                <div className="text-xs text-ink-500 mt-0.5">{b.questionIds.length} 道题目</div>
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* 添加节点 */}
      <Modal
        open={addNodeOpen}
        onClose={() => setAddNodeOpen(false)}
        size="sm"
        title={`添加${kind === "chapter" ? "章节" : "知识点"}节点`}
        description={parentNode ? `父节点：${parentNode.name}` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddNodeOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleAddNode}>
              <Plus className="w-3.5 h-3.5" />
              添加
            </Button>
          </>
        }
      >
        <Input
          label="节点名称"
          placeholder={kind === "chapter" ? "如：1.1 集合的概念" : "如：子集与真子集"}
          value={newNodeName}
          onChange={(e) => setNewNodeName(e.target.value)}
          autoFocus
        />
      </Modal>

      {/* 移动节点 */}
      <Modal
        open={moveToOpen}
        onClose={() => setMoveToOpen(false)}
        size="sm"
        title="移动节点到..."
        description={selectedNode ? `当前节点：${selectedNode.name}` : undefined}
      >
        <div className="space-y-1 max-h-[400px] overflow-auto">
          <button
            onClick={() => handleMoveTo(null)}
            className="w-full text-left p-2.5 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors text-sm"
          >
            <div className="flex items-center gap-2">
              <FolderInput className="w-3.5 h-3.5 text-gold-600" />
              <span className="font-medium text-ink-900">移到顶级</span>
            </div>
          </button>
          {tree && selectedNode && (() => {
            const descendants = collectDescendantIds(selectedNode);
            const candidates = flattenTreeWithPaths(tree).filter(
              (c) => c.node.id !== selectedNode.id && !descendants.has(c.node.id),
            );
            return candidates.map(({ node, path }) => (
              <button
                key={node.id}
                onClick={() => handleMoveTo(node.id)}
                className="w-full text-left p-2.5 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors text-sm"
              >
                <div className="flex items-center gap-2">
                  {node.children.length > 0 ? (
                    <Folder className="w-3.5 h-3.5 text-gold-500" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                  )}
                  <span className="text-ink-700 truncate">{path.join(" / ")}</span>
                </div>
              </button>
            ));
          })()}
        </div>
      </Modal>
    </div>
  );
}
