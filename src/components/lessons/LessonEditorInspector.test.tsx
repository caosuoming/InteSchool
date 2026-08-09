import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { LessonSlide, LessonSlideElement, Question, Student } from "@/types";
import { LessonEditorInspector } from "./LessonEditorInspector";

const slide: LessonSlide = {
  id: "slide-1",
  type: "question",
  title: "课堂题目",
  questionId: "question-1",
  questionSnapshot: {
    stem: "题干内容",
    type: "single",
    options: ["选项 A", "选项 B"],
    answer: "A",
    analysis: "解析",
  },
  relatedQuestionIds: [],
  askableStudentIds: [],
  textStyles: { stem: { fontSize: 28 } },
};

const element: LessonSlideElement = {
  id: "element-1",
  kind: "text",
  content: "补充说明",
  x: 10,
  y: 4,
  width: 30,
  height: 12,
  fontSize: 24,
  animationOrder: 1,
};

function renderInspector(overrides: Partial<ComponentProps<typeof LessonEditorInspector>> = {}) {
  const props: ComponentProps<typeof LessonEditorInspector> = {
    slide,
    elements: [element],
    selectedElement: null,
    selectedTextRegion: null,
    students: [{ id: "student-1", name: "张同学" } as Student],
    relatedQuestions: [{ id: "question-2", stem: "相关题目", type: "single" } as Question],
    canDeleteSlide: true,
    canMergeSlide: true,
    onSelectElement: vi.fn(),
    onSelectTextRegion: vi.fn(),
    onUpdateElement: vi.fn(),
    onDeleteElement: vi.fn(),
    onUpdateTextStyle: vi.fn(),
    onUpdateSlide: vi.fn(),
    onAddText: vi.fn(),
    onAddImage: vi.fn(),
    onAddLink: vi.fn(),
    onAddSlide: vi.fn(),
    onSplitSlide: vi.fn(),
    onMergeSlide: vi.fn(),
    onDeleteSlide: vi.fn(),
    onOpenFormulaEditor: vi.fn(),
    onSetAnimationOrder: vi.fn(),
    onToggleStudent: vi.fn(),
    onLoadRelatedQuestions: vi.fn(),
    onAddRelatedQuestion: vi.fn(),
    onRemoveRelatedQuestion: vi.fn(),
    ...overrides,
  };
  render(<LessonEditorInspector {...props} />);
  return props;
}

describe("LessonEditorInspector", () => {
  it("uses the four requested sections and inserts content from the content section", async () => {
    const user = userEvent.setup();
    const props = renderInspector();

    expect(screen.getByRole("button", { name: "内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "属性" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "动画" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关联" })).toBeInTheDocument();
    expect(screen.queryByText("课后反思")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "超链接" }));
    expect(props.onAddLink).toHaveBeenCalledOnce();

    const image = new File(["image"], "diagram.png", { type: "image/png" });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    await user.upload(fileInput!, image);
    expect(props.onAddImage).toHaveBeenCalledWith(image);
  });

  it("updates the selected built-in text region font size", async () => {
    const user = userEvent.setup();
    const onUpdateTextStyle = vi.fn();
    renderInspector({ selectedTextRegion: "stem", onUpdateTextStyle });

    await user.click(screen.getByRole("button", { name: "属性" }));
    const fontSize = screen.getByRole("spinbutton", { name: "字号" });
    expect(fontSize).toHaveValue(28);
    fireEvent.change(fontSize, { target: { value: "34" } });
    expect(onUpdateTextStyle).toHaveBeenLastCalledWith("stem", 34);
  });

  it("exposes element and order animation controls plus the two association groups", async () => {
    const user = userEvent.setup();
    const onLoadRelatedQuestions = vi.fn();
    renderInspector({ selectedElement: element, onLoadRelatedQuestions });

    await user.click(screen.getByRole("button", { name: "动画" }));
    expect(screen.getByRole("button", { name: "元素" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "顺序" })).toBeInTheDocument();
    expect(screen.getByText("出现")).toBeInTheDocument();
    expect(screen.getByText("动作")).toBeInTheDocument();
    expect(screen.getByText("消失")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关联" }));
    expect(screen.getByRole("button", { name: "相关学生" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "相关题" }));
    expect(onLoadRelatedQuestions).toHaveBeenCalled();
  });

  it("lets multiple objects share one appearance step", async () => {
    const user = userEvent.setup();
    const secondElement: LessonSlideElement = {
      ...element,
      id: "element-2",
      content: "图示说明",
      animationOrder: 2,
    };
    const onSetAnimationOrder = vi.fn();
    renderInspector({
      elements: [element, secondElement],
      selectedElement: null,
      onSetAnimationOrder,
    });

    await user.click(screen.getByRole("button", { name: "动画" }));
    await user.click(screen.getByRole("button", { name: "顺序" }));

    expect(screen.getByText(/步骤号相同的对象/)).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "补充说明出现步骤" })).toHaveValue(1);
    const secondOrder = screen.getByRole("spinbutton", { name: "图示说明出现步骤" });
    expect(secondOrder).toHaveValue(2);
    fireEvent.change(secondOrder, { target: { value: "1" } });
    expect(onSetAnimationOrder).toHaveBeenCalledWith("element-2", 1);

    onSetAnimationOrder.mockClear();
    await user.click(screen.getByRole("checkbox", { name: "图示说明与上一动画同时" }));
    expect(onSetAnimationOrder).toHaveBeenCalledWith("element-2", 1);

    onSetAnimationOrder.mockClear();
    await user.click(screen.getByRole("button", { name: "图示说明上移" }));
    expect(onSetAnimationOrder).toHaveBeenCalledWith("element-1", 2);
    expect(onSetAnimationOrder).toHaveBeenCalledWith("element-2", 1);
  });
});
