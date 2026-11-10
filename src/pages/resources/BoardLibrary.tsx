import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GitBranchPlus, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { genId } from "@/lib/service-utils";
import { boardService } from "@/services/board";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import type { BoardDocument, BoardEdge, BoardNode } from "@/types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "未知错误";
}

function newEdge(from: string, to: string): BoardEdge {
  return { id: `parent:${to}`, from, to, style: "solid", arrow: "forward", route: "straight" };
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
      const item = await boardService.createBoard(teacher.id, selectedNodeId || board.rootNodeId);
      setList((previous) => previous.length ? [previous[0], item, ...previous.slice(1)] : [item]);
      setBoard(item);
      setSaved(item);
      setSelectedNodeId(item.rootNodeId);
      setSelectedEdgeId(null);
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
    patch({ nodes: [...board.nodes, node], edges: [...board.edges, newEdge(selected.id, id)] });
    setSelectedNodeId(id);
  };

  const removeNode = () => {
    if (!board || !selected || selected.id === board.rootNodeId || (board.kind === "master" && selected.sourceKnowledgeId)) return;
    const parentId = selected.parentId || board.rootNodeId;
    const nodes = board.nodes.filter((node) => node.id !== selected.id).map((node) =>
      node.parentId === selected.id ? { ...node, parentId } : node);
    const edges = board.edges.filter((item) => item.from !== selected.id && item.to !== selected.id);
    for (const node of nodes.filter((item) => item.parentId === parentId && board.nodes.find((previous) => previous.id === item.id)?.parentId === selected.id)) {
      edges.push(newEdge(parentId, node.id));
    }
    patch({ nodes, edges });
    setSelectedNodeId(parentId);
  };

  const changeEdge = (change: Partial<BoardEdge>) => {
    if (!board || !edge) return;
    patch({ edges: board.edges.map((item) => item.id === edge.id ? { ...item, ...change } : item) });
  };

  const addLink = () => {
    if (!board || !selected || !linkTargetId || linkTargetId === selected.id) return;
    const id = genId("link");
    patch({ edges: [...board.edges, { ...newEdge(selected.id, linkTargetId), id }] });
    setSelectedEdgeId(id);
    setLinkTargetId("");
  };

  if (loading && !board) return <div className="py-16 text-center text-sm text-ink-500">正在加载导图库...</div>;
  if (!board) return <div className="py-12 text-center text-sm text-ink-500">暂无可用板书 <button onClick={() => void reload()} className="underline">重试</button></div>;

  return <div className="grid min-h-[70vh] grid-cols-1 gap-3 lg:grid-cols-[210px_minmax(0,1fr)_240px]">
    <aside className="rounded-xl border border-ink-100 bg-paper p-3">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold text-ink-800">
        <span>导图库</span>
        <button aria-label="刷新导图库" onClick={() => void reload(board.id)} title="同步知识树" className="rounded-md p-1 hover:bg-mist"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1">
        {list.map((item) => <button key={item.id} type="button" onClick={() => void selectBoard(item.id)}
          className={`w-full rounded-lg px-3 py-2 text-left text-sm ${item.id === board.id ? "bg-amber-50 text-amber-900" : "text-ink-600 hover:bg-mist"}`}>
          <span className="block truncate font-medium">{item.title}</span>
          <span className="text-[11px] text-ink-400">{item.kind === "master" ? "知识树实时同步 · 总导图" : "结构板书"}</span>
        </button>)}
      </div>
      <button type="button" onClick={() => void create()} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg border border-ink-200 py-2 text-xs text-ink-700 hover:bg-mist disabled:opacity-50">
        <Plus className="h-3.5 w-3.5" /> 从当前节点新建结构板书
      </button>
    </aside>

    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-100 bg-paper">
      <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-800">{board.title}</span>
        {dirty && <span className="text-xs text-amber-700">未保存</span>}
        {board.kind === "structure" && <button aria-label="删除结构板书" onClick={() => void remove()} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="flex items-center gap-1 rounded-lg bg-ink-900 px-3 py-2 text-xs text-paper disabled:opacity-40">
          <Save className="h-3.5 w-3.5" />保存
        </button>
      </div>
      <div className="min-h-[480px] flex-1 p-2" style={{ height: "min(72vh, 750px)" }}>
        <BoardCanvas board={board} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId}
          onSelectNode={(id) => { setSelectedNodeId(id); setSelectedEdgeId(null); }}
          onSelectEdge={(id) => { setSelectedEdgeId(id); setSelectedNodeId(null); }}
          onChange={setBoard} />
      </div>
      <div className="border-t border-ink-100 px-4 py-2 text-xs text-ink-500">
        {board.kind === "master" ? "点击节点切换中心；拖动节点到另一节点可更改父级（不改动原知识树）。" : "拖动普通节点自由布局；连线样式可在右侧修改。"}
      </div>
    </section>

    <aside className="space-y-4 rounded-xl border border-ink-100 bg-paper p-4">
      <h3 className="text-sm font-semibold text-ink-900">编辑属性</h3>
      {board.kind === "structure" && <label className="block text-xs text-ink-500">板书标题
        <input aria-label="板书标题" value={board.title} maxLength={180}
          onChange={(e) => patch({ title: e.target.value,
            nodes: board.nodes.map((node) => node.id === board.rootNodeId ? { ...node, label: e.target.value } : node) })}
          className="mt-1 w-full rounded-md border border-ink-200 px-2 py-2 text-sm" />
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
        {board.kind === "master" && selected.sourceKnowledgeId && <p className="text-xs text-ink-400">该节点来自知识树，名称随知识树同步。</p>}
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
        <label className="block text-xs text-ink-500">连线形状
          <select aria-label="连线形状" value={edge.route} onChange={(e) => changeEdge({ route: e.target.value as BoardEdge["route"] })} className="mt-1 w-full rounded-md border p-2 text-sm">
            <option value="straight">直线</option><option value="elbow">折线（7 字型）</option>
          </select></label>
        {!edge.id.startsWith("parent:") && <button type="button" className="text-xs text-red-600" onClick={() => {
          patch({ edges: board.edges.filter((item) => item.id !== edge.id) }); setSelectedEdgeId(null);
        }}>删除连线</button>}
      </div>}
      {!selected && !edge && <p className="text-xs text-ink-400">点击节点或连线查看编辑选项。</p>}
    </aside>
  </div>;
}
