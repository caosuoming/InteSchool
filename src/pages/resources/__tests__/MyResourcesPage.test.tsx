import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileText } from "lucide-react";
import { OriginalFileRow, QuestionListItem, ResourceCard } from "@/pages/resources/MyResourcesPage";
import type { Question } from "@/types";

vi.mock("@/components/ui/MathHtml", () => ({
  MathHtml: ({ children, className }: { children: string; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));
vi.mock("@/pages/question-bank/QuestionBankPage", () => ({
  default: () => <div>题库</div>,
}));

const question: Question = {
  id: "question-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  type: "short",
  stem: "这是一道需要完整显示的长题干，列表收起时也不能只展示两行内容。",
  answer: "答案",
  analysis: "解析",
  chapterIds: [],
  knowledgePointIds: [],
  difficulty: 3,
  recommendation: 3,
  usageCount: 0,
  remark: "",
  isShared: false,
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

describe("QuestionListItem", () => {
  it("shows the complete question stem while collapsed", () => {
    render(
      <QuestionListItem
        question={question}
        expanded={false}
        onToggle={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText(question.stem)).not.toHaveClass("line-clamp-2");
  });
});

describe("OriginalFileRow", () => {
  it("keeps a decomposed resource's original file on one compact row with only view and download actions", () => {
    const onView = vi.fn();

    render(
      <OriginalFileRow
        fileUrl="/api/files/original.docx"
        fileName="期末数学试卷.docx"
        icon={FileText}
        onView={onView}
      />,
    );

    expect(screen.getByText("期末数学试卷.docx")).toBeInTheDocument();
    expect(screen.getByText("期末数学试卷.docx").parentElement).toHaveClass("ml-4");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["查看", "下载"]);
    expect(screen.queryByText("原稿备份")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onView).toHaveBeenCalledOnce();
  });
});

describe("ResourceCard", () => {
  it("shows compact lecture actions directly and keeps conversion in the action area", () => {
    const onConvertToExamPaper = vi.fn();

    render(
      <ResourceCard
        title="函数讲义"
        meta={[]}
        updatedAt="2026-07-30T00:00:00.000Z"
        onClick={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
        onConvertToExamPaper={onConvertToExamPaper}
        alwaysShowActions
        compactActions
      />,
    );

    const actionArea = screen.getByTestId("resource-card-actions");
    const convertButton = screen.getByTitle("转试卷");

    expect(actionArea).toHaveClass("opacity-100", "gap-0.5");
    expect(actionArea).not.toHaveClass("opacity-0");
    expect(convertButton).toHaveClass("p-1");
    expect(actionArea).toContainElement(convertButton);

    fireEvent.click(convertButton);
    expect(onConvertToExamPaper).toHaveBeenCalledOnce();
  });
});
