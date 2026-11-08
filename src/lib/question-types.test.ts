import { describe, expect, it } from "vitest";
import { DEFAULT_QUESTION_TYPE_OPTIONS, ENGLISH_QUESTION_TYPE_OPTIONS, getDefaultQuestionTypeLabel, questionTypeOptionsForSubject } from "./question-types";

describe("subject-specific question types", () => {
  it("provides exactly the fourteen requested English question types in order", () => {
    expect(ENGLISH_QUESTION_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      "听力选择题", "听力填空", "单项选择", "阅读理解", "完形填空", "语法填空", "改错", "选词填空",
      "翻译", "完成句子", "单词拼写", "短文填空", "书面表达", "书信写作",
    ]);
    expect(new Set(ENGLISH_QUESTION_TYPE_OPTIONS.map((option) => option.value)).size).toBe(14);
    expect(questionTypeOptionsForSubject("英语")).toEqual(ENGLISH_QUESTION_TYPE_OPTIONS);
    expect(getDefaultQuestionTypeLabel("englishReading")).toBe("阅读理解");
  });

  it("does not replace the configured question types of other subjects", () => {
    expect(questionTypeOptionsForSubject("数学")).toEqual(DEFAULT_QUESTION_TYPE_OPTIONS);
    const custom = [{ value: "custom", label: "自定义" }];
    expect(questionTypeOptionsForSubject("物理", custom)).toEqual(custom);
  });
});
