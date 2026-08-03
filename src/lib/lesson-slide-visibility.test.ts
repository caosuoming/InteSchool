import { describe, expect, it } from "vitest";
import type { LessonSlide, LessonSlideElement } from "@/types";
import {
  getVisibleLessonSlideElements,
  mergeVisibleLessonSlideElements,
  STEM_ONLY_QUESTION_VISIBILITY,
} from "./lesson-slide-visibility";

const elements: LessonSlideElement[] = [
  {
    id: "stem-image",
    kind: "image",
    src: "/stem.png",
    x: 60,
    y: 10,
    width: 30,
    height: 30,
    questionSection: "stem",
  },
  {
    id: "answer-image",
    kind: "image",
    src: "/answer.png",
    x: 60,
    y: 50,
    width: 30,
    height: 30,
    questionSection: "answer",
  },
  {
    id: "teacher-note",
    kind: "text",
    content: "课堂提示",
    x: 5,
    y: 70,
    width: 30,
    height: 10,
  },
];

const slide: LessonSlide = {
  id: "slide-1",
  type: "question",
  title: "第 1 题",
  questionSnapshot: {
    stem: "题干",
    type: "essay",
    answer: "答案",
    analysis: "解析",
  },
  elements,
};

describe("lesson slide visibility", () => {
  it("keeps stem and teacher-added elements visible by default", () => {
    expect(getVisibleLessonSlideElements(slide, STEM_ONLY_QUESTION_VISIBILITY).map((item) => item.id))
      .toEqual(["stem-image", "teacher-note"]);
  });

  it("reveals floating images with their matching question section", () => {
    const visible = getVisibleLessonSlideElements(slide, {
      ...STEM_ONLY_QUESTION_VISIBILITY,
      answer: true,
    });

    expect(visible.map((item) => item.id)).toEqual([
      "stem-image",
      "answer-image",
      "teacher-note",
    ]);
  });

  it("merges edits without dropping hidden elements", () => {
    const visible = getVisibleLessonSlideElements(slide, STEM_ONLY_QUESTION_VISIBILITY);
    const moved = visible.map((item) => item.id === "stem-image" ? { ...item, x: 20 } : item);

    expect(mergeVisibleLessonSlideElements(elements, moved)).toEqual([
      expect.objectContaining({ id: "stem-image", x: 20 }),
      expect.objectContaining({ id: "answer-image", x: 60 }),
      expect.objectContaining({ id: "teacher-note", x: 5 }),
    ]);
  });
});
