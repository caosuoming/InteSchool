import { describe, expect, it } from "vitest";
import type { Question } from "../../src/types/index.js";
import type { AppState, TeacherRecord } from "../types.js";
import { computeDuplicateHash, runWithState } from "../runtime-db.js";
import { analyticsService } from "./analytics.js";

const teacher = { id: "teacher-1", schoolId: "school-1" } as TeacherRecord;
const timestamp = "2026-09-01T00:00:00.000Z";

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id, teacherId: "teacher-1", schoolId: "school-1", type: "single",
    stem: "计算 1+1", answer: "2", options: ["1", "2"], analysis: "",
    chapterIds: [], knowledgePointIds: [], difficulty: 3, recommendation: 3,
    usageCount: 0, remark: "", isShared: false,
    createdAt: timestamp, updatedAt: timestamp, ...overrides,
  };
}

describe("same-question status lookup", () => {
  it("matches normalized duplicates and legacy records while excluding unrelated or inaccessible questions", async () => {
    const primary = question("primary", {
      duplicateHash: computeDuplicateHash("计算 1+1", "2", ["1", "2"]),
    });
    const legacy = question("legacy", { stem: "计算1+1" });
    const otherTeacher = question("classmate", { teacherId: "teacher-2" });
    const otherAnswer = question("different", { answer: "3" });
    const otherSchool = question("outside", { schoolId: "school-2" });
    const unowned = question("unowned", { teacherId: "teacher-2", schoolId: "school-2" });
    const state = {
      teachers: [], currentTeacherId: null,
      questions: [primary, legacy, otherTeacher, otherAnswer, otherSchool, unowned],
    } as AppState;
    const result = await runWithState(state, () =>
      analyticsService.listSameQuestionIds(["primary", "unowned", "unknown"], teacher),
    );
    expect(result).toEqual({ primary: ["legacy", "classmate"] });
  });

  it("returns no duplicates for a unique or empty selection", async () => {
    const state = { teachers: [], currentTeacherId: null, questions: [question("only")] } as AppState;
    expect(await runWithState(state, () => analyticsService.listSameQuestionIds(["only"], teacher)))
      .toEqual({ only: [] });
    expect(await runWithState(state, () => analyticsService.listSameQuestionIds([], teacher)))
      .toEqual({});
  });
});
