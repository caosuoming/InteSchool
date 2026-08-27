import { openPage } from "@/lib/navigation";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Search, X, FileQuestion, BookOpen, Lightbulb,
  Users, ChevronDown, GraduationCap, Calendar, Clock,
  ListFilter, Layers, Tag, Edit3, Plus, CheckCircle2,
  ArrowUpDown, TrendingUp, Sparkles, Star, Share2, Trash2,
  FileText, ExternalLink,
  Download, RefreshCw, ShoppingBasket,
  PanelLeftClose, PanelLeftOpen,
  CheckSquare, Square, WandSparkles, Link2, Video, NotebookPen,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { analyticsService, type DateRange } from "@/services/analytics";
import { prepService } from "@/services/prep";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { quotaService } from "@/services/quota";
import { MathHtml } from "@/components/ui/MathHtml";
import { toast } from "@/stores/ui";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { QuestionDetail } from "@/components/question/QuestionDetail";
import { QuestionExpandedDetails } from "@/components/question/QuestionExpandedDetails";
import { QuestionEditor } from "@/components/question/QuestionEditor";
import { RelatedQuestionsModal } from "@/components/question/RelatedQuestionsModal";
import { QuickEditModal } from "@/components/question/QuickEditModal";
import { ShareModal } from "@/components/question/ShareModal";
import { QuestionActionsBar } from "@/components/question/QuestionActionsBar";
import { QuestionAdaptationModal } from "@/components/question/QuestionAdaptationModal";
import { QuestionLinksModal } from "@/components/question/QuestionLinksModal";
import { QuestionVideoModal } from "@/components/question/QuestionVideoModal";
import { TagSettings } from "@/components/question/TagSettings";
import { useTagPrefsStore } from "@/stores/tagPrefs";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import { useQuestionMetadataOptions } from "@/hooks/useQuestionMetadataOptions";
import type { Question, TreeNode, Student, SchoolClass, PersonalClass, FilterLogic, AnswerRecord, AnswerScore, Lecture, LectureSection, ExamPaper, ResourceSemester, QuestionSearchField, UserQuotaSnapshot } from "@/types";
import { cn } from "@/lib/utils";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";
import { inferScore } from "@/services/analytics";
import { generateQuestionDocx } from "@/lib/docx";

type Mode = "manage" | "use";
type SortKey = "usage" | "weakness" | "recommendation" | "newest" | "recentUse";
type LeftTab = "chapter" | "knowledge";

const difficultyOptions = [
  { value: 1, label: "简单" },
  { value: 2, label: "较易" },
  { value: 3, label: "中等" },
  { value: 4, label: "较难" },
  { value: 5, label: "困难" },
];

const searchFieldOptions: { value: QuestionSearchField; label: string }[] = [
  { value: "stem", label: "题干" },
  { value: "analysis", label: "解析" },
  { value: "summary", label: "总结" },
  { value: "remark", label: "备注" },
];

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "usage", label: "使用次数", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { value: "recentUse", label: "最新使用", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "weakness", label: "学生薄弱优先", icon: <Sparkles className="w-3.5 h-3.5" /> },
  { value: "recommendation", label: "推荐程度", icon: <Star className="w-3.5 h-3.5" /> },
  { value: "newest", label: "最新创建", icon: <Calendar className="w-3.5 h-3.5" /> },
];

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

interface QuestionBankPageProps {
  selectedQuestionIds?: Set<string>;
  donatedQuestionIds?: Set<string>;
  donationLockedQuestionIds?: Set<string>;
  onToggleSelection?: (question: Question) => void;
  onQuestionDeleted?: (questionId: string) => void;
  refreshToken?: number;
}

export default function QuestionBankPage({
  selectedQuestionIds,
  donatedQuestionIds,
  donationLockedQuestionIds,
  onToggleSelection,
  onQuestionDeleted,
  refreshToken = 0,
}: QuestionBankPageProps = {}) {
  const { teacher } = useAuthStore();
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(teacher?.schoolId);
  const { options: questionTypeOptions, getLabel: getQuestionTypeLabel } = useQuestionTypeOptions(teacher?.schoolId);
  const {
    sourceOptions,
    categoryOptions,
    getSourceLabel,
    getCategoryLabel,
  } = useQuestionMetadataOptions(teacher?.schoolId);
  const tagPrefs = useTagPrefsStore((state) => state.prefs);
  const [leftTab, setLeftTab] = useState<LeftTab>("chapter");
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestionCount, setTotalQuestionCount] = useState(0);
  const [quota, setQuota] = useState<UserQuotaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchFields, setSearchFields] = useState<QuestionSearchField[]>([]);

  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");
  const [noChapter, setNoChapter] = useState(false);
  const [noKnowledge, setNoKnowledge] = useState(false);

  const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedSemester, setSelectedSemester] = useState<string>("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("newest");

  const [detailQuestion, setDetailQuestion] = useState<Question | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [baskets, setBaskets] = useState<{ id: string; name: string; isDefault?: boolean; questionIds?: string[] }[]>([]);
  const [addToBasketFor, setAddToBasketFor] = useState<Question | null>(null);

  // 章节/知识点名称映射（用于卡片显示）
  const [chapterMap, setChapterMap] = useState<Map<string, string>>(new Map());
  const [knowledgeMap, setKnowledgeMap] = useState<Map<string, string>>(new Map());

  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const mode: Mode = selectedStudentIds.length > 0 ? "use" : "manage";

  // 选中学学生的答题记录（题库使用模式下用于在题目上方显示答题情况）
  const [studentAnswerRecords, setStudentAnswerRecords] = useState<AnswerRecord[]>([]);
  const [pendingQuestionAssignments, setPendingQuestionAssignments] = useState<Array<{ studentId: string; questionId: string }>>([]);
  const pendingQuestionKeys = useMemo(
    () => new Set(pendingQuestionAssignments.map((item) => `${item.studentId}:${item.questionId}`)),
    [pendingQuestionAssignments],
  );
  const [excludeDone, setExcludeDone] = useState(true);
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("all");
  const dateRange = useMemo(() => getDateRange(timeRangeKey), [timeRangeKey]);

  // 题库使用模式下：章节/知识点/备注显示开关
  const [showChapter, setShowChapter] = useState(true);
  const [showKnowledge, setShowKnowledge] = useState(true);
  const [showRemark, setShowRemark] = useState(true);
  const [showStudentAnswers, setShowStudentAnswers] = useState(true);

  // 相关题目弹窗
  const [relatedModal, setRelatedModal] = useState<{
    open: boolean;
    title: string;
    description?: string;
    filterType: "chapter" | "knowledge" | "keyword";
    filterValue: string;
  } | null>(null);

  // 快速编辑弹窗
  const [quickEditQuestion, setQuickEditQuestion] = useState<Question | null>(null);

  // 分享弹窗
  const [shareQuestion, setShareQuestion] = useState<Question | null>(null);

  const [adaptingQuestion, setAdaptingQuestion] = useState<Question | null>(null);
  const [linksQuestion, setLinksQuestion] = useState<Question | null>(null);
  const [videoQuestion, setVideoQuestion] = useState<Question | null>(null);

  // 替换题目弹窗
  const [replaceQuestion, setReplaceQuestion] = useState<Question | null>(null);
  const [replaceForm, setReplaceForm] = useState<{
    stem: string;
    options: string[];
    answer: string;
    analysis: string;
    difficulty: number;
    recommendation: number;
  } | null>(null);
  const [replaceSaving, setReplaceSaving] = useState(false);

  // 已选用题目列表
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);

  // 讲义/试卷体积较大，仅在学情模式或查看使用记录时按需加载。
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [examPapers, setExamPapers] = useState<ExamPaper[]>([]);
  const [usageResourcesLoaded, setUsageResourcesLoaded] = useState(false);
  const [usageResourcesLoading, setUsageResourcesLoading] = useState(false);

  // 使用次数详情弹窗
  const [usageDetailModal, setUsageDetailModal] = useState<{
    open: boolean;
    question: Question;
  } | null>(null);

  // 查重弹窗
  const [duplicateModal, setDuplicateModal] = useState<{
    open: boolean;
    question: Question;
    similarQuestions: Question[];
    targetStudentIds: string[];
  } | null>(null);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const navigate = useNavigate();

  const hasFilter =
    checkedChapters.length > 0 ||
    checkedKnowledge.length > 0 ||
    selectedDifficulties.length > 0 ||
    selectedTypes.length > 0 ||
    selectedGrade ||
    selectedYear ||
    selectedSemester ||
    selectedSources.length > 0 ||
    selectedCategories.length > 0 ||
    keyword ||
    searchFields.length > 0 ||
    selectedStudentIds.length > 0;

  const loadQuestions = useCallback(async () => {
    if (!teacher) return;
    setLoading(true);

    let excludeIds: string[] = [];
    if (mode === "use" && excludeDone && selectedStudentIds.length > 0) {
      const [answeredIds, pendingAssignments] = await Promise.all([
        analyticsService.getAnsweredQuestionIds(selectedStudentIds, dateRange),
        analyticsService.listPendingQuestionAssignments(selectedStudentIds),
      ]);
      excludeIds = Array.from(new Set([
        ...answeredIds,
        ...pendingAssignments.map((item) => item.questionId),
      ]));
    }

    const filter = {
      schoolId: teacher.schoolId!,
      keyword,
      searchFields,
      chapterIds: checkedChapters,
      chapterLogic,
      knowledgePointIds: checkedKnowledge,
      knowledgeLogic,
      noChapter,
      noKnowledge,
      difficulty: selectedDifficulties,
      type: selectedTypes as any,
      grade: selectedGrade || undefined,
      schoolYear: selectedYear || undefined,
      semester: (selectedSemester || undefined) as ResourceSemester | undefined,
      sourceType: selectedSources,
      category: selectedCategories,
      excludeQuestionIds: excludeIds,
    };

    void quotaService.getQuota(teacher.id).then(setQuota).catch(() => undefined);

    if (mode === "manage") {
      const page = await questionService.listQuestionPage(filter, currentPage, pageSize, sortKey);
      setQuestions(page.items);
      setTotalQuestionCount(page.total);
      setLoading(false);
      return;
    }

    const data = await questionService.listQuestions(filter);

    const sorted = [...data];
    if (mode === "use" && selectedStudentIds.length > 0 && sortKey === "weakness") {
      const weakness = await analyticsService.getQuestionWeaknessScore(
        teacher.schoolId!,
        selectedStudentIds,
        dateRange,
      );
      sorted.sort((a, b) => {
        const wa = weakness.get(a.id) ?? 0;
        const wb = weakness.get(b.id) ?? 0;
        return wb - wa || b.recommendation - a.recommendation;
      });
    } else {
      switch (sortKey) {
        case "usage":
          sorted.sort((a, b) => b.usageCount - a.usageCount);
          break;
        case "recentUse":
          sorted.sort((a, b) => {
            const ta = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
            const tb = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
            return tb - ta || b.usageCount - a.usageCount;
          });
          break;
        case "recommendation":
          sorted.sort((a, b) => b.recommendation - a.recommendation || b.usageCount - a.usageCount);
          break;
        case "newest":
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case "weakness":
        default:
          sorted.sort((a, b) => b.usageCount - a.usageCount);
          break;
      }
    }

    setQuestions(sorted);
    setTotalQuestionCount(sorted.length);
    setLoading(false);
  }, [
    teacher, keyword, searchFields, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic,
    noChapter, noKnowledge,
    selectedDifficulties, selectedTypes, selectedGrade, selectedYear, selectedSemester,
    selectedSources, selectedCategories, mode, selectedStudentIds, excludeDone, sortKey, dateRange,
    currentPage, pageSize,
  ]);

  useEffect(() => {
    if (!teacher) return;
    const load = async () => {
      const [ch, kp, bs, allClasses, stus, chapters, points] = await Promise.all([
        knowledgeService.getChapterTree(teacher.schoolId!),
        knowledgeService.getKnowledgeTree(teacher.schoolId!),
        basketService.listBaskets(teacher.id),
        classService.listMyClasses(teacher.schoolId, teacher.id),
        classService.listMyStudents(teacher.schoolId, teacher.id),
        knowledgeService.listChapters(teacher.schoolId!),
        knowledgeService.listKnowledgePoints(teacher.schoolId!),
      ]);
      setChapterTree(ch);
      setKnowledgeTree(kp);
      setBaskets(bs.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, questionIds: b.questionIds })));
      setSchoolClasses(allClasses.filter((item): item is SchoolClass => item.type === "school"));
      setPersonalClasses(allClasses.filter((item): item is PersonalClass => item.type === "personal"));
      setStudents(stus);
      setChapterMap(new Map(chapters.map((c) => [c.id, c.name])));
      setKnowledgeMap(new Map(points.map((p) => [p.id, p.name])));
    };
    load();
  }, [teacher]);

  useEffect(() => {
    const t = setTimeout(loadQuestions, 300);
    return () => clearTimeout(t);
  }, [loadQuestions]);

  useEffect(() => {
    if (refreshToken === 0) return;
    loadQuestions();
  }, [loadQuestions, refreshToken]);

  // 题目变更或手工录入学情后，立即刷新目录总数与已做题数。
  useEffect(() => {
    if (!teacher) return;
    let cancelled = false;
    (async () => {
      const [baseChapterTree, baseKnowledgeTree] = await Promise.all([
        knowledgeService.getChapterTree(teacher.schoolId!),
        knowledgeService.getKnowledgeTree(teacher.schoolId!),
      ]);
      if (cancelled) return;
      if (selectedStudentIds.length === 0) {
        setChapterTree(baseChapterTree);
        setKnowledgeTree(baseKnowledgeTree);
        return;
      }
      const [annotatedChapterTree, annotatedKnowledgeTree] = await Promise.all([
        analyticsService.annotateTreeWithStudentProgress(
          baseChapterTree,
          selectedStudentIds,
          "chapter",
          dateRange,
        ),
        analyticsService.annotateTreeWithStudentProgress(
          baseKnowledgeTree,
          selectedStudentIds,
          "knowledge",
          dateRange,
        ),
      ]);
      if (cancelled) return;
      setChapterTree(annotatedChapterTree);
      setKnowledgeTree(annotatedKnowledgeTree);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStudentIds, teacher, dateRange, questions, studentAnswerRecords]);

  // 拉取选中学生的答题记录和文档使用对象派生的“待做”题目。
  useEffect(() => {
    if (mode !== "use" || selectedStudentIds.length === 0) {
      setStudentAnswerRecords([]);
      setPendingQuestionAssignments([]);
      return;
    }
    Promise.all([
      analyticsService.listAnswerRecordsByStudents(selectedStudentIds, dateRange),
      analyticsService.listPendingQuestionAssignments(selectedStudentIds),
    ])
      .then(([records, pendingAssignments]) => {
        setStudentAnswerRecords(records);
        setPendingQuestionAssignments(pendingAssignments);
      })
      .catch(() => {
        setStudentAnswerRecords([]);
        setPendingQuestionAssignments([]);
      });
  }, [mode, selectedStudentIds, dateRange]);

  // 加载已选用题目列表
  useEffect(() => {
    if (!teacher) return;
    prepService.getUsedQuestionIds(teacher.id).then(setUsedQuestionIds);
  }, [teacher]);

  const loadUsageResources = useCallback(async () => {
    if (!teacher?.schoolId || usageResourcesLoaded || usageResourcesLoading) return;
    setUsageResourcesLoading(true);
    try {
      const [nextLectures, nextExamPapers] = await Promise.all([
        lectureService.listLectures({ schoolId: teacher.schoolId }),
        examPaperService.listPapers({ schoolId: teacher.schoolId }),
      ]);
      setLectures(nextLectures);
      setExamPapers(nextExamPapers);
      setUsageResourcesLoaded(true);
    } finally {
      setUsageResourcesLoading(false);
    }
  }, [teacher?.schoolId, usageResourcesLoaded, usageResourcesLoading]);

  // 学情模式需要判断题目是否已在选中学生的讲义中使用；默认管理模式无需预取。
  useEffect(() => {
    if (selectedStudentIds.length === 0) return;
    void loadUsageResources();
  }, [loadUsageResources, selectedStudentIds.length]);

  // 初始化替换题目的表单
  useEffect(() => {
    if (replaceQuestion) {
      setReplaceForm({
        stem: replaceQuestion.stem,
        options: replaceQuestion.options ? [...replaceQuestion.options] : [],
        answer: replaceQuestion.answer,
        analysis: replaceQuestion.analysis,
        difficulty: replaceQuestion.difficulty,
        recommendation: replaceQuestion.recommendation,
      });
      setReplaceSaving(false);
    } else {
      setReplaceForm(null);
    }
  }, [replaceQuestion]);

  // 递归检查讲义章节是否包含某题目
  const sectionContainsQuestion = useCallback((sections: LectureSection[], questionId: string): boolean => {
    for (const sec of sections) {
      if (sec.questionId === questionId) return true;
      if (sec.children && sec.children.length > 0) {
        if (sectionContainsQuestion(sec.children, questionId)) return true;
      }
    }
    return false;
  }, []);

  // 获取使用了某题目的讲义列表
  const getLecturesUsingQuestion = useCallback((questionId: string): Lecture[] => {
    return lectures.filter((l) => sectionContainsQuestion(l.sections, questionId));
  }, [lectures, sectionContainsQuestion]);

  const getExamPapersUsingQuestion = useCallback((questionId: string): ExamPaper[] => {
    return examPapers.filter((paper) => paper.questions.some((question) => question.questionId === questionId));
  }, [examPapers]);

  // 判断某题目是否处于选中学生当前文档使用对象中。
  const isQuestionUsedBySelectedStudents = useCallback((questionId: string): boolean => {
    if (selectedStudentIds.length === 0) return false;
    return selectedStudentIds.some((studentId) => pendingQuestionKeys.has(`${studentId}:${questionId}`));
  }, [pendingQuestionKeys, selectedStudentIds]);

  const getSelectedStudentNames = useCallback((): string => {
    if (selectedStudentIds.length === 0) return "";
    const selected = students.filter((s) => selectedStudentIds.includes(s.id));
    if (selected.length === 0) return `${selectedStudentIds.length}人`;
    if (selected.length <= 3) {
      return selected.map((s) => s.name).join("、");
    }
    return `${selected[0].name}等${selected.length}人`;
  }, [selectedStudentIds, students]);

  const toggleDifficulty = (d: number) => {
    setSelectedDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  };

  const toggleType = (t: string) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleSource = (s: string) => {
    setSelectedSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const toggleCategory = (c: string) => {
    setSelectedCategories((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const toggleSearchField = (field: QuestionSearchField) => {
    setSearchFields((prev) =>
      prev.includes(field) ? prev.filter((value) => value !== field) : [...prev, field],
    );
  };

  const clearAllFilters = () => {
    setKeyword("");
    setSearchFields([]);
    setCheckedChapters([]);
    setCheckedKnowledge([]);
    setNoChapter(false);
    setNoKnowledge(false);
    setSelectedDifficulties([]);
    setSelectedTypes([]);
    setSelectedGrade("");
    setSelectedYear("");
    setSelectedSemester("");
    setSelectedSources([]);
    setSelectedCategories([]);
    setSelectedStudentIds([]);
  };

  const handleAddToBasket = async (basketId: string, question: Question) => {
    await basketService.addQuestion(basketId, question.id);
    toast.success("已加入试题篮");
    setAddToBasketFor(null);
    // 刷新试题篮列表
    if (teacher) {
      const bs = await basketService.listBaskets(teacher.id);
      setBaskets(bs.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, questionIds: b.questionIds })));
    }
  };

  const handleAddToDefaultBasket = async (question: Question) => {
    if (!teacher) return;
    const result = await basketService.addQuestionToDefault(teacher.id, question.id);
    if (result) {
      toast.success(`已加入默认试题篮「${result.name}」`);
      const bs = await basketService.listBaskets(teacher.id);
      setBaskets(bs.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, questionIds: b.questionIds })));
    } else {
      toast.info("暂无默认试题篮，请先在试题篮页面设置");
    }
  };

  const handleRemoveFromDefaultBasket = async (question: Question) => {
    if (!teacher || !defaultBasket) return;
    await basketService.removeQuestion(defaultBasket.id, question.id);
    toast.success(`已从默认试题篮「${defaultBasket.name}」移除`);
    const bs = await basketService.listBaskets(teacher.id);
    setBaskets(bs.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, questionIds: b.questionIds })));
  };

  const defaultBasket = useMemo(() => baskets.find((b) => b.isDefault), [baskets]);

  const handleCheckDuplicateAndAdd = async (question: Question, basketId: string, studentIds: string[] = []) => {
    if (!teacher) return;

    const { isDuplicate, similarQuestions } = await prepService.checkDuplicateQuestion(
      question.stem,
      teacher.id,
      question.id,
    );

    if (isDuplicate) {
      setDuplicateModal({
        open: true,
        question,
        similarQuestions,
        targetStudentIds: studentIds,
      });
      return;
    }

    await basketService.addQuestion(basketId, question.id);
    if (studentIds.length > 0) {
      await prepService.addQuestionReference(question.id, teacher.id, studentIds);
      setUsedQuestionIds((prev) => [...new Set([...prev, question.id])]);
    }
    toast.success("已加入试题篮");
    setAddToBasketFor(null);
    if (teacher) {
      const bs = await basketService.listBaskets(teacher.id);
      setBaskets(bs.map((b) => ({ id: b.id, name: b.name, isDefault: b.isDefault, questionIds: b.questionIds })));
    }
  };

  const handleMergeQuestion = async (targetQuestionId: string) => {
    if (!duplicateModal) return;

    try {
      await prepService.mergeQuestions(targetQuestionId, duplicateModal.question.id);
      toast.success("题目已合并");
      loadQuestions();
      prepService.getUsedQuestionIds(teacher!.id).then(setUsedQuestionIds);
    } catch (e: any) {
      toast.error("合并失败", e?.message);
    }
    setDuplicateModal(null);
  };

  const handleAddAsNew = async () => {
    if (!duplicateModal || !teacher) return;

    try {
      const { id: _, ...questionInput } = duplicateModal.question;
      const newQuestion = await questionService.createQuestion(
        teacher.id,
        teacher.schoolId!,
        questionInput
      );
      if (duplicateModal.targetStudentIds.length > 0) {
        await prepService.addQuestionReference(newQuestion.id, teacher.id, duplicateModal.targetStudentIds);
        setUsedQuestionIds((prev) => [...new Set([...prev, newQuestion.id])]);
      }
      toast.success("题目已新增");
      loadQuestions();
    } catch (e: any) {
      toast.error("新增失败", e?.message);
    }
    setDuplicateModal(null);
  };

  const handleDeleteQuestion = async (question: Question) => {
    if (!confirm(`确定要删除这道题目吗？\n\n${question.stem.slice(0, 50)}...`)) return;
    try {
      await questionService.deleteQuestion(question.id);
      toast.success("题目已删除");
      onQuestionDeleted?.(question.id);
      loadQuestions();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  const handleUpdateStudentAnswer = async (studentId: string, questionId: string, score: AnswerScore | null) => {
    try {
      await analyticsService.saveAnswerRecord({
        studentId,
        questionId,
        lectureId: "manual",
        score,
        source: "manual",
      });
      const records = await analyticsService.listAnswerRecordsByStudents(selectedStudentIds, dateRange);
      setStudentAnswerRecords(records);
      toast.success("答题结果已更新");
    } catch (e: any) {
      toast.error("更新失败", e?.message);
    }
  };

  const handleDownloadQuestion = async (question: Question) => {
    const chapterNames = question.chapterIds.map((id) => chapterMap.get(id)).filter(Boolean) as string[];
    const pointNames = question.knowledgePointIds.map((id) => knowledgeMap.get(id)).filter(Boolean) as string[];
    const remarkContents = (question.remarks || []).map((r) => r.content);
    if (!question.remarks && question.remark) {
      remarkContents.unshift(question.remark);
    }
    try {
      await generateQuestionDocx(question, {
        chapterNames,
        pointNames,
        remarks: remarkContents,
      });
      toast.success("题目已下载为 Word 文档");
    } catch (e: any) {
      toast.error("下载失败", e?.message);
    }
  };

  const handleReplaceQuestion = async () => {
    if (!replaceQuestion || !replaceForm || !teacher?.schoolId) return;
    setReplaceSaving(true);
    try {
      let duplicateDecision: "add" | undefined;
      if (replaceForm.stem !== replaceQuestion.stem) {
        const [candidate] = await questionService.findSimilarQuestions(
          replaceForm.stem,
          teacher.schoolId,
          replaceQuestion.id,
        );
        if (candidate) {
          const accepted = confirm(
            `发现高度相似题目（相似度 ${(candidate.similarity * 100).toFixed(1)}%）\n`
            + `已有题目 ID：${candidate.question.id}\n\n`
            + `${candidate.question.stem.slice(0, 160)}\n\n仍要保存为当前题目吗？`,
          );
          if (!accepted) return;
          duplicateDecision = "add";
        }
      }
      await questionService.updateQuestion(replaceQuestion.id, {
        stem: replaceForm.stem,
        options: replaceForm.options.length > 0 ? replaceForm.options : undefined,
        answer: replaceForm.answer,
        analysis: replaceForm.analysis,
        difficulty: replaceForm.difficulty as 1 | 2 | 3 | 4 | 5,
        recommendation: replaceForm.recommendation as 1 | 2 | 3 | 4 | 5,
      }, duplicateDecision);
      toast.success("题目已替换");
      setReplaceQuestion(null);
      loadQuestions();
    } catch (e: any) {
      toast.error("替换失败", e?.message);
    } finally {
      setReplaceSaving(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return students;
    const pClass = personalClasses.find((c) => c.id === selectedClassId);
    if (pClass) {
      return students.filter((s) => pClass.studentIds.includes(s.id));
    }
    return students.filter((s) => s.classId === selectedClassId);
  }, [selectedClassId, students, personalClasses]);

  // 分页计算
  const totalQuestions = mode === "manage" ? totalQuestionCount : questions.length;
  const totalPages = Math.max(1, Math.ceil(totalQuestions / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedQuestions = useMemo(() => {
    if (mode === "manage") return questions;
    const start = (safeCurrentPage - 1) * pageSize;
    return questions.slice(start, start + pageSize);
  }, [mode, questions, safeCurrentPage, pageSize]);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) setCurrentPage(safeCurrentPage);
  }, [currentPage, safeCurrentPage]);

  const pageSizeOptions = [10, 20, 50, 100, 200];

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // 获取当前显示的树
  const displayTree = leftTab === "chapter" ? chapterTree : knowledgeTree;
  const displayCheckedIds = leftTab === "chapter" ? checkedChapters : checkedKnowledge;
  const setDisplayCheckedIds = leftTab === "chapter" ? setCheckedChapters : setCheckedKnowledge;

  return (
    <div>
      {/* 选择学生 + 时间周期 + 排序 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowStudentPicker(true)}
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {selectedStudentIds.length > 0 ? (
              <span>{getSelectedStudentNames()}</span>
            ) : (
              <span>选择学生</span>
            )}
            {selectedStudentIds.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-gold-500/20 text-gold-800 rounded text-xs font-medium">
                {selectedStudentIds.length}人
              </span>
            )}
          </span>
        </Button>

        {/* 时间周期选择 */}
        {selectedStudentIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-400" />
            <select
              value={timeRangeKey}
              onChange={(e) => setTimeRangeKey(e.target.value as TimeRangeKey)}
              className="text-xs border border-ink-200 rounded px-2 py-1 bg-paper text-ink-700 cursor-pointer focus:outline-none focus:border-gold-400"
            >
              {timeRangeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 排序选择 */}
        <div className="ml-auto flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-ink-400" />
          <span className="text-xs text-ink-500">排序：</span>
          <div className="flex items-center gap-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortKey(opt.value)}
                disabled={opt.value === "weakness" && selectedStudentIds.length === 0}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                      sortKey === opt.value
                        ? "bg-gold-400 border-gold-400 text-ink-900"
                        : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                      opt.value === "weakness" && selectedStudentIds.length === 0 && "opacity-40 cursor-not-allowed",
                    )}
                    title={opt.value === "weakness" && selectedStudentIds.length === 0 ? "需先选择学生" : ""}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
      </div>

      <ResizableSidebarLayout
        storageKey="inteschool.question-bank.directory-width"
        defaultWidth={360}
        collapsed={directoryCollapsed}
        separatorLabel="调整题库章节课与知识点目录宽度"
        sidebar={(
          <Card className="p-0 overflow-hidden sticky top-4 h-fit">
              {/* Tab 头 */}
              <div className="flex border-b border-ink-100">
                <div className="flex flex-1 min-w-0">
                  <button
                    onClick={() => setLeftTab("chapter")}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                      leftTab === "chapter"
                        ? "bg-gold-50 text-gold-800 border-b-2 border-gold-500"
                        : "text-ink-500 hover:text-ink-700",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      章节课目录
                    </span>
                  </button>
                  <button
                    onClick={() => setLeftTab("knowledge")}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                      leftTab === "knowledge"
                        ? "bg-teal-50 text-teal-800 border-b-2 border-teal-500"
                        : "text-ink-500 hover:text-ink-700",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" />
                      知识点目录
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setDirectoryCollapsed(true)}
                  className="px-3 text-ink-400 hover:text-gold-700 hover:bg-gold-50 transition-colors border-l border-ink-100"
                  title="向左折叠目录"
                  aria-label="向左折叠章节课与知识点目录"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              {/* 搜索 + 树 */}
              <div className="p-3">
                <SearchableTree
                  editable
                  title=""
                  accent={leftTab === "chapter" ? "gold" : "teal"}
                  data={displayTree ?? { id: "root", name: "", type: leftTab === "chapter" ? "chapter" : "knowledge", count: 0, children: [] }}
                  onDataChange={(nextTree) => {
                    if (nextTree.type === "chapter") setChapterTree(nextTree);
                    else setKnowledgeTree(nextTree);
                  }}
                  checkable
                  checkedIds={displayCheckedIds}
                  onCheck={setDisplayCheckedIds}
                  showDoneCount={selectedStudentIds.length > 0}
                  expandLevel={1}
                  searchPlaceholder={leftTab === "chapter" ? "搜索章节..." : "搜索知识点..."}
                  showLogicSelector
                  logic={leftTab === "chapter" ? chapterLogic : knowledgeLogic}
                  onLogicChange={(logic) => {
                    if (leftTab === "chapter") {
                      setChapterLogic(logic);
                    } else {
                      setKnowledgeLogic(logic);
                    }
                  }}
                />
              </div>
          </Card>
        )}
      >
        {/* 右侧：筛选 + 题目列表 */}
        <div>
          {directoryCollapsed && (
            <div className="mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDirectoryCollapsed(false)}
                title="展开目录"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
                展开章节课与知识点目录
              </Button>
            </div>
          )}

          {/* 顶部筛选栏 */}
          <Card className="mb-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* 搜索：可限定题干、解析、总结和备注；未选择时搜索全部 */}
              <div className="flex-1 min-w-[280px] space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                  <input
                    type="text"
                    placeholder="搜索题干、解析、总结、备注..."
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="input-base pl-10"
                    title="未选择搜索范围时，将搜索题干、解析、总结和备注"
                  />
                </div>
                <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  <legend className="sr-only">搜索范围</legend>
                  <span className="text-xs text-ink-500">搜索范围：</span>
                  {searchFieldOptions.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={searchFields.includes(option.value)}
                        onChange={() => toggleSearchField(option.value)}
                        className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                      />
                      {option.label}
                    </label>
                  ))}
                  <span className="text-[11px] text-ink-400">未选择则搜索全部</span>
                </fieldset>
              </div>

              <SelectFilter label="年级" value={selectedGrade} options={gradeOptions} onChange={setSelectedGrade} icon={<GraduationCap className="w-3.5 h-3.5" />} />
              <SelectFilter label="学年" value={selectedYear} options={schoolYearOptions} onChange={setSelectedYear} icon={<Calendar className="w-3.5 h-3.5" />} />
              <SelectFilter label="学期" value={selectedSemester} options={semesterOptions} onChange={setSelectedSemester} icon={<Calendar className="w-3.5 h-3.5" />} />
              <MultiFilter label="题型" values={selectedTypes} options={questionTypeOptions} onToggle={toggleType} icon={<FileQuestion className="w-3.5 h-3.5" />} />
              <MultiFilter label="难度" values={selectedDifficulties.map(String)} options={difficultyOptions.map((d) => ({ value: String(d.value), label: d.label }))} onToggle={(v) => toggleDifficulty(Number(v))} icon={<Layers className="w-3.5 h-3.5" />} />
              <MultiFilter label="来源" values={selectedSources} options={sourceOptions} onToggle={toggleSource} icon={<ListFilter className="w-3.5 h-3.5" />} />
              <MultiFilter label="题类" values={selectedCategories} options={categoryOptions} onToggle={toggleCategory} icon={<Tag className="w-3.5 h-3.5" />} />
              <ToggleFilter label="无章节" checked={noChapter} onChange={setNoChapter} icon={<BookOpen className="w-3.5 h-3.5" />} />
              <ToggleFilter label="无知识点" checked={noKnowledge} onChange={setNoKnowledge} icon={<Lightbulb className="w-3.5 h-3.5" />} />

              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  <X className="w-3.5 h-3.5" />
                  清空筛选
                </Button>
              )}
            </div>

            {mode === "use" && selectedStudentIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-ink-600">
                    已针对 <span className="font-medium text-ink-900">{selectedStudentIds.length} 名学生</span> 优化排序
                  </span>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeDone}
                    onChange={(e) => setExcludeDone(e.target.checked)}
                    className="w-4 h-4 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                  />
                  <span className="text-ink-600">自动排除做过和待做的题目</span>
                </label>
              </div>
            )}

            {mode === "use" && (
              <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-3 flex-wrap">
                <span className="text-xs text-ink-500">显示选项：</span>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showChapter}
                    onChange={(e) => setShowChapter(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                  />
                  <span className="text-ink-600">章节</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showKnowledge}
                    onChange={(e) => setShowKnowledge(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                  />
                  <span className="text-ink-600">知识点</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRemark}
                    onChange={(e) => setShowRemark(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                  />
                  <span className="text-ink-600">备注</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showStudentAnswers}
                    onChange={(e) => setShowStudentAnswers(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                  />
                  <span className="text-ink-600">学生答题情况</span>
                </label>
              </div>
            )}
          </Card>

          {/* 结果计数 + 顶部分页 */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-ink-600">
              共 <span className="font-mono font-semibold text-ink-900">{totalQuestions}</span> 道题目
              {quota && (
                <span className="ml-2 text-xs text-ink-500">
                  · 我的题库容量 {quota.resources.question.used}/{quota.resources.question.capacity}
                  {quota.resources.question.donationBonus > 0
                    ? `（有效捐赠扩容 +${quota.resources.question.donationBonus}）`
                    : ""}
                </span>
              )}
              <span className="ml-2 text-xs text-ink-400">
                {mode === "manage" ? "· 管理模式：点击编辑按钮可精细编辑题目" : "· 使用模式：可加入试题篮"}
              </span>
            </div>
            <TagSettings />
          </div>

          {/* 顶部分页控件 */}
          {!loading && totalQuestions > 0 && (
            <PaginationBar
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              totalItems={totalQuestions}
              pageSize={pageSize}
              pageSizeOptions={pageSizeOptions}
              itemLabel="题"
              onPageChange={handlePageChange}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
          )}

          {/* 题目列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : questions.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileQuestion className="w-7 h-7" />}
                title="未找到匹配的题目"
                description={hasFilter ? "尝试调整筛选条件或清空筛选" : "您还没有题目，可以从导入文档开始"}
                action={
                  hasFilter ? (
                    <Button variant="outline" size="sm" onClick={clearAllFilters}>
                      <X className="w-3.5 h-3.5" />
                      清空筛选
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="space-y-3 animate-fade-in">
              {paginatedQuestions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  mode={mode}
                  chapterMap={chapterMap}
                  knowledgeMap={knowledgeMap}
                  teacher={teacher}
                  students={students}
                  selectedStudentIds={selectedStudentIds}
                  studentAnswerRecords={studentAnswerRecords}
                  pendingQuestionKeys={pendingQuestionKeys}
                  defaultBasket={defaultBasket}
                  showChapter={mode === "use" ? showChapter : undefined}
                  showKnowledge={mode === "use" ? showKnowledge : undefined}
                  showRemark={mode === "use" ? showRemark : undefined}
                  showStudentAnswers={mode === "use" ? showStudentAnswers : showStudentAnswers}
                  isUsedBySelectedStudents={isQuestionUsedBySelectedStudents(q.id)}
                  lecturesUsingQuestion={getLecturesUsingQuestion(q.id)}
                  onView={setDetailQuestion}
                  onEdit={mode === "manage" ? setEditingQuestion : undefined}
                  onAddToBasket={setAddToBasketFor}
                  onQuickAddToDefault={defaultBasket ? handleAddToDefaultBasket : undefined}
                  onRemoveFromDefault={defaultBasket ? handleRemoveFromDefaultBasket : undefined}
                  isInDefaultBasket={defaultBasket?.questionIds?.includes(q.id) || false}
                  onShowUsageDetail={(question) => {
                    setUsageDetailModal({ open: true, question });
                    void loadUsageResources();
                  }}
                  onNavigateToLecture={(lectureId) => openPage(`/lectures/${lectureId}/preview`)}
                  onQuickEdit={setQuickEditQuestion}
                  onShare={setShareQuestion}
                  onAdapt={setAdaptingQuestion}
                  onInsertLinks={setLinksQuestion}
                  onExplanationVideo={setVideoQuestion}
                  onDelete={handleDeleteQuestion}
                  onShowRelated={(type, value, title, desc) =>
                    setRelatedModal({
                      open: true,
                      title,
                      description: desc,
                      filterType: type,
                      filterValue: value,
                    })
                  }
                  onUpdateStudentAnswer={selectedStudentIds.length > 0 ? handleUpdateStudentAnswer : undefined}
                  onDownload={handleDownloadQuestion}
                  onReplace={mode === "manage" ? setReplaceQuestion : undefined}
                  tagOrder={tagPrefs.order}
                  hiddenTags={tagPrefs.hidden}
                  wideLayout={directoryCollapsed}
                  selected={selectedQuestionIds?.has(q.id) || false}
                  donated={donatedQuestionIds?.has(q.id) || false}
                  donationLocked={donationLockedQuestionIds
                    ? donationLockedQuestionIds.has(q.id)
                    : Boolean(q.platformSourceDonationIds?.length)}
                  onToggleSelection={onToggleSelection}
                  getQuestionTypeLabel={getQuestionTypeLabel}
                  getSourceLabel={getSourceLabel}
                  getCategoryLabel={getCategoryLabel}
                />
              ))}
            </div>
          )}

          {/* 底部分页控件 */}
          {!loading && totalQuestions > 0 && (
            <div className="mt-4">
              <PaginationBar
                currentPage={safeCurrentPage}
                totalPages={totalPages}
                totalItems={totalQuestions}
                pageSize={pageSize}
                pageSizeOptions={pageSizeOptions}
                itemLabel="题"
                onPageChange={handlePageChange}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>
      </ResizableSidebarLayout>

      {/* 题目详情 */}
      <Modal
        open={Boolean(detailQuestion)}
        onClose={() => setDetailQuestion(null)}
        size="lg"
        title="题目详情"
      >
        {detailQuestion && <QuestionDetail question={detailQuestion} />}
      </Modal>

      {/* 编辑题目（完整属性编辑） */}
      <Modal
        open={Boolean(editingQuestion)}
        onClose={() => setEditingQuestion(null)}
        size="full"
        title="编辑题目"
        description="修改题目属性、章节、知识点、备注等"
        footer={null}
      >
        {editingQuestion && (
          <QuestionEditor
            question={editingQuestion}
            onSaved={(q) => {
              setEditingQuestion(null);
              setDetailQuestion(q);
              loadQuestions();
            }}
            onCancel={() => setEditingQuestion(null)}
          />
        )}
      </Modal>

      <QuestionAdaptationModal
        open={Boolean(adaptingQuestion)}
        question={adaptingQuestion}
        onClose={() => setAdaptingQuestion(null)}
        onCreated={(created) => {
          setAdaptingQuestion(null);
          setDetailQuestion(created);
          loadQuestions();
        }}
      />

      <QuestionLinksModal
        open={Boolean(linksQuestion)}
        question={linksQuestion}
        onClose={() => setLinksQuestion(null)}
        onSaved={(updated) => {
          setLinksQuestion(null);
          setDetailQuestion((current) => current?.id === updated.id ? updated : current);
          loadQuestions();
        }}
      />

      <QuestionVideoModal
        open={Boolean(videoQuestion)}
        question={videoQuestion}
        teacherId={teacher?.id}
        schoolId={teacher?.schoolId}
        onClose={() => setVideoQuestion(null)}
        onSaved={(updated) => {
          setVideoQuestion(null);
          setDetailQuestion((current) => current?.id === updated.id ? updated : current);
          loadQuestions();
        }}
      />

      {/* 加入试题篮 */}
      <Modal
        open={Boolean(addToBasketFor)}
        onClose={() => setAddToBasketFor(null)}
        size="sm"
        title="加入试题篮"
        description={addToBasketFor ? `题目：${addToBasketFor.stem.slice(0, 40)}...` : undefined}
      >
        <div className="space-y-2">
          {baskets.length === 0 ? (
            <div className="text-center py-6 text-sm text-ink-500">
              您还没有试题篮，请先到试题篮页面创建
            </div>
          ) : (
            baskets.map((b) => (
              <button
                key={b.id}
                onClick={() => addToBasketFor && handleCheckDuplicateAndAdd(addToBasketFor, b.id, selectedStudentIds)}
                className="w-full text-left p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors"
              >
                <div className="text-sm font-medium text-ink-900">{b.name}</div>
                <div className="text-xs text-ink-500 mt-0.5">点击加入此篮</div>
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* 相关题目选择弹窗 */}
      {relatedModal && teacher && (
        <RelatedQuestionsModal
          open={relatedModal.open}
          onClose={() => setRelatedModal(null)}
          title={relatedModal.title}
          description={relatedModal.description}
          filterType={relatedModal.filterType}
          filterValue={relatedModal.filterValue}
          schoolId={teacher.schoolId!}
          onSelect={(q) => setAddToBasketFor(q)}
        />
      )}

      {/* 快速属性编辑弹窗 */}
      <QuickEditModal
        open={Boolean(quickEditQuestion)}
        onClose={() => setQuickEditQuestion(null)}
        question={quickEditQuestion}
        onSaved={(q) => {
          setQuickEditQuestion(null);
          loadQuestions();
        }}
      />

      {/* 分享弹窗 */}
      <ShareModal
        open={Boolean(shareQuestion)}
        onClose={() => setShareQuestion(null)}
        question={shareQuestion}
      />

      {/* 替换题目弹窗 */}
      <Modal
        open={Boolean(replaceQuestion)}
        onClose={() => setReplaceQuestion(null)}
        size="lg"
        title="替换题目"
        description="使用新的题目内容替换当前题目，保留章节、知识点、使用记录等其他属性"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => setReplaceQuestion(null)} disabled={replaceSaving}>
              取消
            </Button>
            <Button variant="gold" size="sm" onClick={handleReplaceQuestion} loading={replaceSaving}>
              <RefreshCw className="w-3.5 h-3.5" />
              确认替换
            </Button>
          </div>
        }
      >
        {replaceQuestion && replaceForm && (
          <div className="space-y-5">
            {/* 当前题干预览 */}
            <div className="p-3 rounded-lg bg-mist/50 border border-ink-100">
              <div className="text-xs font-medium text-ink-500 mb-1">当前题目</div>
              <div className="text-sm text-ink-900 line-clamp-3">{replaceQuestion.stem}</div>
            </div>

            {/* 分割线 */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-ink-100" />
              <span className="text-xs text-ink-400">替换为</span>
              <div className="flex-1 h-px bg-ink-100" />
            </div>

            {/* 题干 */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">题干</label>
              <textarea
                value={replaceForm.stem}
                onChange={(e) => setReplaceForm({ ...replaceForm, stem: e.target.value })}
                className="input-base resize-y min-h-[80px] w-full"
                rows={3}
                placeholder="请输入题干..."
              />
            </div>

            {/* 选项 */}
            {(replaceQuestion.type === "single" || replaceQuestion.type === "multiple") && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-ink-700">选项</label>
                  <button
                    onClick={() => setReplaceForm({ ...replaceForm, options: [...replaceForm.options, ""] })}
                    className="text-xs text-gold-600 hover:text-gold-800 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    添加选项
                  </button>
                </div>
                <div className="space-y-2">
                  {replaceForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 h-6 flex items-center justify-center bg-ink-100 rounded text-xs font-mono font-semibold text-ink-600 flex-shrink-0">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...replaceForm.options];
                          newOptions[i] = e.target.value;
                          setReplaceForm({ ...replaceForm, options: newOptions });
                        }}
                        className="input-base flex-1"
                        placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                      />
                      {replaceForm.options.length > 2 && (
                        <button
                          onClick={() => {
                            const newOptions = replaceForm.options.filter((_, idx) => idx !== i);
                            setReplaceForm({ ...replaceForm, options: newOptions });
                          }}
                          className="p-1.5 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="删除选项"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 答案 */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">答案</label>
              <input
                type="text"
                value={replaceForm.answer}
                onChange={(e) => setReplaceForm({ ...replaceForm, answer: e.target.value })}
                className="input-base w-full"
                placeholder={
                  replaceQuestion.type === "single" || replaceQuestion.type === "multiple"
                    ? "如：A 或 AB"
                    : "请输入答案"
                }
              />
            </div>

            {/* 解析 */}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">解析</label>
              <textarea
                value={replaceForm.analysis}
                onChange={(e) => setReplaceForm({ ...replaceForm, analysis: e.target.value })}
                className="input-base resize-y min-h-[80px] w-full"
                rows={3}
                placeholder="请输入解析..."
              />
            </div>

            {/* 难度和推荐度 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">难度</label>
                <select
                  value={String(replaceForm.difficulty)}
                  onChange={(e) => setReplaceForm({ ...replaceForm, difficulty: Number(e.target.value) })}
                  className="input-base w-full cursor-pointer"
                >
                  {difficultyOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1.5">推荐度</label>
                <select
                  value={String(replaceForm.recommendation)}
                  onChange={(e) => setReplaceForm({ ...replaceForm, recommendation: Number(e.target.value) })}
                  className="input-base w-full cursor-pointer"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} 星
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 学生选择弹窗 */}
      <Modal
        open={showStudentPicker}
        onClose={() => setShowStudentPicker(false)}
        size="lg"
        title="选择学生"
        description="选择学生后，题目将按这些学生的薄弱点优先排序"
        footer={
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" size="sm" onClick={() => setSelectedStudentIds([])}>
              清空选择
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowStudentPicker(false)}>
                取消
              </Button>
              <Button variant="gold" size="sm" onClick={() => setShowStudentPicker(false)}>
                确定（{selectedStudentIds.length} 人）
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs font-medium text-ink-600 mb-2">按班级筛选</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedClassId("")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-all",
                  !selectedClassId
                    ? "bg-gold-400 border-gold-400 text-ink-900"
                    : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                全部学生
              </button>
              {schoolClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    selectedClassId === c.id
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {c.name}
                </button>
              ))}
              {personalClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    selectedClassId === c.id
                      ? "bg-teal-400 border-teal-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-ink-600">
                学生列表（{filteredStudents.length} 人）
              </div>
              <button
                onClick={() => {
                  const ids = filteredStudents.map((s) => s.id);
                  setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...ids])));
                }}
                className="text-xs text-gold-600 hover:text-gold-800"
              >
                全选
              </button>
            </div>
            <div className="max-h-[340px] overflow-y-auto border border-ink-100 rounded-md">
              {filteredStudents.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-400">暂无学生</div>
              ) : (
                <div className="divide-y divide-ink-50">
                  {filteredStudents.map((s) => {
                    const checked = selectedStudentIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() =>
                          setSelectedStudentIds((prev) =>
                            prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                          )
                        }
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors",
                          checked ? "bg-gold-50/50" : "hover:bg-mist",
                        )}
                      >
                        <span
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                            checked ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-300 bg-white",
                          )}
                        >
                          {checked && (
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="currentColor">
                              <path d="M10 3L4.5 8.5 2 6l-.7.7L4.5 9.9 10.7 3.7z" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">{s.name}</div>
                          <div className="text-xs text-ink-400 truncate">
                            学号 {s.studentNo} · {s.grade || "未设置年级"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* 使用次数详情弹窗 */}
      <Modal
        open={Boolean(usageDetailModal?.open)}
        onClose={() => setUsageDetailModal(null)}
        size="md"
        title="题目使用记录"
        description={usageDetailModal ? `该题目已被使用 ${usageDetailModal.question.usageCount} 次` : undefined}
      >
        {usageDetailModal && (
          <div className="space-y-3">
            {usageResourcesLoading && !usageResourcesLoaded ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : (() => {
              const usingLectures = getLecturesUsingQuestion(usageDetailModal.question.id);
              const usingExamPapers = getExamPapersUsingQuestion(usageDetailModal.question.id);
              const usingResources = [
                ...usingLectures.map((resource) => ({ type: "lecture" as const, resource })),
                ...usingExamPapers.map((resource) => ({ type: "examPaper" as const, resource })),
              ].sort((a, b) =>
                new Date(b.resource.updatedAt).getTime() - new Date(a.resource.updatedAt).getTime(),
              );
              if (usingResources.length === 0) {
                return (
                  <div className="py-8 text-center text-sm text-ink-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-ink-300" />
                    暂无讲义或试卷使用此题目
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-ink-500 mb-2">
                    共 {usingResources.length} 个讲义/试卷使用了此题目：
                  </div>
                  {usingResources.map(({ type, resource }) => (
                    <div
                      key={`${type}:${resource.id}`}
                      className="flex items-center justify-between p-3 rounded-md border border-ink-200 hover:border-gold-300 hover:bg-gold-50/30 transition-all group"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-ink-900 truncate">
                            {resource.title}
                            <span className="ml-2 text-[10px] font-normal text-ink-400">
                              {type === "lecture" ? "讲义" : "试卷"}
                            </span>
                          </div>
                          <div className="text-xs text-ink-500 mt-0.5">
                            {resource.grade} · {resource.schoolYear} ·
                            <span className={cn(
                              "ml-1 px-1.5 py-0.5 rounded text-[10px]",
                              resource.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            )}>
                              {resource.status === "published" ? "已发布" : "草稿"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setUsageDetailModal(null);
                          openPage(
                            type === "lecture"
                              ? `/lectures/${resource.id}/preview`
                              : `/exam-papers/${resource.id}/preview`,
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-gold-700 hover:bg-gold-100 transition-colors flex-shrink-0 ml-3"
                        title={`进入${type === "lecture" ? "讲义" : "试卷"}预览`}
                      >
                        预览
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* 查重弹窗 */}
      <Modal
        open={Boolean(duplicateModal?.open)}
        onClose={() => setDuplicateModal(null)}
        size="lg"
        title="检测到相似题目"
        description="该题目与您题库中已有题目相似，请选择处理方式"
      >
        {duplicateModal && (
          <div className="space-y-4">
            {/* 新题目预览 */}
            <div className="p-3 rounded-md bg-gold-50/50 border border-gold-200">
              <div className="text-xs font-medium text-gold-800 mb-1">待添加题目</div>
              <div className="text-sm text-ink-900">{duplicateModal.question.stem}</div>
            </div>

            {/* 相似题目列表 */}
            <div>
              <div className="text-xs font-medium text-ink-500 mb-2">您题库中的相似题目：</div>
              <div className="space-y-2">
                {duplicateModal.similarQuestions.map((sq) => (
                  <div
                    key={sq.id}
                    className="p-3 rounded-md border border-ink-200 hover:border-gold-300 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm text-ink-900">{sq.stem}</div>
                        <div className="text-xs text-ink-500 mt-1">
                          使用次数：{sq.usageCount} · 难度：{difficultyLabel[sq.difficulty]}
                        </div>
                      </div>
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => handleMergeQuestion(sq.id)}
                        className="ml-3"
                      >
                        合并到此题
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDuplicateModal(null)}>
                取消
              </Button>
              <Button variant="gold" onClick={handleAddAsNew}>
                作为新题添加
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SelectFilter({
  label, value, options, onChange, icon,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
          value
            ? "bg-gold-50 border-gold-200 text-gold-800"
            : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
        )}
      >
        {icon}
        <span>{label}</span>
        {value && <span className="font-medium">· {options.find((o) => o.value === value)?.label}</span>}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-40 bg-paper border border-ink-100 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-sm hover:bg-mist transition-colors",
                !value && "text-gold-700 font-medium",
              )}
            >
              全部
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-mist transition-colors",
                  value === o.value && "text-gold-700 font-medium",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MultiFilter({
  label, values, options, onToggle, icon,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onToggle: (v: string) => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
          values.length > 0
            ? "bg-ink-50 border-ink-300 text-ink-800"
            : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
        )}
      >
        {icon}
        <span>{label}</span>
        {values.length > 0 && (
          <span className="px-1.5 py-0.5 bg-ink-900 text-paper rounded text-xs font-medium">
            {values.length}
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-36 bg-paper border border-ink-100 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
            {options.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  onClick={() => onToggle(o.value)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-mist transition-colors text-left"
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0",
                      checked ? "bg-gold-400 border-gold-400 text-ink-900" : "border-ink-300 bg-white",
                    )}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="currentColor">
                        <path d="M10 3L4.5 8.5 2 6l-.7.7L4.5 9.9 10.7 3.7z" />
                      </svg>
                    )}
                  </span>
                  <span className={cn(checked ? "text-ink-900 font-medium" : "text-ink-600")}>
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ToggleFilter({
  label, checked, onChange, icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all",
        checked
          ? "bg-gold-50 border-gold-300 text-gold-800"
          : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function QuestionRow({
  question, mode, chapterMap, knowledgeMap, teacher,
  students, selectedStudentIds, studentAnswerRecords, pendingQuestionKeys,
  defaultBasket, showChapter, showKnowledge, showRemark, showStudentAnswers,
  isUsedBySelectedStudents, lecturesUsingQuestion,
  onView, onEdit, onAddToBasket, onQuickAddToDefault, onRemoveFromDefault, isInDefaultBasket,
  onShowUsageDetail, onNavigateToLecture,
  onQuickEdit, onShare, onAdapt, onInsertLinks, onExplanationVideo, onDelete, onShowRelated,
  onDownload, onReplace, onUpdateStudentAnswer,
  tagOrder,
  hiddenTags,
  wideLayout,
  selected,
  donated,
  donationLocked,
  onToggleSelection,
  getQuestionTypeLabel,
  getSourceLabel,
  getCategoryLabel,
}: {
  question: Question;
  mode: Mode;
  chapterMap: Map<string, string>;
  knowledgeMap: Map<string, string>;
  teacher: any;
  students: Student[];
  selectedStudentIds: string[];
  studentAnswerRecords: AnswerRecord[];
  pendingQuestionKeys: Set<string>;
  defaultBasket?: { id: string; name: string; isDefault?: boolean; questionIds?: string[] } | undefined;
  showChapter?: boolean;
  showKnowledge?: boolean;
  showRemark?: boolean;
  showStudentAnswers?: boolean;
  isUsedBySelectedStudents: boolean;
  lecturesUsingQuestion: Lecture[];
  onView: (q: Question) => void;
  onEdit?: (q: Question) => void;
  onAddToBasket: (q: Question) => void;
  onQuickAddToDefault?: (q: Question) => void;
  onRemoveFromDefault?: (q: Question) => void;
  isInDefaultBasket?: boolean;
  onShowUsageDetail: (q: Question) => void;
  onNavigateToLecture: (lectureId: string) => void;
  onQuickEdit: (q: Question) => void;
  onShare: (q: Question) => void;
  onAdapt: (q: Question) => void;
  onInsertLinks: (q: Question) => void;
  onExplanationVideo: (q: Question) => void;
  onDelete: (q: Question) => void;
  onShowRelated: (type: "chapter" | "knowledge" | "keyword", value: string, title: string, desc?: string) => void;
  onDownload: (q: Question) => void;
  onReplace?: (q: Question) => void;
  onUpdateStudentAnswer?: (studentId: string, questionId: string, score: AnswerScore | null) => void;
  tagOrder: string[];
  hiddenTags: string[];
  wideLayout?: boolean;
  selected?: boolean;
  donated?: boolean;
  donationLocked?: boolean;
  onToggleSelection?: (q: Question) => void;
  getQuestionTypeLabel: (type: Question["type"]) => string;
  getSourceLabel: (value?: string) => string;
  getCategoryLabel: (value?: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingAnswers, setEditingAnswers] = useState(false);
  const chapterNames = question.chapterIds.map((id) => chapterMap.get(id)).filter(Boolean) as string[];
  const pointNames = question.knowledgePointIds.map((id) => knowledgeMap.get(id)).filter(Boolean) as string[];
  const hasChapter = chapterNames.length > 0;
  const hasPoint = pointNames.length > 0;

  // 选中学生的答题情况：取该题对应的答题记录，按学生维度展示
  const questionStudentAnswers = useMemo(() => {
    if (mode !== "use" || selectedStudentIds.length === 0) return [];
    return selectedStudentIds.map((sid) => {
      const student = students.find((s) => s.id === sid);
      const record = studentAnswerRecords.find(
        (r) => r.studentId === sid && r.questionId === question.id,
      );
      const score = record ? inferScore(record) : null;
      const pending = !record && pendingQuestionKeys.has(`${sid}:${question.id}`);
      return { student, record, score, pending };
    });
  }, [mode, selectedStudentIds, students, studentAnswerRecords, pendingQuestionKeys, question.id]);

  // 管理模式：只有点击题干/选项区域才展开，其他区域不触发
  const handleStemClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    // 使用模式：整张卡片点击展开；管理模式：只有题干区域点击才展开
    if (mode === "use") {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      className={cn(
        "card-base hover:shadow-cardHover transition-all group",
        wideLayout ? "p-5" : "p-4",
        expanded && "ring-2 ring-gold-300/60",
        selected && "bg-gold-50/20",
      )}
      onClick={handleCardClick}
    >
      <div className="flex items-start gap-4 cursor-pointer">
        {onToggleSelection && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelection(question);
            }}
            className={cn(
              "mt-0.5 flex-shrink-0 rounded p-0.5 transition-colors",
              selected ? "text-gold-600" : "text-ink-300 hover:text-gold-600",
            )}
            title={selected ? "取消选择" : "选择资源"}
          >
            {selected
              ? <CheckSquare className="w-4 h-4" />
              : <Square className="w-4 h-4" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          {/* 选中学生的答题情况（显示在题目上方，可折叠，支持编辑） */}
          {questionStudentAnswers.length > 0 && showStudentAnswers !== false && (
            <div className="mb-2.5 p-2 rounded-md bg-mist/60 border border-ink-100">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Users className="w-3 h-3 text-ink-500" />
                <span className="text-[11px] font-medium text-ink-500">学生答题情况</span>
                <span className="text-[10px] text-ink-400">
                  （{questionStudentAnswers.filter((a) => a.score).length}/{questionStudentAnswers.length} 已答）
                </span>
                {onUpdateStudentAnswer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAnswers(!editingAnswers);
                    }}
                    className="ml-auto text-[10px] text-gold-600 hover:text-gold-700 font-medium"
                  >
                    {editingAnswers ? "完成" : "编辑"}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {questionStudentAnswers.map(({ student, score, pending }) => {
                  const name = student?.name || "未知学生";
                  const studentId = student?.id;
                  if (editingAnswers && onUpdateStudentAnswer && studentId) {
                    const options: Array<{ value: AnswerScore | null; label: string; cls: string }> = [
                      { value: null, label: pending ? "待做" : "未做", cls: "bg-ink-100 text-ink-500 border-ink-200" },
                      { value: "done", label: "已做", cls: "bg-teal-50 text-teal-700 border-teal-200" },
                      { value: "correct", label: "全对", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                      { value: "partial", label: "半对", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                      { value: "wrong", label: "做错", cls: "bg-red-50 text-red-700 border-red-200" },
                    ];
                    return (
                      <div
                        key={studentId}
                        className="flex flex-col gap-1 p-1.5 rounded border border-ink-200 bg-paper"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-[10px] font-medium text-ink-700 px-1">{name}</span>
                        <div className="flex gap-0.5">
                          {options.map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => onUpdateStudentAnswer(studentId, question.id, opt.value)}
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] border transition-colors",
                                score === opt.value
                                  ? opt.cls + " font-semibold"
                                  : "bg-white text-ink-400 border-ink-100 hover:border-ink-300",
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (!score) {
                    return (
                      <span
                        key={student?.id || name}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px]",
                          pending
                            ? "bg-sky-50 text-sky-700 border border-sky-200"
                            : "bg-ink-100 text-ink-500",
                        )}
                        title={pending ? "待做" : "未作答"}
                      >
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          pending ? "bg-sky-500" : "bg-ink-300",
                        )} />
                        {name}
                        <span className="opacity-70">{pending ? "待做" : "未做"}</span>
                      </span>
                    );
                  }
                  const config = {
                    done: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", dot: "bg-teal-500", label: "已做" },
                    correct: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", label: "全对" },
                    partial: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500", label: "半对" },
                    wrong: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500", label: "做错" },
                  }[score];
                  return (
                    <span
                      key={student?.id || name}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border",
                        config.bg, config.text, config.border,
                      )}
                      title={`${name}：${config.label}`}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
                      {name}
                      <span className="opacity-80">{config.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 标签行 */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {isUsedBySelectedStudents && (
              <Badge variant="gold">
                <CheckCircle2 className="w-3 h-3 mr-0.5" />
                已选用
              </Badge>
            )}
            {(question.board || question.boardImages?.length) && (
              <Badge variant="gold" className="bg-sky-50 text-sky-700 border-sky-200">
                <NotebookPen className="w-3 h-3 mr-0.5" />
                有板书
              </Badge>
            )}
            {tagOrder.filter((key) => !hiddenTags.includes(key)).map((key) => {
              switch (key) {
                case "type":
                  return <Badge key="type" variant="ink">{getQuestionTypeLabel(question.type)}</Badge>;
                case "difficulty":
                  return (
                    <Badge
                      key="difficulty"
                      variant={
                        question.difficulty <= 2 ? "green" : question.difficulty <= 3 ? "amber" : "red"
                      }
                    >
                      {difficultyLabel[question.difficulty]}
                    </Badge>
                  );
                case "recommendation":
                  return question.recommendation >= 4 ? (
                    <Badge key="recommendation" variant="gold">推荐 {question.recommendation}</Badge>
                  ) : null;
                case "remark":
                  return (question.remarks && question.remarks.length > 0) || question.remark ? (
                    <Badge key="remark" variant="gold" className="bg-gold-50 text-gold-700 border-gold-200">
                      <FileText className="w-3 h-3 mr-0.5" />
                      备注 {question.remarks?.length || (question.remark ? 1 : 0)}
                    </Badge>
                  ) : null;
                case "source":
                  return question.sourceType ? (
                    <span key="source" className="text-xs text-ink-400">
                      来源：{getSourceLabel(question.sourceType)}
                    </span>
                  ) : null;
                case "category":
                  return question.category ? (
                    <span key="category" className="text-xs text-ink-400">
                      · {getCategoryLabel(question.category)}
                    </span>
                  ) : null;
                case "grade":
                  return question.grade ? (
                    <span key="grade" className="text-xs text-ink-400">· {question.grade}</span>
                  ) : null;
                case "schoolYear":
                  return question.schoolYear ? (
                    <span key="schoolYear" className="text-xs text-ink-400">· {question.schoolYear}</span>
                  ) : null;
                case "usage":
                  return (
                    <button
                      key="usage"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowUsageDetail(question);
                      }}
                      className="ml-auto text-xs text-ink-400 hover:text-gold-600 flex items-center gap-1 cursor-pointer transition-colors"
                      title="点击查看使用此题目的试卷和讲义"
                    >
                      使用 {question.usageCount} 次
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")} />
                    </button>
                  );
                default:
                  return null;
              }
            })}
          </div>

          {/* 题干+选项区域（管理模式下点击此区域才展开答案） */}
          <div
            className={mode === "manage" ? "cursor-pointer" : undefined}
            onClick={mode === "manage" ? handleStemClick : undefined}
          >
            {/* 题干 */}
            <div className={cn(
              "text-ink-900 leading-relaxed mb-2",
              wideLayout ? "text-base" : "text-sm",
            )}>
              <MathHtml className="whitespace-pre-wrap">{question.stem}</MathHtml>
            </div>

            {/* 选项（网格布局，根据选项长度动态调整列数；答案高亮仅在展开时显示） */}
            {question.options && question.options.length > 0 && (() => {
              const gridCols = getQuestionOptionGridColumns(question.options);
              return (
                <div className={cn(
                  "mb-2 grid gap-x-4 gap-y-1.5 text-ink-700",
                  wideLayout ? "text-sm" : "text-xs",
                  gridCols,
                )}>
                  {question.options.map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-start gap-1",
                        expanded && question.answer.includes(String.fromCharCode(65 + i)) && "text-emerald-700 font-medium"
                      )}
                    >
                      <span className="font-mono font-semibold flex-shrink-0">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <MathHtml className="min-w-0 break-all">{opt}</MathHtml>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* 展开时显示答案、解析与总结，选项已在上方常驻显示 */}
          {expanded && (
            <QuestionExpandedDetails question={question} wideLayout={wideLayout} />
          )}

          {/* 章节与知识点（可点击，使用模式下可隐藏） */}
          {(showChapter !== false || showKnowledge !== false) && (
            <div className="flex items-start gap-3 mb-2 flex-wrap">
              {showChapter !== false && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <BookOpen className="w-3 h-3 text-gold-500 flex-shrink-0 mt-0.5" />
                  {hasChapter ? (
                    chapterNames.map((n) => (
                      <button
                        key={n}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowRelated("chapter", question.chapterIds.find((id) => chapterMap.get(id) === n) || "", `章节：${n}`, `查看同章节「${n}」下的所有题目`);
                        }}
                        className="tag-gold text-xs py-0.5 cursor-pointer hover:bg-gold-200 transition-colors"
                        title="点击查看同章节题目"
                      >
                        {n}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickEdit(question);
                      }}
                      className="text-xs text-ink-400 italic hover:text-gold-600 cursor-pointer"
                      title="点击编辑章节"
                    >
                      未关联章节
                    </button>
                  )}
                </div>
              )}
              {showKnowledge !== false && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Lightbulb className="w-3 h-3 text-teal-500 flex-shrink-0 mt-0.5" />
                  {hasPoint ? (
                    pointNames.map((n) => (
                      <button
                        key={n}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowRelated("knowledge", question.knowledgePointIds.find((id) => knowledgeMap.get(id) === n) || "", `知识点：${n}`, `查看同知识点「${n}」下的所有题目`);
                        }}
                        className="tag-teal text-xs py-0.5 cursor-pointer hover:bg-teal-200 transition-colors"
                        title="点击查看同知识点题目"
                      >
                        {n}
                      </button>
                    ))
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickEdit(question);
                      }}
                      className="text-xs text-ink-400 italic hover:text-teal-600 cursor-pointer"
                      title="点击编辑知识点"
                    >
                      未关联知识点
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 备注（可点击，使用模式下可隐藏） */}
          {showRemark !== false && ((question.remarks && question.remarks.length > 0) || question.remark) ? (
            <div className="space-y-1.5">
              {(question.remarks || []).length > 0 ? (
                question.remarks!.slice(0, 2).map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-1.5 text-xs text-ink-600 bg-gold-50/50 px-2 py-1.5 rounded border border-gold-100"
                  >
                    <span className="text-gold-600 font-medium flex-shrink-0">备注：</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.content}</div>
                      <div className="text-[10px] text-ink-400 mt-0.5">
                        {new Date(r.updatedAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-start gap-1.5 text-xs text-ink-600 bg-gold-50/50 px-2 py-1.5 rounded border border-gold-100">
                  <span className="text-gold-600 font-medium flex-shrink-0">备注：</span>
                  <span className="truncate flex-1">{question.remark}</span>
                </div>
              )}
              {(question.remarks?.length || 0) > 2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickEdit(question);
                  }}
                  className="text-[11px] text-ink-400 pl-2 hover:text-gold-600"
                >
                  还有 {question.remarks!.length - 2} 条备注，点击查看全部
                </button>
              )}
            </div>
          ) : (
            showRemark !== false && mode === "manage" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickEdit(question);
                }}
                className="text-xs text-ink-400 italic hover:text-gold-600 cursor-pointer"
                title="点击添加备注"
              >
                + 添加备注
              </button>
            )
          )}

          {/* 底部操作菜单 */}
          <div className="mt-3 pt-2 border-t border-ink-50">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* 左侧：添加到资源篮（固定显示，不参与折叠） */}
              <div className="flex items-center gap-1.5">
                {defaultBasket ? (
                  <div className="flex items-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isInDefaultBasket && onRemoveFromDefault) {
                          onRemoveFromDefault(question);
                        } else if (!isInDefaultBasket && onQuickAddToDefault) {
                          onQuickAddToDefault(question);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-l-md text-xs font-medium transition-colors border",
                        isInDefaultBasket
                          ? "bg-gold-50 text-gold-700 border-gold-200 hover:bg-gold-100"
                          : "bg-gold-500 text-white border-gold-500 hover:bg-gold-600"
                      )}
                      title={isInDefaultBasket ? `已在默认资源篮「${defaultBasket?.name || ""}」，点击移除` : `添加到默认资源篮「${defaultBasket?.name || ""}」`}
                    >
                      <ShoppingBasket className="w-3.5 h-3.5" />
                      {isInDefaultBasket ? "已加入" : "添加到默认"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToBasket(question);
                      }}
                      className={cn(
                        "px-2 py-1.5 rounded-r-md text-xs border border-l-0 transition-colors",
                        isInDefaultBasket
                          ? "bg-gold-50 text-gold-700 border-gold-200 hover:bg-gold-100"
                          : "bg-gold-500 text-white border-gold-500 hover:bg-gold-600"
                      )}
                      title="选择其他资源篮"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToBasket(question);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-gold-500 text-white hover:bg-gold-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加到默认
                  </button>
                )}
              </div>

              {/* 右侧：其他操作按钮（可折叠） */}
              <QuestionActionsBar
                question={question}
                actions={[
                  {
                    key: "edit",
                    label: "完整编辑",
                    icon: <Edit3 className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onEdit?.(question),
                  },
                  {
                    key: "adapt",
                    label: "题目改编",
                    icon: <WandSparkles className="w-3.5 h-3.5" />,
                    variant: "gold",
                    onClick: () => onAdapt(question),
                  },
                  {
                    key: "links",
                    label: "插入链接",
                    icon: <Link2 className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onInsertLinks(question),
                  },
                  {
                    key: "video",
                    label: "讲解视频",
                    icon: <Video className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onExplanationVideo(question),
                  },
                  {
                    key: "download",
                    label: "下载题目",
                    icon: <Download className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onDownload(question),
                  },
                  {
                    key: "replace",
                    label: "替换题目",
                    icon: <RefreshCw className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onReplace?.(question),
                  },
                  {
                    key: "share",
                    label: "分享题目",
                    icon: <Share2 className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onShare(question),
                  },
                  {
                    key: "quickEdit",
                    label: "调整属性",
                    icon: <Edit3 className="w-3.5 h-3.5" />,
                    variant: "ghost",
                    onClick: () => onQuickEdit(question),
                  },
                  {
                    key: "delete",
                    label: "删除题目",
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                    variant: "danger",
                    onClick: () => onDelete(question),
                  },
                ]}
              />
            </div>
          </div>
        </div>
        {donated && (
          <div className="flex-shrink-0">
            <Badge variant="teal">已捐赠</Badge>
          </div>
        )}
        {donationLocked && (
          <div className="flex-shrink-0">
            <Badge variant="ink">平台副本</Badge>
          </div>
        )}
      </div>
    </div>
  );
}
