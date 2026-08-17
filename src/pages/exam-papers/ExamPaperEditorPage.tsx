import { useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Save, Eye, Edit3, Plus, Trash2, ShoppingBasket,
  FileSpreadsheet, GraduationCap, Users, Send,
  ChevronUp, ChevronDown, ChevronRight, Library, Files, FileText, ListOrdered, Copy,
  AlertCircle, Lock, Calendar, Layout,
  Sparkles, BookOpen, Lightbulb, Download,
  CheckSquare, ArrowUpDown, Link2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { examPaperService } from "@/services/examPaper";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import { lectureService } from "@/services/lecture";
import { promptToRemoveReferencedBasketQuestions } from "@/lib/basket-reference";
import { classService as classSvc } from "@/services/class";
import { examPublishService } from "@/services/examPublish";
import { knowledgeService } from "@/services/knowledge";
import { analyticsService, type DateRange } from "@/services/analytics";
import { settingsService } from "@/services/settings";
import { prepService } from "@/services/prep";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionCard } from "@/components/question/QuestionCard";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { QuestionDistributionPanel } from "@/components/editor/QuestionDistributionPanel";
import { ClassAudiencePicker } from "@/components/editor/ClassAudiencePicker";
import { StudentAnswerStatusControl } from "@/components/editor/StudentAnswerStatusControl";
import {
  PreviewSidebarControls,
  type PreviewSidebarVisibility,
} from "@/components/editor/PreviewSidebarControls";
import { AddResourceToPrepModal } from "@/components/prep/AddResourceToPrepModal";
import { ResourceCommentButton } from "@/components/prep/ResourceCommentButton";
import { DocumentDownloadModeModal } from "@/components/resource/DocumentDownloadModeModal";
import { ExtractedQuestionContent } from "@/pages/exam-papers/ExtractedQuestionContent";
import {
  commonScoreUnderHeading,
  questionIdsUnderHeading,
  resolveExtractedQuestionDisplay,
  setScoreUnderHeading,
} from "@/pages/exam-papers/extracted-document";
import {
  buildQuestionProgress,
  canMoveStructuredQuestionGroup,
  getCollapsedStructuredBlockIds,
  getHeadingInsertIndex,
  insertBlocksUnderHeading,
  isQuestionGroupBlock,
  moveStructuredQuestionGroup,
  orderPaperQuestionsByContentBlocks,
  type QuestionProgress,
} from "@/pages/exam-papers/exam-paper-editor-helpers";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import type {
  AnswerRecord,
  AnswerScore,
  AnyClass,
  Basket,
  ExamPaper,
  ExamPaperQuestion,
  ExamPaperType,
  ExamPublication,
  ExtractedDocumentBlock,
  Lecture,
  LessonCourseware,
  PrepResourceComment,
  PrepTask,
  Question,
  ResourceSemester,
  SimilarQuestionCandidate,
  Student,
  TreeNode,
} from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";
import { buildResourceTypeOptions } from "@/lib/resource-type-hierarchy";
import {
  downloadExamPaperDocxVariants,
  type DocumentDownloadMode,
} from "@/lib/docx";
import { treeNameMap } from "@/lib/basket-audience";
import { classAudienceLabel, resolveClassAudienceStudents } from "@/lib/class-audience";
import { isDocumentStructureLocked } from "@/lib/document-resource";

type TimeRangeKey = "all" | "1month" | "2month" | "3month" | "6month" | "1year" | "2year";

const timeRangeOptions: { value: TimeRangeKey; label: string }[] = [
  { value: "all", label: "全部时间" },
  { value: "1month", label: "一个月内" },
  { value: "2month", label: "两个月内" },
  { value: "3month", label: "三个月内" },
  { value: "6month", label: "半年内" },
  { value: "1year", label: "一年内" },
  { value: "2year", label: "两年内" },
];

function getDateRange(key: TimeRangeKey): DateRange | undefined {
  if (key === "all") return undefined;
  const now = new Date();
  const start = new Date();
  switch (key) {
    case "1month":
      start.setMonth(now.getMonth() - 1);
      break;
    case "2month":
      start.setMonth(now.getMonth() - 2);
      break;
    case "3month":
      start.setMonth(now.getMonth() - 3);
      break;
    case "6month":
      start.setMonth(now.getMonth() - 6);
      break;
    case "1year":
      start.setFullYear(now.getFullYear() - 1);
      break;
    case "2year":
      start.setFullYear(now.getFullYear() - 2);
      break;
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

const typeLabel: Record<string, string> = {
  single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答",
};
const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];
const difficultyVariant = ["", "green", "green", "amber", "red", "red"];

interface QuestionGroup {
  type: string;
  label: string;
  questions: { pq: ExamPaperQuestion; index: number; question: Question | null | undefined }[];
}

const typeOrder = ["single", "multiple", "judge", "short", "essay"];
const typeLabels: Record<string, string> = {
  single: "一、单选题",
  multiple: "二、多选题",
  judge: "三、判断题",
  short: "四、填空题",
  essay: "五、解答题",
};
const sectionNumerals = ["一", "二", "三", "四", "五", "六", "七", "八"];
const getGroupHeading = (type: string, index: number) =>
  `${sectionNumerals[index] || index + 1}、${typeLabel[type] || type}题`;

const groupByType = (questions: ExamPaperQuestion[], qMap: Record<string, Question>, order?: string[]): QuestionGroup[] => {
  const groups: Record<string, QuestionGroup> = {};
  const effectiveOrder = order || typeOrder;

  questions.forEach((pq, idx) => {
    const q = pq.questionId ? qMap[pq.questionId] : null;
    const qType = q?.type || pq.type;
    if (!groups[qType]) {
      groups[qType] = { type: qType, label: typeLabels[qType] || qType, questions: [] };
    }
    groups[qType].questions.push({ pq, index: idx, question: q });
  });

  return effectiveOrder.filter((t) => groups[t]).map((t) => groups[t]);
};

type AddSource = "choose" | "basket" | "bank" | "examPaper" | "lecture";

type AddTarget =
  | { kind: "group"; groupType: string; label: string }
  | { kind: "heading"; headingId: string; label: string }
  | null;

interface ExamPaperNavigationDraft {
  paperId: string;
  title: string;
  description: string;
  grade: string;
  schoolYear: string;
  semester: ResourceSemester;
  typeId: string;
  duration: number;
  paperQuestions: ExamPaperQuestion[];
  contentBlocks: ExtractedDocumentBlock[];
  layoutMode: "grouped" | "flat";
  selectedClassIds: string[];
  questions: Record<string, Question>;
}

interface ExamPaperNavigationState {
  examPaperDraft?: ExamPaperNavigationDraft;
}

export default function ExamPaperEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPreview = location.pathname.endsWith("/preview") || searchParams.get("preview") === "1";
  const navigationDraft = (location.state as ExamPaperNavigationState | null)?.examPaperDraft;
  const prepTaskId = searchParams.get("prepTask");
  const { teacher } = useAuthStore();
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(teacher?.schoolId);

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const isStructureLocked = isDocumentStructureLocked(paper);
  const [questions, setQuestions] = useState<Record<string, Question>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadModes, setDownloadModes] = useState<DocumentDownloadMode[]>(["teacher"]);
  const [duplicating, setDuplicating] = useState(false);
  const [sendingToCourseware, setSendingToCourseware] = useState(false);
  const [linkedCourseware, setLinkedCourseware] = useState<LessonCourseware | null>(null);
  const [linkedCoursewareLoading, setLinkedCoursewareLoading] = useState(false);
  const [prepTask, setPrepTask] = useState<PrepTask | null>(null);
  const [prepComments, setPrepComments] = useState<PrepResourceComment[]>([]);
  const [prepPassword, setPrepPassword] = useState(() =>
    prepTaskId ? sessionStorage.getItem(`prep-resource-password:${prepTaskId}`) || "" : "",
  );
  const [prepPasswordInput, setPrepPasswordInput] = useState("");
  const [prepPasswordOpen, setPrepPasswordOpen] = useState(false);
  const [prepSetupOpen, setPrepSetupOpen] = useState(false);

  // 编辑状态
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [semester, setSemester] = useState<ResourceSemester>("上学期");
  const [typeId, setTypeId] = useState<string>("");
  const [examPaperTypes, setExamPaperTypes] = useState<ExamPaperType[]>([]);
  const examPaperTypeOptions = useMemo(
    () => buildResourceTypeOptions(examPaperTypes, { enabledOnly: true, currentId: typeId }),
    [examPaperTypes, typeId],
  );
  const [duration, setDuration] = useState(90);
  const [paperQuestions, setPaperQuestions] = useState<ExamPaperQuestion[]>([]);
  const [contentBlocks, setContentBlocks] = useState<ExtractedDocumentBlock[]>([]);
  const [layoutMode, setLayoutMode] = useState<"grouped" | "flat">("grouped");
  const [markingAllDone, setMarkingAllDone] = useState(false);
  const [previewSidebarVisibility, setPreviewSidebarVisibility] = useState<PreviewSidebarVisibility>(
    { properties: true, answerStatus: true, basket: true },
  );
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);

  // 试题篮
  const [baskets, setBaskets] = useState<Basket[]>([]);

  // 发布弹窗
  const [publishOpen, setPublishOpen] = useState(false);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [publishTargetClassIds, setPublishTargetClassIds] = useState<string[]>([]);
  const [publishPassword, setPublishPassword] = useState("");
  const [publishUnlockAt, setPublishUnlockAt] = useState("");

  // 发布记录
  const [publications, setPublications] = useState<ExamPublication[]>([]);
  const [revoking, setRevoking] = useState(false);

  // 大题型顺序（编辑模式）
  const [groupOrder, setGroupOrder] = useState<string[]>(typeOrder);
  const [collapsedGroupTypes, setCollapsedGroupTypes] = useState<Set<string>>(new Set());
  const [collapsedHeadingIds, setCollapsedHeadingIds] = useState<Set<string>>(new Set());

  // 添加题目
  const [addSource, setAddSource] = useState<AddSource | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankKeyword, setBankKeyword] = useState("");
  const [selectedBasket, setSelectedBasket] = useState<Basket | null>(null);
  const [otherPapers, setOtherPapers] = useState<ExamPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [otherLectures, setOtherLectures] = useState<Lecture[]>([]);
  const [selectedLecture, setSelectedLecture] = useState<Lecture | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  // AI 自动组卷
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [autoGenStep, setAutoGenStep] = useState<1 | 2 | 3>(1);
  const [autoChapterIds, setAutoChapterIds] = useState<string[]>([]);
  const [autoKnowledgeIds, setAutoKnowledgeIds] = useState<string[]>([]);
  const [autoLeftTab, setAutoLeftTab] = useState<"chapter" | "knowledge">("chapter");
  const [autoChapterTree, setAutoChapterTree] = useState<TreeNode | null>(null);
  const [autoKnowledgeTree, setAutoKnowledgeTree] = useState<TreeNode | null>(null);
  const [autoTypeCounts, setAutoTypeCounts] = useState<Record<string, number>>({
    single: 5, multiple: 3, judge: 2, short: 3, essay: 2,
  });
  const [autoDifficulty, setAutoDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGeneratedQuestions, setAutoGeneratedQuestions] = useState<Question[]>([]);

  // 文档使用对象（仅班级）+ 时间周期 + 已做题目
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [audiencePickerOpen, setAudiencePickerOpen] = useState(false);
  const [audienceSaving, setAudienceSaving] = useState(false);
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("all");
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [questionProgress, setQuestionProgress] = useState<Record<string, QuestionProgress>>({});
  const [answerRecords, setAnswerRecords] = useState<AnswerRecord[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const dateRange = useMemo(() => getDateRange(timeRangeKey), [timeRangeKey]);
  const audienceStudents = useMemo(
    () => resolveClassAudienceStudents(selectedClassIds, classes, students),
    [selectedClassIds, classes, students],
  );
  const audienceStudentIds = useMemo(
    () => audienceStudents.map((student) => student.id),
    [audienceStudents],
  );
  const selectedClassLabel = useMemo(
    () => classAudienceLabel(selectedClassIds, classes),
    [selectedClassIds, classes],
  );

  const schoolId = teacher?.schoolId || "sch-1";
  const hiddenStructuredBlockIds = useMemo(
    () => getCollapsedStructuredBlockIds(contentBlocks, collapsedHeadingIds),
    [contentBlocks, collapsedHeadingIds],
  );
  const addTargetQuestionType = useMemo(() => {
    if (addTarget?.kind === "group") return addTarget.groupType;
    if (addTarget?.kind === "heading") {
      return contentBlocks.find((block) => block.id === addTarget.headingId)?.questionType;
    }
    return undefined;
  }, [addTarget, contentBlocks]);

  const getQuestionProgress = useCallback((questionId: string): QuestionProgress | undefined => {
    if (audienceStudentIds.length === 0) return undefined;
    return questionProgress[questionId] || {
      answeredCount: 0,
      targetCount: audienceStudentIds.length,
      scoredCount: 0,
      correctRate: null,
    };
  }, [audienceStudentIds.length, questionProgress]);

  const openAddQuestion = useCallback((target: AddTarget = null) => {
    if (isStructureLocked) return;
    setAddTarget(target);
    setReplaceIdx(null);
    setAddSource("choose");
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedPaper(null);
    setSelectedLecture(null);
    if (target?.kind === "group") {
      setCollapsedGroupTypes((previous) => {
        const next = new Set(previous);
        next.delete(target.groupType);
        return next;
      });
    }
    if (target?.kind === "heading") {
      setCollapsedHeadingIds((previous) => {
        const next = new Set(previous);
        next.delete(target.headingId);
        return next;
      });
    }
  }, [isStructureLocked]);

  const closeAddQuestion = useCallback(() => {
    setAddSource(null);
    setAddTarget(null);
    setReplaceIdx(null);
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedPaper(null);
    setSelectedLecture(null);
  }, []);

  const chooseAddSource = useCallback((source: Exclude<AddSource, "choose">) => {
    setAddSource(source);
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedPaper(null);
    setSelectedLecture(null);
  }, []);

  const loadPaper = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      let p: ExamPaper | null;
      if (prepTaskId) {
        const linked = await prepService.getLinkedResource(prepTaskId, prepPassword || undefined);
        if (!("questions" in linked.resource)) throw new Error("该协作任务关联的不是试卷");
        p = linked.resource;
        setPrepTask(linked.task);
        setPrepComments(linked.comments);
      } else {
        p = await examPaperService.getPaper(id);
        setPrepTask(null);
        setPrepComments([]);
      }
      if (!p) {
        toast.error("试卷不存在");
        navigate("/my-resources");
        return;
      }
      const draft = navigationDraft?.paperId === p.id ? navigationDraft : undefined;
      const nextPaperQuestions = draft?.paperQuestions || p.questions;
      const nextContentBlocks = draft?.contentBlocks || p.contentBlocks || [];
      const nextPaper = draft
        ? {
            ...p,
            title: draft.title,
            description: draft.description,
            grade: draft.grade,
            schoolYear: draft.schoolYear,
            semester: draft.semester,
            typeId: draft.typeId || undefined,
            duration: draft.duration,
            questions: nextPaperQuestions,
            contentBlocks: nextContentBlocks,
            layoutMode: draft.layoutMode,
            classIds: draft.selectedClassIds,
            studentIds: [],
          }
        : p;
      setPaper(nextPaper);
      setTitle(draft?.title ?? p.title);
      setDescription(draft?.description ?? p.description ?? "");
      setGrade(draft?.grade ?? p.grade);
      setSchoolYear(draft?.schoolYear ?? p.schoolYear);
      setSemester(draft?.semester ?? p.semester ?? "上学期");
      setTypeId(draft?.typeId ?? p.typeId ?? "");
      setDuration(draft?.duration ?? p.duration);
      setPaperQuestions(nextPaperQuestions);
      setContentBlocks(nextContentBlocks);
      setLayoutMode(draft?.layoutMode ?? p.layoutMode ?? "grouped");
      setSelectedClassIds(draft?.selectedClassIds ?? p.classIds ?? []);
      setPrepPasswordOpen(false);
      // 加载关联题目
      const qMap: Record<string, Question> = { ...(draft?.questions || {}) };
      const qIds = nextPaperQuestions.map((q) => q.questionId).filter(Boolean) as string[];
      const missingQuestionIds = qIds.filter((questionId) => !qMap[questionId]);
      if (missingQuestionIds.length > 0) {
        const all = await questionService.listQuestions({ schoolId });
        all.forEach((q) => { if (missingQuestionIds.includes(q.id)) qMap[q.id] = q; });
      }
      setQuestions(qMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : "试卷加载失败";
      if (prepTaskId && message.includes("密码")) {
        setPrepPasswordOpen(true);
      } else {
        toast.error("加载失败", message);
        navigate(prepTaskId ? "/prep" : "/my-resources/exam-papers");
      }
    } finally {
      setLoading(false);
    }
  }, [id, navigate, navigationDraft, prepPassword, prepTaskId, schoolId]);

  useEffect(() => {
    loadPaper();
    if (teacher) {
      basketService.listBaskets(teacher.id).then(setBaskets);
      classSvc.listAllClasses(schoolId, teacher.id).then(setClasses);
      classSvc.listStudentsBySchool(schoolId).then(setStudents);
      // 加载试卷类型
      settingsService.listExamPaperTypes(schoolId).then(setExamPaperTypes);
      knowledgeService.getChapterTree(schoolId).then(setChapterTree);
      knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
    }
    // 加载发布记录
    examPublishService.listPublications(schoolId).then((pubs) => {
      if (id) {
        setPublications(pubs.filter((p) => p.examPaperId === id));
      }
    });
  }, [id, teacher, schoolId, loadPaper]);

  useEffect(() => {
    if (prepTaskId || !paper || !teacher || paper.teacherId !== teacher.id || !teacher.schoolId) {
      setLinkedCourseware(null);
      setLinkedCoursewareLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedCoursewareLoading(true);
    lessonCoursewareService.getCoursewareBySource(
      teacher.id,
      teacher.schoolId,
      "examPaper",
      paper.id,
    ).then((courseware) => {
      if (!cancelled) setLinkedCourseware(courseware);
    }).catch(() => {
      if (!cancelled) setLinkedCourseware(null);
    }).finally(() => {
      if (!cancelled) setLinkedCoursewareLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [paper, prepTaskId, teacher]);

  // 当使用班级或时间周期变化时，加载每道题的完成情况和正确率。
  useEffect(() => {
    if (audienceStudentIds.length === 0) {
      setAnsweredQuestionIds(new Set());
      setQuestionProgress({});
      setAnswerRecords([]);
      return;
    }
    let cancelled = false;
    analyticsService.listAnswerRecordsByStudents(audienceStudentIds, dateRange)
      .then((records) => {
        if (cancelled) return;
        const paperRecords = records.filter((record) => record.lectureId === id);
        setAnswerRecords(paperRecords);
        setAnsweredQuestionIds(new Set(paperRecords.map((record) => record.questionId)));
        setQuestionProgress(buildQuestionProgress(paperRecords, audienceStudentIds));
      })
      .catch(() => {
        if (cancelled) return;
        setAnswerRecords([]);
        setAnsweredQuestionIds(new Set());
        setQuestionProgress({});
      });
    return () => {
      cancelled = true;
    };
  }, [audienceStudentIds, dateRange, id]);

  // 题库搜索
  useEffect(() => {
    if (!teacher) return;
    const t = setTimeout(async () => {
      const qs = await questionService.listQuestions({ schoolId, keyword: bankKeyword });
      setBankQuestions(qs.slice(0, 30));
    }, 250);
    return () => clearTimeout(t);
  }, [bankKeyword, schoolId, teacher]);

  useEffect(() => {
    if (teacher && addSource === "examPaper") {
      examPaperService.listPapers({ schoolId, teacherId: teacher.id }).then((ps) =>
        setOtherPapers(ps.filter((p) => p.id !== id)),
      );
    }
    if (teacher && addSource === "lecture") {
      lectureService.listLectures({ schoolId, teacherId: teacher.id }).then(setOtherLectures);
    }
  }, [addSource, schoolId, teacher, id]);

  // AI 组卷弹窗打开时加载章节/知识点树
  useEffect(() => {
    if (!teacher || !autoGenOpen) return;
    knowledgeService.getChapterTree(schoolId).then(setAutoChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setAutoKnowledgeTree);
  }, [autoGenOpen, schoolId, teacher]);

  // AI 自动组卷
  const handleAutoGeneratePaper = useCallback(async () => {
    if (!teacher) return;
    if (autoChapterIds.length === 0 && autoKnowledgeIds.length === 0) {
      toast.warning("请至少选择一个章节或知识点");
      return;
    }
    const totalCount = Object.values(autoTypeCounts).reduce((a, b) => a + b, 0);
    if (totalCount === 0) {
      toast.warning("请至少设置一道题目");
      return;
    }
    setAutoGenerating(true);
    try {
      const allQs = await questionService.listQuestions({
        schoolId,
        chapterIds: autoChapterIds.length > 0 ? autoChapterIds : undefined,
        knowledgePointIds: autoKnowledgeIds.length > 0 ? autoKnowledgeIds : undefined,
      });
      let pool = [...allQs];
      if (autoDifficulty === "easy") {
        pool = pool.filter((q) => q.difficulty <= 2);
      } else if (autoDifficulty === "medium") {
        pool = pool.filter((q) => q.difficulty === 3);
      } else if (autoDifficulty === "hard") {
        pool = pool.filter((q) => q.difficulty >= 4);
      }
      const result: Question[] = [];
      for (const [qtype, count] of Object.entries(autoTypeCounts)) {
        const typePool = pool.filter((q) => q.type === qtype);
        const shuffled = [...typePool].sort(() => Math.random() - 0.5);
        result.push(...shuffled.slice(0, count));
      }
      setAutoGeneratedQuestions(result);
      setAutoGenStep(3);
    } catch (e: any) {
      toast.error("组卷失败", e?.message);
    } finally {
      setAutoGenerating(false);
    }
  }, [autoChapterIds, autoKnowledgeIds, autoTypeCounts, autoDifficulty, schoolId, teacher]);

  // 确认添加 AI 生成的题目到试卷
  const handleConfirmAutoGen = useCallback(() => {
    if (autoGeneratedQuestions.length === 0) {
      toast.warning("没有可添加的题目");
      return;
    }
    const newPqs: ExamPaperQuestion[] = autoGeneratedQuestions.map((q) => ({
      id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      questionId: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      score: q.type === "essay" ? 12 : q.type === "short" ? 5 : q.type === "multiple" ? 3 : 2,
      type: q.type,
    }));
    setPaperQuestions((prev) => [...prev, ...newPqs]);
    const qMap: Record<string, Question> = {};
    autoGeneratedQuestions.forEach((q) => { qMap[q.id] = q; });
    setQuestions((prev) => ({ ...prev, ...qMap }));
    toast.success(`已添加 ${autoGeneratedQuestions.length} 道题目到试卷`);
    setAutoGenOpen(false);
    setAutoGenStep(1);
  }, [autoGeneratedQuestions]);

  // 难度分布统计
  const difficultyStats = useMemo(() => {
    const stats = [0, 0, 0, 0, 0, 0];
    paperQuestions.forEach((pq) => {
      const q = pq.questionId ? questions[pq.questionId] : null;
      const diff = q?.difficulty || 3;
      stats[diff]++;
    });
    return stats;
  }, [paperQuestions, questions]);

  const activePublications = useMemo(
    () => publications.filter((publication) => publication.status === "active"),
    [publications],
  );

  const chapterNameMap = useMemo(() => treeNameMap(chapterTree), [chapterTree]);
  const knowledgeNameMap = useMemo(() => treeNameMap(knowledgeTree), [knowledgeTree]);
  const includedKnowledgePointIds = useMemo(() => {
    const ids = new Set(paper?.knowledgePointIds || []);
    paperQuestions.forEach((paperQuestion) => {
      if (!paperQuestion.questionId) return;
      questions[paperQuestion.questionId]?.knowledgePointIds.forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  }, [paper?.knowledgePointIds, paperQuestions, questions]);
  const includedKnowledgePointNames = useMemo(
    () => includedKnowledgePointIds.map((id) => knowledgeNameMap.get(id) || "未命名知识点"),
    [includedKnowledgePointIds, knowledgeNameMap],
  );

  const totalScore = useMemo(() =>
    paperQuestions.reduce((sum, q) => sum + q.score, 0), [paperQuestions]);
  const paperQuestionIds = useMemo(
    () => new Set(paperQuestions.map((question) => question.questionId).filter(Boolean) as string[]),
    [paperQuestions],
  );

  const isStructuredExtract = Boolean(paper?.isExtractCopy && contentBlocks.length > 0);

  const buildNavigationDraft = useCallback((): ExamPaperNavigationDraft | undefined => {
    if (!paper) return undefined;
    return {
      paperId: paper.id,
      title,
      description,
      grade,
      schoolYear,
      semester,
      typeId,
      duration,
      paperQuestions,
      contentBlocks,
      layoutMode,
      selectedClassIds,
      questions,
    };
  }, [
    contentBlocks,
    description,
    duration,
    grade,
    layoutMode,
    paper,
    paperQuestions,
    questions,
    schoolYear,
    selectedClassIds,
    semester,
    title,
    typeId,
  ]);

  const navigateWithDraft = useCallback((path: string) => {
    navigate(path, { state: { examPaperDraft: buildNavigationDraft() } satisfies ExamPaperNavigationState });
  }, [buildNavigationDraft, navigate]);

  const updateContentBlock = (
    blockId: string,
    patch: Partial<ExtractedDocumentBlock>,
  ) => {
    const current = contentBlocks.find((block) => block.id === blockId);
    setContentBlocks((previous) => previous.map((block) =>
      block.id === blockId ? { ...block, ...patch } : block,
    ));
    if (current?.type === "question" && current.examPaperQuestionId && patch.content !== undefined) {
      setPaperQuestions((previous) => previous.map((question) =>
        question.id === current.examPaperQuestionId
          ? { ...question, stem: patch.content! }
          : question,
      ));
    }
  };

  const moveContentBlock = (index: number, direction: "up" | "down") => {
    if (isStructureLocked) return;
    const block = contentBlocks[index];
    if (!block) return;

    let next: ExtractedDocumentBlock[];
    if (isQuestionGroupBlock(block)) {
      next = moveStructuredQuestionGroup(contentBlocks, block.id, direction);
    } else {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= contentBlocks.length) return;
      next = [...contentBlocks];
      [next[index], next[target]] = [next[target], next[index]];
    }

    if (next === contentBlocks) return;
    setContentBlocks(next);
    setPaperQuestions((previous) => orderPaperQuestionsByContentBlocks(next, previous));
  };

  const removeContentBlock = (blockId: string) => {
    if (isStructureLocked) return;
    const block = contentBlocks.find((item) => item.id === blockId);
    setContentBlocks((previous) => previous.filter((item) => item.id !== blockId));
    if (block?.examPaperQuestionId) {
      setPaperQuestions((previous) => previous.filter(
        (question) => question.id !== block.examPaperQuestionId,
      ));
    }
  };

  const paperQuestionList = useMemo(
    () => paperQuestions
      .map((item) => {
        const linkedQuestion = item.questionId ? questions[item.questionId] : undefined;
        return linkedQuestion || { difficulty: 3 as const, knowledgePointIds: [] };
      }),
    [paperQuestions, questions],
  );

  const getCompletionQuestionId = (paperQuestion: ExamPaperQuestion) =>
    paperQuestion.questionId || `exam-item:${paper?.id || id}:${paperQuestion.id}`;

  const refreshBaskets = useCallback(async () => {
    if (!teacher) return;
    setBaskets(await basketService.listBaskets(teacher.id));
  }, [teacher]);

  const handleUpdateQuestionCatalogs = useCallback(async (
    questionId: string,
    chapterIds: string[],
    knowledgePointIds: string[],
  ) => {
    try {
      const updated = await questionService.updateQuestion(questionId, {
        chapterIds,
        knowledgePointIds,
      });
      setQuestions((previous) => ({ ...previous, [questionId]: updated }));
      toast.success("章节课和知识点已更新");
    } catch (error) {
      toast.error("更新失败", error instanceof Error ? error.message : "请稍后重试");
      throw error;
    }
  }, []);

  // 编辑模式：调整顺序
  const handleMove = (idx: number, dir: "up" | "down") => {
    if (isStructureLocked) return;
    setPaperQuestions((prev) => {
      const next = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleMoveWithinGroup = (idx: number, dir: "up" | "down") => {
    if (isStructureLocked) return;
    setPaperQuestions((prev) => {
      const current = prev[idx];
      if (!current) return prev;
      const currentType = questions[current.questionId || ""]?.type || current.type;
      const step = dir === "up" ? -1 : 1;
      let target = idx + step;

      while (target >= 0 && target < prev.length) {
        const candidate = prev[target];
        const candidateType = questions[candidate.questionId || ""]?.type || candidate.type;
        if (candidateType === currentType) {
          const next = [...prev];
          [next[idx], next[target]] = [next[target], next[idx]];
          return next;
        }
        target += step;
      }
      return prev;
    });
  };

  // 编辑模式：删除题目
  const handleRemoveQuestion = (pqId: string) => {
    if (isStructureLocked) return;
    setPaperQuestions((prev) => prev.filter((q) => q.id !== pqId));
    setContentBlocks((prev) => prev.filter((block) => block.examPaperQuestionId !== pqId));
  };

  // 编辑模式：换题（替换某题的题库关联）
  const handleReplaceQuestion = (idx: number) => {
    if (isStructureLocked) return;
    setAddTarget(null);
    setReplaceIdx(idx);
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedPaper(null);
    setSelectedLecture(null);
    setAddSource("bank");
  };

  const replacePaperQuestionAt = useCallback((replaceIndex: number, newQuestion: Question) => {
    if (isStructureLocked) return;
    const replacedQuestion = paperQuestions[replaceIndex];
    if (!replacedQuestion) return;
    setPaperQuestions((previous) => previous.map((paperQuestion, index) => {
      if (index !== replaceIndex) return paperQuestion;
      return {
        ...paperQuestion,
        questionId: newQuestion.id,
        stem: newQuestion.stem,
        options: newQuestion.options,
        answer: newQuestion.answer,
        analysis: newQuestion.analysis,
        type: newQuestion.type,
      };
    }));
    setQuestions((previous) => ({ ...previous, [newQuestion.id]: newQuestion }));
    setContentBlocks((previous) => previous.map((block) =>
      block.examPaperQuestionId === replacedQuestion.id
        ? {
          ...block,
          content: newQuestion.stem,
          questionId: newQuestion.id,
          questionType: newQuestion.type,
        }
        : block,
    ));
    toast.success("题目已替换");
  }, [isStructureLocked, paperQuestions]);

  // 编辑模式：修改分值
  const handleUpdateScore = (pqId: string, score: number) => {
    setPaperQuestions((prev) => prev.map((q) => q.id === pqId ? { ...q, score } : q));
  };

  const handlePreviewUpdateScore = async (pqId: string, score: number) => {
    if (!paper || !Number.isFinite(score) || score < 0) return;
    const previousQuestions = paperQuestions;
    const nextQuestions = paperQuestions.map((question) =>
      question.id === pqId ? { ...question, score } : question,
    );
    if (nextQuestions.every((question, index) => question.score === previousQuestions[index]?.score)) return;

    setPaperQuestions(nextQuestions);
    try {
      const updated = await examPaperService.updatePaper(paper.id, {
        questions: nextQuestions,
        totalScore: nextQuestions.reduce((sum, question) => sum + question.score, 0),
      });
      setPaper(updated);
      setPaperQuestions(updated.questions);
      toast.success("题目分值已更新");
    } catch (error) {
      setPaperQuestions(previousQuestions);
      toast.error("更新分值失败", error instanceof Error ? error.message : "请稍后重试");
      throw error;
    }
  };

  const handleUpdateHeadingScore = (headingId: string, score: number) => {
    setPaperQuestions((previous) => setScoreUnderHeading(
      contentBlocks,
      previous,
      headingId,
      score,
    ));
  };

  // 添加题目确认
  const handleConfirmAdd = async () => {
    if (isStructureLocked) {
      toast.warning("上传原稿和拆解稿不能增删或替换题目");
      return;
    }
    if (!addSource || addSource === "choose" || selectedQuestionIds.length === 0) {
      toast.error("请选择至少一道题目");
      return;
    }
    let toAdd: Question[] = [];
    if (addSource === "basket" && selectedBasket) {
      const all = await questionService.listQuestions({ schoolId });
      toAdd = all.filter((q) => selectedBasket.questionIds.includes(q.id) && selectedQuestionIds.includes(q.id));
    } else if (addSource === "bank") {
      toAdd = bankQuestions.filter((q) => selectedQuestionIds.includes(q.id));
    } else if (addSource === "examPaper" && selectedPaper) {
      const all = await questionService.listQuestions({ schoolId });
      toAdd = selectedPaper.questions
        .filter((pq) => pq.questionId && selectedQuestionIds.includes(pq.questionId))
        .map((pq) => all.find((q) => q.id === pq.questionId)!)
        .filter(Boolean);
    } else if (addSource === "lecture" && selectedLecture) {
      const all = await questionService.listQuestions({ schoolId });
      const qIds = selectedLecture.sections
        .filter((s) => s.type === "question" && s.questionId)
        .map((s) => s.questionId!)
        .filter((qid) => selectedQuestionIds.includes(qid));
      toAdd = all.filter((q) => qIds.includes(q.id));
    }

    if (addTargetQuestionType) {
      toAdd = toAdd.filter((question) => question.type === addTargetQuestionType);
    }

    if (replaceIdx !== null) {
      // 换题模式：替换指定位置
      if (toAdd.length === 0) { toast.error("未找到有效题目"); return; }
      const newQ = toAdd[0];
      replacePaperQuestionAt(replaceIdx, newQ);
    } else {
      // 添加模式
      if (toAdd.length === 0) {
        toast.error(
          addTargetQuestionType
            ? `所选题目不属于“${typeLabel[addTargetQuestionType] || addTargetQuestionType}”题型`
            : "未找到有效题目",
        );
        return;
      }
      const newPqs: ExamPaperQuestion[] = toAdd.map((q) => ({
        id: `pq-${Date.now()}-${q.id}`,
        questionId: q.id,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
        score: 5,
        type: q.type,
      }));
      const newBlocks: ExtractedDocumentBlock[] = newPqs.map((paperQuestion) => ({
        id: `doc-block-${crypto.randomUUID()}`,
        type: "question",
        content: paperQuestion.stem,
        questionType: paperQuestion.type,
        questionId: paperQuestion.questionId,
        examPaperQuestionId: paperQuestion.id,
      }));

      if (addTarget?.kind === "heading") {
        const blockInsertIndex = getHeadingInsertIndex(contentBlocks, addTarget.headingId);
        const nextQuestionId = contentBlocks
          .slice(blockInsertIndex)
          .find((block) => block.type === "question" && block.examPaperQuestionId)
          ?.examPaperQuestionId;
        setPaperQuestions((previous) => {
          const questionInsertIndex = nextQuestionId
            ? previous.findIndex((question) => question.id === nextQuestionId)
            : previous.length;
          const safeInsertIndex = questionInsertIndex < 0 ? previous.length : questionInsertIndex;
          return [
            ...previous.slice(0, safeInsertIndex),
            ...newPqs,
            ...previous.slice(safeInsertIndex),
          ];
        });
        setContentBlocks((previous) => insertBlocksUnderHeading(
          previous,
          addTarget.headingId,
          newBlocks,
        ));
      } else if (addTarget?.kind === "group") {
        setPaperQuestions((previous) => {
          let insertIndex = previous.length;
          previous.forEach((question, index) => {
            const questionType = questions[question.questionId || ""]?.type || question.type;
            if (questionType === addTarget.groupType) insertIndex = index + 1;
          });
          return [
            ...previous.slice(0, insertIndex),
            ...newPqs,
            ...previous.slice(insertIndex),
          ];
        });
      } else {
        setPaperQuestions((previous) => [...previous, ...newPqs]);
        if (contentBlocks.length > 0) {
          setContentBlocks((previous) => [...previous, ...newBlocks]);
        }
      }
      const newQMap = { ...questions };
      toAdd.forEach((q) => { newQMap[q.id] = q; });
      setQuestions(newQMap);
      toast.success(`已添加 ${toAdd.length} 道题目`);
    }

    if (addSource === "basket" && selectedBasket) {
      const referencedQuestions = replaceIdx !== null ? toAdd.slice(0, 1) : toAdd;
      const removal = await promptToRemoveReferencedBasketQuestions(
        selectedBasket.id,
        referencedQuestions.map((question) => question.id),
      );
      if (removal.removedQuestionIds.length > 0) {
        const removedQuestionIds = new Set(removal.removedQuestionIds);
        setBaskets((current) => current.map((basket) => basket.id === selectedBasket.id
          ? {
              ...basket,
              questionIds: basket.questionIds.filter((questionId) => !removedQuestionIds.has(questionId)),
            }
          : basket));
      }
      if (removal.failedQuestionIds.length > 0) {
        toast.warning("部分已引用题目未能从资源篮移除");
      }
    }

    closeAddQuestion();
  };

  const buildPaperPatch = useCallback((): Partial<ExamPaper> => ({
    title,
    description,
    grade,
    schoolYear,
    semester,
    duration,
    totalScore,
    questions: paperQuestions,
    classIds: selectedClassIds,
    studentIds: [],
    typeId: typeId || undefined,
    ...(isStructureLocked ? {} : { contentBlocks, layoutMode }),
  }), [
    contentBlocks,
    description,
    duration,
    grade,
    isStructureLocked,
    layoutMode,
    paperQuestions,
    schoolYear,
    selectedClassIds,
    semester,
    title,
    totalScore,
    typeId,
  ]);

  // 保存
  const handleSave = async () => {
    if (!paper || !title.trim()) { toast.error("请填写文档名"); return; }
    setSaving(true);
    try {
      const updated = prepTaskId
        ? await prepService.updateLinkedResource(prepTaskId, buildPaperPatch(), prepPassword || undefined) as ExamPaper
        : await examPaperService.updatePaper(paper.id, buildPaperPatch());
      setPaper(updated);
      toast.success("试卷已保存");
    } catch (e: any) {
      const message = e?.message || "保存失败";
      if (prepTaskId && String(message).includes("密码")) {
        setPrepPasswordOpen(true);
      }
      toast.error("保存失败", message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrepPasswordSubmit = () => {
    if (!prepTaskId || !prepPasswordInput.trim()) {
      toast.warning("请输入访问密码");
      return;
    }
    const password = prepPasswordInput.trim();
    sessionStorage.setItem(`prep-resource-password:${prepTaskId}`, password);
    setPrepPassword(password);
    setPrepPasswordOpen(false);
  };

  const handleConfirmAudience = async () => {
    if (!isPreview || !paper) {
      setAudiencePickerOpen(false);
      return;
    }
    setAudienceSaving(true);
    try {
      const updated = await examPaperService.updatePaper(paper.id, {
        classIds: selectedClassIds,
        studentIds: [],
      });
      setPaper(updated);
      setAudiencePickerOpen(false);
      toast.success("使用对象已更新");
    } catch (error) {
      toast.error("更新使用对象失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAudienceSaving(false);
    }
  };

  // 发布
  const handlePublish = async () => {
    if (!paper || !teacher) return;
    if (publishTargetClassIds.length === 0) {
      toast.error("请选择发布班级");
      return;
    }
    setPublishing(true);
    try {
      const qIds = paperQuestions.map((pq) => pq.questionId).filter(Boolean) as string[];
      await examPublishService.publishExam({
        examPaperId: paper.id,
        publisherId: teacher.id,
        publisherSchoolId: schoolId,
        title: paper.title,
        targetType: "schoolClass",
        targetClassIds: publishTargetClassIds,
        targetStudentIds: [],
        isFormalExam: !!publishPassword || !!publishUnlockAt,
        viewPassword: publishPassword || undefined,
        unlockAt: publishUnlockAt || undefined,
        questionIds: qIds,
      });
      toast.success("试卷已发布");
      setPublishOpen(false);
      setPublishTargetClassIds([]);
      setPublishPassword("");
      setPublishUnlockAt("");
    } catch (e: any) {
      toast.error("发布失败", e?.message);
    } finally {
      setPublishing(false);
    }
  };

  // 撤回发布
  const handleRevoke = async (pubId: string) => {
    setRevoking(true);
    try {
      await examPublishService.revokePublication(pubId);
      setPublications((prev) => prev.map((p) => p.id === pubId ? { ...p, status: "revoked" } : p));
      toast.success("已撤回发布");
    } catch (e: any) {
      toast.error("撤回失败", e?.message);
    } finally {
      setRevoking(false);
    }
  };

  const handleDuplicate = async () => {
    if (!paper || prepTaskId || paper.teacherId !== teacher?.id) return;
    setDuplicating(true);
    try {
      const copy = await examPaperService.duplicatePaper(paper.id);
      toast.success("试卷副本已创建");
      navigate(`/exam-papers/${copy.id}`);
    } catch (error) {
      toast.error("创建副本失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDuplicating(false);
    }
  };

  const handleDownload = async () => {
    if (!paper) return;
    setDownloading(true);
    try {
      await downloadExamPaperDocxVariants({
        ...paper,
        title,
        description,
        grade,
        schoolYear,
        semester,
        duration,
        totalScore,
        questions: paperQuestions,
        contentBlocks,
        layoutMode,
      }, questions, downloadModes);
      setDownloadModalOpen(false);
      toast.success(
        downloadModes.length > 1 ? `已下载 ${downloadModes.length} 个试卷版本` : "试卷已下载",
        "数学公式已优先转换为 MathType 格式",
      );
    } catch (error) {
      toast.error("下载失败", error instanceof Error ? error.message : "无法生成试卷文档");
    } finally {
      setDownloading(false);
    }
  };

  const handleSendToMyCourseware = async () => {
    if (!paper || !teacher || prepTaskId) return;
    if (linkedCourseware) {
      navigate(`/my-lessons/${linkedCourseware.id}/edit?preview=1`);
      return;
    }
    setSendingToCourseware(true);
    try {
      if (!isPreview || navigationDraft?.paperId === paper.id) {
        const updated = await examPaperService.updatePaper(paper.id, buildPaperPatch());
        setPaper(updated);
      }
      const courseware = await lessonCoursewareService.createFromExamPaper(
        teacher.id,
        schoolId,
        paper.id,
      );
      setLinkedCourseware(courseware);
      toast.success("已发送到我的课件", "正在进入课件编辑...");
      navigate(`/my-lessons/${courseware.id}/edit`);
    } catch (error) {
      toast.error("发送失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSendingToCourseware(false);
    }
  };

  // 调整大题型顺序
  const handleGroupMove = (groupType: string, dir: "up" | "down") => {
    if (isStructureLocked) return;
    setGroupOrder((prev) => {
      const idx = prev.indexOf(groupType);
      if (idx === -1) return prev;
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const getQuestionDifficulty = (paperQuestion: ExamPaperQuestion) =>
    paperQuestion.questionId ? questions[paperQuestion.questionId]?.difficulty || 3 : 3;

  const handleSortByDifficulty = () => {
    if (isStructureLocked) return;
    setPaperQuestions((previous) => {
      const next = [...previous];
      next.sort((left, right) => {
        if (layoutMode === "grouped") {
          const leftType = questions[left.questionId || ""]?.type || left.type;
          const rightType = questions[right.questionId || ""]?.type || right.type;
          const leftGroup = groupOrder.indexOf(leftType);
          const rightGroup = groupOrder.indexOf(rightType);
          if (leftGroup !== rightGroup) return leftGroup - rightGroup;
        }
        const difficultyDifference = getQuestionDifficulty(left) - getQuestionDifficulty(right);
        return difficultyDifference || previous.indexOf(left) - previous.indexOf(right);
      });
      return next;
    });
    toast.success("已按难度从易到难排序");
  };

  const handleMarkAllDone = async () => {
    if (!paper) return;
    if (audienceStudentIds.length === 0) {
      toast.warning("请先添加使用班级");
      return;
    }
    const questionIds = Array.from(new Set(paperQuestions.map(getCompletionQuestionId)));
    if (questionIds.length === 0) {
      toast.warning("试卷中暂无题目");
      return;
    }

    setMarkingAllDone(true);
    try {
      const existingRecords = await analyticsService.listAnswerRecordsByStudents(audienceStudentIds);
      const existingKeys = new Set(
        existingRecords
          .filter((record) => record.lectureId === paper.id)
          .map((record) => `${record.studentId}:${record.questionId}`),
      );
      const pendingRecords = audienceStudentIds.flatMap((studentId) =>
        questionIds
          .filter((questionId) => !existingKeys.has(`${studentId}:${questionId}`))
          .map((questionId) => ({
            studentId,
            questionId,
            lectureId: paper.id,
            score: "done" as const,
            source: "manual" as const,
          })),
      );
      if (pendingRecords.length > 0) {
        await analyticsService.batchSaveAnswerRecords(pendingRecords);
      }
      const refreshedRecords = (await analyticsService.listAnswerRecordsByStudents(audienceStudentIds, dateRange))
        .filter((record) => record.lectureId === paper.id);
      setAnswerRecords(refreshedRecords);
      setAnsweredQuestionIds(new Set(refreshedRecords.map((record) => record.questionId)));
      setQuestionProgress(buildQuestionProgress(refreshedRecords, audienceStudentIds));
      toast.success(
        pendingRecords.length > 0
          ? `已补充 ${pendingRecords.length} 条完成记录，已有得分保持不变`
          : "所选学生均已存在完成或得分记录",
      );
    } catch (error) {
      toast.error("批量标注失败", error instanceof Error ? error.message : undefined);
    } finally {
      setMarkingAllDone(false);
    }
  };

  const handleUpdateStudentAnswer = async (
    studentId: string,
    questionId: string,
    score: AnswerScore | null,
  ) => {
    if (!paper) return;
    try {
      await analyticsService.saveAnswerRecord({
        studentId,
        questionId,
        lectureId: paper.id,
        score,
        source: "manual",
      });
      const refreshedRecords = (await analyticsService.listAnswerRecordsByStudents(audienceStudentIds, dateRange))
        .filter((record) => record.lectureId === paper.id);
      setAnswerRecords(refreshedRecords);
      setAnsweredQuestionIds(new Set(refreshedRecords.map((record) => record.questionId)));
      setQuestionProgress(buildQuestionProgress(refreshedRecords, audienceStudentIds));
    } catch (error) {
      toast.error("更新答题情况失败", error instanceof Error ? error.message : undefined);
    }
  };

  const prepPasswordModal = (
    <Modal
      open={prepPasswordOpen}
      onClose={() => navigate("/prep")}
      title="输入协作文档密码"
      description="该试卷设置了查看密码，验证后才能查看和编辑。"
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={() => navigate("/prep")}>返回集体备课</Button>
          <Button variant="gold" onClick={handlePrepPasswordSubmit}>验证并打开</Button>
        </>
      )}
    >
      <Input
        label="访问密码"
        type="password"
        autoFocus
        value={prepPasswordInput}
        onChange={(event) => setPrepPasswordInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") handlePrepPasswordSubmit();
        }}
      />
    </Modal>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  if (prepPasswordOpen && !paper) return <div>{prepPasswordModal}</div>;

  const audienceModal = (
    <Modal
      open={audiencePickerOpen}
      onClose={() => setAudiencePickerOpen(false)}
      size="lg"
      title="添加使用对象"
      description="使用对象按班级设置；具体学生的答题情况可在预览中逐题调整。"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClassIds([])}>
            清空选择
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAudiencePickerOpen(false)}>
              取消
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={() => void handleConfirmAudience()}
              loading={audienceSaving}
            >
              确定（{selectedClassIds.length} 个班级）
            </Button>
          </div>
        </div>
      }
    >
      <ClassAudiencePicker
        classes={classes}
        selectedClassIds={selectedClassIds}
        onChange={setSelectedClassIds}
      />
    </Modal>
  );

  // ===== 预览模式 =====
  if (isPreview) {
    return (
      <div className="max-w-[1500px] mx-auto">
        <PageHeader
          title={title || paper?.title}
          description={`${grade} · ${schoolYear} · ${semester} · ${duration}分钟 · 共${paperQuestions.length}题 · 总分${totalScore}分`}
          icon={<FileSpreadsheet className="w-5 h-5" />}
          className="mb-3"
        />

        <div
          role="toolbar"
          aria-label="试卷预览操作"
          className="no-print mb-6 flex flex-wrap items-center justify-end gap-2"
        >
          {!prepTaskId && (
            <Button variant="outline" onClick={() => setAudiencePickerOpen(true)}>
              <Users className="w-4 h-4" />
              <span className="max-w-48 truncate">
                {selectedClassIds.length > 0 ? selectedClassLabel : "添加使用对象"}
              </span>
              {selectedClassIds.length > 0 && <Badge variant="gold">{selectedClassIds.length}班</Badge>}
            </Button>
          )}
          {!prepTaskId && paper?.teacherId === teacher?.id && (
            <Button
              variant="outline"
              onClick={handleSendToMyCourseware}
              loading={sendingToCourseware}
              disabled={linkedCoursewareLoading}
            >
              <BookOpen className="w-4 h-4" />
              {linkedCourseware ? "课件" : "发送到我的课件"}
            </Button>
          )}
          {!prepTaskId && (
            <Button variant="outline" onClick={() => navigate(`/exam-papers/${id}/answer-sheet`)}>
              <Layout className="w-4 h-4" />
              制作答题卡
            </Button>
          )}
          {!prepTaskId && (
            <Button variant="outline" onClick={() => setPublishOpen(true)}>
              <Send className="w-4 h-4" />
              发布试卷
            </Button>
          )}
          {!prepTaskId && paper?.teacherId === teacher?.id && (
            <Button variant="outline" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="w-4 h-4" />
              创建副本
            </Button>
          )}
          <Button variant="outline" onClick={() => setDownloadModalOpen(true)}>
            <Download className="w-4 h-4" />
            下载
          </Button>
          <Button
            variant="gold"
            onClick={() => navigateWithDraft(`/exam-papers/${id}${prepTaskId ? `?prepTask=${prepTaskId}` : ""}`)}
          >
            <Edit3 className="w-4 h-4" />
            编辑试卷
          </Button>
        </div>

        <div className="preview-sticky-shell">
          <aside className="preview-sticky-rail no-print">
            <div className="preview-sticky-controls" data-testid="exam-paper-preview-details">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-serif text-sm font-semibold text-ink-900">题目信息与使用情况</div>
                  <div className="mt-1 text-xs leading-5 text-ink-400">选择具体学生后可重新设置该题的答题情况</div>
                </div>
                {previewSidebarVisibility.answerStatus && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMarkAllDone}
                    loading={markingAllDone}
                    disabled={audienceStudentIds.length === 0 || paperQuestions.length === 0}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    全部设为使用
                  </Button>
                )}
              </div>
              <PreviewSidebarControls
                value={previewSidebarVisibility}
                onChange={setPreviewSidebarVisibility}
              />
            </div>
          </aside>

          <div className="overflow-x-auto pb-4">
            <div className="exam-paper-preview-grid" data-testid="exam-paper-preview">
              <PreviewQuestionPair
                leftClassName="exam-paper-preview-title"
                left={(
                  <MathHtml className="text-center font-serif text-2xl font-bold text-ink-900">
                    {title || "未命名试卷"}
                  </MathHtml>
                )}
                right={<div className="preview-sticky-spacer" aria-hidden="true" />}
              />

            {isStructuredExtract ? (
              contentBlocks.map((block, blockIndex) => {
                if (block.type === "documentTitle") return null;
                if (block.type === "groupTitle" || block.type === "heading") {
                  return (
                    <PreviewQuestionPair
                      key={block.id}
                      leftClassName="pt-3 pb-2"
                      left={(
                        <MathHtml className="border-b border-ink-200 pb-2 font-serif text-lg font-bold text-ink-900">
                          {block.content}
                        </MathHtml>
                      )}
                    />
                  );
                }
                if (block.type === "knowledge") {
                  return (
                    <PreviewQuestionPair
                      key={block.id}
                      left={(
                        <section className="rounded-md border border-gold-200 bg-gold-50/20 p-4">
                          {block.title && (
                            <MathHtml className="mb-2 font-serif font-semibold text-ink-900">{block.title}</MathHtml>
                          )}
                          <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{block.content}</MathHtml>
                        </section>
                      )}
                    />
                  );
                }
                if (block.type === "question") {
                  const questionNumber = contentBlocks
                    .slice(0, blockIndex + 1)
                    .filter((item) => item.type === "question").length;
                  const paperQuestion = paperQuestions.find(
                    (item) => item.id === block.examPaperQuestionId,
                  );
                  const linkedQuestionId = paperQuestion?.questionId || block.questionId;
                  const linkedQuestion = linkedQuestionId ? questions[linkedQuestionId] : undefined;
                  const display = resolveExtractedQuestionDisplay(
                    paperQuestion,
                    linkedQuestion,
                    block.content,
                  );
                  return (
                    <PreviewQuestionPair
                      key={block.id}
                      left={(
                        <section className="py-4">
                          <ExtractedQuestionContent
                            number={questionNumber}
                            stem={display.stem}
                            options={display.options}
                            answer={display.answer}
                            analysis={display.analysis}
                            optionVariant="plain"
                          />
                        </section>
                      )}
                      right={paperQuestion ? (
                        <PreviewQuestionDetails
                          pq={paperQuestion}
                          index={questionNumber - 1}
                          question={linkedQuestion}
                          progress={getQuestionProgress(getCompletionQuestionId(paperQuestion))}
                          chapterTree={chapterTree}
                          knowledgeTree={knowledgeTree}
                          chapterNameMap={chapterNameMap}
                          knowledgeNameMap={knowledgeNameMap}
                          onUpdateCatalogs={handleUpdateQuestionCatalogs}
                          onBasketChanged={refreshBaskets}
                          completionQuestionId={getCompletionQuestionId(paperQuestion)}
                          students={audienceStudents}
                          answerRecords={answerRecords}
                          onUpdateStudentAnswer={handleUpdateStudentAnswer}
                          visibility={previewSidebarVisibility}
                          canEditScore={paper?.teacherId === teacher?.id}
                          onUpdateScore={handlePreviewUpdateScore}
                        />
                      ) : undefined}
                    />
                  );
                }
                return (
                  <PreviewQuestionPair
                    key={block.id}
                    left={(
                      <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{block.content}</MathHtml>
                    )}
                  />
                );
              })
            ) : paperQuestions.length === 0 ? (
              <PreviewQuestionPair
                left={(
                  <EmptyState
                    icon={<FileText className="w-10 h-10 text-ink-200" />}
                    title="试卷暂无题目"
                    description="切换到编辑模式添加题目"
                  />
                )}
              />
            ) : layoutMode === "grouped" ? (
              groupByType(paperQuestions, questions, groupOrder).flatMap((group, groupIndex) => {
                const groupScore = group.questions.reduce((sum, item) => sum + item.pq.score, 0);
                return [
                  <PreviewQuestionPair
                    key={`group-${group.type}`}
                    leftClassName="pt-3 pb-2"
                    left={(
                      <div className="flex items-center gap-3 border-b border-ink-200 pb-2">
                        <h2 className="font-serif text-lg font-bold text-ink-900">{getGroupHeading(group.type, groupIndex)}</h2>
                        <span className="text-sm text-ink-500">共 {group.questions.length} 题</span>
                        <span className="text-sm font-medium text-gold-600">共 {groupScore} 分</span>
                      </div>
                    )}
                  />,
                  ...group.questions.map((item) => (
                    <PreviewQuestionPair
                      key={item.pq.id}
                      left={<PreviewQuestionItem pq={item.pq} index={item.index} />}
                      right={(
                        <PreviewQuestionDetails
                          pq={item.pq}
                          index={item.index}
                          question={item.question}
                          progress={getQuestionProgress(getCompletionQuestionId(item.pq))}
                          chapterTree={chapterTree}
                          knowledgeTree={knowledgeTree}
                          chapterNameMap={chapterNameMap}
                          knowledgeNameMap={knowledgeNameMap}
                          onUpdateCatalogs={handleUpdateQuestionCatalogs}
                          onBasketChanged={refreshBaskets}
                          completionQuestionId={getCompletionQuestionId(item.pq)}
                          students={audienceStudents}
                          answerRecords={answerRecords}
                          onUpdateStudentAnswer={handleUpdateStudentAnswer}
                          visibility={previewSidebarVisibility}
                          canEditScore={paper?.teacherId === teacher?.id}
                          onUpdateScore={handlePreviewUpdateScore}
                        />
                      )}
                    />
                  )),
                ];
              })
            ) : (
              paperQuestions.map((paperQuestion, index) => {
                const linkedQuestion = paperQuestion.questionId ? questions[paperQuestion.questionId] : undefined;
                return (
                  <PreviewQuestionPair
                    key={paperQuestion.id}
                    left={<PreviewQuestionItem pq={paperQuestion} index={index} />}
                    right={(
                      <PreviewQuestionDetails
                        pq={paperQuestion}
                        index={index}
                        question={linkedQuestion}
                        progress={getQuestionProgress(getCompletionQuestionId(paperQuestion))}
                        chapterTree={chapterTree}
                        knowledgeTree={knowledgeTree}
                        chapterNameMap={chapterNameMap}
                        knowledgeNameMap={knowledgeNameMap}
                        onUpdateCatalogs={handleUpdateQuestionCatalogs}
                        onBasketChanged={refreshBaskets}
                        completionQuestionId={getCompletionQuestionId(paperQuestion)}
                        students={audienceStudents}
                        answerRecords={answerRecords}
                        onUpdateStudentAnswer={handleUpdateStudentAnswer}
                        visibility={previewSidebarVisibility}
                        canEditScore={paper?.teacherId === teacher?.id}
                        onUpdateScore={handlePreviewUpdateScore}
                      />
                    )}
                  />
                );
              })
            )}
          </div>
        </div>
        </div>
        {/* 发布弹窗 */}
        <PublishModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          classes={classes}
          selectedClassIds={publishTargetClassIds}
          onClassChange={setPublishTargetClassIds}
          password={publishPassword}
          onPasswordChange={setPublishPassword}
          unlockAt={publishUnlockAt}
          onUnlockAtChange={setPublishUnlockAt}
          onPublish={handlePublish}
          publishing={publishing}
        />
        <DocumentDownloadModeModal
          open={downloadModalOpen}
          onClose={() => setDownloadModalOpen(false)}
          selectedModes={downloadModes}
          onSelectedModesChange={setDownloadModes}
          onDownload={() => void handleDownload()}
          loading={downloading}
          resourceLabel="试卷"
        />
        {audienceModal}
      </div>
    );
  }

  // ===== 编辑模式 =====
  return (
    <div>
      <PageHeader
        title={`编辑：${paper?.title || title}`}
        icon={<FileSpreadsheet className="w-5 h-5" />}
        className={prepTaskId ? undefined : "mb-3"}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate(prepTaskId ? `/prep/tasks/${prepTaskId}` : "/my-resources/exam-papers")}
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
            <Button
              variant="outline"
              onClick={() => navigateWithDraft(`/exam-papers/${id}/preview${prepTaskId ? `?prepTask=${prepTaskId}` : ""}`)}
            >
              <Eye className="w-4 h-4" />
              预览
            </Button>
            {!prepTaskId && (
              <Button variant="outline" onClick={() => setAudiencePickerOpen(true)}>
                <Users className="w-4 h-4" />
                <span className="max-w-48 truncate">
                  {selectedClassIds.length > 0 ? selectedClassLabel : "添加使用对象"}
                </span>
                {selectedClassIds.length > 0 && <Badge variant="gold">{selectedClassIds.length}班</Badge>}
              </Button>
            )}
            <Button variant="gold" onClick={handleSave} loading={saving}>
              <Save className="w-4 h-4" />
              保存
            </Button>
          </div>
        }
      />

      {!prepTaskId && (
        <div
          role="toolbar"
          aria-label="试卷辅助操作"
          className="mb-6 flex flex-wrap items-center justify-end gap-2"
        >
          {paper?.teacherId === teacher?.id && (
            <Button variant="outline" onClick={() => setPrepSetupOpen(true)}>
              <Users className="w-4 h-4" />
              添加到集体备课
            </Button>
          )}
          {paper?.teacherId === teacher?.id && (
            <Button
              variant="outline"
              onClick={handleSendToMyCourseware}
              loading={sendingToCourseware}
              disabled={linkedCoursewareLoading}
            >
              <BookOpen className="w-4 h-4" />
              {linkedCourseware ? "课件" : "发送到我的课件"}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(`/exam-papers/${id}/answer-sheet`)}>
            <Layout className="w-4 h-4" />
            制作答题卡
          </Button>
          <Button variant="outline" onClick={() => setPublishOpen(true)}>
            <Send className="w-4 h-4" />
            发布试卷
          </Button>
        </div>
      )}

      <div className="space-y-4">
        {/* 顶部：试卷属性 */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-gold-600" />
              <h3 className="font-serif font-semibold text-ink-900">试卷属性</h3>
            </div>
            <div className="flex items-center gap-4 text-xs text-ink-500">
              <span>{paperQuestions.length} 题</span>
              <span className="font-semibold text-gold-700">{totalScore} 分</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="文档名" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input label="描述" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                label="年级"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                options={includeCurrentOption(gradeOptions, grade)}
              />
              <Select
                label="学年"
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value)}
                options={includeCurrentOption(schoolYearOptions, schoolYear)}
              />
              <Select
                label="学期"
                value={semester}
                onChange={(e) => setSemester(e.target.value as ResourceSemester)}
                options={semesterOptions}
              />
              <Select
                label="试卷类型"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                options={[
                  { value: "", label: "未设置" },
                  ...examPaperTypeOptions,
                ]}
              />
              <Input
                label="考试时长（分钟）"
                type="number"
                value={String(duration)}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {/* 左侧：完整试卷 */}
          <Card className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-ink-100">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-teal-500" />
                <h3 className="font-serif font-semibold text-ink-900">试卷全貌</h3>
                <Badge variant="ink">{paperQuestions.length} 题</Badge>
              </div>
              {!isStructureLocked && <div className="flex flex-wrap items-center gap-2">
                {!isStructuredExtract && (
                  <>
                    <div className="flex items-center rounded-md border border-ink-200 p-0.5 bg-ink-50">
                      <button
                        onClick={() => setLayoutMode("grouped")}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded transition-colors",
                          layoutMode === "grouped" ? "bg-white text-gold-700 shadow-sm font-medium" : "text-ink-500 hover:text-ink-800",
                        )}
                      >
                        按题型
                      </button>
                      <button
                        onClick={() => setLayoutMode("flat")}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded transition-colors",
                          layoutMode === "flat" ? "bg-white text-gold-700 shadow-sm font-medium" : "text-ink-500 hover:text-ink-800",
                        )}
                      >
                        无题型
                      </button>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleSortByDifficulty} disabled={paperQuestions.length < 2}>
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      按难度排序
                    </Button>
                  </>
                )}
                <Button variant="gold" size="sm" onClick={() => openAddQuestion()}>
                  <Plus className="w-3.5 h-3.5" />
                  添加题目
                </Button>
              </div>}
            </div>

            {isStructureLocked && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
                <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>上传原稿和拆解稿可修改文档属性与题目分值；题目内容、数量和顺序保持原稿结构。</span>
              </div>
            )}

            {isStructuredExtract ? (
              <div className="space-y-3">
                {contentBlocks.map((block, blockIndex) => {
                  if (hiddenStructuredBlockIds.has(block.id)) return null;
                  const paperQuestion = block.examPaperQuestionId
                    ? paperQuestions.find((question) => question.id === block.examPaperQuestionId)
                    : undefined;
                  const paperQuestionIndex = paperQuestion
                    ? paperQuestions.findIndex((question) => question.id === paperQuestion.id)
                    : -1;
                  const linkedQuestionId = paperQuestion?.questionId || block.questionId;
                  const linkedQuestion = linkedQuestionId ? questions[linkedQuestionId] : undefined;
                  const questionDisplay = block.type === "question"
                    ? resolveExtractedQuestionDisplay(paperQuestion, linkedQuestion, block.content)
                    : undefined;
                  const isQuestionGroup = block.type === "groupTitle" || block.type === "heading";
                  const headingCollapsed = isQuestionGroup && collapsedHeadingIds.has(block.id);
                  const headingQuestionCount = isQuestionGroup
                    ? questionIdsUnderHeading(contentBlocks, block.id).length
                    : 0;
                  const headingScore = isQuestionGroup
                    ? commonScoreUnderHeading(contentBlocks, paperQuestions, block.id)
                    : null;
                  const canMoveUp = isQuestionGroup
                    ? canMoveStructuredQuestionGroup(contentBlocks, block.id, "up")
                    : blockIndex > 0;
                  const canMoveDown = isQuestionGroup
                    ? canMoveStructuredQuestionGroup(contentBlocks, block.id, "down")
                    : blockIndex < contentBlocks.length - 1;
                  const label = block.type === "documentTitle"
                    ? "文档标题"
                    : block.type === "documentInfo" || block.type === "text"
                      ? "文档信息"
                      : isQuestionGroup
                        ? "题型或项目名"
                    : block.type === "knowledge"
                      ? "知识块"
                      : block.type === "question"
                        ? "题目"
                        : "文档信息";
                  return (
                    <section key={block.id} className="rounded-md border border-ink-100 bg-paper p-3">
                      <div className="mb-2 flex items-center gap-2">
                        {isQuestionGroup && (
                          <button
                            type="button"
                            onClick={() => setCollapsedHeadingIds((previous) => {
                              const next = new Set(previous);
                              if (next.has(block.id)) next.delete(block.id);
                              else next.add(block.id);
                              return next;
                            })}
                            className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-gold-700"
                            aria-label={`${headingCollapsed ? "展开" : "折叠"}${block.content}`}
                            title={headingCollapsed ? "展开下属题目" : "折叠下属题目"}
                          >
                            {headingCollapsed
                              ? <ChevronRight className="h-4 w-4" />
                              : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                        <Badge variant={block.type === "question" ? "teal" : block.type === "knowledge" ? "gold" : "ink"}>
                          {label}{block.type === "question" && paperQuestionIndex >= 0 ? ` ${paperQuestionIndex + 1}` : ""}
                        </Badge>
                        {prepTaskId && (
                          <ResourceCommentButton
                            taskId={prepTaskId}
                            targetId={block.id}
                            targetLabel={block.content.slice(0, 80) || label}
                            password={prepPassword || undefined}
                            comments={prepComments}
                            onCommentsChange={setPrepComments}
                          />
                        )}
                        {block.type === "question" && paperQuestion && (
                          <>
                            <Badge variant="default">{typeLabel[paperQuestion.type]}</Badge>
                            <QuestionProgressBadge
                              progress={getQuestionProgress(getCompletionQuestionId(paperQuestion))}
                            />
                            <div className="ml-auto flex items-center gap-1">
                              <Input
                                aria-label="题目分值"
                                type="number"
                                value={String(paperQuestion.score)}
                                onChange={(event) => handleUpdateScore(paperQuestion.id, Number(event.target.value))}
                                className="w-16 text-xs"
                              />
                              <span className="text-xs text-ink-500">分</span>
                            </div>
                          </>
                        )}
                        {isQuestionGroup && headingQuestionCount > 0 && (
                          <div className="ml-auto flex items-center gap-1.5">
                            <span className="text-xs text-ink-500">下属 {headingQuestionCount} 题，每题</span>
                            <Input
                              aria-label={`${block.content}下属题目统一分值`}
                              type="number"
                              min="0"
                              value={headingScore === null ? "" : String(headingScore)}
                              placeholder="混合"
                              onChange={(event) => {
                                if (event.target.value === "") return;
                                handleUpdateHeadingScore(block.id, Number(event.target.value));
                              }}
                              className="w-16 text-xs"
                            />
                            <span className="text-xs text-ink-500">分</span>
                          </div>
                        )}
                        {isQuestionGroup && !isStructureLocked && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={headingQuestionCount === 0 ? "ml-auto" : undefined}
                            onClick={() => openAddQuestion({
                              kind: "heading",
                              headingId: block.id,
                              label: block.content,
                            })}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            添加题目
                          </Button>
                        )}
                        {!isStructureLocked && <div className={cn(
                          "flex items-center gap-0.5",
                          block.type !== "question" && !isQuestionGroup && "ml-auto",
                        )}>
                          <button
                            onClick={() => moveContentBlock(blockIndex, "up")}
                            disabled={!canMoveUp}
                            className="p-1 text-ink-400 hover:text-gold-600 disabled:opacity-25"
                            aria-label={isQuestionGroup ? `${block.content}整体上移` : `${label}上移`}
                            title={isQuestionGroup ? "整个项目上移" : "上移"}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => moveContentBlock(blockIndex, "down")}
                            disabled={!canMoveDown}
                            className="p-1 text-ink-400 hover:text-gold-600 disabled:opacity-25"
                            aria-label={isQuestionGroup ? `${block.content}整体下移` : `${label}下移`}
                            title={isQuestionGroup ? "整个项目下移" : "下移"}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          {block.type === "question" && paperQuestionIndex >= 0 && (
                            <button
                              onClick={() => handleReplaceQuestion(paperQuestionIndex)}
                              className="px-2 py-1 text-xs text-teal-600 hover:text-teal-700"
                            >
                              换题
                            </button>
                          )}
                          <button
                            onClick={() => removeContentBlock(block.id)}
                            className="p-1 text-ink-400 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>}
                      </div>
                      {block.type === "knowledge" && (
                        <Input
                          label="知识块标题"
                          value={block.title || ""}
                          onChange={(event) => updateContentBlock(block.id, { title: event.target.value })}
                          disabled={isStructureLocked}
                          className="mb-2"
                        />
                      )}
                      {block.type === "question" && questionDisplay ? (
                        <ExtractedQuestionContent
                          number={paperQuestionIndex >= 0 ? paperQuestionIndex + 1 : undefined}
                          stem={questionDisplay.stem}
                          options={questionDisplay.options}
                          answer={questionDisplay.answer}
                          analysis={questionDisplay.analysis}
                          compact
                        />
                      ) : block.type === "documentTitle" ? (
                        <Input
                          label="文档标题"
                          value={block.content}
                          onChange={(event) => updateContentBlock(block.id, { content: event.target.value })}
                          disabled={isStructureLocked}
                        />
                      ) : isQuestionGroup ? (
                        <Input
                          aria-label="题型或项目名"
                          value={block.content}
                          onChange={(event) => updateContentBlock(block.id, { content: event.target.value })}
                          disabled={isStructureLocked}
                        />
                      ) : (
                        <Textarea
                          label={block.type === "documentInfo" || block.type === "text"
                            ? "文档信息"
                            : "内容"}
                          value={block.content}
                          onChange={(event) => updateContentBlock(block.id, { content: event.target.value })}
                          disabled={isStructureLocked}
                          rows={4}
                        />
                      )}
                    </section>
                  );
                })}
              </div>
            ) : paperQuestions.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-10 h-10 text-ink-200" />}
                title="试卷暂无题目"
                description="从右侧选择来源添加题目"
                action={!isStructureLocked ? (
                  <Button variant="gold" size="sm" onClick={() => openAddQuestion()}>
                    <Plus className="w-3.5 h-3.5" /> 添加题目
                  </Button>
                ) : undefined}
              />
            ) : layoutMode === "grouped" ? (
              <div className="space-y-6">
                {groupByType(paperQuestions, questions, groupOrder).map((group, groupIndex, groups) => {
                  const groupScore = group.questions.reduce((sum, item) => sum + item.pq.score, 0);
                  const commonGroupScore = group.questions.every((item) => item.pq.score === group.questions[0]?.pq.score)
                    ? group.questions[0]?.pq.score ?? null
                    : null;
                  const groupCollapsed = collapsedGroupTypes.has(group.type);
                  return (
                    <section key={group.type}>
                      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-ink-200">
                        <button
                          type="button"
                          onClick={() => setCollapsedGroupTypes((previous) => {
                            const next = new Set(previous);
                            if (next.has(group.type)) next.delete(group.type);
                            else next.add(group.type);
                            return next;
                          })}
                          className="rounded p-1 text-ink-400 hover:bg-ink-50 hover:text-gold-700"
                          aria-label={`${groupCollapsed ? "展开" : "折叠"}${getGroupHeading(group.type, groupIndex)}`}
                          title={groupCollapsed ? "展开题目" : "折叠题目"}
                        >
                          {groupCollapsed
                            ? <ChevronRight className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {!isStructureLocked && <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleGroupMove(group.type, "up")}
                            disabled={groupIndex === 0}
                            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-25"
                            title="题型上移"
                          >
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleGroupMove(group.type, "down")}
                            disabled={groupIndex === groups.length - 1}
                            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-25"
                            title="题型下移"
                          >
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>}
                        <h2 className="font-serif text-base font-bold text-ink-900">{getGroupHeading(group.type, groupIndex)}</h2>
                        <span className="text-xs text-ink-500">{group.questions.length} 题</span>
                        <span className="text-xs text-gold-700 font-medium">{groupScore} 分</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-ink-500">每题</span>
                          <Input
                            aria-label={`${getGroupHeading(group.type, groupIndex)}统一分值`}
                            type="number"
                            min="0"
                            step="0.5"
                            value={commonGroupScore === null ? "" : String(commonGroupScore)}
                            placeholder="混合"
                            onChange={(event) => {
                              if (event.target.value === "") return;
                              const score = Number(event.target.value);
                              if (!Number.isFinite(score) || score < 0) return;
                              const questionIds = new Set(group.questions.map((item) => item.pq.id));
                              setPaperQuestions((previous) => previous.map((paperQuestion) =>
                                questionIds.has(paperQuestion.id) ? { ...paperQuestion, score } : paperQuestion,
                              ));
                            }}
                            className="h-8 w-16 text-xs"
                          />
                          <span className="text-xs text-ink-500">分</span>
                        </div>
                        {!isStructureLocked && <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto"
                          onClick={() => openAddQuestion({
                            kind: "group",
                            groupType: group.type,
                            label: getGroupHeading(group.type, groupIndex),
                          })}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          添加题目
                        </Button>}
                      </div>
                      {!groupCollapsed && <div className="space-y-3">
                        {group.questions.map((item, itemIndex) => (
                          <div key={item.pq.id} className="space-y-1">
                            <EditQuestionRow
                              pq={item.pq}
                              index={item.index}
                              total={paperQuestions.length}
                              question={item.question}
                              progress={getQuestionProgress(getCompletionQuestionId(item.pq))}
                              canMoveUp={itemIndex > 0}
                              canMoveDown={itemIndex < group.questions.length - 1}
                              onMoveUp={() => handleMoveWithinGroup(item.index, "up")}
                              onMoveDown={() => handleMoveWithinGroup(item.index, "down")}
                              onRemove={() => handleRemoveQuestion(item.pq.id)}
                              onReplace={() => handleReplaceQuestion(item.index)}
                              onUpdateScore={(score) => handleUpdateScore(item.pq.id, score)}
                              structureLocked={isStructureLocked}
                              sidebar={(
                                <EditQuestionCatalogPanel
                                  pq={item.pq}
                                  index={item.index}
                                  question={item.question}
                                  schoolId={schoolId}
                                  chapterTree={chapterTree}
                                  knowledgeTree={knowledgeTree}
                                  chapterNameMap={chapterNameMap}
                                  knowledgeNameMap={knowledgeNameMap}
                                  onUpdateCatalogs={handleUpdateQuestionCatalogs}
                                  onReplace={(replacement) => replacePaperQuestionAt(item.index, replacement)}
                                  excludedQuestionIds={paperQuestionIds}
                                  structureLocked={isStructureLocked}
                                />
                              )}
                            />
                            {prepTaskId && (
                              <div className="flex justify-end">
                                <ResourceCommentButton
                                  taskId={prepTaskId}
                                  targetId={item.pq.id}
                                  targetLabel={`第 ${item.index + 1} 题`}
                                  password={prepPassword || undefined}
                                  comments={prepComments}
                                  onCommentsChange={setPrepComments}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                {paperQuestions.map((paperQuestion, index) => (
                  <div key={paperQuestion.id} className="space-y-1">
                    <EditQuestionRow
                      pq={paperQuestion}
                      index={index}
                      total={paperQuestions.length}
                      question={paperQuestion.questionId ? questions[paperQuestion.questionId] : undefined}
                      progress={getQuestionProgress(getCompletionQuestionId(paperQuestion))}
                      onMoveUp={() => handleMove(index, "up")}
                      onMoveDown={() => handleMove(index, "down")}
                      onRemove={() => handleRemoveQuestion(paperQuestion.id)}
                      onReplace={() => handleReplaceQuestion(index)}
                      onUpdateScore={(score) => handleUpdateScore(paperQuestion.id, score)}
                      structureLocked={isStructureLocked}
                      sidebar={(
                        <EditQuestionCatalogPanel
                          pq={paperQuestion}
                          index={index}
                          question={paperQuestion.questionId ? questions[paperQuestion.questionId] : undefined}
                          schoolId={schoolId}
                          chapterTree={chapterTree}
                          knowledgeTree={knowledgeTree}
                          chapterNameMap={chapterNameMap}
                          knowledgeNameMap={knowledgeNameMap}
                          onUpdateCatalogs={handleUpdateQuestionCatalogs}
                          onReplace={(replacement) => replacePaperQuestionAt(index, replacement)}
                          excludedQuestionIds={paperQuestionIds}
                          structureLocked={isStructureLocked}
                        />
                      )}
                    />
                    {prepTaskId && (
                      <div className="flex justify-end">
                        <ResourceCommentButton
                          taskId={prepTaskId}
                          targetId={paperQuestion.id}
                          targetLabel={`第 ${index + 1} 题`}
                          password={prepPassword || undefined}
                          comments={prepComments}
                          onCommentsChange={setPrepComments}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 下方：组卷与统计 */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <h3 className="font-serif font-semibold text-ink-900 text-sm">组卷工具</h3>
              </div>
              {isStructureLocked ? (
                <div className="flex items-start gap-2 rounded-md bg-ink-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-500">
                  <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span>当前文档结构已锁定，仅可调整题目分值。</span>
                </div>
              ) : (
                <>
                  <Button
                    variant="gold"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setAutoGenOpen(true)}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> AI 自动组卷
                  </Button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => { setAddTarget(null); setReplaceIdx(null); chooseAddSource("bank"); }}>
                      <Library className="w-3.5 h-3.5" /> 题库
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setAddTarget(null); setReplaceIdx(null); chooseAddSource("basket"); }}>
                      <ShoppingBasket className="w-3.5 h-3.5" /> 试题篮
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setAddTarget(null); setReplaceIdx(null); chooseAddSource("examPaper"); }}>
                      <Files className="w-3.5 h-3.5" /> 其他试卷
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setAddTarget(null); setReplaceIdx(null); chooseAddSource("lecture"); }}>
                      <FileText className="w-3.5 h-3.5" /> 讲义
                    </Button>
                  </div>
                </>
              )}
              <div className="pt-3 border-t border-ink-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-500">当前编排</span>
                  <span className="font-medium text-ink-800">{layoutMode === "grouped" ? "按题型" : "无题型"}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-500">考试时长</span>
                  <span className="font-medium text-ink-800">{duration} 分钟</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-500">总分</span>
                  <span className="font-semibold text-gold-700">{totalScore} 分</span>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <h3 className="font-serif font-semibold text-ink-900 text-sm">使用对象与完成情况</h3>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-between" onClick={() => setAudiencePickerOpen(true)}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{selectedClassIds.length > 0 ? selectedClassLabel : "添加使用对象"}</span>
                </span>
                {selectedClassIds.length > 0 && <Badge variant="gold">{selectedClassIds.length}班</Badge>}
              </Button>
              {audienceStudentIds.length > 0 && (
                <select
                  value={timeRangeKey}
                  onChange={(e) => setTimeRangeKey(e.target.value as TimeRangeKey)}
                  className="w-full text-xs border border-ink-200 rounded px-2 py-1.5 bg-paper text-ink-700"
                >
                  {timeRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              )}
              <Button
                variant="gold"
                size="sm"
                className="w-full"
                onClick={handleMarkAllDone}
                loading={markingAllDone}
                disabled={audienceStudentIds.length === 0 || paperQuestions.length === 0}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                一键标注学生已做
              </Button>
              <div className="text-[11px] text-ink-400 leading-relaxed">
                批量标注仅记录“已做”，不计入正确率；之后可在题库或讲义中补录得分情况。
              </div>
            </Card>

            <QuestionDistributionPanel questions={paperQuestionList} knowledgeTree={knowledgeTree} />
          </div>
        </div>
      </div>

      {/* AI 自动组卷弹窗 */}
      <Modal
        open={autoGenOpen}
        onClose={() => { if (!autoGenerating) { setAutoGenOpen(false); setAutoGenStep(1); } }}
        size="xl"
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold-500" />
            AI 自动组卷
          </div>
        }
        description={`第 ${autoGenStep} 步 / 共 3 步`}
        footer={
          autoGenStep === 1 ? (
            <>
              <Button variant="ghost" onClick={() => { setAutoGenOpen(false); setAutoGenStep(1); }} disabled={autoGenerating}>取消</Button>
              <Button variant="gold" onClick={() => setAutoGenStep(2)} disabled={autoGenerating}>
                下一步
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </Button>
            </>
          ) : autoGenStep === 2 ? (
            <>
              <Button variant="ghost" onClick={() => setAutoGenStep(1)} disabled={autoGenerating}>
                <ChevronDown className="w-4 h-4 rotate-90" />
                上一步
              </Button>
              <Button variant="gold" onClick={handleAutoGeneratePaper} loading={autoGenerating}>
                <Sparkles className="w-3.5 h-3.5" />
                {autoGenerating ? "AI 选题中..." : "开始智能组卷"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAutoGenStep(2)} disabled={autoGenerating}>
                重新选题
              </Button>
              <Button variant="gold" onClick={handleConfirmAutoGen} disabled={autoGeneratedQuestions.length === 0}>
                <Plus className="w-3.5 h-3.5" />
                添加到试卷（{autoGeneratedQuestions.length}题）
              </Button>
            </>
          )
        }
      >
        {autoGenStep === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <div className="font-medium mb-1">组卷说明</div>
                  <div>从选择的章节和知识点中，根据题型、难度要求，智能选取题目组成试卷。题目全部来自题库。</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <BookOpen className="w-3.5 h-3.5" />
              选择章节或知识点（至少一个）
            </div>
            <div className="flex border-b border-ink-100 gap-1">
              {[
                { k: "chapter", label: "按章节" },
                { k: "knowledge", label: "按知识点" },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setAutoLeftTab(t.k as "chapter" | "knowledge")}
                  className={cn(
                    "px-3 py-1.5 text-xs border-b-2 -mb-px transition-colors",
                    autoLeftTab === t.k
                      ? "border-gold-400 text-gold-700 font-medium"
                      : "border-transparent text-ink-500 hover:text-ink-700",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-72 overflow-y-auto border border-ink-100 rounded-lg p-2">
              {autoLeftTab === "chapter" && autoChapterTree && (
                <SearchableTree
                  data={autoChapterTree}
                  title="章节目录"
                  accent="gold"
                  checkable
                  checkedIds={autoChapterIds}
                  onCheck={setAutoChapterIds}
                  searchPlaceholder="搜索章节..."
                />
              )}
              {autoLeftTab === "knowledge" && autoKnowledgeTree && (
                <SearchableTree
                  data={autoKnowledgeTree}
                  title="知识点目录"
                  accent="teal"
                  checkable
                  checkedIds={autoKnowledgeIds}
                  onCheck={setAutoKnowledgeIds}
                  searchPlaceholder="搜索知识点..."
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {autoChapterIds.length > 0 && (
                <span className="text-xs bg-gold-50 text-gold-700 px-2 py-0.5 rounded border border-gold-200">
                  已选 {autoChapterIds.length} 个章节
                </span>
              )}
              {autoKnowledgeIds.length > 0 && (
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                  已选 {autoKnowledgeIds.length} 个知识点
                </span>
              )}
            </div>
          </div>
        )}

        {autoGenStep === 2 && (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-ink-600 mb-2">题型与题量</div>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(typeLabel).map(([key, label]) => (
                  <div key={key} className="p-2 border border-ink-100 rounded-lg text-center">
                    <div className="text-xs text-ink-500 mb-1">{label}</div>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setAutoTypeCounts((p) => ({ ...p, [key]: Math.max(0, (p[key] || 0) - 1) }))}
                        className="w-6 h-6 rounded border border-ink-200 text-ink-500 hover:border-ink-300"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-medium">{autoTypeCounts[key] || 0}</span>
                      <button
                        onClick={() => setAutoTypeCounts((p) => ({ ...p, [key]: (p[key] || 0) + 1 }))}
                        className="w-6 h-6 rounded border border-ink-200 text-ink-500 hover:border-ink-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-600 mb-2">难度偏好</div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { v: "easy", label: "简单", color: "emerald" },
                  { v: "medium", label: "中等", color: "amber" },
                  { v: "hard", label: "困难", color: "red" },
                  { v: "mixed", label: "混合", color: "ink" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setAutoDifficulty(opt.v as "easy" | "medium" | "hard" | "mixed")}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-xs transition-all",
                      autoDifficulty === opt.v
                        ? opt.color === "emerald" ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : opt.color === "amber" ? "bg-amber-50 border-amber-300 text-amber-700"
                        : opt.color === "red" ? "bg-red-50 border-red-300 text-red-700"
                        : "bg-ink-50 border-ink-300 text-ink-700"
                        : "border-ink-200 text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 bg-ink-50 rounded-lg text-xs text-ink-500">
              预计组卷：共 {Object.values(autoTypeCounts).reduce((a, b) => a + b, 0)} 道题
              · 难度：{autoDifficulty === "easy" ? "简单" : autoDifficulty === "medium" ? "中等" : autoDifficulty === "hard" ? "困难" : "混合"}
            </div>
          </div>
        )}

        {autoGenStep === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-ink-600">
                AI 已为您挑选 <span className="font-semibold text-gold-600">{autoGeneratedQuestions.length}</span> 道题目
              </div>
              <Button variant="outline" size="sm" onClick={handleAutoGeneratePaper} disabled={autoGenerating}>
                <Sparkles className="w-3 h-3" />
                换一批
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
              {autoGeneratedQuestions.map((q, i) => (
                <div key={q.id} className="p-2 rounded-md border border-ink-100">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded">第 {i + 1} 题</span>
                    <span className="text-[10px] bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded">
                      {typeLabel[q.type] || q.type}
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      {q.difficulty} 星
                    </span>
                  </div>
                  <QuestionCard question={q} showActions={false} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* 添加/换题弹窗 */}
      <Modal
        open={Boolean(addSource)}
        onClose={closeAddQuestion}
        size="lg"
        title={replaceIdx !== null
          ? "替换题目"
          : addTarget
            ? `向「${addTarget.label}」添加题目`
            : "添加题目"
        }
        description={`${replaceIdx !== null ? `将替换第 ${replaceIdx + 1} 题 · ` : ""}已选择 ${selectedQuestionIds.length} 道题目${addTargetQuestionType ? ` · 仅显示${typeLabel[addTargetQuestionType] || addTargetQuestionType}题` : ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={closeAddQuestion}>取消</Button>
            <Button
              variant="gold"
              onClick={handleConfirmAdd}
              disabled={
                addSource === "choose"
                || selectedQuestionIds.length === 0
                || (replaceIdx !== null && selectedQuestionIds.length > 1)
              }
            >
              <Plus className="w-3.5 h-3.5" />
              {replaceIdx !== null ? "确认替换" : "添加选中题目"}
            </Button>
          </>
        }
      >
        {replaceIdx === null && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => chooseAddSource("basket")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors",
                  addSource === "basket"
                    ? "border-gold-400 bg-gold-50 text-gold-800"
                    : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <ShoppingBasket className="h-4 w-4" />
                资源篮
              </button>
              <button
                type="button"
                onClick={() => chooseAddSource("bank")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors",
                  addSource === "bank"
                    ? "border-gold-400 bg-gold-50 text-gold-800"
                    : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <Library className="h-4 w-4" />
                题库
              </button>
              <button
                type="button"
                onClick={() => chooseAddSource("examPaper")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors",
                  addSource === "examPaper" || addSource === "lecture"
                    ? "border-gold-400 bg-gold-50 text-gold-800"
                    : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-ink-50",
                )}
              >
                <Files className="h-4 w-4" />
                其它文档
              </button>
            </div>
            {(addSource === "examPaper" || addSource === "lecture") && (
              <div className="flex items-center gap-1 rounded-md bg-ink-50 p-1">
                <button
                  type="button"
                  onClick={() => chooseAddSource("examPaper")}
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-xs transition-colors",
                    addSource === "examPaper" ? "bg-white font-medium text-gold-700 shadow-sm" : "text-ink-500",
                  )}
                >
                  试卷
                </button>
                <button
                  type="button"
                  onClick={() => chooseAddSource("lecture")}
                  className={cn(
                    "flex-1 rounded px-3 py-1.5 text-xs transition-colors",
                    addSource === "lecture" ? "bg-white font-medium text-gold-700 shadow-sm" : "text-ink-500",
                  )}
                >
                  讲义
                </button>
              </div>
            )}
          </div>
        )}

        {addSource === "choose" && (
          <div className="rounded-lg border border-dashed border-ink-200 px-4 py-12 text-center text-sm text-ink-400">
            请选择题目来源
          </div>
        )}

        {addSource === "basket" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {baskets.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setSelectedBasket(b); setSelectedQuestionIds([]); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedBasket?.id === b.id ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {b.name} ({b.questionIds.length})
                </button>
              ))}
            </div>
            {selectedBasket && (
              <BasketQuestionList
                basket={selectedBasket}
                schoolId={schoolId}
                selectedIds={selectedQuestionIds}
                onSelect={setSelectedQuestionIds}
                singleSelect={replaceIdx !== null}
                answeredQuestionIds={answeredQuestionIds}
                questionType={addTargetQuestionType}
              />
            )}
          </div>
        )}

        {addSource === "bank" && (
          <div className="space-y-3">
            <Input placeholder="搜索题目" value={bankKeyword} onChange={(e) => setBankKeyword(e.target.value)} />
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {bankQuestions
                .filter((question) => !addTargetQuestionType || question.type === addTargetQuestionType)
                .map((q) => {
                const checked = selectedQuestionIds.includes(q.id);
                const answered = answeredQuestionIds.has(q.id);
                return (
                  <div
                    key={q.id}
                    onClick={() => {
                      if (replaceIdx !== null) {
                        setSelectedQuestionIds([q.id]);
                      } else {
                        setSelectedQuestionIds((prev) => prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    {answered && (
                      <div className="mb-1">
                        <span className="tag-gold text-[10px] py-0.5">已做过</span>
                      </div>
                    )}
                    <QuestionCard question={q} showActions={false} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {addSource === "examPaper" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {otherPapers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPaper(p); setSelectedQuestionIds([]); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedPaper?.id === p.id ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {p.title}
                </button>
              ))}
            </div>
            {selectedPaper && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedPaper.questions
                  .filter((pq) => pq.questionId && (!addTargetQuestionType || pq.type === addTargetQuestionType))
                  .map((pq) => {
                  const checked = selectedQuestionIds.includes(pq.questionId!);
                  return (
                    <label key={pq.id} className={cn(
                      "flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}>
                      <input
                        type={replaceIdx !== null ? "radio" : "checkbox"}
                        checked={checked}
                        onChange={() => {
                          if (replaceIdx !== null) setSelectedQuestionIds([pq.questionId!]);
                          else setSelectedQuestionIds((prev) => prev.includes(pq.questionId!) ? prev.filter((id) => id !== pq.questionId) : [...prev, pq.questionId!]);
                        }}
                        className="mt-1 rounded border-ink-300 text-gold-500"
                      />
                      <div className="flex-1 text-sm text-ink-900 line-clamp-2">{pq.stem}</div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {addSource === "lecture" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {otherLectures.map((l) => (
                <button
                  key={l.id}
                  onClick={() => { setSelectedLecture(l); setSelectedQuestionIds([]); }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedLecture?.id === l.id ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {l.title}
                </button>
              ))}
            </div>
            {selectedLecture && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedLecture.sections.filter((s) => s.type === "question" && s.questionId).map((s) => {
                  const checked = selectedQuestionIds.includes(s.questionId!);
                  return (
                    <label key={s.id} className={cn(
                      "flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}>
                      <input
                        type={replaceIdx !== null ? "radio" : "checkbox"}
                        checked={checked}
                        onChange={() => {
                          if (replaceIdx !== null) setSelectedQuestionIds([s.questionId!]);
                          else setSelectedQuestionIds((prev) => prev.includes(s.questionId!) ? prev.filter((id) => id !== s.questionId) : [...prev, s.questionId!]);
                        }}
                        className="mt-1 rounded border-ink-300 text-gold-500"
                      />
                      <div className="flex-1 text-sm text-ink-900">{s.title}</div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 发布弹窗 */}
      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        classes={classes}
        selectedClassIds={publishTargetClassIds}
        onClassChange={setPublishTargetClassIds}
        password={publishPassword}
        onPasswordChange={setPublishPassword}
        unlockAt={publishUnlockAt}
        onUnlockAtChange={setPublishUnlockAt}
        onPublish={handlePublish}
        publishing={publishing}
      />

      {audienceModal}

      {paper && (
        <AddResourceToPrepModal
          open={prepSetupOpen}
          onClose={() => setPrepSetupOpen(false)}
          resourceType="examPaper"
          resourceId={paper.id}
          resourceTitle={paper.title}
          onCreated={(task) => navigate(`/exam-papers/${paper.id}?prepTask=${task.id}`)}
        />
      )}
      {prepPasswordModal}
    </div>
  );
}

function PreviewQuestionPair({
  left,
  right,
  leftClassName,
}: {
  left: ReactNode;
  right?: ReactNode;
  leftClassName?: string;
}) {
  return (
    <>
      <div className={cn("exam-paper-preview-left", leftClassName)}>{left}</div>
      <aside className="exam-paper-preview-right">{right}</aside>
    </>
  );
}

function EditQuestionCatalogPanel({
  pq,
  index,
  question,
  schoolId,
  chapterTree,
  knowledgeTree,
  chapterNameMap,
  knowledgeNameMap,
  onUpdateCatalogs,
  onReplace,
  excludedQuestionIds,
  structureLocked,
}: {
  pq: ExamPaperQuestion;
  index: number;
  question: Question | null | undefined;
  schoolId: string;
  chapterTree: TreeNode | null;
  knowledgeTree: TreeNode | null;
  chapterNameMap: Map<string, string>;
  knowledgeNameMap: Map<string, string>;
  onUpdateCatalogs: (questionId: string, chapterIds: string[], knowledgePointIds: string[]) => Promise<void>;
  onReplace: (question: Question) => void;
  excludedQuestionIds: Set<string>;
  structureLocked: boolean;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [draftChapterIds, setDraftChapterIds] = useState<string[]>([]);
  const [draftKnowledgePointIds, setDraftKnowledgePointIds] = useState<string[]>([]);
  const [savingCatalogs, setSavingCatalogs] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedQuestions, setRelatedQuestions] = useState<SimilarQuestionCandidate[]>([]);

  const chapterNames = (question?.chapterIds || [])
    .map((chapterId) => chapterNameMap.get(chapterId))
    .filter(Boolean) as string[];
  const knowledgeNames = (question?.knowledgePointIds || [])
    .map((knowledgePointId) => knowledgeNameMap.get(knowledgePointId))
    .filter(Boolean) as string[];

  const openCatalogEditor = () => {
    if (!question) return;
    setDraftChapterIds(question.chapterIds);
    setDraftKnowledgePointIds(question.knowledgePointIds);
    setCatalogOpen(true);
  };

  const saveCatalogs = async () => {
    if (!question) return;
    setSavingCatalogs(true);
    try {
      await onUpdateCatalogs(question.id, draftChapterIds, draftKnowledgePointIds);
      setCatalogOpen(false);
      setRelatedOpen(false);
      setRelatedQuestions([]);
    } finally {
      setSavingCatalogs(false);
    }
  };

  const toggleRelatedQuestions = async () => {
    if (relatedOpen) {
      setRelatedOpen(false);
      return;
    }
    setRelatedOpen(true);
    if (!question || question.knowledgePointIds.length === 0 || relatedQuestions.length > 0) return;

    setRelatedLoading(true);
    try {
      const candidates = await questionService.listQuestions({
        schoolId,
        knowledgePointIds: question.knowledgePointIds,
      });
      const currentKnowledgeIds = new Set(question.knowledgePointIds);
      const ranked = candidates
        .filter((candidate) => !excludedQuestionIds.has(candidate.id) && candidate.type === question.type)
        .map((candidate) => {
          const candidateKnowledgeIds = new Set(candidate.knowledgePointIds);
          const overlap = question.knowledgePointIds.filter((id) => candidateKnowledgeIds.has(id)).length;
          const union = new Set([...currentKnowledgeIds, ...candidateKnowledgeIds]).size;
          return {
            question: candidate,
            similarity: union > 0 ? overlap / union : 0,
          };
        })
        .filter((candidate) => candidate.similarity > 0)
        .sort((left, right) =>
          right.similarity - left.similarity
          || right.question.recommendation - left.question.recommendation
          || right.question.usageCount - left.question.usageCount,
        )
        .slice(0, 6);
      setRelatedQuestions(ranked);
    } catch (error) {
      toast.error("相关题加载失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setRelatedLoading(false);
    }
  };

  return (
    <>
      <div
        className="rounded-lg border border-ink-100 bg-paper p-3 shadow-sm"
        data-testid={`exam-editor-question-details-${index + 1}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="font-serif text-sm font-semibold text-ink-900">第 {index + 1} 题目录</div>
            <Badge variant="ink">{typeLabel[question?.type || pq.type] || question?.type || pq.type}</Badge>
          </div>
          <button
            type="button"
            onClick={openCatalogEditor}
            disabled={!question}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gold-600 transition-colors hover:bg-gold-50 hover:text-gold-700 disabled:cursor-not-allowed disabled:text-ink-300"
            aria-label={`编辑第 ${index + 1} 题章节课和知识点`}
          >
            <Edit3 className="h-3 w-3" />
            编辑
          </button>
        </div>

        <div className="space-y-1 text-xs leading-5 text-ink-600">
          <div>
            <span className="text-ink-400">章节课目录：</span>
            {chapterNames.length > 0 ? chapterNames.join("、") : "暂无关联章节课"}
          </div>
          <div>
            <span className="text-ink-400">知识点目录：</span>
            {knowledgeNames.length > 0 ? knowledgeNames.join("、") : "暂无关联知识点"}
          </div>
        </div>

        <div className="mt-3 border-t border-ink-100 pt-3">
          <button
            type="button"
            onClick={() => void toggleRelatedQuestions()}
            disabled={!question}
            className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-ink-300"
            aria-expanded={relatedOpen}
          >
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              相关题
            </span>
            {relatedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {relatedOpen && (
            <div className="mt-2 space-y-2" data-testid={`exam-editor-related-questions-${index + 1}`}>
              {!question || question.knowledgePointIds.length === 0 ? (
                <div className="rounded-md bg-ink-50 px-2 py-3 text-center text-[11px] text-ink-400">
                  当前题目暂无知识点，无法匹配相关题
                </div>
              ) : relatedLoading ? (
                <div className="flex justify-center py-4"><Spinner size={16} /></div>
              ) : relatedQuestions.length === 0 ? (
                <div className="rounded-md bg-ink-50 px-2 py-3 text-center text-[11px] text-ink-400">
                  暂无同题型且知识点高度相似的题目
                </div>
              ) : relatedQuestions.map((candidate, candidateIndex) => (
                <div key={candidate.question.id} className="rounded-md border border-ink-100 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-teal-700">
                      知识点相似度 {Math.round(candidate.similarity * 100)}%
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={structureLocked}
                      onClick={() => {
                        setRelatedOpen(false);
                        setRelatedQuestions([]);
                        onReplace(candidate.question);
                      }}
                      aria-label={`用相关题 ${candidateIndex + 1} 替换第 ${index + 1} 题`}
                    >
                      替换原题
                    </Button>
                  </div>
                  <MathHtml className="line-clamp-3 text-xs leading-5 text-ink-800">
                    {candidate.question.stem}
                  </MathHtml>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title={`编辑第 ${index + 1} 题章节课和知识点`}
        description="修改会同步保存到题库中的原题。"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCatalogOpen(false)}>取消</Button>
            <Button variant="gold" onClick={saveCatalogs} loading={savingCatalogs}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gold-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
              <BookOpen className="h-4 w-4 text-gold-600" />
              章节课目录
            </div>
            {chapterTree ? (
              <SearchableTree
                data={chapterTree}
                title="章节课目录"
                checkable
                checkedIds={draftChapterIds}
                onCheck={setDraftChapterIds}
                expandLevel={2}
                searchPlaceholder="搜索章节课..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[320px]"
              />
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">章节课目录加载中...</div>
            )}
          </div>
          <div className="rounded-lg border border-teal-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
              <Lightbulb className="h-4 w-4 text-teal-600" />
              知识点目录
            </div>
            {knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="知识点目录"
                accent="teal"
                checkable
                checkedIds={draftKnowledgePointIds}
                onCheck={setDraftKnowledgePointIds}
                expandLevel={2}
                searchPlaceholder="搜索知识点..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[320px]"
              />
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">知识点目录加载中...</div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function PreviewQuestionDetails({
  pq,
  index,
  question,
  progress,
  chapterTree,
  knowledgeTree,
  chapterNameMap,
  knowledgeNameMap,
  onUpdateCatalogs,
  onBasketChanged,
  completionQuestionId,
  students,
  answerRecords,
  onUpdateStudentAnswer,
  visibility,
  canEditScore,
  onUpdateScore,
}: {
  pq: ExamPaperQuestion;
  index: number;
  question: Question | null | undefined;
  progress?: QuestionProgress;
  chapterTree: TreeNode | null;
  knowledgeTree: TreeNode | null;
  chapterNameMap: Map<string, string>;
  knowledgeNameMap: Map<string, string>;
  onUpdateCatalogs: (questionId: string, chapterIds: string[], knowledgePointIds: string[]) => Promise<void>;
  onBasketChanged: () => Promise<void>;
  completionQuestionId: string;
  students: Student[];
  answerRecords: AnswerRecord[];
  onUpdateStudentAnswer: (studentId: string, questionId: string, score: AnswerScore | null) => Promise<void>;
  visibility: PreviewSidebarVisibility;
  canEditScore: boolean;
  onUpdateScore: (pqId: string, score: number) => Promise<void>;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [draftChapterIds, setDraftChapterIds] = useState<string[]>([]);
  const [draftKnowledgePointIds, setDraftKnowledgePointIds] = useState<string[]>([]);
  const [savingCatalogs, setSavingCatalogs] = useState(false);
  const [scoreEditing, setScoreEditing] = useState(false);
  const [scoreDraft, setScoreDraft] = useState(String(pq.score));
  const [savingScore, setSavingScore] = useState(false);
  const chapterNames = (question?.chapterIds || [])
    .map((chapterId) => chapterNameMap.get(chapterId))
    .filter(Boolean) as string[];
  const knowledgeNames = (question?.knowledgePointIds || [])
    .map((knowledgePointId) => knowledgeNameMap.get(knowledgePointId))
    .filter(Boolean) as string[];
  const difficulty = question?.difficulty || 3;

  useEffect(() => {
    if (!scoreEditing) setScoreDraft(String(pq.score));
  }, [pq.score, scoreEditing]);

  const openCatalogEditor = () => {
    if (!question) return;
    setDraftChapterIds(question.chapterIds);
    setDraftKnowledgePointIds(question.knowledgePointIds);
    setCatalogOpen(true);
  };

  const saveCatalogs = async () => {
    if (!question) return;
    setSavingCatalogs(true);
    try {
      await onUpdateCatalogs(question.id, draftChapterIds, draftKnowledgePointIds);
      setCatalogOpen(false);
    } finally {
      setSavingCatalogs(false);
    }
  };

  const saveScore = async () => {
    const score = Number(scoreDraft);
    if (!Number.isFinite(score) || score < 0) {
      setScoreDraft(String(pq.score));
      setScoreEditing(false);
      toast.warning("分值必须是大于等于 0 的数字");
      return;
    }
    if (score === pq.score) {
      setScoreEditing(false);
      return;
    }
    setSavingScore(true);
    try {
      await onUpdateScore(pq.id, score);
      setScoreEditing(false);
    } catch {
      setScoreDraft(String(pq.score));
    } finally {
      setSavingScore(false);
    }
  };

  return (
    <>
      {(visibility.properties || visibility.answerStatus || visibility.basket) && (
        <div className="rounded-lg border border-ink-100 bg-paper p-3 shadow-sm" data-testid={`exam-question-details-${index + 1}`}>
          {visibility.properties && (
            <div data-testid={`exam-question-properties-${index + 1}`}>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-ink-500">第 {index + 1} 题</span>
                <Badge variant="ink">{typeLabel[question?.type || pq.type] || question?.type || pq.type}</Badge>
                <Badge variant={difficultyVariant[difficulty] as "green" | "amber" | "red"}>
                  {difficultyLabel[difficulty]}
                </Badge>
                {scoreEditing ? (
                  <div className="no-print inline-flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={scoreDraft}
                      onChange={(event) => setScoreDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void saveScore();
                        if (event.key === "Escape") {
                          setScoreDraft(String(pq.score));
                          setScoreEditing(false);
                        }
                      }}
                      aria-label={`第 ${index + 1} 题分值`}
                      className="h-7 w-16 px-2 py-1 text-xs"
                      disabled={savingScore}
                      autoFocus
                    />
                    <span className="text-xs text-ink-500">分</span>
                    <button
                      type="button"
                      onClick={() => void saveScore()}
                      disabled={savingScore}
                      className="rounded px-1.5 py-1 text-[11px] text-gold-700 hover:bg-gold-50 disabled:opacity-50"
                    >
                      {savingScore ? "保存中" : "保存"}
                    </button>
                  </div>
                ) : canEditScore ? (
                  <button
                    type="button"
                    onClick={() => setScoreEditing(true)}
                    aria-label={`编辑第 ${index + 1} 题分值`}
                    title="编辑分值"
                    className="no-print inline-flex items-center gap-1 rounded transition-opacity hover:opacity-80"
                  >
                    <Badge variant="gold">{pq.score} 分</Badge>
                    <Edit3 className="h-3 w-3 text-gold-600" />
                  </button>
                ) : (
                  <Badge variant="gold">{pq.score} 分</Badge>
                )}
              </div>

              <div className="mt-2 border-t border-ink-100 pt-2 text-[11px] leading-5 text-ink-500">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-ink-600">章节课与知识点</span>
                  <button
                    type="button"
                    onClick={openCatalogEditor}
                    disabled={!question}
                    className="no-print inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-gold-600 transition-colors hover:bg-gold-50 hover:text-gold-700 disabled:cursor-not-allowed disabled:text-ink-300"
                    aria-label={`编辑第 ${index + 1} 题章节课和知识点`}
                    title={question ? "编辑章节课和知识点" : "该题未关联题库，无法编辑"}
                  >
                    <Edit3 className="h-3 w-3" />
                    编辑
                  </button>
                </div>
                <div>
                  <span className="text-ink-400">章节课：</span>
                  {chapterNames.length > 0 ? chapterNames.join("、") : "暂无关联章节课"}
                </div>
                <div>
                  <span className="text-ink-400">知识点：</span>
                  {knowledgeNames.length > 0 ? knowledgeNames.join("、") : "暂无关联知识点"}
                </div>
                {question && question.usageCount > 0 && <div>题库使用 {question.usageCount} 次</div>}
                {question && question.recommendation >= 4 && <div className="font-medium text-gold-600">高推荐题目</div>}
              </div>
            </div>
          )}

          {visibility.answerStatus && (
            <div
              className={cn("mt-2", visibility.properties && "border-t border-ink-100 pt-2")}
              data-testid={`exam-question-answer-status-${index + 1}`}
            >
              <QuestionProgressBadge progress={progress} />
              <StudentAnswerStatusControl
                className="mt-2"
                students={students}
                answerRecords={answerRecords}
                questionId={completionQuestionId}
                onChange={onUpdateStudentAnswer}
              />
            </div>
          )}

          {visibility.basket && (
            <div
              className={cn(
                "no-print mt-3",
                (visibility.properties || visibility.answerStatus) && "border-t border-ink-100 pt-3",
              )}
              data-testid={`exam-question-basket-${index + 1}`}
            >
              {pq.questionId ? (
                <AddToBasketDropdown
                  resourceType="question"
                  resourceId={pq.questionId}
                  resourceTitle={question?.stem || pq.stem}
                  size="sm"
                  variant="outline"
                  quickLabel="加入试题篮"
                  onAdded={onBasketChanged}
                />
              ) : (
                <Button variant="ghost" size="sm" disabled className="text-[11px]">
                  <ShoppingBasket className="h-3 w-3" />
                  加入试题篮
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title={`编辑第 ${index + 1} 题章节课和知识点`}
        description="修改会同步保存到题库中的原题。"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setCatalogOpen(false)}>取消</Button>
            <Button variant="gold" onClick={saveCatalogs} loading={savingCatalogs}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gold-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
              <BookOpen className="h-4 w-4 text-gold-600" />
              章节课目录
            </div>
            {chapterTree ? (
              <SearchableTree
                data={chapterTree}
                title="章节课目录"
                checkable
                checkedIds={draftChapterIds}
                onCheck={setDraftChapterIds}
                expandLevel={2}
                searchPlaceholder="搜索章节课..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[320px]"
              />
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">章节课目录加载中...</div>
            )}
          </div>
          <div className="rounded-lg border border-teal-100 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink-800">
              <Lightbulb className="h-4 w-4 text-teal-600" />
              知识点目录
            </div>
            {knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="知识点目录"
                accent="teal"
                checkable
                checkedIds={draftKnowledgePointIds}
                onCheck={setDraftKnowledgePointIds}
                expandLevel={2}
                searchPlaceholder="搜索知识点..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[320px]"
              />
            ) : (
              <div className="py-8 text-center text-xs text-ink-400">知识点目录加载中...</div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

// ===== 预览模式的题目项 =====
function PreviewQuestionItem({
  pq, index,
}: {
  pq: ExamPaperQuestion;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* 题干（编号+题目） */}
          <div
            onClick={() => setExpanded(!expanded)}
            className="flex cursor-pointer items-start gap-1 text-sm leading-relaxed text-ink-900 transition-colors hover:text-gold-700"
          >
            <span className="flex-shrink-0 font-mono font-bold text-ink-400">{index + 1}.</span>
            <MathHtml className="min-w-0 flex-1 text-sm leading-relaxed text-ink-900">{pq.stem}</MathHtml>
          </div>
          {/* 选项（按数量自适应列数；答案高亮仅在展开时显示） */}
          {pq.options && pq.options.length > 0 && (
            <div className={cn(
              "pl-5 mt-2 gap-2 grid",
              getQuestionOptionGridColumns(pq.options),
            )}>
              {pq.options.map((opt, i) => (
                <div key={i} className={cn(
                  "px-2 py-1.5 text-sm flex items-center gap-1.5 min-w-0",
                  expanded && pq.answer.includes(String.fromCharCode(65 + i))
                    ? "text-emerald-900"
                    : "",
                )}>
                  <span className={cn(
                    "font-mono font-semibold flex-shrink-0",
                    expanded && pq.answer.includes(String.fromCharCode(65 + i))
                      ? "text-emerald-900"
                      : "text-ink-600",
                  )}>{String.fromCharCode(65 + i)}.</span>
                  <MathHtml className={cn(
                    "min-w-0 flex-1",
                    expanded && pq.answer.includes(String.fromCharCode(65 + i))
                      ? "text-emerald-900"
                      : "text-ink-800",
                  )}>{opt}</MathHtml>
                </div>
              ))}
            </div>
          )}
          {/* 答案解析 */}
          {expanded && (
            <div className="space-y-2 pl-5 mt-2 animate-fade-in">
              <div className="p-2 rounded bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900">
                <span className="font-bold">答案：</span>
                <MathHtml className="question-answer-content inline text-emerald-900">{pq.answer}</MathHtml>
              </div>
              <div className="p-2 rounded bg-gold-50/30 border border-gold-200 text-sm text-ink-800">
                <span className="font-bold text-gold-700">解析：</span>
                <MathHtml className="inline text-ink-800">{pq.analysis}</MathHtml>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionProgressBadge({ progress }: { progress?: QuestionProgress }) {
  if (!progress) return null;
  if (progress.answeredCount === 0) {
    return (
      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">
        使用对象未做
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-gold-50 px-1.5 py-0.5 text-[10px] text-gold-800">
      <span>已做 {progress.answeredCount}/{progress.targetCount}</span>
      <span className="text-gold-300">·</span>
      <span>
        {progress.correctRate === null
          ? "暂无正确率"
          : `正确率 ${Math.round(progress.correctRate * 100)}%`}
      </span>
    </span>
  );
}

// ===== 编辑模式的题目行 =====
function EditQuestionRow({
  pq, index, total, question, progress, canMoveUp, canMoveDown,
  onMoveUp, onMoveDown, onRemove, onReplace, onUpdateScore, structureLocked = false, sidebar,
}: {
  pq: ExamPaperQuestion;
  index: number;
  total: number;
  question: Question | null | undefined;
  progress?: QuestionProgress;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onReplace: () => void;
  onUpdateScore: (score: number) => void;
  structureLocked?: boolean;
  sidebar?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cn(sidebar && "grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start")}>
    <div className="border border-ink-100 rounded-md p-3 hover:border-ink-200 transition-colors">
      <div className="flex items-start gap-2">
        {/* 上下移动 */}
        {!structureLocked && <div className="flex flex-col gap-0.5 pt-1">
          <button
            onClick={onMoveUp}
            disabled={canMoveUp === false || (canMoveUp === undefined && index === 0)}
            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="上移"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={canMoveDown === false || (canMoveDown === undefined && index === total - 1)}
            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="下移"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>}

        <div className="flex-1 min-w-0">
          {/* 标签行 */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-sm font-bold text-ink-400">{index + 1}.</span>
            <Badge variant="ink">{typeLabel[pq.type]}</Badge>
            {question && (
              <Badge variant={difficultyVariant[question.difficulty] as any}>
                {difficultyLabel[question.difficulty]}
              </Badge>
            )}
            <QuestionProgressBadge progress={progress} />
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={String(pq.score)}
                onChange={(e) => onUpdateScore(Number(e.target.value))}
                className="w-16 text-xs"
              />
              <span className="text-xs text-ink-500">分</span>
            </div>
          </div>
          {/* 题干 */}
          <div
            onClick={() => setExpanded(!expanded)}
            className="cursor-pointer transition-colors hover:text-gold-700"
          >
            <MathHtml className="whitespace-pre-wrap text-sm text-ink-900">{pq.stem}</MathHtml>
          </div>
          {/* 选项（始终显示，按数量自适应列数；答案高亮仅在展开时显示） */}
          {pq.options && pq.options.length > 0 && (
            <div className={cn(
              "pl-4 mt-2 gap-2 grid",
              getOptionsGridCols(pq.options.length),
            )}>
              {pq.options.map((opt, i) => (
                <div key={i} className={cn(
                  "px-2 py-1 text-xs min-w-0 flex items-center gap-1.5",
                  expanded && pq.answer.includes(String.fromCharCode(65 + i))
                    ? "rounded bg-emerald-50/50 text-emerald-900"
                    : "",
                )}>
                  <span className="font-mono font-semibold text-ink-500 flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <MathHtml className="min-w-0 flex-1 text-xs text-ink-800">{opt}</MathHtml>
                </div>
              ))}
            </div>
          )}
          {/* 展开答案解析（保持折叠/展开行为） */}
          {expanded && (
            <div className="mt-2 space-y-1.5 animate-fade-in pl-4">
              <div className="text-xs p-2 rounded bg-emerald-50/40 border border-emerald-200">
                <span className="font-bold text-emerald-700">答案：</span>
                <MathHtml className="question-answer-content inline text-emerald-900">{pq.answer}</MathHtml>
              </div>
              <div className="text-xs p-2 rounded bg-gold-50/30 border border-gold-200">
                <span className="font-bold text-gold-700">解析：</span>
                <MathHtml className="inline text-ink-800">{pq.analysis}</MathHtml>
              </div>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {!structureLocked && <div className="flex-shrink-0 flex items-center gap-1">
          <button
            onClick={onReplace}
            className="px-2 py-1 rounded text-xs text-teal-600 hover:bg-teal-50 transition-colors"
            title="换题"
          >
            换题
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="删除"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>}
      </div>
    </div>
    {sidebar && <aside className="min-w-0">{sidebar}</aside>}
    </div>
  );
}

// ===== 试题篮题目列表 =====
function BasketQuestionList({
  basket, schoolId, selectedIds, onSelect, singleSelect, answeredQuestionIds, questionType,
}: {
  basket: Basket;
  schoolId: string;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  singleSelect?: boolean;
  answeredQuestionIds: Set<string>;
  questionType?: string;
}) {
  const [qs, setQs] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    questionService.listQuestions({ schoolId }).then((all) => {
      setQs(all.filter((q) => (
        basket.questionIds.includes(q.id)
        && (!questionType || q.type === questionType)
      )));
      setLoading(false);
    });
  }, [basket, questionType, schoolId]);

  if (loading) return <Spinner size={20} />;

  return (
    <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
      {qs.map((q) => {
        const checked = selectedIds.includes(q.id);
        const answered = answeredQuestionIds.has(q.id);
        return (
          <div
            key={q.id}
            onClick={() => {
              if (singleSelect) onSelect([q.id]);
              else onSelect(selectedIds.includes(q.id) ? selectedIds.filter((id) => id !== q.id) : [...selectedIds, q.id]);
            }}
            className={cn(
              "p-2 rounded-md border cursor-pointer transition-colors",
              checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
            )}
          >
            {answered && (
              <div className="mb-1">
                <span className="tag-gold text-[10px] py-0.5">已做过</span>
              </div>
            )}
            <QuestionCard question={q} showActions={false} />
          </div>
        );
      })}
    </div>
  );
}

// ===== 发布弹窗 =====
function PublishModal({
  open, onClose, classes, selectedClassIds, onClassChange,
  password, onPasswordChange, unlockAt, onUnlockAtChange, onPublish, publishing,
}: {
  open: boolean;
  onClose: () => void;
  classes: AnyClass[];
  selectedClassIds: string[];
  onClassChange: (ids: string[]) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  unlockAt: string;
  onUnlockAtChange: (v: string) => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="发布试卷"
      description="选择发布班级，可选设置密码保护和到期日期"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="gold" onClick={onPublish} loading={publishing}>
            <Send className="w-4 h-4" />
            确认发布
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 发布班级 */}
        <div>
          <div className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-emerald-500" />
            发布班级
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {classes.length === 0 ? (
              <div className="text-center py-4 text-xs text-ink-400">暂无班级</div>
            ) : (
              classes.map((c) => {
                const checked = selectedClassIds.includes(c.id);
                return (
                  <label key={c.id} className={cn(
                    "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                    checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                  )}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) onClassChange([...selectedClassIds, c.id]);
                        else onClassChange(selectedClassIds.filter((id) => id !== c.id));
                      }}
                      className="rounded border-ink-300 text-gold-500"
                    />
                    <GraduationCap className="w-3.5 h-3.5 text-ink-400" />
                    <span className="text-sm text-ink-800 flex-1">{c.name}</span>
                    {c.type === "personal" && <Badge variant="teal">个人</Badge>}
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* 正规考试选项 */}
        <div className="pt-3 border-t border-ink-100 space-y-3">
          <div className="text-xs text-ink-500 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            设置密码或到期日期后，试卷将作为正规考试发布，到期前其他老师无法查看题目，关联题目自动从题库隐藏。
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              查看密码（可选）
            </label>
            <Input
              type="text"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="留空则无密码"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              到期日期（可选）
            </label>
            <Input
              type="datetime-local"
              value={unlockAt}
              onChange={(e) => onUnlockAtChange(e.target.value)}
            />
            <div className="text-[10px] text-ink-400 mt-1">到期后题目自动解锁</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
