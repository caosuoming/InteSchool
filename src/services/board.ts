import { rpcCall } from "./api";
import type { BoardDocument } from "@/types";

export const boardService = {
  listBoards: (teacherId: string) => rpcCall<BoardDocument[]>("board", "listBoards", [teacherId]),
  getBoard: (id: string, teacherId: string) => rpcCall<BoardDocument>("board", "getBoard", [id, teacherId]),
  getLessonBoards: (coursewareId: string) => rpcCall<BoardDocument[]>("board", "getLessonBoards", [coursewareId, null]),
  createBoard: (teacherId: string, sourceNodeId: string, chapterId?: string) => rpcCall<BoardDocument>("board", "createBoard", [teacherId, sourceNodeId, chapterId]),
  saveBoard: (board: BoardDocument) => rpcCall<BoardDocument>("board", "saveBoard", [board.id, board.teacherId, {
    title: board.title,
    chapterId: board.chapterId ?? null,
    nodes: board.nodes,
    edges: board.edges,
    expectedUpdatedAt: board.updatedAt,
  }]),
  deleteBoard: (id: string, teacherId: string) => rpcCall<void>("board", "deleteBoard", [id, teacherId]),
};
