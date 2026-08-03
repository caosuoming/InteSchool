import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, PenLine, Highlighter, Eraser, Trash2,
  ChevronUp, Users, Link2, Eye, EyeOff, Save,
} from "lucide-react";
import type { LessonSlide, Question } from "@/types";
import { cn } from "@/lib/utils";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { LessonSlideCanvas } from "@/components/lessons/LessonSlideCanvas";
import { LessonSlideContent } from "@/components/lessons/LessonSlideContent";
import {
  getVisibleLessonSlideElements,
  STEM_ONLY_QUESTION_VISIBILITY,
  type LessonQuestionContentVisibility,
} from "@/lib/lesson-slide-visibility";
import { uploadFile } from "@/services/api";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";

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

type Tool = "none" | "eraser" | DrawingToolId;

interface DrawingPreset {
  id: DrawingToolId;
  kind: "pen" | "highlighter";
  label: string;
  color: string;
  width: number;
}

const INITIAL_DRAWING_PRESETS: DrawingPreset[] = [
  { id: "pen-red", kind: "pen", label: "红色画笔", color: "#dc2626", width: 3 },
  { id: "pen-blue", kind: "pen", label: "蓝色画笔", color: "#2563eb", width: 3 },
  { id: "pen-black", kind: "pen", label: "黑色画笔", color: "#111827", width: 3 },
  { id: "highlighter-yellow", kind: "highlighter", label: "黄色荧光笔", color: "#facc15", width: 18 },
  { id: "highlighter-green", kind: "highlighter", label: "绿色荧光笔", color: "#4ade80", width: 18 },
];

const DRAWING_COLORS = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#7c3aed", "#111827"];

const questionTypeLabel: Record<string, string> = {
  single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答",
};

export function PresentationMode({
  slides, initialIndex, students, relatedQuestionsById, onExit,
}: PresentationModeProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tool, setTool] = useState<Tool>("none");
  const [drawingPresets, setDrawingPresets] = useState(INITIAL_DRAWING_PRESETS);
  const [colorMenuToolId, setColorMenuToolId] = useState<string | null>(null);
  const [questionVisibility, setQuestionVisibility] = useState<LessonQuestionContentVisibility>({
    ...STEM_ONLY_QUESTION_VISIBILITY,
  });
  const [showRelated, setShowRelated] = useState(false);
  const [showAskable, setShowAskable] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [savingBoard, setSavingBoard] = useState(false);
  const [savedBoardByQuestionId, setSavedBoardByQuestionId] = useState<Record<string, string>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pathsRef = useRef<{ x: number; y: number }[][]>([]);
  const enteredFullscreenRef = useRef(Boolean(document.fullscreenElement));

  const currentSlide = slides[currentIndex];
  const selectedDrawingPreset = drawingPresets.find((preset) => preset.id === tool);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        enteredFullscreenRef.current = true;
      } else if (enteredFullscreenRef.current) {
        onExit();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [onExit]);

  // 切换页面时清空画板
  useEffect(() => {
    clearCanvas();
    setQuestionVisibility({ ...STEM_ONLY_QUESTION_VISIBILITY });
  }, [currentIndex]);

  // 调整 canvas 尺寸
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      // 保留旧内容
      const oldData = canvas.toDataURL();
      canvas.width = rect.width;
      canvas.height = rect.height;
      // 还原
      const ctx = canvas.getContext("2d");
      if (ctx && oldData && pathsRef.current.length > 0) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = oldData;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pathsRef.current = [];
    setHasDrawing(false);
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === "none") return;
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
    pathsRef.current.push([lastPointRef.current]);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current || tool === "none") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const pos = getPos(e);
    const last = lastPointRef.current;
    if (!last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 24;
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else if (selectedDrawingPreset) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = selectedDrawingPreset.kind === "highlighter" ? 0.3 : 1;
      ctx.lineWidth = selectedDrawingPreset.width;
      ctx.strokeStyle = selectedDrawingPreset.color;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    setHasDrawing(true);
    lastPointRef.current = pos;
    pathsRef.current[pathsRef.current.length - 1].push(pos);
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  // 键盘左右键翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(slides.length - 1, i + 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        onExit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onExit]);

  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setCurrentIndex((i) => Math.min(slides.length - 1, i + 1)),
    [slides.length],
  );

  const handleSaveBoard = async () => {
    const canvas = canvasRef.current;
    const questionId = currentSlide?.questionId;
    if (!canvas || !questionId || !hasDrawing) return;

    setSavingBoard(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("板书图片生成失败")), "image/png");
      });
      const file = new File([blob], `板书-${questionId}.png`, { type: "image/png" });
      const uploaded = await uploadFile(file);
      await questionService.updateQuestion(questionId, { board: uploaded.url });
      setSavedBoardByQuestionId((current) => ({ ...current, [questionId]: uploaded.url }));
      toast.success("板书已保存到题目");
    } catch (error) {
      toast.error("板书保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingBoard(false);
    }
  };

  const displayedSlide = currentSlide?.questionSnapshot && currentSlide.questionId
    && savedBoardByQuestionId[currentSlide.questionId]
    ? {
        ...currentSlide,
        questionSnapshot: {
          ...currentSlide.questionSnapshot,
          board: savedBoardByQuestionId[currentSlide.questionId],
        },
      }
    : currentSlide;

  const askableStudents = (currentSlide?.askableStudentIds || [])
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is { id: string; name: string } => !!s);

  const relatedQuestions = (currentSlide?.relatedQuestionIds || [])
    .map((id) => relatedQuestionsById[id])
    .filter((q): q is Question => !!q);

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

  const toggleQuestionContent = (section: keyof LessonQuestionContentVisibility) => {
    setQuestionVisibility((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink-900 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="h-12 flex items-center gap-3 px-4 bg-ink-900 text-paper border-b border-ink-700">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-ink-800 text-sm"
        >
          <X className="w-4 h-4" />
          退出预览
        </button>
        <div className="h-5 w-px bg-ink-700" />
        <div className="text-sm font-serif font-medium truncate max-w-md">
          {currentSlide?.title}
        </div>
        <div className="flex-1" />
        {currentSlide?.type === "question" && (
          <button
            onClick={handleSaveBoard}
            disabled={!hasDrawing || savingBoard || !currentSlide.questionId}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-100 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
            title="保存板书到当前题目"
          >
            <Save className="h-4 w-4" />
            {savingBoard ? "保存中" : "保存板书"}
          </button>
        )}
      </div>

      {/* 主显示区 */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-ink-800"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      >
        {/* 幻灯片内容 */}
        <div className="absolute inset-0 flex items-center justify-center p-8">
          {displayedSlide?.type === "courseware" ? (
            <div className="h-full w-full max-w-6xl overflow-hidden rounded-xl bg-paper shadow-2xl">
              <CoursewareEmbed courseware={displayedSlide} title={displayedSlide.title} className="h-full min-h-[60vh]" />
            </div>
          ) : displayedSlide ? (
            <div className="w-full max-w-6xl">
              <LessonSlideCanvas key={displayedSlide.id} elements={visibleSlideElements} className="shadow-2xl">
                <LessonSlideContent
                  slide={displayedSlide}
                  questionVisibility={questionVisibility}
                />
              </LessonSlideCanvas>
            </div>
          ) : null}
        </div>

        {/* 画笔 canvas 覆盖层 */}
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 z-10",
            tool === "none" ? "pointer-events-none" : "cursor-crosshair",
          )}
        />

        {/* 左右翻页按钮 */}
        <button
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="上一页"
          className="absolute bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-ink-900/70 text-paper shadow-lg backdrop-blur hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={goNext}
          disabled={currentIndex === slides.length - 1}
          aria-label="下一页"
          className="absolute bottom-4 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-ink-900/70 text-paper shadow-lg backdrop-blur hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* 右下角：相关题和提问学生 */}
        <div className="absolute bottom-20 right-6 z-30 flex items-end gap-3">
          {/* 提问学生 */}
          <div className="relative">
            <button
              onClick={() => { setShowAskable((v) => !v); setShowRelated(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg transition-colors",
                showAskable ? "bg-gold-400 text-ink-900" : "bg-paper text-ink-700 hover:bg-gold-50",
              )}
            >
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">提问学生</span>
              {askableStudents.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gold-200 text-gold-800">
                  {askableStudents.length}
                </span>
              )}
            </button>
            {showAskable && (
              <div className="absolute bottom-full right-0 mb-2 w-56 bg-paper rounded-lg shadow-xl border border-ink-100 p-3 max-h-72 overflow-auto">
                <div className="text-xs font-medium text-ink-600 mb-2">本题可提问学生</div>
                {askableStudents.length === 0 ? (
                  <div className="text-xs text-ink-400 py-3 text-center">未预设学生</div>
                ) : (
                  <div className="space-y-1">
                    {askableStudents.map((stu) => (
                      <div
                        key={stu.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gold-50 cursor-pointer text-sm"
                        onClick={() => {
                          // 随机点名效果（演示）
                          toastRandom(stu.name);
                        }}
                      >
                        <div className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center text-xs font-medium">
                          {stu.name.slice(0, 1)}
                        </div>
                        <span className="text-ink-800">{stu.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 相关题 */}
          <div className="relative">
            <button
              onClick={() => { setShowRelated((v) => !v); setShowAskable(false); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg transition-colors",
                showRelated ? "bg-teal-500 text-paper" : "bg-paper text-ink-700 hover:bg-teal-50",
              )}
            >
              <Link2 className="w-4 h-4" />
              <span className="text-sm font-medium">相关题</span>
              {relatedQuestions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-teal-100 text-teal-700">
                  {relatedQuestions.length}
                </span>
              )}
            </button>
            {showRelated && (
              <div className="absolute bottom-full right-0 mb-2 w-96 bg-paper rounded-lg shadow-xl border border-ink-100 p-3 max-h-96 overflow-auto">
                <div className="text-xs font-medium text-ink-600 mb-2">相关题目</div>
                {relatedQuestions.length === 0 ? (
                  <div className="text-xs text-ink-400 py-3 text-center">未预设相关题</div>
                ) : (
                  <div className="space-y-2">
                    {relatedQuestions.map((q) => (
                      <div key={q.id} className="p-2.5 rounded-md border border-ink-100 hover:border-teal-200">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-50 text-teal-700">
                            {questionTypeLabel[q.type]}
                          </span>
                          <span className="text-[10px] text-ink-400">
                            难度 {q.difficulty}
                          </span>
                        </div>
                        <div className="text-xs text-ink-800 leading-relaxed line-clamp-3">
                          {q.stem}
                        </div>
                        <div className="mt-1.5 text-[11px] text-emerald-700">
                          答案：{q.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 左下角：题目内容按需显示 */}
        {currentSlide?.type === "question" && questionContentControls.length > 0 && (
          <div className="absolute bottom-20 left-6 z-30 flex items-center gap-1.5 rounded-xl bg-paper/95 p-1.5 shadow-lg backdrop-blur">
            <span className="px-2 text-xs font-medium text-ink-500">显示内容</span>
            {questionContentControls.map(({ key, label }) => {
              const visible = questionVisibility[key];
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={visible}
                  onClick={() => toggleQuestionContent(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    visible
                      ? "bg-emerald-500 text-paper"
                      : "text-ink-700 hover:bg-emerald-50",
                  )}
                >
                  {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* 底部居中的书写工具 */}
        <div
          className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-end gap-1.5 rounded-2xl border border-white/60 bg-paper/95 px-2.5 py-2 shadow-2xl backdrop-blur"
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          aria-label="书写工具"
        >
          {drawingPresets.map((preset) => {
            const selected = tool === preset.id;
            const Icon = preset.kind === "pen" ? PenLine : Highlighter;
            return (
              <div key={preset.id} className="relative">
                {colorMenuToolId === preset.id && (
                  <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-xl border border-ink-100 bg-paper p-2 shadow-xl">
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
                          setColorMenuToolId(null);
                          setTool(preset.id);
                        }}
                      />
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  aria-label={preset.label}
                  aria-pressed={selected}
                  onClick={() => {
                    setTool(selected ? "none" : preset.id);
                    setColorMenuToolId(null);
                  }}
                  className={cn(
                    "relative flex h-12 w-11 items-center justify-center rounded-xl transition-all",
                    selected
                      ? "-translate-y-1 bg-gold-100 shadow-md ring-2 ring-gold-400"
                      : "bg-mist text-ink-600 hover:-translate-y-0.5 hover:bg-ink-100",
                  )}
                  title={preset.label}
                >
                  <Icon
                    className="h-7 w-7 rotate-180"
                    style={{ color: preset.color }}
                  />
                </button>
                {selected && (
                  <button
                    type="button"
                    aria-label={`更改${preset.label}颜色`}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink-800 text-paper shadow"
                    onClick={(event) => {
                      event.stopPropagation();
                      setColorMenuToolId((current) => current === preset.id ? null : preset.id);
                    }}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          <div className="mx-1 h-9 w-px self-center bg-ink-200" />
          <button
            type="button"
            aria-label="橡皮擦"
            aria-pressed={tool === "eraser"}
            onClick={() => {
              setTool(tool === "eraser" ? "none" : "eraser");
              setColorMenuToolId(null);
            }}
            className={cn(
              "flex h-12 w-11 items-center justify-center rounded-xl transition-all",
              tool === "eraser"
                ? "-translate-y-1 bg-gold-100 text-ink-900 shadow-md ring-2 ring-gold-400"
                : "bg-mist text-ink-600 hover:bg-ink-100",
            )}
            title="橡皮擦"
          >
            <Eraser className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="清空批注"
            onClick={clearCanvas}
            className="flex h-12 w-11 items-center justify-center rounded-xl bg-mist text-ink-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title="清空批注"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function toastRandom(name: string) {
  // 简单的点名效果
  const div = document.createElement("div");
  div.className = "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-8 py-4 bg-gold-400 text-ink-900 rounded-xl shadow-2xl text-2xl font-serif font-bold";
  div.textContent = `请回答：${name}`;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.transition = "opacity 0.5s";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 500);
  }, 1500);
}
