import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import {
  GitBranch, Search, Plus, Folder, FolderOpen, FileText,
  BookOpen, ArrowRight, ShoppingBasket,
  Pencil, Trash2, ChevronUp, ChevronDown, FolderInput, GitMerge,
  Gift, Download, Layers3, ArrowLeft,
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
import type {
  TreeNode,
  Question,
  Basket,
  DirectoryCatalogSummary,
  DirectoryDonation,
  DirectoryCatalogNode,
} from "@/types";
import { cn } from "@/lib/utils";

type TreeKind = "chapter" | "knowledge";

function directorySnapshotTree(type: TreeKind, nodes: DirectoryCatalogNode[]): TreeNode {
  const childrenOf = (parentId: string | null): TreeNode[] => nodes
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => left.order - right.order)
    .map((node) => ({
      id: node.id,
      name: node.name,
      type,
      count: 0,
      order: node.order,
      parentId: node.parentId,
      level: node.level,
      description: node.description,
      children: childrenOf(node.id),
    }));
  return {
    id: "root",
    name: type === "chapter" ? "全部章节" : "全部知识点",
    type,
    count: nodes.length,
    children: childrenOf(null),
  };
}

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
  const [mergeOpen, setMergeOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [catalogs, setCatalogs] = useState<DirectoryCatalogSummary[]>([]);
  const [directoryDonations, setDirectoryDonations] = useState<DirectoryDonation[]>([]);
  const [donationBrowserOpen, setDonationBrowserOpen] = useState(false);
  const [previewDonation, setPreviewDonation] = useState<DirectoryDonation | null>(null);
  const [donatingDirectory, setDonatingDirectory] = useState(false);
  const [acceptingDirectory, setAcceptingDirectory] = useState(false);
  const [switchingCatalog, setSwitchingCatalog] = useState(false);

  const handleKindChange = (nextKind: TreeKind) => {
    if (nextKind === kind) return;

    setKind(nextKind);
    setTree(null);
    setLoading(true);
    setSelectedNode(null);
    setQuestions([]);
    setQuestionsLoading(false);
    setSearch("");
    setAddNodeOpen(false);
    setNewNodeName("");
    setParentNode(null);
    setMoveToOpen(false);
    setMergeOpen(false);
    setMerging(false);
    setPreviewDonation(null);
  };

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

  const loadDirectoryMeta = useCallback(async () => {
    if (!teacher) return;
    const [nextCatalogs, nextDonations] = await Promise.all([
      knowledgeService.listDirectoryCatalogs(teacher.id, kind),
      knowledgeService.listDirectoryDonations(teacher.id, kind),
    ]);
    setCatalogs(nextCatalogs);
    setDirectoryDonations(nextDonations);
  }, [kind, teacher]);

  useEffect(() => {
    if (!teacher) return;
    loadTree();
    loadDirectoryMeta();
    basketService.listBaskets(teacher.id).then(setBaskets);
  }, [loadDirectoryMeta, loadTree, teacher]);

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

      await knowledgeService.addKnowledgePoint(
        teacher.schoolId!,
        targetParentId,
        name,
        existingPoint?.questionCount,
      );
      toast.success(existingPoint ? "已克隆同名节点" : "节点已添加");
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

  const findTreeNode = (root: TreeNode, id: string): TreeNode | null => {
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = findTreeNode(child, id);
      if (found) return found;
    }
    return null;
  };

  const canDropTreeNode = (source: TreeNode, target: TreeNode): boolean => {
    if (!tree || source.id === "root") return false;
    const fullSource = findTreeNode(tree, source.id);
    if (!fullSource) return false;
    const currentParent = findParentTreeNode(tree, source.id);
    if (currentParent?.id === target.id) return false;
    return !collectDescendantIds(fullSource).has(target.id);
  };

  const handleNodeDrop = async (source: TreeNode, target: TreeNode) => {
    if (!tree || !canDropTreeNode(source, target)) return;
    const fullSource = findTreeNode(tree, source.id);
    if (!fullSource) return;

    try {
      await knowledgeService.moveNode(
        source.id,
        kind,
        target.id === "root" ? null : target.id,
      );
      toast.success(`已将「${source.name}」移动到「${target.name}」`);
      if (selectedNode?.id === source.id) setSelectedNode(fullSource);
      await loadTree();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移动失败");
    }
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

  const handleMergeTo = async (target: TreeNode) => {
    if (!selectedNode) return;
    if (!window.confirm(
      `确定将「${selectedNode.name}」合并到「${target.name}」吗？目标节点将保留，子节点和资源关联会一并迁移。`,
    )) return;

    setMerging(true);
    try {
      await knowledgeService.mergeNodes(selectedNode.id, target.id, kind);
      toast.success("节点已合并");
      setMergeOpen(false);
      setSelectedNode(null);
      setQuestions([]);
      await loadTree();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "合并失败");
    } finally {
      setMerging(false);
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

  const handleDonateDirectory = async () => {
    if (!teacher) return;
    setDonatingDirectory(true);
    try {
      const result = await knowledgeService.donateDirectory(teacher.id, kind);
      toast.success(result.replaced ? "已覆盖此前捐赠的目录" : "目录已捐赠到平台");
      await loadDirectoryMeta();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "目录捐赠失败");
    } finally {
      setDonatingDirectory(false);
    }
  };

  const handleActivateCatalog = async (catalogId: string) => {
    if (!teacher || catalogs.find((catalog) => catalog.id === catalogId)?.isActive) return;
    setSwitchingCatalog(true);
    try {
      await knowledgeService.activateDirectoryCatalog(teacher.id, catalogId);
      setSelectedNode(null);
      setQuestions([]);
      await Promise.all([loadTree(), loadDirectoryMeta()]);
      toast.success("已切换启用目录");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "切换目录失败");
    } finally {
      setSwitchingCatalog(false);
    }
  };

  const handleAcceptDirectory = async (mode: "merge" | "new") => {
    if (!teacher || !previewDonation) return;
    setAcceptingDirectory(true);
    try {
      await knowledgeService.acceptDirectoryDonation(teacher.id, previewDonation.id, mode);
      setDonationBrowserOpen(false);
      setPreviewDonation(null);
      setSelectedNode(null);
      setQuestions([]);
      await Promise.all([loadTree(), loadDirectoryMeta()]);
      toast.success(mode === "merge" ? "目录已合并到当前体系" : "已新建并启用目录体系");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "接受目录失败");
    } finally {
      setAcceptingDirectory(false);
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
  const activeAddParent = selectedNode ?? tree;
  const selectedParent = selectedNode && tree
    ? findParentTreeNode(tree, selectedNode.id)
    : null;
  const mergeCandidates = selectedParent
    ? selectedParent.children.filter((node) => node.id !== selectedNode?.id)
    : [];
  const activeCatalog = catalogs.find((catalog) => catalog.isActive) || catalogs[0];
  const previewTree = previewDonation
    ? directorySnapshotTree(previewDonation.type, previewDonation.nodes)
    : null;

  return (
    <div>
      <PageHeader
        title="知识树"
        description="以树形结构浏览章节与知识点，每个目录前可复选筛选题目"
        icon={<GitBranch className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-1.5 p-1 rounded-md bg-ink-100">
            <button
              onClick={() => handleKindChange("chapter")}
              className={cn(
                "px-3 py-1 rounded text-xs font-medium transition-all",
                kind === "chapter" ? "bg-paper text-ink-900 shadow-sm" : "text-ink-600",
              )}
            >
              章节目录
            </button>
            <button
              onClick={() => handleKindChange("knowledge")}
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

      <Card className="mb-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <Layers3 className="w-4 h-4 text-gold-600" />
              <span className="text-sm font-medium text-ink-800">
                当前启用的{kind === "chapter" ? "章节课目录" : "知识点目录"}
              </span>
              {activeCatalog && (
                <Badge variant="ink">{activeCatalog.nodeCount} 个节点</Badge>
              )}
            </div>
            <select
              aria-label={`当前启用的${kind === "chapter" ? "章节课目录" : "知识点目录"}`}
              value={activeCatalog?.id || ""}
              disabled={catalogs.length <= 1 || switchingCatalog}
              onChange={(event) => handleActivateCatalog(event.target.value)}
              className="input-base max-w-xl"
            >
              {catalogs.map((catalog) => (
                <option key={catalog.id} value={catalog.id}>
                  {catalog.name}{catalog.isActive ? "（当前）" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-ink-500">
              可保留多套目录体系；切换前会保存当前目录，后台只启用选中的一套。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={donatingDirectory}
              onClick={handleDonateDirectory}
            >
              <Gift className="w-3.5 h-3.5" />
              捐赠当前目录
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setPreviewDonation(null);
                setDonationBrowserOpen(true);
              }}
            >
              <Download className="w-3.5 h-3.5" />
              浏览同学科捐赠{directoryDonations.length > 0 ? `（${directoryDonations.length}）` : ""}
            </Button>
          </div>
        </div>
      </Card>

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
                onNodeDrop={handleNodeDrop}
                canDropNode={canDropTreeNode}
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

            <p className="mt-2 text-[11px] leading-5 text-ink-400">
              可直接拖动节点到另一个节点下；拖到“全部章节/全部知识点”可移到顶级。
            </p>

            <div className="mt-3 pt-3 border-t border-ink-100">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!activeAddParent}
                onClick={() => {
                  setParentNode(activeAddParent);
                  setAddNodeOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                添加节点
                {activeAddParent ? `到「${activeAddParent.name}」` : ""}
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
                          onClick={() => setMergeOpen(true)}
                          disabled={mergeCandidates.length === 0}
                          className="h-7 px-2.5"
                          title={mergeCandidates.length === 0 ? "当前节点没有可合并的同级节点" : undefined}
                        >
                          <GitMerge className="w-3 h-3 mr-1" />
                          合并
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
                  <Link to={`/question-bank?${kind === "chapter" ? "chapter" : "point"}=${selectedNode.id}`} target="_blank" rel="noreferrer">
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

      {/* 合并同级节点 */}
      <Modal
        open={mergeOpen}
        onClose={() => !merging && setMergeOpen(false)}
        size="sm"
        title="合并节点到..."
        description={selectedNode
          ? `将「${selectedNode.name}」合并到同一父节点下的另一个节点，目标节点名称将保留。`
          : undefined}
      >
        <div className="space-y-1 max-h-[400px] overflow-auto">
          {mergeCandidates.map((node) => (
            <button
              key={node.id}
              type="button"
              disabled={merging}
              onClick={() => handleMergeTo(node)}
              className="w-full text-left p-2.5 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <GitMerge className="w-3.5 h-3.5 text-gold-600" />
                <span className="text-ink-500">合并到</span>
                <span className="font-medium text-ink-900 truncate">{node.name}</span>
                <span className="ml-auto text-xs text-ink-400">{node.count} 道题</span>
              </div>
            </button>
          ))}
        </div>
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

      <Modal
        open={donationBrowserOpen}
        onClose={() => {
          if (acceptingDirectory) return;
          setDonationBrowserOpen(false);
          setPreviewDonation(null);
        }}
        size="lg"
        title={previewDonation
          ? `${previewDonation.donorNickname}捐赠的${kind === "chapter" ? "章节课目录" : "知识点目录"}`
          : `同学科${kind === "chapter" ? "章节课目录" : "知识点目录"}捐赠`}
        description={previewDonation
          ? `学科：${previewDonation.subject} · ${previewDonation.nodes.length} 个节点 · 预览不会修改当前目录`
          : "先预览目录内容，再选择合并到当前目录或新建独立目录体系。"}
        footer={previewDonation ? (
          <>
            <Button
              variant="ghost"
              disabled={acceptingDirectory}
              onClick={() => setPreviewDonation(null)}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回列表
            </Button>
            <Button
              variant="outline"
              loading={acceptingDirectory}
              onClick={() => handleAcceptDirectory("merge")}
            >
              合并到当前目录
            </Button>
            <Button
              variant="gold"
              loading={acceptingDirectory}
              onClick={() => handleAcceptDirectory("new")}
            >
              新建目录体系
            </Button>
          </>
        ) : undefined}
      >
        {previewDonation && previewTree ? (
          <div className="rounded-lg border border-ink-100 bg-mist/30 p-3">
            <TreeView
              data={previewTree}
              defaultExpandAll
              className="max-h-[520px] overflow-auto"
            />
          </div>
        ) : directoryDonations.length === 0 ? (
          <EmptyState
            icon={<Gift className="w-7 h-7" />}
            title="暂无同学科目录捐赠"
            description="其他同学科用户捐赠目录后会显示在这里"
          />
        ) : (
          <div className="space-y-2">
            {directoryDonations.map((donation) => (
              <button
                key={donation.id}
                type="button"
                onClick={() => setPreviewDonation(donation)}
                className="w-full text-left p-3 rounded-lg border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-gold-600" />
                  <span className="font-medium text-ink-900">{donation.donorNickname}</span>
                  <Badge variant="ink">{donation.subject}</Badge>
                  <span className="ml-auto text-xs text-ink-400">{donation.nodes.length} 个节点</span>
                </div>
                <div className="mt-1 text-xs text-ink-500">
                  更新于 {new Date(donation.updatedAt).toLocaleString("zh-CN")}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
