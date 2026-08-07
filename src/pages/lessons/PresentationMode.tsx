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
  LogOut,
  Maximize2,
  Minimize2,
  Move,
  MousePointer2,
  NotebookPen,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LessonSlide, LessonSlideElement, Question } from "@/types";
import { cn } from "@/lib/utils";
import { getMaximumContrastTextColor, normalizeHexColor } from "@/lib/color-contrast";
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
  ariaLabel?: string;
}

interface BoardWritingArea {
  id: string;
  frameX: number;
  frameY: number;
  clearToken: number;
}

interface BoardPage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  writingAreas: BoardWritingArea[];
  activeWritingAreaId: string;
}

type BoardResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface BoardInteraction {
  mode: "move" | "resize" | "move-frame";
  boardId: string;
  writingAreaId?: string;
  resizeDirection?: BoardResizeDirection;
  startX: number;
  startY: number;
  board: BoardPage;
}

interface BoardResizeHandle {
  direction: BoardResizeDirection;
  label: string;
  className: string;
  corner?: boolean;
}

type TextColorMode = "auto" | "custom";

interface PresentationColorPreferences {
  pageBackgroundColor: string;
  textColorMode: TextColorMode;
  textColor: string;
  boardBackgroundColor: string;
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

const PRESENTATION_COLOR_PREFERENCES_KEY = "inteschool-presentation-color-preferences";
const DEFAULT_COLOR_PREFERENCES: PresentationColorPreferences = {
  pageBackgroundColor: "#fffef8",
  textColorMode: "auto",
  textColor: "#111827",
  boardBackgroundColor: "#fffef8",
};
const COLOR_PRESETS = ["#fffef8", "#ffffff", "#f8fafc", "#fff7ed", "#eff6ff", "#ecfdf5", "#111827"];

const BOARD_RESIZE_HANDLES: BoardResizeHandle[] = [
  { direction: "n", label: "上边", className: "left-4 right-4 top-0 h-2 cursor-ns-resize" },
  { direction: "ne", label: "右上角", className: "right-0 top-0 h-4 w-4 cursor-nesw-resize", corner: true },
  { direction: "e", label: "右边", className: "bottom-4 right-0 top-4 w-2 cursor-ew-resize" },
  { direction: "se", label: "右下角", className: "bottom-0 right-0 h-4 w-4 cursor-nwse-resize", corner: true },
  { direction: "s", label: "下边", className: "bottom-0 left-4 right-4 h-2 cursor-ns-resize" },
  { direction: "sw", label: "左下角", className: "bottom-0 left-0 h-4 w-4 cursor-nesw-resize", corner: true },
  { direction: "w", label: "左边", className: "bottom-4 left-0 top-4 w-2 cursor-ew-resize" },
  { direction: "nw", label: "左上角", className: "left-0 top-0 h-4 w-4 cursor-nwse-resize", corner: true },
];

const PRESENTATION_ELEMENT_PREFIX = "presentation-built-in";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readColorPreferences(): PresentationColorPreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(PRESENTATION_COLOR_PREFERENCES_KEY) || "null") as Partial<PresentationColorPreferences> | null;
    if (!stored) return DEFAULT_COLOR_PREFERENCES;
    return {
      pageBackgroundColor: normalizeHexColor(
        stored.pageBackgroundColor,
        DEFAULT_COLOR_PREFERENCES.pageBackgroundColor,
      ),
      textColorMode: stored.textColorMode === "custom" ? "custom" : "auto",
      textColor: normalizeHexColor(stored.textColor, DEFAULT_COLOR_PREFERENCES.textColor),
      boardBackgroundColor: normalizeHexColor(
        stored.boardBackgroundColor,
        DEFAULT_COLOR_PREFERENCES.boardBackgroundColor,
      ),
    };
  } catch {
    return DEFAULT_COLOR_PREFERENCES;
  }
}

function boardBackgroundStyle(backgroundColor: string): CSSProperties {
  return {
    backgroundColor,
    backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 31px, rgba(37, 99, 235, 0.13) 32px)",
  };
}

function asPresentationText(
  slide: LessonSlide,
  suffix: string,
  content: string,
  position: Pick<LessonSlideElement, "x" | "y" | "width" | "height">,
  options?: Pick<Extract<LessonSlideElement, { kind: "text" }>, "fontSize" | "textAlign" | "questionSection">,
): LessonSlideElement {
  return {
    id: `${PRESENTATION_ELEMENT_PREFIX}-${slide.id}-${suffix}`,
    kind: "text",
    content,
    ...position,
    ...options,
  };
}

function getPresentationElements(slide: LessonSlide): LessonSlideElement[] {
  const existing = slide.elements || [];
  if (slide.freeformLayout || slide.type === "courseware") return existing;

  if (slide.type === "section") {
    return [
      asPresentationText(
        slide,
        "section-title",
        slide.title,
        { x: 10, y: 18, width: 80, height: 24 },
        { fontSize: slide.textStyles?.title?.fontSize || 38, textAlign: "center" },
      ),
      ...(slide.content ? [asPresentationText(
        slide,
        "section-content",
        slide.content,
        { x: 14, y: 48, width: 72, height: 28 },
        { fontSize: slide.textStyles?.content?.fontSize || 22, textAlign: "center" },
      )] : []),
      ...existing,
    ];
  }

  if (slide.type === "question" && slide.questionSnapshot) {
    const question = slide.questionSnapshot;
    const optionWidth = question.options && question.options.length > 1 ? 43 : 90;
    const optionElements = (question.options || []).map((option, index) => asPresentationText(
      slide,
      `option-${index}`,
      `<strong>${String.fromCharCode(65 + index)}.</strong> ${option}`,
      {
        x: 5 + (index % 2) * 47,
        y: 32 + Math.floor(index / 2) * 15,
        width: optionWidth,
        height: 12,
      },
      { fontSize: slide.textStyles?.options?.fontSize || 20, questionSection: "options" },
    ));
    return [
      asPresentationText(
        slide,
        "stem",
        question.stem,
        { x: 5, y: 5, width: 90, height: 23 },
        { fontSize: slide.textStyles?.stem?.fontSize || 26, questionSection: "stem" },
      ),
      ...optionElements,
      asPresentationText(
        slide,
        "answer",
        `<strong>参考答案</strong><br />${question.answer || "暂无答案"}`,
        { x: 5, y: 68, width: 42, height: 24 },
        { fontSize: 18, questionSection: "answer" },
      ),
      asPresentationText(
        slide,
        "analysis",
        `<strong>解析</strong><br />${question.analysis || "暂无解析"}${question.summary ? `<br /><strong>总结</strong><br />${question.summary}` : ""}`,
        { x: 53, y: 68, width: 42, height: 24 },
        { fontSize: 18, questionSection: "analysis" },
      ),
      ...existing,
    ];
  }

  return [
    ...(slide.content ? [asPresentationText(
      slide,
      "knowledge-content",
      slide.content,
      { x: 5, y: 6, width: 90, height: 88 },
      { fontSize: slide.textStyles?.content?.fontSize || 24 },
    )] : []),
    ...existing,
  ];
}

function WritableCanvas({ tool, preset, clearToken, className, ariaLabel }: WritableCanvasProps) {
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
    const parent = canvasRef.current?.parentElement;
    const observer = typeof ResizeObserver === "undefined" || !parent
      ? null
      : new ResizeObserver(resizeCanvas);
    observer?.observe(parent);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      observer?.disconnect();
    };
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
      aria-label={ariaLabel}
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
    <span className="relative block h-7 w-6" aria-hidden="true">
      <span
        data-pen-tip="up"
        className="absolute left-1/2 top-0 block h-2 w-2 -translate-x-1/2 rotate-45 border-l-2 border-t-2"
        style={{ color: preset.color }}
      />
      <span
        className="absolute bottom-0 left-1/2 block h-[22px] -translate-x-1/2 rounded-b-full rounded-t-sm"
        style={{
          width: `${thickness}px`,
          backgroundColor: preset.color,
          opacity: preset.kind === "highlighter" ? 0.7 : 1,
        }}
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const boardInteractionRef = useRef<BoardInteraction | null>(null);
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
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [boards, setBoards] = useState<BoardPage[]>([]);
  const [boardsVisible, setBoardsVisible] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [mainClearToken, setMainClearToken] = useState(0);
  const [colorSettingsOpen, setColorSettingsOpen] = useState(false);
  const [colorPreferences, setColorPreferences] = useState<PresentationColorPreferences>(readColorPreferences);

  const currentSlide = slides[currentIndex];
  const selectedDrawingPreset = drawingPresets.find((preset) => preset.id === tool);
  const effectiveTextColor = colorPreferences.textColorMode === "auto"
    ? getMaximumContrastTextColor(colorPreferences.pageBackgroundColor)
    : colorPreferences.textColor;
  const baseCurrentElements = currentSlide ? getPresentationElements(currentSlide) : [];
  const currentElements = currentSlide
    ? elementOverrides[currentSlide.id] ?? baseCurrentElements
    : [];
  const selectedTextElement = currentElements.find((element) => (
    element.id === selectedElementId && element.kind === "text"
  ));
  const displayedSlide = currentSlide
    ? {
        ...currentSlide,
        freeformLayout: currentSlide.type === "courseware" ? currentSlide.freeformLayout : true,
        elements: currentElements,
      }
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
    localStorage.setItem(PRESENTATION_COLOR_PREFERENCES_KEY, JSON.stringify(colorPreferences));
  }, [colorPreferences]);

  useEffect(() => {
    setQuestionVisibility({ ...STEM_ONLY_QUESTION_VISIBILITY });
    setSidePanel(null);
    setSelectedElementId(null);
    setColorSettingsOpen(false);
    setMainClearToken((value) => value + 1);
  }, [currentIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) {
        return;
      }
      if (event.key === "Escape") {
        if (boardsVisible) {
          setBoardsVisible(false);
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
  }, [boardsVisible, onExit, sidePanel, slides.length]);

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

  const scaleSelectedText = (factor: number) => {
    if (!selectedElementId || !currentSlide) return;
    setElementOverrides((current) => {
      const source = current[currentSlide.id] ?? getPresentationElements(currentSlide);
      return {
        ...current,
        [currentSlide.id]: source.map((element) => {
          if (element.id !== selectedElementId || element.kind !== "text") return element;
          const previousFontSize = element.fontSize || 24;
          const fontSize = Number(clamp(previousFontSize * factor, 12, 96).toFixed(2));
          const appliedFactor = fontSize / previousFontSize;
          const centerX = element.x + element.width / 2;
          const centerY = element.y + element.height / 2;
          const width = Number(clamp(element.width * appliedFactor, 6, 100).toFixed(4));
          const height = Number(clamp(element.height * appliedFactor, 6, 100).toFixed(4));
          return {
            ...element,
            fontSize,
            width,
            height,
            x: Number(clamp(centerX - width / 2, 0, 100 - width).toFixed(4)),
            y: Number(clamp(centerY - height / 2, 0, 100 - height).toFixed(4)),
          };
        }),
      };
    });
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
    if (boardsVisible && activeBoardId) {
      setBoards((current) => current.map((board) => (
        board.id === activeBoardId
          ? {
              ...board,
              writingAreas: board.writingAreas.map((area) => (
                area.id === board.activeWritingAreaId
                  ? { ...area, clearToken: area.clearToken + 1 }
                  : area
              )),
            }
          : board
      )));
      return;
    }
    setMainClearToken((value) => value + 1);
  };

  const addBoard = () => {
    const index = boards.length;
    const offset = (index % 5) * 3;
    const boardId = `board-${Date.now()}-${index}`;
    const firstWritingArea: BoardWritingArea = {
      id: `${boardId}-writing-area-1`,
      frameX: 0,
      frameY: 0,
      clearToken: 0,
    };
    const board: BoardPage = {
      id: boardId,
      x: 16 + offset,
      y: 10 + offset,
      width: 68,
      height: 62,
      writingAreas: [firstWritingArea],
      activeWritingAreaId: firstWritingArea.id,
    };
    setBoards((current) => [...current, board]);
    setActiveBoardId(board.id);
    setBoardsVisible(true);
  };

  const addWritingArea = (boardId: string) => {
    setBoards((current) => current.map((board) => {
      if (board.id !== boardId) return board;
      const index = board.writingAreas.length;
      const writingArea: BoardWritingArea = {
        id: `${board.id}-writing-area-${Date.now()}-${index}`,
        frameX: 0,
        frameY: 0,
        clearToken: 0,
      };
      return {
        ...board,
        writingAreas: [...board.writingAreas, writingArea],
        activeWritingAreaId: writingArea.id,
      };
    }));
    setActiveBoardId(boardId);
    setBoardsVisible(true);
  };

  const selectWritingArea = (boardId: string, writingAreaId: string) => {
    setBoards((current) => current.map((board) => (
      board.id === boardId ? { ...board, activeWritingAreaId: writingAreaId } : board
    )));
    setActiveBoardId(boardId);
  };

  const toggleBoards = () => {
    if (boards.length === 0) {
      addBoard();
      return;
    }
    setBoardsVisible((visible) => !visible);
  };

  const removeBoard = (boardId: string) => {
    const next = boards.filter((board) => board.id !== boardId);
    setBoards(next);
    if (activeBoardId === boardId) setActiveBoardId(next.at(-1)?.id || null);
    if (next.length === 0) setBoardsVisible(false);
  };

  const startBoardInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    board: BoardPage,
    mode: BoardInteraction["mode"],
    options?: Pick<BoardInteraction, "writingAreaId" | "resizeDirection">,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveBoardId(board.id);
    boardInteractionRef.current = {
      mode,
      boardId: board.id,
      writingAreaId: options?.writingAreaId,
      resizeDirection: options?.resizeDirection,
      startX: event.clientX,
      startY: event.clientY,
      board,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveBoardInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = boardInteractionRef.current;
    const surface = surfaceRef.current;
    if (!interaction || !surface) return;
    const rect = surface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dx = ((event.clientX - interaction.startX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startY) / rect.height) * 100;
    setBoards((current) => current.map((board) => {
      if (board.id !== interaction.boardId) return board;
      if (interaction.mode === "move") {
        const visibleX = Math.min(board.width, (64 / rect.width) * 100);
        const visibleY = Math.min(board.height, (64 / rect.height) * 100);
        return {
          ...board,
          x: Number(clamp(
            interaction.board.x + dx,
            visibleX - interaction.board.width,
            100 - visibleX,
          ).toFixed(4)),
          y: Number(clamp(
            interaction.board.y + dy,
            visibleY - interaction.board.height,
            100 - visibleY,
          ).toFixed(4)),
        };
      }
      if (interaction.mode === "move-frame") {
        const sourceArea = interaction.board.writingAreas.find((area) => (
          area.id === interaction.writingAreaId
        ));
        if (!sourceArea || !interaction.writingAreaId) return board;
        const visibleX = Math.min(board.width, (48 / rect.width) * 100);
        const visibleY = Math.min(board.height, (48 / rect.height) * 100);
        return {
          ...board,
          writingAreas: board.writingAreas.map((area) => (
            area.id === interaction.writingAreaId
              ? {
                  ...area,
                  frameX: Number(clamp(
                    sourceArea.frameX + dx,
                    visibleX - 100,
                    board.width - visibleX,
                  ).toFixed(4)),
                  frameY: Number(clamp(
                    sourceArea.frameY + dy,
                    visibleY - 100,
                    board.height - visibleY,
                  ).toFixed(4)),
                }
              : area
          )),
        };
      }

      const direction = interaction.resizeDirection || "se";
      let x = interaction.board.x;
      let y = interaction.board.y;
      let width = interaction.board.width;
      let height = interaction.board.height;

      if (direction.includes("e")) {
        width = clamp(interaction.board.width + dx, 28, 100);
      }
      if (direction.includes("w")) {
        width = clamp(interaction.board.width - dx, 28, 100);
        x = interaction.board.x + interaction.board.width - width;
      }
      if (direction.includes("s")) {
        height = clamp(interaction.board.height + dy, 24, 100);
      }
      if (direction.includes("n")) {
        height = clamp(interaction.board.height - dy, 24, 100);
        y = interaction.board.y + interaction.board.height - height;
      }
      return {
        ...board,
        x: Number(x.toFixed(4)),
        y: Number(y.toFixed(4)),
        width: Number(width.toFixed(4)),
        height: Number(height.toFixed(4)),
      };
    }));
  };

  const endBoardInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!boardInteractionRef.current) return;
    boardInteractionRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
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

  const renderSideControls = (side: Side) => {
    const tabs: Array<{ id: SideTab; short: string; label: string; icon: typeof Eye }> = [
      { id: "display", short: "显", label: "显示内容", icon: Eye },
      { id: "ask", short: "问", label: "提问学生", icon: Users },
      { id: "related", short: "题", label: "相关题", icon: Link2 },
    ];
    const activeTab = sidePanel?.side === side ? sidePanel.tab : null;
    return (
      <div
        data-presentation-side-controls={side}
        className="relative flex items-center gap-0.5"
      >
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
                "flex h-8 w-7 flex-col items-center justify-center gap-0 text-paper/80 transition-colors",
                active ? "rounded-md bg-gold-400 text-ink-900" : "rounded-md hover:bg-white/10 hover:text-paper",
              )}
              title={label}
            >
              <Icon className="h-3 w-3" />
              <span className="text-[9px] font-semibold leading-3">{short}</span>
            </button>
          );
        })}
        {activeTab && (
          <section
            className={cn(
              "absolute bottom-full z-[100] mb-2 w-72 rounded-xl border border-ink-100 bg-paper p-4 text-ink-900 shadow-2xl",
              side === "left" ? "left-0" : "right-0",
            )}
          >
            {renderPanelContent(activeTab)}
          </section>
        )}
      </div>
    );
  };

  const renderPageNavigation = (side: Side) => (
    <div
      className={cn(
        "absolute bottom-3 z-[90] flex items-center gap-1 rounded-xl border border-white/15 bg-ink-900/80 p-1 text-paper shadow-xl backdrop-blur",
        side === "left" ? "left-4" : "right-4",
      )}
      aria-label={`${side === "left" ? "左侧" : "右侧"}翻页控制`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {side === "left" && (
        <button
          type="button"
          onClick={onExit}
          aria-label="下课"
          className="flex h-8 items-center gap-1 rounded-lg bg-red-500/15 px-2.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/30"
        >
          <LogOut className="h-3.5 w-3.5" />
          下课
        </button>
      )}
      {renderSideControls(side)}
      <div className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />
      <button
        type="button"
        onClick={goPrev}
        disabled={currentIndex === 0}
        aria-label={`${side === "left" ? "左侧" : "右侧"}上一页`}
        title="上一页"
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={currentIndex === slides.length - 1}
        aria-label={`${side === "left" ? "左侧" : "右侧"}下一页`}
        title="下一页"
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex flex-col bg-ink-900">
      <div
        ref={surfaceRef}
        data-testid="presentation-surface"
        className="relative flex-1 overflow-hidden bg-ink-800"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-full w-full items-center justify-center">
            {displayedSlide?.type === "courseware" ? (
              <div
                data-testid="presentation-slide-page"
                className="h-full w-full overflow-hidden bg-paper"
                style={{ backgroundColor: colorPreferences.pageBackgroundColor }}
              >
                <CoursewareEmbed courseware={displayedSlide} title={displayedSlide.title} className="h-full min-h-0" />
              </div>
            ) : displayedSlide ? (
              <div data-testid="presentation-slide-page" className="h-full w-full">
                <LessonSlideCanvas
                  key={displayedSlide.id}
                  elements={visibleSlideElements}
                  editable={tool === "select"}
                  allowTextEditing={false}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onElementsChange={updateVisibleElements}
                  className="h-full w-full aspect-auto rounded-none shadow-none"
                  canvasStyle={{ backgroundColor: colorPreferences.pageBackgroundColor }}
                  textColor={effectiveTextColor}
                  textBackgroundColor="transparent"
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
          tool={tool}
          preset={selectedDrawingPreset}
          clearToken={mainClearToken}
          ariaLabel="课件批注画布"
          className="z-10"
        />

        {renderPageNavigation("left")}
        {renderPageNavigation("right")}

        {boards.map((board, index) => {
          const active = activeBoardId === board.id;
          const label = `板书 ${index + 1}`;
          return (
            <section
              key={board.id}
              role="region"
              aria-label={label}
              data-active={active}
              data-board-layer
              className={cn(
                "absolute rounded-xl border-2 bg-ink-700/30 shadow-2xl transition-[box-shadow,opacity]",
                active ? "border-gold-400 ring-2 ring-gold-300/60" : "border-ink-600",
                !boardsVisible && "invisible pointer-events-none opacity-0",
              )}
              style={{
                left: `${board.x}%`,
                top: `${board.y}%`,
                width: `${board.width}%`,
                height: `${board.height}%`,
                zIndex: active ? 60 : 26 + index,
              }}
              onPointerDown={() => setActiveBoardId(board.id)}
            >
              <div className="absolute inset-0 overflow-hidden rounded-[10px]">
                {board.writingAreas.map((writingArea, writingAreaIndex) => {
                  const activeWritingArea = board.activeWritingAreaId === writingArea.id;
                  return (
                    <div
                      key={writingArea.id}
                      data-board-writing-frame
                      data-writing-area-index={writingAreaIndex + 1}
                      data-active={activeWritingArea}
                      data-draggable={activeWritingArea && tool === "select"}
                      className={cn(
                        "absolute touch-none overflow-hidden border border-ink-300/70 shadow-inner",
                        activeWritingArea ? "visible" : "invisible pointer-events-none",
                        activeWritingArea && tool === "select" && "cursor-move",
                      )}
                      style={{
                        ...boardBackgroundStyle(colorPreferences.boardBackgroundColor),
                        left: `${(writingArea.frameX / board.width) * 100}%`,
                        top: `${(writingArea.frameY / board.height) * 100}%`,
                        width: `${10000 / board.width}%`,
                        height: `${10000 / board.height}%`,
                      }}
                      onPointerDown={(event) => {
                        if (activeWritingArea && tool === "select") {
                          startBoardInteraction(event, board, "move-frame", {
                            writingAreaId: writingArea.id,
                          });
                        }
                      }}
                      onPointerMove={moveBoardInteraction}
                      onPointerUp={endBoardInteraction}
                      onPointerCancel={endBoardInteraction}
                    >
                      <div
                        data-board-divider="center"
                        className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-[1] w-px -translate-x-1/2 bg-red-600/20"
                        aria-hidden="true"
                      />
                      <WritableCanvas
                        tool={boardsVisible && active && activeWritingArea ? tool : "none"}
                        preset={selectedDrawingPreset}
                        clearToken={writingArea.clearToken}
                        ariaLabel={`${label}书写区 ${writingAreaIndex + 1}`}
                        className="z-10"
                      />
                    </div>
                  );
                })}

                <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-center justify-between">
                  <button
                    type="button"
                    aria-label={`移动${label}`}
                    className="pointer-events-auto flex h-8 w-8 shrink-0 cursor-move items-center justify-center rounded-lg bg-ink-900/50 text-paper shadow hover:bg-ink-900/80"
                    onPointerDown={(event) => startBoardInteraction(event, board, "move")}
                    onPointerMove={moveBoardInteraction}
                    onPointerUp={endBoardInteraction}
                    onPointerCancel={endBoardInteraction}
                  >
                    <Move className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除${label}`}
                    onClick={() => removeBoard(board.id)}
                    className="pointer-events-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper/50 text-ink-500 shadow hover:bg-red-50/90 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  data-board-side-controls="left"
                  className="pointer-events-none absolute left-1 top-1/2 z-20 -translate-y-1/2"
                >
                  <button
                    type="button"
                    aria-label={`在${label}中新增书写区`}
                    onClick={() => addWritingArea(board.id)}
                    className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-transparent text-ink-500 drop-shadow-sm transition-colors hover:bg-paper/60 hover:text-teal-700"
                    title="新增书写区"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  data-board-side-controls="right"
                  role="tablist"
                  aria-label={`${label}书写区切换`}
                  className="pointer-events-auto absolute right-1 top-1/2 z-20 flex max-h-[calc(100%_-_5rem)] -translate-y-1/2 flex-col items-center gap-0.5 overflow-y-auto"
                >
                  {board.writingAreas.map((writingArea, writingAreaIndex) => {
                    const selected = board.activeWritingAreaId === writingArea.id;
                    return (
                      <button
                        key={writingArea.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={`切换到${label}书写区 ${writingAreaIndex + 1}`}
                        onClick={() => selectWritingArea(board.id, writingArea.id)}
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent text-[10px] font-semibold drop-shadow-sm transition-colors",
                          selected
                            ? "bg-ink-900/55 text-paper"
                            : "text-ink-600 hover:bg-paper/60 hover:text-ink-900",
                        )}
                      >
                        {writingAreaIndex + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {BOARD_RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle.direction}
                  type="button"
                  aria-label={`从${handle.label}调整${label}大小`}
                  data-board-resize-handle={handle.direction}
                  className={cn(
                    "absolute z-30 touch-none border-0 bg-transparent p-0",
                    handle.className,
                  )}
                  onPointerDown={(event) => startBoardInteraction(event, board, "resize", {
                    resizeDirection: handle.direction,
                  })}
                  onPointerMove={moveBoardInteraction}
                  onPointerUp={endBoardInteraction}
                  onPointerCancel={endBoardInteraction}
                >
                  {handle.corner && (
                    <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper bg-gold-400 shadow" />
                  )}
                </button>
              ))}
            </section>
          );
        })}

        <div
          className="absolute bottom-3 left-1/2 z-[90] flex -translate-x-1/2 items-end gap-1 rounded-xl border border-white/60 bg-paper/95 px-1.5 py-1.5 shadow-2xl backdrop-blur"
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
            aria-label={boardsVisible && activeBoardId ? "清空当前板书" : "清空批注"}
            onClick={clearActiveSurface}
            className="flex h-10 w-9 items-center justify-center rounded-lg bg-mist text-ink-500 transition-colors hover:bg-red-50 hover:text-red-600"
            title={boardsVisible && activeBoardId ? "清空当前板书" : "清空批注"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={boardsVisible ? "收起板书" : "打开板书"}
            aria-pressed={boardsVisible}
            onClick={toggleBoards}
            className={cn(
              "flex h-10 w-9 items-center justify-center rounded-lg transition-colors",
              boardsVisible
                ? "bg-teal-100 text-teal-800 ring-2 ring-teal-400"
                : "bg-mist text-ink-600 hover:bg-teal-50 hover:text-teal-700",
            )}
            title="板书"
          >
            <NotebookPen className="h-5 w-5" />
          </button>
          <div className="relative">
            <button
              type="button"
              aria-label="页面与板书颜色设置"
              aria-expanded={colorSettingsOpen}
              onClick={() => setColorSettingsOpen((open) => !open)}
              className={cn(
                "relative flex h-10 w-9 items-center justify-center rounded-lg transition-colors",
                colorSettingsOpen
                  ? "bg-gold-100 text-ink-900 ring-2 ring-gold-400"
                  : "bg-mist text-ink-600 hover:bg-gold-50 hover:text-gold-700",
              )}
              title="页面、文字与板书颜色"
            >
              <Palette className="h-5 w-5" />
              <span
                className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-white shadow"
                style={{ backgroundColor: colorPreferences.pageBackgroundColor }}
                aria-hidden="true"
              />
            </button>

            {colorSettingsOpen && (
              <section
                role="dialog"
                aria-label="颜色设置"
                className="absolute bottom-full right-0 mb-2 w-72 rounded-xl border border-ink-100 bg-paper p-3 text-ink-900 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">颜色设置</h2>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-400">统一调整课件页面、文字和板书书写区。</p>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭颜色设置"
                    onClick={() => setColorSettingsOpen(false)}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 rounded-lg border border-ink-100 p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="presentation-page-color" className="text-xs font-medium text-ink-700">页面颜色</label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-ink-400">{colorPreferences.pageBackgroundColor}</span>
                      <input
                        id="presentation-page-color"
                        type="color"
                        aria-label="页面颜色"
                        value={colorPreferences.pageBackgroundColor}
                        onChange={(event) => setColorPreferences((current) => ({
                          ...current,
                          pageBackgroundColor: event.target.value,
                        }))}
                        className="h-7 w-9 cursor-pointer rounded border border-ink-100 bg-transparent p-0.5"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={`page-${color}`}
                        type="button"
                        aria-label={`页面颜色 ${color}`}
                        aria-pressed={colorPreferences.pageBackgroundColor === color}
                        onClick={() => setColorPreferences((current) => ({
                          ...current,
                          pageBackgroundColor: color,
                        }))}
                        className={cn(
                          "h-6 w-6 rounded-full border-2 shadow-sm",
                          colorPreferences.pageBackgroundColor === color ? "border-gold-500" : "border-paper",
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-2 rounded-lg border border-ink-100 p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-ink-700">文字颜色</div>
                      <div className="mt-0.5 text-[10px] text-ink-400">自动模式选择与页面反差更大的颜色。</div>
                    </div>
                    <span
                      className="h-5 w-5 flex-shrink-0 rounded-full border border-ink-100 shadow-sm"
                      style={{ backgroundColor: effectiveTextColor }}
                      aria-label={`当前文字颜色 ${effectiveTextColor}`}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-mist p-1">
                    <button
                      type="button"
                      aria-label="文字颜色自动对比"
                      aria-pressed={colorPreferences.textColorMode === "auto"}
                      onClick={() => setColorPreferences((current) => ({ ...current, textColorMode: "auto" }))}
                      className={cn(
                        "h-7 rounded-md text-[11px] font-medium",
                        colorPreferences.textColorMode === "auto"
                          ? "bg-paper text-ink-900 shadow-sm"
                          : "text-ink-500 hover:text-ink-800",
                      )}
                    >
                      自动对比
                    </button>
                    <button
                      type="button"
                      aria-label="自定义文字颜色"
                      aria-pressed={colorPreferences.textColorMode === "custom"}
                      onClick={() => setColorPreferences((current) => ({ ...current, textColorMode: "custom" }))}
                      className={cn(
                        "h-7 rounded-md text-[11px] font-medium",
                        colorPreferences.textColorMode === "custom"
                          ? "bg-paper text-ink-900 shadow-sm"
                          : "text-ink-500 hover:text-ink-800",
                      )}
                    >
                      自定义
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-[10px] uppercase text-ink-400">{effectiveTextColor}</span>
                    <input
                      type="color"
                      aria-label="文字颜色"
                      value={colorPreferences.textColor}
                      disabled={colorPreferences.textColorMode !== "custom"}
                      onChange={(event) => setColorPreferences((current) => ({
                        ...current,
                        textColorMode: "custom",
                        textColor: event.target.value,
                      }))}
                      className="h-7 w-9 cursor-pointer rounded border border-ink-100 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-35"
                    />
                  </div>
                </div>

                <div className="mt-2 rounded-lg border border-ink-100 p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor="presentation-board-color" className="text-xs font-medium text-ink-700">板书书写区背景</label>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase text-ink-400">{colorPreferences.boardBackgroundColor}</span>
                      <input
                        id="presentation-board-color"
                        type="color"
                        aria-label="板书背景颜色"
                        value={colorPreferences.boardBackgroundColor}
                        onChange={(event) => setColorPreferences((current) => ({
                          ...current,
                          boardBackgroundColor: event.target.value,
                        }))}
                        className="h-7 w-9 cursor-pointer rounded border border-ink-100 bg-transparent p-0.5"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setColorPreferences(DEFAULT_COLOR_PREFERENCES)}
                  className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  恢复默认颜色
                </button>
              </section>
            )}
          </div>
          <div
            aria-label="文本与全屏控制"
            className="absolute bottom-0 left-full ml-3 flex items-center gap-1 whitespace-nowrap rounded-xl border border-white/60 bg-paper/95 p-1.5 shadow-xl backdrop-blur"
          >
            <button
              type="button"
              aria-label="缩小所选文本"
              onClick={() => scaleSelectedText(0.9)}
              disabled={!selectedTextElement}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              title="缩小所选文本"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="放大所选文本"
              onClick={() => scaleSelectedText(1.1)}
              disabled={!selectedTextElement}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
              title="放大所选文本"
            >
              <ZoomIn className="h-4 w-4" />
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
        </div>
      </div>
    </div>
  );
}
