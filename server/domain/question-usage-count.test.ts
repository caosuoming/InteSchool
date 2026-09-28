import { describe, expect, it } from "vitest";
import type { Question } from "../../src/types/index.js";
import { db, runWithState } from "../runtime-db.js";
import type { AppState, TeacherRecord } from "../types.js";
import { questionService } from "./question.js";

const now = "2026-09-28T12:00:00.000Z";

function question(id: string, usageCount: number): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: id,
    options: ["A", "B"],
    answer: "A",
    analysis: "",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 1,
    recommendation: 3,
    usageCount,
    remark: "",
    isShared: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("question usage counts", () => {
  it("counts current referencing documents once each and drops removed references", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      questions: [question("question-1", 99)],
      lectures: [{
        id: "lecture-1",
        sections: [{
          id: "section-1",
          type: "question",
          title: "题目",
          content: "",
          questionId: "question-1",
          children: [{
            id: "section-2",
            type: "question",
            title: "重复引用",
            content: "",
            questionId: "question-1",
            children: [],
          }],
        }],
      }],
      examPapers: [{
        id: "paper-1",
        questions: [
          { id: "paper-question-1", questionId: "question-1" },
          { id: "paper-question-2", questionId: "question-1" },
        ],
      }],
    };

    await runWithState(state, async () => {
      await expect(questionService.getQuestion("question-1")).resolves.toEqual(
        expect.objectContaining({ usageCount: 2 }),
      );

      db.update("examPapers", () => []);
      await expect(questionService.getQuestion("question-1")).resolves.toEqual(
        expect.objectContaining({ usageCount: 1 }),
      );

      db.update("lectures", () => []);
      await expect(questionService.getQuestion("question-1")).resolves.toEqual(
        expect.objectContaining({ usageCount: 0 }),
      );
    });
  });

  it("sorts by the current reference count instead of a stale stored value", async () => {
    const state: AppState = {
      teachers: [],
      currentTeacherId: null,
      questions: [
        question("stale-high", 50),
        question("currently-used", 0),
      ],
      lectures: [],
      examPapers: [{
        id: "paper-1",
        questions: [{ id: "paper-question-1", questionId: "currently-used" }],
      }],
    };

    await runWithState(state, async () => {
      const page = await questionService.listQuestionPage(
        {},
        1,
        20,
        "usage",
        { id: "teacher-1" } as TeacherRecord,
      );

      expect(page.items.map((item) => [item.id, item.usageCount])).toEqual([
        ["currently-used", 1],
        ["stale-high", 0],
      ]);
    });
  });
});
