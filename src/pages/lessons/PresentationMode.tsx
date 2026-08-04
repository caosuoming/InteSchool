import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eraser,
  Eye,
  EyeOff,
  Link2,
  Maximize2,
  Minimize2,
  MousePointer2,
  NotebookPen,
  Trash2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LessonSlide, LessonSlideElement, Question } from "@/types";
import { cn } from "@/lib/utils";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { LessonSlideCanvas } from "@/components/lessons/LessonSlideCanvas";
import { LessonSlideContent } from "@/components/lessons/LessonSlideContent";
import {
  getVisibleLessonSlideElements,
  STEM_ONLY_QUESTION_VISIBILITY,
  type LessonQuestionContentVisibility,
} from "@/lib/lesson-slide-visibility";

interface PresentationModeProps {
  slides: LessonSlide[];
  initialIndex: number;
  students: { id: string; name: string }[];
  relatedQuestionsById: Record<string, Question>;
  onExit: () => void;
}

type DrawingToolId =
  | "pen-red"
  | "pen-blue"
  | "pen-black"
  | "highlighter-yellow"
  | "highlighter-green";

type Tool = "none" | "select" | "eraser" | DrawingToolId;
type Side = "left" | "right";
type SideTab = "display" | "ask" | "related";

interface DrawingPreset {
  id: DrawingToolId;
  kind: "pen" | "highlighter";
  label: string;
  color: string;
  width: number;
}

interface WritableCanvasProps {
  tool: Tool;
  preset?: DrawingPreset;
  clearToken: number;
  className?: string;
}

const INITIAL_DRAWING_PRESETS: DrawingPreset[] = [
  { id: "pen-red", kind: "pen", label: "红色画笔", color: "#dc2626", width: 3 },
  { id: "pen-blue", kind: "pen", label: "蓝色画笔", color: "#2563eb", width: 3 },
  { id: "pen-black", kind: "pen", label: "黑色画笔", color: "#111827", width: 3 },
  { id: "highlighter-yellow", kind: "highlighter", label: "黄色荧光笔", color: "#facc15", width: 18 },
  { id: "highlighter-green", kind: "highlighter", label: "绿色荧光笔", color: "#4ade80", width: 18 },
];

const DRAWING_COLORS = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#111827"];
const DRAWING_WIDTHS: Record<DrawingPreset["kind"], number[]> = {
  pen: [2, 4, 7],
  highlighter: [10, 18, 28],
};

const questionTypeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const SCRATCHPAD_BACKGROUND: CSSProperties = {
  backgroundColor: "#fffef8",
  backgroundImage: [
    "linear-gradient(to right, transparent 10%, rgba(220, 38, 38, 0.16) 10%, rgba(220, 38, 38, 0.16) calc(10% + 1px), transparent calc(10% + 1px))",
    "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(37, 99, 235, 0.13) 32px)",
  ].join(", "),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function WritableCanvas({ tool, preset, clearToken, className }: WritableCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const rect = parent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    const snapshotContext = snapshot.getContext("2d");
    if (snapshotContext && canvas.width > 0 && canvas.height > 0) {
      snapshotContext.drawImage(canvas, 0, 0);
    }

    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);
    const context = canvas.getContext("2d");
    if (context && snapshot.width > 0 && snapshot.height > 0) {
      context.drawImage(snapshot, 0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }, [clearToken]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool === "none" || tool === "select") return;
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const continueDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || tool === "none" || tool === "select") return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const lastPoint = lastPointRef.current;
    if (!canvas || !context || !lastPoint) return;

    event.preventDefault();
    const nextPoint = pointFromEvent(event);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.lineCap = "round";
    context.lineJoin = "round";

    if (tool === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 1;
      context.lineWidth = 24;
      context.strokeStyle = "rgba(0, 0, 0, 1)";
    } else if (preset) {
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = preset.kind === "highlighter" ? 0.32 : 1;
      context.lineWidth = preset.width;
      context.strokeStyle = preset.color;
    }

    context.stroke();
    context.globalAlpha = 1;
    lastPointRef.current = nextPoint;
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drawingRef.current) event.currentTarget.releasePointerCapture?.(event.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={cn(
        "absolute inset-0 h-full w-full touch-none",
        tool === "none" || tool === "select" ? "pointer-events-none" : "pointer-events-auto cursor-crosshair",
        className,
      )}
      onPointerDown={startDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={stopDrawing}
      onPointerCancel={stopDrawing}
      onPointerLeave={stopDrawing}
    />
  );
}

function DrawingPresetGlyph({ preset }: { preset: DrawingPreset }) {
  const thickness = preset.kind === "pen"
    ? clamp(preset.width, 2, 8)
    : clamp(preset.width / 2, 5, 13);
  return (
    <span className="relative block h-6 w-6 -rotate-45" aria-hidden="true">
      <span
        className="absolute left-1/2 top-1/2 block h-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: `${thickness}px`,
          backgroundColor: preset.color,
          opacity: preset.kind === "highlighter" ? 0.7 : 1,
        }}
      />
      <span
        className="absolute bottom-0 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 border-b border-r border-current"
        style={{ color: preset.color }}
      />
    </span>
  );
}

function toastRandom(name: string) {
  const div = document.createElement("div");
  div.className = "fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-gold-400 px-8 py-4 font-serif text-2xl font-bold text-ink-900 shadow-2xl";
  div.textContent = `请回答：${name}`;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = "opacity 0.5s";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 500);
  }, 1500);
}

export function PresentationMode({
  slides,
  initialIndex,
  students,
  relatedQuestionsById,
  onExit,
}: PresentationModeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(() => clamp(initialIndex, 0, Math.max(0, slides.length - 1)));
  const [tool, setTool] = useState<Tool>("select");
  const [drawingPresets, setDrawingPresets] = useState(INITIAL_DRAWING_PRESETS);
  const [presetMenuToolId, setPresetMenuToolId] = useState<DrawingToolId | null>(null);
  const [questionVisibility, setQuestionVisibility] = useState<LessonQuestionContentVisibility>({
    ...STEM_ONLY_QUESTION_VISIBILITY,
  });
  const [sidePanel, setSidePanel] = useState<{ side: Side; tab: SideTab } | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [elementOverrides, setElementOverrides] = useState<Record<string, LessonSlideElement[]>>({});
  const [stageScale, setStageScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [mainClearToken, setMainClearToken] = useState(0);
  const [scratchpadClearToken, setScratchpadClearToken] = useState(0);

  const currentSlide = slides[currentIndex];
  const selectedDrawingPreset = drawingPresets.find((preset) => preset.id === tool);
  const currentElements = currentSlide
    ? elementOverrides[currentSlide.id] ?? currentSlide.elements ?? []
    : [];
  const displayedSlide = currentSlide
    ? { ...currentSlide, elements: currentElements }
    : undefined;

  const askableStudents = (currentSlide?.askableStudentIds || [])
    .map((id) => students.find((student) => student.id === id))
    .filter((student): student is { id: string; name: string } => Boolean(student));
  const relatedQuestions = (currentSlide?.relatedQuestionIds || [])
    .map((id) => relatedQuestionsById[id])
    .filter((question): question is Question => Boolean(question));
  const visibleSlideElements = displayedSlide
    ? getVisibleLessonSlideElements(displayedSlide, questionVisibility)
    : [];

  const questionContentControls = currentSlide?.questionSnapshot
    ? [
        {
          key: "options" as const,
          label: "选项",
          available: Boolean(currentSlide.questionSnapshot.options?.length),
        },
        {
          key: "answer" as const,
          label: "答案",
          available: Boolean(currentSlide.questionSnapshot.answer),
        },
        {
          key: "analysis" as const,
          label: "解析",
          available: Boolean(
            currentSlide.questionSnapshot.analysis
            || currentSlide.questionSnapshot.summary
            || currentSlide.questionSnapshot.board,
          ),
        },
        {
          key: "supplementary" as const,
          label: "补充",
          available: Boolean(
            currentSlide.questionSnapshot.links?.length
            || currentSlide.questionSnapshot.explanationVideo,
          ),
        },
      ].filter((item) => item.available)
    : [];

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    setQuestionVisibility({ ...STEM_ONLY_QUESTION_VISIBILITY });
    setSidePanel(null);
    setSelectedElementId(null);
    setStageScale(1);
    setMainClearToken((value) => value + 1);
  }, [currentIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
        return;
      }
      if (event.key === "Escape") {
        if (scratchpadOpen) {
          setScratchpadOpen(false);
        } else if (sidePanel) {
          setSidePanel(null);
        } else if (!document.fullscreenElement) {
          onExit();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        setCurrentIndex((index) => Math.min(slides.length - 1, index + 1));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setCurrentIndex((index) => Math.max(0, index - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, scratchpadOpen, sidePanel, slides.length]);

  const goPrev = useCallback(() => setCurrentIndex((index) => Math.max(0, index - 1)), []);
  const goNext = useCallback(
    () => setCurrentIndex((index) => Math.min(slides.length - 1, index + 1)),
    [slides.length],
  );

  const toggleQuestionContent = (section: keyof LessonQuestionContentVisibility) => {
    setQuestionVisibility((current) => ({ ...current, [section]: !current[section] }));
  };

  const updateVisibleElements = (nextVisibleElements: LessonSlideElement[]) => {
    if (!currentSlide) return;
    const changedById = new Map(nextVisibleElements.map((element) => [element.id, element]));
    setElementOverrides((current) => ({
      ...current,
      [currentSlide.id]: currentElements.map((element) => changedById.get(element.id) ?? element),
    }));
  };

  const scaleSelectedElementOrStage = (factor: number) => {
    if (tool === "select" && selectedElementId && currentSlide) {
      setElementOverrides((current) => {
        const source = current[currentSlide.id] ?? currentSlide.elements ?? [];
        return {
          ...current,
          [currentSlide.id]: source.map((element) => {
            if (element.id !== selectedElementId) return element;
            const centerX = element.x + element.width / 2;
            const centerY = element.y + element.height / 2;
            const width = Number(clamp(element.width * factor, 6, 100).toFixed(4));
            const height = Number(clamp(element.height * factor, 6, 100).toFixed(4));
            return {
              ...element,
              width,
              height,
              x: Number(clamp(centerX - width / 2, 0, 100 - width).toFixed(4)),
              y: Number(clamp(centerY - height / 2, 0, 100 - height).toFixed(4)),
            };
          }),
        };
      });
      return;
    }
    setStageScale((current) => clamp(current + (factor > 1 ? 0.1 : -0.1), 0.7, 1.5));
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch {
      // Browsers may reject fullscreen when the page is embedded; the presentation stays usable.
    }
  };

  const toggleSidePanel = (side: Side, tab: SideTab) => {
    setSidePanel((current) => (
      current?.side === side && current.tab === tab ? null : { side, tab }
    ));
  };

  const clearActiveSurface = () => {
    if (scratchpadOpen) setScratchpadClearToken((value) => value + 1);
    else setMainClearToken((value) => value + 1);
  };

  const renderPanelContent = (tab: SideTab) => {
    if (tab === "display") {
      return (
        <div>
          <h2 className="text-sm font-semibold text-ink-900">显示内容</h2>
          <p className="mt-1 text-xs text-ink-400">按需显示当前题目的内容。</p>
          <div className="mt-3 space-y-2">
            {questionContentControls.length === 0 ? (
              <div className="rounded-lg bg-mist px-3 py-5 text-center text-xs text-ink-400">
                当前页面没有可切换内容
              </div>
            ) : questionContentControls.map(({ key, label }) => {
              const visible = questionVisibility[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visible}
                  onClick={() => toggleQuestionContent(key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-colors",
                    visible
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-ink-100 text-ink-700 hover:border-emerald-200",
                  )}
                >
                  <span>{label}</span>
                  {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (tab === "ask") {
      return (
        <div>
          <h2 className="text-sm font-semibold text-ink-900">提问学生</h2>
          <p className="mt-1 text-xs text-ink-400">选择本题预设的可提问学生。</p>
          <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
            {askableStudents.length === 0 ? (
              <div className="rounded-lg bg-mist px-3 py-5 text-center text-xs text-ink-400">未预设学生</div>
            ) : askableStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => toastRandom(student.name)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink-800 hover:bg-gold-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-xs font-semibold text-gold-700">
                  {student.name.slice(0, 1)}
                </span>
                {student.name}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <h2 className="text-sm font-semibold text-ink-900">相关题</h2>
        <p className="mt-1 text-xs text-ink-400">查看当前题目预选的相关练习。</p>
        <div className="mt-3 max-h-96 space-y-2 overflow-y-auto">
          {relatedQuestions.length === 0 ? (
            <div className="rounded-lg bg-mist px-3 py-5 text-center text-xs text-ink-400">未预设相关题</div>
          ) : relatedQuestions.map((question) => (
            <article key={question.id} className="rounded-lg border border-ink-100 p-3">
              <div className="flex items-center gap-2 text-[10px]">
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-700">
                  {questionTypeLabel[question.type] || question.type}
                </span>
                <span className="text-ink-400">难度 {question.difficulty}</span>
              </div>
              <div className="mt-2 line-clamp-4 text-xs leading-relaxed text-ink-800">{question.stem}</div>
              <div className="mt-2 text-[11px] text-emerald-700">答案：{question.answer}</div>
            </article>
          ))}
        </div>
      </div>
    );
  };

  const renderSideRail = (side: Side) => {
    const tabs: Array<{ id: SideTab; short: string; label: string; icon: typeof Eye }> = [
      { id: "display", short: "显", label: "显示内容", icon: Eye },
      { id: "ask", short: "问", label: "提问学生", icon: Users },
      { id: "related", short: "题", label: "相关题", icon: Link2 },
    ];
    const activeTab = sidePanel?.side === side ? sidePanel.tab : null;
    return (
      <div
        className={cn(
          "absolute top-1/2 z-30 -translate-y-1/2",
          side === "left" ? "left-2" : "right-2",
        )}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col overflow-hidden rounded-xl border border-white/60 bg-paper/95 shadow-2xl backdrop-blur">
          {tabs.map(({ id, short, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={`${side === "left" ? "左侧" : "右侧"}${label}`}
                aria-pressed={active}
                onClick={() => toggleSidePanel(side, id)}
                className={cn(
                  "flex h-12 w-11 flex-col items-center justify-center gap-0.5 border-b border-ink-100 text-ink-600 transition-colors last:border-b-0",
                  active ? "bg-gold-400 text-ink-900" : "hover:bg-gold-50",
                )}
                title={label}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{short}</span>
              </button>
            );
          })}
        </div>
        {activeTab && (
          <section
            className={cn(
              "absolute top-1/2 w-72 -translate-y-1/2 rounded-xl border border-ink-100 bg-paper p-4 shadow-2xl",
              side === "left" ? "left-full ml-2" : "right-full mr-2",
            )}
          >
            {renderPanelContent(activeTab)}
          </section>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-ink-900">
      <div className="relative flex-1 overflow-hidden bg-ink-800">
        <div className="absolute inset-0 flex items-center justify-center p-5 sm:p-7 lg:p-9">
          <div
            className="flex h-full w-full items-center justify-center transition-transform duration-150"
            style={{ transform: `scale(${stageScale})` }}
          >
            {displayedSlide?.type === "courseware" ? (
              <div className="h-full w-full max-w-6xl overflow-hidden rounded-xl bg-paper shadow-2xl">
                <CoursewareEmbed courseware={displayedSlide} title={displayedSlide.title} className="h-full min-h-[60vh]" />
              </div>
            ) : displayedSlide ? (
              <div className="w-full max-w-6xl">
                <LessonSlideCanvas
                  key={displayedSlide.id}
                  elements={visibleSlideElements}
                  editable={tool === "select"}
                  allowTextEditing={false}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onElementsChange={updateVisibleElements}
                  className="shadow-2xl"
                >
                  <LessonSlideContent slide={displayedSlide} questionVisibility={questionVisibility} />
                </LessonSlideCanvas>
              </div>
            ) : (
              <div className="text-sm text-ink-300">课件暂无页面</div>
            )}
          </div>
        </div>

        <WritableCanvas
          key={currentSlide?.id || "empty-slide"}
          tool={scratchpadOpen ? "none" : tool}
          preset={selectedDrawingPreset}
          clearToken={mainClearToken}
          className="z-10"
        />

        {renderSideRail("left")}
        {renderSideRail("right")}

        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="上一页"
          className="absolute bottom-4 left-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-ink-900/75 text-paper shadow-lg backdrop-blur hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === slides.length - 1}
          aria-label="下一页"
          className="absolute bottom-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-ink-900/75 text-paper shadow-lg backdrop-blur hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div
          className="absolute bottom-4 right-16 z-40 flex items-center gap-1 rounded-xl border border-white/60 bg-paper/95 p-1.5 shadow-xl backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="缩小"
            onClick={() => scaleSelectedElementOrStage(0.9)}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-ink-700 hover:bg-ink-100"
            title={tool === "select" && selectedElementId ? "缩小所选对象" : "缩小页面"}
          >
            <ZoomOut className="h-4 w-4" />
            缩小
          </button>
          <button
            type="button"
            aria-label="放大"
            onClick={() => scaleSelectedElementOrStage(1.1)}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-ink-700 hover:bg-ink-100"
            title={tool === "select" && selectedElementId ? "放大所选对象" : "放大页面"}
          >
            <ZoomIn className="h-4 w-4" />
            放大
          </button>
          <div className="mx-0.5 h-5 w-px bg-ink-200" />
          <button
            type="button"
            aria-label={isFullscreen ? "退出全屏" : "全屏"}
            onClick={() => void toggleFullscreen()}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-ink-700 hover:bg-ink-100"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen ? "退出全屏" : "全屏"}
          </button>
        </div>

        {scratchpadOpen && (
          <div
            className="absolute inset-0 z-[35] flex items-center justify-center bg-ink-950/80 px-5 pb-24 pt-5 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="临时板书弹窗"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <section
              className="relative aspect-video w-[min(92vw,calc(78vh*16/9))] overflow-hidden rounded-2xl border-4 border-ink-700 shadow-2xl"
              style={SCRATCHPAD_BACKGROUND}
            >
              <div className="pointer-events-none absolute left-[10%] top-0 h-full w-px bg-red-500/10" aria-hidden="true" />
              <WritableCanvas
                tool={tool}
                preset={selectedDrawingPreset}
                clearToken={scratchpadClearToken}
                className="z-10"
              />
              <div className="absolute left-4 top-3 z-20 rounded-lg bg-paper/80 px-3 py-1.5 text-xs text-ink-500 shadow-sm backdrop-blur">
                临时板书
              </div>
              <button
                type="button"
                aria-label="关闭临时板书"
                onClick={() => setScratchpadOpen(false)}
                className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-ink-900/80 text-paper shadow-lg hover:bg-ink-900"
              >
                <X className="h-4 w-4" />
              </button>
            </section>
          </div>
        )}

        <div
          className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-end gap-1 rounded-xl border border-white/60 bg-paper/95 px-1.5 py-1.5 shadow-2xl backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          aria-label="书写工具"
        >
          <button
            type="button"
            aria-label="选择工具"
            aria-pressed={tool === "select"}
            onClick={() => {
              setTool(tool === "select" ? "none" : "select");
              setPresetMenuToolId(null);
            }}
            className={cn(
              "flex h-10 w-9 items-center justify-center rounded-lg transition-all",
              tool === "select"
                ? "bg-gold-100 text-ink-900 shadow ring-2 ring-gold-400"
                : "bg-mist text-ink-600 hover:bg-ink-100",
            )}
            title="选择并移动课件对象"
          >
            <MousePointer2 className="h-5 w-5" />
          </button>
          <div className="mx-0.5 h-7 w-px self-center bg-ink-200" />

          {drawingPresets.map((preset) => {
            const selected = tool === preset.id;
            return (
              <div key={preset.id} className="relative">
                {presetMenuToolId === preset.id && (
                  <div className="absolute bottom-full left-1/2 mb-2 w-56 -translate-x-1/2 rounded-xl border border-ink-100 bg-paper p-3 shadow-2xl">
                    <div className="text-[10px] font-medium text-ink-400">颜色</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {DRAWING_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`${preset.label}改为${color}`}
                          className={cn(
                            "h-6 w-6 rounded-full border-2",
                            preset.color === color ? "border-ink-900" : "border-paper",
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => {
                            setDrawingPresets((current) => current.map((item) => (
                              item.id === preset.id ? { ...item, color } : item
                            )));
                            setTool(preset.id);
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 text-[10px] font-medium text-ink-400">粗细</div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {DRAWING_WIDTHS[preset.kind].map((width) => (
                        <button
                          key={width}
                          type="button"
                          aria-label={`${preset.label}粗细${width}`}
                          aria-pressed={preset.width === width}
                          onClick={() => {
                            setDrawingPresets((current) => current.map((item) => (
                              item.id === preset.id ? { ...item, width } : item
                            )));
                            setTool(preset.id);
                          }}
                          className={cn(
                            "flex h-8 items-center justify-center rounded-lg border",
                            preset.width === width
                              ? "border-gold-400 bg-gold-50"
                              : "border-ink-100 hover:border-gold-200",
                          )}
                        >
                          <span
                            className="block rounded-full"
                            style={{
                              width: "32px",
                              height: `${clamp(preset.kind === "pen" ? width : width / 2, 2, 12)}px`,
                              backgroundColor: preset.color,
                              opacity: preset.kind === "highlighter" ? 0.65 : 1,
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={preset.label}
                  aria-pressed={selected}
                  onClick={() => {
                    setTool(selected ? "none" : preset.id);
                    setPresetMenuToolId(null);
                  }}
                  className={cn(
                    "relative flex h-10 w-9 items-center justify-center rounded-lg transition-all",
                    selected
                      ? "-translate-y-0.5 bg-gold-100 shadow ring-2 ring-gold-400"
                      : "bg-mist text-ink-600 hover:-translate-y-0.5 hover:bg-ink-100",
                  )}
                  title={`${preset.label} · ${preset.width}px`}
                >
                  <DrawingPresetGlyph preset={preset} />
                </button>
                {selected && (
                  <button
                    type="button"
                    aria-label={`设置${preset.label}`}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink-800 text-paper shadow"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPresetMenuToolId((current) => current === preset.id ? null : preset.id);
                    }}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          <div className="mx-0.5 h-7 w-px self-center bg-ink-200" />
          <button
            type="button"
            aria-label="橡皮擦"
            aria-pressed={tool === "eraser"}
            onClick={() => {
              setTool(tool === "eraser" ? "none" : "eraser");
              setPresetMenuToolId(null);
            }}
            className={cn(
              "flex h-10 w-9 items-center justify-center rounded-lg transition-all",
              tool === "eraser"
                ? "bg-gold-100 text-ink-900 shadow ring-2 ring-gold-400"
                : "bg-mist text-ink-600 hover:bg-ink-100",
            )}
            title="橡皮擦"
          >
            <Eraser className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={scratchpadOpen ? "清空临时板书" : "清空批注"}
            onClick={clearActiveSurface}
            className="flex h-10 w-9 items-center justify-center rounded-lg bg-mist text-ink-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title={scratchpadOpen ? "清空临时板书" : "清空批注"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={scratchpadOpen ? "收起临时板书" : "打开临时板书"}
            aria-pressed={scratchpadOpen}
            onClick={() => setScratchpadOpen((open) => !open)}
            className={cn(
              "flex h-10 w-9 items-center justify-center rounded-lg transition-colors",
              scratchpadOpen
                ? "bg-teal-100 text-teal-800 ring-2 ring-teal-400"
                : "bg-mist text-ink-600 hover:bg-teal-50 hover:text-teal-700",
            )}
            title="临时板书"
          >
            <NotebookPen className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
