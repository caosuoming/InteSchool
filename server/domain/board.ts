import type { BoardDocument, BoardEdge, BoardNode, TreeNode } from "../../src/types/index.js";
import type { TeacherRecord } from "../types.js";
import { selectedSubject } from "../lib/resource-subject.js";
import { personalResourceScopeId } from "../../src/lib/personal-resource-scope.js";
import { db } from "../runtime-db.js";
import { genId } from "../domain-shared.js";
import { knowledgeService } from "./knowledge.js";

const MAX_NODES = 600;
const MAX_EDGES = 1200;
const EPOCH = "1970-01-01T00:00:00.000Z";

type BoardPatch = Pick<BoardDocument, "nodes" | "edges"> & { title?: string; expectedUpdatedAt?: string };

function teacherContext(teacherId: string) {
  const teacher = (db.read("teachers") as TeacherRecord[]).find((item) => item.id === teacherId);
  if (!teacher) throw new Error("教师不存在");
  return {
    schoolId: teacher.schoolId || personalResourceScopeId(teacherId),
    subject: selectedSubject(teacher) || "未设置学科",
  };
}

function storedBoards(): BoardDocument[] {
  return (db.read("boards") || []) as BoardDocument[];
}

function masterId(teacherId: string, subject: string): string {
  return `master:${teacherId}:${encodeURIComponent(subject)}`;
}

function hierarchyEdges(nodes: BoardNode[]): BoardEdge[] {
  return nodes.flatMap((node): BoardEdge[] => node.parentId
    ? [{ id: `parent:${node.id}`, from: node.parentId, to: node.id,
      style: "solid", arrow: "forward", route: "straight" }]
    : []);
}

function layout(nodes: BoardNode[], rootId: string): BoardNode[] {
  const parents = new Map<string, BoardNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    parents.set(node.parentId, [...(parents.get(node.parentId) || []), node]);
  }
  const visited = new Set<string>();
  let level = [rootId];
  let depth = 0;
  const coords = new Map<string, { x: number; y: number }>();
  while (level.length && depth < 30) {
    level.forEach((id, index) => {
      if (visited.has(id)) return;
      visited.add(id);
      coords.set(id, { x: (index + 1) * 100 / (level.length + 1), y: Math.min(8 + depth * 15, 92) });
    });
    level = level.flatMap((id) => parents.get(id)?.map((node) => node.id) || [])
      .filter((id) => !visited.has(id));
    depth++;
  }
  return nodes.map((node) => ({ ...node, ...coords.get(node.id) }));
}

function normalizeNodes(raw: BoardNode[], rootNodeId: string): BoardNode[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_NODES) {
    throw new Error("板书节点数量不合法");
  }
  const ids = new Set<string>();
  const result = raw.map((node) => {
    if (!node || typeof node.id !== "string" || !node.id || ids.has(node.id)) throw new Error("板书节点 ID 重复或为空");
    ids.add(node.id);
    const label = typeof node.label === "string" ? node.label.trim().slice(0, 180) : "";
    if (!label) throw new Error("板书节点名称不能为空");
    const x = Number(node.x);
    const y = Number(node.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("节点坐标不合法");
    if (node.parentId !== null && typeof node.parentId !== "string") throw new Error("父节点不合法");
    return {
      id: node.id,
      label,
      parentId: node.parentId,
      ...(typeof node.sourceKnowledgeId === "string" ? { sourceKnowledgeId: node.sourceKnowledgeId } : {}),
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  });
  if (result.find((node) => node.id === rootNodeId)?.parentId !== null) throw new Error("根节点不可移动到其他节点下");
  for (const node of result) {
    if (node.id === rootNodeId) continue;
    if (!node.parentId || !ids.has(node.parentId)) throw new Error("节点父级不存在");
    const visited = new Set<string>([node.id]);
    let parentId: string | null = node.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw new Error("节点不能组成循环父子关系");
      visited.add(parentId);
      parentId = result.find((item) => item.id === parentId)?.parentId || null;
    }
    if (!visited.has(rootNodeId)) throw new Error("节点必须属于根节点");
  }
  return result;
}

function normalizeEdges(raw: BoardEdge[], nodes: BoardNode[]): BoardEdge[] {
  if (!Array.isArray(raw) || raw.length > MAX_EDGES) throw new Error("板书连线过多");
  const ids = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set<string>();
  return raw.map((edge) => {
    if (!edge || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id)) throw new Error("连线 ID 不合法");
    edgeIds.add(edge.id);
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) throw new Error("连线端点不存在");
    if (!["solid", "double", "dashed"].includes(edge.style)
      || !["none", "forward", "reverse", "both"].includes(edge.arrow)
      || !["straight", "elbow"].includes(edge.route)) throw new Error("连线类型不合法");
    return { id: edge.id, from: edge.from, to: edge.to, style: edge.style, arrow: edge.arrow, route: edge.route };
  });
}

async function getMaster(teacherId: string): Promise<BoardDocument> {
  const context = teacherContext(teacherId);
  const id = masterId(teacherId, context.subject);
  const stored = storedBoards().find((item) => item.id === id);
  const tree = await knowledgeService.getKnowledgeTree(teacherId, false);
  const nodes: BoardNode[] = [];
  function visit(node: TreeNode, parentId: string | null) {
    nodes.push({ id: node.id, sourceKnowledgeId: node.id, parentId,
      label: node.id === "root" ? "总导图" : node.name, x: 50, y: 8 });
    node.children.forEach((child) => visit(child, node.id));
  }
  visit(tree, null);
  const sourceIds = new Set(nodes.map((node) => node.id));
  const storedNodes = new Map(stored?.nodes.map((node) => [node.id, node]) || []);
  // 始终以最新知识树节点集和名称为准，仅保留导图本地的布局与父节点覆盖。
  const merged = nodes.map((node) => {
    const custom = storedNodes.get(node.id);
    return custom ? { ...node, parentId: node.id === "root" ? null : custom.parentId,
      x: custom.x, y: custom.y } : node;
  });
  for (const custom of stored?.nodes || []) {
    if (!sourceIds.has(custom.id) && !custom.sourceKnowledgeId) merged.push(custom);
  }
  const allIds = new Set(merged.map((node) => node.id));
  const repaired = merged.map((node) => ({ ...node,
    parentId: node.id === "root" ? null : node.parentId && allIds.has(node.parentId) ? node.parentId : "root",
  }));
  // 知识树重组后，原本的自定义父级覆盖可能失效，回退至树本身的关系。
  const defaults = new Map(nodes.map((node) => [node.id, node.parentId]));
  for (const node of repaired) {
    const seen = new Set([node.id]);
    let ancestor = node.parentId;
    while (ancestor) {
      if (seen.has(ancestor)) {
        node.parentId = defaults.get(node.id) || "root";
        break;
      }
      seen.add(ancestor);
      ancestor = repaired.find((item) => item.id === ancestor)?.parentId || null;
    }
  }
  const laidOut = layout(repaired, "root");
  // 仅对已经保存过的节点恢复画布坐标。
  const savedPositions = laidOut.map((node) => {
    const from = storedNodes.get(node.id);
    return from ? { ...node, x: from.x, y: from.y } : node;
  });
  const savedEdges = stored?.edges.filter((edge) => allIds.has(edge.from) && allIds.has(edge.to)) || [];
  const parentEdges = hierarchyEdges(savedPositions).map((edge) =>
    savedEdges.find((saved) => saved.id === edge.id) || edge);
  return {
    id, kind: "master", teacherId, ...context,
    title: "总导图", rootNodeId: "root", nodes: savedPositions,
    edges: [...parentEdges, ...savedEdges.filter((edge) => !edge.id.startsWith("parent:"))],
    createdAt: stored?.createdAt || EPOCH, updatedAt: stored?.updatedAt || EPOCH,
  };
}

function owned(teacherId: string, id: string): BoardDocument {
  const board = storedBoards().find((item) => item.id === id && item.teacherId === teacherId);
  if (!board) throw new Error("板书不存在或无权访问");
  return board;
}

export const boardService = {
  async listBoards(teacherId: string): Promise<BoardDocument[]> {
    const master = await getMaster(teacherId);
    return [master, ...storedBoards()
      .filter((board) => board.kind === "structure" && board.teacherId === teacherId && board.subject === master.subject)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))];
  },

  async getBoard(id: string, teacherId: string): Promise<BoardDocument> {
    if (id.startsWith("master:")) {
      const master = await getMaster(teacherId);
      if (id === master.id) return master;
      throw new Error("总导图不属于当前学科");
    }
    return owned(teacherId, id);
  },

  async getLessonBoards(coursewareId: string, requester: TeacherRecord): Promise<BoardDocument[]> {
    const lesson = db.read("lessonCoursewares")
      .find((item) => item.id === coursewareId) as { teacherId: string; schoolId: string;
        boardIds?: string[]; status: string } | undefined;
    if (!lesson || (lesson.teacherId !== requester.id &&
      (lesson.schoolId !== requester.schoolId || lesson.status !== "published"))) {
      throw new Error("无权访问该课件板书");
    }
    const ids = new Set(lesson.boardIds || []);
    return storedBoards().filter((board) => ids.has(board.id)
      && board.kind === "structure" && board.teacherId === lesson.teacherId);
  },

  async createBoard(teacherId: string, sourceNodeId: string): Promise<BoardDocument> {
    const master = await getMaster(teacherId);
    const root = master.nodes.find((node) => node.id === sourceNodeId);
    if (!root) throw new Error("源导图节点不存在");
    const selected = new Set([root.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of master.nodes) {
        if (node.parentId && selected.has(node.parentId) && !selected.has(node.id)) {
          selected.add(node.id);
          changed = true;
        }
      }
    }
    const nodes = layout(master.nodes.filter((node) => selected.has(node.id)).map((node) => ({
      ...node, parentId: node.id === root.id ? null : node.parentId,
    })), root.id);
    const now = new Date().toISOString();
    const board: BoardDocument = {
      id: genId("board"), kind: "structure", teacherId,
      schoolId: master.schoolId, subject: master.subject, title: root.label,
      rootNodeId: root.id, nodes, edges: hierarchyEdges(nodes),
      createdAt: now, updatedAt: now,
    };
    db.update("boards", (current: BoardDocument[]) => [...current, board]);
    return board;
  },

  async saveBoard(id: string, teacherId: string, patch: BoardPatch): Promise<BoardDocument> {
    const master = await getMaster(teacherId);
    const existing = id === master.id ? master : owned(teacherId, id);
    if (existing.subject !== master.subject) throw new Error("只能修改当前学科的板书");
    if (patch.expectedUpdatedAt !== undefined && existing.updatedAt !== patch.expectedUpdatedAt) {
      throw new Error("板书已在其他位置修改，请刷新后重试");
    }
    let nodes = normalizeNodes(patch.nodes, existing.rootNodeId);
    if (existing.kind === "master") {
      const sources = new Map(master.nodes.filter((node) => node.sourceKnowledgeId).map((node) => [node.id, node]));
      for (const node of nodes) {
        if (node.sourceKnowledgeId && !sources.has(node.id)) throw new Error("无法伪造知识树节点");
        if (!node.sourceKnowledgeId && sources.has(node.id)) throw new Error("无法覆盖知识树节点");
      }
      if (sources.size !== nodes.filter((node) => node.sourceKnowledgeId).length) throw new Error("不能删除知识树节点");
      nodes = nodes.map((node) => sources.has(node.id)
        ? { ...node, label: sources.get(node.id)!.label, sourceKnowledgeId: node.id }
        : node);
    } else {
      nodes = nodes.map(({ sourceKnowledgeId: _source, ...node }) => node);
    }
    const edges = normalizeEdges(patch.edges, nodes);
    const updated: BoardDocument = {
      ...existing,
      title: existing.kind === "master" ? "总导图" : (patch.title || existing.title).trim().slice(0, 180),
      nodes, edges,
      updatedAt: new Date().toISOString(),
    };
    if (!updated.title) throw new Error("板书标题不能为空");
    db.update("boards", (current: BoardDocument[]) => [...current.filter((board) => board.id !== id), updated]);
    return updated;
  },

  async deleteBoard(id: string, teacherId: string): Promise<void> {
    const board = owned(teacherId, id);
    if (board.kind !== "structure") throw new Error("总导图不可删除");
    db.update("boards", (items: BoardDocument[]) => items.filter((item) => item.id !== id));
    // 引用该 ID 的课件应保留其余有效板书关系。
    db.update("lessonCoursewares", (items: Array<{ boardIds?: string[] }>) => items.map((item) =>
      item.boardIds?.includes(id) ? { ...item, boardIds: item.boardIds.filter((boardId) => boardId !== id) } : item));
  },
};
