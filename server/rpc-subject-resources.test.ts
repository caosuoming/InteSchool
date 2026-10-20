// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { DatabaseStore } from "./database.js";
import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import { invokeRpc } from "./rpc.js";

const teacher: TeacherRecord = {
  id: "teacher-1", email: "teacher@example.com", name: "Teacher", avatar: "",
  schoolId: "school-1", subject: "英语", subjects: ["数学", "英语"],
  status: "active", role: "teacher", roles: ["teacher"], subjectGroupIds: [], prepGroupIds: [],
  affiliations: [{ id: "aff-1", schoolId: "school-1", isCurrent: true,
    status: "active", subject: "英语", subjects: ["数学", "英语"] }],
  currentAffiliationId: "aff-1", createdAt: "2026-01-01T00:00:00Z",
};
const session: SessionUser = {
  userId: "user-1", teacherId: teacher.id, email: teacher.email,
  csrfToken: "csrf", expiresAt: "2099-01-01T00:00:00Z",
};

function fixture(): { state: AppState; store: DatabaseStore } {
  const state: AppState = {
    teachers: [structuredClone(teacher)], currentTeacherId: teacher.id,
    questions: [
      { id: "legacy", teacherId: teacher.id, schoolId: "school-1", type: "single", stem: "Math question",
        answer: "1", analysis: "", chapterIds: [], knowledgePointIds: [], createdAt: "2026-01-01T00:00:00Z" },
      { id: "english", teacherId: teacher.id, schoolId: "school-1", subject: "英语",
        type: "single", stem: "English question", answer: "a", analysis: "",
        chapterIds: [], knowledgePointIds: [], createdAt: "2026-01-02T00:00:00Z" },
    ],
    baskets: [
      { id: "math-basket", teacherId: teacher.id, name: "Math", questionIds: [], materialIds: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
      { id: "english-basket", teacherId: teacher.id, name: "English", subject: "英语", questionIds: [], materialIds: [], createdAt: "2026-01-02", updatedAt: "2026-01-02" },
    ],
    examPapers: [], lectures: [], coursewares: [], materials: [], resourceFolders: [],
    shareRecords: [], knowledgePoints: [], chapters: [], creditTransactions: [],
  };
  const store = { loadState: vi.fn(() => state), saveState: vi.fn() } as unknown as DatabaseStore;
  return { state, store };
}

describe("subject scoped RPC", () => {
  it("scopes personal question lists and pagination on the server", async () => {
    const { state, store } = fixture();
    expect((await invokeRpc(store, session, "question", "listQuestions", [{}]) as Array<{ id: string }>).map((q) => q.id))
      .toEqual(["english"]);
    const page = await invokeRpc(store, session, "question", "listQuestionPage", [{}, 1, 20, "newest", null]) as {
      items: Array<{ id: string }>; total: number;
    };
    expect(page.total).toBe(1);
    expect(page.items.map((q) => q.id)).toEqual(["english"]);
    state.teachers[0].affiliations[0].subject = "数学";
    state.teachers[0].subject = "数学";
    const other = await invokeRpc(store, session, "question", "listQuestionPage", [{}, 1, 20, "newest", null]) as {
      items: Array<{ id: string }>; total: number;
    };
    expect(other.total).toBe(1);
    expect(other.items.map((q) => q.id)).toEqual(["legacy"]);
  });

  it("scopes baskets and persists the active subject on newly created records", async () => {
    const { state, store } = fixture();
    expect((await invokeRpc(store, session, "basket", "listBaskets", [teacher.id]) as Array<{ id: string }>).map((item) => item.id))
      .toEqual(["english-basket"]);
    const created = (await invokeRpc(store, session, "basket", "createBasket", [teacher.id, "New English"])) as { id: string; subject: string };
    expect(created.subject).toBe("英语");
    expect((state.baskets as Array<{ id: string; subject: string }>).find((item) => item.id === created.id)?.subject).toBe("英语");
    state.teachers[0].affiliations[0].subject = "数学";
    state.teachers[0].subject = "数学";
    expect((await invokeRpc(store, session, "basket", "listBaskets", [teacher.id]) as Array<{ id: string }>).map((item) => item.id))
      .toEqual(["math-basket"]);
  });
});
