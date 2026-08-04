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
  it("uses mirrored classroom controls, compact configurable pens, selection transforms, fullscreen, and a lined scratchpad", async () => {
    const user = userEvent.setup();
    render(
      <PresentationMode
        slides={slides}
        initialIndex={0}
        students={[]}
        relatedQuestionsById={{}}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText("退出预览")).not.toBeInTheDocument();
    expect(screen.queryByText("保存板书")).not.toBeInTheDocument();
    expect(screen.queryByText("第一页")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧显示内容" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左侧提问学生" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右侧相关题" })).toBeInTheDocument();

    const selectTool = screen.getByRole("button", { name: "选择工具" });
    expect(selectTool).toHaveAttribute("aria-pressed", "true");
    const slideElement = screen.getByText("第一页内容").closest(".absolute") as HTMLElement;
    expect(slideElement).toHaveStyle({ width: "90%", height: "40%" });
    await user.click(screen.getByText("第一页内容"));
    expect(slideElement).toHaveClass("ring-2");
    await user.click(screen.getByRole("button", { name: "放大" }));
    expect(slideElement).toHaveStyle({ height: "44%" });
    expect(Number.parseFloat(slideElement?.style.width || "0")).toBeCloseTo(99);

    await user.click(screen.getByRole("button", { name: "红色画笔" }));
    expect(screen.getByRole("button", { name: "红色画笔" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "设置红色画笔" }));
    expect(screen.getByRole("button", { name: "红色画笔改为#2563eb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "红色画笔粗细7" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "红色画笔粗细7" }));
    expect(screen.getByRole("button", { name: "红色画笔" })).toHaveAttribute("title", "红色画笔 · 7px");

    await user.click(screen.getByRole("button", { name: "全屏" }));
    expect(await screen.findByRole("button", { name: "退出全屏" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "退出全屏" }));
    expect(await screen.findByRole("button", { name: "全屏" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "打开临时板书" }));
    expect(screen.getByRole("dialog", { name: "临时板书弹窗" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空临时板书" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "关闭临时板书" }));
    expect(screen.queryByRole("dialog", { name: "临时板书弹窗" })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByRole("button", { name: "上一页" })).toBeEnabled();
    expect(screen.getByText("第二页内容")).toBeInTheDocument();
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
