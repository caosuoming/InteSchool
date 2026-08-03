import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LessonSlide } from "@/types";
import { LessonSlideContent } from "./LessonSlideContent";

const slide: LessonSlide = {
  id: "slide-question-1",
  type: "question",
  title: "课堂题目",
  questionId: "question-1",
  questionSnapshot: {
    stem: "题干内容",
    type: "short",
    answer: "参考答案",
    analysis: "详细解析",
    summary: "题目总结",
    board: "/api/files/board.png",
    links: [{ id: "link-1", name: "拓展链接", url: "https://example.com" }],
    explanationVideo: {
      materialId: "video-1",
      title: "视频讲解",
      fileUrl: "/api/files/video.mp4",
    },
  },
  relatedQuestionIds: [],
  askableStudentIds: [],
};

describe("LessonSlideContent", () => {
  it("shows links and video before revealing answer details", () => {
    render(<LessonSlideContent slide={slide} showAnswer={false} />);

    expect(screen.getByRole("link", { name: /拓展链接/ })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("视频讲解")).toBeInTheDocument();
    expect(screen.queryByText("参考答案")).not.toBeInTheDocument();
    expect(screen.queryByAltText("题目板书")).not.toBeInTheDocument();
  });

  it("shows summary and board with answer and analysis", () => {
    render(<LessonSlideContent slide={slide} showAnswer />);

    expect(screen.getAllByText("参考答案")).toHaveLength(2);
    expect(screen.getByText("详细解析")).toBeInTheDocument();
    expect(screen.getByText("题目总结")).toBeInTheDocument();
    expect(screen.getByAltText("题目板书")).toHaveAttribute("src", "/api/files/board.png");
  });
});
