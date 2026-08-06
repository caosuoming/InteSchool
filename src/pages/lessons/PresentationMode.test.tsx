import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonSlide } from "@/types";
import { PresentationMode } from "./PresentationMode";

const slides: LessonSlide[] = [
  {
    id: "slide-1",
    type: "knowledge",
    title: "第一页",
    content: "第一页内容",
    freeformLayout: true,
    elements: [{
      id: "element-1",
      kind: "text",
      content: "第一页内容",
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    }],
  },
  {
    id: "slide-2",
    type: "knowledge",
    title: "第二页",
    content: "第二页内容",
    freeformLayout: true,
    elements: [{
      id: "element-2",
      kind: "text",
      content: "第二页内容",
      x: 5,
      y: 5,
      width: 90,
      height: 40,
    }],
  },
];

const questionSlide: LessonSlide = {
  id: "question-slide",
  type: "question",
  title: "课堂题目",
  questionId: "question-1",
  questionSnapshot: {
    stem: "题干内容",
    type: "single",
    options: ["选项 A", "选项 B"],
    answer: "参考答案",
    analysis: "详细解析",
  },
  relatedQuestionIds: [],
  askableStudentIds: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  let fullscreenElement: Element | null = null;
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    }),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    lineCap: "round",
    lineJoin: "round",
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: "#000000",
  } as unknown as CanvasRenderingContext2D);
});

describe("PresentationMode", () => {
  it("uses arrow-only mirrored navigation, text resizing, upward pen tips, fullscreen, and formal boards", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={onExit}
      />,
    );

    expect(screen.queryByText("退出预览")).not.toBeInTheDocument();
    expect(screen.queryByText("保存板书")).not.toBeInTheDocument();
    expect(screen.queryByText("临时板书")).not.toBeInTheDocument();
    expect(screen.queryByText("第一页")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧提问学生" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧相关题" })).toBeInTheDocument();
    expect(screen.queryByText("上一页")).not.toBeInTheDocument();
    expect(screen.queryByText("下一页")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下课" })).toBeInTheDocument();
    expect(screen.getByLabelText("文本与全屏控制")).toHaveClass("bottom-0", "left-full");

    const selectTool = screen.getByRole("button", { name: "选择工具" });
    expect(selectTool).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "放大所选文本" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "缩小所选文本" })).toBeDisabled();
    const slideText = screen.getByText("第一页内容");
    const slideElement = slideText.closest(".absolute") as HTMLElement;
    const textBox = slideElement.querySelector('[style*="font-size"]') as HTMLElement;
    expect(slideElement).toHaveStyle({ width: "90%", height: "40%" });
    expect(textBox).toHaveStyle({ fontSize: "24px" });
    await user.click(slideText);
    expect(slideElement).toHaveClass("ring-2");
    await user.click(screen.getByRole("button", { name: "放大所选文本" }));
    expect(slideElement).toHaveStyle({ height: "44%" });
    expect(Number.parseFloat(slideElement?.style.width || "0")).toBeCloseTo(99);
    expect(textBox).toHaveStyle({ fontSize: "26.4px" });

    const redPen = screen.getByRole("button", { name: "红色画笔" });
    expect(redPen.querySelector('[data-pen-tip="up"]')).toBeInTheDocument();
    await user.click(redPen);
    expect(redPen).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "设置红色画笔" }));
    expect(screen.getByRole("button", { name: "红色画笔改为#2563eb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "红色画笔粗细7" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "红色画笔粗细7" }));
    expect(screen.getByRole("button", { name: "红色画笔" })).toHaveAttribute("title", "红色画笔 · 7px");

    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出全屏" }));
    expect(await screen.findByRole("button", { name: "全屏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开板书" }));
    const firstBoard = screen.getByRole("region", { name: "板书 1" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(firstBoard.querySelector('[data-board-divider="center"]')).toHaveClass("left-1/2");
    expect(screen.getByRole("button", { name: "移动板书 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "调整板书 1的大小" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空当前板书" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新增板书" }));
    expect(screen.getByRole("region", { name: "板书 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "收起板书" }));
    expect(firstBoard).toHaveClass("invisible");

    expect(screen.getByRole("button", { name: "左侧上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "左侧下一页" }));
    expect(screen.getByRole("button", { name: "左侧上一页" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "右侧上一页" })).toBeEnabled();
    expect(screen.getByText("第二页内容")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下课" }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("turns legacy knowledge content into a selectable object without showing its title", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={[{
          id: "legacy-knowledge",
          type: "knowledge",
          title: "不应显示的知识块标题",
          content: "可自由调整的知识内容",
        }]}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("不应显示的知识块标题")).not.toBeInTheDocument();
    const content = screen.getByText("可自由调整的知识内容");
    const element = content.closest(".absolute") as HTMLElement;
    expect(element).toHaveStyle({ left: "5%", top: "6%", width: "90%", height: "88%" });
    await user.click(content);
    expect(element).toHaveClass("ring-2");
    expect(screen.getByRole("button", { name: "放大所选文本" })).toBeEnabled();
  });

  it("reveals question options, answers, and analysis from either mirrored display rail", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={[questionSlide]}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("选项 A")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "左侧显示内容" }));
    await user.click(screen.getByRole("button", { name: "选项" }));
    await user.click(screen.getByRole("button", { name: "答案" }));
    await user.click(screen.getByRole("button", { name: "解析" }));

    expect(screen.getByText("选项 A")).toBeInTheDocument();
    expect(screen.getAllByText("参考答案").length).toBeGreaterThan(0);
    expect(screen.getByText("详细解析")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "右侧显示内容" }));
    expect(screen.getByRole("button", { name: "选项" })).toHaveAttribute("aria-pressed", "true");
  });
});
