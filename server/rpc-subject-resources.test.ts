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
  it("never mixes same-school chemistry resources into the mathematics library", async () => {
    const { state, store } = fixture();
    const common = { teacherId: teacher.id, schoolId: "school-1", chapterIds: [], knowledgePointIds: [],
      grade: "高一", schoolYear: "2026-2027", createdAt: "2026-11-01", updatedAt: "2026-11-01" };
    const fromOtherTeacher = { ...common, teacherId: "teacher-chemistry" };
    const records = [
      { ...common, id: "math", title: "数学资料", subject: "数学" },
      { ...common, id: "chemistry", title: "化学资料", subject: "化学" },
      { ...fromOtherTeacher, id: "other-chemistry", title: "其他教师的化学资料", subject: "化学" },
    ];
    state.materials = records.map((record) => ({ ...record, type: "text", content: "", tags: [] }));
    state.coursewares = records.map((record) => ({ ...record, type: "ppt", content: "", tags: [] }));
    state.lectures = records.map((record) => ({ ...record, sections: [], classIds: [], studentIds: [], status: "draft", version: 1 }));
    state.examPapers = records.map((record) => ({ ...record, questions: [], status: "draft", duration: 90, totalScore: 100 }));
    state.teachers[0].subject = "数学";
    state.teachers[0].affiliations[0].subject = "数学";

    for (const [service, method] of [
      ["material", "listMaterials"], ["courseware", "listCoursewares"],
      ["lecture", "listLectures"], ["examPaper", "listPapers"],
    ] as const) {
      const result = await invokeRpc(store, session, service, method, [{ schoolId: "school-1" }]) as Array<{ id: string }>;
      expect(result.map((resource) => resource.id), `${service} should only show mathematics`).toEqual(["math"]);
    }
  });

  it("retains chemistry uploads after switching to mathematics and back", async () => {
    const { state, store } = fixture();
    state.teachers[0].subject = "化学";
    state.teachers[0].affiliations[0].subject = "化学";
    const created = await invokeRpc(store, session, "material", "createMaterial", [teacher.id, "school-1", {
      title: "化学讲义附件", chapterIds: [], knowledgePointIds: [], grade: "高一", schoolYear: "2026-2027",
      type: "text", content: "化学", tags: [],
    }]) as { id: string; subject: string };
    expect(created.subject).toBe("化学");
    state.teachers[0].subject = "数学";
    state.teachers[0].affiliations[0].subject = "数学";
    expect(await invokeRpc(store, session, "material", "listMaterials", [{ teacherId: teacher.id }])).toEqual([]);
    state.teachers[0].subject = "化学";
    state.teachers[0].affiliations[0].subject = "化学";
    const restored = await invokeRpc(store, session, "material", "listMaterials", [{ teacherId: teacher.id }]) as Array<{ id: string }>;
    expect(restored.map((resource) => resource.id)).toEqual([created.id]);
  });
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

  it("includes the user's other-school questions on the first page without exposing another user's", async () => {
    const { state, store } = fixture();
    (state.questions as Array<Record<string, unknown>>).push(
      { id: "other-school", teacherId: teacher.id, schoolId: "school-2", subject: "数学",
        type: "single", stem: "Other school", answer: "2", analysis: "",
        chapterIds: [], knowledgePointIds: [], createdAt: "2026-01-03T00:00:00Z" },
      { id: "foreign", teacherId: "teacher-2", schoolId: "school-2", subject: "数学",
        type: "single", stem: "Private", answer: "3", analysis: "",
        chapterIds: [], knowledgePointIds: [], createdAt: "2026-01-04T00:00:00Z" },
    );
    const filter = { teacherId: teacher.id };
    const page = await invokeRpc(store, session, "question", "listQuestionPage",
      [filter, 1, 20, "newest", null]) as { items: Array<{ id: string }>; total: number };
    expect(page.total).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual(["other-school", "english"]);
    const listed = await invokeRpc(store, session, "question", "listQuestions", [filter]) as Array<{ id: string }>;
    expect(listed.map((item) => item.id)).toEqual(["english", "other-school"]);
    const referenced = await invokeRpc(store, session, "question", "listQuestions", [{
      ids: ["other-school", "foreign"],
    }]) as Array<{ id: string }>;
    expect(referenced.map((item) => item.id)).toEqual(["other-school"]);

    // A different school context must retain ownership while preserving same-school subject filters.
    state.teachers[0].schoolId = "school-2";
    state.teachers[0].subject = "数学";
    state.teachers[0].affiliations = [{
      id: "aff-2", schoolId: "school-2", subject: "数学", isCurrent: true, status: "active",
      subjects: ["数学", "英语"],
    }];
    state.teachers[0].currentAffiliationId = "aff-2";
    const afterSwitch = await invokeRpc(store, session, "question", "listQuestionPage",
      [filter, 1, 20, "newest", null]) as { items: Array<{ id: string }>; total: number };
    expect(afterSwitch.total).toBe(3);
    expect(afterSwitch.items.map((item) => item.id)).toEqual(["other-school", "english", "legacy"]);
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
