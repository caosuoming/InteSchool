import { describe, expect, it } from "vitest";
import type { Question } from "../../src/types/index.js";
import type { AppState } from "../types.js";
import type { TeacherRecord } from "../types.js";
import { runWithState } from "../runtime-db.js";
import { questionService } from "./question.js";

const now = "2026-07-30T10:00:00.000Z";

function question(id: string, overrides: Partial<Question>): Question {
  return {
    id,
    teacherId: "teacher-1",
    schoolId: "school-1",
    type: "single",
    stem: "默认题干",
    options: ["A", "B"],
    answer: "默认答案",
    analysis: "默认解析",
    summary: "默认总结",
    chapterIds: [],
    knowledgePointIds: [],
    difficulty: 2,
    recommendation: 3,
    usageCount: 0,
    remark: "",
    remarks: [],
    isShared: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function state(questions: Question[]): AppState {
  return {
    teachers: [],
    currentTeacherId: null,
    questions,
  };
}

describe("question keyword search", () => {
  it("searches summary when no field is selected", async () => {
    const questions = [
      question("summary-match", { summary: "用配方法求最值" }),
      question("no-match", { summary: "使用判别式" }),
    ];

    await runWithState(state(questions), async () => {
      const result = await questionService.listQuestions({ keyword: "配方法" });
      expect(result.map((item) => item.id)).toEqual(["summary-match"]);
    });
  });

  it("limits matching to selected fields", async () => {
    const questions = [
      question("stem-match", { stem: "关键词只在题干", analysis: "其他内容" }),
      question("analysis-match", { stem: "其他内容", analysis: "关键词只在解析" }),
    ];

    await runWithState(state(questions), async () => {
      const result = await questionService.listQuestions({
        keyword: "关键词",
        searchFields: ["analysis"],
      });
      expect(result.map((item) => item.id)).toEqual(["analysis-match"]);
    });
  });

  it("searches both legacy and structured remarks", async () => {
    const questions = [
      question("legacy-remark", { remark: "适合课堂例题" }),
      question("structured-remark", {
        remarks: [{
          id: "remark-1",
          content: "学生容易漏写定义域",
          createdAt: now,
          updatedAt: now,
        }],
      }),
    ];

    await runWithState(state(questions), async () => {
      const legacy = await questionService.listQuestions({
        keyword: "课堂例题",
        searchFields: ["remark"],
      });
      const structured = await questionService.listQuestions({
        keyword: "定义域",
        searchFields: ["remark"],
      });
      expect(legacy.map((item) => item.id)).toEqual(["legacy-remark"]);
      expect(structured.map((item) => item.id)).toEqual(["structured-remark"]);
    });
  });
});

describe("question pagination", () => {
  it("filters visibility before counting, sorts, and returns only the requested page", async () => {
    const questions = [
      question("owned-low", { teacherId: "teacher-1", usageCount: 2 }),
      question("owned-high", { teacherId: "teacher-1", usageCount: 9 }),
      question("shared", { teacherId: "teacher-2", isShared: true, usageCount: 5 }),
      question("private-other", { teacherId: "teacher-2", isShared: false, usageCount: 99 }),
    ];
    const teacher = { id: "teacher-1", schoolId: "school-1" } as TeacherRecord;

    await runWithState(state(questions), async () => {
      const result = await questionService.listQuestionPage(
        { schoolId: "school-1" },
        2,
        1,
        "usage",
        teacher,
      );

      expect(result.total).toBe(3);
      expect(result.items.map((item) => item.id)).toEqual(["shared"]);
    });
  });
});
