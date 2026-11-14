import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuestionExpandedDetails } from "@/components/question/QuestionExpandedDetails";

describe("QuestionExpandedDetails", () => {
  it("displays the geography answer and analysis with the grouped stem's numbers", () => {
    const { container } = render(<QuestionExpandedDetails question={{
      id: "geography-1", type: "single", subject: "地理",
      stem: "阅读材料\n1. 第一题\n2. 第二题\n3. 第三题",
      answer: "（7）B\n（8）D\n（9）B",
      analysis: "（7）温度\n（8）洋流\n（9）地形",
    }} />);
    expect(container.querySelector(".question-answer-content")).toHaveTextContent("1. B 2. D 3. B");
    expect(screen.getByText(/1\. 温度/)).toHaveTextContent("1. 温度 2. 洋流 3. 地形");
  });
  it("renders the question summary after answer and analysis", () => {
    render(
      <QuestionExpandedDetails
        question={{
          id: "question-123",
          answer: "A",
          analysis: "逐步解析",
          summary: "考查二次函数的顶点性质",
          board: "/api/files/board.png",
          links: [{ id: "link-1", name: "拓展阅读", url: "https://example.com" }],
          explanationVideo: {
            materialId: "video-1",
            title: "讲解视频",
            fileUrl: "/api/files/video.mp4",
          },
        }}
      />,
    );

    expect(screen.getByText("答案")).toBeInTheDocument();
    expect(screen.getByText("题目唯一 ID")).toBeInTheDocument();
    expect(screen.getByText("question-123")).toBeInTheDocument();
    expect(screen.getByText("解析")).toBeInTheDocument();
    expect(screen.getByText("总结")).toBeInTheDocument();
    expect(screen.getByText("考查二次函数的顶点性质")).toBeInTheDocument();
    expect(screen.getByAltText("题目板书")).toHaveAttribute("src", "/api/files/board.png");
    expect(screen.getByRole("link", { name: /拓展阅读/ })).toHaveAttribute("href", "https://example.com");
    expect(screen.getAllByText("讲解视频")).toHaveLength(2);
  });

  it("marks rendered answers for inline formula baseline alignment", () => {
    const { container } = render(
      <QuestionExpandedDetails
        question={{
          id: "question-math-answer",
          answer: "当 $x=1$ 时成立",
          analysis: "逐步解析",
        }}
      />,
    );

    const answer = container.querySelector(".question-answer-content");
    expect(answer).not.toBeNull();
    expect(answer?.querySelector(".katex-formula:not(.katex-formula-block) > .katex")).not.toBeNull();
  });

  it("does not render an empty summary section", () => {
    const { container } = render(
      <QuestionExpandedDetails
        question={{
          id: "question-456",
          answer: "A",
          analysis: "逐步解析",
        }}
      />,
    );

    expect(within(container).queryByText("总结")).not.toBeInTheDocument();
  });

  it("shows classroom board screenshots as thumbnails and opens a large preview", async () => {
    const user = userEvent.setup();
    render(
      <QuestionExpandedDetails
        question={{
          id: "question-board-images",
          answer: "A",
          analysis: "解析",
          summary: "总结",
          boardImages: ["/api/files/board-1", "/api/files/board-2"],
        }}
      />,
    );

    expect(screen.getByAltText("题目板书 1")).toHaveAttribute("src", "/api/files/board-1");
    expect(screen.getByAltText("题目板书 2")).toHaveAttribute("src", "/api/files/board-2");

    await user.click(screen.getByRole("button", { name: "查看板书 2" }));
    expect(screen.getByAltText("板书大图")).toHaveAttribute("src", "/api/files/board-2");
  });
});
