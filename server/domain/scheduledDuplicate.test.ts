import { describe, expect, it } from "vitest";
import type { AppState } from "../types.js";
import type { AnswerRecord, Question } from "../../src/types/index.js";
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
      expect(candidate).toMatchObject({ leftStem: data.questions && (data.questions as Question[])[0].stem, rightQuestionId: "b" });
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
      await scheduledDuplicateService.resolveCandidate("teacher", candidate.id, "merge");
      expect((data.questions as Question[]).map((q) => q.id)).toEqual(["mine"]);
      expect((data.answerRecords as AnswerRecord[])[0].questionId).toBe("mine");
      expect((data.baskets as Array<{ questionIds: string[] }>)[0].questionIds).toEqual(["mine"]);
      expect((data.lectures as Array<{ sections: Array<{ questionId: string }> }>)[0].sections[0].questionId).toBe("mine");
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
