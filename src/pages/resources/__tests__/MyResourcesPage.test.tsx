import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileText } from "lucide-react";
import {
  BasketMaterialListItem,
  LinkedResourceRow,
  OriginalFileRow,
  QuestionListItem,
  ResourceCard,
} from "@/pages/resources/MyResourcesPage";
import type { Material, Question } from "@/types";

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
  stem: "第一段题干需要完整显示。\n\n第二段题干也必须保持原有段落。",
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
  it("shows the complete question stem and preserves paragraph breaks while collapsed", () => {
    render(
      <QuestionListItem
        question={question}
        expanded={false}
        onToggle={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const stem = screen.getByText((_, element) => (
      element?.tagName === "SPAN" && element.textContent === question.stem
    ));
    expect(stem).not.toHaveClass("line-clamp-2");
    expect(stem).toHaveClass("whitespace-pre-wrap");
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

    expect(screen.getByText("原稿：")).toBeInTheDocument();
    expect(screen.getByText("期末数学试卷.docx")).toBeInTheDocument();
    expect(screen.getByText("期末数学试卷.docx").closest("div")).toHaveClass("ml-4");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["查看", "下载"]);
    expect(screen.queryByText("原稿备份")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看" }));
    expect(onView).toHaveBeenCalledOnce();
  });
});

describe("LinkedResourceRow", () => {
  it("labels and opens a generated courseware link", () => {
    const onView = vi.fn();

    render(
      <LinkedResourceRow
        label="课件"
        title="函数单元测验（上课课件）"
        icon={FileText}
        onView={onView}
      />,
    );

    expect(screen.getByText("课件：")).toBeInTheDocument();
    expect(screen.getByText("函数单元测验（上课课件）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {
      name: "查看课件：函数单元测验（上课课件）",
    }));
    expect(onView).toHaveBeenCalledOnce();
  });
});

describe("ResourceCard", () => {
  it("renders document actions beside the title without triggering the card action", () => {
    const onClick = vi.fn();
    const onDownload = vi.fn();
    const onExtract = vi.fn();

    render(
      <ResourceCard
        title="待拆解试卷"
        titleActions={(
          <>
            <button type="button" onClick={onDownload}>下载</button>
            <button type="button" onClick={onExtract}>文档拆解</button>
          </>
        )}
        meta={[]}
        updatedAt="2026-07-30T00:00:00.000Z"
        onClick={onClick}
      />,
    );

    const titleRow = screen.getByTestId("resource-card-title-row");
    const titleActions = screen.getByTestId("resource-card-title-actions");
    const downloadButton = screen.getByRole("button", { name: "下载" });
    const extractButton = screen.getByRole("button", { name: "文档拆解" });

    expect(titleRow).toContainElement(titleActions);
    expect(titleActions).toContainElement(downloadButton);
    expect(titleActions).toContainElement(extractButton);

    fireEvent.click(downloadButton);
    fireEvent.click(extractButton);

    expect(onDownload).toHaveBeenCalledOnce();
    expect(onExtract).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
  });

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

  it("renames a document inline from the always-visible action area", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);

    render(
      <ResourceCard
        title="原试卷名称"
        meta={[{ label: "类型", value: "月考" }]}
        updatedAt="2026-07-30T00:00:00.000Z"
        onRename={onRename}
        alwaysShowActions
      />,
    );

    const actionArea = screen.getByTestId("resource-card-actions");
    expect(actionArea).toHaveClass("opacity-100");

    fireEvent.click(screen.getByRole("button", { name: "修改名称：原试卷名称" }));
    const input = screen.getByRole("textbox", { name: "修改文档名称：原试卷名称" });
    fireEvent.change(input, { target: { value: "  新试卷名称  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("新试卷名称"));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "修改文档名称：原试卷名称" })).not.toBeInTheDocument());
  });

  it("renders document metadata below the main row at full card width", () => {
    render(
      <ResourceCard
        title="函数试卷"
        meta={[
          { label: "类型", value: "周练" },
          { label: "题目", value: "20 题" },
        ]}
        updatedAt="2026-07-30T00:00:00.000Z"
        onClick={vi.fn()}
        onDelete={vi.fn()}
        alwaysShowActions
      />,
    );

    const mainRow = screen.getByTestId("resource-card-main-row");
    const details = screen.getByTestId("resource-card-details");

    expect(details).toHaveClass("w-full");
    expect(mainRow).not.toContainElement(details);
    expect(mainRow.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details).toHaveTextContent("类型：周练");
    expect(details).toHaveTextContent("题目：20 题");
  });

  it("places prominent PPT push actions below the resource details", () => {
    render(
      <ResourceCard
        title="数列课件"
        meta={[{ label: "类型", value: "PPT" }]}
        updatedAt="2026-07-30T00:00:00.000Z"
        primaryActions={(
          <>
            <button type="button">推送到我的上课（二次编辑）</button>
            <button type="button">直接推送我要上课（PPT上课）</button>
          </>
        )}
        onClick={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
        alwaysShowActions
      />,
    );

    const primaryActions = screen.getByTestId("resource-card-primary-actions");
    const mainRow = screen.getByTestId("resource-card-main-row");
    const iconActions = screen.getByTestId("resource-card-actions");
    const editableButton = screen.getByRole("button", { name: "推送到我的上课（二次编辑）" });

    expect(primaryActions).toHaveClass("mt-3", "justify-end", "border-t", "pt-3");
    expect(mainRow.compareDocumentPosition(primaryActions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primaryActions).toContainElement(editableButton);
    expect(primaryActions).toContainElement(screen.getByRole("button", { name: "直接推送我要上课（PPT上课）" }));
    expect(iconActions).not.toContainElement(editableButton);
  });
});

const knowledgeMaterial: Material = {
  id: "material-knowledge-1",
  teacherId: "teacher-1",
  schoolId: "school-1",
  title: "二次函数知识块",
  chapterIds: [],
  knowledgePointIds: [],
  grade: "高一",
  schoolYear: "2026-2027",
  semester: "上学期",
  type: "knowledgeBlock",
  content: "第一行知识。\n第二行知识。\n第三行知识。\n第四行知识必须在完整预览中可见。",
  tags: [],
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
};

const imageMaterial: Material = {
  ...knowledgeMaterial,
  id: "material-image-1",
  title: "函数图像",
  type: "image",
  content: "函数图像.png",
  fileUrl: "/api/files/function-image",
};

describe("material previews", () => {
  it("expands a knowledge block inline in the material library without opening a modal", () => {
    render(
      <ResourceCard
        title={knowledgeMaterial.title}
        meta={[]}
        content={knowledgeMaterial.content}
        updatedAt={knowledgeMaterial.updatedAt}
        type={knowledgeMaterial.type}
      />,
    );

    const summary = screen.getByRole("button", { name: `展开知识块：${knowledgeMaterial.title}` });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(summary.querySelector(".line-clamp-3")).not.toBeNull();

    fireEvent.click(summary);
    const expanded = screen.getByRole("button", { name: `收起知识块：${knowledgeMaterial.title}` });
    expect(expanded).toHaveAttribute("aria-expanded", "true");
    expect(expanded.querySelector(".line-clamp-3")).toBeNull();
    expect(expanded).toHaveTextContent("第四行知识必须在完整预览中可见。");
    expect(screen.queryByTestId("material-preview-content")).not.toBeInTheDocument();
  });

  it("shows image thumbnails directly in both the material library and resource basket", () => {
    const { rerender } = render(
      <ResourceCard
        title={imageMaterial.title}
        meta={[]}
        content={imageMaterial.content}
        updatedAt={imageMaterial.updatedAt}
        type={imageMaterial.type}
        fileUrl={imageMaterial.fileUrl}
      />,
    );

    expect(screen.getByRole("button", { name: `预览图片：${imageMaterial.title}` }))
      .toContainElement(screen.getByRole("img", { name: imageMaterial.title }));

    rerender(
      <BasketMaterialListItem
        material={imageMaterial}
        selected={false}
        onToggleSelection={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const thumbnail = screen.getByRole("button", { name: `预览图片：${imageMaterial.title}` });
    expect(thumbnail).toContainElement(screen.getByRole("img", { name: imageMaterial.title }));
    expect(screen.getByRole("img", { name: imageMaterial.title })).toHaveAttribute(
      "src",
      imageMaterial.fileUrl,
    );
  });

  it("expands a knowledge block inline in the resource basket without opening a modal", () => {
    render(
      <BasketMaterialListItem
        material={knowledgeMaterial}
        selected={false}
        onToggleSelection={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const summary = screen.getByRole("button", { name: `展开知识块：${knowledgeMaterial.title}` });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(summary.querySelector(".line-clamp-3")).not.toBeNull();

    fireEvent.click(summary);
    const expanded = screen.getByRole("button", { name: `收起知识块：${knowledgeMaterial.title}` });
    expect(expanded).toHaveAttribute("aria-expanded", "true");
    expect(expanded.querySelector(".line-clamp-3")).toBeNull();
    expect(expanded).toHaveTextContent("第四行知识必须在完整预览中可见。");
    expect(screen.queryByTestId("material-preview-content")).not.toBeInTheDocument();
  });
});
