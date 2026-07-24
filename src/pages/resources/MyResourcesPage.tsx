import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, FileQuestion, BookOpen, Lightbulb,
  Calendar, Eye, Presentation, FileBox,
  ArrowUpDown, Clock, ChevronDown, ChevronRight,
  FileSpreadsheet, Sparkles, Trash2, Share2, Upload, Filter, Library, FileText, Download,
  PlayCircle, Copy, MessageSquareText, Star,
  ShoppingCart, CheckSquare, Square, Plus, X,
  Archive, Layout,
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
import { knowledgeService } from "@/services/knowledge";
import { reflectionService } from "@/services/reflection";
import { basketService } from "@/services/basket";
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
  CoursewareType, MaterialType, QuestionType, ShareableResourceType,
  Reflection, Basket,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { genId } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import QuestionBankPage from "@/pages/question-bank/QuestionBankPage";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { ExtractReviewModal } from "@/components/extract/ExtractReviewModal";
import { Badge } from "@/components/ui/Badge";

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

const questionTypeLabel: Record<QuestionType, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

const coursewareTypeLabel: Record<CoursewareType, string> = {
  ppt: "PPT",
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

  const gradeOptions = [
    { value: "高一", label: "高一" },
    { value: "高二", label: "高二" },
    { value: "高三", label: "高三" },
    { value: "初一", label: "初一" },
    { value: "初二", label: "初二" },
    { value: "初三", label: "初三" },
  ];
  const yearOptions = [
    { value: "2025-2026", label: "2025-2026" },
    { value: "2024-2025", label: "2024-2025" },
    { value: "2023-2024", label: "2023-2024" },
  ];

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

  // 课后反思相关：targetId -> 反思列表
  const [reflectionsMap, setReflectionsMap] = useState<Record<string, Reflection[]>>({});
  const [viewingReflections, setViewingReflections] = useState<{
    title: string;
    list: Reflection[];
  } | null>(null);

  // 另存为弹窗
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
  const [creatingBasket, setCreatingBasket] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");

  const schoolId = teacher?.schoolId || "sch-1";

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
    };
    try {
      const [qData, lecData, examData, cwData, matData] = await Promise.all([
        questionService.listQuestions({ ...baseFilter, teacherId: teacher?.id }),
        lectureService.listLectures({ ...baseFilter, teacherId: teacher?.id }),
        examPaperService.listPapers({ ...baseFilter, teacherId: teacher?.id }),
        coursewareService.listCoursewares({ ...baseFilter, teacherId: teacher?.id }),
        materialService.listMaterials({ ...baseFilter, teacherId: teacher?.id }),
      ]);
      setQuestions(qData);
      setLectures(lecData);
      setExamPapers(examData);
      setCoursewares(cwData);
      setMaterials(matData);
      // 保存完整列表（含拆解副本），用于查找源资源的拆解副本
      setAllExamPapers(examData);
      setAllLectures(lecData);
      // 加载试卷/讲义/课件的课后反思（仅按 targetId 关联）
      const reflectionTargets: string[] = [
        ...examData.map((r) => r.id),
        ...lecData.map((r) => r.id),
        ...cwData.map((r) => r.id),
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
  }, [keyword, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, schoolId, selectedGrade, selectedYear, teacher]);

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
    if (!selectedBasketId) {
      setBasketQuestions([]);
      setBasketMaterials([]);
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
      return;
    }
    basketService.getBasket(selectedBasketId).then(async (basket) => {
      if (!basket) return;
      const [qs, ms] = await Promise.all([
        questionService.listQuestions({ ids: basket.questionIds }),
        materialService.listMaterials({ ids: basket.materialIds }),
      ]);
      setBasketQuestions(qs);
      setBasketMaterials(ms);
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
    });
  }, [selectedBasketId]);

  const loadBaskets = useCallback(async () => {
    if (!teacher) return;
    const list = await basketService.listBaskets(teacher.id);
    setBaskets(list);
  }, [teacher]);

  const handleCreateBasket = async () => {
    if (!teacher || !newBasketName.trim()) return;
    setCreatingBasket(true);
    try {
      await basketService.createBasket(teacher.id, newBasketName.trim());
      toast.success(`已创建资源篮「${newBasketName.trim()}」`);
      setNewBasketName("");
      loadBaskets();
    } catch (e: any) {
      toast.error("创建失败", e?.message);
    } finally {
      setCreatingBasket(false);
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

  const selectAllQuestions = () => {
    if (selectedQuestionIds.size === basketQuestions.length) {
      setSelectedQuestionIds(new Set());
    } else {
      setSelectedQuestionIds(new Set(basketQuestions.map((q) => q.id)));
    }
  };

  const selectAllMaterials = () => {
    if (selectedMaterialIds.size === basketMaterials.length) {
      setSelectedMaterialIds(new Set());
    } else {
      setSelectedMaterialIds(new Set(basketMaterials.map((m) => m.id)));
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
      grade: selectedQs[0]?.grade || "高一",
      schoolYear: selectedQs[0]?.schoolYear || "2025-2026",
      classIds: [],
      studentIds: [],
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
      grade: selectedQs[0]?.grade || "高一",
      schoolYear: selectedQs[0]?.schoolYear || "2025-2026",
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
        grade: "高一",
        schoolYear: "2025-2026",
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
        grade: "高一",
        schoolYear: "2025-2026",
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
      let msg: string;
      if (duplicateTarget.type === "examPaper") {
        await examPaperService.duplicatePaper(duplicateTarget.id, duplicateTitle.trim() || undefined);
        msg = "试卷已另存为副本";
      } else if (duplicateTarget.type === "lecture") {
        await lectureService.duplicateLecture(duplicateTarget.id, duplicateTitle.trim() || undefined);
        msg = "讲义已另存为副本";
      } else {
        await coursewareService.duplicateCourseware(duplicateTarget.id, duplicateTitle.trim() || undefined);
        msg = "课件已另存为副本";
      }
      toast.success("已另存为", `${msg}，课后反思已同步复制`);
      setDuplicateTarget(null);
      loadAll();
    } catch (e: any) {
      toast.error("另存为失败", e?.message);
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="我的资源"
        description="统一管理我的题库、试卷库、讲义库、课件库、素材库"
        icon={<Library className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={() => navigate("/upload")}>
            <Upload className="w-4 h-4" />
            上传资源
          </Button>
        }
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
        <QuestionBankPage />
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
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm">
                    <span className="font-medium text-ink-800">
                      {baskets.find((b) => b.id === selectedBasketId)?.name}
                    </span>
                    <span className="text-ink-400 ml-2">
                      共 {basketQuestions.length} 题 · {basketMaterials.length} 素材
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-ink-100">
                      <div className="text-sm font-medium text-ink-700 flex items-center gap-1.5">
                        <FileQuestion className="w-4 h-4" />
                        题目（{basketQuestions.length}）
                      </div>
                      <button
                        onClick={selectAllQuestions}
                        className="text-xs text-ink-500 hover:text-gold-600"
                      >
                        {selectedQuestionIds.size === basketQuestions.length ? "取消全选" : `全选 (${basketQuestions.length})`}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {basketQuestions.map((q) => (
                        <div
                          key={q.id}
                          className={cn(
                            "p-3 rounded-md border transition-all flex items-start gap-2",
                            selectedQuestionIds.has(q.id)
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
                            <div className="flex items-center gap-2 mb-1">
                              <span className="tag-gold">{questionTypeLabel[q.type]}</span>
                              <span className="text-xs text-ink-400">难度：{difficultyLabel[q.difficulty]}</span>
                            </div>
                            <div className="text-sm text-ink-800 line-clamp-2">{q.stem}</div>
                          </div>
                        </div>
                      ))}
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
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "chapter" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                章节目录
              </button>
              <button
                onClick={() => setLeftTab("knowledge")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "knowledge" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <Lightbulb className="w-3.5 h-3.5" />
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
                    出讲义
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
                label="年份"
                value={selectedYear}
                options={yearOptions}
                onChange={setSelectedYear}
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
                      title={mainLecture.title}
                      description={mainLecture.description || (hasExtractCopy ? "文档拆解生成的正稿，可编辑替换其中的题目和知识块" : undefined)}
                      meta={[
                        { label: "年级", value: `${mainLecture.grade} · ${mainLecture.schoolYear}` },
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
                          <a
                            href={item.originalFileUrl}
                            download={item.originalFileName}
                            className="text-gold-600 hover:text-gold-700 flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            下载
                          </a>
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
                    {hasExtractCopy && (
                      <div className="ml-8">
                        <div className="text-xs text-ink-400 mb-1 flex items-center gap-1">
                          <Archive className="w-3 h-3" />
                          原稿备份
                        </div>
                        <ResourceCard
                          title={item.title}
                          description={item.description}
                          meta={[
                            { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                            { label: "内容", value: `${item.sections.length} 节` },
                            { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                          ]}
                          updatedAt={item.updatedAt}
                          className="opacity-90 bg-ink-50/30"
                          onClick={() => navigate(`/resources/preview/${item.id}?type=lecture`)}
                          onShare={() => handleOpenShare("lecture", item.id, item.title)}
                          onDelete={() => handleDelete(item.id)}
                        />
                        {item.originalFileUrl && (
                          <div className="flex items-center gap-2 text-xs mt-2 pl-1">
                            <FileText className="w-3.5 h-3.5 text-ink-400" />
                            <span className="text-ink-500">{item.originalFileName}</span>
                            <a
                              href={item.originalFileUrl}
                              download={item.originalFileName}
                              className="text-gold-600 hover:text-gold-700 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              下载
                            </a>
                          </div>
                        )}
                      </div>
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
                        title={copy.title}
                        description={copy.description || "文档拆解生成的副本，可编辑替换其中的题目和知识块"}
                        meta={[
                          { label: "年级", value: `${copy.grade} · ${copy.schoolYear}` },
                          { label: "题目", value: `${copy.questions.length} 题` },
                          { label: "总分", value: `${copy.totalScore} 分` },
                          { label: "时长", value: `${copy.duration} 分钟` },
                          { label: "状态", value: copy.status === "published" ? "已发布" : "草稿" },
                        ]}
                        updatedAt={copy.updatedAt}
                        reflections={reflectionsMap[copy.id]}
                        onClick={() => navigate(`/exam-papers/${copy.id}/preview`)}
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
                          title={item.title}
                          description={item.description}
                          meta={[
                            { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
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
                              <a
                                href={item.originalFileUrl}
                                download={item.originalFileName}
                                className="text-gold-600 hover:text-gold-700 flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                下载
                              </a>
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
                    {hasExtractCopy && (
                      <div className="ml-8">
                        <div className="text-xs text-ink-400 mb-1 flex items-center gap-1">
                          <Archive className="w-3 h-3" />
                          原稿备份
                        </div>
                        <ResourceCard
                          title={item.title}
                          description={item.description}
                          meta={[
                            { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                            { label: "题目", value: `${item.questions.length} 题` },
                            { label: "总分", value: `${item.totalScore} 分` },
                            { label: "时长", value: `${item.duration} 分钟` },
                            { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                          ]}
                          updatedAt={item.updatedAt}
                          className="opacity-90 bg-ink-50/30"
                          onClick={() => navigate(`/resources/preview/${item.id}?type=examPaper`)}
                          onShare={() => handleOpenShare("examPaper", item.id, item.title)}
                          onDelete={() => handleDelete(item.id)}
                        />
                        {item.originalFileUrl && (
                          <div className="flex items-center gap-2 text-xs mt-2 pl-1">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-ink-400" />
                            <span className="text-ink-500">{item.originalFileName}</span>
                            <a
                              href={item.originalFileUrl}
                              download={item.originalFileName}
                              className="text-gold-600 hover:text-gold-700 flex items-center gap-1"
                            >
                              <Download className="w-3 h-3" />
                              下载
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 课件库 */}
              {activeTab === "courseware" && (displayedData as Courseware[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: coursewareTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
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
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: materialTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
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

      {/* 另存为弹窗 */}
      <Modal
        open={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        title="另存为"
        description={duplicateTarget?.originalTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDuplicateTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="w-4 h-4" />
              确认另存为
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
              另存为会创建一个新的资源副本，并自动复制所有关联的课后反思到新资源。
            </div>
          </div>
        </div>
      </Modal>

      {/* 新建资源篮弹窗 */}
      <Modal
        open={creatingBasket}
        onClose={() => { setCreatingBasket(false); setNewBasketName(""); }}
        title="新建资源篮"
        description="创建一个新的资源篮来收集题目和素材"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreatingBasket(false); setNewBasketName(""); }}>取消</Button>
            <Button variant="gold" onClick={handleCreateBasket} loading={creatingBasket} disabled={!newBasketName.trim()}>
              创建
            </Button>
          </div>
        }
      >
        <Input
          label="资源篮名称"
          value={newBasketName}
          onChange={(e) => setNewBasketName(e.target.value)}
          placeholder="输入资源篮名称"
          autoFocus
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

function QuestionListItem({ question, expanded, onToggle, onShare, onDelete }: QuestionListItemProps) {
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
            <span className="tag-ink">{questionTypeLabel[question.type]}</span>
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
            className={cn("text-sm text-ink-900 leading-relaxed mb-1", !expanded && "line-clamp-2")}
            onClick={onToggle}
            role="button"
          >
            {question.stem}
          </div>

          {question.options && question.options.length > 0 && expanded && (
            <div className="text-xs text-ink-600 space-y-0.5 mb-2 mt-2 bg-mist/40 p-2 rounded">
              {question.options.map((opt, i) => (
                <div key={i}>
                  {String.fromCharCode(65 + i)}. {opt}
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="text-xs text-ink-600 space-y-1.5 mt-2 bg-mist/40 p-2 rounded">
              <div>
                <span className="text-ink-400">答案：</span>
                <span className="text-ink-800">{question.answer}</span>
              </div>
              {question.analysis && (
                <div>
                  <span className="text-ink-400">解析：</span>
                  <span className="text-ink-700">{question.analysis}</span>
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
}

function ResourceCard({ title, description, meta, content, updatedAt, onClick, onShare, onDelete, onAddToLesson, onDuplicate, onViewReflections, reflections, fileUrl, type, showAddToLesson, showAddToBasket, basketResourceType, basketResourceId, onBasketChanged, className, titleBadge }: ResourceCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const isImage = (type === "image");
  const reflectionCount = reflections?.length || 0;
  const latestReflection = reflections?.[0];
  return (
    <>
      <div className={cn("card-base p-4 hover:shadow-cardHover transition-all group", className)}>
        <div className="flex items-start gap-3">
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
                title="另存为"
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
