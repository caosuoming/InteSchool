import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Save, Eye, Edit3, Plus, Trash2, ShoppingBasket,
  FileSpreadsheet, GraduationCap, Clock, Users, Send,
  ChevronUp, ChevronDown, Library, Files, FileText, ListOrdered,
  BarChart3, CheckCircle2, AlertCircle, Lock, Calendar, Layout,
  Sparkles, BookOpen, Lightbulb, Printer,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { examPaperService } from "@/services/examPaper";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import { lectureService } from "@/services/lecture";
import { classService as classSvc } from "@/services/class";
import { examPublishService } from "@/services/examPublish";
import { knowledgeService } from "@/services/knowledge";
import { analyticsService, type DateRange } from "@/services/analytics";
import { settingsService } from "@/services/settings";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuestionCard } from "@/components/question/QuestionCard";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { ExamPaper, ExamPaperQuestion, Question, Basket, AnyClass, Lecture, ExamPublication, TreeNode, Student, SchoolClass, PersonalClass, ExamPaperType } from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";

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

type AddSource = "basket" | "bank" | "examPaper" | "lecture";

export default function ExamPaperEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPreview = searchParams.get("preview") === "1";
  const [isPreview, setIsPreview] = useState(initialPreview);
  const [paperSize, setPaperSize] = useState<"A4" | "8K">("A4");
  const { teacher } = useAuthStore();

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [questions, setQuestions] = useState<Record<string, Question>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 编辑状态
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("高一");
  const [schoolYear, setSchoolYear] = useState("2025-2026");
  const [typeId, setTypeId] = useState<string>("");
  const [examPaperTypes, setExamPaperTypes] = useState<ExamPaperType[]>([]);
  const [duration, setDuration] = useState(90);
  const [paperQuestions, setPaperQuestions] = useState<ExamPaperQuestion[]>([]);

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

  // 添加题目
  const [addSource, setAddSource] = useState<AddSource | null>(null);
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

  // 学生选择 + 时间周期 + 已做题目
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("all");
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");

  const dateRange = useMemo(() => getDateRange(timeRangeKey), [timeRangeKey]);

  const schoolId = teacher?.schoolId || "sch-1";

  const loadPaper = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const p = await examPaperService.getPaper(id);
    if (!p) {
      toast.error("试卷不存在");
      navigate("/my-resources");
      return;
    }
    setPaper(p);
    setTitle(p.title);
    setDescription(p.description || "");
    setGrade(p.grade);
    setSchoolYear(p.schoolYear);
    setTypeId(p.typeId || "");
    setDuration(p.duration);
    setPaperQuestions(p.questions);
    setSelectedStudentIds(p.studentIds || []);
    // 加载关联题目
    const qMap: Record<string, Question> = {};
    const qIds = p.questions.map((q) => q.questionId).filter(Boolean) as string[];
    if (qIds.length > 0) {
      const all = await questionService.listQuestions({ schoolId });
      all.forEach((q) => { if (qIds.includes(q.id)) qMap[q.id] = q; });
    }
    setQuestions(qMap);
    setLoading(false);
  }, [id, navigate, schoolId]);

  useEffect(() => {
    loadPaper();
    if (teacher) {
      basketService.listBaskets(teacher.id).then(setBaskets);
      classSvc.listAllClasses(schoolId, teacher.id).then(setClasses);
      // 加载学校班级、个人班级、学生列表（用于学生选择器）
      classSvc.listSchoolClasses(schoolId).then(setSchoolClasses);
      classSvc.listPersonalClasses(teacher.id).then(setPersonalClasses);
      classSvc.listStudentsBySchool(schoolId).then(setStudents);
      // 加载试卷类型
      settingsService.listExamPaperTypes(schoolId).then((types) =>
        setExamPaperTypes(types.filter((t) => t.enabled)),
      );
    }
    // 加载发布记录
    examPublishService.listPublications(schoolId).then((pubs) => {
      if (id) {
        setPublications(pubs.filter((p) => p.examPaperId === id));
      }
    });
  }, [id, teacher, schoolId, loadPaper]);

  // 当学生或时间周期变化时，加载学生在该时间段内做过的题目 ID 集合
  useEffect(() => {
    if (selectedStudentIds.length === 0) {
      setAnsweredQuestionIds(new Set());
      return;
    }
    analyticsService
      .getAnsweredQuestionIds(selectedStudentIds, dateRange)
      .then(setAnsweredQuestionIds)
      .catch(() => setAnsweredQuestionIds(new Set()));
  }, [selectedStudentIds, dateRange]);

  const filteredStudents = useMemo(() => {
    if (!selectedClassId) return students;
    const pClass = personalClasses.find((c) => c.id === selectedClassId);
    if (pClass) {
      return students.filter((s) => pClass.studentIds.includes(s.id));
    }
    return students.filter((s) => s.classId === selectedClassId);
  }, [selectedClassId, students, personalClasses]);

  const getSelectedStudentNames = useCallback((): string => {
    if (selectedStudentIds.length === 0) return "";
    const selected = students.filter((s) => selectedStudentIds.includes(s.id));
    if (selected.length === 0) return `${selectedStudentIds.length}人`;
    if (selected.length <= 3) {
      return selected.map((s) => s.name).join("、");
    }
    return `${selected[0].name}等${selected.length}人`;
  }, [selectedStudentIds, students]);

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

  const totalScore = useMemo(() =>
    paperQuestions.reduce((sum, q) => sum + q.score, 0), [paperQuestions]);

  const examPaperFormat = useMemo(() => {
    const type = examPaperTypes.find((t) => t.id === typeId);
    return type?.format || "gaokao";
  }, [examPaperTypes, typeId]);

  // 加入默认试题篮
  const handleAddToDefaultBasket = async (questionId?: string) => {
    if (!teacher) return;
    const def = baskets.find((b) => b.isDefault);
    if (!def) { toast.error("未设置默认试题篮"); return; }
    const targetQId = questionId;
    if (!targetQId) { toast.error("该题未关联题库题目"); return; }
    await basketService.addQuestion(def.id, targetQId);
    const bs = await basketService.listBaskets(teacher.id);
    setBaskets(bs);
    toast.success("已加入默认试题篮");
  };

  const isInDefaultBasket = (questionId?: string) => {
    if (!questionId) return false;
    const def = baskets.find((b) => b.isDefault);
    return def?.questionIds?.includes(questionId) || false;
  };

  const handleRemoveFromDefault = async (questionId: string) => {
    if (!teacher) return;
    const def = baskets.find((b) => b.isDefault);
    if (!def) return;
    await basketService.removeQuestion(def.id, questionId);
    const bs = await basketService.listBaskets(teacher.id);
    setBaskets(bs);
    toast.success("已从默认试题篮移除");
  };

  // 编辑模式：调整顺序
  const handleMove = (idx: number, dir: "up" | "down") => {
    setPaperQuestions((prev) => {
      const next = [...prev];
      const target = dir === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // 编辑模式：删除题目
  const handleRemoveQuestion = (pqId: string) => {
    setPaperQuestions((prev) => prev.filter((q) => q.id !== pqId));
  };

  // 编辑模式：换题（替换某题的题库关联）
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null);
  const handleReplaceQuestion = (idx: number) => {
    setReplaceIdx(idx);
    setAddSource("bank");
  };

  // 编辑模式：修改分值
  const handleUpdateScore = (pqId: string, score: number) => {
    setPaperQuestions((prev) => prev.map((q) => q.id === pqId ? { ...q, score } : q));
  };

  // 添加题目确认
  const handleConfirmAdd = async () => {
    if (!addSource || selectedQuestionIds.length === 0) {
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

    if (replaceIdx !== null) {
      // 换题模式：替换指定位置
      if (toAdd.length === 0) { toast.error("未找到有效题目"); return; }
      const newQ = toAdd[0];
      setPaperQuestions((prev) => prev.map((pq, i) => {
        if (i !== replaceIdx) return pq;
        return {
          ...pq,
          questionId: newQ.id,
          stem: newQ.stem,
          options: newQ.options,
          answer: newQ.answer,
          analysis: newQ.analysis,
          type: newQ.type,
        };
      }));
      setQuestions((prev) => ({ ...prev, [newQ.id]: newQ }));
      toast.success("题目已替换");
      setReplaceIdx(null);
    } else {
      // 添加模式
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
      setPaperQuestions((prev) => [...prev, ...newPqs]);
      const newQMap = { ...questions };
      toAdd.forEach((q) => { newQMap[q.id] = q; });
      setQuestions(newQMap);
      toast.success(`已添加 ${toAdd.length} 道题目`);
    }

    setAddSource(null);
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedPaper(null);
    setSelectedLecture(null);
  };

  // 保存
  const handleSave = async () => {
    if (!paper || !title.trim()) { toast.error("请填写试卷标题"); return; }
    setSaving(true);
    try {
      const updated = await examPaperService.updatePaper(paper.id, {
        title, description, grade, schoolYear, duration,
        totalScore: totalScore,
        questions: paperQuestions,
        studentIds: selectedStudentIds,
        typeId: typeId || undefined,
      });
      setPaper(updated);
      toast.success("试卷已保存");
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  // 发布
  const handlePublish = async () => {
    if (!paper || !teacher) return;
    if (publishTargetClassIds.length === 0) {
      toast.error("请选择发布对象");
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

  // 调整大题型顺序
  const handleGroupMove = (groupType: string, dir: "up" | "down") => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  // ===== 预览模式 =====
  if (isPreview) {
    return (
      <div className="max-w-5xl mx-auto">
        <PageHeader
          title={paper?.title || title}
          description={`${grade} · ${schoolYear} · ${duration}分钟 · 共${paperQuestions.length}题 · 总分${totalScore}分`}
          icon={<FileSpreadsheet className="w-5 h-5" />}
          action={
            <div className="no-print flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate(`/exam-papers/${id}/answer-sheet`)}>
                <Layout className="w-4 h-4" />
                制作答题卡
              </Button>
              <Button variant="outline" onClick={() => setPublishOpen(true)}>
                <Send className="w-4 h-4" />
                选择发布对象
              </Button>
              <Button variant="gold" onClick={() => setIsPreview(false)}>
                <Edit3 className="w-4 h-4" />
                编辑试卷
              </Button>
            </div>
          }
        />

        {/* 版面选择 + 打印工具栏 */}
        <div className="no-print flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-500">版面：</span>
              <select
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as "A4" | "8K")}
                className="text-sm border border-ink-200 rounded-md px-2 py-1 bg-white text-ink-700 cursor-pointer focus:outline-none focus:border-gold-400"
              >
                <option value="A4">A4（单栏）</option>
                <option value="8K">8K（双栏）</option>
              </select>
            </div>
            {paperSize === "8K" && (
              <span className="text-xs text-ink-400">8K 默认两栏排版</span>
            )}
          </div>
          <Button variant="gold" onClick={() => window.print()}>
            <Printer className="w-4 h-4" />
            打印
          </Button>
        </div>

        {/* 难度分布概览 */}
        <Card className="no-print mb-6 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-gold-600" />
            <h3 className="font-serif font-semibold text-ink-900 text-sm">难度分布</h3>
            <span className="text-xs text-ink-400">共 {paperQuestions.length} 题</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((d) => {
              const count = difficultyStats[d];
              const pct = paperQuestions.length > 0 ? (count / paperQuestions.length) * 100 : 0;
              return (
                <div key={d} className="text-center">
                  <div className={cn(
                    "text-lg font-serif font-bold",
                    d <= 2 ? "text-emerald-600" : d === 3 ? "text-amber-600" : "text-red-600",
                  )}>
                    {count}
                  </div>
                  <div className="text-[10px] text-ink-500 mb-1">{difficultyLabel[d]}</div>
                  <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        d <= 2 ? "bg-emerald-400" : d === 3 ? "bg-amber-400" : "bg-red-400",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 发布状态 */}
        {publications.filter((p) => p.status === "active").length > 0 && (
          <Card className="no-print mb-6 p-4 border-l-4 border-gold-400">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="font-medium text-ink-900">试卷已发布</span>
              </div>
              <div className="flex items-center gap-2">
                {publications.filter((p) => p.status === "active").map((pub) => (
                  <div key={pub.id} className="flex items-center gap-3">
                    <div className="text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="green">发布中</Badge>
                        {pub.isFormalExam && pub.hasViewPassword && (
                          <Lock className="w-3 h-3 text-ink-400" />
                        )}
                      </div>
                      <div className="text-xs text-ink-500 mt-1">
                        发布给：{pub.targetClassIds.map((cid) => classes.find((c) => c.id === cid)?.name).filter(Boolean).join(", ") || "未知"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(pub.id)}
                      loading={revoking}
                    >
                      撤回发布
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* 纸张版面 */}
        <div className={cn("paper-sheet rounded-lg", paperSize === "8K" ? "paper-8k" : "paper-a4")}>
          <div className="paper-content p-10 print-area">
            {/* 试卷头 */}
            <div className="text-center mb-6 pb-4 border-b-2 border-ink-200">
              <h1 className="font-serif text-2xl font-bold text-ink-900 mb-2">{paper?.title}</h1>
              {description && <p className="text-sm text-ink-500 mb-2">{description}</p>}
              <div className="flex items-center justify-center gap-4 text-xs text-ink-500">
                <span>年级：{grade}</span>
                <span>学年：{schoolYear}</span>
                <span>时间：{duration}分钟</span>
                <span>满分：{totalScore}分</span>
              </div>
            </div>

            {/* 题目列表 */}
            {paperQuestions.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-10 h-10 text-ink-200" />}
                title="试卷暂无题目"
                description="切换到编辑模式添加题目"
              />
            ) : (
              <div className="space-y-6">
                {examPaperFormat === "gaokao" ? (
                  groupByType(paperQuestions, questions).map((group) => {
                    const groupScore = group.questions.reduce((sum, item) => sum + item.pq.score, 0);
                    return (
                      <div key={group.type}>
                        <div className="flex items-center gap-3 mb-4 pb-2 border-b border-ink-200">
                          <h2 className="font-serif text-lg font-bold text-ink-900">{group.label}</h2>
                          <span className="text-sm text-ink-500">共 {group.questions.length} 题</span>
                          <span className="text-sm text-gold-600 font-medium">共 {groupScore} 分</span>
                        </div>
                        <div className="space-y-4">
                          {group.questions.map((item) => (
                            <PreviewQuestionItem
                              key={item.pq.id}
                              pq={item.pq}
                              index={item.index}
                              question={item.question}
                              defaultBasket={baskets.find((b) => b.isDefault)}
                              isInDefaultBasket={isInDefaultBasket(item.pq.questionId)}
                              onAddToBasket={() => handleAddToDefaultBasket(item.pq.questionId)}
                              onRemoveFromBasket={() => item.pq.questionId && handleRemoveFromDefault(item.pq.questionId)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="space-y-4">
                    {paperQuestions.map((pq, index) => {
                      const q = pq.questionId ? questions[pq.questionId] : undefined;
                      return (
                        <PreviewQuestionItem
                          key={pq.id}
                          pq={pq}
                          index={index}
                          question={q}
                          defaultBasket={baskets.find((b) => b.isDefault)}
                          isInDefaultBasket={isInDefaultBasket(pq.questionId)}
                          onAddToBasket={() => handleAddToDefaultBasket(pq.questionId)}
                          onRemoveFromBasket={() => pq.questionId && handleRemoveFromDefault(pq.questionId)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
      </div>
    );
  }

  // ===== 编辑模式 =====
  return (
    <div>
      <PageHeader
        title={`编辑：${paper?.title || title}`}
        description="换题、调整顺序、添加题目"
        icon={<FileSpreadsheet className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/my-resources/exam-papers")}>
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
            <Button variant="outline" onClick={() => navigate(`/exam-papers/${id}/answer-sheet`)}>
              <Layout className="w-4 h-4" />
              制作答题卡
            </Button>
            <Button variant="outline" onClick={() => setIsPreview(true)}>
              <Eye className="w-4 h-4" />
              预览
            </Button>
            <Button variant="gold" onClick={handleSave} loading={saving}>
              <Save className="w-4 h-4" />
              保存
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {/* 左侧：属性 */}
        <div className="col-span-3">
          <Card className="p-4 sticky top-4 space-y-3">
            <h3 className="font-serif font-semibold text-ink-900 text-sm flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-gold-600" />
              试卷属性
            </h3>
            <Input label="标题" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea label="描述" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="年级"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                options={[
                  { value: "高一", label: "高一" }, { value: "高二", label: "高二" }, { value: "高三", label: "高三" },
                  { value: "初一", label: "初一" }, { value: "初二", label: "初二" }, { value: "初三", label: "初三" },
                ]}
              />
              <Input label="学年" value={schoolYear} onChange={(e) => setSchoolYear(e.target.value)} />
            </div>
            <Select
              label="试卷类型"
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              options={[
                { value: "", label: "未设置" },
                ...examPaperTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            <Input
              label="考试时长（分钟）"
              type="number"
              value={String(duration)}
              onChange={(e) => setDuration(Number(e.target.value))}
            />

            <div className="pt-3 border-t border-ink-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-500">总分</span>
                <span className="font-serif font-bold text-gold-600">{totalScore} 分</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-500">题数</span>
                <span className="font-medium text-ink-900">{paperQuestions.length} 题</span>
              </div>
              {/* 难度分布迷你 */}
              <div className="flex gap-1 mt-2">
                {[1, 2, 3, 4, 5].map((d) => (
                  <div key={d} className="flex-1 text-center">
                    <div className={cn(
                      "text-xs font-mono font-bold",
                      d <= 2 ? "text-emerald-600" : d === 3 ? "text-amber-600" : "text-red-600",
                    )}>
                      {difficultyStats[d]}
                    </div>
                    <div className="text-[9px] text-ink-400">{difficultyLabel[d]}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI 自动组卷 */}
            <div className="pt-3 border-t border-ink-100 space-y-1.5">
              <div className="text-xs font-medium text-ink-600 mb-1">智能组卷</div>
              <Button variant="gold" size="sm" className="w-full justify-start bg-gradient-to-r from-gold-400 to-amber-400 hover:from-gold-500 hover:to-amber-500" onClick={() => setAutoGenOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" /> AI 自动组卷
              </Button>
            </div>

            {/* 添加题目来源 */}
            <div className="pt-3 border-t border-ink-100 space-y-1.5">
              <div className="text-xs font-medium text-ink-600 mb-1">手动添加题目</div>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setReplaceIdx(null); setAddSource("bank"); }}>
                <Library className="w-3.5 h-3.5" /> 从题库添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setReplaceIdx(null); setAddSource("basket"); }}>
                <ShoppingBasket className="w-3.5 h-3.5" /> 从试题篮添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setReplaceIdx(null); setAddSource("examPaper"); }}>
                <Files className="w-3.5 h-3.5" /> 从其它试卷添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setReplaceIdx(null); setAddSource("lecture"); }}>
                <FileText className="w-3.5 h-3.5" /> 从讲义添加
              </Button>
            </div>
          </Card>
        </div>

        {/* 右侧：题目列表（大纲+题目在一起） */}
        <div className="col-span-9">
          <Card>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-ink-100">
              <h3 className="font-serif font-semibold text-ink-900 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-teal-500" />
                题目列表
                <Badge variant="ink">{paperQuestions.length} 题</Badge>
              </h3>
              <Button variant="gold" size="sm" onClick={() => { setReplaceIdx(null); setAddSource("bank"); }}>
                <Plus className="w-3.5 h-3.5" />
                添加题目
              </Button>
            </div>

            {/* 学生选择器 + 时间周期选择器 */}
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

              {selectedStudentIds.length > 0 && answeredQuestionIds.size > 0 && (
                <span className="text-xs text-ink-500">
                  已做过 <span className="font-medium text-gold-700">{answeredQuestionIds.size}</span> 道题（在所选时间段内）
                </span>
              )}
            </div>

            {paperQuestions.length === 0 ? (
              <EmptyState
                icon={<FileText className="w-10 h-10 text-ink-200" />}
                title="试卷暂无题目"
                description="从左侧选择来源添加题目"
                action={
                  <Button variant="gold" size="sm" onClick={() => { setReplaceIdx(null); setAddSource("bank"); }}>
                    <Plus className="w-3.5 h-3.5" /> 从题库添加
                  </Button>
                }
              />
            ) : (
              <div className="space-y-5">
                {examPaperFormat === "gaokao" ? (
                  groupByType(paperQuestions, questions, groupOrder).map((group, gIdx) => {
                    const groupScore = group.questions.reduce((sum, item) => sum + item.pq.score, 0);
                    return (
                      <div key={group.type}>
                        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-ink-200">
                          {/* 大题型顺序调整 */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              onClick={() => handleGroupMove(group.type, "up")}
                              disabled={gIdx === 0}
                              className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="大题型上移"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleGroupMove(group.type, "down")}
                              disabled={gIdx === groupByType(paperQuestions, questions, groupOrder).length - 1}
                              className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="大题型下移"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                          <h2 className="font-serif text-lg font-bold text-ink-900">{group.label}</h2>
                          <span className="text-sm text-ink-500">共 {group.questions.length} 题</span>
                          <span className="text-sm text-gold-600 font-medium">共 {groupScore} 分</span>
                        </div>
                        <div className="space-y-3">
                          {group.questions.map((item) => (
                            <EditQuestionRow
                              key={item.pq.id}
                              pq={item.pq}
                              index={item.index}
                              total={paperQuestions.length}
                              question={item.question}
                              answered={Boolean(item.pq.questionId && answeredQuestionIds.has(item.pq.questionId))}
                              onMoveUp={() => handleMove(item.index, "up")}
                              onMoveDown={() => handleMove(item.index, "down")}
                              onRemove={() => handleRemoveQuestion(item.pq.id)}
                              onReplace={() => handleReplaceQuestion(item.index)}
                              onUpdateScore={(score) => handleUpdateScore(item.pq.id, score)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="space-y-3">
                    {paperQuestions.map((pq, index) => {
                      const q = pq.questionId ? questions[pq.questionId] : undefined;
                      return (
                        <EditQuestionRow
                          key={pq.id}
                          pq={pq}
                          index={index}
                          total={paperQuestions.length}
                          question={q}
                          answered={Boolean(pq.questionId && answeredQuestionIds.has(pq.questionId))}
                          onMoveUp={() => handleMove(index, "up")}
                          onMoveDown={() => handleMove(index, "down")}
                          onRemove={() => handleRemoveQuestion(pq.id)}
                          onReplace={() => handleReplaceQuestion(index)}
                          onUpdateScore={(score) => handleUpdateScore(pq.id, score)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
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
        onClose={() => { setAddSource(null); setReplaceIdx(null); }}
        size="lg"
        title={replaceIdx !== null
          ? "替换题目"
          : addSource === "basket" ? "从试题篮添加题目"
          : addSource === "bank" ? "从题库添加题目"
          : addSource === "examPaper" ? "从其它试卷添加题目"
          : addSource === "lecture" ? "从讲义添加题目" : "添加题目"
        }
        description={`已选择 ${selectedQuestionIds.length} 道题目${replaceIdx !== null ? "（将替换第 " + (replaceIdx + 1) + " 题）" : ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setAddSource(null); setReplaceIdx(null); }}>取消</Button>
            <Button variant="gold" onClick={handleConfirmAdd} disabled={selectedQuestionIds.length === 0 || (replaceIdx !== null && selectedQuestionIds.length > 1)}>
              <Plus className="w-3.5 h-3.5" />
              {replaceIdx !== null ? "确认替换" : "添加选中题目"}
            </Button>
          </>
        }
      >
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
              />
            )}
          </div>
        )}

        {addSource === "bank" && (
          <div className="space-y-3">
            <Input placeholder="搜索题目" value={bankKeyword} onChange={(e) => setBankKeyword(e.target.value)} />
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {bankQuestions.map((q) => {
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
                {selectedPaper.questions.filter((pq) => pq.questionId).map((pq) => {
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

      {/* 学生选择弹窗 */}
      <Modal
        open={showStudentPicker}
        onClose={() => setShowStudentPicker(false)}
        size="lg"
        title="选择学生"
        description="选择学生后，将标注这些学生在所选时间段内已做过的题目"
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
    </div>
  );
}

// ===== 预览模式的题目项 =====
function PreviewQuestionItem({
  pq, index, question, defaultBasket, isInDefaultBasket, onAddToBasket, onRemoveFromBasket,
}: {
  pq: ExamPaperQuestion;
  index: number;
  question: Question | null | undefined;
  defaultBasket?: Basket;
  isInDefaultBasket: boolean;
  onAddToBasket: () => void;
  onRemoveFromBasket: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel: Record<string, string> = { single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答" };
  return (
    <div className="border border-ink-100 rounded-md p-4 hover:border-ink-200 transition-colors">
      <div className="flex items-start gap-3">
        {/* 左侧：难度+题型标注 */}
        <div className="flex-shrink-0 w-14 pt-0.5">
          {question && (
            <>
              <div className={cn("text-[10px] font-bold text-center px-1 py-0.5 rounded border",
                question.difficulty <= 2 ? "border-emerald-200 bg-emerald-50 text-emerald-600" :
                question.difficulty === 3 ? "border-amber-200 bg-amber-50 text-amber-600" :
                "border-red-200 bg-red-50 text-red-600")}>
                {difficultyLabel[question.difficulty]}
              </div>
              <div className="text-[9px] text-ink-400 text-center mt-0.5">{typeLabel[question.type] || typeLabel[pq.type]}</div>
            </>
          )}
          <div className="text-[10px] text-center text-gold-600 font-medium mt-0.5">{pq.score}分</div>
        </div>
        {/* 中间：题目内容 */}
        <div className="flex-1 min-w-0">
          {/* 题干（编号+题目） */}
          <div
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-ink-900 leading-relaxed cursor-pointer hover:text-gold-700 transition-colors"
          >
            <span className="font-mono font-bold text-ink-400 mr-1">{index + 1}.</span>
            {pq.stem}
          </div>
          {/* 选项（按数量自适应列数；答案高亮仅在展开时显示） */}
          {pq.options && pq.options.length > 0 && (
            <div className={cn(
              "pl-5 mt-2 gap-2 grid",
              getOptionsGridCols(pq.options.length),
            )}>
              {pq.options.map((opt, i) => (
                <div key={i} className={cn(
                  "px-2 py-1.5 rounded border text-sm flex items-center gap-1.5 min-w-0",
                  expanded && pq.answer.includes(String.fromCharCode(65 + i))
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-ink-100",
                )}>
                  <span className="font-mono font-semibold text-ink-600 flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <span className="text-ink-800 break-all">{opt}</span>
                </div>
              ))}
            </div>
          )}
          {/* 答案解析 */}
          {expanded && (
            <div className="space-y-2 pl-5 mt-2 animate-fade-in">
              <div className="p-2 rounded bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900">
                <span className="font-bold">答案：</span>{pq.answer}
              </div>
              <div className="p-2 rounded bg-gold-50/30 border border-gold-200 text-sm text-ink-800">
                <span className="font-bold text-gold-700">解析：</span>{pq.analysis}
              </div>
            </div>
          )}
          {!expanded && (
            <button onClick={() => setExpanded(true)} className="no-print text-xs text-gold-600 hover:text-gold-700 ml-5 mt-2">
              展开答案与解析
            </button>
          )}
        </div>
        {/* 右侧：题目信息标注 + 加入试题篮 */}
        <div className="flex-shrink-0 w-20 pt-0.5">
          {question && question.usageCount > 0 && (
            <div className="text-[10px] text-ink-400 text-right mb-1">
              使用{question.usageCount}次
            </div>
          )}
          {question && question.recommendation >= 4 && (
            <div className="text-[10px] text-gold-500 font-medium text-right mb-1">★推荐</div>
          )}
          {defaultBasket && (
            <Button
              variant={isInDefaultBasket ? "outline" : "ghost"}
              size="sm"
              onClick={isInDefaultBasket ? onRemoveFromBasket : onAddToBasket}
              disabled={!pq.questionId}
              title={pq.questionId ? (isInDefaultBasket ? "已加入，点击移除" : "加入默认试题篮") : "未关联题库"}
              className="no-print text-[11px] px-2 py-1"
            >
              <ShoppingBasket className="w-3 h-3" />
              {isInDefaultBasket ? "已加入" : "加篮"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== 编辑模式的题目行 =====
function EditQuestionRow({
  pq, index, total, question, answered, onMoveUp, onMoveDown, onRemove, onReplace, onUpdateScore,
}: {
  pq: ExamPaperQuestion;
  index: number;
  total: number;
  question: Question | null | undefined;
  answered: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onReplace: () => void;
  onUpdateScore: (score: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-ink-100 rounded-md p-3 hover:border-ink-200 transition-colors">
      <div className="flex items-start gap-2">
        {/* 上下移动 */}
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="上移"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-0.5 text-ink-400 hover:text-gold-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="下移"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

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
            {answered && (
              <span className="tag-gold text-[10px] py-0.5">已做过</span>
            )}
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
            className="text-sm text-ink-900 cursor-pointer hover:text-gold-700 transition-colors whitespace-pre-wrap"
          >
            {pq.stem}
          </div>
          {/* 选项（始终显示，按数量自适应列数；答案高亮仅在展开时显示） */}
          {pq.options && pq.options.length > 0 && (
            <div className={cn(
              "pl-4 mt-2 gap-2 grid",
              getOptionsGridCols(pq.options.length),
            )}>
              {pq.options.map((opt, i) => (
                <div key={i} className={cn(
                  "px-2 py-1 rounded border text-xs min-w-0 flex items-center gap-1.5",
                  expanded && pq.answer.includes(String.fromCharCode(65 + i))
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-ink-100",
                )}>
                  <span className="font-mono font-semibold text-ink-500 flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <span className="break-all">{opt}</span>
                </div>
              ))}
            </div>
          )}
          {/* 展开答案解析（保持折叠/展开行为） */}
          {expanded && (
            <div className="mt-2 space-y-1.5 animate-fade-in pl-4">
              <div className="text-xs p-2 rounded bg-emerald-50/40 border border-emerald-200">
                <span className="font-bold text-emerald-700">答案：</span>{pq.answer}
              </div>
              <div className="text-xs p-2 rounded bg-gold-50/30 border border-gold-200">
                <span className="font-bold text-gold-700">解析：</span>{pq.analysis}
              </div>
            </div>
          )}
          {!expanded && (pq.options?.length ?? 0) > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-gold-600 hover:text-gold-700 mt-2 ml-4"
            >
              展开答案与解析
            </button>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex-shrink-0 flex items-center gap-1">
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
        </div>
      </div>
    </div>
  );
}

// ===== 试题篮题目列表 =====
function BasketQuestionList({
  basket, schoolId, selectedIds, onSelect, singleSelect, answeredQuestionIds,
}: {
  basket: Basket;
  schoolId: string;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  singleSelect?: boolean;
  answeredQuestionIds: Set<string>;
}) {
  const [qs, setQs] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    questionService.listQuestions({ schoolId }).then((all) => {
      setQs(all.filter((q) => basket.questionIds.includes(q.id)));
      setLoading(false);
    });
  }, [basket, schoolId]);

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
      description="选择发布对象，可选设置密码保护和到期日期"
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
        {/* 发布对象 */}
        <div>
          <div className="text-sm font-medium text-ink-700 mb-2 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-emerald-500" />
            发布对象（班级或个人）
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
