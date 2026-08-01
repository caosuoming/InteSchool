import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  Search, FileQuestion, BookOpen, Lightbulb,
  Calendar, Eye, Presentation, FileBox,
  ArrowUpDown, Clock, ChevronDown, ChevronRight,
  FileSpreadsheet, Sparkles, Trash2, Share2, Upload, Filter, Library, FileText,
  PlayCircle, Copy, MessageSquareText, Star,
  ShoppingCart, CheckSquare, Square, Plus, X,
  Layout,
  Gift, Users, Pencil, Check,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { questionService } from "@/services/question";
import { examPaperService } from "@/services/examPaper";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { lectureService } from "@/services/lecture";
import { shareService } from "@/services/share";
import { donationService } from "@/services/donation";
import { knowledgeService } from "@/services/knowledge";
import { reflectionService } from "@/services/reflection";
import { basketService } from "@/services/basket";
import { classService } from "@/services/class";
import { analyticsService, type KnowledgeMastery } from "@/services/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Textarea, Input } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type {
  Lecture, ExamPaper, Courseware, Material, Question,
  TreeNode, FilterLogic, ShareScope,
  CoursewareType, MaterialType, ShareableResourceType,
  Reflection, Basket, AnyClass, Student, AnswerRecord,
  DonationCheckResult, DonationDecision, DonationItem, PlatformDonation, ResourceSemester,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { genId } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import QuestionBankPage from "@/pages/question-bank/QuestionBankPage";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { ExtractReviewModal } from "@/components/extract/ExtractReviewModal";
import { DocumentDownloadButton } from "@/components/resource/DocumentDownloadButton";
import { Badge } from "@/components/ui/Badge";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import { MathHtml } from "@/components/ui/MathHtml";
import { BasketAudiencePicker } from "@/components/basket/BasketAudiencePicker";
import {
  basketAudienceLabel,
  resolveBasketAudienceStudentIds,
  treeNameMap,
} from "@/lib/basket-audience";
import {
  appendUniqueIds,
  batchResourceKey,
  parseBatchResourceKey,
  type BatchResourceRef,
} from "@/pages/resources/batch-resource";

type MyResourceTab = "question" | "examPaper" | "lecture" | "courseware" | "material" | "basket";
type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "title";

interface MyResourcesPageProps {
  initialTab?: MyResourceTab;
}

const tabConfig: { key: MyResourceTab; label: string; icon: typeof FileText; description: string }[] = [
  { key: "question", label: "题库", icon: FileQuestion, description: "管理我的题目，支持查重和分享" },
  { key: "examPaper", label: "试卷库", icon: FileSpreadsheet, description: "管理试卷，支持拆解入题库" },
  { key: "lecture", label: "讲义库", icon: FileText, description: "管理和创建教学讲义" },
  { key: "courseware", label: "课件库", icon: Presentation, description: "管理课件资源，可在生成讲义时引用" },
  { key: "material", label: "素材库", icon: FileBox, description: "管理教学素材，可在生成讲义时引用" },
  { key: "basket", label: "资源篮", icon: ShoppingCart, description: "管理资源篮，快速将题目和素材生成讲义或试卷" },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "updated", label: "最近更新", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "created", label: "创建时间", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

const masteryPresentation: Record<
  KnowledgeMastery["masteryLevel"],
  { label: string; className: string }
> = {
  mastered: { label: "已掌握", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  basic: { label: "基本掌握", className: "border-amber-200 bg-amber-50 text-amber-700" },
  weak: { label: "薄弱", className: "border-red-200 bg-red-50 text-red-700" },
  untrained: { label: "未训练", className: "border-ink-100 bg-mist text-ink-500" },
};

function usageDateLabels(records: AnswerRecord[]): string[] {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Array.from(new Set(records.map((record) => formatter.format(new Date(record.answeredAt)))));
}

const coursewareTypeLabel: Record<CoursewareType, string> = {
  ppt: "PPT",
  ggb: "GeoGebra",
  pdf: "PDF",
  video: "视频",
  image: "图片",
  other: "其他",
};

const materialTypeLabel: Record<MaterialType, string> = {
  text: "文本",
  image: "图片",
  audio: "音频",
  video: "视频",
  link: "链接",
  file: "文件",
  knowledgeBlock: "知识块",
};

interface OriginalFileRowProps {
  fileUrl: string;
  fileName?: string;
  icon: typeof FileText;
  onView: () => void;
}

export function OriginalFileRow({
  fileUrl,
  fileName,
  icon: FileIcon,
  onView,
}: OriginalFileRowProps) {
  const displayName = fileName || "原稿文件";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg bg-ink-50/60 px-3 py-2 text-sm">
      <FileIcon className="h-4 w-4 flex-shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1 truncate text-ink-600" title={displayName}>
        {displayName}
      </span>
      <div className="flex flex-shrink-0 items-center gap-3 text-xs">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-ink-600 transition-colors hover:text-ink-900"
          onClick={onView}
        >
          <Eye className="h-3.5 w-3.5" />
          查看
        </button>
        <DocumentDownloadButton
          fileUrl={fileUrl}
          fileName={fileName}
          className="text-gold-600 transition-colors hover:text-gold-700"
          iconClassName="h-3.5 w-3.5"
        />
      </div>
    </div>
  );
}

export default function MyResourcesPage({ initialTab = "question" }: MyResourcesPageProps) {
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [activeTab, setActiveTab] = useState<MyResourceTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [leftTab, setLeftTab] = useState<LeftTab>("chapter");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");

  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [examPapers, setExamPapers] = useState<ExamPaper[]>([]);
  const [coursewares, setCoursewares] = useState<Courseware[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // 所有试卷/讲义（含拆解副本），用于查找源资源的拆解副本
  const [allExamPapers, setAllExamPapers] = useState<ExamPaper[]>([]);
  const [allLectures, setAllLectures] = useState<Lecture[]>([]);

  // 展开的题目 ID
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());

  // 分享弹窗
  const [shareTarget, setShareTarget] = useState<{
    resourceType: ShareableResourceType;
    resourceId: string;
    resourceTitle: string;
  } | null>(null);
  const [shareScope, setShareScope] = useState<ShareScope>("school");
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);

  // 批量操作选择可跨资源类型和 Tab 保留。
  const [resourceSelections, setResourceSelections] = useState<Set<string>>(new Set());
  const [teacherDonations, setTeacherDonations] = useState<PlatformDonation[]>([]);
  const [pendingDonationItems, setPendingDonationItems] = useState<DonationItem[]>([]);
  const [donationCheck, setDonationCheck] = useState<DonationCheckResult | null>(null);
  const [donationDecisions, setDonationDecisions] = useState<Record<string, DonationDecision>>({});
  const [donating, setDonating] = useState(false);
  const [batchWorking, setBatchWorking] = useState(false);
  const [batchDirectoryMode, setBatchDirectoryMode] = useState<"chapter" | "knowledge" | null>(null);
  const [batchDirectoryIds, setBatchDirectoryIds] = useState<string[]>([]);
  const [batchShareLink, setBatchShareLink] = useState("");
  const [batchShareCount, setBatchShareCount] = useState(0);
  const [resourceRefreshToken, setResourceRefreshToken] = useState(0);

  // 课后反思相关：targetId -> 反思列表
  const [reflectionsMap, setReflectionsMap] = useState<Record<string, Reflection[]>>({});
  const [viewingReflections, setViewingReflections] = useState<{
    title: string;
    list: Reflection[];
  } | null>(null);

  // 创建副本弹窗
  const [duplicateTarget, setDuplicateTarget] = useState<{
    type: "examPaper" | "lecture" | "courseware";
    id: string;
    originalTitle: string;
  } | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  // AI 拆解弹窗
  const [extractModal, setExtractModal] = useState<{
    open: boolean;
    resourceId: string;
    resourceType: "examPaper" | "lecture";
    resourceTitle: string;
    chapterIds: string[];
    knowledgePointIds: string[];
    grade: string;
    schoolYear: string;
    semester: ResourceSemester;
  } | null>(null);

  const handleOpenExtract = (resource: ExamPaper | Lecture, type: "examPaper" | "lecture") => {
    setExtractModal({
      open: true,
      resourceId: resource.id,
      resourceType: type,
      resourceTitle: resource.title,
      chapterIds: resource.chapterIds,
      knowledgePointIds: resource.knowledgePointIds,
      grade: resource.grade,
      schoolYear: resource.schoolYear,
      semester: resource.semester || "上学期",
    });
  };

  const handleExtractConfirmed = () => {
    setExtractModal(null);
    // 刷新列表
    loadAll();
  };

  // 资源篮相关状态
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selectedBasketId, setSelectedBasketId] = useState<string | null>(null);
  const [basketQuestions, setBasketQuestions] = useState<Question[]>([]);
  const [basketMaterials, setBasketMaterials] = useState<Material[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [expandedBasketQuestionIds, setExpandedBasketQuestionIds] = useState<Set<string>>(new Set());
  const [excludedBasketQuestionTypes, setExcludedBasketQuestionTypes] = useState<Set<string>>(new Set());
  const [creatingBasket, setCreatingBasket] = useState(false);
  const [isCreatingBasket, setIsCreatingBasket] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");
  const [newBasketClassIds, setNewBasketClassIds] = useState<string[]>([]);
  const [newBasketStudentIds, setNewBasketStudentIds] = useState<string[]>([]);
  const [audienceClasses, setAudienceClasses] = useState<AnyClass[]>([]);
  const [audienceStudents, setAudienceStudents] = useState<Student[]>([]);
  const [editingBasketAudience, setEditingBasketAudience] = useState(false);
  const [savingBasketAudience, setSavingBasketAudience] = useState(false);
  const [draftBasketClassIds, setDraftBasketClassIds] = useState<string[]>([]);
  const [draftBasketStudentIds, setDraftBasketStudentIds] = useState<string[]>([]);
  const [basketAnswerRecords, setBasketAnswerRecords] = useState<AnswerRecord[]>([]);
  const [basketMastery, setBasketMastery] = useState<KnowledgeMastery[]>([]);
  const [basketInsightsLoading, setBasketInsightsLoading] = useState(false);

  const schoolId = teacher?.schoolId || "sch-1";
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear, defaultSemester } = useSchoolResourceOptions(schoolId);
  const questionTypeConfig = useQuestionTypeOptions(schoolId);
  const getQuestionTypeLabel = questionTypeConfig.getLabel;
  const questionTypeOptions = questionTypeConfig.options ?? [];
  const selectedBasket = useMemo(
    () => baskets.find((basket) => basket.id === selectedBasketId) || null,
    [baskets, selectedBasketId],
  );
  const basketAudienceStudentIds = useMemo(
    () => selectedBasket
      ? resolveBasketAudienceStudentIds(selectedBasket, audienceClasses, audienceStudents)
      : [],
    [selectedBasket, audienceClasses, audienceStudents],
  );
  const knowledgeNameMap = useMemo(() => treeNameMap(knowledgeTree), [knowledgeTree]);
  const basketMasteryMap = useMemo(
    () => new Map(basketMastery.map((item) => [item.knowledgePointId, item])),
    [basketMastery],
  );
  const answerRecordsByQuestion = useMemo(() => {
    const result = new Map<string, AnswerRecord[]>();
    basketAnswerRecords.forEach((record) => {
      const current = result.get(record.questionId) || [];
      current.push(record);
      result.set(record.questionId, current);
    });
    result.forEach((records) => records.sort(
      (a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime(),
    ));
    return result;
  }, [basketAnswerRecords]);
  const visibleBasketQuestions = useMemo(
    () => basketQuestions.filter((question) => !excludedBasketQuestionTypes.has(question.type)),
    [basketQuestions, excludedBasketQuestionTypes],
  );
  const allVisibleQuestionsSelected = visibleBasketQuestions.length > 0
    && visibleBasketQuestions.every((question) => selectedQuestionIds.has(question.id));

  const loadTeacherDonations = useCallback(async () => {
    if (!teacher) return;
    const records = await donationService.listTeacherDonations(teacher.id);
    setTeacherDonations(records);
  }, [teacher]);

  useEffect(() => {
    loadTeacherDonations().catch(() => setTeacherDonations([]));
  }, [loadTeacherDonations]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const baseFilter = {
      keyword,
      chapterIds: checkedChapters,
      chapterLogic,
      knowledgePointIds: checkedKnowledge,
      knowledgeLogic,
      schoolId,
      grade: selectedGrade || undefined,
      schoolYear: selectedYear || undefined,
      semester: (selectedSemester || undefined) as ResourceSemester | undefined,
    };
    try {
      const [qData, lecData, examData, cwData, matData] = await Promise.all([
        questionService.listQuestions({ ...baseFilter, teacherId: teacher?.id }),
        lectureService.listLectures({ ...baseFilter, teacherId: teacher?.id }),
        examPaperService.listPapers({ ...baseFilter, teacherId: teacher?.id }),
        coursewareService.listCoursewares({ ...baseFilter, teacherId: teacher?.id }),
        materialService.listMaterials({ ...baseFilter, teacherId: teacher?.id }),
      ]);
      const safeQuestions = qData || [];
      const safeLectures = lecData || [];
      const safeExamPapers = examData || [];
      const safeCoursewares = cwData || [];
      const safeMaterials = matData || [];
      setQuestions(safeQuestions);
      setLectures(safeLectures);
      setExamPapers(safeExamPapers);
      setCoursewares(safeCoursewares);
      setMaterials(safeMaterials);
      // 保存完整列表（含拆解副本），用于查找源资源的拆解副本
      setAllExamPapers(safeExamPapers);
      setAllLectures(safeLectures);
      // 加载试卷/讲义/课件的课后反思（仅按 targetId 关联）
      const reflectionTargets: string[] = [
        ...safeExamPapers.map((r) => r.id),
        ...safeLectures.map((r) => r.id),
        ...safeCoursewares.map((r) => r.id),
      ];
      if (reflectionTargets.length > 0 && teacher) {
        const teacherRefs = await reflectionService.listByTeacher(teacher.id);
        const map: Record<string, Reflection[]> = {};
        teacherRefs.forEach((r) => {
          if (reflectionTargets.includes(r.targetId)) {
            if (!map[r.targetId]) map[r.targetId] = [];
            map[r.targetId].push(r);
          }
        });
        setReflectionsMap(map);
      } else {
        setReflectionsMap({});
      }
    } catch (e) {
      console.error("加载资源失败", e);
    } finally {
      setLoading(false);
    }
  }, [keyword, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, schoolId, selectedGrade, selectedYear, selectedSemester, teacher]);

  useEffect(() => {
    knowledgeService.getChapterTree(schoolId).then(setChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => loadAll(), 300);
    return () => clearTimeout(timer);
  }, [loadAll]);

  // 资源篮加载逻辑
  useEffect(() => {
    if (!teacher) return;
    basketService.listBaskets(teacher.id).then(setBaskets);
  }, [teacher]);

  useEffect(() => {
    if (!teacher) return;
    Promise.all([
      classService.listMyClasses(teacher.schoolId || null, teacher.id),
      classService.listMyStudents(teacher.schoolId || null, teacher.id),
    ]).then(([classes, students]) => {
      setAudienceClasses(classes);
      setAudienceStudents(students);
    }).catch(() => {
      setAudienceClasses([]);
      setAudienceStudents([]);
    });
  }, [teacher]);

  useEffect(() => {
    if (!selectedBasketId) {
      setBasketQuestions([]);
      setBasketMaterials([]);
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
      setExpandedBasketQuestionIds(new Set());
      return;
    }
    basketService.getBasket(selectedBasketId).then(async (basket) => {
      if (!basket) return;
      const [qs, ms] = await Promise.all([
        questionService.listQuestions({ ids: basket.questionIds }),
        materialService.listMaterials({ ids: basket.materialIds }),
      ]);
      const questionMap = new Map(qs.map((question) => [question.id, question]));
      const materialMap = new Map(ms.map((material) => [material.id, material]));
      setBasketQuestions(
        basket.questionIds.map((questionId) => questionMap.get(questionId)).filter(Boolean) as Question[],
      );
      setBasketMaterials(
        basket.materialIds.map((materialId) => materialMap.get(materialId)).filter(Boolean) as Material[],
      );
      setBaskets((current) => current.map((item) => item.id === basket.id ? basket : item));
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
      setExpandedBasketQuestionIds(new Set());
    });
  }, [selectedBasketId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBasket || basketAudienceStudentIds.length === 0) {
      setBasketAnswerRecords([]);
      setBasketMastery([]);
      setBasketInsightsLoading(false);
      return () => { cancelled = true; };
    }

    setBasketInsightsLoading(true);
    Promise.all([
      analyticsService.listAnswerRecordsByStudents(basketAudienceStudentIds),
      analyticsService.getKnowledgeMastery(basketAudienceStudentIds, schoolId),
    ]).then(([records, mastery]) => {
      if (cancelled) return;
      setBasketAnswerRecords(records);
      setBasketMastery(mastery);
    }).catch(() => {
      if (cancelled) return;
      setBasketAnswerRecords([]);
      setBasketMastery([]);
    }).finally(() => {
      if (!cancelled) setBasketInsightsLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedBasket, basketAudienceStudentIds, schoolId]);

  const loadBaskets = useCallback(async () => {
    if (!teacher) return;
    const list = await basketService.listBaskets(teacher.id);
    setBaskets(list);
  }, [teacher]);

  const handleCreateBasket = async () => {
    if (!teacher || !newBasketName.trim()) return;
    if (newBasketClassIds.length === 0 && newBasketStudentIds.length === 0) {
      toast.warning("请选择资源篮使用对象");
      return;
    }
    setIsCreatingBasket(true);
    try {
      const created = await basketService.createBasket(
        teacher.id,
        newBasketName.trim(),
        undefined,
        false,
        { classIds: newBasketClassIds, studentIds: newBasketStudentIds },
      );
      toast.success(`已创建资源篮「${newBasketName.trim()}」`);
      setNewBasketName("");
      setNewBasketClassIds([]);
      setNewBasketStudentIds([]);
      await loadBaskets();
      setSelectedBasketId(created.id);
      setIsCreatingBasket(false);
      setCreatingBasket(false);
    } catch (e: any) {
      toast.error("创建失败", e?.message);
      setIsCreatingBasket(false);
    }
  };

  const openBasketAudienceEditor = () => {
    if (!selectedBasket) return;
    setDraftBasketClassIds(selectedBasket.classIds || []);
    setDraftBasketStudentIds(selectedBasket.studentIds || []);
    setEditingBasketAudience(true);
  };

  const handleSaveBasketAudience = async () => {
    if (!selectedBasket) return;
    setSavingBasketAudience(true);
    try {
      const updated = await basketService.updateBasket(selectedBasket.id, {
        classIds: draftBasketClassIds,
        studentIds: draftBasketStudentIds,
      });
      setBaskets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingBasketAudience(false);
      toast.success("资源篮使用对象已更新");
    } catch (e: any) {
      toast.error("更新使用对象失败", e?.message);
    } finally {
      setSavingBasketAudience(false);
    }
  };

  const handleDeleteBasket = async (basketId: string, basketName: string) => {
    if (!confirm(`确定要删除资源篮「${basketName}」吗？`)) return;
    try {
      await basketService.deleteBasket(basketId);
      toast.success("已删除");
      if (selectedBasketId === basketId) {
        setSelectedBasketId(null);
      }
      loadBaskets();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  const handleSetDefaultBasket = async (basketId: string) => {
    if (!teacher) return;
    try {
      await basketService.setDefaultBasket(teacher.id, basketId);
      toast.success("已设为默认资源篮");
      loadBaskets();
    } catch (e: any) {
      toast.error("设置失败", e?.message);
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const toggleBasketQuestionExpanded = (questionId: string) => {
    setExpandedBasketQuestionIds((previous) => {
      const next = new Set(previous);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const toggleBasketQuestionType = (questionType: string) => {
    setExcludedBasketQuestionTypes((previous) => {
      const next = new Set(previous);
      if (next.has(questionType)) next.delete(questionType);
      else next.add(questionType);
      return next;
    });
  };

  const selectAllQuestions = () => {
    setSelectedQuestionIds((previous) => {
      const next = new Set(previous);
      if (allVisibleQuestionsSelected) {
        visibleBasketQuestions.forEach((question) => next.delete(question.id));
      } else {
        visibleBasketQuestions.forEach((question) => next.add(question.id));
      }
      return next;
    });
  };

  const selectAllMaterials = () => {
    if (selectedMaterialIds.size === basketMaterials.length) {
      setSelectedMaterialIds(new Set());
    } else {
      setSelectedMaterialIds(new Set(basketMaterials.map((m) => m.id)));
    }
  };

  const handleRemoveBasketQuestion = async (questionId: string) => {
    if (!selectedBasketId) return;
    try {
      await basketService.removeQuestion(selectedBasketId, questionId);
      setBasketQuestions((current) => current.filter((question) => question.id !== questionId));
      setSelectedQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
      setExpandedBasketQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
      setBaskets((current) => current.map((basket) => basket.id === selectedBasketId
        ? { ...basket, questionIds: basket.questionIds.filter((id) => id !== questionId) }
        : basket));
      toast.success("已从资源篮移除题目");
    } catch (error: any) {
      toast.error("移除题目失败", error?.message);
    }
  };

  const handleRemoveBasketMaterial = async (materialId: string) => {
    if (!selectedBasketId) return;
    try {
      await basketService.removeMaterial(selectedBasketId, materialId);
      setBasketMaterials((current) => current.filter((material) => material.id !== materialId));
      setSelectedMaterialIds((current) => {
        const next = new Set(current);
        next.delete(materialId);
        return next;
      });
      setBaskets((current) => current.map((basket) => basket.id === selectedBasketId
        ? { ...basket, materialIds: basket.materialIds.filter((id) => id !== materialId) }
        : basket));
      toast.success("已从资源篮移除素材");
    } catch (error: any) {
      toast.error("移除素材失败", error?.message);
    }
  };

  const handleGenerateLecture = async () => {
    if (!teacher || selectedQuestionIds.size === 0 && selectedMaterialIds.size === 0) {
      toast.warning("请先选择题目或素材");
      return;
    }
    const selectedQs = basketQuestions.filter((q) => selectedQuestionIds.has(q.id));
    const selectedMs = basketMaterials.filter((m) => selectedMaterialIds.has(m.id));
    const sections: Lecture["sections"] = [];
    selectedMs.forEach((m) => {
      sections.push({
        id: genId("sec"),
        title: m.title,
        type: "text",
        content: m.content,
        children: [],
      });
    });
    selectedQs.forEach((q) => {
      sections.push({
        id: genId("sec"),
        title: `题目 ${sections.length + 1}`,
        type: "question",
        content: q.stem,
        questionId: q.id,
        children: [],
      });
    });
    const lecture: Lecture = {
      id: genId("lec"),
      teacherId: teacher.id,
      schoolId: schoolId,
      title: `从资源篮生成的讲义`,
      description: `包含 ${selectedQs.length} 题、${selectedMs.length} 素材`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: selectedQs[0]?.grade || defaultGrade,
      schoolYear: selectedQs[0]?.schoolYear || defaultSchoolYear,
      semester: selectedQs[0]?.semester || defaultSemester,
      classIds: selectedBasket?.classIds || [],
      studentIds: selectedBasket?.studentIds || [],
      sections,
      version: 1,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const created = await lectureService.createLecture(teacher.id, schoolId, lecture);
      toast.success("讲义已生成，正在进入编辑...");
      navigate(`/lectures/${created.id}/edit`);
    } catch (e: any) {
      toast.error("生成讲义失败", e?.message);
    }
  };

  const handleGenerateExamPaper = async () => {
    if (!teacher || selectedQuestionIds.size === 0) {
      toast.warning("请至少选择一道题目");
      return;
    }
    const selectedQs = basketQuestions.filter((q) => selectedQuestionIds.has(q.id));
    const questions: ExamPaper["questions"] = selectedQs.map((q) => ({
      id: genId("eq"),
      questionId: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      score: q.type === "essay" ? 15 : q.type === "short" ? 5 : 2,
      type: q.type,
    }));
    const totalScore = questions.reduce((sum, q) => sum + q.score, 0);
    const paper: ExamPaper = {
      id: genId("exam"),
      teacherId: teacher.id,
      schoolId: schoolId,
      title: `从资源篮生成的试卷`,
      description: `包含 ${questions.length} 题、总分 ${totalScore} 分`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: selectedQs[0]?.grade || defaultGrade,
      schoolYear: selectedQs[0]?.schoolYear || defaultSchoolYear,
      semester: selectedQs[0]?.semester || defaultSemester,
      duration: Math.max(30, questions.length * 5),
      totalScore,
      questions,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const created = await examPaperService.createPaper(teacher.id, schoolId, paper);
      toast.success("试卷已生成，正在进入编辑...");
      navigate(`/exam-papers/${created.id}`);
    } catch (e: any) {
      toast.error("生成试卷失败", e?.message);
    }
  };

  // 创建空白试卷并进入编辑页面
  const handleCreateBlankExamPaper = async () => {
    if (!teacher) return;
    try {
      const created = await examPaperService.createPaper(teacher.id, schoolId, {
        title: "未命名试卷",
        description: "",
        chapterIds: [],
        knowledgePointIds: [],
        grade: defaultGrade,
        schoolYear: defaultSchoolYear,
        semester: defaultSemester,
        duration: 90,
        totalScore: 0,
        questions: [],
        status: "draft",
      });
      navigate(`/exam-papers/${created.id}`);
    } catch (e: any) {
      toast.error("创建试卷失败", e?.message);
    }
  };

  // 创建空白讲义并进入编辑页面
  const handleCreateBlankLecture = async () => {
    if (!teacher) return;
    try {
      const created = await lectureService.createLecture(teacher.id, schoolId, {
        title: "未命名讲义",
        description: "",
        chapterIds: [],
        knowledgePointIds: [],
        grade: defaultGrade,
        schoolYear: defaultSchoolYear,
        semester: defaultSemester,
        classIds: [],
        studentIds: [],
        sections: [],
      });
      navigate(`/lectures/${created.id}/edit`);
    } catch (e: any) {
      toast.error("创建讲义失败", e?.message);
    }
  };

  const noTreeSelection = checkedChapters.length === 0 && checkedKnowledge.length === 0;
  const resetDirectorySelections = useCallback(() => {
    setCheckedChapters([]);
    setCheckedKnowledge([]);
  }, []);

  // 排序
  const sortedData = useMemo(() => {
    const sortByKey = <T extends { updatedAt: string; createdAt: string; title?: string; stem?: string }>(arr: T[]) => {
      const sorted = [...arr];
      switch (sortKey) {
        case "updated":
          sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          break;
        case "created":
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case "title":
          sorted.sort((a, b) => {
            const ta = a.title || a.stem || "";
            const tb = b.title || b.stem || "";
            return ta.localeCompare(tb, "zh");
          });
          break;
      }
      return sorted;
    };
    switch (activeTab) {
      case "question": return sortByKey(questions);
      case "lecture": return sortByKey(lectures);
      case "examPaper": return sortByKey(examPapers);
      case "courseware": return sortByKey(coursewares);
      case "material": return sortByKey(materials);
    }
  }, [activeTab, questions, lectures, examPapers, coursewares, materials, sortKey]);

  // 仅看未分类筛选
  const displayedData = useMemo(() => {
    if (!onlyUncategorized || !noTreeSelection) return sortedData;
    return sortedData.filter((item) => {
      const chapterIds = (item as { chapterIds?: string[] }).chapterIds ?? [];
      const knowledgePointIds = (item as { knowledgePointIds?: string[] }).knowledgePointIds ?? [];
      return chapterIds.length === 0 && knowledgePointIds.length === 0;
    });
  }, [sortedData, onlyUncategorized, noTreeSelection]);

  const currentTab = tabConfig.find((t) => t.key === activeTab)!;

  // 试卷/讲义列表过滤掉拆解副本（拆解副本通过源资源下方缩进显示）
  const examPapersFiltered = useMemo(
    () => (activeTab === "examPaper" ? (displayedData as ExamPaper[]).filter((p) => !p.isExtractCopy) : []),
    [activeTab, displayedData],
  );
  const lecturesFiltered = useMemo(
    () => (activeTab === "lecture" ? (displayedData as Lecture[]).filter((l) => !l.isExtractCopy) : []),
    [activeTab, displayedData],
  );

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个资源吗？")) return;
    try {
      if (activeTab === "question") await questionService.deleteQuestion(id);
      else if (activeTab === "lecture") await lectureService.deleteLecture(id);
      else if (activeTab === "courseware") await coursewareService.deleteCourseware(id);
      else if (activeTab === "material") await materialService.deleteMaterial(id);
      else if (activeTab === "examPaper") await examPaperService.deletePaper(id);
      toast.success("已删除");
      if (activeTab !== "basket") {
        const key = batchResourceKey(activeTab, id);
        setResourceSelections((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }
      loadAll();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  const handleOpenShare = (resourceType: ShareableResourceType, resourceId: string, resourceTitle: string) => {
    setShareScope("school");
    setShareMessage("");
    setShareTarget({ resourceType, resourceId, resourceTitle });
  };

  const handleShare = async () => {
    if (!shareTarget || !teacher) return;
    setSharing(true);
    try {
      await shareService.createShare({
        fromTeacherId: teacher.id,
        fromSchoolId: schoolId,
        scope: shareScope,
        resourceType: shareTarget.resourceType,
        resourceId: shareTarget.resourceId,
        resourceTitle: shareTarget.resourceTitle,
        message: shareMessage.trim() || undefined,
      });
      toast.success("已发起分享");
      setShareTarget(null);
    } catch (e: any) {
      toast.error("分享失败", e?.message);
    } finally {
      setSharing(false);
    }
  };

  const openDuplicate = (type: "examPaper" | "lecture" | "courseware", id: string, originalTitle: string) => {
    setDuplicateTitle(`${originalTitle}（副本）`);
    setDuplicateTarget({ type, id, originalTitle });
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget) return;
    setDuplicating(true);
    try {
      let resourceLabel: string;
      if (duplicateTarget.type === "examPaper") {
        await examPaperService.duplicatePaper(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "试卷";
      } else if (duplicateTarget.type === "lecture") {
        await lectureService.duplicateLecture(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "讲义";
      } else {
        await coursewareService.duplicateCourseware(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "课件";
      }
      toast.success(`${resourceLabel}副本已创建`, "课后反思已同步复制");
      setDuplicateTarget(null);
      loadAll();
    } catch (e: any) {
      toast.error("创建副本失败", e?.message);
    } finally {
      setDuplicating(false);
    }
  };

  const platformCopyKeys = useMemo(() => new Set([
    ...questions.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("question", item.id)),
    ...examPapers.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("examPaper", item.id)),
    ...lectures.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("lecture", item.id)),
    ...coursewares.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("courseware", item.id)),
    ...materials.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("material", item.id)),
  ]), [questions, examPapers, lectures, coursewares, materials]);

  const isDonated = (resourceType: ShareableResourceType, resourceId: string) =>
    teacherDonations.some((record) =>
      record.resourceType === resourceType && record.sourceResourceId === resourceId,
    );

  const toggleResourceSelection = (resourceType: ShareableResourceType, resourceId: string) => {
    const key = batchResourceKey(resourceType, resourceId);
    setResourceSelections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const batchSelectionCardProps = (resourceType: ShareableResourceType, resourceId: string) => ({
    selected: resourceSelections.has(batchResourceKey(resourceType, resourceId)),
    donated: isDonated(resourceType, resourceId),
    donationLocked: platformCopyKeys.has(batchResourceKey(resourceType, resourceId)),
    onToggleSelection: () => toggleResourceSelection(resourceType, resourceId),
  });

  const selectedResourceRefs = (): BatchResourceRef[] =>
    [...resourceSelections].map(parseBatchResourceKey);

  const selectedDonationItems = (): DonationItem[] => selectedResourceRefs()
    .filter((item) => !platformCopyKeys.has(batchResourceKey(item.resourceType, item.resourceId)));

  const completeDonation = async (items: DonationItem[], decisions: DonationDecision[] = []) => {
    if (!teacher || items.length === 0) return;
    setDonating(true);
    try {
      const result = await donationService.donateResources(
        teacher.id,
        schoolId,
        items,
        decisions,
      );
      toast.success("捐赠完成", `已处理 ${result.created.length} 个资源`);
      setResourceSelections(new Set());
      setDonationCheck(null);
      setPendingDonationItems([]);
      setDonationDecisions({});
      await loadTeacherDonations();
    } catch (error) {
      toast.error("捐赠失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDonating(false);
    }
  };

  const handlePrepareDonation = async () => {
    if (!teacher) return;
    const selectedItems = selectedResourceRefs();
    const items = selectedDonationItems();
    if (items.length === 0) {
      toast.warning(selectedItems.length === 0 ? "请先选择资源" : "所选资源不可捐赠");
      return;
    }
    const skippedCount = selectedItems.length - items.length;
    if (skippedCount > 0) {
      toast.warning("已跳过不可捐赠资源", `${skippedCount} 个平台资源副本不会重复捐赠`);
    }
    setDonating(true);
    try {
      const check = await donationService.checkDonation(teacher.id, schoolId, items);
      const already = new Set(check.alreadyDonated.map((item) => batchResourceKey(item.resourceType, item.resourceId)));
      const pending = items.filter((item) => !already.has(batchResourceKey(item.resourceType, item.resourceId)));
      if (check.alreadyDonated.length > 0) {
        toast.warning("已跳过重复捐赠", `${check.alreadyDonated.length} 个资源已经捐赠过`);
      }
      if (pending.length === 0) {
        setResourceSelections(new Set());
        await loadTeacherDonations();
        return;
      }
      if (check.conflicts.length === 0) {
        setDonating(false);
        await completeDonation(pending);
        return;
      }
      const defaults: Record<string, DonationDecision> = {};
      for (const conflict of check.conflicts) {
        defaults[conflict.item.resourceId] = {
          sourceResourceId: conflict.item.resourceId,
          action: "new",
          targetDonationId: conflict.targetDonationId,
          fields: {
            stem: "target",
            answer: "target",
            analysis: "target",
            summary: "target",
          },
        };
      }
      setPendingDonationItems(pending);
      setDonationCheck(check);
      setDonationDecisions(defaults);
    } catch (error) {
      toast.error("查重失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDonating(false);
    }
  };

  const updateDonationDecision = (
    resourceId: string,
    updater: (decision: DonationDecision) => DonationDecision,
  ) => {
    setDonationDecisions((previous) => ({
      ...previous,
      [resourceId]: updater(previous[resourceId]),
    }));
  };

  const deleteBatchResource = async ({ resourceType, resourceId }: BatchResourceRef) => {
    switch (resourceType) {
      case "question":
        return questionService.deleteQuestion(resourceId);
      case "examPaper":
        return examPaperService.deletePaper(resourceId);
      case "lecture":
        return lectureService.deleteLecture(resourceId);
      case "courseware":
        return coursewareService.deleteCourseware(resourceId);
      case "material":
        return materialService.deleteMaterial(resourceId);
    }
  };

  const getBatchResource = async ({ resourceType, resourceId }: BatchResourceRef) => {
    switch (resourceType) {
      case "question":
        return questionService.getQuestion(resourceId);
      case "examPaper":
        return examPaperService.getPaper(resourceId);
      case "lecture":
        return lectureService.getLecture(resourceId);
      case "courseware":
        return coursewareService.getCourseware(resourceId);
      case "material":
        return materialService.getMaterial(resourceId);
    }
  };

  const updateBatchResource = async (
    { resourceType, resourceId }: BatchResourceRef,
    patch: { chapterIds?: string[]; knowledgePointIds?: string[] },
  ) => {
    switch (resourceType) {
      case "question":
        return questionService.updateQuestion(resourceId, patch);
      case "examPaper":
        return examPaperService.updatePaper(resourceId, patch);
      case "lecture":
        return lectureService.updateLecture(resourceId, patch);
      case "courseware":
        return coursewareService.updateCourseware(resourceId, patch);
      case "material":
        return materialService.updateMaterial(resourceId, patch);
    }
  };

  const refreshResourceViews = async () => {
    await loadAll();
    setResourceRefreshToken((value) => value + 1);
  };

  const handleBatchShare = async () => {
    if (!teacher) return;
    const refs = selectedResourceRefs();
    if (refs.length === 0) return;

    setBatchWorking(true);
    try {
      const batchId = genId("batch-share");
      const results = await Promise.allSettled(refs.map(async (ref) => {
        const resource = await getBatchResource(ref);
        if (!resource) throw new Error(`资源不存在：${ref.resourceId}`);
        const resourceTitle = ref.resourceType === "question"
          ? (resource as Question).stem
          : (resource as ExamPaper | Lecture | Courseware | Material).title;
        return shareService.createShare({
          fromTeacherId: teacher.id,
          fromSchoolId: schoolId,
          scope: "public",
          resourceType: ref.resourceType,
          resourceId: ref.resourceId,
          resourceTitle,
          batchId,
        });
      }));
      const succeededCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = refs.length - succeededCount;

      if (succeededCount > 0) {
        setBatchShareLink(`${window.location.origin}/shared-resources/${encodeURIComponent(batchId)}`);
        setBatchShareCount(succeededCount);
        toast.success("批量分享链接已生成", `链接包含 ${succeededCount} 个资源`);
      }
      if (failedCount > 0) {
        toast.error("部分资源分享失败", `${failedCount} 个资源未加入分享链接`);
      }
    } finally {
      setBatchWorking(false);
    }
  };

  const handleCopyBatchShareLink = async () => {
    if (!batchShareLink) return;
    try {
      await navigator.clipboard.writeText(batchShareLink);
      toast.success("链接已复制");
    } catch (error) {
      toast.error("复制失败", error instanceof Error ? error.message : "请手动复制链接");
    }
  };

  const handleBatchAction = (action: string) => {
    switch (action) {
      case "share":
        void handleBatchShare();
        break;
      case "delete":
        void handleBatchDelete();
        break;
      case "donate":
        void handlePrepareDonation();
        break;
      case "chapter":
        openBatchDirectoryPicker("chapter");
        break;
      case "knowledge":
        openBatchDirectoryPicker("knowledge");
        break;
    }
  };

  const handleBatchDelete = async () => {
    const refs = selectedResourceRefs();
    if (refs.length === 0) return;
    if (!confirm(`确定要删除选中的 ${refs.length} 个资源吗？此操作不可撤销。`)) return;

    setBatchWorking(true);
    try {
      const results = await Promise.allSettled(refs.map(deleteBatchResource));
      const succeededKeys = new Set(
        refs
          .filter((_, index) => results[index].status === "fulfilled")
          .map((item) => batchResourceKey(item.resourceType, item.resourceId)),
      );
      const failedCount = refs.length - succeededKeys.size;

      setResourceSelections((previous) => {
        const next = new Set(previous);
        succeededKeys.forEach((key) => next.delete(key));
        return next;
      });
      await refreshResourceViews();

      if (succeededKeys.size > 0) {
        toast.success("批量删除完成", `已删除 ${succeededKeys.size} 个资源`);
      }
      if (failedCount > 0) {
        toast.error("部分资源删除失败", `${failedCount} 个资源未能删除，仍保持选中`);
      }
    } finally {
      setBatchWorking(false);
    }
  };

  const openBatchDirectoryPicker = (mode: "chapter" | "knowledge") => {
    setBatchDirectoryIds([]);
    setBatchDirectoryMode(mode);
  };

  const handleApplyBatchDirectory = async () => {
    if (!batchDirectoryMode || batchDirectoryIds.length === 0) {
      toast.warning(batchDirectoryMode === "chapter" ? "请选择要新增的章节" : "请选择要新增的知识点");
      return;
    }

    const refs = selectedResourceRefs();
    setBatchWorking(true);
    try {
      const results = await Promise.allSettled(refs.map(async (ref) => {
        const resource = await getBatchResource(ref);
        if (!resource) throw new Error(`资源不存在：${ref.resourceId}`);

        if (batchDirectoryMode === "chapter") {
          const chapterIds = appendUniqueIds(resource.chapterIds, batchDirectoryIds);
          return updateBatchResource(ref, { chapterIds });
        }
        const knowledgePointIds = appendUniqueIds(resource.knowledgePointIds, batchDirectoryIds);
        return updateBatchResource(ref, { knowledgePointIds });
      }));

      const succeededCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - succeededCount;
      await refreshResourceViews();

      if (succeededCount > 0) {
        const label = batchDirectoryMode === "chapter" ? "章节" : "知识点";
        toast.success(`已新增统一${label}`, `已更新 ${succeededCount} 个资源，原有关联保持不变`);
        setBatchDirectoryMode(null);
        setBatchDirectoryIds([]);
      }
      if (failedCount > 0) {
        toast.error("部分资源更新失败", `${failedCount} 个资源未能更新`);
      }
    } finally {
      setBatchWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="我的资源"
        description="统一管理我的题库、试卷库、讲义库、课件库、素材库"
        icon={<Library className="w-5 h-5" />}
      />

      {/* Tab 切换 */}
      <div className="mb-4 border-b border-ink-200">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tabConfig.filter((t) => t.key !== "basket").map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                    active
                      ? "text-gold-600 border-gold-500"
                      : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 pb-px">
            {(() => {
              const basketTab = tabConfig.find((t) => t.key === "basket")!;
              const Icon = basketTab.icon;
              const active = activeTab === "basket";
              return (
                <button
                  onClick={() => setActiveTab("basket")}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                    active
                      ? "text-gold-600 border-gold-500"
                      : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {basketTab.label}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {activeTab !== "question" && (
        <div className="mb-3 text-sm text-ink-500">{currentTab.description}</div>
      )}

      {/* 题库 Tab：渲染完整的题库管理/使用页面 */}
      {activeTab === "question" ? (
        <QuestionBankPage
          selectedQuestionIds={new Set(
            [...resourceSelections]
              .filter((key) => key.startsWith("question:"))
              .map((key) => key.slice("question:".length)),
          )}
          donatedQuestionIds={new Set(
            teacherDonations
              .filter((record) => record.resourceType === "question")
              .map((record) => record.sourceResourceId),
          )}
          donationLockedQuestionIds={new Set(
            questions
              .filter((question) => question.platformSourceDonationIds?.length)
              .map((question) => question.id),
          )}
          onToggleSelection={(question) => toggleResourceSelection("question", question.id)}
          onQuestionDeleted={(questionId) => {
            setResourceSelections((previous) => {
              const next = new Set(previous);
              next.delete(batchResourceKey("question", questionId));
              return next;
            });
          }}
          refreshToken={resourceRefreshToken}
        />
      ) : activeTab === "basket" ? (
        <div className="grid grid-cols-12 gap-4">
          {/* 左侧：资源篮列表 */}
          <div className="col-span-3">
            <Card className="p-3 sticky top-4 h-fit">
              <div className="flex items-center justify-between mb-3">
                <div className="font-serif font-semibold text-sm text-ink-800 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4" />
                  我的资源篮
                </div>
                <button
                  onClick={() => setCreatingBasket(true)}
                  className="p-1 rounded hover:bg-gold-50 text-gold-600"
                  title="新建资源篮"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {baskets.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-400">
                  暂无资源篮，点击右上角 + 创建
                </div>
              ) : (
                <div className="space-y-1">
                  {baskets.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        "p-2.5 rounded-md cursor-pointer transition-all flex items-start justify-between",
                        selectedBasketId === b.id
                          ? "bg-gold-50 border border-gold-200"
                          : "hover:bg-mist",
                      )}
                      onClick={() => setSelectedBasketId(b.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-ink-800 truncate">
                          {b.name}
                          {b.isDefault && <span className="ml-1 text-[10px] text-gold-600">默认</span>}
                        </div>
                        <div className="text-xs text-ink-400 mt-0.5">
                          {b.questionIds.length} 题 · {b.materialIds.length} 素材
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5 truncate">
                          {basketAudienceLabel(b)}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefaultBasket(b.id);
                          }}
                          className={cn(
                            "p-1 rounded transition-colors",
                            b.isDefault
                              ? "text-gold-500 bg-gold-50"
                              : "text-ink-300 hover:text-gold-500 hover:bg-gold-50",
                          )}
                          title={b.isDefault ? "当前为默认资源篮" : "设为默认资源篮"}
                        >
                          <Star className="w-3 h-3" fill={b.isDefault ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBasket(b.id, b.name);
                          }}
                          className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50"
                          title="删除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* 右侧：资源篮内容 */}
          <div className="col-span-9">
            {!selectedBasketId ? (
              <EmptyState
                icon={<ShoppingCart className="w-12 h-12 text-ink-200" />}
                title="选择一个资源篮"
                description="点击左侧资源篮查看其中的题目和素材"
              />
            ) : (
              <div>
                {/* 顶部操作栏 */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="text-sm min-w-0">
                    <div>
                      <span className="font-medium text-ink-800">{selectedBasket?.name}</span>
                      <span className="text-ink-400 ml-2">
                        共 {basketQuestions.length} 题 · {basketMaterials.length} 素材
                      </span>
                    </div>
                    <div className={cn(
                      "mt-1 flex items-center gap-1.5 text-xs",
                      basketAudienceStudentIds.length > 0 ? "text-ink-500" : "text-amber-600",
                    )}>
                      <Users className="w-3.5 h-3.5" />
                      {selectedBasket
                        ? basketAudienceLabel(selectedBasket, basketAudienceStudentIds.length)
                        : "尚未选择使用对象"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button variant="outline" onClick={openBasketAudienceEditor}>
                      <Pencil className="w-4 h-4" />
                      调整使用对象
                    </Button>
                    <Button variant="outline" onClick={handleGenerateLecture} disabled={selectedQuestionIds.size === 0 && selectedMaterialIds.size === 0}>
                      <FileText className="w-4 h-4" />
                      生成讲义
                    </Button>
                    <Button variant="gold" onClick={handleGenerateExamPaper} disabled={selectedQuestionIds.size === 0}>
                      <FileSpreadsheet className="w-4 h-4" />
                      生成试卷
                    </Button>
                  </div>
                </div>

                {/* 题目列表 */}
                {basketQuestions.length > 0 && (
                  <Card className="p-3 mb-4">
                    <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-ink-100">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <div className="text-sm font-medium text-ink-700 flex items-center gap-1.5 whitespace-nowrap">
                          <FileQuestion className="w-4 h-4" />
                          题目（{visibleBasketQuestions.length === basketQuestions.length
                            ? basketQuestions.length
                            : `${visibleBasketQuestions.length}/${basketQuestions.length}`}）
                        </div>
                        <fieldset
                          className="flex items-center gap-x-3 gap-y-1 flex-wrap"
                          aria-label="按题型筛选资源篮题目"
                        >
                          {questionTypeOptions.map((option) => (
                            <label
                              key={option.value}
                              className="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={!excludedBasketQuestionTypes.has(option.value)}
                                onChange={() => toggleBasketQuestionType(option.value)}
                                className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                              />
                              {option.label}
                            </label>
                          ))}
                        </fieldset>
                      </div>
                      <button
                        onClick={selectAllQuestions}
                        disabled={visibleBasketQuestions.length === 0}
                        className="text-xs text-ink-500 hover:text-gold-600 disabled:text-ink-300 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {allVisibleQuestionsSelected ? "取消全选" : `全选 (${visibleBasketQuestions.length})`}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {visibleBasketQuestions.map((q) => {
                        const usageRecords = answerRecordsByQuestion.get(q.id) || [];
                        const usedByAudience = usageRecords.length > 0;
                        const usageDates = usageDateLabels(usageRecords);
                        const expanded = expandedBasketQuestionIds.has(q.id);
                        return (
                          <div
                            key={q.id}
                            className={cn(
                              "p-3 rounded-md border transition-all flex items-start gap-2",
                              usedByAudience
                                ? "border-red-300 bg-red-50/40"
                                : selectedQuestionIds.has(q.id)
                                  ? "border-gold-300 bg-gold-50/50"
                                  : "border-ink-100 hover:border-ink-200",
                            )}
                          >
                            <button
                              onClick={() => toggleQuestionSelection(q.id)}
                              className="mt-0.5 flex-shrink-0"
                            >
                              {selectedQuestionIds.has(q.id) ? (
                                <CheckSquare className="w-4 h-4 text-gold-600" />
                              ) : (
                                <Square className="w-4 h-4 text-ink-300" />
                              )}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="tag-gold">{getQuestionTypeLabel(q.type)}</span>
                                <span className="text-xs text-ink-400">难度：{difficultyLabel[q.difficulty]}</span>
                                {usedByAudience && (
                                  <span className="text-xs font-medium text-red-600">所选学生已使用</span>
                                )}
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={expanded}
                                title="查看完整答案、解析和总结"
                                className="group cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
                                onClick={() => toggleBasketQuestionExpanded(q.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleBasketQuestionExpanded(q.id);
                                  }
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <MathHtml className="text-sm text-ink-800">{q.stem}</MathHtml>
                                    {q.options && q.options.length > 0 && (
                                      <div className="mt-2 space-y-1 text-sm text-ink-700">
                                        {q.options.map((option, index) => (
                                          <div key={`${q.id}-option-${index}`} className="flex items-start gap-1.5">
                                            <span className="font-medium text-ink-500 flex-shrink-0">
                                              {String.fromCharCode(65 + index)}.
                                            </span>
                                            <MathHtml className="flex-1 min-w-0">{option}</MathHtml>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {expanded ? (
                                    <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-gold-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-400 group-hover:text-gold-600" />
                                  )}
                                </div>
                              </div>

                              {expanded && (
                                <div className="mt-3 grid gap-3 rounded-md border border-ink-100 bg-paper/70 p-3">
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">答案</div>
                                    <MathHtml className="text-sm text-ink-800">{q.answer || "暂无答案"}</MathHtml>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">解析</div>
                                    <MathHtml className="text-sm text-ink-800">{q.analysis || "暂无解析"}</MathHtml>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">总结</div>
                                    <MathHtml className="text-sm text-ink-800">{q.summary || "暂无总结"}</MathHtml>
                                  </div>
                                </div>
                              )}

                              {usedByAudience && (
                                <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                                  使用时间：{usageDates.slice(0, 3).join("、")}
                                  {usageDates.length > 3 && ` 等 ${usageDates.length} 天`}
                                  <span className="ml-2 text-red-500">共 {usageRecords.length} 条记录</span>
                                </div>
                              )}

                              {q.knowledgePointIds.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-ink-100/80">
                                  <div className="text-[11px] text-ink-400 mb-1.5">知识点掌握情况</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {q.knowledgePointIds.map((knowledgePointId) => {
                                      const mastery = basketMasteryMap.get(knowledgePointId);
                                      const presentation = mastery
                                        ? masteryPresentation[mastery.masteryLevel]
                                        : null;
                                      return (
                                        <span
                                          key={knowledgePointId}
                                          className={cn(
                                            "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]",
                                            basketAudienceStudentIds.length === 0 || basketInsightsLoading
                                              ? "border-ink-100 bg-mist text-ink-500"
                                              : presentation?.className || "border-ink-100 bg-mist text-ink-500",
                                          )}
                                        >
                                          <span>{knowledgeNameMap.get(knowledgePointId) || mastery?.knowledgePointName || "未命名知识点"}</span>
                                          <span className="font-medium">
                                            {basketAudienceStudentIds.length === 0
                                              ? "未选择对象"
                                              : basketInsightsLoading
                                                ? "统计中"
                                                : mastery
                                                  ? `${presentation?.label}${mastery.totalAttempts > 0 ? ` ${Math.round(mastery.correctRate * 100)}%` : ""}`
                                                  : "暂无数据"}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBasketQuestion(q.id)}
                              className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                              title="从资源篮移除"
                              aria-label="从资源篮移除题目"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                      {visibleBasketQuestions.length === 0 && (
                        <div className="py-8 text-center text-sm text-ink-400">
                          当前题型筛选下没有题目
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* 素材列表 */}
                {basketMaterials.length > 0 && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-ink-100">
                      <div className="text-sm font-medium text-ink-700 flex items-center gap-1.5">
                        <FileBox className="w-4 h-4" />
                        素材（{basketMaterials.length}）
                      </div>
                      <button
                        onClick={selectAllMaterials}
                        className="text-xs text-ink-500 hover:text-gold-600"
                      >
                        {selectedMaterialIds.size === basketMaterials.length ? "取消全选" : `全选 (${basketMaterials.length})`}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {basketMaterials.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "p-3 rounded-md border transition-all flex items-start gap-2",
                            selectedMaterialIds.has(m.id)
                              ? "border-gold-300 bg-gold-50/50"
                              : "border-ink-100 hover:border-ink-200",
                          )}
                        >
                          <button
                            onClick={() => toggleMaterialSelection(m.id)}
                            className="mt-0.5 flex-shrink-0"
                          >
                            {selectedMaterialIds.has(m.id) ? (
                              <CheckSquare className="w-4 h-4 text-gold-600" />
                            ) : (
                              <Square className="w-4 h-4 text-ink-300" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="tag-teal">{materialTypeLabel[m.type]}</span>
                            </div>
                            <div className="text-sm text-ink-800 font-medium">{m.title}</div>
                            <div className="text-xs text-ink-500 line-clamp-1">{m.content}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveBasketMaterial(m.id)}
                            className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                            title="从资源篮移除"
                            aria-label="从资源篮移除素材"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {basketQuestions.length === 0 && basketMaterials.length === 0 && (
                  <EmptyState
                    icon={<FileText className="w-10 h-10 text-ink-200" />}
                    title="资源篮为空"
                    description="从题库或素材库添加资源到此处"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-12 gap-4">
        {/* 左侧：章节/知识点目录 */}
        <div className="col-span-3">
          <Card className="p-3 sticky top-4">
            <div className="flex gap-1 mb-3 p-1 bg-mist rounded-md">
              <button
                onClick={() => setLeftTab("chapter")}
                aria-label="章节目录"
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "chapter" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="relative inline-flex">
                  <BookOpen className="w-3.5 h-3.5" />
                  {checkedChapters.length > 0 && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-paper"
                      aria-label="章节目录已有勾选"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                章节目录
              </button>
              <button
                onClick={() => setLeftTab("knowledge")}
                aria-label="知识点"
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "knowledge" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="relative inline-flex">
                  <Lightbulb className="w-3.5 h-3.5" />
                  {checkedKnowledge.length > 0 && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-paper"
                      aria-label="知识点目录已有勾选"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                知识点
              </button>
            </div>
            {(leftTab === "chapter" ? chapterTree : knowledgeTree) ? (
              leftTab === "chapter" ? (
                <SearchableTree
                  data={chapterTree!}
                  title="章节目录"
                  accent="gold"
                  checkable
                  checkedIds={checkedChapters}
                  onCheck={setCheckedChapters}
                  searchPlaceholder="搜索章节..."
                  showLogicSelector
                  logic={chapterLogic}
                  onLogicChange={setChapterLogic}
                  onReset={resetDirectorySelections}
                />
              ) : (
                <SearchableTree
                  data={knowledgeTree!}
                  title="知识点目录"
                  accent="teal"
                  checkable
                  checkedIds={checkedKnowledge}
                  onCheck={setCheckedKnowledge}
                  searchPlaceholder="搜索知识点..."
                  showLogicSelector
                  logic={knowledgeLogic}
                  onLogicChange={setKnowledgeLogic}
                  onReset={resetDirectorySelections}
                />
              )
            ) : (
              <div className="flex items-center justify-center py-10">
                <Spinner size={20} />
              </div>
            )}
          </Card>
        </div>

        {/* 右侧：资源列表 */}
        <div className="col-span-9">
          {/* 搜索与排序 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索资源..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-paper focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {activeTab === "examPaper" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleCreateBlankExamPaper}>
                    <Plus className="w-3.5 h-3.5" />
                    出试卷
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=examPaper")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传试卷
                  </Button>
                </>
              )}
              {activeTab === "lecture" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleCreateBlankLecture}>
                    <Plus className="w-3.5 h-3.5" />
                    编讲义
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=lecture")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传讲义
                  </Button>
                </>
              )}
              {activeTab === "courseware" && (
                <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=courseware")}>
                  <Upload className="w-3.5 h-3.5" />
                  上传课件
                </Button>
              )}
              {activeTab === "material" && (
                <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=material")}>
                  <Upload className="w-3.5 h-3.5" />
                  上传素材
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full">
              <FilterSelect
                label="年级"
                value={selectedGrade}
                options={gradeOptions}
                onChange={setSelectedGrade}
              />
              <FilterSelect
                label="学年"
                value={selectedYear}
                options={schoolYearOptions}
                onChange={setSelectedYear}
              />
              <FilterSelect
                label="学期"
                value={selectedSemester}
                options={semesterOptions}
                onChange={setSelectedSemester}
              />
              {noTreeSelection && (
                <button
                  onClick={() => setOnlyUncategorized((v) => !v)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                    onlyUncategorized
                      ? "bg-amber-100 border-amber-300 text-amber-800"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                  title="仅显示未关联任何章节/知识点的资源"
                >
                  <Filter className="w-3 h-3" />
                  仅看未分类
                </button>
              )}
              <ArrowUpDown className="w-3.5 h-3.5 text-ink-400" />
              <span className="text-xs text-ink-500">排序：</span>
              <div className="flex items-center gap-1">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortKey(opt.value)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                      sortKey === opt.value
                        ? "bg-gold-400 border-gold-400 text-ink-900"
                        : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 资源列表内容 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : displayedData.length === 0 ? (
            <EmptyState
              icon={<currentTab.icon className="w-10 h-10 text-ink-200" />}
              title={`暂无${currentTab.label}资源`}
              description={noTreeSelection && onlyUncategorized
                ? "当前没有未分类资源"
                : "点击右上角「上传资源」按钮添加资源"}
            />
          ) : (
            <div className="space-y-3">
              {/* 讲义库 */}
              {activeTab === "lecture" && lecturesFiltered.map((item) => {
                const extractCopies = allLectures.filter(
                  (copy) => copy.sourceResourceId === item.id && copy.isExtractCopy
                );
                const hasExtractCopy = extractCopies.length > 0;
                const isExtracted = item.extractStatus === "done";
                const isExtracting = item.extractStatus === "extracting";
                const mainLecture = hasExtractCopy ? extractCopies[0] : item;
                return (
                  <div key={item.id} className="space-y-2">
                    <ResourceCard
                      key={mainLecture.id}
                      {...batchSelectionCardProps("lecture", mainLecture.id)}
                      title={mainLecture.title}
                      description={mainLecture.description || (hasExtractCopy ? "文档拆解生成的正稿，可编辑替换其中的题目和知识块" : undefined)}
                      meta={[
                        { label: "年级", value: `${mainLecture.grade} · ${mainLecture.schoolYear} · ${mainLecture.semester || "上学期"}` },
                        { label: "内容", value: `${mainLecture.sections.length} 节` },
                        { label: "状态", value: mainLecture.status === "published" ? "已发布" : "草稿" },
                      ]}
                      updatedAt={mainLecture.updatedAt}
                      reflections={reflectionsMap[mainLecture.id]}
                      onClick={() => {
                        if (item.originalFileUrl && !isExtracted && !hasExtractCopy) {
                          navigate(`/resources/preview/${item.id}?type=lecture`);
                        } else {
                          navigate(`/lectures/${mainLecture.id}/edit`);
                        }
                      }}
                      onShare={() => handleOpenShare("lecture", mainLecture.id, mainLecture.title)}
                      onDelete={() => handleDelete(mainLecture.id)}
                      onViewReflections={() => setViewingReflections({ title: mainLecture.title, list: reflectionsMap[mainLecture.id] || [] })}
                      onDuplicate={() => openDuplicate("lecture", mainLecture.id, mainLecture.title)}
                      showAddToLesson
                      titleBadge={hasExtractCopy ? { text: "正稿", variant: "gold" } : (!isExtracted && item.originalFileUrl ? { text: "待拆解", variant: "amber" } : undefined)}
                      onAddToLesson={async () => {
                        if (!teacher) return;
                        try {
                          const cw = await lessonCoursewareService.createFromLecture(
                            teacher.id,
                            teacher.schoolId!,
                            mainLecture,
                          );
                          toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                          navigate(`/my-lessons/${cw.id}/edit`);
                        } catch (err) {
                          toast.error("添加失败", err instanceof Error ? err.message : undefined);
                        }
                      }}
                    />
                    {item.originalFileUrl && !hasExtractCopy && (
                      <div className="flex items-center gap-3 text-xs flex-wrap pl-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-ink-400" />
                          <span className="text-ink-500">原稿：{item.originalFileName}</span>
                          <DocumentDownloadButton
                            fileUrl={item.originalFileUrl}
                            fileName={item.originalFileName}
                            className="text-gold-600 hover:text-gold-700"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                        {!isExtracted && (
                          <Button
                            variant="gold"
                            size="sm"
                            onClick={() => handleOpenExtract(item, "lecture")}
                            loading={isExtracting}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isExtracting ? "拆解中..." : "文档拆解"}
                          </Button>
                        )}
                        {isExtracted && (
                          <Badge variant="teal">已拆解</Badge>
                        )}
                      </div>
                    )}
                    {hasExtractCopy && item.originalFileUrl && (
                      <OriginalFileRow
                        fileUrl={item.originalFileUrl}
                        fileName={item.originalFileName}
                        icon={FileText}
                        onView={() => navigate(`/resources/preview/${item.id}?type=lecture`)}
                      />
                    )}
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!teacher) return;
                          try {
                            const result = await lectureService.convertToExamPaper(mainLecture.id);
                            toast.success("已转换为试卷", "正在跳转到试卷编辑器...");
                            navigate(`/exam-papers/${result.paperId}/edit`);
                          } catch (err) {
                            toast.error("转换失败", err instanceof Error ? err.message : undefined);
                          }
                        }}
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        转试卷
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* 试卷库 */}
              {activeTab === "examPaper" && examPapersFiltered.map((item) => {
                const extractCopies = allExamPapers.filter(
                  (copy) => copy.sourceResourceId === item.id && copy.isExtractCopy
                );
                const hasExtractCopy = extractCopies.length > 0;
                const isExtracted = item.extractStatus === "done";
                const isExtracting = item.extractStatus === "extracting";
                return (
                  <div key={item.id} className="space-y-2">
                    {hasExtractCopy && extractCopies.map((copy) => (
                      <ResourceCard
                        key={copy.id}
                        {...batchSelectionCardProps("examPaper", copy.id)}
                        title={copy.title}
                        description={copy.description || "文档拆解生成的副本，可编辑替换其中的题目和知识块"}
                        meta={[
                          { label: "年级", value: `${copy.grade} · ${copy.schoolYear} · ${copy.semester || "上学期"}` },
                          { label: "题目", value: `${copy.questions.length} 题` },
                          { label: "总分", value: `${copy.totalScore} 分` },
                          { label: "时长", value: `${copy.duration} 分钟` },
                          { label: "状态", value: copy.status === "published" ? "已发布" : "草稿" },
                        ]}
                        updatedAt={copy.updatedAt}
                        reflections={reflectionsMap[copy.id]}
                        onClick={() => navigate(`/exam-papers/${copy.id}`)}
                        onShare={() => handleOpenShare("examPaper", copy.id, copy.title)}
                        onDelete={() => handleDelete(copy.id)}
                        onViewReflections={() => setViewingReflections({ title: copy.title, list: reflectionsMap[copy.id] || [] })}
                        onDuplicate={() => openDuplicate("examPaper", copy.id, copy.title)}
                        showAddToLesson
                        titleBadge={{ text: "正稿", variant: "gold" }}
                        onAddToLesson={async () => {
                          if (!teacher) return;
                          try {
                            const cw = await lessonCoursewareService.createFromExamPaper(
                              teacher.id,
                              teacher.schoolId!,
                              copy,
                            );
                            toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                            navigate(`/my-lessons/${cw.id}/edit`);
                          } catch (err) {
                            toast.error("添加失败", err instanceof Error ? err.message : undefined);
                          }
                        }}
                      />
                    ))}
                    {!hasExtractCopy && (
                      <>
                        <ResourceCard
                          {...batchSelectionCardProps("examPaper", item.id)}
                          title={item.title}
                          description={item.description}
                          meta={[
                            { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                            { label: "题目", value: `${item.questions.length} 题` },
                            { label: "总分", value: `${item.totalScore} 分` },
                            { label: "时长", value: `${item.duration} 分钟` },
                            { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                          ]}
                          updatedAt={item.updatedAt}
                          reflections={reflectionsMap[item.id]}
                          onClick={() => {
                            if (item.originalFileUrl && !isExtracted) {
                              navigate(`/resources/preview/${item.id}?type=examPaper`);
                            } else {
                              navigate(`/exam-papers/${item.id}/preview`);
                            }
                          }}
                          onShare={() => handleOpenShare("examPaper", item.id, item.title)}
                          onDelete={() => handleDelete(item.id)}
                          onViewReflections={() => setViewingReflections({ title: item.title, list: reflectionsMap[item.id] || [] })}
                          onDuplicate={() => openDuplicate("examPaper", item.id, item.title)}
                          showAddToLesson
                          titleBadge={!isExtracted && item.originalFileUrl ? { text: "待拆解", variant: "amber" } : undefined}
                          onAddToLesson={async () => {
                            if (!teacher) return;
                            try {
                              const cw = await lessonCoursewareService.createFromExamPaper(
                                teacher.id,
                                teacher.schoolId!,
                                item,
                              );
                              toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                              navigate(`/my-lessons/${cw.id}/edit`);
                            } catch (err) {
                              toast.error("添加失败", err instanceof Error ? err.message : undefined);
                            }
                          }}
                        />
                        {item.originalFileUrl && (
                          <div className="flex items-center gap-3 text-xs flex-wrap pl-1">
                            <div className="flex items-center gap-2">
                              <FileSpreadsheet className="w-3.5 h-3.5 text-ink-400" />
                              <span className="text-ink-500">原稿：{item.originalFileName}</span>
                              <DocumentDownloadButton
                                fileUrl={item.originalFileUrl}
                                fileName={item.originalFileName}
                                className="text-gold-600 hover:text-gold-700"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                            {!isExtracted && (
                              <Button
                                variant="gold"
                                size="sm"
                                onClick={() => handleOpenExtract(item, "examPaper")}
                                loading={isExtracting}
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {isExtracting ? "拆解中..." : "文档拆解"}
                              </Button>
                            )}
                            {isExtracted && (
                              <Badge variant="teal">已拆解</Badge>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/exam-papers/${item.id}/answer-sheet`)}
                          >
                            <Layout className="w-3.5 h-3.5" />
                            制作答题卡
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!teacher) return;
                              try {
                                const result = await examPaperService.convertToLecture(item.id);
                                toast.success("已转换为讲义", "正在跳转到讲义编辑器...");
                                navigate(`/lectures/${result.lectureId}/edit`);
                              } catch (err) {
                                toast.error("转换失败", err instanceof Error ? err.message : undefined);
                              }
                            }}
                          >
                            <FileText className="w-3.5 h-3.5" />
                            转讲义
                          </Button>
                        </div>
                      </>
                    )}
                    {hasExtractCopy && item.originalFileUrl && (
                      <OriginalFileRow
                        fileUrl={item.originalFileUrl}
                        fileName={item.originalFileName}
                        icon={FileSpreadsheet}
                        onView={() => navigate(`/resources/preview/${item.id}?type=examPaper`)}
                      />
                    )}
                  </div>
                );
              })}

              {/* 课件库 */}
              {activeTab === "courseware" && (displayedData as Courseware[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  {...batchSelectionCardProps("courseware", item.id)}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: coursewareTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  fileUrl={item.fileUrl}
                  type={item.type}
                  reflections={reflectionsMap[item.id]}
                  showAddToBasket
                  basketResourceType="courseware"
                  basketResourceId={item.id}
                  onBasketChanged={loadAll}
                  onClick={() => navigate(`/coursewares/${item.id}`)}
                  showAddToLesson
                  onAddToLesson={async () => {
                    if (!teacher) return;
                    try {
                      const lesson = await lessonCoursewareService.createFromCourseware(
                        teacher.id,
                        teacher.schoolId!,
                        item,
                      );
                      toast.success("已添加到上课", "请选择班级并完成发布");
                      navigate(`/my-lessons/${lesson.id}/edit`);
                    } catch (error) {
                      toast.error("添加失败", error instanceof Error ? error.message : undefined);
                    }
                  }}
                  onShare={() => handleOpenShare("courseware", item.id, item.title)}
                  onDelete={() => handleDelete(item.id)}
                  onViewReflections={() => setViewingReflections({ title: item.title, list: reflectionsMap[item.id] || [] })}
                  onDuplicate={() => openDuplicate("courseware", item.id, item.title)}
                />
              ))}

              {/* 素材库 */}
              {activeTab === "material" && (displayedData as Material[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  {...batchSelectionCardProps("material", item.id)}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: materialTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  fileUrl={item.fileUrl}
                  type={item.type}
                  showAddToBasket
                  basketResourceType="material"
                  basketResourceId={item.id}
                  onBasketChanged={loadAll}
                  onShare={() => handleOpenShare("material", item.id, item.title)}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {resourceSelections.size > 0 && (
        <div
          role="region"
          aria-label="批量操作"
          className="fixed bottom-6 right-6 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-ink-200 bg-paper p-2 shadow-xl"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResourceSelections(new Set())}
            disabled={batchWorking || donating}
            className="whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" />
            取消批量选择
          </Button>
          <select
            value=""
            onChange={(event) => handleBatchAction(event.target.value)}
            disabled={batchWorking || donating}
            aria-label="选择批量操作"
            className="h-8 min-w-44 cursor-pointer rounded-md border border-ink-200 bg-paper px-3 text-sm text-ink-700 outline-none transition-colors hover:border-ink-300 focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {batchWorking || donating ? "正在处理..." : `批量操作（${resourceSelections.size}）`}
            </option>
            <option value="share">批量分享</option>
            <option value="delete">批量删除</option>
            <option value="donate">捐赠到平台</option>
            <option value="chapter">新增统一章节</option>
            <option value="knowledge">新增统一知识点</option>
          </select>
        </div>
      )}

      <Modal
        open={!!batchShareLink}
        onClose={() => setBatchShareLink("")}
        title="批量分享链接"
        description={`已生成包含 ${batchShareCount} 个资源的分享链接。接收者登录后可一次性导入。`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBatchShareLink("")}>关闭</Button>
            <Button variant="gold" onClick={handleCopyBatchShareLink}>
              <Copy className="h-4 w-4" />
              复制链接
            </Button>
          </div>
        }
      >
        <Input
          label="分享链接"
          aria-label="批量分享链接"
          value={batchShareLink}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
      </Modal>

      <Modal
        open={!!batchDirectoryMode}
        onClose={() => {
          if (batchWorking) return;
          setBatchDirectoryMode(null);
          setBatchDirectoryIds([]);
        }}
        title={batchDirectoryMode === "chapter" ? "新增统一章节" : "新增统一知识点"}
        description={`所选目录会追加到 ${resourceSelections.size} 个资源，原有关联不会被覆盖。`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setBatchDirectoryMode(null);
                setBatchDirectoryIds([]);
              }}
              disabled={batchWorking}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleApplyBatchDirectory}
              loading={batchWorking}
              disabled={batchDirectoryIds.length === 0}
            >
              确认新增
            </Button>
          </div>
        }
      >
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {batchDirectoryMode === "chapter" ? (
            chapterTree ? (
              <SearchableTree
                data={chapterTree}
                title="选择章节"
                accent="gold"
                checkable
                checkedIds={batchDirectoryIds}
                onCheck={setBatchDirectoryIds}
                searchPlaceholder="搜索章节..."
              />
            ) : (
              <div className="flex justify-center py-10"><Spinner size={20} /></div>
            )
          ) : knowledgeTree ? (
            <SearchableTree
              data={knowledgeTree}
              title="选择知识点"
              accent="teal"
              checkable
              checkedIds={batchDirectoryIds}
              onCheck={setBatchDirectoryIds}
              searchPlaceholder="搜索知识点..."
            />
          ) : (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          )}
        </div>
      </Modal>

      {/* 分享弹窗 */}
      <Modal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="分享资源"
        description={shareTarget?.resourceTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShareTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleShare} loading={sharing}>
              <Share2 className="w-4 h-4" />
              确认分享
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-ink-700 mb-2">分享范围</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "school", label: "本校", desc: "校内教师可见" },
                { value: "friends", label: "好友", desc: "指定教师" },
                { value: "public", label: "平台公开", desc: "全平台可见" },
              ] as { value: ShareScope; label: string; desc: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setShareScope(opt.value)}
                  className={cn(
                    "p-2.5 rounded-md border text-left transition-all",
                    shareScope === opt.value
                      ? "border-gold-300 bg-gold-50"
                      : "border-ink-200 bg-paper hover:border-ink-300",
                  )}
                >
                  <div className="text-sm font-medium text-ink-800">{opt.label}</div>
                  <div className="text-[10px] text-ink-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="附言（可选）"
            placeholder="给接收者留一句话..."
            value={shareMessage}
            onChange={(e) => setShareMessage(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>

      {/* 捐赠题目查重与合并 */}
      <Modal
        open={!!donationCheck && donationCheck.conflicts.length > 0}
        onClose={() => {
          setDonationCheck(null);
          setPendingDonationItems([]);
          setDonationDecisions({});
        }}
        title="题目查重"
        description="以下题目与平台现有题目的相似度超过 80%。题干只能二选一，答案、解析、总结可复选并保留为第二项。"
        size="full"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDonationCheck(null);
                setPendingDonationItems([]);
                setDonationDecisions({});
              }}
            >
              取消
            </Button>
            <Button
              variant="gold"
              loading={donating}
              onClick={() => completeDonation(pendingDonationItems, Object.values(donationDecisions))}
            >
              <Gift className="w-4 h-4" />
              确认捐赠
            </Button>
          </div>
        }
      >
        <div className="space-y-5 max-h-[68vh] overflow-y-auto pr-1">
          {donationCheck?.conflicts.map((conflict) => {
            const decision = donationDecisions[conflict.item.resourceId];
            if (!decision) return null;
            const fieldRows = [
              { key: "stem", label: "题干", source: conflict.sourceQuestion.stem, target: conflict.targetQuestion.stem },
              { key: "answer", label: "答案", source: conflict.sourceQuestion.answer, target: conflict.targetQuestion.answer },
              { key: "analysis", label: "解析", source: conflict.sourceQuestion.analysis, target: conflict.targetQuestion.analysis },
              { key: "summary", label: "总结", source: conflict.sourceQuestion.summary || "（无）", target: conflict.targetQuestion.summary || "（无）" },
            ] as const;
            return (
              <Card key={conflict.item.resourceId} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="font-medium text-ink-900">相似题目比较</div>
                    <div className="text-xs text-ink-500 mt-1">
                      相似度 {(conflict.similarity * 100).toFixed(1)}% · 平台贡献者：{conflict.targetDonorNickname}
                    </div>
                  </div>
                  <div className="flex rounded-md border border-ink-200 overflow-hidden">
                    {([
                      { value: "new", label: "作为新题新增" },
                      { value: "merge", label: "合并到现有题" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          action: option.value,
                        }))}
                        className={cn(
                          "px-3 py-1.5 text-xs transition-colors",
                          decision.action === option.value
                            ? "bg-gold-400 text-ink-900"
                            : "bg-paper text-ink-600 hover:bg-mist",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[88px_1fr_1fr] gap-2 text-xs">
                  <div />
                  <div className="font-medium text-ink-600 px-2">本次捐赠</div>
                  <div className="font-medium text-ink-600 px-2">平台现有</div>
                  {fieldRows.map((field) => (
                    <div key={field.key} className="contents">
                      <div className="font-medium text-ink-700 py-2">{field.label}</div>
                      <button
                        disabled={decision.action !== "merge"}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          fields: {
                            ...current.fields,
                            [field.key]: field.key === "stem"
                              ? "source"
                              : current.fields[field.key] === "both"
                                ? "target"
                                : current.fields[field.key] === "target"
                                  ? "both"
                                  : "source",
                          },
                        }))}
                        className={cn(
                          "text-left p-2 rounded-md border whitespace-pre-wrap break-words",
                          decision.action === "merge" && ["source", "both"].includes(decision.fields[field.key])
                            ? "border-gold-400 bg-gold-50"
                            : "border-ink-100 bg-mist/40",
                          decision.action !== "merge" && "opacity-60 cursor-default",
                        )}
                      >
                        {field.source}
                      </button>
                      <button
                        disabled={decision.action !== "merge"}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          fields: {
                            ...current.fields,
                            [field.key]: field.key === "stem"
                              ? "target"
                              : current.fields[field.key] === "both"
                                ? "source"
                                : current.fields[field.key] === "source"
                                  ? "both"
                                  : "target",
                          },
                        }))}
                        className={cn(
                          "text-left p-2 rounded-md border whitespace-pre-wrap break-words",
                          decision.action === "merge" && ["target", "both"].includes(decision.fields[field.key])
                            ? "border-gold-400 bg-gold-50"
                            : "border-ink-100 bg-mist/40",
                          decision.action !== "merge" && "opacity-60 cursor-default",
                        )}
                      >
                        {field.target}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Modal>

      {/* 课后反思查看弹窗 */}
      <Modal
        open={!!viewingReflections}
        onClose={() => setViewingReflections(null)}
        title="课后反思"
        description={viewingReflections?.title}
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setViewingReflections(null)}>关闭</Button>
          </div>
        }
      >
        {viewingReflections && viewingReflections.list.length > 0 ? (
          <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
            {viewingReflections.list.map((r) => (
              <div key={r.id} className="p-3 rounded-md border border-gold-200 bg-gold-50/40">
                <div className="flex items-center gap-2 mb-1.5">
                  {r.rating && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-3.5 h-3.5",
                            i < r.rating!
                              ? "fill-gold-500 text-gold-500"
                              : "text-ink-200",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-[11px] text-ink-400 ml-auto">{timeAgo(r.createdAt)}</span>
                </div>
                <div className="text-sm text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {r.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-ink-400">
            <MessageSquareText className="w-10 h-10 mx-auto mb-2 text-ink-200" />
            暂无课后反思
          </div>
        )}
      </Modal>

      {/* 创建副本弹窗 */}
      <Modal
        open={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        title="创建副本"
        description={duplicateTarget?.originalTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDuplicateTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="w-4 h-4" />
              确认创建副本
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="新标题"
            value={duplicateTitle}
            onChange={(e) => setDuplicateTitle(e.target.value)}
            placeholder="输入新资源标题"
          />
          <div className="p-2.5 rounded-md bg-teal-50/60 border border-teal-200 text-xs text-teal-800 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              创建副本会生成一个新的资源，并自动复制所有关联的课后反思。
            </div>
          </div>
        </div>
      </Modal>

      {/* 新建资源篮弹窗 */}
      <Modal
        open={creatingBasket}
        onClose={() => {
          setCreatingBasket(false);
          setNewBasketName("");
          setNewBasketClassIds([]);
          setNewBasketStudentIds([]);
        }}
        size="lg"
        title="新建资源篮"
        description="创建资源篮并选择它面向的班级或具体学生"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreatingBasket(false);
                setNewBasketName("");
                setNewBasketClassIds([]);
                setNewBasketStudentIds([]);
              }}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleCreateBasket}
              loading={isCreatingBasket}
              disabled={!newBasketName.trim() || newBasketClassIds.length + newBasketStudentIds.length === 0}
            >
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="资源篮名称"
            value={newBasketName}
            onChange={(e) => setNewBasketName(e.target.value)}
            placeholder="输入资源篮名称"
            autoFocus
          />
          <BasketAudiencePicker
            classes={audienceClasses}
            students={audienceStudents}
            classIds={newBasketClassIds}
            studentIds={newBasketStudentIds}
            onChange={({ classIds, studentIds }) => {
              setNewBasketClassIds(classIds);
              setNewBasketStudentIds(studentIds);
            }}
          />
        </div>
      </Modal>

      <Modal
        open={editingBasketAudience}
        onClose={() => setEditingBasketAudience(false)}
        size="lg"
        title="调整资源篮使用对象"
        description={selectedBasket ? `资源篮：${selectedBasket.name}` : undefined}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="ghost"
              onClick={() => {
                setDraftBasketClassIds([]);
                setDraftBasketStudentIds([]);
              }}
            >
              清空选择
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingBasketAudience(false)}>取消</Button>
              <Button variant="gold" onClick={handleSaveBasketAudience} loading={savingBasketAudience}>
                保存
              </Button>
            </div>
          </div>
        }
      >
        <BasketAudiencePicker
          classes={audienceClasses}
          students={audienceStudents}
          classIds={draftBasketClassIds}
          studentIds={draftBasketStudentIds}
          onChange={({ classIds, studentIds }) => {
            setDraftBasketClassIds(classIds);
            setDraftBasketStudentIds(studentIds);
          }}
        />
      </Modal>

      {/* AI 拆解审阅弹窗 */}
      {extractModal && (
        <ExtractReviewModal
          open={extractModal.open}
          onClose={() => setExtractModal(null)}
          resourceId={extractModal.resourceId}
          resourceType={extractModal.resourceType}
          resourceTitle={extractModal.resourceTitle}
          chapterIds={extractModal.chapterIds}
          knowledgePointIds={extractModal.knowledgePointIds}
          grade={extractModal.grade}
          schoolYear={extractModal.schoolYear}
          semester={extractModal.semester}
          onConfirmed={handleExtractConfirmed}
        />
      )}
    </div>
  );
}

// ============ 题目列表项组件 ============
interface QuestionListItemProps {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export function QuestionListItem({ question, expanded, onToggle, onShare, onDelete }: QuestionListItemProps) {
  const { teacher } = useAuthStore();
  const { getLabel: getQuestionTypeLabel } = useQuestionTypeOptions(teacher?.schoolId);
  const difficultyVariant =
    question.difficulty <= 2
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : question.difficulty <= 3
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : "bg-red-50 text-red-700 border border-red-200";

  return (
    <div className="card-base p-4 hover:shadow-cardHover transition-all group">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 p-0.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700 flex-shrink-0"
          title={expanded ? "收起" : "展开"}
        >
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="tag-ink">{getQuestionTypeLabel(question.type)}</span>
            <span className={cn("tag-base", difficultyVariant)}>
              {difficultyLabel[question.difficulty]}
            </span>
            {question.duplicateHash && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                <Sparkles className="w-3 h-3" />
                已查重
              </span>
            )}
            {question.isShared && <span className="tag-teal">共享</span>}
            {question.recommendation >= 4 && <span className="tag-gold">推荐</span>}
          </div>

          <div
            className="text-sm text-ink-900 leading-relaxed mb-1"
            onClick={onToggle}
            role="button"
          >
            <MathHtml>{question.stem}</MathHtml>
          </div>

          {question.options && question.options.length > 0 && expanded && (
            <div className="text-xs text-ink-600 space-y-0.5 mb-2 mt-2 bg-mist/40 p-2 rounded">
              {question.options.map((opt, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="font-mono font-semibold flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <MathHtml className="min-w-0">{opt}</MathHtml>
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="text-xs text-ink-600 space-y-1.5 mt-2 bg-mist/40 p-2 rounded">
              <div>
                <span className="text-ink-400">答案：</span>
                <MathHtml className="text-ink-800">{question.answer}</MathHtml>
              </div>
              {question.analysis && (
                <div>
                  <span className="text-ink-400">解析：</span>
                  <MathHtml className="text-ink-700">{question.analysis}</MathHtml>
                </div>
              )}
              {question.remark && (
                <div>
                  <span className="text-ink-400">备注：</span>
                  <span className="text-ink-700">{question.remark}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400 mt-2">
            <span>使用 {question.usageCount} 次</span>
            {question.grade && <span>年级：{question.grade}</span>}
            <span className="ml-auto">{timeAgo(question.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={onShare}
            className="p-1.5 rounded text-ink-400 hover:bg-teal-50 hover:text-teal-700"
            title="分享"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 资源卡片组件 ============
interface ResourceCardProps {
  title: string;
  description?: string;
  meta: { label: string; value: string }[];
  content?: string;
  updatedAt: string;
  onClick?: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  onAddToLesson?: () => void;
  onDuplicate?: () => void;
  onViewReflections?: () => void;
  reflections?: Reflection[];
  fileUrl?: string;
  type?: string;
  showAddToLesson?: boolean;
  showAddToBasket?: boolean;
  basketResourceType?: "material" | "courseware";
  basketResourceId?: string;
  onBasketChanged?: () => void;
  className?: string;
  titleBadge?: { text: string; variant: "gold" | "teal" | "ink" | "red" | "green" | "amber" | "default" };
  selected?: boolean;
  donated?: boolean;
  donationLocked?: boolean;
  onToggleSelection?: () => void;
}

function ResourceCard({ title, description, meta, content, updatedAt, onClick, onShare, onDelete, onAddToLesson, onDuplicate, onViewReflections, reflections, fileUrl, type, showAddToLesson, showAddToBasket, basketResourceType, basketResourceId, onBasketChanged, className, titleBadge, selected, donated, donationLocked, onToggleSelection }: ResourceCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isImage = (type === "image");
  const reflectionCount = reflections?.length || 0;
  const latestReflection = reflections?.[0];
  return (
    <>
      <div className={cn(
        "card-base p-4 hover:shadow-cardHover transition-all group",
        selected && "ring-2 ring-gold-300/60 bg-gold-50/20",
        className,
      )}>
        <div className="flex items-start gap-3">
          {onToggleSelection && (
            <button
              onClick={onToggleSelection}
              className={cn(
                "mt-0.5 rounded p-0.5 flex-shrink-0 transition-colors",
                selected ? "text-gold-600" : "text-ink-300 hover:text-gold-600",
              )}
              title={selected ? "取消选择" : "选择资源"}
            >
              {selected
                ? <CheckSquare className="w-4 h-4" />
                : <Square className="w-4 h-4" />}
            </button>
          )}
          {isImage && fileUrl && (
            <div
              onClick={() => setPreviewOpen(true)}
              className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-ink-100 cursor-pointer hover:border-gold-300 transition-colors"
            >
              <img src={fileUrl} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div
              className={cn("font-medium text-ink-900 mb-1 flex items-center gap-2", onClick && "cursor-pointer hover:text-gold-700")}
              onClick={onClick}
            >
              <span>{title}</span>
              {titleBadge && <Badge variant={titleBadge.variant}>{titleBadge.text}</Badge>}
            </div>
            {description && (
              <div className="text-xs text-ink-500 mb-2 line-clamp-1">{description}</div>
            )}
            {content && !isImage && (
              <div className="text-xs text-ink-600 mb-2 line-clamp-2 leading-relaxed bg-mist/40 p-2 rounded">
                {content}
              </div>
            )}
            {/* 关联课后反思预览 */}
            {reflectionCount > 0 && (
              <div
                onClick={onViewReflections}
                className="mb-2 p-2 rounded-md bg-gold-50/60 border border-gold-200 cursor-pointer hover:bg-gold-50 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs text-gold-800 mb-0.5">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  <span className="font-medium">课后反思 · {reflectionCount} 条</span>
                  {latestReflection?.rating && (
                    <span className="flex items-center gap-0.5 ml-1">
                      <Star className="w-3 h-3 fill-gold-500 text-gold-500" />
                      <span>{latestReflection.rating}</span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-600 line-clamp-1 pl-5">
                  {latestReflection?.content}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
              {meta.map((m, i) => (
                <span key={i}>
                  <span className="text-ink-300">{m.label}：</span>
                  <span className="text-ink-600">{m.value}</span>
                </span>
              ))}
              <span className="ml-auto text-ink-300">{timeAgo(updatedAt)}</span>
            </div>
            {showAddToBasket && basketResourceType && basketResourceId && (
              <div className="mt-3 pt-3 border-t border-ink-50">
                <AddToBasketDropdown
                  resourceType={basketResourceType}
                  resourceId={basketResourceId}
                  resourceTitle={title}
                  size="sm"
                  variant="outline"
                  onAdded={onBasketChanged}
                />
              </div>
            )}
          </div>
          <div className="flex items-start gap-2 flex-shrink-0">
            {donated && <Badge variant="teal">已捐赠</Badge>}
            {donationLocked && <Badge variant="ink">平台副本</Badge>}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onClick && (
              <button
                onClick={onClick}
                className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
                title="查看/编辑"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            {isImage && (
              <button
                onClick={() => setPreviewOpen(true)}
                className="p-1.5 rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600"
                title="预览图片"
              >
                <Eye className="w-4 h-4" />
              </button>
            )}
            {onShare && (
              <button
                onClick={onShare}
                className="p-1.5 rounded text-ink-400 hover:bg-teal-50 hover:text-teal-700"
                title="分享"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}
            {showAddToLesson && onAddToLesson && (
              <button
                onClick={onAddToLesson}
                className="p-1.5 rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600"
                title="添加到上课"
              >
                <PlayCircle className="w-4 h-4" />
              </button>
            )}
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="p-1.5 rounded text-ink-400 hover:bg-indigo-50 hover:text-indigo-700"
                title="创建副本"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* 图片预览弹窗 */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={title}
        size="lg"
        footer={null}
      >
        <div className="flex items-center justify-center py-4">
          <img
            src={fileUrl}
            alt={title}
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
          />
        </div>
      </Modal>
    </>
  );
}

// ============ 筛选下拉组件 ============
function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all",
          value
            ? "bg-gold-50 border-gold-300 text-gold-800"
            : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
        )}
      >
        <span>{label}</span>
        {value && <span className="font-medium">· {options.find((o) => o.value === value)?.label}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-36 bg-paper border border-ink-100 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-mist transition-colors",
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
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-mist transition-colors",
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
