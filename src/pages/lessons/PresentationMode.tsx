import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, ChevronLeft, ChevronRight, Pen, Eraser, Trash2,
  Palette, FileQuestion, Blocks, Users, Link2, Eye, EyeOff, Presentation,
} from "lucide-react";
import type { LessonSlide, Question } from "@/types";
import { cn } from "@/lib/utils";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";

interface PresentationModeProps {
  slides: LessonSlide[];
  initialIndex: number;
  students: { id: string; name: string }[];
  relatedQuestionsById: Record<string, Question>;
  onExit: () => void;
}

type Tool = "none" | "pen" | "eraser";

const penColors = [
  { value: "#dc2626", label: "红" },
  { value: "#2563eb", label: "蓝" },
  { value: "#16a34a", label: "绿" },
  { value: "#ca8a04", label: "黄" },
  { value: "#1f2937", label: "黑" },
];

const questionTypeLabel: Record<string, string> = {
  single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答",
};

export function PresentationMode({
  slides, initialIndex, students, relatedQuestionsById, onExit,
}: PresentationModeProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [tool, setTool] = useState<Tool>("none");
  const [penColor, setPenColor] = useState("#dc2626");
  const [penWidth, setPenWidth] = useState(3);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const [showAskable, setShowAskable] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const pathsRef = useRef<{ x: number; y: number }[][]>([]);

  const currentSlide = slides[currentIndex];

  // 切换页面时清空画板
  useEffect(() => {
    clearCanvas();
    setShowAnswer(false);
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
      ctx.lineWidth = penWidth * 6;
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = penWidth;
      ctx.strokeStyle = penColor;
    }
    ctx.stroke();
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

  const askableStudents = (currentSlide?.askableStudentIds || [])
    .map((id) => students.find((s) => s.id === id))
    .filter((s): s is { id: string; name: string } => !!s);

  const relatedQuestions = (currentSlide?.relatedQuestionIds || [])
    .map((id) => relatedQuestionsById[id])
    .filter((q): q is Question => !!q);

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
        {/* 画笔工具组 */}
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={() => setTool(tool === "pen" ? "none" : "pen")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              tool === "pen" ? "bg-gold-400 text-ink-900" : "hover:bg-ink-800 text-ink-200",
            )}
            title="画笔"
          >
            <Pen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool(tool === "eraser" ? "none" : "eraser")}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              tool === "eraser" ? "bg-gold-400 text-ink-900" : "hover:bg-ink-800 text-ink-200",
            )}
            title="橡皮擦"
          >
            <Eraser className="w-4 h-4" />
          </button>
          {tool === "pen" && (
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-ink-700">
              <Palette className="w-3.5 h-3.5 text-ink-400" />
              {penColors.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setPenColor(c.value)}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-transform",
                    penColor === c.value ? "border-paper scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
              <select
                value={penWidth}
                onChange={(e) => setPenWidth(parseInt(e.target.value))}
                className="ml-1 bg-ink-800 text-paper text-xs rounded px-1 py-0.5 border border-ink-700"
              >
                <option value={2}>细</option>
                <option value={3}>中</option>
                <option value={5}>粗</option>
                <option value={8}>特粗</option>
              </select>
            </div>
          )}
          <button
            onClick={clearCanvas}
            className="p-1.5 rounded-md hover:bg-ink-800 text-ink-200 ml-1"
            title="清空画板"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="h-5 w-px bg-ink-700" />
        <div className="text-sm text-ink-200">
          {currentIndex + 1} / {slides.length}
        </div>
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
          <div className={cn(
            "bg-paper rounded-xl shadow-2xl w-full max-w-5xl h-full max-h-full overflow-auto",
            currentSlide?.type === "courseware" ? "p-0" : "p-12",
          )}>
            {currentSlide?.type === "question" && currentSlide.questionSnapshot ? (
              <div className="space-y-8">
                <div className="flex items-center gap-2 pb-4 border-b border-ink-100">
                  <span className="px-2 py-0.5 rounded text-xs bg-gold-100 text-gold-800 font-medium">
                    {questionTypeLabel[currentSlide.questionSnapshot.type]}题
                  </span>
                  <span className="font-serif text-xl font-semibold text-ink-900">
                    {currentSlide.title}
                  </span>
                </div>
                <div className="text-xl text-ink-900 leading-relaxed whitespace-pre-wrap">
                  {currentSlide.questionSnapshot.stem}
                </div>
                {currentSlide.questionSnapshot.options && (
                  <div className="space-y-2">
                    {currentSlide.questionSnapshot.options.map((opt, i) => {
                      const isAnswer = showAnswer && currentSlide.questionSnapshot?.answer?.includes(String.fromCharCode(65 + i));
                      return (
                        <div
                          key={i}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border-2 text-lg",
                            isAnswer
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-ink-100 bg-mist/30",
                          )}
                        >
                          <span className="w-7 h-7 rounded-full bg-ink-900 text-paper flex items-center justify-center text-sm font-mono flex-shrink-0">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="text-ink-800">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {showAnswer && (
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-ink-100 animate-fade-in">
                    <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                      <div className="text-xs text-emerald-700 font-medium mb-1">参考答案</div>
                      <div className="text-base font-medium text-emerald-900 whitespace-pre-wrap">
                        {currentSlide.questionSnapshot.answer}
                      </div>
                    </div>
                    <div className="p-4 rounded-lg bg-gold-50 border border-gold-200">
                      <div className="text-xs text-gold-700 font-medium mb-1">解析</div>
                      <div className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">
                        {currentSlide.questionSnapshot.analysis}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : currentSlide?.type === "courseware" ? (
              <CoursewareEmbed courseware={currentSlide} title={currentSlide.title} className="h-full min-h-[60vh]" />
            ) : (
              <div className="space-y-4">
                <div className="font-serif text-2xl font-bold text-ink-900 pb-4 border-b border-ink-100">
                  {currentSlide?.title}
                </div>
                <div className="text-lg text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {currentSlide?.content}
                </div>
              </div>
            )}
          </div>
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
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-ink-900/60 text-paper flex items-center justify-center hover:bg-ink-900 disabled:opacity-30 disabled:cursor-not-allowed z-20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={goNext}
          disabled={currentIndex === slides.length - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-ink-900/60 text-paper flex items-center justify-center hover:bg-ink-900 disabled:opacity-30 disabled:cursor-not-allowed z-20"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* 右下角：相关题和提问学生 */}
        <div className="absolute bottom-6 right-6 z-30 flex items-end gap-3">
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

        {/* 左下角：显示/隐藏答案按钮（仅题目页） */}
        {currentSlide?.type === "question" && (
          <div className="absolute bottom-6 left-6 z-30">
            <button
              onClick={() => setShowAnswer((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg shadow-lg transition-colors",
                showAnswer
                  ? "bg-emerald-500 text-paper"
                  : "bg-paper text-ink-700 hover:bg-emerald-50",
              )}
            >
              {showAnswer ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-sm font-medium">
                {showAnswer ? "隐藏答案" : "显示答案"}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 底部页面缩略图 */}
      <div className="h-20 bg-ink-900 border-t border-ink-700 flex items-center gap-2 px-4 overflow-x-auto">
        {slides.map((slide, idx) => (
          <button
            key={slide.id}
            onClick={() => setCurrentIndex(idx)}
            className={cn(
              "flex-shrink-0 w-24 h-14 rounded-md border-2 flex items-center justify-center text-xs transition-all",
              idx === currentIndex
                ? "border-gold-400 bg-gold-400/20 text-gold-300"
                : "border-ink-700 bg-ink-800 text-ink-400 hover:border-ink-500",
            )}
          >
            <div className="flex flex-col items-center">
              {slide.type === "question" ? (
                <FileQuestion className="w-3 h-3 mb-0.5" />
              ) : slide.type === "courseware" ? (
                <Presentation className="w-3 h-3 mb-0.5" />
              ) : (
                <Blocks className="w-3 h-3 mb-0.5" />
              )}
              <span className="text-[10px]">{idx + 1}</span>
            </div>
          </button>
        ))}
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
