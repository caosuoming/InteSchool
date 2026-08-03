import {
  useCallback,
  useState,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate, useParams } from "react-router";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Send, Save,
  FileQuestion, Blocks, Check,
  Play, School, ExternalLink,
  GripVertical, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { questionService } from "@/services/question";
import { classService } from "@/services/class";
import { uploadFile } from "@/services/api";
import type {
  LessonCourseware,
  LessonSlide,
  LessonSlideElement,
  LessonSlideTextRegion,
  Question,
  Student,
  SchoolClass,
} from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/service-utils";
import { PresentationMode } from "./PresentationMode";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { getCoursewareEditorUrl } from "@/lib/courseware-online";
import { LessonSlideCanvas } from "@/components/lessons/LessonSlideCanvas";
import { LessonSlideContent } from "@/components/lessons/LessonSlideContent";
import { LessonEditorInspector } from "@/components/lessons/LessonEditorInspector";
import {
  getVisibleLessonSlideElements,
  mergeVisibleLessonSlideElements,
  STEM_ONLY_QUESTION_VISIBILITY,
} from "@/lib/lesson-slide-visibility";

const INSPECTOR_MIN_WIDTH = 220;
const INSPECTOR_MAX_WIDTH = 420;
const INSPECTOR_DEFAULT_WIDTH = 248;
const SLIDE_NAV_MIN_WIDTH = 144;
const SLIDE_NAV_MAX_WIDTH = 320;
const SLIDE_NAV_DEFAULT_WIDTH = 176;

interface InspectorResizeState {
  startX: number;
  startWidth: number;
}

interface SlideNavigatorResizeState {
  startX: number;
  startWidth: number;
}

export function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { teacher } = useAuthStore();

  const [courseware, setCourseware] = useState<LessonCourseware | null>(null);
  const [slides, setSlides] = useState<LessonSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [relatedQuestions, setRelatedQuestions] = useState<Question[]>([]);
  // 所有相关题的缓存（id -> Question），供预览模式使用
  const [relatedQuestionsMap, setRelatedQuestionsMap] = useState<Record<string, Question>>({});

  // 预览模式
  const [previewMode, setPreviewMode] = useState(false);

  // 题目公式编辑器（编辑题干/答案/解析）
  const [formulaEditTarget, setFormulaEditTarget] = useState<{
    field: "stem" | "answer" | "analysis";
    value: string;
  } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedTextRegion, setSelectedTextRegion] = useState<LessonSlideTextRegion | null>(null);
  const [slideNavigatorWidth, setSlideNavigatorWidth] = useState(SLIDE_NAV_DEFAULT_WIDTH);
  const [slideNavigatorCollapsed, setSlideNavigatorCollapsed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const slideNavigatorResizeRef = useRef<SlideNavigatorResizeState | null>(null);
  const inspectorResizeRef = useRef<InspectorResizeState | null>(null);

  const loadCourseware = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const cw = await lessonCoursewareService.getCourseware(id);
      if (!cw) {
        toast.error("课件不存在");
        navigate("/my-lessons");
        return;
      }
      setCourseware(cw);
      setSlides(cw.slides);
      // 预加载所有相关题
      const allRelatedIds = Array.from(
        new Set(cw.slides.flatMap((s) => s.relatedQuestionIds || [])),
      );
      if (allRelatedIds.length > 0) {
        const map: Record<string, Question> = {};
        await Promise.all(
          allRelatedIds.map(async (qid) => {
            try {
              const q = await questionService.getQuestion(qid);
              if (q) map[qid] = q;
            } catch {
              // ignore
            }
          }),
        );
        setRelatedQuestionsMap(map);
      }
    } catch (err) {
      toast.error("加载失败", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!id || !teacher) return;
    loadCourseware();
  }, [id, loadCourseware, teacher]);

  useEffect(() => {
    if (!teacher?.schoolId) return;
    Promise.all([
      classService.listMyStudents(teacher.schoolId, teacher.id),
      classService.listMyClasses(teacher.schoolId, teacher.id),
    ])
      .then(([studentItems, classItems]) => {
        setStudents(studentItems);
        setClasses(classItems.filter((item): item is SchoolClass => item.type === "school"));
      })
      .catch((error) => toast.error("班级与学生列表加载失败", error instanceof Error ? error.message : undefined));
  }, [teacher]);

  const currentSlide = slides[currentIndex];
  const selectedElement = currentSlide?.elements?.find((item) => item.id === selectedElementId) || null;

  useEffect(() => {
    setSelectedElementId(null);
    setSelectedTextRegion(null);
  }, [currentSlide?.id]);

  const updateCurrentElements = (elements: LessonSlideElement[]) => {
    setSlides((previous) => previous.map((slide, index) =>
      index === currentIndex ? { ...slide, elements } : slide));
  };

  const visibleCurrentElements = currentSlide
    ? getVisibleLessonSlideElements(currentSlide, {
      ...STEM_ONLY_QUESTION_VISIBILITY,
      options: true,
    })
    : [];

  const updateVisibleCurrentElements = (elements: LessonSlideElement[]) => {
    if (!currentSlide) return;
    updateCurrentElements(mergeVisibleLessonSlideElements(
      currentSlide.elements || [],
      elements,
    ));
  };

  const resizeSlideNavigator = (nextWidth: number) => {
    setSlideNavigatorWidth(Math.min(
      SLIDE_NAV_MAX_WIDTH,
      Math.max(SLIDE_NAV_MIN_WIDTH, nextWidth),
    ));
  };

  const startSlideNavigatorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    slideNavigatorResizeRef.current = {
      startX: event.clientX,
      startWidth: slideNavigatorWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveSlideNavigatorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = slideNavigatorResizeRef.current;
    if (!resize) return;
    resizeSlideNavigator(resize.startWidth + event.clientX - resize.startX);
  };

  const endSlideNavigatorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!slideNavigatorResizeRef.current) return;
    slideNavigatorResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSlideNavigatorResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeSlideNavigator(slideNavigatorWidth - 16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeSlideNavigator(slideNavigatorWidth + 16);
    } else if (event.key === "Home") {
      event.preventDefault();
      resizeSlideNavigator(SLIDE_NAV_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      resizeSlideNavigator(SLIDE_NAV_MAX_WIDTH);
    }
  };

  const resizeInspector = (nextWidth: number) => {
    setInspectorWidth(Math.min(
      INSPECTOR_MAX_WIDTH,
      Math.max(INSPECTOR_MIN_WIDTH, nextWidth),
    ));
  };

  const startInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    inspectorResizeRef.current = {
      startX: event.clientX,
      startWidth: inspectorWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = inspectorResizeRef.current;
    if (!resize) return;
    resizeInspector(resize.startWidth + resize.startX - event.clientX);
  };

  const endInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!inspectorResizeRef.current) return;
    inspectorResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleInspectorResizeKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeInspector(inspectorWidth + 16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeInspector(inspectorWidth - 16);
    } else if (event.key === "Home") {
      event.preventDefault();
      resizeInspector(INSPECTOR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      resizeInspector(INSPECTOR_MAX_WIDTH);
    }
  };

  const addTextElement = () => {
    if (!currentSlide) return;
    const element: LessonSlideElement = {
      id: genId("element"),
      kind: "text",
      content: "在右侧属性中编辑文本",
      x: 12,
      y: 4,
      width: 38,
      height: 14,
      fontSize: 24,
      textAlign: "left",
      animation: "rise",
      enterAnimation: "rise",
      actionAnimation: "none",
      exitAnimation: "none",
      animationOrder: (currentSlide.elements || []).length + 1,
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
  };

  const addImageElement = async (file: File) => {
    if (!currentSlide) return;
    try {
      const uploaded = await uploadFile(file);
      const element: LessonSlideElement = {
        id: genId("element"),
        kind: "image",
        src: uploaded.url,
        alt: file.name,
        x: 12,
        y: 4,
        width: 36,
        height: 30,
        animation: "fade",
        enterAnimation: "fade",
        actionAnimation: "none",
        exitAnimation: "none",
        animationOrder: (currentSlide.elements || []).length + 1,
      };
      updateCurrentElements([...(currentSlide.elements || []), element]);
      setSelectedElementId(element.id);
      setSelectedTextRegion(null);
    } catch (error) {
      toast.error("图片上传失败", error instanceof Error ? error.message : undefined);
    }
  };

  const addLinkElement = () => {
    if (!currentSlide) return;
    const element: LessonSlideElement = {
      id: genId("element"),
      kind: "text",
      content: "访问链接",
      href: "https://",
      x: 12,
      y: 4,
      width: 32,
      height: 12,
      fontSize: 22,
      textAlign: "left",
      animation: "fade",
      enterAnimation: "fade",
      actionAnimation: "none",
      exitAnimation: "none",
      animationOrder: (currentSlide.elements || []).length + 1,
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
  };

  const updateSelectedElement = (patch: Partial<LessonSlideElement>) => {
    if (!selectedElement || !currentSlide) return;
    updateCurrentElements((currentSlide.elements || []).map((element) =>
      element.id === selectedElement.id ? { ...element, ...patch } as LessonSlideElement : element));
  };

  const deleteSelectedElement = () => {
    if (!selectedElement || !currentSlide) return;
    updateCurrentElements((currentSlide.elements || []).filter((element) => element.id !== selectedElement.id));
    setSelectedElementId(null);
  };

  const handleSave = async () => {
    if (!courseware) return;
    setSaving(true);
    try {
      const updated = await lessonCoursewareService.updateCourseware(courseware.id, {
        slides,
        title: courseware.title,
        classIds: courseware.classIds,
      });
      setCourseware(updated);
      toast.success("已保存");
    } catch (err) {
      toast.error("保存失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!courseware) return;
    if (courseware.classIds.length === 0) {
      setClassModalOpen(true);
      toast.error("请先选择授课班级");
      return;
    }
    setPublishing(true);
    try {
      await lessonCoursewareService.updateCourseware(courseware.id, {
        slides,
        title: courseware.title,
        classIds: courseware.classIds,
      });
      await lessonCoursewareService.publishCourseware(courseware.id);
      toast.success("已发布", "课件已推送到“我要上课”页面");
      loadCourseware();
    } catch (err) {
      toast.error("发布失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const toggleClass = (classId: string) => {
    if (!courseware) return;
    const next = courseware.classIds.includes(classId)
      ? courseware.classIds.filter((id) => id !== classId)
      : [...courseware.classIds, classId];
    setCourseware({ ...courseware, classIds: next });
  };

  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    setSlides(next);
    setCurrentIndex(to);
  };

  const deleteSlide = (index: number) => {
    if (slides.length <= 1) {
      toast.error("至少保留一页");
      return;
    }
    const next = slides.filter((_, i) => i !== index);
    setSlides(next);
    if (currentIndex >= next.length) setCurrentIndex(next.length - 1);
  };

  const updateCurrentSlide = (patch: Partial<LessonSlide>) => {
    setSlides((prev) =>
      prev.map((s, i) => (i === currentIndex ? { ...s, ...patch } : s)),
    );
  };

  const updateSelectedTextStyle = (region: LessonSlideTextRegion, fontSize: number) => {
    if (!currentSlide) return;
    updateCurrentSlide({
      textStyles: {
        ...currentSlide.textStyles,
        [region]: {
          ...currentSlide.textStyles?.[region],
          fontSize,
        },
      },
    });
  };

  const moveAnimationOrder = (elementId: string, direction: -1 | 1) => {
    if (!currentSlide) return;
    const sourceElements = currentSlide.elements || [];
    const ordered = [...sourceElements].sort((left, right) =>
      (left.animationOrder || sourceElements.indexOf(left) + 1)
      - (right.animationOrder || sourceElements.indexOf(right) + 1));
    const index = ordered.findIndex((element) => element.id === elementId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const orderById = new Map(ordered.map((element, order) => [element.id, order + 1]));
    updateCurrentElements(sourceElements.map((element) => ({
      ...element,
      animationOrder: orderById.get(element.id),
    })));
  };

  const toggleStudent = (stuId: string) => {
    if (!currentSlide) return;
    const current = currentSlide.askableStudentIds || [];
    const next = current.includes(stuId)
      ? current.filter((id) => id !== stuId)
      : [...current, stuId];
    updateCurrentSlide({ askableStudentIds: next });
  };

  const loadRelatedQuestions = useCallback(async () => {
    if (!teacher?.schoolId) return;
    try {
      const qs = await questionService.listQuestions({
        schoolId: teacher.schoolId,
      });
      setRelatedQuestions(qs.slice(0, 10));
    } catch (err) {
      console.error(err);
    }
  }, [teacher?.schoolId]);

  const addRelatedQuestion = (q: Question) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    if (current.includes(q.id)) return;
    updateCurrentSlide({ relatedQuestionIds: [...current, q.id] });
    setRelatedQuestionsMap((questions) => ({ ...questions, [q.id]: q }));
    toast.success("已添加相关题");
  };

  const removeRelatedQuestion = (qid: string) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    updateCurrentSlide({ relatedQuestionIds: current.filter((id) => id !== qid) });
  };

  // 保存公式编辑器内容到当前幻灯片
  const handleSaveFormula = (html: string) => {
    if (!currentSlide || !formulaEditTarget) return;
    if (currentSlide.questionSnapshot) {
      updateCurrentSlide({
        questionSnapshot: {
          ...currentSlide.questionSnapshot,
          [formulaEditTarget.field]: html,
        },
      });
    }
    setFormulaEditTarget(null);
    toast.success("已保存");
  };

  // 打开公式编辑器
  const openFormulaEditor = (field: "stem" | "answer" | "analysis") => {
    if (!currentSlide?.questionSnapshot) return;
    setFormulaEditTarget({
      field,
      value: currentSlide.questionSnapshot[field] || "",
    });
  };

  // 拆分当前页（知识块）为两页
  const splitSlide = () => {
    if (!currentSlide || currentSlide.type !== "knowledge") return;
    const content = currentSlide.content || "";
    const mid = Math.floor(content.length / 2);
    const splitIdx = content.indexOf("。", mid) + 1 || mid;
    const part1 = content.slice(0, splitIdx).trim();
    const part2 = content.slice(splitIdx).trim();

    if (!part1 || !part2) {
      toast.error("内容太短，无法拆分");
      return;
    }

    const newSlide: LessonSlide = {
      id: genId("slide"),
      type: "knowledge",
      title: `${currentSlide.title}（下）`,
      content: part2,
    };

    const next = [...slides];
    next.splice(currentIndex + 1, 0, newSlide);
    updateCurrentSlide({ title: `${currentSlide.title}（上）`, content: part1 });
    setSlides(next);
    toast.success("已拆分为两页");
  };

  // 与下一页合并
  const mergeWithNext = () => {
    if (currentIndex >= slides.length - 1) {
      toast.error("已是最后一页");
      return;
    }
    const nextSlide = slides[currentIndex + 1];
    if (currentSlide?.type !== "knowledge" || nextSlide.type !== "knowledge") {
      toast.error("只有知识块页面可以合并");
      return;
    }
    const mergedContent = `${currentSlide.content || ""}\n\n${nextSlide.content || ""}`;
    const mergedTitle = currentSlide.title;
    updateCurrentSlide({ title: mergedTitle, content: mergedContent });
    deleteSlide(currentIndex + 1);
    toast.success("已合并");
  };

  const addNewSlide = () => {
    const newSlide: LessonSlide = {
      id: genId("slide"),
      type: "knowledge",
      title: "新页面",
      content: "",
      relatedQuestionIds: [],
      askableStudentIds: [],
    };
    const next = [...slides];
    next.splice(currentIndex + 1, 0, newSlide);
    setSlides(next);
    setCurrentIndex(currentIndex + 1);
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
        <div className="text-sm text-ink-500 mt-3">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-ink-200 bg-paper">
        <Button variant="ghost" size="sm" onClick={() => navigate("/my-lessons")}>
          <ChevronLeft className="w-4 h-4" />
          返回
        </Button>
        <div className="h-5 w-px bg-ink-200" />
        <div className="font-serif font-semibold text-ink-900 truncate max-w-md">
          {courseware?.title}
        </div>
        <Badge variant={courseware?.status === "published" ? "green" : "amber"}>
          {courseware?.status === "published" ? "已发布" : "草稿"}
        </Badge>
        <div className="flex-1" />
        <div className="text-sm text-ink-500">
          {currentIndex + 1} / {slides.length} 页
        </div>
        <div className="h-5 w-px bg-ink-200" />
        <Button variant="outline" size="sm" onClick={() => setClassModalOpen(true)}>
          <School className="w-4 h-4" />
          授课班级 {courseware?.classIds.length ? `(${courseware.classIds.length})` : ""}
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} loading={saving}>
          <Save className="w-4 h-4" />
          保存
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPreviewMode(true)}>
          <Play className="w-4 h-4" />
          预览上课
        </Button>
        <Button variant="gold" size="sm" onClick={handlePublish} loading={publishing}>
          <Send className="w-4 h-4" />
          发布到上课
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：课件页面 */}
        <div
          className="relative flex shrink-0 flex-col border-r border-ink-200 bg-mist/30"
          style={{ width: slideNavigatorCollapsed ? 40 : slideNavigatorWidth }}
        >
          {!slideNavigatorCollapsed ? (
            <>
              <div className="flex items-center justify-between border-b border-ink-200 p-2">
                <span className="text-xs font-medium text-ink-600">课件页面</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={addNewSlide}
                    className="rounded p-1 text-ink-500 hover:bg-ink-200/50 hover:text-ink-800"
                    title="添加页面"
                    aria-label="添加页面"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlideNavigatorCollapsed(true)}
                    className="rounded p-1 text-ink-500 hover:bg-ink-200/50 hover:text-ink-800"
                    title="折叠到左侧"
                    aria-label="折叠课件页面栏"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-1.5 overflow-auto p-2">
                {slides.map((slide, idx) => {
                  const isActive = idx === currentIndex;
                  const isQuestion = slide.type === "question";
                  return (
                    <div
                      key={slide.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={cn(
                        "group relative cursor-pointer rounded-lg border p-2 transition-all",
                        isActive
                          ? "border-gold-300 bg-gold-50 shadow-sm"
                          : "border-ink-100 bg-paper hover:border-ink-300",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded font-mono text-[10px]",
                          isActive ? "bg-gold-200 text-gold-800" : "bg-mist text-ink-500",
                        )}>
                          {idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center gap-1">
                            {isQuestion ? (
                              <FileQuestion className="h-3 w-3 text-ink-400" />
                            ) : (
                              <Blocks className="h-3 w-3 text-ink-400" />
                            )}
                            <span className="truncate text-xs font-medium text-ink-700">{slide.title}</span>
                          </div>
                          <div className="line-clamp-2 text-[10px] text-ink-400">
                            {isQuestion
                              ? slide.questionSnapshot?.stem?.slice(0, 40) || "题目"
                              : slide.content?.slice(0, 40) || "知识块"}
                          </div>
                        </div>
                      </div>
                      <div className="absolute right-1 top-1 hidden items-center gap-0.5 rounded bg-paper/90 group-hover:flex">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); moveSlide(idx, idx - 1); }}
                          disabled={idx === 0}
                          className="rounded p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                          title="上移"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); moveSlide(idx, idx + 1); }}
                          disabled={idx === slides.length - 1}
                          className="rounded p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                          title="下移"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); deleteSlide(idx); }}
                          className="rounded p-0.5 text-ink-400 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                role="separator"
                aria-label="调整课件页面栏宽度"
                aria-orientation="vertical"
                aria-valuemin={SLIDE_NAV_MIN_WIDTH}
                aria-valuemax={SLIDE_NAV_MAX_WIDTH}
                aria-valuenow={slideNavigatorWidth}
                tabIndex={0}
                className="group absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none"
                onPointerDown={startSlideNavigatorResize}
                onPointerMove={moveSlideNavigatorResize}
                onPointerUp={endSlideNavigatorResize}
                onPointerCancel={endSlideNavigatorResize}
                onKeyDown={handleSlideNavigatorResizeKey}
              >
                <span className="flex h-10 w-3 items-center justify-center rounded-full border border-ink-200 bg-paper text-ink-300 shadow-sm transition-colors group-hover:text-ink-600 group-focus-visible:ring-2 group-focus-visible:ring-gold-400">
                  <GripVertical className="h-3 w-3" />
                </span>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSlideNavigatorCollapsed(false)}
              className="flex h-12 w-full items-center justify-center text-ink-500 transition-colors hover:bg-mist hover:text-ink-800"
              aria-label="展开课件页面栏"
              title="展开课件页面栏"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 中间：主编辑区 */}
        <div className="min-w-0 flex-1 flex flex-col bg-mist/30 overflow-auto">
          {currentSlide && (
            <div className="flex-1 p-4 lg:p-6">
              <div className="mx-auto w-full max-w-[1120px]">
                <div className="mb-3 text-xs text-ink-500">
                  点击页面文字或自由元素后，可在右侧调整属性；文本内容可直接选中复制。
                </div>

                {currentSlide.type === "courseware" ? (
                  <div className="overflow-hidden rounded-xl bg-paper shadow-lg">
                    <CoursewareEmbed courseware={currentSlide} title={currentSlide.title} className="h-[64vh]" />
                    <div className="flex items-center gap-2 border-t border-ink-100 px-4 py-3">
                      {getCoursewareEditorUrl(currentSlide) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(getCoursewareEditorUrl(currentSlide), "_blank", "noopener,noreferrer")}
                        >
                          <ExternalLink className="w-4 h-4" />在线编辑
                        </Button>
                      )}
                      <span className="text-xs text-ink-500">{currentSlide.fileName || currentSlide.content}</span>
                    </div>
                  </div>
                ) : (
                  <LessonSlideCanvas
                    elements={visibleCurrentElements}
                    editable
                    selectedElementId={selectedElementId}
                    onSelectElement={(elementId) => {
                      setSelectedElementId(elementId);
                      if (elementId) setSelectedTextRegion(null);
                    }}
                    onElementsChange={updateVisibleCurrentElements}
                  >
                    <LessonSlideContent
                      slide={currentSlide}
                      questionVisibility={{ options: true }}
                      editable
                      selectedTextRegion={selectedTextRegion}
                      onSelectTextRegion={(region) => {
                        setSelectedTextRegion(region);
                        setSelectedElementId(null);
                      }}
                    />
                  </LessonSlideCanvas>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    上一页
                  </Button>
                  <div className="text-sm text-ink-500">
                    第 {currentIndex + 1} 页，共 {slides.length} 页
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentIndex((index) => Math.min(slides.length - 1, index + 1))}
                    disabled={currentIndex === slides.length - 1}
                  >
                    下一页
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：编辑控制区 */}
        <div
          className="relative flex shrink-0 flex-col border-l border-ink-200 bg-paper"
          style={{ width: inspectorCollapsed ? 40 : inspectorWidth }}
        >
          {!inspectorCollapsed ? (
            <>
              <div
                role="separator"
                aria-label="调整编辑控制区宽度"
                aria-orientation="vertical"
                aria-valuemin={INSPECTOR_MIN_WIDTH}
                aria-valuemax={INSPECTOR_MAX_WIDTH}
                aria-valuenow={inspectorWidth}
                tabIndex={0}
                className="group absolute -left-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none"
                onPointerDown={startInspectorResize}
                onPointerMove={moveInspectorResize}
                onPointerUp={endInspectorResize}
                onPointerCancel={endInspectorResize}
                onKeyDown={handleInspectorResizeKey}
              >
                <span className="flex h-10 w-3 items-center justify-center rounded-full border border-ink-200 bg-paper text-ink-300 shadow-sm transition-colors group-hover:text-ink-600 group-focus-visible:ring-2 group-focus-visible:ring-gold-400">
                  <GripVertical className="h-3 w-3" />
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
                <span className="text-xs font-medium text-ink-600">编辑控制</span>
                <button
                  type="button"
                  onClick={() => setInspectorCollapsed(true)}
                  className="rounded p-1 text-ink-400 transition-colors hover:bg-mist hover:text-ink-700"
                  aria-label="折叠编辑控制区"
                  title="折叠到右侧"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              {currentSlide && (
                <div className="min-h-0 flex-1">
                  <LessonEditorInspector
                    slide={currentSlide}
                    elements={visibleCurrentElements}
                    selectedElement={selectedElement}
                    selectedTextRegion={selectedTextRegion}
                    students={students}
                    relatedQuestions={relatedQuestions}
                    canDeleteSlide={slides.length > 1}
                    canMergeSlide={currentIndex < slides.length - 1}
                    onSelectElement={(elementId) => {
                      setSelectedElementId(elementId);
                      if (elementId) setSelectedTextRegion(null);
                    }}
                    onSelectTextRegion={(region) => {
                      setSelectedTextRegion(region);
                      if (region) setSelectedElementId(null);
                    }}
                    onUpdateElement={updateSelectedElement}
                    onDeleteElement={deleteSelectedElement}
                    onUpdateTextStyle={updateSelectedTextStyle}
                    onUpdateSlide={updateCurrentSlide}
                    onAddText={addTextElement}
                    onAddImage={addImageElement}
                    onAddLink={addLinkElement}
                    onAddSlide={addNewSlide}
                    onSplitSlide={splitSlide}
                    onMergeSlide={mergeWithNext}
                    onDeleteSlide={() => deleteSlide(currentIndex)}
                    onOpenFormulaEditor={openFormulaEditor}
                    onMoveAnimationOrder={moveAnimationOrder}
                    onToggleStudent={toggleStudent}
                    onLoadRelatedQuestions={loadRelatedQuestions}
                    onAddRelatedQuestion={addRelatedQuestion}
                    onRemoveRelatedQuestion={removeRelatedQuestion}
                  />
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => setInspectorCollapsed(false)}
              className="flex h-12 w-full items-center justify-center text-ink-500 transition-colors hover:bg-mist hover:text-ink-800"
              aria-label="展开编辑控制区"
              title="展开编辑控制区"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Modal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        title="选择授课班级"
        description="发布后，所选班级可在“我要上课”中看到该课件"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClassModalOpen(false)}>完成</Button>
            <Button variant="gold" onClick={async () => { await handleSave(); setClassModalOpen(false); }} loading={saving}>
              <Save className="w-4 h-4" />保存班级
            </Button>
          </div>
        }
      >
        <div className="space-y-2 max-h-80 overflow-auto">
          {classes.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-500">暂无可选班级</div>
          ) : classes.map((item) => {
            const selected = courseware?.classIds.includes(item.id) || false;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleClass(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  selected ? "border-gold-300 bg-gold-50" : "border-ink-100 hover:border-ink-300",
                )}
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center",
                  selected ? "bg-gold-400 border-gold-400" : "border-ink-300",
                )}>
                  {selected && <Check className="w-3 h-3 text-ink-900" />}
                </span>
                <span className="flex-1 text-sm text-ink-800">{item.grade} · {item.name}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* 公式编辑器弹窗 */}
      <Modal
        open={!!formulaEditTarget}
        onClose={() => setFormulaEditTarget(null)}
        title={`编辑${
          formulaEditTarget?.field === "stem" ? "题干"
          : formulaEditTarget?.field === "answer" ? "答案"
          : "解析"
        }`}
        description="支持公式插入（基于 KaTeX），可直接编辑富文本"
        size="lg"
        footer={null}
      >
        {formulaEditTarget && (
          <WpsFormulaEditor
            initialHtml={formulaEditTarget.value}
            onSave={handleSaveFormula}
            onCancel={() => setFormulaEditTarget(null)}
          />
        )}
      </Modal>

      {/* 预览模式（全屏覆盖） */}
      {previewMode && (
        <PresentationMode
          slides={slides}
          initialIndex={currentIndex}
          students={students}
          relatedQuestionsById={relatedQuestionsMap}
          onExit={() => setPreviewMode(false)}
        />
      )}
    </div>
  );
}

export default LessonEditorPage;
