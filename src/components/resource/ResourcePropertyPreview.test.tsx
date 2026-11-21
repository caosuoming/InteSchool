import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResourcePropertyPreview } from "./ResourcePropertyPreview";
import type { Material, Question } from "@/types";

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

const question = {
  id: "q-1",
  type: "single",
  stem: "较长题干第一行\n较长题干第二行",
  options: ["选项一", "选项二", "选项三", "选项四"],
  answer: "A",
  analysis: "详细解析内容",
} as Question;

describe("ResourcePropertyPreview", () => {
  it("shows the complete question and every option while keeping answer and analysis collapsed separately", () => {
    render(<ResourcePropertyPreview type="question" resource={question} />);
    const preview = screen.getByTestId("resource-property-question-preview");
    expect(preview).toHaveTextContent("较长题干第一行");
    expect(preview).toHaveTextContent("较长题干第二行");
    expect(preview).not.toHaveClass("line-clamp-3");
    for (const option of question.options!) expect(preview).toHaveTextContent(option);
    const answerToggle = within(preview).getByRole("button", { name: /答案/ });
    const analysisToggle = within(preview).getByRole("button", { name: /解析/ });
    expect(answerToggle).toHaveAttribute("aria-expanded", "false");
    expect(analysisToggle).toHaveAttribute("aria-expanded", "false");
    expect(preview).not.toHaveTextContent("详细解析内容");
    fireEvent.click(analysisToggle);
    expect(analysisToggle).toHaveAttribute("aria-expanded", "true");
    expect(preview).toHaveTextContent("详细解析内容");
    expect(answerToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(analysisToggle);
    expect(preview).not.toHaveTextContent("详细解析内容");
  });

  it("previews a text material without treating it as a question", () => {
    const material = { id: "m-1", title: "知识块", type: "text", content: "知识块完整正文" } as Material;
    render(<ResourcePropertyPreview type="material" resource={material} />);
    expect(screen.getByTestId("resource-property-material-preview")).toHaveTextContent("知识块完整正文");
    expect(screen.queryByRole("button", { name: /答案/ })).not.toBeInTheDocument();
  });
});
