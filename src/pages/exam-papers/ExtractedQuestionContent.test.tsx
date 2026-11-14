import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtractedQuestionContent } from "./ExtractedQuestionContent";

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

describe("ExtractedQuestionContent", () => {
  it("renumbers inline legacy answers and explanations after a grouped geography question is moved", () => {
    const stem = "据此完成下列问题\n1. 第一小题\nA. 甲\nB. 乙\n2. 第二小题\nA. 丙\nB. 丁\n3. 第三小题";
    render(<ExtractedQuestionContent
      number={8}
      geographySubject="地理"
      questionType="single"
      stem={stem}
      answer="（7）B （8）D （9）B"
      analysis="（7）温度 （8）洋流 （9）地形"
    />);
    const group = screen.getByRole("button", { name: "第 8 至 10 题，点击展开答案和解析" });
    expect(group).toHaveTextContent("8. 第一小题");
    expect(group).toHaveTextContent("10. 第三小题");
    fireEvent.click(group);
    expect(screen.getByText(/8\. B 9\. D 10\. B/)).toBeInTheDocument();
    expect(screen.getByText(/8\. 温度 9\. 洋流 10\. 地形/)).toBeInTheDocument();
  });
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

  it("uses consecutive subquestion numbers instead of a duplicate group number", () => {
    render(
      <ExtractedQuestionContent
        number={3}
        geographySubject="地理"
        questionType="single"
        stem={"读图完成8—9题。\n8. 气候\nA. 甲\nB. 乙\n9. 地貌"}
        answer={"（8）A\n（9）B"}
        analysis={"（8）解析甲\n（9）解析乙"}
      />,
    );
    const group = screen.getByRole("button", { name: "第 3 至 4 题，点击展开答案和解析" });
    expect(group).toHaveTextContent("3. 气候");
    expect(group).toHaveTextContent("4. 地貌");
    expect(group).not.toHaveTextContent("8. 气候");
    fireEvent.click(group);
    expect(screen.getByText(/3\. A/)).toHaveTextContent("3. A 4. B");
  });

  it("shows only the new global number for a standalone geography choice question", () => {
    render(
      <ExtractedQuestionContent
        number={4}
        geographySubject="地理"
        questionType="single"
        stem="16. 农耕聚落的空间布局是什么？"
        answer="A"
        analysis="沿河分布"
      />,
    );
    const question = screen.getByRole("button", { name: "第 4 题，点击展开答案和解析" });
    expect(question).toHaveTextContent(/4\.\s*农耕聚落的空间布局是什么？/);
    expect(question).not.toHaveTextContent("16.");
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

  it("renders paper-preview options without rectangular boxes", () => {
    const { container } = render(
      <ExtractedQuestionContent
        stem="题干"
        options={["选项 A", "选项 B"]}
        answer="A"
        analysis="解析"
        optionVariant="plain"
      />,
    );

    const option = screen.getByText("选项 A").parentElement;
    expect(option).not.toHaveClass("border");
    expect(option).not.toHaveClass("rounded");

    fireEvent.click(screen.getByRole("button", { name: "点击展开答案和解析" }));
    expect(option).not.toHaveClass("bg-emerald-50/50");
    expect(screen.getByText("选项 A")).toHaveClass("text-emerald-900");
    expect(container.querySelector(".grid")).toBeInTheDocument();
  });
});
