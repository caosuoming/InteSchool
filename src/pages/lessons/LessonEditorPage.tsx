import { openPage } from "@/lib/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import {
  useCallback,
  useState,
  useEffect,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Send, Save, RotateCcw, Undo2,
  FileQuestion, Blocks, Check,
  Play, School, ExternalLink, Download, Maximize2, Minimize2,
  GripVertical, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { boardService } from "@/services/board";
import { coursewareService } from "@/services/courseware";
import { basketService } from "@/services/basket";
import { materialService } from "@/services/material";
import { questionService } from "@/services/question";
import { classService } from "@/services/class";
import { analyticsService } from "@/services/analytics";
import { studentInteractionService } from "@/services/studentInteraction";
import { uploadFile } from "@/services/api";
import type {
  LessonCourseware,
  Courseware,
  BoardDocument,
  LessonSlide,
  LessonSlideElement,
  LessonSlideTextRegion,
  Basket,
  Material,
  MaterialType,
  Question,
  Student,
  SchoolClass,
  PersonalClass,
} from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/service-utils";
import { PresentationMode } from "./PresentationMode";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";
import { CoursewareEmbed } from "@/components/courseware/CoursewareEmbed";
import { getCoursewareEditorUrl, getCoursewareFileUrl } from "@/lib/courseware-online";
import { downloadOfflineLessonCourseware } from "@/lib/lesson-courseware-offline";
import { LessonSlideCanvas } from "@/components/lessons/LessonSlideCanvas";
import { LessonSlideContent } from "@/components/lessons/LessonSlideContent";
import { LessonEditorInspector } from "@/components/lessons/LessonEditorInspector";
import { QuickEditModal } from "@/components/question/QuickEditModal";
import { createLessonQuestionSlide } from "@/lib/lesson-courseware-create";
import { detachLessonInlineImage } from "@/lib/lesson-inline-image";
import {
  basketAudienceLabel,
  preferredBasketForClassIds,
} from "@/lib/basket-audience";
import { promptToRemoveReferencedBasketQuestions } from "@/lib/basket-reference";
import {
  getStudentKnowledgeWeakness,
  rankLessonStudents,
  rankRelatedQuestions,
} from "@/lib/lesson-associations";

const INSPECTOR_MIN_WIDTH = 220;
const INSPECTOR_MAX_WIDTH = 420;
const INSPECTOR_DEFAULT_WIDTH = 248;
const SLIDE_NAV_MIN_WIDTH = 144;
const SLIDE_NAV_MAX_WIDTH = 320;
const SLIDE_NAV_DEFAULT_WIDTH = 176;

const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  text: "文本",
  image: "图片",
  audio: "音频",
  video: "视频",
  link: "链接",
  file: "文件",
  knowledgeBlock: "知识块",
};

function getPresentationReferenceSize() {
  const screenWidth = window.screen?.width || window.innerWidth;
  const screenHeight = window.screen?.height || window.innerHeight;
  return {
    width: Math.max(1, screenWidth),
    height: Math.max(1, screenHeight),
  };
}

interface InspectorResizeState {
  startX: number;
  startWidth: number;
}

interface SlideNavigatorResizeState {
  startX: number;
  startWidth: number;
}

interface LessonSaveState {
  slides: LessonSlide[];
  title: string;
  classIds: string[];
  boardIds: string[];
}

interface LessonElementClipboard {
  element: LessonSlideElement;
  sourceSlideId: string;
}

function lessonSaveStateFromCourseware(courseware: LessonCourseware): LessonSaveState {
  return {
    slides: courseware.slides,
    title: courseware.title,
    classIds: courseware.classIds,
    boardIds: courseware.boardIds || [],
  };
}

export function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { teacher } = useAuthStore();
  const teacherId = teacher?.id;

  const [courseware, setCourseware] = useState<LessonCourseware | null>(null);
  const [slides, setSlides] = useState<LessonSlide[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedDraft, setSavedDraft] = useState<LessonSaveState | null>(null);
  const savedDraftRef = useRef<LessonSaveState | null>(null);
  const latestDraftRef = useRef<LessonSaveState | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const saveOnExitRef = useRef<() => void>(() => undefined);
  const saveWhenHiddenRef = useRef<() => void>(() => undefined);
  const [undoDepth, setUndoDepth] = useState(0);
  const undoHistoryRef = useRef<LessonSaveState[]>([]);
  const lastUndoStateRef = useRef<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [downloadingOffline, setDownloadingOffline] = useState(false);

  const [relatedQuestions, setRelatedQuestions] = useState<Question[]>([]);
  const [relatedQuestionsLoading, setRelatedQuestionsLoading] = useState(false);
  // 所有相关题的缓存（id -> Question），供预览模式使用
  const [relatedQuestionsMap, setRelatedQuestionsMap] = useState<Record<string, Question>>({});
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionMetadataOpen, setQuestionMetadataOpen] = useState(false);
  const [questionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [questionBaskets, setQuestionBaskets] = useState<Basket[]>([]);
  const [selectedQuestionBasketId, setSelectedQuestionBasketId] = useState<string | null>(null);
  const [basketQuestions, setBasketQuestions] = useState<Question[]>([]);
  const [basketQuestionsLoading, setBasketQuestionsLoading] = useState(false);
  const [geogebraPickerOpen, setGeogebraPickerOpen] = useState(false);
  const [geogebraInsertMode, setGeogebraInsertMode] = useState<"slide" | "element">("slide");
  const [geogebraCoursewares, setGeogebraCoursewares] = useState<Courseware[]>([]);
  const [geogebraPickerLoading, setGeogebraPickerLoading] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [basketMaterials, setBasketMaterials] = useState<Material[]>([]);
  const [basketMaterialsLoading, setBasketMaterialsLoading] = useState(false);

  // 预览模式
  const [previewMode, setPreviewMode] = useState(() => searchParams.get("preview") === "1");
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const editorFullscreenRef = useRef(false);

  // 题目公式编辑器（编辑题干/答案/解析）
  const [formulaEditTarget, setFormulaEditTarget] = useState<{
    field: "stem" | "answer" | "analysis";
    value: string;
  } | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [followedStudentIds, setFollowedStudentIds] = useState<Set<string>>(() => new Set());
  const [ignoredStudentIds, setIgnoredStudentIds] = useState<Set<string>>(() => new Set());
  const [studentWeaknessById, setStudentWeaknessById] = useState<Record<string, number | null>>({});
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [boardPickerOpen, setBoardPickerOpen] = useState(false);
  const [boardOptions, setBoardOptions] = useState<BoardDocument[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedTextRegion, setSelectedTextRegion] = useState<LessonSlideTextRegion | null>(null);
  const [elementClipboard, setElementClipboard] = useState<LessonElementClipboard | null>(null);
  const systemElementMarkerRef = useRef<string | null>(null);
  const [slideNavigatorWidth, setSlideNavigatorWidth] = useState(SLIDE_NAV_DEFAULT_WIDTH);
  const [slideNavigatorCollapsed, setSlideNavigatorCollapsed] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [presentationReferenceSize, setPresentationReferenceSize] = useState(
    getPresentationReferenceSize,
  );
  const slideNavigatorResizeRef = useRef<SlideNavigatorResizeState | null>(null);
  const inspectorResizeRef = useRef<InspectorResizeState | null>(null);
  const questionBasketLoadRef = useRef(0);

  useEffect(() => {
    const updateReferenceSize = () => setPresentationReferenceSize(getPresentationReferenceSize());
    window.addEventListener("resize", updateReferenceSize);
    window.screen?.orientation?.addEventListener?.("change", updateReferenceSize);
    return () => {
      window.removeEventListener("resize", updateReferenceSize);
      window.screen?.orientation?.removeEventListener?.("change", updateReferenceSize);
    };
  }, []);

  useEffect(() => {
    const syncFullscreen = () => {
      if (editorFullscreenRef.current && document.fullscreenElement !== document.documentElement) {
        editorFullscreenRef.current = false;
        setIsEditorFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      if (editorFullscreenRef.current && document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);

  const toggleEditorFullscreen = () => {
    if (isEditorFullscreen) {
      if (document.fullscreenElement === document.documentElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => toast.error("退出全屏失败"));
      } else {
        editorFullscreenRef.current = false;
        setIsEditorFullscreen(false);
      }
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      toast.error("当前浏览器不支持全屏编辑");
      return;
    }
    void document.documentElement.requestFullscreen()
      .then(() => {
        editorFullscreenRef.current = true;
        setIsEditorFullscreen(true);
      })
      .catch(() => toast.error("进入全屏失败"));
  };

  const loadCourseware = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cw, personalClassItems] = await Promise.all([
        lessonCoursewareService.getCourseware(id),
        teacherId ? classService.listPersonalClasses(teacherId) : Promise.resolve([]),
      ]);
      setPersonalClasses(personalClassItems);
      if (!cw) {
        toast.error("课件不存在");
        navigate("/my-lessons");
        return;
      }
      const isPersonal = cw.classIds.some((classId) => personalClassItems.some((item) => item.id === classId));
      const editableCourseware = !isPersonal && teacher?.schoolId && cw.schoolId !== teacher.schoolId
        ? {
          ...cw,
          classIds: [],
          status: "draft" as const,
          publishedAt: undefined,
        }
        : cw;
      setCourseware(editableCourseware);
      const initialDraft = lessonSaveStateFromCourseware(editableCourseware);
      savedDraftRef.current = initialDraft;
      latestDraftRef.current = initialDraft;
      lastUndoStateRef.current = JSON.stringify(initialDraft);
      undoHistoryRef.current = [];
      setUndoDepth(0);
      setSavedDraft(initialDraft);
      setSlides(editableCourseware.slides);
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
  }, [id, navigate, teacherId, teacher?.schoolId]);

  useEffect(() => {
    if (!id || !teacher) return;
    loadCourseware();
  }, [id, loadCourseware, teacher]);

  useEffect(() => {
    if (!teacher?.schoolId) return;
    Promise.all([
      classService.listMyStudents(teacher.schoolId, teacher.id),
      classService.listMyClasses(teacher.schoolId, teacher.id),
      studentInteractionService.listFollowedStudentIds().catch(() => []),
      studentInteractionService.listIgnoredStudentIds().catch(() => []),
    ])
      .then(([studentItems, classItems, followedIds, ignoredIds]) => {
        setStudents(studentItems);
        setClasses(classItems.filter((item): item is SchoolClass => item.type === "school"));
        setFollowedStudentIds(new Set(followedIds));
        setIgnoredStudentIds(new Set(ignoredIds));
      })
      .catch((error) => toast.error("班级与学生列表加载失败", error instanceof Error ? error.message : undefined));
  }, [teacher]);

  const personalClassIds = new Set(personalClasses.map((item) => item.id));
  const isPersonalCourseware = !!courseware?.classIds.some((classId) => personalClassIds.has(classId));
  const requestedClassId = searchParams.get("classId");
  const returnClassId = requestedClassId && courseware?.classIds.includes(requestedClassId)
    && personalClassIds.has(requestedClassId)
    ? requestedClassId
    : courseware?.classIds.find((classId) => personalClassIds.has(classId));
  const returnPath = isPersonalCourseware
    ? `/individual-tutoring/coursewares${returnClassId ? `?classId=${encodeURIComponent(returnClassId)}` : ""}`
    : "/my-lessons";
  const selectableClasses = isPersonalCourseware ? personalClasses : classes;

  const currentSlide = slides[currentIndex];
  const selectedElement = currentSlide?.elements?.find((item) => item.id === selectedElementId) || null;
  const selectedQuestionBasket = questionBaskets.find(
    (basket) => basket.id === selectedQuestionBasketId,
  ) || null;

  useEffect(() => {
    let cancelled = false;
    setQuestionMetadataOpen(false);
    setRelatedQuestions([]);
    setStudentWeaknessById({});
    setCurrentQuestion(null);

    if (currentSlide?.type !== "question" || !currentSlide.questionId) {
      return () => { cancelled = true; };
    }

    questionService.getQuestion(currentSlide.questionId)
      .then((question) => {
        if (!cancelled) setCurrentQuestion(question);
      })
      .catch(() => {
        if (!cancelled) setCurrentQuestion(null);
      });

    return () => { cancelled = true; };
  }, [currentSlide?.id, currentSlide?.questionId, currentSlide?.type]);

  useEffect(() => {
    let cancelled = false;
    const knowledgePointIds = currentQuestion?.knowledgePointIds || [];
    if (!teacher?.schoolId || knowledgePointIds.length === 0 || students.length === 0) {
      setStudentWeaknessById({});
      return () => { cancelled = true; };
    }

    Promise.all(students.map(async (student) => {
      try {
        const mastery = await analyticsService.getKnowledgeMastery([student.id], teacher.schoolId!);
        return [student.id, getStudentKnowledgeWeakness(mastery, knowledgePointIds)] as const;
      } catch {
        return [student.id, null] as const;
      }
    })).then((entries) => {
      if (!cancelled) setStudentWeaknessById(Object.fromEntries(entries));
    });

    return () => { cancelled = true; };
  }, [currentQuestion, students, teacher?.schoolId]);

  const rankedStudents = rankLessonStudents(
    students,
    followedStudentIds,
    studentWeaknessById,
    currentSlide?.type === "question" && Boolean(currentQuestion?.knowledgePointIds?.length),
  );

  useEffect(() => {
    setSelectedElementId(null);
    setSelectedTextRegion(null);
  }, [currentSlide?.id]);

  const updateCurrentElements = (elements: LessonSlideElement[]) => {
    setSlides((previous) => previous.map((slide, index) =>
      index === currentIndex ? { ...slide, elements } : slide));
  };

  const extractContentImage = (
    region: "title" | "content",
    image: HTMLImageElement,
    root: HTMLElement,
  ) => {
    if (!currentSlide) return;
    const canvas = root.closest<HTMLElement>("[data-lesson-slide-canvas]");
    if (!canvas) return;
    const extracted = detachLessonInlineImage(image, root, canvas, genId("element"));
    if (!extracted) return;
    const slideId = currentSlide.id;
    setSlides((previous) => previous.map((slide) => slide.id === slideId
      ? {
          ...slide,
          [region]: extracted.content,
          elements: [...(slide.elements || []), extracted.element],
        }
      : slide));
    setSelectedElementId(extracted.element.id);
    setSelectedTextRegion(null);
  };

  const visibleCurrentElements = currentSlide?.elements || [];

  const updateVisibleCurrentElements = (elements: LessonSlideElement[]) => {
    if (!currentSlide) return;
    updateCurrentElements(elements);
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
      content: "",
      x: 12,
      y: 4,
      width: 38,
      height: 14,
      fontSize: 24,
      textAlign: "left",
      animation: "none",
      enterAnimation: "none",
      actionAnimation: "none",
      exitAnimation: "none",
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
  };

  const addImageElement = async (file: File, offset = 0) => {
    if (!currentSlide) return;
    const targetSlideId = currentSlide.id;
    try {
      const uploaded = await uploadFile(file);
      const element: LessonSlideElement = {
        id: genId("element"),
        kind: "image",
        src: uploaded.url,
        alt: file.name,
        x: Math.min(24, 12 + offset * 3),
        y: Math.min(16, 4 + offset * 3),
        width: 36,
        height: 30,
        animation: "none",
        enterAnimation: "none",
        actionAnimation: "none",
        exitAnimation: "none",
      };
      setSlides((previous) => previous.map((slide) => (
        slide.id === targetSlideId
          ? { ...slide, elements: [...(slide.elements || []), element] }
          : slide
      )));
      setSelectedElementId(element.id);
      setSelectedTextRegion(null);
    } catch (error) {
      toast.error("图片上传失败", error instanceof Error ? error.message : undefined);
    }
  };

  const addPastedText = (value: string) => {
    if (!currentSlide || currentSlide.type === "courseware") return;
    const text = value.trim();
    if (!text) return;
    const element: LessonSlideElement = {
      id: genId("element"),
      kind: "text",
      content: text,
      x: 12,
      y: 8,
      width: 52,
      height: 24,
      fontSize: 22,
      textAlign: "left",
      animation: "none",
      enterAnimation: "none",
      actionAnimation: "none",
      exitAnimation: "none",
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (!currentSlide || currentSlide.type === "courseware") return;
    const target = event.target;
    // Text editors must retain their native paste behaviour.
    if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;

    const clipboardFiles = Array.from(event.clipboardData.files || [])
      .filter((file) => file.type.startsWith("image/"));
    const imageFiles = clipboardFiles.length > 0
      ? clipboardFiles
      : Array.from(event.clipboardData.items || [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

    if (imageFiles.length > 0) {
      event.preventDefault();
      imageFiles.forEach((file, index) => void addImageElement(file, index));
      return;
    }
    const text = event.clipboardData.getData?.("text/plain");
    if (text?.trim()) {
      event.preventDefault();
      if (text.startsWith("inteschool-lesson-element:") && text === systemElementMarkerRef.current && elementClipboard) {
        void pasteElement();
      } else {
        addPastedText(text);
      }
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
      animation: "none",
      enterAnimation: "none",
      actionAnimation: "none",
      exitAnimation: "none",
    };
    updateCurrentElements([...(currentSlide.elements || []), element]);
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
  };

  const loadQuestionBasket = async (basket: Basket | null) => {
    const requestId = ++questionBasketLoadRef.current;
    setSelectedQuestionBasketId(basket?.id || null);
    setBasketQuestions([]);
    if (!basket) {
      setBasketQuestionsLoading(false);
      return;
    }

    setBasketQuestionsLoading(true);
    try {
      const questions = await Promise.all(
        basket.questionIds.map((questionId) => questionService.getQuestion(questionId)),
      );
      if (requestId !== questionBasketLoadRef.current) return;
      setBasketQuestions(questions.filter((question): question is Question => Boolean(question)));
    } catch (error) {
      if (requestId !== questionBasketLoadRef.current) return;
      toast.error("资源篮题目加载失败", error instanceof Error ? error.message : undefined);
      setBasketQuestions([]);
    } finally {
      if (requestId === questionBasketLoadRef.current) setBasketQuestionsLoading(false);
    }
  };

  const openQuestionPicker = async () => {
    if (!teacher) return;
    questionBasketLoadRef.current += 1;
    setQuestionPickerOpen(true);
    setQuestionBaskets([]);
    setSelectedQuestionBasketId(null);
    setBasketQuestions([]);
    setBasketQuestionsLoading(true);
    try {
      const baskets = await basketService.listBaskets(teacher.id);
      setQuestionBaskets(baskets);
      await loadQuestionBasket(preferredBasketForClassIds(baskets, courseware?.classIds || []));
    } catch (error) {
      toast.error("资源篮题目加载失败", error instanceof Error ? error.message : undefined);
      setQuestionBaskets([]);
      setBasketQuestions([]);
      setBasketQuestionsLoading(false);
    }
  };

  const selectQuestionBasket = (basketId: string) => {
    const basket = questionBaskets.find((item) => item.id === basketId) || null;
    void loadQuestionBasket(basket);
  };

  const insertQuestionFromBasket = async (question: Question) => {
    const sourceBasket = questionBaskets.find((basket) => basket.id === selectedQuestionBasketId) || null;
    const slide = createLessonQuestionSlide(question);
    const insertIndex = Math.min(currentIndex + 1, slides.length);
    setSlides((previous) => {
      const next = [...previous];
      next.splice(insertIndex, 0, slide);
      return next;
    });
    setCurrentIndex(insertIndex);
    setSelectedElementId(null);
    setSelectedTextRegion(null);
    setQuestionPickerOpen(false);
    toast.success("已插入题目");

    const removal = await promptToRemoveReferencedBasketQuestions(sourceBasket?.id, [question.id]);
    if (removal.removedQuestionIds.length > 0 && sourceBasket) {
      const removedQuestionIds = new Set(removal.removedQuestionIds);
      setQuestionBaskets((current) => current.map((basket) => basket.id === sourceBasket.id
        ? {
            ...basket,
            questionIds: basket.questionIds.filter((questionId) => !removedQuestionIds.has(questionId)),
          }
        : basket));
      setBasketQuestions((current) => current.filter((item) => !removedQuestionIds.has(item.id)));
    }
    if (removal.failedQuestionIds.length > 0) {
      toast.warning("已插入题目，但未能从资源篮移除");
    }
  };

  const openMaterialPicker = async () => {
    if (!teacher) return;
    setMaterialPickerOpen(true);
    setBasketMaterialsLoading(true);
    try {
      const baskets = await basketService.listBaskets(teacher.id);
      const materialIds = Array.from(new Set(
        baskets.flatMap((basket) => basket.materialIds || []),
      ));
      const materials = await Promise.all(
        materialIds.map((materialId) => materialService.getMaterial(materialId)),
      );
      setBasketMaterials(materials.filter((material): material is Material => Boolean(material)));
    } catch (error) {
      toast.error("资源篮素材加载失败", error instanceof Error ? error.message : undefined);
      setBasketMaterials([]);
    } finally {
      setBasketMaterialsLoading(false);
    }
  };

  const insertMaterialFromBasket = (material: Material) => {
    if (!currentSlide || currentSlide.type === "courseware") return;
    let element: LessonSlideElement | null = null;

    if (material.type === "image") {
      if (!material.fileUrl) {
        toast.error("图片素材缺少可用文件");
        return;
      }
      element = {
        id: genId("element"),
        kind: "image",
        src: material.fileUrl,
        alt: material.title,
        materialId: material.id,
        x: 12,
        y: 8,
        width: 42,
        height: 42,
        animation: "none",
        enterAnimation: "none",
        actionAnimation: "none",
        exitAnimation: "none",
      };
    } else if (material.type === "audio" || material.type === "video") {
      if (!material.fileUrl) {
        toast.error(`${MATERIAL_TYPE_LABEL[material.type]}素材缺少可用文件`);
        return;
      }
      element = {
        id: genId("element"),
        kind: material.type,
        src: material.fileUrl,
        title: material.title,
        materialId: material.id,
        x: 12,
        y: 8,
        width: material.type === "video" ? 50 : 46,
        height: material.type === "video" ? 48 : 16,
        animation: "none",
        enterAnimation: "none",
        actionAnimation: "none",
        exitAnimation: "none",
      };
    } else {
      const href = material.type === "link"
        ? (material.fileUrl || material.content)
        : material.type === "file"
          ? material.fileUrl
          : undefined;
      const content = material.type === "knowledgeBlock"
        ? `${material.title}${material.content ? `\n${material.content}` : ""}`
        : material.content || material.title;
      element = {
        id: genId("element"),
        kind: "text",
        content: material.type === "file" ? material.title : content,
        ...(href ? { href } : undefined),
        x: 12,
        y: 8,
        width: 52,
        height: material.type === "knowledgeBlock" ? 34 : 20,
        autoHeight: material.type === "knowledgeBlock" || material.type === "text",
        fontSize: material.type === "knowledgeBlock" ? 22 : 20,
        textAlign: "left",
        animation: "none",
        enterAnimation: "none",
        actionAnimation: "none",
        exitAnimation: "none",
      };
    }

    if (!element) return;
    const targetSlideId = currentSlide.id;
    setSlides((previous) => previous.map((slide) => (
      slide.id === targetSlideId
        ? { ...slide, elements: [...(slide.elements || []), element] }
        : slide
    )));
    setSelectedElementId(element.id);
    setSelectedTextRegion(null);
    setMaterialPickerOpen(false);
    toast.success(`已插入${MATERIAL_TYPE_LABEL[material.type]}素材`);
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

  const copySelectedElement = () => {
    if (!selectedElement || !currentSlide) return;
    const copied = { element: structuredClone(selectedElement), sourceSlideId: currentSlide.id };
    setElementClipboard(copied);
    const marker = `inteschool-lesson-element:${JSON.stringify(copied)}`;
    systemElementMarkerRef.current = marker;
    void navigator.clipboard?.writeText?.(marker).catch(() => undefined);
    toast.success("已复制元素");
  };

  const cutSelectedElement = () => {
    if (!selectedElement || !currentSlide) return;
    const copied = { element: structuredClone(selectedElement), sourceSlideId: currentSlide.id };
    setElementClipboard(copied);
    const marker = `inteschool-lesson-element:${JSON.stringify(copied)}`;
    systemElementMarkerRef.current = marker;
    void navigator.clipboard?.writeText?.(marker).catch(() => undefined);
    updateCurrentElements((currentSlide.elements || []).filter((element) => element.id !== selectedElement.id));
    setSelectedElementId(null);
    toast.success("已剪切元素");
  };

  const pasteElement = async () => {
    if (!currentSlide || currentSlide.type === "courseware") return;
    const pasteInternal = () => {
      if (!elementClipboard) return false;
      const pastedElement: LessonSlideElement = {
        ...structuredClone(elementClipboard.element), id: genId("element"),
      };
      updateCurrentElements([...(currentSlide.elements || []), pastedElement]);
      setSelectedElementId(pastedElement.id);
      setSelectedTextRegion(null);
      toast.success(elementClipboard.sourceSlideId === currentSlide.id ? "已粘贴元素" : "已粘贴到当前页面");
      return true;
    };

    // The system clipboard takes priority if it has changed since the user
    // copied a deck element. Unsupported/denied clipboard reads still fall
    // back to the internal cross-slide clipboard.
    try {
      const clipboard = navigator.clipboard;
      if (clipboard?.read) {
        const items = await clipboard.read();
        const imageFiles: File[] = [];
        let text = "";
        for (const item of items) {
          const mime = item.types.find((type) => type.startsWith("image/"));
          if (mime) {
            const blob = await item.getType(mime);
            imageFiles.push(new File([blob], `clipboard-${imageFiles.length + 1}.${mime.split("/")[1] || "png"}`, { type: mime }));
          } else if (!text && item.types.includes("text/plain")) {
            text = await (await item.getType("text/plain")).text();
          }
        }
        if (imageFiles.length > 0) {
          imageFiles.forEach((file, index) => void addImageElement(file, index));
          return;
        }
        if (text.startsWith("inteschool-lesson-element:") && text === systemElementMarkerRef.current && pasteInternal()) return;
        if (text.trim() && !text.startsWith("inteschool-lesson-element:")) {
          addPastedText(text);
          return;
        }
      }
      if (clipboard?.readText) {
        const text = await clipboard.readText();
        if (text.startsWith("inteschool-lesson-element:") && text === systemElementMarkerRef.current && pasteInternal()) return;
        if (text.trim() && !text.startsWith("inteschool-lesson-element:")) {
          addPastedText(text);
          return;
        }
      }
      if (!pasteInternal()) toast.warning("剪贴板中没有可粘贴的图片或文本");
    } catch {
      if (!pasteInternal()) toast.warning("无法读取系统剪贴板，请在课件页面按 Ctrl+V 粘贴");
    }
  };

  const currentSaveState: LessonSaveState | null = courseware ? {
    slides,
    title: courseware.title,
    classIds: courseware.classIds,
    boardIds: courseware.boardIds || [],
  } : null;
  const stateJson = currentSaveState ? JSON.stringify(currentSaveState) : null;
  latestDraftRef.current = currentSaveState;
  const hasUnsavedChanges = stateJson !== null && savedDraft !== null
    && stateJson !== JSON.stringify(savedDraft);

  // Keep edit history independent from the last persisted revision, including
  // automatic and explicit saves. The history resets only on loading a deck.
  useEffect(() => {
    if (!stateJson || !currentSaveState) return;
    if (lastUndoStateRef.current === null) {
      lastUndoStateRef.current = stateJson;
    } else if (lastUndoStateRef.current !== stateJson) {
      undoHistoryRef.current = [...undoHistoryRef.current.slice(-99), JSON.parse(lastUndoStateRef.current) as LessonSaveState];
      lastUndoStateRef.current = stateJson;
      setUndoDepth(undoHistoryRef.current.length);
    }
  }, [stateJson]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = () => {
    const previous = undoHistoryRef.current.pop();
    if (!previous) return;
    setUndoDepth(undoHistoryRef.current.length);
    lastUndoStateRef.current = JSON.stringify(previous);
    setSlides(structuredClone(previous.slides));
    setCourseware((current) => current ? {
      ...current,
      title: previous.title,
      classIds: [...previous.classIds],
      boardIds: [...previous.boardIds],
    } : current);
    setSelectedElementId(null);
    setSelectedTextRegion(null);
    setCurrentIndex((index) => Math.min(index, Math.max(0, previous.slides.length - 1)));
  };

  // Serialize saves to avoid stale auto-save responses overwriting newer edits.
  const handleSave = (silent = false): Promise<boolean> => {
    if (!courseware) return Promise.resolve(false);
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const coursewareId = courseware.id;
    const run = async (): Promise<boolean> => {
      setSaving(true);
      try {
        const draft = latestDraftRef.current;
        if (!draft || JSON.stringify(draft) === JSON.stringify(savedDraftRef.current)) return true;
        const snapshot = structuredClone(draft);
        const updated = await lessonCoursewareService.updateCourseware(coursewareId, snapshot);
        // Do not replace newer edits with the stale server response.
        setCourseware((current) => current?.id === coursewareId
          ? { ...updated, title: current.title, classIds: current.classIds, boardIds: current.boardIds }
          : current);
        savedDraftRef.current = snapshot;
        setSavedDraft(snapshot);
        if (!silent) toast.success("已保存");
        return true;
      } catch (err) {
        toast.error(silent ? "自动保存失败" : "保存失败", err instanceof Error ? err.message : undefined);
        return false;
      } finally {
        setSaving(false);
      }
    };
    const pending = run();
    saveInFlightRef.current = pending;
    void pending.finally(() => {
      if (saveInFlightRef.current === pending) saveInFlightRef.current = null;
    });
    return pending;
  };

  const saveBeforeLeaving = async (): Promise<boolean> => {
    // A save already underway may contain an older snapshot. Re-check after
    // each completion before allowing navigation or download.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!(await handleSave(true))) return false;
      if (JSON.stringify(latestDraftRef.current) === JSON.stringify(savedDraftRef.current)) return true;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    toast.error("保存未能完成，请重试");
    return false;
  };

  useAutosave({
    enabled: Boolean(courseware),
    dirty: hasUnsavedChanges,
    saving,
    delayMs: 5 * 60_000,
    onSave: () => { void handleSave(true); },
  });

  saveWhenHiddenRef.current = () => {
    if (JSON.stringify(latestDraftRef.current) !== JSON.stringify(savedDraftRef.current)) {
      void handleSave(true);
    }
  };
  saveOnExitRef.current = () => {
    const draft = latestDraftRef.current;
    if (!courseware || !draft || JSON.stringify(draft) === JSON.stringify(savedDraftRef.current)) return;
    // keepalive fetch supports up to ~64 KiB of queued request body data.
    const body = JSON.stringify({ service: "lessonCourseware", method: "updateCourseware", args: [courseware.id, draft] });
    if (new TextEncoder().encode(body).byteLength > 60_000) return;
    void lessonCoursewareService.saveOnPageHide(courseware.id, structuredClone(draft)).catch(() => undefined);
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const draft = latestDraftRef.current;
      if (!draft || JSON.stringify(draft) === JSON.stringify(savedDraftRef.current)) return;
      const request = JSON.stringify({ service: "lessonCourseware", method: "updateCourseware", args: [id, draft] });
      if (new TextEncoder().encode(request).byteLength > 60_000) {
        // Browsers cannot queue an oversized keepalive request during teardown.
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveWhenHiddenRef.current();
    };
    const onPageHide = () => saveOnExitRef.current();
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [id]);

  const handlePublish = async () => {
    if (!courseware || !teacher?.schoolId) return;
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
        boardIds: courseware.boardIds || [],
        schoolId: teacher.schoolId,
        status: "draft",
        publishedAt: undefined,
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

  const handleUnpublish = async () => {
    if (!courseware) return;
    setPublishing(true);
    try {
      if (!(await saveBeforeLeaving())) return;
      await lessonCoursewareService.unpublishCourseware(courseware.id);
      toast.success("已撤回发布", "课件已从“我要上课”页面撤回，可修改后重新发布");
      await loadCourseware();
    } catch (err) {
      toast.error("撤回发布失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const toggleClass = (classId: string) => {
    if (!courseware) return;
    const removingClass = courseware.classIds.includes(classId);
    const next = removingClass
      ? courseware.classIds.filter((id) => id !== classId)
      : [...courseware.classIds, classId];
    if (removingClass) {
      const removedStudentIds = new Set(
        students.filter((student) => student.classId === classId).map((student) => student.id),
      );
      setSlides((previous) => previous.map((slide) => {
        const nextHiddenClassIds = (slide.hiddenClassIds || []).filter((id) => id !== classId);
        return {
          ...slide,
          askableStudentIds: (slide.askableStudentIds || [])
            .filter((studentId) => !removedStudentIds.has(studentId)),
          hiddenClassIds: nextHiddenClassIds.length > 0 ? nextHiddenClassIds : undefined,
        };
      }));
    }
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

  const setAnimationOrder = (elementId: string, order: number) => {
    setSlides((previous) => previous.map((slide, index) => {
      if (index !== currentIndex) return slide;
      return {
        ...slide,
        elements: (slide.elements || []).map((element) => ({
          ...element,
          animationOrder: element.id === elementId ? order : element.animationOrder,
        })),
      };
    }));
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
    if (!teacher?.schoolId || currentSlide?.type !== "question" || !currentQuestion) {
      setRelatedQuestions([]);
      return;
    }
    const knowledgePointIds = currentQuestion.knowledgePointIds || [];
    if (knowledgePointIds.length === 0) {
      setRelatedQuestions([]);
      return;
    }
    setRelatedQuestionsLoading(true);
    try {
      const qs = await questionService.listQuestions({
        schoolId: teacher.schoolId,
        knowledgePointIds,
        knowledgeLogic: "or",
        excludeQuestionIds: [currentQuestion.id],
      });
      setRelatedQuestions(rankRelatedQuestions(currentQuestion, qs).slice(0, 10));
    } catch (err) {
      console.error(err);
      setRelatedQuestions([]);
    } finally {
      setRelatedQuestionsLoading(false);
    }
  }, [currentQuestion, currentSlide?.type, teacher?.schoolId]);

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

  const openGeoGebraPicker = async (mode: "slide" | "element" = "slide") => {
    if (!teacher) return;
    setGeogebraInsertMode(mode);
    setGeogebraPickerOpen(true);
    setGeogebraPickerLoading(true);
    try {
      const available = await coursewareService.listCoursewares({ teacherId: teacher.id });
      setGeogebraCoursewares(available.filter((item) => item.type === "ggb" && Boolean(getCoursewareFileUrl(item))));
    } catch (error) {
      toast.error("加载 GGB 课件失败", error instanceof Error ? error.message : undefined);
    } finally {
      setGeogebraPickerLoading(false);
    }
  };

  const insertGeoGebraCourseware = (source: Courseware) => {
    if (geogebraInsertMode === "element" && currentSlide?.type !== "courseware") {
      if (!currentSlide) return;
      const element: LessonSlideElement = {
        id: genId("element"),
        kind: "geogebra",
        src: getCoursewareFileUrl(source)!,
        title: source.title,
        coursewareId: source.id,
        x: 12,
        y: 12,
        width: 68,
        height: 68,
      };
      updateCurrentElements([...(currentSlide.elements || []), element]);
      setSelectedElementId(element.id);
      setSelectedTextRegion(null);
      setGeogebraPickerOpen(false);
      toast.success("已在当前页插入 GeoGebra 课件");
      return;
    }
    const slide: LessonSlide = {
      id: genId("slide"),
      type: "courseware",
      title: source.title,
      content: source.description || source.content,
      coursewareType: "ggb",
      fileUrl: source.fileUrl,
      fileName: source.fileName,
      onlineAccessToken: source.onlineAccessToken,
      editorUrl: source.editorUrl,
      relatedQuestionIds: [],
      askableStudentIds: [],
    };
    const next = [...slides];
    next.splice(currentIndex + 1, 0, slide);
    setSlides(next);
    setCurrentIndex(currentIndex + 1);
    setGeogebraPickerOpen(false);
    toast.success("已插入 GeoGebra 课件");
  };

  const addNewSlide = () => {
    const newSlide: LessonSlide = {
      id: genId("slide"),
      type: "knowledge",
      title: "新页面",
      content: "",
      freeformLayout: true,
      elements: [],
      relatedQuestionIds: [],
      askableStudentIds: [],
    };
    const next = [...slides];
    next.splice(currentIndex + 1, 0, newSlide);
    setSlides(next);
    setCurrentIndex(currentIndex + 1);
  };

  const handleOfflineDownload = async () => {
    if (!courseware || downloadingOffline) return;
    setDownloadingOffline(true);
    try {
      if (!(await saveBeforeLeaving())) return;
      const title = courseware.title.trim() || "未命名课件";
      const result = await downloadOfflineLessonCourseware({
        ...courseware,
        title,
        slides,
      });
      if (result.warnings.length > 0) {
        toast.warning(
          "脱机课件已下载",
          `${result.warnings.length} 个资源未能内嵌，离线时可能无法使用`,
        );
      } else {
        toast.success("脱机课件已下载", result.fileName);
      }
    } catch (error) {
      toast.error("下载失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDownloadingOffline(false);
    }
  };

  const openPreview = () => {
    setPreviewMode(true);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const closePreview = () => {
    setPreviewMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  };

  const handleReturn = () => {
    if (isPersonalCourseware) {
      void saveBeforeLeaving().then((saved) => { if (saved) navigate(returnPath); });
      return;
    }
    if (!hasUnsavedChanges && !saving) {
      openPage(returnPath);
      return;
    }
    // Open the new tab in the click gesture; waiting for a network save first
    // would cause popup blockers to suppress the existing new-tab navigation.
    const target = window.open("about:blank", "_blank");
    if (target) target.opener = null;
    void saveBeforeLeaving().then((saved) => {
      if (!saved) {
        target?.close();
        return;
      }
      if (target) target.location.replace(returnPath);
      else navigate(returnPath);
    });
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
    <div className={cn("flex h-dvh min-h-0 flex-col overflow-hidden bg-paper", isEditorFullscreen && "fixed inset-0 z-40 w-screen")} onPaste={handlePaste}>
      {/* 顶部工具栏 */}
      <div className="shrink-0 border-b border-ink-200 bg-paper px-4 py-2" data-testid="lesson-editor-toolbar">
        <div className="flex flex-wrap items-center gap-3 pb-2" data-testid="lesson-editor-toolbar-info">
          <Button variant="ghost" size="sm" onClick={handleReturn}>
            <ChevronLeft className="w-4 h-4" />
            返回
          </Button>
          <div className="h-5 w-px bg-ink-200" />
          <input
            aria-label="课件名称"
            title="修改课件名称"
            value={courseware?.title || ""}
            disabled={!courseware}
            maxLength={120}
            onChange={(event) => {
              const title = event.target.value;
              setCourseware((current) => current ? { ...current, title } : current);
            }}
            onBlur={() => {
              setCourseware((current) => {
                if (!current) return current;
                const title = current.title.trim() || "未命名课件";
                return title === current.title ? current : { ...current, title };
              });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-8 w-72 max-w-[32vw] rounded-md border border-transparent bg-transparent px-2 font-serif font-semibold text-ink-900 outline-none transition-colors hover:border-ink-200 hover:bg-white focus:border-gold-300 focus:bg-white focus:ring-2 focus:ring-gold-100 disabled:cursor-default"
          />
          {isPersonalCourseware ? (
            <Badge variant="ink">个人课件</Badge>
          ) : (
            <Badge variant={courseware?.status === "published" ? "green" : "amber"}>
              {courseware?.status === "published" ? "已发布" : "草稿"}
            </Badge>
          )}
          <div className="flex-1" />
          <div className="text-sm text-ink-500">
            {currentIndex + 1} / {slides.length} 页
          </div>
          <div className="h-5 w-px bg-ink-200" />
          <Button variant="outline" size="sm" onClick={() => setClassModalOpen(true)}>
            <School className="w-4 h-4" />
            授课班级 {courseware?.classIds.length ? `(${courseware.classIds.length})` : ""}
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (!teacher) return;
            setBoardPickerOpen(true);
            void boardService.listBoards(teacher.id).then((items) =>
              setBoardOptions(items.filter((item) => item.kind === "structure")),
            ).catch((err: unknown) => toast.error("获取板书失败", err instanceof Error ? err.message : undefined));
          }}>
            <Blocks className="w-4 h-4" />
            关联板书 {courseware?.boardIds?.length ? `(${courseware.boardIds.length})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleEditorFullscreen}
            title={isEditorFullscreen ? "退出全屏编辑（Esc）" : "全屏编辑课件"}
            aria-pressed={isEditorFullscreen}
          >
            {isEditorFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isEditorFullscreen ? "退出全屏" : "全屏"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-2" data-testid="lesson-editor-toolbar-actions">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={undoDepth === 0}
            title={undoDepth > 0 ? "撤销上一步编辑（包括已保存的修改）" : "没有可撤销的修改"}
          >
            <RotateCcw className="w-4 h-4" />
            撤销
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!hasUnsavedChanges}
            title={hasUnsavedChanges ? "保存修改；每五分钟自动保存未保存的修改" : "没有需要保存的修改"}
          >
            <Save className="w-4 h-4" />
            保存
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleOfflineDownload()}
            loading={downloadingOffline}
            disabled={!courseware}
            title="下载可直接打开的脱机上课页面"
          >
            <Download className="w-4 h-4" />
            下载
          </Button>
          <Button variant="outline" size="sm" onClick={openPreview}>
            <Play className="w-4 h-4" />
            预览上课
          </Button>
          {!isPersonalCourseware && (
            <Button
              variant={courseware?.status === "published" ? "outline" : "gold"}
              size="sm"
              onClick={() => void (courseware?.status === "published" ? handleUnpublish() : handlePublish())}
              loading={publishing}
            >
              {courseware?.status === "published"
                ? <Undo2 className="w-4 h-4" />
                : <Send className="w-4 h-4" />}
              {courseware?.status === "published" ? "撤回发布" : "发布到上课"}
            </Button>
          )}
        </div>
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
                    onClick={() => void openGeoGebraPicker("slide")}
                    className="rounded p-1 text-ink-500 hover:bg-ink-200/50 hover:text-ink-800"
                    title="插入 GGB 课件"
                    aria-label="插入 GGB 课件"
                  >
                    <Blocks className="h-4 w-4" />
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
                            <MathHtml className="block truncate text-xs font-medium text-ink-700">
                              {slide.title}
                            </MathHtml>
                          </div>
                          <MathHtml className="line-clamp-2 text-[10px] text-ink-400">
                            {isQuestion
                              ? slide.questionSnapshot?.stem || "题目"
                              : slide.content || "知识块"}
                          </MathHtml>
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
                  页面内容均为自由元素，可拖动或缩放；单击文本即可直接输入，点击知识块中的图片可单独移动和缩放，也可直接粘贴剪贴板图片。
                </div>

                {currentSlide.type === "courseware" ? (
                  <div
                    className="overflow-hidden rounded-xl bg-paper shadow-lg"
                    style={currentSlide.backgroundColor ? { backgroundColor: currentSlide.backgroundColor } : undefined}
                  >
                    <CoursewareEmbed courseware={currentSlide} title={currentSlide.title} className="h-[64vh]" backgroundColor={currentSlide.backgroundColor || "#FFFFFF"} />
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
                    referenceSize={presentationReferenceSize}
                    editable
                    selectedElementId={selectedElementId}
                    onSelectElement={(elementId) => {
                      setSelectedElementId(elementId);
                      if (elementId) setSelectedTextRegion(null);
                    }}
                    onElementsChange={updateVisibleCurrentElements}
                    canvasStyle={currentSlide.backgroundColor
                      ? { backgroundColor: currentSlide.backgroundColor }
                      : undefined}
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
                      onExtractInlineImage={extractContentImage}
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
                    students={rankedStudents}
                    classes={classes}
                    selectedClassIds={courseware.classIds}
                    followedStudentIds={followedStudentIds}
                    studentWeaknessById={studentWeaknessById}
                    currentQuestion={currentQuestion}
                    relatedQuestions={relatedQuestions}
                    relatedQuestionsLoading={relatedQuestionsLoading}
                    relatedQuestionsById={relatedQuestionsMap}
                    canDeleteSlide={slides.length > 1}
                    canMergeSlide={currentIndex < slides.length - 1}
                    canPasteElement={true}
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
                    onCopyElement={copySelectedElement}
                    onCutElement={cutSelectedElement}
                    onPasteElement={() => void pasteElement()}
                    onUpdateTextStyle={updateSelectedTextStyle}
                    onUpdateSlide={updateCurrentSlide}
                    onAddText={addTextElement}
                    onAddImage={addImageElement}
                    onAddLink={addLinkElement}
                    onAddMaterial={openMaterialPicker}
                    onAddGeoGebra={() => void openGeoGebraPicker("element")}
                    onAddQuestion={openQuestionPicker}
                    onAddSlide={addNewSlide}
                    onSplitSlide={splitSlide}
                    onMergeSlide={mergeWithNext}
                    onDeleteSlide={() => deleteSlide(currentIndex)}
                    onOpenFormulaEditor={openFormulaEditor}
                    onSetAnimationOrder={setAnimationOrder}
                    onToggleStudent={toggleStudent}
                    onLoadRelatedQuestions={loadRelatedQuestions}
                    onAddRelatedQuestion={addRelatedQuestion}
                    onRemoveRelatedQuestion={removeRelatedQuestion}
                    onEditQuestionMetadata={() => setQuestionMetadataOpen(true)}
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
        open={materialPickerOpen}
        onClose={() => setMaterialPickerOpen(false)}
        title="从资源篮插入素材"
        description="显示当前教师所有资源篮中的素材。图片、知识块、音频、视频等会插入当前页；音视频插入后可在属性中设置预约播放时刻。"
        size="lg"
        footer={null}
      >
        {basketMaterialsLoading ? (
          <div className="py-10 text-center text-sm text-ink-500">正在加载资源篮素材...</div>
        ) : basketMaterials.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-500">资源篮中暂无素材</div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {basketMaterials.map((material) => (
              <div key={material.id} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-start gap-3">
                  {material.type === "image" && material.fileUrl ? (
                    <img src={material.fileUrl} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-ink-800">{material.title}</div>
                      <Badge variant="ink">{MATERIAL_TYPE_LABEL[material.type]}</Badge>
                    </div>
                    {material.content && material.type !== "image" && (
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{material.content}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="gold"
                    aria-label={`插入素材：${material.title}`}
                    onClick={() => insertMaterialFromBasket(material)}
                  >
                    <Plus className="h-3.5 w-3.5" />插入
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={questionPickerOpen}
        onClose={() => setQuestionPickerOpen(false)}
        title="从资源篮插入题目"
        description="先选择资源篮，再插入题目。课件已有授课班级时会优先选择使用对象一致的资源篮。"
        size="lg"
        footer={null}
      >
        <div className="mb-4 rounded-lg border border-ink-100 bg-mist/30 p-3">
          <label htmlFor="lesson-question-basket" className="mb-1.5 block text-xs font-medium text-ink-600">
            资源篮
          </label>
          <select
            id="lesson-question-basket"
            aria-label="选择资源篮"
            value={selectedQuestionBasketId || ""}
            disabled={questionBaskets.length === 0}
            onChange={(event) => selectQuestionBasket(event.target.value)}
            className="h-9 w-full rounded-md border border-ink-200 bg-paper px-3 text-sm text-ink-800 outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-100 disabled:cursor-not-allowed disabled:text-ink-400"
          >
            {questionBaskets.length === 0 ? (
              <option value="">暂无资源篮</option>
            ) : questionBaskets.map((basket) => (
              <option key={basket.id} value={basket.id}>
                {basket.name}{basket.isDefault ? "（默认）" : ""}
              </option>
            ))}
          </select>
          {selectedQuestionBasket && (
            <div className="mt-1.5 text-xs text-ink-500">
              使用对象：{basketAudienceLabel(selectedQuestionBasket, classes, students)}
            </div>
          )}
        </div>

        {basketQuestionsLoading ? (
          <div className="py-10 text-center text-sm text-ink-500">正在加载资源篮题目...</div>
        ) : !selectedQuestionBasket ? (
          <div className="py-10 text-center text-sm text-ink-500">暂无可用资源篮</div>
        ) : basketQuestions.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-500">当前资源篮暂无题目</div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {basketQuestions.map((question) => (
              <div key={question.id} className="rounded-lg border border-ink-100 p-3">
                <div className="mb-2 flex items-start gap-3">
                  <MathHtml className="min-w-0 flex-1 text-sm leading-6 text-ink-800">{question.stem}</MathHtml>
                  <Badge variant="ink">{question.type}</Badge>
                </div>
                {question.options && question.options.length > 0 && (
                  <div className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {question.options.map((option, index) => (
                      <div key={`${question.id}-picker-option-${index}`} className="flex items-start gap-2 rounded bg-mist/40 px-2 py-1.5 text-xs text-ink-600">
                        <span className="font-mono">{String.fromCharCode(65 + index)}.</span>
                        <MathHtml className="min-w-0 flex-1">{option}</MathHtml>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button size="sm" variant="gold" onClick={() => void insertQuestionFromBasket(question)}>
                    <Plus className="h-3.5 w-3.5" />插入
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        title="选择授课班级"
        description="发布后，所选班级可在“我要上课”中看到该课件"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setClassModalOpen(false)}>完成</Button>
            <Button
              variant="gold"
              onClick={async () => { await handleSave(); setClassModalOpen(false); }}
              loading={saving}
              disabled={!hasUnsavedChanges}
            >
              <Save className="w-4 h-4" />保存班级
            </Button>
          </div>
        }
      >
        <div className="space-y-2 max-h-80 overflow-auto">
          {selectableClasses.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-500">暂无可选班级</div>
          ) : selectableClasses.map((item) => {
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
                <span className="flex-1 text-sm text-ink-800">{item.type === "personal" ? item.name : `${item.grade} · ${item.name}`}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      <QuickEditModal
        open={questionMetadataOpen}
        onClose={() => setQuestionMetadataOpen(false)}
        question={currentQuestion}
        onSaved={(question) => {
          setCurrentQuestion(question);
          setRelatedQuestionsMap((questions) => (
            questions[question.id] ? { ...questions, [question.id]: question } : questions
          ));
        }}
      />

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

      <Modal
        open={geogebraPickerOpen}
        onClose={() => setGeogebraPickerOpen(false)}
        title="插入 GGB 课件"
        description={geogebraInsertMode === "element" && currentSlide?.type !== "courseware"
          ? "选择课件库中的 GeoGebra 课件，插入当前页面。可拖动、缩放并在上课时交互。"
          : "选择课件库中的 GeoGebra 课件，在当前页之后插入一个可交互的课件页面。"}
        size="lg"
      >
        {geogebraPickerLoading ? (
          <div className="py-10 text-center text-sm text-ink-500">正在加载 GGB 课件...</div>
        ) : geogebraCoursewares.length === 0 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm text-ink-500">课件库中暂无 GGB 文件，请先在素材库制作并保存。</p>
            <Button variant="outline" size="sm" onClick={() => openPage("/geogebra/new?mode=classic")}>
              <Plus className="w-4 h-4" />制作 GGB
            </Button>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {geogebraCoursewares.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-ink-100 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-800">{item.title}</div>
                  <div className="text-xs text-ink-500">{item.tags.includes("几何画板") ? "几何画板" : "GeoGebra"} · {item.grade}</div>
                </div>
                <Button variant="gold" size="sm" onClick={() => insertGeoGebraCourseware(item)}>
                  <Plus className="w-4 h-4" />插入
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={boardPickerOpen} onClose={() => setBoardPickerOpen(false)} title="关联结构板书" size="lg">
        <div className="max-h-[55vh] space-y-2 overflow-auto p-1">
          {boardOptions.length === 0 ? <p className="py-5 text-center text-sm text-ink-500">暂无结构板书，请先在“我的资源 → 导图库”创建。</p> :
            boardOptions.map((item) => {
              const linked = courseware?.boardIds?.includes(item.id) || false;
              return <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-100 p-3 text-sm hover:bg-mist">
                <input type="checkbox" checked={linked} onChange={(event) => setCourseware((current) => {
                  if (!current) return current;
                  const previous = current.boardIds || [];
                  const boardIds = event.target.checked ? [...previous.filter((id) => id !== item.id), item.id]
                    : previous.filter((id) => id !== item.id);
                  return { ...current, boardIds };
                })} />
                <span className="flex-1 font-medium">{item.title}</span>
                <span className="text-xs text-ink-400">{item.nodes.length} 节点</span>
              </label>;
            })}
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => setBoardPickerOpen(false)}>完成（自动保存）</Button>
        </div>
      </Modal>

      {/* 预览模式（全屏覆盖） */}
      {previewMode && (
        <PresentationMode
          slides={slides}
          initialIndex={currentIndex}
          boardIds={courseware?.boardIds}
          boardOwnerId={teacher?.id}
          students={students}
          followedStudentIds={followedStudentIds}
          ignoredStudentIds={ignoredStudentIds}
          relatedQuestionsById={relatedQuestionsMap}
          preferenceOwnerId={teacher?.id}
          onExit={closePreview}
        />
      )}
    </div>
  );
}

export default LessonEditorPage;
