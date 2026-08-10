// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Question } from "../src/types/index.js";
import type { AppState, SessionUser, TeacherRecord } from "./types.js";
import type { DatabaseStore } from "./database.js";
import { invokeRpc } from "./rpc.js";

function testState(): AppState {
  const teacher = {
    id: "teacher-1",
    schoolId: "school-1",
    role: "teacher",
  } as TeacherRecord;
  const question = {
    id: "question-1",
    teacherId: teacher.id,
    schoolId: teacher.schoolId,
    type: "short",
    stem: "1 + 1 = ?",
    answer: "2",
    analysis: "",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 1,
    recommendation: 1,
    usageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as Question;
  return {
    teachers: [teacher],
    questions: [question],
    examPublications: [],
    currentTeacherId: teacher.id,
  } as AppState;
}

function testSession(): SessionUser {
  return {
    userId: "user-1",
    teacherId: "teacher-1",
    email: "teacher@example.com",
    csrfToken: "csrf",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

describe("RPC state persistence", () => {
  it("does not clone and persist the full state for read-only calls", async () => {
    const state = testState();
    const store = {
      loadState: vi.fn(() => state),
      saveState: vi.fn(),
    } as unknown as DatabaseStore;

    const result = await invokeRpc(store, testSession(), "question", "listQuestions", [{}]);

    expect(result).toHaveLength(1);
    expect(store.loadState).toHaveBeenCalledTimes(1);
    expect(store.saveState).not.toHaveBeenCalled();
  });

  it("keeps serialized persistence for mutating calls", async () => {
    const state = testState();
    const store = {
      loadState: vi.fn(() => state),
      saveState: vi.fn(),
    } as unknown as DatabaseStore;

    await invokeRpc(store, testSession(), "question", "incrementUsage", ["question-1"]);

    expect(store.loadState).toHaveBeenCalledTimes(1);
    expect(store.saveState).toHaveBeenCalledTimes(1);
  });

  it("keeps persistence for read-prefixed methods that mutate state", async () => {
    const state = testState();
    const question = state.questions[0] as Question;
    question.hiddenByExamIds = ["publication-1"];
    state.examPublications = [{
      id: "publication-1",
      schoolId: "school-1",
      status: "active",
      unlockAt: "2020-01-01T00:00:00.000Z",
    }] as AppState["examPublications"];
    const store = {
      loadState: vi.fn(() => state),
      saveState: vi.fn(),
    } as unknown as DatabaseStore;

    await invokeRpc(store, testSession(), "examPublish", "checkExpiry", []);

    expect(store.saveState).toHaveBeenCalledTimes(1);
  });
});
