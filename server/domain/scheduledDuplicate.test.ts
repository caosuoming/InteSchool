import { describe, expect, it } from "vitest";
import type { AppState, SessionUser } from "../types.js";
import type { DatabaseStore } from "../database.js";
import { invokeRpc } from "../rpc.js";
import type { AnswerRecord, Question, ExamPaper, Lecture } from "../../src/types/index.js";
import { runWithState } from "../runtime-db.js";
import { nextExecution, runDueDuplicateSchedules, scheduledDuplicateService } from "./scheduledDuplicate.js";

const question = (id: string, stem: string, teacherId = "teacher") => ({
  id, stem, teacherId, schoolId: "school", type: "singleChoice", options: [], answer: "A",
  analysis: "", chapterIds: [], knowledgePointIds: [], difficulty: 3, recommendation: 3,
  usageCount: 0, remark: "", isShared: false, createdAt: "2026-11-18T00:00:00.000Z",
  updatedAt: "2026-11-18T00:00:00.000Z",
}) as Question;
const record = (id: string, questionId: string): AnswerRecord => ({
  id, questionId, studentId: "student", lectureId: "exam", isCorrect: false,
  score: "wrong", answeredAt: "2026-11-18T00:00:00.000Z",
});
const state = (questions: Question[] = []): AppState => ({
  teachers: [{ id: "teacher", schoolId: "school" }, { id: "other", schoolId: "school" }],
  currentTeacherId: "teacher", questions, students: [{ id: "student", classId: "class", schoolId: "school" }],
  schoolClasses: [{ id: "class", schoolId: "school" }], personalClasses: [], answerRecords: [],
  examPapers: [], lectures: [], baskets: [], questionReferences: [], shareRecords: [],
  duplicateSchedules: [], duplicateCandidates: [], duplicateCheckedPairs: [],
}) as unknown as AppState;

async function makeTask(kind: "library" | "student") {
  return scheduledDuplicateService.createSchedule("teacher", kind, "once", "2099-11-18T12:00:00.000Z");
}

describe("scheduled duplicate scan", () => {
  it("finds same-library pairs only once and retains keep decisions", async () => {
    const data = state([question("a", "一元二次方程的求根公式是什么？"), question("b", "一元二次方程的求根公式是什么？"), question("c", "另一道题")]);
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      expect(candidate).toMatchObject({ leftQuestion: { stem: (data.questions as Question[])[0].stem }, rightQuestionId: "b" });
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "keep");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(0);
      expect(await scheduledDuplicateService.listCandidates("teacher")).toHaveLength(0);
    });
  });

  it("links another teacher's answered question and preserves the score", async () => {
    const data = state([question("mine", "求解方程 x² + 3x + 2 = 0"), question("other", "求解方程 x² + 3x + 2 = 0", "other")]);
    data.answerRecords = [record("r", "other")];
    await runWithState(data, async () => {
      const task = await makeTask("student");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      expect(candidate.studentCount).toBe(1);
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "same");
      const [left, right] = data.questions as Question[];
      expect(left.sameQuestionGroupId).toBe(right.sameQuestionGroupId);
      expect((data.answerRecords as AnswerRecord[])[0].score).toBe("wrong");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(0);
    });
  });

  it("recognizes an exam-only item without overwriting student scores", async () => {
    const data = state([question("mine", "已知 x = 2，求 x² 的值")]);
    data.examPapers = [{ id: "paper", teacherId: "other", schoolId: "school", chapterIds: [],
      knowledgePointIds: [], grade: "8", createdAt: "2026-11-18T00:00:00.000Z", updatedAt: "2026-11-18T00:00:00.000Z",
      questions: [{ id: "item", stem: "已知 x = 2，求 x² 的值", type: "singleChoice", answer: "4", analysis: "", score: 2 }] }];
    data.answerRecords = [record("r", "exam-item:paper:item")];
    await runWithState(data, async () => {
      const task = await makeTask("student");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "same");
      expect((data.answerRecords as AnswerRecord[])[0]).toMatchObject({ questionId: "mine", score: "wrong" });
    });
  });

  it("merges a library duplicate while maintaining lecture, basket, and answer references", async () => {
    const data = state([question("mine", "设函数 f(x)=x²，求其导函数"), question("duplicate", "设函数 f(x)=x²，求其导函数")]);
    data.answerRecords = [record("r", "duplicate")];
    data.baskets = [{ id: "basket", questionIds: ["duplicate"] }];
    data.lectures = [{ id: "lecture", sections: [{ questionId: "duplicate" }] }];
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "merge", {
        stem: "existing", answer: "existing", analysis: "existing", summary: "existing",
      });
      expect((data.questions as Question[]).map((q) => q.id)).toEqual(["mine"]);
      expect((data.answerRecords as AnswerRecord[])[0].questionId).toBe("mine");
      expect((data.baskets as Array<{ questionIds: string[] }>)[0].questionIds).toEqual(["mine"]);
      expect((data.lectures as Array<{ sections: Array<{ questionId: string }> }>)[0].sections[0].questionId).toBe("mine");
    });
  });

  it("shows choices, details and source documents, then synchronizes both source documents on merge", async () => {
    const first = { ...question("left", "求解方程 $x^2=4$"), options: ["2", "-2"], answer: "A",
      analysis: "左解析", summary: "左总结", sourceDocId: "doc-left" };
    const second = { ...question("right", "求解方程 $x^2=4$"), options: ["1", "2"], answer: "B",
      analysis: "右解析", summary: "右总结", sourceDocId: "doc-right" };
    const data = state([first, second]);
    data.documents = [
      { id: "doc-left", teacherId: "teacher", schoolId: "school", fileName: "原题一.docx", sections: [], status: "confirmed", fileSize: 1, fileType: "word", createdAt: first.createdAt },
      { id: "doc-right", teacherId: "teacher", schoolId: "school", fileName: "原题二.pdf", sections: [], status: "confirmed", fileSize: 1, fileType: "pdf", createdAt: first.createdAt },
    ];
    data.examPapers = [
      { id: "paper-left", teacherId: "teacher", title: "试卷一", questions: [
        { id: "item-left", questionId: "left", stem: first.stem, options: first.options, answer: first.answer, analysis: first.analysis, type: "singleChoice", score: 2 },
      ], contentBlocks: [{ id: "block-left", type: "question", questionId: "left", content: first.stem }] },
      { id: "paper-right", teacherId: "teacher", title: "试卷二", questions: [
        { id: "item-right", questionId: "right", stem: second.stem, options: second.options, answer: second.answer, analysis: second.analysis, type: "singleChoice", score: 2 },
        { id: "other", stem: "另一道题", answer: "", analysis: "", type: "short", score: 2 },
      ], contentBlocks: [{ id: "block-right", type: "question", questionId: "right", content: second.stem }] },
    ] as unknown as AppState["examPapers"];
    data.lectures = [{
      id: "lecture", teacherId: "teacher", title: "讲义二",
      sections: [{ id: "section", type: "question", questionId: "right", content: second.stem, children: [] }],
      contentBlocks: [{ id: "lecture-block", type: "question", questionId: "right", content: second.stem }],
    }] as unknown as AppState["lectures"];
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      expect(candidate.leftQuestion).toMatchObject({ options: ["2", "-2"], answer: "A", analysis: "左解析", summary: "左总结" });
      expect(candidate.rightQuestion).toMatchObject({ options: ["1", "2"], answer: "B", analysis: "右解析", summary: "右总结" });
      expect(candidate.leftQuestion?.sources).toEqual(expect.arrayContaining(["文档：原题一.docx", "试卷：试卷一"]));
      expect(candidate.rightQuestion?.sources).toEqual(expect.arrayContaining(["文档：原题二.pdf", "试卷：试卷二", "讲义：讲义二"]));
      await expect(scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "merge")).rejects.toThrow("选择");
      expect(data.questions).toHaveLength(2);
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "merge", {
        stem: "incoming", answer: "both", analysis: "existing", summary: "both",
      });
      expect(data.questions).toHaveLength(1);
      const merged = (data.questions as Question[])[0];
      expect(merged).toMatchObject({
        id: "left", stem: second.stem, options: second.options,
        answer: "A\n\n答案2：B", analysis: "左解析",
        summary: "左总结\n\n总结2：右总结",
      });
      expect(merged.sourceDocIds).toEqual(["doc-left", "doc-right"]);
      const papers = data.examPapers as ExamPaper[];
      const lectures = data.lectures as Lecture[];
      for (const paper of papers) {
        for (const item of paper.questions.filter((item) => item.questionId)) {
          expect(item).toMatchObject({
            questionId: "left", stem: merged.stem, options: merged.options,
            answer: merged.answer, analysis: merged.analysis,
          });
        }
        expect(paper.contentBlocks?.[0]).toMatchObject({ questionId: "left", content: merged.stem });
      }
      expect(papers[1].questions[1].stem).toBe("另一道题");
      expect(lectures[0].sections[0]).toMatchObject({ questionId: "left", content: merged.stem });
      expect(lectures[0].contentBlocks?.[0]).toMatchObject({ questionId: "left", content: merged.stem });
      expect(await scheduledDuplicateService.listCandidates("teacher")).toHaveLength(0);
    });
  });

  it("includes personally taught students and copies their exam item into the teacher's bank", async () => {
    const data = state([question("mine", "这道函数题怎样计算最终结果？")]);
    data.schoolClasses = [];
    data.personalClasses = [{ id: "personal", teacherId: "teacher", studentIds: ["student"] }];
    data.examPapers = [{ id: "paper", teacherId: "other", schoolId: "school", chapterIds: [], knowledgePointIds: [],
      grade: "8", createdAt: "2026-11-18T00:00:00.000Z", updatedAt: "2026-11-18T00:00:00.000Z",
      questions: [{ id: "item", stem: "这道函数题怎样计算最终结果？", type: "singleChoice", answer: "4", analysis: "", score: 2 }] }];
    data.answerRecords = [record("r", "exam-item:paper:item")];
    await runWithState(data, async () => {
      const task = await makeTask("student");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "add");
      const copy = (data.questions as Question[]).find((q) => q.id !== "mine");
      expect(copy?.teacherId).toBe("teacher");
      expect(copy?.duplicateHash).toBeTruthy();
      expect((data.answerRecords as AnswerRecord[])[0]).toMatchObject({ questionId: copy?.id, score: "wrong" });
    });
  });

  it("keeps confirmed pairs but rediscovers cancelled pairs on the next scan", async () => {
    const data = state([
      question("a", "第一道题：一元二次方程的求根公式是什么？"),
      question("b", "第一道题：一元二次方程的求根公式是什么？"),
      question("c", "第二道题：计算三个数的算术平均值是多少？"),
      question("d", "第二道题：计算三个数的算术平均值是多少？"),
    ]);
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(2);
      const initial = await scheduledDuplicateService.listCandidates("teacher");
      expect(initial).toHaveLength(2);
      await scheduledDuplicateService.resolveCandidate("teacher", initial[0].id, "keep");
      expect(await scheduledDuplicateService.cancelPendingCandidates("teacher")).toBe(1);
      expect(await scheduledDuplicateService.cancelPendingCandidates("teacher")).toBe(0);
      expect(await scheduledDuplicateService.listCandidates("teacher")).toHaveLength(0);
      expect((data.duplicateCheckedPairs as unknown[])).toHaveLength(1);
      expect((data.duplicateCandidates as Array<{ status: string }>).map((item) => item.status))
        .toEqual(expect.arrayContaining(["keep", "cancelled"]));
      await expect(scheduledDuplicateService.resolveCandidate("teacher", initial[1].id, "keep"))
        .rejects.toThrow("待处理题目不存在");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [rediscovered] = await scheduledDuplicateService.listCandidates("teacher");
      expect(rediscovered.id).not.toBe(initial[1].id);
      expect([rediscovered.leftQuestionId, rediscovered.rightQuestionId].sort())
        .toEqual([initial[1].leftQuestionId, initial[1].rightQuestionId].sort());
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(0);
      await scheduledDuplicateService.resolveCandidate("teacher", rediscovered.id, "keep");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(0);
    });
  });

  it("rejects cancelling another teacher's pending reviews via RPC", async () => {
    const data = state();
    const store = { loadState: () => data, saveState: () => undefined } as unknown as DatabaseStore;
    const session: SessionUser = {
      userId: "user", teacherId: "teacher", email: "teacher@example.com",
      csrfToken: "token", expiresAt: "2099-01-01T00:00:00.000Z",
    };
    await expect(invokeRpc(store, session, "scheduledDuplicate", "cancelPendingCandidates", ["other"]))
      .rejects.toThrow("无权以其他教师身份执行操作");
  });

  it("sorts pending duplicates by descending similarity without mixing teachers", async () => {
    const data = state([question("a", "题目 A"), question("b", "题目 B")]);
    const makeCandidate = (id: string, similarity: number, teacherId = "teacher") => ({
      id, teacherId, scheduleId: "schedule", kind: "library" as const,
      leftQuestionId: "a", rightQuestionId: "b", similarity, status: "pending" as const,
      createdAt: "2026-11-18T00:00:00.000Z",
    });
    data.duplicateCandidates = [
      makeCandidate("low", 0.83), makeCandidate("other", 0.99, "other"),
      makeCandidate("top", 0.99), makeCandidate("medium", 0.92),
    ];
    await runWithState(data, async () => {
      expect((await scheduledDuplicateService.listCandidates("teacher")).map((item) => item.id))
        .toEqual(["top", "medium", "low"]);
      expect(await scheduledDuplicateService.cancelPendingCandidates("teacher")).toBe(3);
      expect((data.duplicateCandidates as Array<{ id: string; status: string }>).find((item) => item.id === "other")?.status)
        .toBe("pending");
    });
  });

  it("allows student duplicate candidates to be rediscovered after cancellation", async () => {
    const data = state([question("mine", "求解一元二次方程的根是多少？"), question("external", "求解一元二次方程的根是多少？", "other")]);
    data.answerRecords = [record("r", "external")];
    await runWithState(data, async () => {
      const task = await makeTask("student");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      expect(await scheduledDuplicateService.cancelPendingCandidates("teacher")).toBe(1);
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      expect(candidate.rightQuestionId).toBe("external");
    });
  });
  it("executes one-time schedules when due and respects UTC weekend cadence", async () => {
    const data = state();
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(runDueDuplicateSchedules(new Date("2099-11-18T11:59:59.000Z"))).toBe(0);
      expect(runDueDuplicateSchedules(new Date("2099-11-18T12:00:00.000Z"))).toBe(1);
      expect((data.duplicateSchedules as Array<{ enabled: boolean }>)[0].enabled).toBe(false);
      await expect(scheduledDuplicateService.runSchedule("other", task.id)).rejects.toThrow();
    });
    expect(nextExecution(new Date("2026-11-20T12:00:00.000Z"), "weekend")).toBe("2026-11-21T12:00:00.000Z");
  });
});


describe("scheduled choice duplicate scoring", () => {
  it("uses options for the displayed similarity percentage and filters unrelated choices", async () => {
    const stem = "观察下列数据，选择正确的结论";
    const data = state([
      { ...question("a", stem), options: ["甲", "乙", "丙", "丁"] },
      { ...question("b", stem), options: ["丁", "丙", "乙", "甲"] },
      { ...question("c", stem), options: ["戊", "己", "庚", "辛"] },
    ]);
    await runWithState(data, async () => {
      const task = await makeTask("library");
      expect(await scheduledDuplicateService.runSchedule("teacher", task.id)).toBe(1);
      const [candidate] = await scheduledDuplicateService.listCandidates("teacher");
      expect(candidate.rightQuestionId).toBe("b");
      expect(candidate.similarity).toBe(1);
    });
  });
});
