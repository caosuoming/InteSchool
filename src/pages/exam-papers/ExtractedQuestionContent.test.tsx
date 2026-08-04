import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtractedQuestionContent } from "./ExtractedQuestionContent";

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

describe("ExtractedQuestionContent", () => {
  it("shows the complete read-only stem and expands answer and analysis from the stem", () => {
    const stem = "第一段题干\n第二段题干\n第三段题干";
    render(
      <ExtractedQuestionContent
        number={1}
        stem={stem}
        options={["选项 A", "选项 B"]}
        answer="A"
        analysis="完整解析"
      />,
    );

    const stemButton = screen.getByRole("button", { name: "第 1 题，点击展开答案和解析" });
    expect(stemButton).toHaveTextContent("第一段题干 第二段题干 第三段题干");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("完整解析")).not.toBeInTheDocument();

    fireEvent.click(stemButton);

    expect(screen.getByText("完整解析")).toBeInTheDocument();
    expect(screen.getByText("答案：").parentElement).toHaveTextContent("答案：A");
  });

  it("supports keyboard expansion", () => {
    render(
      <ExtractedQuestionContent
        stem="题干"
        answer="答案"
        analysis="解析"
      />,
    );

    const stem = screen.getByRole("button", { name: "点击展开答案和解析" });
    fireEvent.keyDown(stem, { key: "Enter" });
    expect(screen.getByText("解析")).toBeInTheDocument();
  });

  it("reduces option columns when option content is long", () => {
    const { container, rerender } = render(
      <ExtractedQuestionContent
        stem="题干"
        options={["短选项", "中".repeat(31), "短选项", "短选项"]}
        answer="A"
        analysis="解析"
      />,
    );

    expect(container.querySelector(".grid")).toHaveClass("grid-cols-2");

    rerender(
      <ExtractedQuestionContent
        stem="题干"
        options={["短选项", "长".repeat(61), "短选项", "短选项"]}
        answer="A"
        analysis="解析"
      />,
    );

    expect(container.querySelector(".grid")).toHaveClass("grid-cols-1");
  });
});
