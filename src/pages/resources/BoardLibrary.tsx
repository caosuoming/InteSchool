import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FolderTree, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Expand, Eye, EyeOff, GitBranchPlus, Minimize, Pin, PinOff, Plus, RefreshCw, Save, Trash2, Upload } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { genId } from "@/lib/service-utils";
import { boardService } from "@/services/board";
import { knowledgeService } from "@/services/knowledge";
import { BoardChapterTree } from "@/components/board/BoardChapterTree";
import { chapterOptions } from "@/components/board/board-chapters";
import { Modal } from "@/components/ui/Modal";
import { TreeView } from "@/components/tree/TreeView";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import { BoardRichTextField } from "@/components/board/BoardRichTextField";
import type { BoardDocument, BoardEdge, BoardNode, TreeNode } from "@/types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "未知错误";
}

function newEdge(from: string, to: string, kind: BoardDocument["kind"]): BoardEdge {
  return { id: `parent:${to}`, from, to, style: "solid", arrow: "forward",
    route: kind === "master" ? "curve" : "elbow" };
}

function chapterPath(tree: TreeNode | null, id?: string): string | null {
  if (!tree || !id) return null;
  const walk = (node: TreeNode, parents: string[]): string | null => {
    const parts = node.id === "root" ? parents : [...parents, node.name];
    if (node.id === id) return parts.join(" / ");
    for (const child of node.children) {
      const found = walk(child, parts);
      if (found) return found;
    }
    return null;
  };
  return walk(tree, []);
}

export function BoardLibrary() {
  const { teacher } = useAuthStore();
  const [list, setList] = useState<BoardDocument[]>([]);
  const [board, setBoard] = useState<BoardDocument | null>(null);
  const [saved, setSaved] = useState<BoardDocument | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linkTargetId, setLinkTargetId] = useState("");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [richEditorOpen, setRichEditorOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [chaptersCollapsed, setChaptersCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => {
    if (!fullScreen) return;
    const exit = (event: KeyboardEvent) => { if (event.key === "Escape") setFullScreen(false); };
    window.addEventListener("keydown", exit);
    return () => window.removeEventListener("keydown", exit);
  }, [fullScreen]);
  const dirty = !!board && !!saved && JSON.stringify(board) !== JSON.stringify(saved);

  const reload = useCallback(async (preferredId?: string) => {
    if (!teacher) return;
    setLoading(true);
    try {
      const boards = await boardService.listBoards(teacher.id);
      setList(boards);
      const current = boards.find((item) => item.id === preferredId) || boards[0] || null;
      setBoard(current);
      setSaved(current);
      setSelectedNodeId(current?.rootNodeId || null);
      setSelectedEdgeId(null);
      setSelectedChapterId(current?.chapterId || null);
      try { setChapterTree(await knowledgeService.getChapterTree(teacher.id, false)); }
      catch (error) { setChapterTree(null); toast.error("章节课目录加载失败", errorMessage(error)); }
    } catch (err) {
      toast.error("导图库加载失败", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => { void reload(); }, [reload]);

  const selectBoard = async (id: string) => {
    if (!teacher || !board || id === board.id) return;
    if (dirty && !window.confirm("当前板书有未保存的修改，确定放弃并切换吗？")) return;
    try {
      const next = await boardService.getBoard(id, teacher.id);
      setBoard(next);
      setSaved(next);
      setSelectedNodeId(next.rootNodeId);
      setSelectedEdgeId(null);
      setSelectedChapterId(next.chapterId || null);
    } catch (err) { toast.error("打开板书失败", errorMessage(err)); }
  };

  const save = async () => {
    if (!board || !dirty || busy) return;
    setBusy(true);
    try {
      const result = await boardService.saveBoard(board);
      setBoard(result);
      setSaved(result);
      setList((previous) => previous.map((item) => item.id === result.id ? result : item));
      toast.success("板书已保存，所有课件引用将读取最新内容");
    } catch (err) { toast.error("保存失败", errorMessage(err)); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (!teacher || !board || busy) return;
    if (dirty) { toast.error("请先保存当前板书"); return; }
    setBusy(true);
    try {
      const item = await boardService.createBoard(teacher.id,
        board.nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId! : board.rootNodeId,
        selectedChapterId || undefined);
      setList((previous) => previous.length ? [previous[0], item, ...previous.slice(1)] : [item]);
      setBoard(item);
      setSaved(item);
      setSelectedNodeId(item.rootNodeId);
      setSelectedEdgeId(null);
      setSelectedChapterId(item.chapterId || null);
      toast.success("已创建结构板书");
    } catch (err) { toast.error("创建失败", errorMessage(err)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!teacher || !board || board.kind === "master" || busy) return;
    if (!window.confirm(`确认删除结构板书“${board.title}”？已关联的课件将自动解除此板书引用。`)) return;
    setBusy(true);
    try {
      await boardService.deleteBoard(board.id, teacher.id);
      await reload();
      toast.success("已删除结构板书");
    } catch (err) { toast.error("删除失败", errorMessage(err)); }
    finally { setBusy(false); }
  };

  const patch = (change: Partial<BoardDocument>) => {
    if (!board) return;
    setBoard({ ...board, ...change });
  };

  const selected = board?.nodes.find((item) => item.id === selectedNodeId);
  const edge = board?.edges.find((item) => item.id === selectedEdgeId);
  const addNode = () => {
    if (!board || !selected) return;
    const title = window.prompt("请输入子节点名称");
    if (!title?.trim()) return;
    const id = genId("board-node");
    const node: BoardNode = { id, label: title.trim(), parentId: selected.id,
      x: Math.min(94, selected.x + 15), y: Math.min(94, selected.y + 17) };
    patch({ nodes: [...board.nodes, node], edges: [...board.edges, newEdge(selected.id, id, board.kind)] });
    setSelectedNodeId(id);
  };

  const removeNode = () => {
    if (!board || !selected || selected.id === board.rootNodeId || (board.kind === "master" && selected.sourceKnowledgeId)) return;
    const parentId = selected.parentId || board.rootNodeId;
    const nodes = board.nodes.filter((node) => node.id !== selected.id).map((node) =>
      node.parentId === selected.id ? { ...node, parentId } : node);
    const edges = board.edges.filter((item) => item.from !== selected.id && item.to !== selected.id);
    for (const node of nodes.filter((item) => item.parentId === parentId && board.nodes.find((previous) => previous.id === item.id)?.parentId === selected.id)) {
      edges.push(newEdge(parentId, node.id, board.kind));
    }
    patch({ nodes, edges });
    setSelectedNodeId(parentId);
  };

  const changeNode = (change: Partial<BoardNode>) => {
    if (!board || !selected) return;
    patch({ nodes: board.nodes.map((node) => node.id === selected.id ? { ...node, ...change } : node) });
  };

  const changeEdge = (change: Partial<BoardEdge>) => {
    if (!board || !edge) return;
    patch({ edges: board.edges.map((item) => item.id === edge.id ? { ...item, ...change } : item) });
  };

  const uploadImage = (file?: File) => {
    if (!file || !selected) return;
    if (!/^(image\/(png|jpeg|gif|webp))$/.test(file.type) || file.size > 280000) {
      toast.error("请选择 280KB 以内的 PNG、JPEG、GIF 或 WebP 图片"); return;
    }
    const targetId = selected.id;
    const reader = new FileReader();
    reader.onload = () => setBoard((current) => current ? ({ ...current,
      nodes: current.nodes.map((node) => node.id === targetId ? { ...node, imageUrl: String(reader.result) } : node),
    }) : current);
    reader.readAsDataURL(file);
  };

  const addLink = () => {
    if (!board || !selected || !linkTargetId || linkTargetId === selected.id) return;
    const id = genId("link");
    patch({ edges: [...board.edges, { ...newEdge(selected.id, linkTargetId, board.kind), id }] });
    setSelectedEdgeId(id);
    setLinkTargetId("");
  };

  if (loading && !board) return <div className="py-16 text-center text-sm text-ink-500">正在加载导图库...</div>;
  if (!board) return <div className="py-12 text-center text-sm text-ink-500">暂无可用板书 <button onClick={() => void reload()} className="underline">重试</button></div>;

  const gridColumns = fullScreen ? "lg:grid-cols-1"
    : leftCollapsed
      ? rightCollapsed ? "lg:grid-cols-[48px_minmax(0,1fr)_48px]" : "lg:grid-cols-[48px_minmax(0,1fr)_260px]"
      : rightCollapsed ? "lg:grid-cols-[220px_minmax(0,1fr)_48px]" : "lg:grid-cols-[220px_minmax(0,1fr)_260px]";
  const availableChapters = chapterTree ? chapterOptions(chapterTree) : [];
  return <div className={`grid min-h-[70vh] grid-cols-1 gap-3 ${gridColumns} ${fullScreen ? "fixed inset-0 z-[70] overflow-auto bg-paper p-3" : ""}`}>
    {!fullScreen && <aside className="min-w-0 rounded-xl border border-ink-100 bg-paper p-2">
      <div className="flex items-center justify-between gap-1">
        {!leftCollapsed && <span className="px-1 text-sm font-semibold text-ink-800">目录导航</span>}
        <button type="button" aria-label={leftCollapsed ? "展开左侧目录" : "向左折叠目录"}
          onClick={() => setLeftCollapsed((value) => !value)}
          className="rounded p-1.5 hover:bg-mist">{leftCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
      </div>
      {!leftCollapsed && <>
        <div className="mt-2 border-t border-ink-100 pt-2">
          <div className="flex items-center justify-between gap-1">
            <button type="button" aria-label={libraryCollapsed ? "展开导图库" : "向上折叠导图库"}
              aria-expanded={!libraryCollapsed} onClick={() => setLibraryCollapsed((value) => !value)}
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-1 text-left text-sm font-semibold text-ink-800 hover:bg-mist">
              {libraryCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />} 导图库
            </button>
            <button aria-label="刷新导图库" onClick={() => void reload(board.id)} title="同步知识树"
              className="rounded p-1 hover:bg-mist"><RefreshCw className="h-4 w-4" /></button>
          </div>
          {!libraryCollapsed && <>
            <div className="max-h-[40vh] space-y-1 overflow-y-auto">
              {list.map((item) => <button key={item.id} type="button" onClick={() => void selectBoard(item.id)}
                className={`w-full rounded-lg px-2 py-2 text-left text-sm ${item.id === board.id ? "bg-amber-50 text-amber-900" : "text-ink-600 hover:bg-mist"}`}>
                <span className="block truncate font-medium">{item.title}</span>
                <span className="text-[11px] text-ink-400">{item.kind === "master" ? "总导图" : item.chapterId ? "结构板书 · 已归类" : "结构板书 · 未归类"}</span>
              </button>)}
            </div>
            <button type="button" onClick={() => void create()} disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-ink-200 px-1 py-2 text-xs text-ink-700 hover:bg-mist disabled:opacity-50">
              <Plus className="h-3.5 w-3.5 shrink-0" /> 新建结构板书
            </button>
          </>}
        </div>
        <div className="mt-3 border-t border-ink-100 pt-2">
          <button type="button" aria-label={chaptersCollapsed ? "展开章节课目录" : "向上折叠章节课目录"}
            aria-expanded={!chaptersCollapsed} onClick={() => setChaptersCollapsed((value) => !value)}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-sm font-semibold text-ink-800 hover:bg-mist">
            {chaptersCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />} 章节课目录
          </button>
          {!chaptersCollapsed && (chapterTree
            ? <BoardChapterTree tree={chapterTree} boards={list} activeBoardId={board.id}
                selectedChapterId={selectedChapterId} onSelectChapter={setSelectedChapterId}
                onSelectBoard={(id) => void selectBoard(id)} />
            : <p className="p-2 text-xs text-ink-400">暂无章节目录</p>)}
        </div>
      </>}
    </aside>}

    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-100 bg-paper">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-800">{board.title}</div>
          {board.kind === "structure" && board.chapterId && <div className="truncate text-[11px] text-amber-700">章节：{chapterPath(chapterTree, board.chapterId) || "节点已失效"}</div>}
        </div>
        {board.kind === "structure" && <button type="button" aria-label="关联章节课目录" onClick={() => setChapterPickerOpen(true)}
          className="flex shrink-0 items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 hover:bg-mist">
          <FolderTree className="h-3.5 w-3.5" />章节课目录
        </button>}
        <button type="button" aria-label={fullScreen ? "退出全屏" : "全屏"} onClick={() => setFullScreen((value) => !value)}
          className="flex items-center gap-1 rounded p-2 text-xs text-ink-700 hover:bg-mist">
          {fullScreen ? <Minimize size={15} /> : <Expand size={15} />}
          {fullScreen ? "退出全屏" : "全屏"}
        </button>
        {dirty && <span className="text-xs text-amber-700">未保存</span>}
        {board.kind === "structure" && <button aria-label="删除结构板书" onClick={() => void remove()} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-2 text-xs text-paper disabled:opacity-40">
          <Save className="h-3.5 w-3.5" />保存
        </button>
      </div>
      <div className="min-h-[480px] flex-1 p-2" style={{ height: fullScreen ? "calc(100vh - 135px)" : "min(72vh, 750px)" }}>
        <BoardCanvas board={board} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId}
          onSelectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
          onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
          onChange={setBoard} />
      </div>
      <div className="border-t border-ink-100 px-4 py-2 text-xs text-ink-500">
        {board.kind === "master" ? "点击节点切换中心；从空心连接点拖至另一节点连接；在右侧可隐藏或固定节点。" : "拖动节点调整位置；空心连接点可建立层级或横向关联。"}
      </div>
    </section>

    {!fullScreen && <aside className="min-w-0 space-y-4 rounded-xl border border-ink-100 bg-paper p-3">
      <div className="flex items-center justify-between gap-1">
        {!rightCollapsed && <h3 className="text-sm font-semibold text-ink-900">编辑属性</h3>}
        <button type="button" aria-label={rightCollapsed ? "展开编辑属性" : "向右折叠编辑属性"}
          onClick={() => setRightCollapsed((value) => !value)} className="rounded p-1.5 hover:bg-mist">
          {rightCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {!rightCollapsed && <>
      {board.kind === "structure" && <label className="block text-xs text-ink-500">板书标题
        <input aria-label="板书标题" value={board.title} maxLength={180}
          onChange={(e) => patch({ title: e.target.value,
            nodes: board.nodes.map((node) => node.id === board.rootNodeId ? { ...node, label: e.target.value } : node) })}
          className="mt-1 w-full rounded-md border border-ink-200 px-2 py-2 text-sm" />
      </label>}
      {board.kind === "structure" && <label className="block text-xs text-ink-500">所属章节课
        <select aria-label="所属章节课" value={board.chapterId || ""}
          onChange={(event) => { patch({ chapterId: event.target.value || undefined }); setSelectedChapterId(event.target.value || null); }}
          className="mt-1 w-full rounded-md border border-ink-200 bg-paper p-2 text-sm">
          <option value="">未归类</option>
          {availableChapters.map((item) => <option key={item.id} value={item.id}>
            {"　".repeat(item.depth - 1)}{item.name}</option>)}
        </select>
      </label>}
      {selected && <div className="space-y-3">
        <label className="block text-xs text-ink-500">节点名称
          <input aria-label="节点名称" value={selected.label}
            disabled={board.kind === "master" && !!selected.sourceKnowledgeId}
            onChange={(e) => patch({
              ...(selected.id === board.rootNodeId && board.kind === "structure" ? { title: e.target.value } : {}),
              nodes: board.nodes.map((node) => node.id === selected.id ? { ...node, label: e.target.value } : node),
            })}
            className="mt-1 w-full rounded-md border border-ink-200 px-2 py-2 text-sm disabled:bg-mist" />
        </label>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" aria-label="不显示节点名称" checked={!!selected.hideLabel}
            onChange={(e) => changeNode({ hideLabel: e.target.checked })} />
          不显示节点名称（保留文本框内容）
        </label>
        {board.kind === "master" && selected.sourceKnowledgeId && <p className="text-xs text-ink-400">该节点来自知识树，名称随知识树同步。</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-label={selected.pinned ? "取消图钉" : "添加图钉"}
            onClick={() => changeNode({ pinned: !selected.pinned })}
            className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs">
            {selected.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {selected.pinned ? "取消图钉" : "添加图钉"}
          </button>
          {selected.id !== board.rootNodeId && <button type="button" aria-label={selected.hidden ? "显示节点" : "隐藏节点"}
            onClick={() => changeNode({ hidden: !selected.hidden })}
            className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs">
            {selected.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {selected.hidden ? "显示节点" : "隐藏节点"}
          </button>}
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-500">
          <input type="checkbox" aria-label="显示节点边框"
            checked={selected.borderVisible !== false}
            onChange={(event) => changeNode({ borderVisible: event.target.checked })} />
          显示节点边框
        </label>
        <label className="flex items-center justify-between gap-2 text-xs text-ink-500">
          节点边框颜色
          <input type="color" aria-label="节点边框颜色" value={selected.borderColor || "#d1d5db"}
            onChange={(event) => changeNode({ borderColor: event.target.value })}
            className="h-8 w-12 cursor-pointer rounded border border-ink-200" />
        </label>
        <label className="block text-xs text-ink-500">节点字号
          <input type="number" aria-label="节点字号" min={10} max={48}
            value={selected.fontSize ?? (board.kind === "master" ? 17 : 18)}
            onChange={(e) => changeNode({ fontSize: Math.max(10, Math.min(48, Number(e.target.value) || 10)) })}
            className="mt-1 w-full rounded-md border border-ink-200 p-2 text-sm" />
        </label>
        <button type="button" className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700 hover:bg-mist"
          aria-label="打开节点文本编辑器" onClick={() => setRichEditorOpen(true)}>展开节点文本编辑器</button>
        <BoardRichTextField key={`node:${selected.id}`} label="节点富文本" value={selected.richText}
          onChange={(richText) => changeNode({ richText })} />
        <label className="block text-xs text-ink-500">节点图片 URL（支持 https）
          <input aria-label="节点图片 URL" value={selected.imageUrl?.startsWith("data:") ? "" : selected.imageUrl || ""}
            placeholder={selected.imageUrl?.startsWith("data:") ? "已使用上传图片" : "https://..."}
            onChange={(e) => changeNode({ imageUrl: e.target.value })}
            className="mt-1 w-full rounded-md border border-ink-200 p-2 text-sm" />
        </label>
        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs">
          <Upload className="h-3.5 w-3.5" />上传图片（280KB 内）
          <input aria-label="上传节点图片" type="file" accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only" onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {selected.imageUrl && <button type="button" className="text-xs text-red-600" onClick={() => changeNode({ imageUrl: undefined })}>移除图片</button>}
        <div className="flex gap-2">
          <button onClick={addNode} className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs"><GitBranchPlus className="h-3.5 w-3.5" />添加子节点</button>
          {(board.kind === "structure" || !selected.sourceKnowledgeId) && selected.id !== board.rootNodeId &&
            <button onClick={removeNode} className="rounded-md border border-red-200 px-2 py-1.5 text-xs text-red-600">删除节点</button>}
        </div>
        {board.kind === "structure" && <div className="space-y-1.5 border-t border-ink-100 pt-3">
          <label className="block text-xs text-ink-500">额外连线至</label>
          <select aria-label="连线目标" value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)} className="w-full rounded-md border border-ink-200 bg-paper px-2 py-2 text-xs">
            <option value="">请选择目标节点</option>
            {board.nodes.filter((node) => node.id !== selected.id).map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}
          </select>
          <button onClick={addLink} disabled={!linkTargetId} className="flex items-center gap-1 rounded-md border border-ink-200 px-2 py-1.5 text-xs disabled:opacity-40"><ArrowRight className="h-3.5 w-3.5" />添加连线</button>
        </div>}
      </div>}
      {edge && <div className="space-y-3 border-t border-ink-100 pt-3">
        <div className="text-xs font-semibold text-ink-700">连线：{board.nodes.find((node) => node.id === edge.from)?.label} → {board.nodes.find((node) => node.id === edge.to)?.label}</div>
        <label className="block text-xs text-ink-500">线条类型
          <select aria-label="线条类型" value={edge.style} onChange={(e) => changeEdge({ style: e.target.value as BoardEdge["style"] })} className="mt-1 w-full rounded-md border p-2 text-sm">
            <option value="solid">单实线</option><option value="double">双实线</option><option value="dashed">淡虚线</option>
          </select></label>
        <label className="block text-xs text-ink-500">箭头方向
          <select aria-label="箭头方向" value={edge.arrow} onChange={(e) => changeEdge({ arrow: e.target.value as BoardEdge["arrow"] })} className="mt-1 w-full rounded-md border p-2 text-sm">
            <option value="none">无箭头</option><option value="forward">单箭头 →</option><option value="reverse">单箭头 ←</option><option value="both">双箭头 ↔</option>
          </select></label>
        <label className="block text-xs text-ink-500">连线文字字号
          <input type="number" aria-label="连线文字字号" min={10} max={48}
            value={edge.fontSize || 13}
            onChange={(e) => changeEdge({ fontSize: Math.max(10, Math.min(48, Number(e.target.value) || 10)) })}
            className="mt-1 w-full rounded-md border p-2 text-sm" />
        </label>
        <BoardRichTextField key={`edge:${edge.id}`} label="连线富文本" value={edge.richText}
          onChange={(richText) => changeEdge({ richText })} />
        <label className="block text-xs text-ink-500">连线形状
          <select aria-label="连线形状" value={edge.route} onChange={(e) => changeEdge({ route: e.target.value as BoardEdge["route"] })} className="mt-1 w-full rounded-md border p-2 text-sm">
            <option value="straight">直线</option><option value="elbow">直角折线</option><option value="curve">平滑曲线</option>
          </select></label>
        {!edge.id.startsWith("parent:") && <button type="button" className="text-xs text-red-600" onClick={() => {
          patch({ edges: board.edges.filter((item) => item.id !== edge.id) }); setSelectedEdgeId(null);
        }}>删除连线</button>}
      </div>}
      {!selected && !edge && <p className="text-xs text-ink-400">点击节点或连线查看编辑选项。</p>}
      </>}
    </aside>}
    <Modal open={chapterPickerOpen && board.kind === "structure"} onClose={() => setChapterPickerOpen(false)} title="添加到章节课目录" size="lg">
      <div className="space-y-3 p-4">
        {chapterTree ? <TreeView data={chapterTree} selectedId={board.chapterId}
          onSelect={(node) => { if (!chapterOptions(chapterTree).some((entry) => entry.id === node.id)) return;
            patch({ chapterId: node.id }); setSelectedChapterId(node.id); setChapterPickerOpen(false); }}
          showCount={false} expandLevel={2} className="max-h-[55vh] overflow-y-auto" />
          : <p className="text-sm text-ink-500">章节课目录加载中...</p>}
        <div className="flex items-center justify-between border-t border-ink-100 pt-3">
          <button type="button" onClick={() => { patch({ chapterId: undefined }); setSelectedChapterId(null); setChapterPickerOpen(false); }}
            className="text-xs text-red-600">清除关联</button>
          <span className="text-xs text-ink-400">选择节点后点击“保存”以生效</span>
        </div>
      </div>
    </Modal>
    <Modal open={richEditorOpen && !!selected} onClose={() => setRichEditorOpen(false)} title={`编辑节点文本：${selected?.label || ""}`} size="lg">
      <div className="p-5">
        {selected && <BoardRichTextField key={`expanded:${selected.id}`} label="节点文本编辑器" expanded
          value={selected.richText} onChange={(richText) => changeNode({ richText })} />}
      </div>
    </Modal>
  </div>;
}
