import { describe, expect, it } from "vitest";
import type { AppState, TeacherRecord } from "../types.js";
import type { BoardDocument, KnowledgePoint, LessonCourseware } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { boardService } from "./board.js";
import { knowledgeService } from "./knowledge.js";

function teacher(id: string): TeacherRecord {
  return {
    id, email: `${id}@example.com`, name: id, avatar: "", schoolId: "school-a",
    subject: "数学", subjects: ["数学", "物理"], role: "teacher", status: "active",
    roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [],
    affiliations: [{ id: `aff-${id}`, schoolId: "school-a", subject: "数学", subjects: ["数学", "物理"], isCurrent: true }],
    currentAffiliationId: `aff-${id}`, createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function fixture(): AppState {
  const points: KnowledgePoint[] = [
    { id: "a", teacherId: "alice", schoolId: "personal-directory:alice", subject: "数学", name: "代数", parentId: null, order: 1, level: 0, questionCount: 0 },
    { id: "b", teacherId: "alice", schoolId: "personal-directory:alice", subject: "数学", name: "函数", parentId: "a", order: 1, level: 1, questionCount: 0 },
    { id: "c", teacherId: "alice", schoolId: "personal-directory:alice", subject: "数学", name: "导数", parentId: "b", order: 1, level: 2, questionCount: 0 },
  ];
  return {
    teachers: [teacher("alice"), teacher("bob")], currentTeacherId: "alice",
    boards: [], knowledgePoints: points, chapters: [], thoughtMethods: [], errorReasons: [],
    directoryCatalogs: [], directoryDonations: [], directoryNodeAssociations: [], questions: [],
    lessonCoursewares: [],
  } as AppState;
}

function patch(board: BoardDocument) {
  return { nodes: board.nodes, edges: board.edges, expectedUpdatedAt: board.updatedAt };
}

describe("board library", () => {
  it("generates and continuously synchronizes the knowledge master board", async () => {
    const state = fixture();
    await runWithState(state, async () => {
      const master = (await boardService.listBoards("alice"))[0];
      expect(master.kind).toBe("master");
      expect(master.nodes.map((item) => item.label)).toEqual(["总导图", "代数", "函数", "导数"]);
      expect(master.edges).toContainEqual(expect.objectContaining({ from: "a", to: "b", arrow: "forward" }));
      const custom = { id: "note", parentId: "b", label: "公式提示", x: 25, y: 48 };
      await boardService.saveBoard(master.id, "alice", {
        ...patch(master), nodes: [...master.nodes, custom],
        edges: [...master.edges, { id: "parent:note", from: "b", to: "note", arrow: "forward", route: "straight", style: "solid" }],
      });
      await knowledgeService.renameNode("b", "knowledge", "函数与图像");
      const updated = await boardService.getBoard(master.id, "alice");
      expect(updated.nodes.find((item) => item.id === "b")?.label).toBe("函数与图像");
      expect(updated.nodes.find((item) => item.id === "note")?.label).toBe("公式提示");
      await knowledgeService.addKnowledgePoint("alice", "b", "三角函数");
      const refreshed = await boardService.getBoard(master.id, "alice");
      expect(refreshed.nodes.some((item) => item.label === "三角函数")).toBe(true);
      expect((await boardService.listBoards("alice"))[0].id).toBe(master.id);
    });
  });

  it("creates independent structures and rejects cross-owner access and invalid graphs", async () => {
    await runWithState(fixture(), async () => {
      const board = await boardService.createBoard("alice", "b");
      expect(board.kind).toBe("structure");
      expect(board.rootNodeId).toBe("b");
      expect(board.nodes.map((item) => item.id)).toEqual(["b", "c"]);
      await expect(boardService.getBoard(board.id, "bob")).rejects.toThrow();
      await expect(boardService.deleteBoard(board.id, "bob")).rejects.toThrow();
      await expect(boardService.saveBoard(board.id, "alice", {
        ...patch(board), nodes: board.nodes.map((node) => node.id === "c" ? { ...node, parentId: "c" } : node),
      })).rejects.toThrow(/循环/);
      const updated = await boardService.saveBoard(board.id, "alice", {
        ...patch(board), title: "导数基础",
        edges: board.edges.map((edge) => ({ ...edge, style: "dashed", route: "elbow", arrow: "both" })),
      });
      expect(updated.title).toBe("导数基础");
      expect(updated.edges[0]).toEqual(expect.objectContaining({ style: "dashed", route: "elbow", arrow: "both" }));
      await expect(boardService.saveBoard(board.id, "alice", { ...patch(board), title: "冲突覆盖" }))
        .rejects.toThrow(/已在其他位置修改/);
    });
  });

  it("deletes associations without touching other board IDs", async () => {
    const state = fixture();
    await runWithState(state, async () => {
      const first = await boardService.createBoard("alice", "a");
      const second = await boardService.createBoard("alice", "b");
      state.lessonCoursewares = [{ id: "lesson-1", teacherId: "alice", schoolId: "school-a", boardIds: [first.id, second.id] }] as LessonCourseware[];
      await boardService.deleteBoard(first.id, "alice");
      expect((state.lessonCoursewares as LessonCourseware[])[0].boardIds).toEqual([second.id]);
      expect((await boardService.listBoards("alice")).map((item) => item.id)).not.toContain(first.id);
      await expect(boardService.deleteBoard((await boardService.listBoards("alice"))[0].id, "alice")).rejects.toThrow();
    });
  });

  it("only exposes linked lesson boards to the owner or the published lesson's school", async () => {
    const state = fixture();
    await runWithState(state, async () => {
      const board = await boardService.createBoard("alice", "a");
      state.lessonCoursewares = [{ id: "lesson-1", teacherId: "alice", schoolId: "school-a", status: "draft",
        boardIds: [board.id] }] as LessonCourseware[];
      await expect(boardService.getLessonBoards("lesson-1", state.teachers[0])).resolves.toHaveLength(1);
      await expect(boardService.getLessonBoards("lesson-1", state.teachers[1])).rejects.toThrow(/无权/);
      (state.lessonCoursewares as LessonCourseware[])[0].status = "published";
      await expect(boardService.getLessonBoards("lesson-1", state.teachers[1])).resolves.toEqual([board]);
      await expect(boardService.getLessonBoards("lesson-1", {
        ...state.teachers[1], id: "foreign", schoolId: "school-other",
      })).rejects.toThrow(/无权/);
    });
  });

  it("segregates boards by subject and account", async () => {
    const state = fixture();
    await runWithState(state, async () => {
      const mathBoard = await boardService.createBoard("alice", "a");
      const bob = await boardService.listBoards("bob");
      expect(bob).toHaveLength(1);
      state.teachers[0].subject = "物理";
      state.teachers[0].affiliations[0].subject = "物理";
      expect(await boardService.listBoards("alice")).toHaveLength(1);
      state.teachers[0].subject = "数学";
      state.teachers[0].affiliations[0].subject = "数学";
      expect((await boardService.listBoards("alice")).map((item) => item.id)).toContain(mathBoard.id);
    });
  });
});
