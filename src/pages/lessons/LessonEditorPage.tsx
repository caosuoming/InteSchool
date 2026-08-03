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
  FileQuestion, Blocks, SplitSquareHorizontal,
  Merge, Edit3, Check, X, MessageSquareText, Star,
  Play, School, ExternalLink, Type, Image as ImageIcon,
  GripVertical, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { questionService } from "@/services/question";
import { reflectionService } from "@/services/reflection";
import { classService } from "@/services/class";
import type {
  LessonCourseware,
  LessonSlide,
  LessonSlideElement,
  Question,
  Reflection,
  Student,
  SchoolClass,
} from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/service-utils";
import { PresentationMode } from "./PresentationMode";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { getCoursewareEditorUrl } from "@/lib/courseware-online";
import { LessonSlideCanvas } from "@/components/lessons/LessonSlideCanvas";
import { LessonSlideContent } from "@/components/lessons/LessonSlideContent";
import {
  getVisibleLessonSlideElements,
  mergeVisibleLessonSlideElements,
  STEM_ONLY_QUESTION_VISIBILITY,
} from "@/lib/lesson-slide-visibility";

const INSPECTOR_MIN_WIDTH = 220;
const INSPECTOR_MAX_WIDTH = 420;
const INSPECTOR_DEFAULT_WIDTH = 248;

interface InspectorResizeState {
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

  // 侧边栏相关
  const [showStudentPanel, setShowStudentPanel] = useState(false);
  const [showRelatedPanel, setShowRelatedPanel] = useState(false);
  const [showReflectionPanel, setShowReflectionPanel] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState<Question[]>([]);
  // 所有相关题的缓存（id -> Question），供预览模式使用
  const [relatedQuestionsMap, setRelatedQuestionsMap] = useState<Record<string, Question>>({});

  // 课后反思相关
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [newReflection, setNewReflection] = useState("");
  const [newReflectionRating, setNewReflectionRating] = useState("4");
  const [submittingReflection, setSubmittingReflection] = useState(false);

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
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
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
      // 加载反思
      const refs = await reflectionService.listByLesson(cw.id);
      setReflections(refs);
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
  }, [currentSlide?.id]);

  const updateCurrentElements = (elements: LessonSlideElement[]) => {
    setSlides((previous) => previous.map((slide, index) =>
      index === currentIndex ? { ...slide, elements } : slide));
  };

  const visibleCurrentElements = currentSlide
    ? getVisibleLessonSlideElements(currentSlide, STEM_ONLY_QUESTION_VISIBILITY)
    : [];

  const updateVisibleCurrentElements = (elements: LessonSlideElement[]) => {
    if (!currentSlide) return;
    updateCurrentElements(mergeVisibleLessonSlideElements(
      currentSlide.elements || [],
      elements,
    ));
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
      content: "双击右侧属性编辑文本",
      x: 12,
      y: 68,
      width: 38,
      height: 14,
      fontSize: 24,
      textAlign: "left",
      animation: "rise",
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
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

  const toggleStudent = (stuId: string) => {
    if (!currentSlide) return;
    const current = currentSlide.askableStudentIds || [];
    const next = current.includes(stuId)
      ? current.filter((id) => id !== stuId)
      : [...current, stuId];
    updateCurrentSlide({ askableStudentIds: next });
  };

  const loadRelatedQuestions = async () => {
    if (!teacher?.schoolId) return;
    setShowRelatedPanel(true);
    try {
      const qs = await questionService.listQuestions({
        schoolId: teacher.schoolId,
        knowledgePointIds: currentSlide?.questionId ? [] : [],
      });
      setRelatedQuestions(qs.slice(0, 10));
    } catch (err) {
      console.error(err);
    }
  };

  const addRelatedQuestion = (q: Question) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    if (current.includes(q.id)) return;
    updateCurrentSlide({ relatedQuestionIds: [...current, q.id] });
    toast.success("已添加相关题");
  };

  const removeRelatedQuestion = (qid: string) => {
    if (!currentSlide) return;
    const current = currentSlide.relatedQuestionIds || [];
    updateCurrentSlide({ relatedQuestionIds: current.filter((id) => id !== qid) });
  };

  // ============ 课后反思 ============
  const handleAddReflection = async () => {
    if (!teacher || !courseware) return;
    if (!newReflection.trim()) {
      toast.error("请输入反思内容");
      return;
    }
    setSubmittingReflection(true);
    try {
      const targetType = courseware.sourceType === "examPaper"
        ? "examPaper"
        : courseware.sourceType === "lecture"
          ? "lecture"
          : "courseware";
      const targetId = courseware.sourceId || courseware.id;
      await reflectionService.createReflection(teacher.id, teacher.schoolId!, {
        lessonCoursewareId: courseware.id,
        targetId,
        targetType,
        content: newReflection.trim(),
        rating: parseInt(newReflectionRating),
      });
      setNewReflection("");
      toast.success("反思已添加", "已同步到关联资源");
      const refs = await reflectionService.listByLesson(courseware.id);
      setReflections(refs);
    } catch (err) {
      toast.error("添加失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingReflection(false);
    }
  };

  const handleDeleteReflection = async (rid: string) => {
    try {
      await reflectionService.deleteReflection(rid);
      toast.success("已删除");
      if (courseware) {
        const refs = await reflectionService.listByLesson(courseware.id);
        setReflections(refs);
      }
    } catch (err) {
      toast.error("删除失败");
    }
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

  const questionTypeLabel: Record<string, string> = {
    single: "单选",
    multiple: "多选",
    judge: "判断",
    short: "填空",
    essay: "解答",
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
        {/* 左侧：幻灯片列表 */}
        <div className="w-52 border-r border-ink-200 bg-mist/30 flex flex-col">
          <div className="p-2 border-b border-ink-200 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600">课件页面</span>
            <button
              onClick={addNewSlide}
              className="p-1 rounded hover:bg-ink-200/50 text-ink-500 hover:text-ink-800"
              title="添加页面"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {slides.map((slide, idx) => {
              const isActive = idx === currentIndex;
              const isQuestion = slide.type === "question";
              return (
                <div
                  key={slide.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "group relative p-2 rounded-lg cursor-pointer transition-all border",
                    isActive
                      ? "bg-gold-50 border-gold-300 shadow-sm"
                      : "bg-paper border-ink-100 hover:border-ink-300",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={cn(
                      "w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-mono",
                      isActive ? "bg-gold-200 text-gold-800" : "bg-mist text-ink-500",
                    )}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        {isQuestion ? (
                          <FileQuestion className="w-3 h-3 text-ink-400" />
                        ) : (
                          <Blocks className="w-3 h-3 text-ink-400" />
                        )}
                        <span className="text-xs font-medium text-ink-700 truncate">
                          {slide.title}
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-400 line-clamp-2">
                        {isQuestion
                          ? slide.questionSnapshot?.stem?.slice(0, 40) || "题目"
                          : slide.content?.slice(0, 40) || "知识块"}
                      </div>
                    </div>
                  </div>
                  {/* 操作按钮 */}
                  <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-0.5 bg-paper/90 rounded">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSlide(idx, idx - 1); }}
                      disabled={idx === 0}
                      className="p-0.5 rounded text-ink-400 hover:text-ink-700 disabled:opacity-30"
                      title="上移"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSlide(idx, idx + 1); }}
                      disabled={idx === slides.length - 1}
                      className="p-0.5 rounded text-ink-400 hover:text-ink-700 disabled:opacity-30"
                      title="下移"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSlide(idx); }}
                      className="p-0.5 rounded text-ink-400 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 中间：主编辑区 */}
        <div className="min-w-0 flex-1 flex flex-col bg-mist/30 overflow-auto">
          {currentSlide && (
            <div className="flex-1 p-4 lg:p-6">
              <div className="mx-auto w-full max-w-[1120px]">
                <div className="mb-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addTextElement} disabled={currentSlide.type === "courseware"}>
                    <Type className="w-4 h-4" />
                    新增文本
                  </Button>
                  <span className="text-xs text-ink-500">
                    可见元素 {visibleCurrentElements.length} 个
                    {selectedElement ? " · 可拖动元素并从右侧调整属性" : " · 点击元素后可拖动和缩放"}
                  </span>
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
                    onSelectElement={setSelectedElementId}
                    onElementsChange={updateVisibleCurrentElements}
                  >
                    <LessonSlideContent slide={currentSlide} />
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

        {/* 右侧：属性面板 */}
        <div
          className="relative flex shrink-0 flex-col border-l border-ink-200 bg-paper"
          style={{ width: inspectorCollapsed ? 40 : inspectorWidth }}
        >
          {!inspectorCollapsed && (
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

              {/* 标签切换 */}
              <div className="flex border-b border-ink-200">
                <div className="grid min-w-0 flex-1 grid-cols-4">
            <button
              onClick={() => { setShowStudentPanel(false); setShowRelatedPanel(false); setShowReflectionPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                !showStudentPanel && !showRelatedPanel && !showReflectionPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              属性
            </button>
            <button
              onClick={() => { setShowStudentPanel(true); setShowRelatedPanel(false); setShowReflectionPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showStudentPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              提问学生
            </button>
            <button
              onClick={() => { setShowRelatedPanel(true); setShowStudentPanel(false); setShowReflectionPanel(false); loadRelatedQuestions(); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showRelatedPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              相关题
            </button>
            <button
              onClick={() => { setShowReflectionPanel(true); setShowStudentPanel(false); setShowRelatedPanel(false); }}
              className={cn(
                "py-2 text-xs font-medium transition-colors",
                showReflectionPanel
                  ? "text-gold-700 border-b-2 border-gold-400"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              课后反思
            </button>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorCollapsed(true)}
                  className="flex w-8 shrink-0 items-center justify-center text-ink-400 transition-colors hover:bg-mist hover:text-ink-700"
                  aria-label="折叠编辑控制区"
                  title="折叠到右侧"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
          </div>

          <div className="flex-1 overflow-auto p-3">
            {/* 属性面板 */}
            {!showStudentPanel && !showRelatedPanel && !showReflectionPanel && currentSlide && (
              selectedElement ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-sm font-medium text-ink-800">
                    {selectedElement.kind === "text" ? <Type className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                    {selectedElement.kind === "text" ? "文本元素" : "图片元素"}
                  </div>

                  {selectedElement.kind === "text" ? (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-ink-600 mb-1.5">文本内容</label>
                        <Textarea
                          value={selectedElement.content}
                          onChange={(event) => updateSelectedElement({ content: event.target.value })}
                          rows={5}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-ink-600 mb-1.5">字号</label>
                          <Input
                            type="number"
                            min={12}
                            max={64}
                            value={selectedElement.fontSize || 24}
                            onChange={(event) => updateSelectedElement({ fontSize: Number(event.target.value) || 24 })}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink-600 mb-1.5">对齐</label>
                          <select
                            value={selectedElement.textAlign || "left"}
                            onChange={(event) => updateSelectedElement({ textAlign: event.target.value as "left" | "center" | "right" })}
                            className="input-base"
                          >
                            <option value="left">左对齐</option>
                            <option value="center">居中</option>
                            <option value="right">右对齐</option>
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-ink-600 mb-1.5">图片说明</label>
                      <Input
                        value={selectedElement.alt || ""}
                        onChange={(event) => updateSelectedElement({ alt: event.target.value })}
                        placeholder="题目图片"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1.5">入场动画</label>
                    <select
                      value={selectedElement.animation || "none"}
                      onChange={(event) => updateSelectedElement({ animation: event.target.value as LessonSlideElement["animation"] })}
                      className="input-base"
                    >
                      <option value="none">无动画</option>
                      <option value="fade">淡入</option>
                      <option value="rise">上浮</option>
                      <option value="zoom">缩放</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-ink-600">位置与尺寸（%）</div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "width", "height"] as const).map((field) => (
                        <label key={field} className="text-[11px] text-ink-500">
                          {{ x: "横坐标", y: "纵坐标", width: "宽度", height: "高度" }[field]}
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(selectedElement[field])}
                            onChange={(event) => updateSelectedElement({ [field]: Number(event.target.value) } as Partial<LessonSlideElement>)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  <Button variant="ghost" size="sm" className="w-full text-red-500" onClick={deleteSelectedElement}>
                    <Trash2 className="w-4 h-4" />删除元素
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedElementId(null)}>
                    返回页面属性
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-600 mb-1.5">页面标题</label>
                    <Input
                      value={currentSlide.title}
                      onChange={(event) => updateCurrentSlide({ title: event.target.value })}
                    />
                  </div>
                  <div className="rounded-lg border border-ink-100 bg-mist/40 p-3 text-xs text-ink-600">
                    页面类型：{currentSlide.type === "section" ? "封面/章节" : currentSlide.type === "question" ? "题目" : currentSlide.type === "courseware" ? "外部课件" : "知识块"}
                  </div>

                  {(currentSlide.type === "knowledge" || currentSlide.type === "section") && (
                    <div>
                      <label className="block text-xs font-medium text-ink-600 mb-1.5">页面内容</label>
                      <Textarea
                        value={currentSlide.content || ""}
                        onChange={(event) => updateCurrentSlide({ content: event.target.value })}
                        rows={7}
                      />
                    </div>
                  )}

                  {currentSlide.type === "question" && currentSlide.questionSnapshot && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-ink-600">题目内容</div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => openFormulaEditor("stem")}>
                        <Edit3 className="w-4 h-4" />编辑题干
                      </Button>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => openFormulaEditor("answer")}>
                        <Edit3 className="w-4 h-4" />编辑答案
                      </Button>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => openFormulaEditor("analysis")}>
                        <Edit3 className="w-4 h-4" />编辑解析
                      </Button>
                    </div>
                  )}

                  {currentSlide.type !== "courseware" && (
                    <Button variant="outline" size="sm" className="w-full" onClick={addTextElement}>
                      <Type className="w-4 h-4" />新增文本框
                    </Button>
                  )}

                  <div className="pt-3 border-t border-ink-100">
                    <div className="text-xs font-medium text-ink-600 mb-2">页面操作</div>
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full" onClick={addNewSlide}>
                        <Plus className="w-4 h-4" />在下方插入新页
                      </Button>
                      {currentSlide.type === "knowledge" && (
                        <>
                          <Button variant="outline" size="sm" className="w-full" onClick={splitSlide}>
                            <SplitSquareHorizontal className="w-4 h-4" />拆分当前页
                          </Button>
                          <Button variant="outline" size="sm" className="w-full" onClick={mergeWithNext} disabled={currentIndex >= slides.length - 1}>
                            <Merge className="w-4 h-4" />与下一页合并
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-500 hover:text-red-600"
                        onClick={() => deleteSlide(currentIndex)}
                        disabled={slides.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />删除当前页
                      </Button>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* 提问学生面板 */}
            {showStudentPanel && currentSlide && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500">
                  选择本题可以提问的学生（已选 {(currentSlide.askableStudentIds || []).length} 人）
                </div>
                <div className="space-y-1">
                  {students.map((stu) => {
                    const selected = (currentSlide.askableStudentIds || []).includes(stu.id);
                    return (
                      <button
                        key={stu.id}
                        onClick={() => toggleStudent(stu.id)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                          selected
                            ? "bg-gold-50 text-gold-800"
                            : "hover:bg-mist text-ink-700",
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium",
                          selected ? "bg-gold-400 text-ink-900" : "bg-mist text-ink-500",
                        )}>
                          {stu.name.slice(0, 1)}
                        </div>
                        <span className="flex-1">{stu.name}</span>
                        {selected && <Check className="w-3.5 h-3.5 text-gold-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 相关题面板 */}
            {showRelatedPanel && currentSlide && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500">
                  已添加相关题：{(currentSlide.relatedQuestionIds || []).length} 道
                </div>

                {(currentSlide.relatedQuestionIds || []).length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-ink-600">已关联的题目</div>
                    {(currentSlide.relatedQuestionIds || []).map((qid, idx) => (
                      <div key={qid} className="flex items-start gap-2 p-2 rounded bg-emerald-50 border border-emerald-200">
                        <span className="text-xs text-emerald-700 font-mono">#{idx + 1}</span>
                        <span className="flex-1 text-xs text-emerald-800 truncate">相关题 {qid.slice(-6)}</span>
                        <button
                          onClick={() => removeRelatedQuestion(qid)}
                          className="text-emerald-500 hover:text-emerald-700"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-ink-600">推荐相关题</div>
                  {relatedQuestions.map((q) => {
                    const added = (currentSlide.relatedQuestionIds || []).includes(q.id);
                    return (
                      <div key={q.id} className="p-2 rounded border border-ink-100 hover:border-gold-200 transition-colors">
                        <div className="text-xs text-ink-700 line-clamp-2 mb-1">{q.stem}</div>
                        <div className="flex items-center justify-between">
                          <Badge variant="ink">
                            {questionTypeLabel[q.type]}
                          </Badge>
                          {added ? (
                            <span className="text-[11px] text-emerald-600 flex items-center gap-0.5">
                              <Check className="w-3 h-3" />
                              已添加
                            </span>
                          ) : (
                            <button
                              onClick={() => addRelatedQuestion(q)}
                              className="text-[11px] text-gold-600 hover:text-gold-700"
                            >
                              + 添加
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 课后反思面板 */}
            {showReflectionPanel && courseware && (
              <div className="space-y-3">
                <div className="text-xs text-ink-500 flex items-center gap-1">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  课后反思（{reflections.length} 条，同步到源资源）
                </div>

                {/* 新增反思 */}
                <div className="p-3 rounded-lg border border-gold-200 bg-gold-50/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-600">课堂效果：</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setNewReflectionRating(String(n))}
                          className="p-0.5"
                          title={`${n} 星`}
                        >
                          <Star
                            className={cn(
                              "w-3.5 h-3.5",
                              parseInt(newReflectionRating) >= n
                                ? "text-gold-500 fill-gold-500"
                                : "text-ink-300",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={newReflection}
                    onChange={(e) => setNewReflection(e.target.value)}
                    placeholder="记录本节课的反思：哪些讲解效果好？哪些需要改进？学生理解情况如何？"
                    rows={4}
                  />
                  <div className="flex justify-end">
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={handleAddReflection}
                      loading={submittingReflection}
                      disabled={!newReflection.trim()}
                    >
                      <Plus className="w-4 h-4" />
                      添加反思
                    </Button>
                  </div>
                </div>

                {/* 反思列表 */}
                {reflections.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-400">
                    暂无反思记录
                  </div>
                ) : (
                  <div className="space-y-2">
                    {reflections.map((r) => (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-lg border border-ink-100 hover:border-gold-200 transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                className={cn(
                                  "w-3 h-3",
                                  (r.rating || 0) >= n
                                    ? "text-gold-500 fill-gold-500"
                                    : "text-ink-200",
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-[11px] text-ink-400 ml-auto">
                            {new Date(r.createdAt).toLocaleString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <button
                            onClick={() => handleDeleteReflection(r.id)}
                            className="p-0.5 rounded text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-xs text-ink-700 leading-relaxed whitespace-pre-wrap">
                          {r.content}
                        </div>
                        <div className="mt-1.5 text-[10px] text-ink-400">
                          已同步到：
                          {r.targetType === "examPaper" ? "试卷库" : r.targetType === "lecture" ? "讲义库" : "课件库"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}
          {inspectorCollapsed && (
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
