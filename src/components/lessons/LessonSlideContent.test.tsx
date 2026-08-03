import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    options: ["选项 A", "选项 B"],
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
  it("renders formulas in an imported PPT page title and body", () => {
    const pptSlide: LessonSlide = {
      id: "slide-ppt-1",
      type: "knowledge",
      title: "数列 $a_n$",
      content: "通项为 $a_n=(-1)^n$。",
      pptSlideNumber: 1,
    };

    const { container } = render(<LessonSlideContent slide={pptSlide} />);

    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector('[data-latex="a_n"]')).not.toBeNull();
    expect(container.querySelector('[data-latex="a_n=(-1)^n"]')).not.toBeNull();
  });

  it("shows only the full question stem by default", () => {
    render(<LessonSlideContent slide={slide} />);

    expect(screen.getByText("题干内容")).toBeInTheDocument();
    expect(screen.queryByText("课堂题目")).not.toBeInTheDocument();
    expect(screen.queryByText("选项 A")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /拓展链接/ })).not.toBeInTheDocument();
    expect(screen.queryByText("参考答案")).not.toBeInTheDocument();
    expect(screen.queryByText("详细解析")).not.toBeInTheDocument();
  });

  it("reveals options and supplementary resources independently", () => {
    render(
      <LessonSlideContent
        slide={slide}
        questionVisibility={{ options: true, supplementary: true }}
      />,
    );

    expect(screen.getByText("选项 A")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /拓展链接/ })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByText("视频讲解")).toBeInTheDocument();
    expect(screen.queryByText("参考答案")).not.toBeInTheDocument();
  });

  it("reveals answer, analysis, summary, and board on demand", () => {
    render(
      <LessonSlideContent
        slide={slide}
        questionVisibility={{ answer: true, analysis: true }}
      />,
    );

    expect(screen.getAllByText("参考答案")).toHaveLength(2);
    expect(screen.getByText("详细解析")).toBeInTheDocument();
    expect(screen.getByText("题目总结")).toBeInTheDocument();
    expect(screen.getByAltText("题目板书")).toHaveAttribute("src", "/api/files/board.png");
  });

  it("supports selecting and resizing built-in question text in editor mode", async () => {
    const user = userEvent.setup();
    const onSelectTextRegion = vi.fn();
    render(
      <LessonSlideContent
        slide={{ ...slide, textStyles: { stem: { fontSize: 30 } } }}
        questionVisibility={{ options: true }}
        editable
        selectedTextRegion="stem"
        onSelectTextRegion={onSelectTextRegion}
      />,
    );

    const stem = screen.getByText("题干内容").parentElement;
    expect(stem).toHaveStyle({ fontSize: "30px" });
    expect(stem).toHaveClass("select-text");
    expect(screen.getByText("选项 A")).toBeInTheDocument();

    await user.click(screen.getByText("题干内容"));
    expect(onSelectTextRegion).toHaveBeenCalledWith("stem");
  });
});
