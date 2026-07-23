import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Save, Send, Plus, Sparkles, FileText, BookOpen,
  Trash2, GripVertical, ShoppingBasket, Library, Files,
  GraduationCap, Users, Wand2, Loader2, X, ChevronDown, ChevronRight,
  Type, ListOrdered, CheckCircle2, Edit3, Eye,
  UserCheck, Award, Clock, Presentation, FileBox,
  Lightbulb, Minus, Printer, Download, Layout,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import { classService as classSvc } from "@/services/class";
import { knowledgeService } from "@/services/knowledge";
import { aiService } from "@/services/ai";
import { analyticsService, type DateRange } from "@/services/analytics";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { settingsService } from "@/services/settings";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { TreeView } from "@/components/tree/TreeView";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { QuestionCard } from "@/components/question/QuestionCard";
import { QuestionEditor } from "@/components/question/QuestionEditor";
import type {
  Lecture, LectureSection, Question, Basket, AnyClass, TreeNode,
  Student, AnswerRecord, AnswerScore, Courseware, Material, SchoolClass, PersonalClass,
  LectureType,
} from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";
import { inferScore } from "@/services/analytics";

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

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];
const difficultyColor = ["", "text-emerald-600", "text-emerald-600", "text-amber-600", "text-red-600", "text-red-600"];
const typeLabel: Record<string, string> = { single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答" };

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

type AddSource = "basket" | "bank" | "lecture" | "courseware" | "material";

export default function LectureEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const { teacher } = useAuthStore();

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("高一");
  const [schoolYear, setSchoolYear] = useState("2025-2026");
  const [typeId, setTypeId] = useState<string>("");
  const [lectureTypes, setLectureTypes] = useState<LectureType[]>([]);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [sections, setSections] = useState<LectureSection[]>([]);

  /** 版本类型 */
  const [currentVersionType, setCurrentVersionType] = useState<"extract" | "preview" | "answer-sheet" | "origin">("extract");

  /** 排版设置状态 */
  const [layoutSettings, setLayoutSettings] = useState({
    paperSize: "A4" as "A4" | "8K",
    showSummary: true,
    questionSpacing: 1,
    knowledgeSpacing: 1,
    sectionSpacings: {} as Record<string, number>,
  });

  // 添加题目弹窗
  const [addSource, setAddSource] = useState<AddSource | null>(null);
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selectedBasket, setSelectedBasket] = useState<Basket | null>(null);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankKeyword, setBankKeyword] = useState("");
  const [otherLectures, setOtherLectures] = useState<Lecture[]>([]);
  const [selectedOtherLecture, setSelectedOtherLecture] = useState<Lecture | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  // 引用课件/素材
  const [coursewareList, setCoursewareList] = useState<Courseware[]>([]);
  const [materialList, setMaterialList] = useState<Material[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);

  // AI 生成知识点
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [aiEditing, setAiEditing] = useState("");

  // AI 自动组讲义
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [autoGenStep, setAutoGenStep] = useState<1 | 2 | 3>(1);
  const [autoLeftTab, setAutoLeftTab] = useState<"chapter" | "knowledge">("chapter");
  const [autoSelChapterIds, setAutoSelChapterIds] = useState<string[]>([]);
  const [autoSelKnowledgeIds, setAutoSelKnowledgeIds] = useState<string[]>([]);
  const [autoQuestionCount, setAutoQuestionCount] = useState(5);
  const [autoMaterialCount, setAutoMaterialCount] = useState(2);
  const [autoIncludeKnowledgeAnalysis, setAutoIncludeKnowledgeAnalysis] = useState(true);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGeneratedSections, setAutoGeneratedSections] = useState<LectureSection[]>([]);

  // 章节编辑
  const [editingSection, setEditingSection] = useState<LectureSection | null>(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionContent, setSectionContent] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [outlineExpanded, setOutlineExpanded] = useState<Record<string, boolean>>({});

  // 题目编辑（同步题库）
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // 预览模式：学生得分编辑
  const [scoreStudentPickerOpen, setScoreStudentPickerOpen] = useState(false);
  const [scoreQuestionId, setScoreQuestionId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [answerRecords, setAnswerRecords] = useState<AnswerRecord[]>([]);
  const [selectedScoreStudentIds, setSelectedScoreStudentIds] = useState<string[]>([]);
  // 当前编辑的得分（全对 / 半对 / 做错）
  const [studentScoreState, setStudentScoreState] = useState<AnswerScore | null>(null);
  // 其他学生在该题的答题记录（供参考）
  const [otherRecords, setOtherRecords] = useState<AnswerRecord[]>([]);

  // 学生选择 + 时间周期 + 已做题目（用于讲义编辑中标注学生已做过的题目）
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("all");
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [studentPickerClassId, setStudentPickerClassId] = useState<string>("");

  const dateRange = useMemo(() => getDateRange(timeRangeKey), [timeRangeKey]);

  useEffect(() => {
    const load = async () => {
      if (!teacher) return;
      const [chs, kps, lecTypes] = await Promise.all([
        knowledgeService.getChapterTree(teacher.schoolId!),
        knowledgeService.getKnowledgeTree(teacher.schoolId!),
        settingsService.listLectureTypes(teacher.schoolId!),
      ]);
      setChapterTree(chs);
      setKnowledgeTree(kps);
      setLectureTypes(lecTypes.filter((t) => t.enabled));
      const allClasses = await classSvc.listAllClasses(teacher.schoolId!, teacher.id);
      setClasses(allClasses);
      setBaskets(await basketService.listBaskets(teacher.id));
      const allStudents = await classSvc.listStudentsBySchool(teacher.schoolId!);
      setStudents(allStudents);
      // 加载学校班级和个人班级（用于学生选择器）
      classSvc.listSchoolClasses(teacher.schoolId!).then(setSchoolClasses);
      classSvc.listPersonalClasses(teacher.id).then(setPersonalClasses);

      if (id && id !== "new") {
        const lec = await lectureService.getLecture(id);
        if (!lec) {
          toast.error("讲义不存在");
          navigate("/lectures");
          return;
        }
        setLecture(lec);
        setTitle(lec.title);
        setDescription(lec.description || "");
        setGrade(lec.grade);
        setSchoolYear(lec.schoolYear);
        setTypeId(lec.typeId || "");
        setSelectedChapterIds(lec.chapterIds);
        setSelectedPointIds(lec.knowledgePointIds);
        setSelectedClassIds(lec.classIds);
        setSections(lec.sections);
        setSelectedStudentIds(lec.studentIds || []);

        // 加载答题记录
        const records = await analyticsService.listAnswerRecordsByLecture(lec.id);
        setAnswerRecords(records);
      } else {
        setTitle("未命名讲义");
        setSections([]);
      }
      setLoading(false);
    };
    load();
  }, [id, teacher, navigate]);

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

  const filteredPickerStudents = useMemo(() => {
    if (!studentPickerClassId) return students;
    const pClass = personalClasses.find((c) => c.id === studentPickerClassId);
    if (pClass) {
      return students.filter((s) => pClass.studentIds.includes(s.id));
    }
    return students.filter((s) => s.classId === studentPickerClassId);
  }, [studentPickerClassId, students, personalClasses]);

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
      const qs = await questionService.listQuestions({
        schoolId: teacher.schoolId!,
        keyword: bankKeyword,
      });
      setBankQuestions(qs.slice(0, 30));
    }, 250);
    return () => clearTimeout(t);
  }, [bankKeyword, teacher]);

  useEffect(() => {
    if (teacher && addSource === "lecture") {
      lectureService.listLectures({ teacherId: teacher.id }).then((ls) =>
        setOtherLectures(ls.filter((l) => l.id !== id)),
      );
    }
    if (teacher && addSource === "courseware") {
      coursewareService.listCoursewares({ schoolId: teacher.schoolId! }).then(setCoursewareList);
      setSelectedResourceIds([]);
    }
    if (teacher && addSource === "material") {
      materialService.listMaterials({ schoolId: teacher.schoolId! }).then(setMaterialList);
      setSelectedResourceIds([]);
    }
  }, [addSource, teacher, id]);

  const handleAddResources = () => {
    if (selectedResourceIds.length === 0) {
      toast.error("请选择至少一个资源");
      return;
    }
    const newSections: LectureSection[] = [];
    if (addSource === "courseware") {
      for (const cw of coursewareList.filter((c) => selectedResourceIds.includes(c.id))) {
        newSections.push({
          id: `sec-${Date.now()}-${cw.id}`,
          title: `【课件】${cw.title}`,
          type: "text",
          content: cw.content || cw.description || "",
          children: [],
        });
      }
    } else if (addSource === "material") {
      for (const mat of materialList.filter((m) => selectedResourceIds.includes(m.id))) {
        newSections.push({
          id: `sec-${Date.now()}-${mat.id}`,
          title: `【素材】${mat.title}`,
          type: "text",
          content: mat.content || mat.description || "",
          children: [],
        });
      }
    }
    if (selectedChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === selectedChapterId
            ? { ...s, children: [...s.children, ...newSections] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [selectedChapterId]: true }));
    } else {
      setSections((prev) => [...prev, ...newSections]);
    }
    toast.success(`已引用 ${newSections.length} 个资源到讲义`);
    setAddSource(null);
    setSelectedResourceIds([]);
  };

  const handleSave = async (publish = false) => {
    if (!teacher) return;
    if (!title.trim()) {
      toast.error("请填写讲义标题");
      return;
    }
    setSaving(true);
    if (publish) setPublishing(true);

    try {
      const payload = {
        title,
        description,
        chapterIds: selectedChapterIds,
        knowledgePointIds: selectedPointIds,
        grade,
        schoolYear,
        classIds: selectedClassIds,
        studentIds: selectedStudentIds,
        sections,
        typeId: typeId || undefined,
      };

      if (lecture) {
        const updated = await lectureService.updateLecture(lecture.id, payload);
        if (publish) await lectureService.publish(lecture.id);
        toast.success(publish ? "讲义已发布" : "讲义已保存");
        setLecture(updated);
      } else {
        const created = await lectureService.createLecture(teacher.id, teacher.schoolId!, payload);
        if (publish) await lectureService.publish(created.id);
        toast.success(publish ? "讲义已创建并发布" : "讲义已创建");
        navigate(`/lectures/${created.id}/edit`);
      }
    } catch (e) {
      toast.error("保存失败", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  // 添加章节
  const handleAddChapter = () => {
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: `第${sections.filter((s) => s.type === "chapter").length + 1}讲：新章节`,
      type: "chapter",
      content: "",
      children: [],
    };
    setSections((prev) => [...prev, newSec]);
    setEditingSection(newSec);
    setSectionTitle(newSec.title);
    setSectionContent(newSec.content);
    setSectionLabel(newSec.customLabel || "");
  };

  const handleAddTextSection = () => {
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: "新文本段落",
      type: "text",
      content: "在此输入段落内容...",
      children: [],
    };
    if (selectedChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === selectedChapterId
            ? { ...s, children: [...s.children, newSec] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [selectedChapterId]: true }));
    } else {
      setSections((prev) => [...prev, newSec]);
    }
    setEditingSection(newSec);
    setSectionTitle(newSec.title);
    setSectionContent(newSec.content);
    setSectionLabel(newSec.customLabel || "");
  };

  const handleAddBlankLine = () => {
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: "空白行",
      type: "text",
      content: "",
      children: [],
    };
    if (selectedChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === selectedChapterId
            ? { ...s, children: [...s.children, newSec] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [selectedChapterId]: true }));
    } else {
      setSections((prev) => [...prev, newSec]);
    }
  };

  const handleAddKnowledgeSection = async () => {
    setAiOpen(true);
    setAiTopic("");
    setAiContext("");
    setAiResult("");
    setAiEditing("");
  };

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) {
      toast.error("请输入知识点主题");
      return;
    }
    setAiGenerating(true);
    try {
      const result = await aiService.generateKnowledgePoint(aiTopic, aiContext);
      setAiResult(result);
      setAiEditing(result);
    } catch (e) {
      toast.error("生成失败", e instanceof Error ? e.message : undefined);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAiInsert = async () => {
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: `知识点·${aiTopic}`,
      type: "knowledge",
      content: aiEditing,
      children: [],
    };
    if (selectedChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === selectedChapterId
            ? { ...s, children: [...s.children, newSec] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [selectedChapterId]: true }));
    } else {
      setSections((prev) => [...prev, newSec]);
    }
    setAiOpen(false);
    toast.success("知识点已添加到讲义");
  };

  // AI 自动组讲义
  const handleAutoGenerateLecture = useCallback(async () => {
    if (!teacher) return;
    const sid = teacher.schoolId!;
    if (autoSelChapterIds.length === 0 && autoSelKnowledgeIds.length === 0) {
      toast.warning("请至少选择一个章节或知识点");
      return;
    }
    setAutoGenerating(true);
    try {
      const allChapters = await knowledgeService.listChapters(sid);
      const chapterMap: Record<string, string> = {};
      allChapters.forEach((c) => { chapterMap[c.id] = c.name; });

      const allKnowledges = await knowledgeService.listKnowledgePoints(sid);
      const knowledgeMap: Record<string, { name: string; chapterId: string }> = {};
      allKnowledges.forEach((k) => { knowledgeMap[k.id] = { name: k.name, chapterId: k.chapterId }; });

      const targetChapterIds = autoSelChapterIds.length > 0 ? autoSelChapterIds : [...new Set(autoSelKnowledgeIds.map((kid) => knowledgeMap[kid]?.chapterId).filter(Boolean))];
      const targetKnowledgeIds = autoSelKnowledgeIds.length > 0 ? autoSelKnowledgeIds : [];

      const allQs = await questionService.listQuestions({
        schoolId: sid,
        chapterIds: targetChapterIds.length > 0 ? targetChapterIds : undefined,
        knowledgePointIds: targetKnowledgeIds.length > 0 ? targetKnowledgeIds : undefined,
      });
      const shuffledQs = [...allQs].sort(() => Math.random() - 0.5).slice(0, autoQuestionCount);

      const allMats = await materialService.listMaterials({
        schoolId: sid,
        chapterIds: targetChapterIds.length > 0 ? targetChapterIds : undefined,
        knowledgePointIds: targetKnowledgeIds.length > 0 ? targetKnowledgeIds : undefined,
      });
      const shuffledMats = [...allMats].sort(() => Math.random() - 0.5).slice(0, autoMaterialCount);

      const newSections: LectureSection[] = [];
      let secIdx = 1;

      for (const chId of targetChapterIds) {
        const chName = chapterMap[chId] || `第${secIdx}讲`;
        const chapterSec: LectureSection = {
          id: `sec-auto-${Date.now()}-${secIdx}`,
          title: chName,
          type: "chapter",
          content: "",
          children: [],
        };
        secIdx++;

        const kpsInChapter = targetKnowledgeIds.filter((kid) => knowledgeMap[kid]?.chapterId === chId);
        const kpsToShow = kpsInChapter.length > 0 ? kpsInChapter : autoSelKnowledgeIds.slice(0, 1);

        if (autoIncludeKnowledgeAnalysis) {
          for (const kid of kpsToShow) {
            const kpName = knowledgeMap[kid]?.name || "知识点";
            try {
              const analysis = await aiService.generateKnowledgePoint(kpName);
              chapterSec.children.push({
                id: `sec-auto-${Date.now()}-${secIdx}`,
                title: `知识点·${kpName}`,
                type: "knowledge",
                content: analysis,
                children: [],
              });
              secIdx++;
            } catch { /* 忽略单个生成失败 */ }
          }
        }

        const chapterQs = shuffledQs.filter((q) =>
          q.chapterIds?.includes(chId) || q.knowledgePointIds?.some((kid) => kpsInChapter.includes(kid)),
        );
        for (const q of chapterQs) {
          chapterSec.children.push({
            id: `sec-auto-${Date.now()}-${secIdx}`,
            title: q.stem.slice(0, 30) + (q.stem.length > 30 ? "..." : ""),
            type: "question",
            content: q.stem,
            questionId: q.id,
            children: [],
          });
          secIdx++;
        }

        const chapterMats = shuffledMats.filter((m) =>
          m.chapterIds.includes(chId) || m.knowledgePointIds.some((kid) => kpsInChapter.includes(kid)),
        );
        for (const m of chapterMats) {
          chapterSec.children.push({
            id: `sec-auto-${Date.now()}-${secIdx}`,
            title: m.title,
            type: "text",
            content: `【素材】${m.title}\n\n${m.content}`,
            children: [],
          });
          secIdx++;
        }

        if (chapterSec.children.length > 0) {
          newSections.push(chapterSec);
        }
      }

      const extraQs = shuffledQs.filter((q) =>
        !newSections.some((s) => s.children.some((c) => c.questionId === q.id)),
      );
      const extraMats = shuffledMats.filter((m) =>
        !newSections.some((s) => s.children.some((c) => c.title === m.title)),
      );

      if (extraQs.length > 0 || extraMats.length > 0) {
        const extraChapter: LectureSection = {
          id: `sec-auto-${Date.now()}-${secIdx}`,
          title: "拓展内容",
          type: "chapter",
          content: "",
          children: [],
        };
        secIdx++;
        for (const q of extraQs) {
          extraChapter.children.push({
            id: `sec-auto-${Date.now()}-${secIdx}`,
            title: q.stem.slice(0, 30) + (q.stem.length > 30 ? "..." : ""),
            type: "question",
            content: q.stem,
            questionId: q.id,
            children: [],
          });
          secIdx++;
        }
        for (const m of extraMats) {
          extraChapter.children.push({
            id: `sec-auto-${Date.now()}-${secIdx}`,
            title: m.title,
            type: "text",
            content: `【素材】${m.title}\n\n${m.content}`,
            children: [],
          });
          secIdx++;
        }
        if (extraChapter.children.length > 0) {
          newSections.push(extraChapter);
        }
      }

      setAutoGeneratedSections(newSections);
      setAutoGenStep(3);
    } catch (e: any) {
      toast.error("组讲义失败", e?.message);
    } finally {
      setAutoGenerating(false);
    }
  }, [autoSelChapterIds, autoSelKnowledgeIds, autoQuestionCount, autoMaterialCount, autoIncludeKnowledgeAnalysis, teacher]);

  const handleConfirmAutoGenLecture = useCallback(() => {
    if (autoGeneratedSections.length === 0) {
      toast.warning("没有可添加的内容");
      return;
    }
    setSections((prev) => [...prev, ...autoGeneratedSections]);
    const qIds: string[] = [];
    const collectQids = (secs: LectureSection[]) => {
      for (const s of secs) {
        if (s.questionId) qIds.push(s.questionId);
        if (s.children.length > 0) collectQids(s.children);
      }
    };
    collectQids(autoGeneratedSections);
    if (qIds.length > 0 && teacher) {
      questionService.listQuestions({ schoolId: teacher.schoolId! }).then((qs) => {
        const map: Record<string, Question> = {};
        qs.forEach((q) => { map[q.id] = q; });
      });
    }
    toast.success(`已添加 ${autoGeneratedSections.length} 个章节到讲义`);
    setAutoGenOpen(false);
    setAutoGenStep(1);
  }, [autoGeneratedSections, teacher]);

  // 添加题目
  const handleConfirmAddQuestions = async () => {
    if (!addSource || selectedQuestionIds.length === 0) {
      toast.error("请选择至少一道题目");
      return;
    }
    let questionsToAdd: Question[] = [];
    if (addSource === "basket" && selectedBasket) {
      const all = await questionService.listQuestions({ schoolId: teacher!.schoolId! });
      questionsToAdd = all.filter((q) => selectedBasket.questionIds.includes(q.id) && selectedQuestionIds.includes(q.id));
    } else if (addSource === "bank") {
      questionsToAdd = bankQuestions.filter((q) => selectedQuestionIds.includes(q.id));
    } else if (addSource === "lecture" && selectedOtherLecture) {
      const all = await questionService.listQuestions({ schoolId: teacher!.schoolId! });
      const sectionQuestionIds = selectedOtherLecture.sections
        .filter((s) => s.type === "question" && s.questionId)
        .map((s) => s.questionId!)
        .filter((qid) => selectedQuestionIds.includes(qid));
      questionsToAdd = all.filter((q) => sectionQuestionIds.includes(q.id));
    }

    const newSections: LectureSection[] = questionsToAdd.map((q) => ({
      id: `sec-${Date.now()}-${q.id}`,
      title: `题目·${q.stem.slice(0, 18)}${q.stem.length > 18 ? "..." : ""}`,
      type: "question",
      content: "",
      questionId: q.id,
      children: [],
    }));

    if (selectedChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === selectedChapterId
            ? { ...s, children: [...s.children, ...newSections] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [selectedChapterId]: true }));
    } else {
      setSections((prev) => [...prev, ...newSections]);
    }

    if (lecture) {
      for (const q of questionsToAdd) {
        await lectureService.addQuestionToLecture(lecture.id, q.id);
      }
    }

    toast.success(`已添加 ${questionsToAdd.length} 道题目`);
    setAddSource(null);
    setSelectedQuestionIds([]);
    setSelectedBasket(null);
    setSelectedOtherLecture(null);
  };

  const handleRemoveSection = (secId: string, parentId?: string) => {
    if (parentId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === parentId
            ? { ...s, children: s.children.filter((c) => c.id !== secId) }
            : s,
        ),
      );
    } else {
      setSections((prev) => prev.filter((s) => s.id !== secId));
    }
    if (lecture) lectureService.removeSection(lecture.id, secId);
    if (selectedChapterId === secId) setSelectedChapterId(null);
  };

  const handleMoveSection = (idx: number, direction: "up" | "down") => {
    setSections((prev) => {
      const next = [...prev];
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSaveSection = () => {
    if (!editingSection) return;
    const updated = {
      ...editingSection,
      title: sectionTitle,
      content: sectionContent,
      customLabel: sectionLabel.trim() || undefined,
    };
    setSections((prev) => {
      let found = false;
      const result = prev.map((s) => {
        if (s.id === editingSection.id) {
          found = true;
          return updated;
        }
        if (s.children && s.children.length > 0) {
          const childIdx = s.children.findIndex((c) => c.id === editingSection.id);
          if (childIdx >= 0) {
            found = true;
            return {
              ...s,
              children: s.children.map((c) =>
                c.id === editingSection.id ? updated : c,
              ),
            };
          }
        }
        return s;
      });
      return result;
    });
    setEditingSection(null);
  };

  // 编辑题目（同步更新题库）
  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question);
  };

  const handleQuestionUpdated = (updatedQ: Question) => {
    setEditingQuestion(null);
    toast.success("题目已更新，同步到题库");
    const newTitle = `题目·${updatedQ.stem.slice(0, 18)}${updatedQ.stem.length > 18 ? "..." : ""}`;
    setSections((prev) =>
      prev.map((s) => {
        if (s.type === "question" && s.questionId === updatedQ.id) {
          return { ...s, title: newTitle };
        }
        if (s.children && s.children.length > 0) {
          return {
            ...s,
            children: s.children.map((c) =>
              c.type === "question" && c.questionId === updatedQ.id
                ? { ...c, title: newTitle }
                : c,
            ),
          };
        }
        return s;
      }),
    );
  };

  // 预览模式：学生得分编辑
  const openScoreEditor = async (questionId: string) => {
    setScoreQuestionId(questionId);
    setSelectedScoreStudentIds([]);
    setStudentScoreState(null);
    setScoreStudentPickerOpen(true);
    // 拉取该题所有答题记录，用于「其他学生答题情况」参考
    try {
      const all = await analyticsService.listAllAnswerRecordsByQuestion(questionId);
      setOtherRecords(all);
    } catch {
      setOtherRecords([]);
    }
  };

  const handleStudentSelect = (studentId: string) => {
    setSelectedScoreStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
    // 如果只选中一个学生，加载其当前得分
    const nextIds = selectedScoreStudentIds.includes(studentId)
      ? selectedScoreStudentIds.filter((id) => id !== studentId)
      : [...selectedScoreStudentIds, studentId];
    if (nextIds.length === 1) {
      const record = answerRecords.find(
        (r) => r.studentId === nextIds[0] && r.questionId === scoreQuestionId,
      );
      setStudentScoreState(record ? inferScore(record) : null);
    } else {
      setStudentScoreState(null);
    }
  };

  const handleSelectAllStudents = () => {
    if (selectedScoreStudentIds.length === lectureStudents.length) {
      setSelectedScoreStudentIds([]);
      setStudentScoreState(null);
    } else {
      setSelectedScoreStudentIds(lectureStudents.map((s) => s.id));
      setStudentScoreState(null);
    }
  };

  const handleSaveScore = async () => {
    if (selectedScoreStudentIds.length === 0 || !scoreQuestionId || !lecture || !studentScoreState) {
      if (selectedScoreStudentIds.length === 0) toast.error("请至少选择一名学生");
      else if (!studentScoreState) toast.error("请选择答题情况（全对 / 半对 / 做错）");
      return;
    }
    try {
      const items = selectedScoreStudentIds.map((sid) => ({
        studentId: sid,
        questionId: scoreQuestionId,
        lectureId: lecture.id,
        score: studentScoreState,
        source: "manual" as const,
      }));
      await analyticsService.batchSaveAnswerRecords(items);
      // 刷新讲义的答题记录
      const records = await analyticsService.listAnswerRecordsByLecture(lecture.id);
      setAnswerRecords(records);
      // 同步刷新其它学生参考列表
      const all = await analyticsService.listAllAnswerRecordsByQuestion(scoreQuestionId);
      setOtherRecords(all);
      toast.success(`已保存 ${selectedScoreStudentIds.length} 名学生的答题情况`);
    } catch (e: any) {
      toast.error("保存失败", e?.message);
      return;
    }
    setScoreStudentPickerOpen(false);
    setSelectedScoreStudentIds([]);
    setStudentScoreState(null);
  };

  const handleAddToBasketFromPreview = async (questionId: string, basketId?: string) => {
    if (!teacher) return;
    try {
      if (basketId) {
        await basketService.addQuestion(basketId, questionId);
      } else {
        const def = await basketService.addQuestionToDefault(teacher.id, questionId);
        if (!def) {
          toast.error("未设置默认试题篮");
          return;
        }
      }
      const bs = await basketService.listBaskets(teacher.id);
      setBaskets(bs);
      toast.success("已加入试题篮");
    } catch (e: any) {
      toast.error("加入失败", e?.message);
    }
  };

  const handleRemoveFromBasketFromPreview = async (questionId: string, basketId: string) => {
    if (!teacher) return;
    try {
      await basketService.removeQuestion(basketId, questionId);
      const bs = await basketService.listBaskets(teacher.id);
      setBaskets(bs);
      toast.success("已从试题篮移除");
    } catch (e: any) {
      toast.error("移除失败", e?.message);
    }
  };

  const handleUpdateStudentAnswerFromPreview = async (
    studentId: string,
    questionId: string,
    score: AnswerScore | null,
  ) => {
    if (!lecture) return;
    try {
      await analyticsService.saveAnswerRecord({
        studentId,
        questionId,
        lectureId: lecture.id,
        score,
        source: "manual",
      });
      const records = await analyticsService.listAnswerRecordsByLecture(lecture.id);
      setAnswerRecords(records);
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    }
  };

  // 获取讲义关联的所有学生
  const lectureStudents = useMemo(() => {
    const studentIds = new Set<string>();
    selectedClassIds.forEach((classId) => {
      const cls = classes.find((c) => c.id === classId);
      if (cls) {
        if (cls.type === "school") {
          students.filter((s) => s.classId === classId).forEach((s) => studentIds.add(s.id));
        } else {
          cls.studentIds.forEach((sid) => studentIds.add(sid));
        }
      }
    });
    return students.filter((s) => studentIds.has(s.id));
  }, [selectedClassIds, classes, students]);

  const lectureFormat = useMemo(() => {
    const type = lectureTypes.find((t) => t.id === typeId);
    return type?.format || "mixed";
  }, [lectureTypes, typeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  const gradeOptions = [
    { value: "高一", label: "高一" },
    { value: "高二", label: "高二" },
    { value: "高三", label: "高三" },
    { value: "初一", label: "初一" },
    { value: "初二", label: "初二" },
    { value: "初三", label: "初三" },
  ];

  // ===== 预览模式 =====
  if (isPreview) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title={lecture?.title || title}
          description={lecture?.description || description || "预览模式"}
          icon={<FileText className="w-5 h-5" />}
          action={
            <Button variant="outline" onClick={() => navigate(`/lectures/${id}/edit`)}>
              <Edit3 className="w-4 h-4" />
              返回编辑
            </Button>
          }
        />

        {/* 讲义信息 */}
        <Card className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-gold-500" />
              <span className="text-ink-500">年级：</span>
              <span className="font-medium text-ink-900">{grade} · {schoolYear}</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-teal-500" />
              <span className="text-ink-500">共：</span>
              <span className="font-medium text-ink-900">{sections.length} 节内容</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={lecture?.status === "published" ? "green" : "default"}>
                {lecture?.status === "published" ? "已发布" : "草稿"}
              </Badge>
            </div>
          </div>
        </Card>

        {/* 完整讲义内容 */}
        <div className={`space-y-4 ${lectureFormat === "table" ? "bg-white border border-ink-200 rounded-lg p-6" : ""}`}>
          {lectureFormat === "table" && (
            <div className="mb-4 pb-3 border-b border-ink-200">
              <h2 className="text-lg font-bold text-ink-900 mb-1">教学教案</h2>
              <p className="text-sm text-ink-500">表格形式 · 结构化教学内容</p>
            </div>
          )}
          {sections.map((sec, idx) => (
            <PreviewSection
              key={sec.id}
              section={sec}
              index={idx}
              answerRecords={answerRecords}
              students={students}
              lectureStudents={lectureStudents}
              baskets={baskets}
              answeredQuestionIds={answeredQuestionIds}
              onEditScore={(qid) => openScoreEditor(qid)}
              onAddToBasket={handleAddToBasketFromPreview}
              onRemoveFromBasket={handleRemoveFromBasketFromPreview}
              onUpdateStudentAnswer={handleUpdateStudentAnswerFromPreview}
            />
          ))}
        </div>

        {/* 学生得分编辑弹窗 */}
        <Modal
          open={scoreStudentPickerOpen}
          onClose={() => setScoreStudentPickerOpen(false)}
          size="md"
          title="编辑学生答题情况"
          description="选择学生并标记该题的完成情况（全对 / 半对 / 做错）"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setScoreStudentPickerOpen(false)}>取消</Button>
              <Button variant="gold" onClick={handleSaveScore}>
                <CheckCircle2 className="w-4 h-4" />
                保存
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-ink-600 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  讲义关联学生
                </div>
                {lectureStudents.length > 0 && (
                  <button
                    onClick={handleSelectAllStudents}
                    className="text-[11px] text-gold-600 hover:text-gold-700"
                  >
                    {selectedScoreStudentIds.length === lectureStudents.length ? "取消全选" : "全选"}
                  </button>
                )}
              </div>
              <div className="max-h-52 overflow-y-auto border border-ink-100 rounded-md space-y-0.5">
                {lectureStudents.length === 0 ? (
                  <div className="py-6 text-center text-xs text-ink-400">
                    请先在编辑模式下关联班级
                  </div>
                ) : (
                  lectureStudents.map((s) => {
                    const record = otherRecords.find(
                      (r) => r.studentId === s.id && r.questionId === scoreQuestionId,
                    );
                    const sc = record ? inferScore(record) : null;
                    const scCfg = sc
                      ? {
                          correct: { label: "全对", cls: "text-emerald-600 bg-emerald-50" },
                          partial: { label: "半对", cls: "text-amber-600 bg-amber-50" },
                          wrong: { label: "做错", cls: "text-red-600 bg-red-50" },
                        }[sc]
                      : null;
                    const isSelected = selectedScoreStudentIds.includes(s.id);
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleStudentSelect(s.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                          isSelected ? "bg-gold-50" : "hover:bg-mist",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-ink-300 text-gold-500 focus:ring-gold-500 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
                          s.isExternal
                            ? "bg-amber-50 text-amber-600"
                            : s.gender === "female"
                            ? "bg-pink-50 text-pink-600"
                            : "bg-teal-50 text-teal-600",
                        )}>
                          {s.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900 truncate">{s.name}</div>
                          <div className="text-xs text-ink-400 truncate">
                            {s.isExternal ? s.externalSchool : s.grade}
                          </div>
                        </div>
                        {scCfg ? (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded", scCfg.cls)}>
                            {scCfg.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-ink-400 px-1.5 py-0.5">未做</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {selectedScoreStudentIds.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-ink-100">
                <div className="text-xs font-medium text-ink-600 flex items-center justify-between">
                  <span>答题情况</span>
                  <span className="text-ink-400 font-normal">
                    已选 {selectedScoreStudentIds.length} 名学生
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "correct", label: "全对", icon: CheckCircle2, cls: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
                    { value: "partial", label: "半对", icon: Clock, cls: "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" },
                    { value: "wrong", label: "做错", icon: X, cls: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" },
                  ] as const).map((opt) => {
                    const OptIcon = opt.icon;
                    const active = studentScoreState === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setStudentScoreState(opt.value)}
                        className={cn(
                          "flex flex-col items-center gap-1 py-2.5 rounded-md border text-sm transition-all",
                          active
                            ? `${opt.cls} ring-2 ring-offset-1 ring-gold-400`
                            : "border-ink-100 bg-paper text-ink-600 hover:bg-mist",
                        )}
                      >
                        <OptIcon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 其他学生答题情况参考 */}
            {otherRecords.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-ink-100">
                <div className="text-xs font-medium text-ink-600 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  其他学生答题情况参考
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {otherRecords
                    .filter((r) => !selectedScoreStudentIds.includes(r.studentId))
                    .map((r) => {
                      const stu = students.find((s) => s.id === r.studentId);
                      const sc = inferScore(r);
                      const cfg = {
                        correct: { label: "全对", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                        partial: { label: "半对", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                        wrong: { label: "做错", cls: "bg-red-50 text-red-700 border-red-200" },
                      }[sc];
                      return (
                        <span
                          key={r.id}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border",
                            cfg.cls,
                          )}
                          title={`${stu?.name || "未知学生"}：${cfg.label}`}
                        >
                          {stu?.name || "未知"}
                          <span className="opacity-80">{cfg.label}</span>
                        </span>
                      );
                    })}
                  {otherRecords.filter((r) => !selectedScoreStudentIds.includes(r.studentId)).length === 0 && (
                    <span className="text-[11px] text-ink-400">暂无其他学生答题记录</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    );
  }

  // ===== 编辑模式 =====
  return (
    <div>
      <PageHeader
        title={lecture ? `编辑：${lecture.title}` : "新建讲义"}
        description="组题、添加知识点、设置属性，生成完整讲义"
        icon={<FileText className="w-5 h-5" />}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate("/lectures")}>
              <ArrowLeft className="w-4 h-4" />
              返回
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)} loading={saving}>
              <Save className="w-4 h-4" />
              保存
            </Button>
            <Button variant="gold" onClick={() => handleSave(true)} loading={publishing}>
              <Send className="w-4 h-4" />
              发布
            </Button>
          </div>
        }
      />

      {/* 版本切换Tab */}
      <div className="flex items-center gap-1 mb-4 bg-ink-50 p-1 rounded-lg">
        {currentVersionType === "extract" && (
          <Button variant="ghost" size="sm" className="bg-white shadow-sm text-gold-700">
            <Edit3 className="w-3.5 h-3.5" />
            正稿
          </Button>
        )}
        {currentVersionType !== "extract" && (
          <Button variant="ghost" size="sm" onClick={() => setCurrentVersionType("extract")}>
            <Edit3 className="w-3.5 h-3.5" />
            正稿
          </Button>
        )}
        {currentVersionType === "preview" && (
          <Button variant="ghost" size="sm" className="bg-white shadow-sm text-gold-700">
            <Eye className="w-3.5 h-3.5" />
            预览稿
          </Button>
        )}
        {currentVersionType !== "preview" && (
          <Button variant="ghost" size="sm" onClick={() => setCurrentVersionType("preview")}>
            <Eye className="w-3.5 h-3.5" />
            预览稿
          </Button>
        )}
        {lecture?.originalFileUrl && currentVersionType === "origin" && (
          <Button variant="ghost" size="sm" className="bg-white shadow-sm text-gold-700">
            <FileText className="w-3.5 h-3.5" />
            原稿
          </Button>
        )}
        {lecture?.originalFileUrl && currentVersionType !== "origin" && (
          <Button variant="ghost" size="sm" onClick={() => setCurrentVersionType("origin")}>
            <FileText className="w-3.5 h-3.5" />
            原稿
          </Button>
        )}
        {currentVersionType === "answer-sheet" && (
          <Button variant="ghost" size="sm" className="bg-white shadow-sm text-gold-700">
            <Layout className="w-3.5 h-3.5" />
            答题卡
          </Button>
        )}
        {currentVersionType !== "answer-sheet" && (
          <Button variant="ghost" size="sm" onClick={() => setCurrentVersionType("answer-sheet")}>
            <Layout className="w-3.5 h-3.5" />
            答题卡
          </Button>
        )}
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

      {/* 根据版本类型显示不同内容 */}
      {currentVersionType === "extract" && (
        <div className="grid lg:grid-cols-4 gap-5">
          {/* 左：大纲 */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-semibold text-ink-900">讲义大纲</h3>
                <Badge variant="ink">
                  {sections.filter((s) => s.type === "chapter").length} 章 ·
                  {sections.reduce((acc, s) => acc + (s.type === "chapter" ? s.children.length : 1), 0)} 节
                </Badge>
              </div>

              <div className="space-y-1 mb-4 max-h-[380px] overflow-y-auto">
                {sections.length === 0 ? (
                  <div className="text-center py-8 text-xs text-ink-400">
                    暂无内容，从下方添加
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sections.map((sec, idx) => {
                      if (sec.type === "chapter") {
                        const isExpanded = outlineExpanded[sec.id] ?? true;
                        const isSelected = selectedChapterId === sec.id;
                        return (
                          <div key={sec.id}>
                            <div
                              className={cn(
                                "flex items-center gap-1 p-2 rounded-md border transition-all group cursor-pointer",
                                isSelected
                                  ? "border-gold-300 bg-gold-50/30"
                                  : "border-ink-100 hover:bg-mist",
                              )}
                              onClick={() => {
                                setSelectedChapterId(sec.id);
                                setEditingSection(null);
                              }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOutlineExpanded((prev) => ({
                                  ...prev,
                                  [sec.id]: !isExpanded,
                                }));
                              }}
                              className="p-0.5 text-ink-400 hover:text-ink-700"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <BookOpen className="w-3.5 h-3.5 text-gold-500 flex-shrink-0" />
                            <span className="text-xs font-medium text-ink-800 truncate flex-1">
                              {sec.title}
                            </span>
                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSection(sec);
                                  setSectionTitle(sec.title);
                                  setSectionContent(sec.content);
                                  setSectionLabel(sec.customLabel || "");
                                }}
                                className="p-0.5 text-ink-400 hover:text-gold-600"
                                title="编辑章节"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveSection(sec.id);
                                }}
                                className="p-0.5 text-ink-400 hover:text-red-600"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {isExpanded && sec.children.length > 0 && (
                            <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-ink-100 pl-2">
                              {sec.children.map((child, cIdx) => (
                                <div
                                  key={child.id}
                                  className={cn(
                                    "flex items-center gap-1.5 p-1.5 rounded-md border border-transparent transition-all group cursor-pointer hover:bg-mist",
                                    editingSection?.id === child.id && "bg-gold-50/50 border-gold-200",
                                  )}
                                  onClick={() => {
                                    setEditingSection(child);
                                    setSectionTitle(child.title);
                                    setSectionContent(child.content);
                                    setSectionLabel(child.customLabel || "");
                                  }}
                                >
                                  <span className="text-[10px] font-mono text-ink-400 w-4 text-center">
                                    {cIdx + 1}
                                  </span>
                                  {child.type === "question" ? (
                                    <ListOrdered className="w-3 h-3 text-teal-500 flex-shrink-0" />
                                  ) : child.type === "knowledge" ? (
                                    <Sparkles className="w-3 h-3 text-gold-500 flex-shrink-0" />
                                  ) : (
                                    <Type className="w-3 h-3 text-ink-400 flex-shrink-0" />
                                  )}
                                  <span className="text-xs text-ink-700 truncate flex-1">
                                    {child.title}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveSection(child.id, sec.id);
                                    }}
                                    className="p-0.5 text-ink-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={sec.id}
                        className={cn(
                          "flex items-center gap-1.5 p-2 rounded-md border transition-all group",
                          editingSection?.id === sec.id
                            ? "border-gold-300 bg-gold-50/30"
                            : "border-ink-100 hover:bg-mist",
                        )}
                      >
                        <GripVertical className="w-3 h-3 text-ink-300 flex-shrink-0" />
                        <button
                          onClick={() => {
                            setEditingSection(sec);
                            setSectionTitle(sec.title);
                            setSectionContent(sec.content);
                            setSectionLabel(sec.customLabel || "");
                          }}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex items-center gap-1.5">
                            {sec.type === "question" ? (
                              <ListOrdered className="w-3 h-3 text-teal-500 flex-shrink-0" />
                            ) : sec.type === "knowledge" ? (
                              <Sparkles className="w-3 h-3 text-gold-500 flex-shrink-0" />
                            ) : (
                              <Type className="w-3 h-3 text-ink-400 flex-shrink-0" />
                            )}
                            <span className="text-xs text-ink-700 truncate">
                              {sec.title}
                            </span>
                          </div>
                        </button>
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMoveSection(idx, "up")}
                            disabled={idx === 0}
                            className="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMoveSection(idx, "down")}
                            disabled={idx === sections.length - 1}
                            className="p-0.5 text-ink-400 hover:text-ink-700 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => handleRemoveSection(sec.id)}
                            className="p-0.5 text-ink-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI 自动组讲义 */}
            <div className="space-y-1.5 pt-3 border-t border-ink-100">
              <div className="text-xs font-medium text-ink-600 mb-1">智能组讲义</div>
              <Button variant="gold" size="sm" className="w-full justify-start bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-600 hover:to-teal-500" onClick={() => setAutoGenOpen(true)}>
                <Sparkles className="w-3.5 h-3.5" /> AI 自动组讲义
              </Button>
            </div>

            {/* 添加内容按钮 */}
            <div className="space-y-1.5 pt-3 border-t border-ink-100">
              <div className="text-xs font-medium text-ink-600 mb-1">手动添加内容</div>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={handleAddChapter}>
                <BookOpen className="w-3.5 h-3.5" />
                添加章节
              </Button>
              {selectedChapterId && (
                <div className="text-[11px] text-ink-500 px-1 -mt-1">
                  已选中章节，内容将添加到该章节下
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setAddSource("basket")}>
                <ShoppingBasket className="w-3.5 h-3.5" />
                从试题篮添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setAddSource("bank")}>
                <Library className="w-3.5 h-3.5" />
                从题库添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setAddSource("lecture")}>
                <Files className="w-3.5 h-3.5" />
                从其他讲义添加
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setAddSource("courseware")}>
                <Presentation className="w-3.5 h-3.5" />
                引用课件
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setAddSource("material")}>
                <FileBox className="w-3.5 h-3.5" />
                引用素材
              </Button>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <Button variant="ghost" size="sm" onClick={handleAddTextSection}>
                  <Type className="w-3.5 h-3.5" />
                  文本
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAddBlankLine}>
                  <Minus className="w-3.5 h-3.5" />
                  空白行
                </Button>
                <Button variant="ghost" size="sm" onClick={handleAddKnowledgeSection}>
                  <Wand2 className="w-3.5 h-3.5" />
                  AI 知识点
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* 中：内容预览/编辑 */}
        <div className="lg:col-span-2 space-y-4">
          {editingSection ? (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-semibold text-ink-900">
                  {editingSection.type === "chapter" ? "编辑章节" : editingSection.type === "question" ? "编辑题目" : "编辑内容"}
                </h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditingSection(null)}>
                    <X className="w-3.5 h-3.5" />
                    取消
                  </Button>
                  <Button variant="gold" size="sm" onClick={handleSaveSection}>
                    <Save className="w-3.5 h-3.5" />
                    保存
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {editingSection.type !== "chapter" && (
                  <Input
                    label="编号标签（可选）"
                    placeholder={`默认为序号，可改为"例1""变式2"等`}
                    value={sectionLabel}
                    onChange={(e) => setSectionLabel(e.target.value)}
                  />
                )}
                <Input
                  label={editingSection.type === "chapter" ? "章节标题" : "标题"}
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                />
                {editingSection.type !== "question" && (
                  <Textarea
                    label="内容（支持 Markdown）"
                    value={sectionContent}
                    onChange={(e) => setSectionContent(e.target.value)}
                    rows={10}
                  />
                )}
                {editingSection.type === "question" && (
                  <div className="text-xs text-ink-500">
                    题目内容请在题库中编辑，修改后将同步到所有使用该题的地方。
                  </div>
                )}
              </div>
            </Card>
          ) : selectedChapterId ? (
            <ChapterContent
              chapter={sections.find((s) => s.id === selectedChapterId)!}
              answeredQuestionIds={answeredQuestionIds}
              onEditSection={(sec) => {
                setEditingSection(sec);
                setSectionTitle(sec.title);
                setSectionContent(sec.content);
                setSectionLabel(sec.customLabel || "");
              }}
              onEditQuestion={handleEditQuestion}
              onAddQuestion={() => setAddSource("bank")}
              onAddKnowledge={handleAddKnowledgeSection}
            />
          ) : (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif font-semibold text-ink-900">讲义内容</h3>
                <Badge variant="ink">v{lecture?.version || 1}</Badge>
              </div>
              {sections.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-ink-200" />
                  <div className="text-sm text-ink-500 mb-1">讲义还是空的</div>
                  <div className="text-xs text-ink-400 mb-4">从左侧添加章节、题目或知识点开始编排</div>
                  <Button variant="gold" size="sm" onClick={handleAddChapter}>
                    <Plus className="w-4 h-4" />
                    创建第一个章节
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {sections.map((sec, idx) => (
                    <SectionPreview
                      key={sec.id}
                      section={sec}
                      index={idx}
                      answeredQuestionIds={answeredQuestionIds}
                      onEdit={() => {
                        setEditingSection(sec);
                        setSectionTitle(sec.title);
                        setSectionContent(sec.content);
                        setSectionLabel(sec.customLabel || "");
                      }}
                      onEditQuestion={handleEditQuestion}
                    />
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* 右：属性面板 */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-gold-600" />
              <h3 className="font-serif font-semibold text-ink-900">讲义属性</h3>
            </div>
            <div className="space-y-3">
              <Input
                label="标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                label="描述"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="讲义简介"
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  label="适用年级"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  options={gradeOptions}
                />
                <Input
                  label="学年"
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                />
              </div>
              <Select
                label="讲义类型"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                options={[
                  { value: "", label: "未设置" },
                  ...lectureTypes.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-teal-500" />
              <h3 className="font-serif font-semibold text-ink-900">章节与知识点</h3>
            </div>
            <div className="mb-3">
              <div className="text-xs font-medium text-ink-600 mb-1.5">章节目录</div>
              {chapterTree && (
                <TreeView
                  data={chapterTree}
                  checkable
                  checkedIds={selectedChapterIds}
                  onCheck={setSelectedChapterIds}
                  expandLevel={1}
                  className="text-xs max-h-64 overflow-auto"
                />
              )}
            </div>
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1.5">知识点</div>
              {knowledgeTree && (
                <TreeView
                  data={knowledgeTree}
                  checkable
                  checkedIds={selectedPointIds}
                  onCheck={setSelectedPointIds}
                  expandLevel={1}
                  className="text-xs max-h-64 overflow-auto"
                />
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-emerald-500" />
              <h3 className="font-serif font-semibold text-ink-900">适用班级</h3>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {classes.map((c) => {
                const checked = selectedClassIds.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClassIds((prev) => [...prev, c.id]);
                        } else {
                          setSelectedClassIds((prev) => prev.filter((id) => id !== c.id));
                        }
                      }}
                      className="rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                    />
                    <GraduationCap className="w-3.5 h-3.5 text-ink-400" />
                    <span className="text-sm text-ink-800 flex-1 truncate">{c.name}</span>
                    {c.type === "personal" && <Badge variant="teal">个人</Badge>}
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    )}
      {currentVersionType === "preview" && (
        <div className="max-w-4xl mx-auto">
          <Card className="mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-600">纸张大小：</span>
                <select
                  value={layoutSettings.paperSize}
                  onChange={(e) => setLayoutSettings({ ...layoutSettings, paperSize: e.target.value as "A4" | "8K" })}
                  className="text-sm border border-ink-200 rounded px-2 py-1 bg-paper"
                >
                  <option value="A4">A4</option>
                  <option value="8K">8K</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-600">显示总结：</span>
                <button
                  onClick={() => setLayoutSettings({ ...layoutSettings, showSummary: !layoutSettings.showSummary })}
                  className={cn(
                    "w-10 h-5 rounded-full transition-colors",
                    layoutSettings.showSummary ? "bg-gold-500" : "bg-ink-200"
                  )}
                >
                  <span className={cn(
                    "block w-4 h-4 rounded-full bg-white shadow transition-transform",
                    layoutSettings.showSummary ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>
              <Button variant="gold" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                打印
              </Button>
            </div>
          </Card>

          <div className={cn(
            "bg-white border border-ink-200 rounded-lg p-8 relative",
            layoutSettings.paperSize === "A4" 
              ? "w-[210mm] min-h-[297mm] mx-auto" 
              : "w-[370mm] min-h-[260mm] mx-auto"
          )}>
            <div className="mb-6 pb-4 border-b border-ink-200">
              <h1 className="text-xl font-bold text-center text-ink-900 mb-2">{lecture?.title || title}</h1>
              <div className="text-sm text-center text-ink-500">
                {grade} · {schoolYear}
              </div>
            </div>

            <PreviewContent
              sections={sections}
              paperSize={layoutSettings.paperSize}
              showSummary={layoutSettings.showSummary}
              baseQuestionSpacing={layoutSettings.questionSpacing}
              baseKnowledgeSpacing={layoutSettings.knowledgeSpacing}
              sectionSpacings={layoutSettings.sectionSpacings}
              answerRecords={answerRecords}
              students={students}
              lectureStudents={lectureStudents}
              baskets={baskets}
              answeredQuestionIds={answeredQuestionIds}
              onEditScore={openScoreEditor}
              onAddToBasket={handleAddToBasketFromPreview}
              onRemoveFromBasket={handleRemoveFromBasketFromPreview}
              onUpdateStudentAnswer={handleUpdateStudentAnswerFromPreview}
              onSpacingChange={(sectionId, delta) => {
                setLayoutSettings((prev) => ({
                  ...prev,
                  sectionSpacings: {
                    ...prev.sectionSpacings,
                    [sectionId]: Math.max(0, (prev.sectionSpacings[sectionId] || 0) + delta),
                  },
                }));
              }}
            />

            {/* 页码 */}
            <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-ink-400">
              第 1 页
            </div>
          </div>
        </div>
      )}

      {/* 原稿 */}
      {currentVersionType === "origin" && lecture?.originalFileUrl && (
        <div className="max-w-4xl mx-auto">
          <Card className="p-8">
            <div className="text-center">
              <FileText className="w-16 h-16 text-ink-300 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-ink-900 mb-2">原稿文件</h2>
              <p className="text-sm text-ink-500 mb-4">{lecture.originalFileName}</p>
              <a
                href={lecture.originalFileUrl}
                download={lecture.originalFileName}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors"
              >
                <Download className="w-4 h-4" />
                下载原稿
              </a>
              <p className="text-xs text-ink-400 mt-4">原稿为未拆解的原始上传文件，如需编辑请切换到正稿</p>
            </div>
          </Card>
        </div>
      )}

      {/* 答题卡 */}
      {currentVersionType === "answer-sheet" && (
        <div className="max-w-4xl mx-auto">
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink-900">答题卡设置</h3>
              <Button variant="gold" size="sm" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                打印答题卡
              </Button>
            </div>
          </Card>

          <div className="bg-white border border-ink-200 rounded-lg p-8">
            <div className="mb-6 pb-4 border-b border-ink-200">
              <h1 className="text-xl font-bold text-center text-ink-900 mb-4">{lecture?.title || title} - 答题卡</h1>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="border border-ink-200 rounded px-3 py-2">
                  <span className="text-ink-500">姓名：</span>
                  <span className="border-b border-ink-300 flex-1 ml-2" style={{ minWidth: "60px" }} />
                </div>
                <div className="border border-ink-200 rounded px-3 py-2">
                  <span className="text-ink-500">班级：</span>
                  <span className="border-b border-ink-300 flex-1 ml-2" style={{ minWidth: "60px" }} />
                </div>
                <div className="border border-ink-200 rounded px-3 py-2">
                  <span className="text-ink-500">学号：</span>
                  <span className="border-b border-ink-300 flex-1 ml-2" style={{ minWidth: "60px" }} />
                </div>
                <div className="border border-ink-200 rounded px-3 py-2">
                  <span className="text-ink-500">得分：</span>
                  <span className="border-b border-ink-300 flex-1 ml-2" style={{ minWidth: "60px" }} />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {sections.map((sec) => {
                if (sec.type !== "question") return null;
                return (
                  <div key={sec.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-ink-900">{sec.title}</span>
                      <span className="text-sm text-ink-500">答案：</span>
                      <span className="border-b border-ink-300" style={{ minWidth: "100px" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* AI 自动组讲义弹窗 */}
      <Modal
        open={autoGenOpen}
        onClose={() => { if (!autoGenerating) { setAutoGenOpen(false); setAutoGenStep(1); } }}
        size="xl"
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-500" />
            AI 自动组讲义
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
              <Button variant="gold" onClick={handleAutoGenerateLecture} loading={autoGenerating}>
                <Sparkles className="w-3.5 h-3.5" />
                {autoGenerating ? "AI 生成中..." : "开始智能组讲义"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAutoGenStep(2)} disabled={autoGenerating}>
                重新生成
              </Button>
              <Button variant="gold" onClick={handleConfirmAutoGenLecture} disabled={autoGeneratedSections.length === 0}>
                <Plus className="w-3.5 h-3.5" />
                添加到讲义（{autoGeneratedSections.length} 个章节）
              </Button>
            </>
          )
        }
      >
        {autoGenStep === 1 && (
          <div className="space-y-4">
            <div className="p-3 bg-teal-50/50 border border-teal-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-teal-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-teal-800">
                  <div className="font-medium mb-1">组讲义说明</div>
                  <div>从选择的章节和知识点中，AI 自动生成知识点讲解，并从题库和素材库智能选取题目和素材，按章节组织讲义结构。</div>
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
                      ? "border-teal-400 text-teal-700 font-medium"
                      : "border-transparent text-ink-500 hover:text-ink-700",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="h-72 overflow-y-auto border border-ink-100 rounded-lg p-2">
              {autoLeftTab === "chapter" && chapterTree && (
                <SearchableTree
                  data={chapterTree}
                  title="章节目录"
                  accent="gold"
                  checkable
                  checkedIds={autoSelChapterIds}
                  onCheck={setAutoSelChapterIds}
                  searchPlaceholder="搜索章节..."
                />
              )}
              {autoLeftTab === "knowledge" && knowledgeTree && (
                <SearchableTree
                  data={knowledgeTree}
                  title="知识点目录"
                  accent="teal"
                  checkable
                  checkedIds={autoSelKnowledgeIds}
                  onCheck={setAutoSelKnowledgeIds}
                  searchPlaceholder="搜索知识点..."
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {autoSelChapterIds.length > 0 && (
                <span className="text-xs bg-gold-50 text-gold-700 px-2 py-0.5 rounded border border-gold-200">
                  已选 {autoSelChapterIds.length} 个章节
                </span>
              )}
              {autoSelKnowledgeIds.length > 0 && (
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
                  已选 {autoSelKnowledgeIds.length} 个知识点
                </span>
              )}
            </div>
          </div>
        )}

        {autoGenStep === 2 && (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-ink-600 mb-2">内容配置</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
                  <div>
                    <div className="text-sm text-ink-800">AI 知识点讲解</div>
                    <div className="text-xs text-ink-400">为每个知识点自动生成详细讲解内容</div>
                  </div>
                  <button
                    onClick={() => setAutoIncludeKnowledgeAnalysis((v) => !v)}
                    className={cn(
                      "w-10 h-6 rounded-full transition-colors relative",
                      autoIncludeKnowledgeAnalysis ? "bg-teal-500" : "bg-ink-200",
                    )}
                  >
                    <div className={cn(
                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                      autoIncludeKnowledgeAnalysis ? "left-4" : "left-0.5",
                    )} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
                  <div>
                    <div className="text-sm text-ink-800">题目数量</div>
                    <div className="text-xs text-ink-400">从题库中选取的题目总数</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAutoQuestionCount((v) => Math.max(0, v - 1))}
                      className="w-7 h-7 rounded border border-ink-200 text-ink-500 hover:border-ink-300 text-sm"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-medium">{autoQuestionCount}</span>
                    <button
                      onClick={() => setAutoQuestionCount((v) => v + 1)}
                      className="w-7 h-7 rounded border border-ink-200 text-ink-500 hover:border-ink-300 text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border border-ink-100 rounded-lg">
                  <div>
                    <div className="text-sm text-ink-800">素材数量</div>
                    <div className="text-xs text-ink-400">从素材库中选取的素材总数</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setAutoMaterialCount((v) => Math.max(0, v - 1))}
                      className="w-7 h-7 rounded border border-ink-200 text-ink-500 hover:border-ink-300 text-sm"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-medium">{autoMaterialCount}</span>
                    <button
                      onClick={() => setAutoMaterialCount((v) => v + 1)}
                      className="w-7 h-7 rounded border border-ink-200 text-ink-500 hover:border-ink-300 text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-3 bg-ink-50 rounded-lg text-xs text-ink-500">
              预计生成：{autoSelChapterIds.length > 0 ? autoSelChapterIds.length : autoSelKnowledgeIds.length} 个章节
              · {autoIncludeKnowledgeAnalysis ? "包含知识点讲解 · " : ""}
              {autoQuestionCount} 道题 · {autoMaterialCount} 个素材
            </div>
          </div>
        )}

        {autoGenStep === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-ink-600">
                AI 已为您生成 <span className="font-semibold text-teal-600">{autoGeneratedSections.length}</span> 个章节
              </div>
              <Button variant="outline" size="sm" onClick={handleAutoGenerateLecture} disabled={autoGenerating}>
                <Sparkles className="w-3 h-3" />
                重新生成
              </Button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {autoGeneratedSections.map((sec, i) => (
                <div key={sec.id} className="p-3 border border-ink-100 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded">第 {i + 1} 章</span>
                    <span className="text-sm font-medium text-ink-800">{sec.title}</span>
                    <span className="text-[10px] text-ink-400 ml-auto">{sec.children.length} 项内容</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {sec.children.slice(0, 4).map((child) => (
                      <span
                        key={child.id}
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded",
                          child.type === "knowledge" ? "bg-teal-50 text-teal-700" :
                          child.type === "question" ? "bg-gold-50 text-gold-700" :
                          "bg-ink-50 text-ink-600",
                        )}
                      >
                        {child.type === "knowledge" ? "知识点" : child.type === "question" ? "题目" : "素材"}
                      </span>
                    ))}
                    {sec.children.length > 4 && (
                      <span className="text-[10px] text-ink-400 px-1.5 py-0.5">
                        +{sec.children.length - 4} 项
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* 添加题目弹窗 */}
      <Modal
        open={Boolean(addSource)}
        onClose={() => setAddSource(null)}
        size="lg"
        title={
          addSource === "basket" ? "从试题篮添加题目" :
          addSource === "bank" ? "从题库添加题目" :
          addSource === "lecture" ? "从其他讲义添加题目" :
          addSource === "courseware" ? "引用课件到讲义" :
          addSource === "material" ? "引用素材到讲义" : "添加内容"
        }
        description={
          addSource === "courseware" || addSource === "material"
            ? `已选择 ${selectedResourceIds.length} 个资源`
            : `已选择 ${selectedQuestionIds.length} 道题目`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddSource(null)}>取消</Button>
            {addSource === "courseware" || addSource === "material" ? (
              <Button variant="gold" onClick={handleAddResources}>
                <Plus className="w-3.5 h-3.5" />
                引用选中资源
              </Button>
            ) : (
              <Button variant="gold" onClick={handleConfirmAddQuestions}>
                <Plus className="w-3.5 h-3.5" />
                添加选中题目
              </Button>
            )}
          </>
        }
      >
        {addSource === "basket" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {baskets.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setSelectedBasket(b);
                    setSelectedQuestionIds([]);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedBasket?.id === b.id
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {b.name} ({b.questionIds.length})
                </button>
              ))}
            </div>
            {selectedBasket && (
              <BasketQuestionsSelector
                basket={selectedBasket}
                selectedIds={selectedQuestionIds}
                onSelect={setSelectedQuestionIds}
              />
            )}
          </div>
        )}

        {addSource === "bank" && (
          <div className="space-y-3">
            <Input
              placeholder="搜索题目"
              value={bankKeyword}
              onChange={(e) => setBankKeyword(e.target.value)}
            />
            <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
              {bankQuestions.map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  showActions={false}
                  selected={selectedQuestionIds.includes(q.id)}
                  onSelect={(qq) => {
                    setSelectedQuestionIds((prev) =>
                      prev.includes(qq.id) ? prev.filter((id) => id !== qq.id) : [...prev, qq.id],
                    );
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {addSource === "lecture" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {otherLectures.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setSelectedOtherLecture(l);
                    setSelectedQuestionIds([]);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedOtherLecture?.id === l.id
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {l.title}
                </button>
              ))}
            </div>
            {selectedOtherLecture && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedOtherLecture.sections
                  .filter((s) => s.type === "question" && s.questionId)
                  .map((s) => {
                    const checked = selectedQuestionIds.includes(s.questionId!);
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          "flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors",
                          checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedQuestionIds((prev) => [...prev, s.questionId!]);
                            } else {
                              setSelectedQuestionIds((prev) => prev.filter((id) => id !== s.questionId));
                            }
                          }}
                          className="mt-1 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-ink-900">{s.title}</div>
                        </div>
                      </label>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* 引用课件 */}
        {addSource === "courseware" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {coursewareList.length === 0 ? (
              <div className="text-center text-ink-400 py-8 text-sm">
                暂无课件资源，请先在资源库中入库
              </div>
            ) : (
              coursewareList.map((cw) => {
                const checked = selectedResourceIds.includes(cw.id);
                return (
                  <label
                    key={cw.id}
                    className={cn(
                      "flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedResourceIds((prev) => [...prev, cw.id]);
                        } else {
                          setSelectedResourceIds((prev) => prev.filter((rid) => rid !== cw.id));
                        }
                      }}
                      className="mt-1 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                        <Presentation className="w-3.5 h-3.5 text-gold-500" />
                        {cw.title}
                        <Badge variant="ink" className="text-xs">{cw.type.toUpperCase()}</Badge>
                      </div>
                      {cw.description && (
                        <div className="text-xs text-ink-500 mt-1">{cw.description}</div>
                      )}
                      {cw.content && (
                        <div className="text-xs text-ink-600 mt-1 line-clamp-2">{cw.content}</div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        )}

        {/* 引用素材 */}
        {addSource === "material" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {materialList.length === 0 ? (
              <div className="text-center text-ink-400 py-8 text-sm">
                暂无素材资源，请先在资源库中入库
              </div>
            ) : (
              materialList.map((mat) => {
                const checked = selectedResourceIds.includes(mat.id);
                return (
                  <label
                    key={mat.id}
                    className={cn(
                      "flex items-start gap-2 p-3 rounded-md border cursor-pointer transition-colors",
                      checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedResourceIds((prev) => [...prev, mat.id]);
                        } else {
                          setSelectedResourceIds((prev) => prev.filter((rid) => rid !== mat.id));
                        }
                      }}
                      className="mt-1 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                        <FileBox className="w-3.5 h-3.5 text-teal-500" />
                        {mat.title}
                        <Badge variant="ink" className="text-xs">{mat.type}</Badge>
                      </div>
                      {mat.description && (
                        <div className="text-xs text-ink-500 mt-1">{mat.description}</div>
                      )}
                      {mat.content && (
                        <div className="text-xs text-ink-600 mt-1 line-clamp-2">{mat.content}</div>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        )}
      </Modal>

      {/* AI 生成知识点 */}
      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        size="lg"
        title="AI 生成知识点讲解"
        description="输入知识点主题，AI 将自动生成讲解内容"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAiOpen(false)}>取消</Button>
            {aiResult && (
              <Button variant="gold" onClick={handleAiInsert}>
                <Plus className="w-3.5 h-3.5" />
                插入到讲义
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="知识点主题"
            placeholder="例如：集合的并集运算"
            value={aiTopic}
            onChange={(e) => setAiTopic(e.target.value)}
          />
          <Textarea
            label="补充上下文（可选）"
            placeholder="可补充该知识点在本讲义中的定位、目标学生水平等"
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            rows={2}
          />
          <Button variant="ink" onClick={handleAiGenerate} loading={aiGenerating} className="w-full">
            <Sparkles className="w-4 h-4" />
            {aiResult ? "重新生成" : "AI 生成知识点讲解"}
          </Button>

          {aiGenerating && (
            <div className="p-4 rounded-md bg-mist border border-ink-100 text-center">
              <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin text-gold-500" />
              <div className="text-sm text-ink-600">AI 正在生成内容...</div>
            </div>
          )}

          {aiResult && !aiGenerating && (
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1.5 flex items-center justify-between">
                <span>生成结果（可编辑）</span>
                <button
                  onClick={() => setAiEditing(aiResult)}
                  className="text-gold-600 hover:text-gold-700"
                >
                  重置为原始生成
                </button>
              </div>
              <Textarea
                value={aiEditing}
                onChange={(e) => setAiEditing(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* 题目编辑弹窗（同步题库） */}
      <Modal
        open={Boolean(editingQuestion)}
        onClose={() => setEditingQuestion(null)}
        size="full"
        title="编辑题目（同步更新题库）"
        description="修改题目后将同步更新到题库中所有使用该题的地方"
        footer={null}
      >
        {editingQuestion && (
          <QuestionEditor
            question={editingQuestion}
            onSaved={(q) => {
              handleQuestionUpdated(q);
            }}
            onCancel={() => setEditingQuestion(null)}
          />
        )}
      </Modal>

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
                onClick={() => setStudentPickerClassId("")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-all",
                  !studentPickerClassId
                    ? "bg-gold-400 border-gold-400 text-ink-900"
                    : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                全部学生
              </button>
              {schoolClasses.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setStudentPickerClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    studentPickerClassId === c.id
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
                  onClick={() => setStudentPickerClassId(c.id)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    studentPickerClassId === c.id
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
                学生列表（{filteredPickerStudents.length} 人）
              </div>
              <button
                onClick={() => {
                  const ids = filteredPickerStudents.map((s) => s.id);
                  setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...ids])));
                }}
                className="text-xs text-gold-600 hover:text-gold-800"
              >
                全选
              </button>
            </div>
            <div className="max-h-[340px] overflow-y-auto border border-ink-100 rounded-md">
              {filteredPickerStudents.length === 0 ? (
                <div className="py-10 text-center text-sm text-ink-400">暂无学生</div>
              ) : (
                <div className="divide-y divide-ink-50">
                  {filteredPickerStudents.map((s) => {
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

// ============ 预览稿布局组件 ============
interface PreviewContentProps {
  sections: LectureSection[];
  paperSize: "A4" | "8K";
  showSummary: boolean;
  baseQuestionSpacing: number;
  baseKnowledgeSpacing: number;
  sectionSpacings: Record<string, number>;
  answerRecords: AnswerRecord[];
  students: Student[];
  lectureStudents: Student[];
  baskets: Basket[];
  answeredQuestionIds: Set<string>;
  onEditScore: (questionId: string) => void;
  onAddToBasket?: (questionId: string, basketId: string) => void;
  onRemoveFromBasket?: (questionId: string, basketId: string) => void;
  onUpdateStudentAnswer?: (studentId: string, questionId: string, score: AnswerScore | null) => void;
  onSpacingChange?: (sectionId: string, delta: number) => void;
}

function PreviewContent({
  sections,
  paperSize,
  showSummary,
  baseQuestionSpacing,
  baseKnowledgeSpacing,
  sectionSpacings,
  answerRecords,
  students,
  lectureStudents,
  baskets,
  answeredQuestionIds,
  onEditScore,
  onAddToBasket,
  onRemoveFromBasket,
  onUpdateStudentAnswer,
  onSpacingChange,
}: PreviewContentProps) {
  const questionIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let qIdx = 0;
    sections.forEach((sec) => {
      if (sec.type === "question") {
        map.set(sec.id, qIdx++);
      }
    });
    return map;
  }, [sections]);

  const renderSectionItem = (sec: LectureSection, localIdx: number) => {
    const globalQuestionIndex = sec.type === "question" ? questionIndexMap.get(sec.id) ?? 0 : 0;
    return (
      <PreviewSection
        section={sec}
        index={localIdx}
        globalQuestionIndex={globalQuestionIndex}
        showSummary={showSummary}
        answerRecords={answerRecords}
        students={students}
        lectureStudents={lectureStudents}
        baskets={baskets}
        answeredQuestionIds={answeredQuestionIds}
        onEditScore={onEditScore}
        onAddToBasket={onAddToBasket}
        onRemoveFromBasket={onRemoveFromBasket}
        onUpdateStudentAnswer={onUpdateStudentAnswer}
      />
    );
  };

  const renderSectionList = (sectionList: LectureSection[], startOffset: number) => {
    const items: React.ReactNode[] = [];
    sectionList.forEach((sec, localIdx) => {
      items.push(
        <div key={sec.id}>
          {renderSectionItem(sec, startOffset + localIdx)}
        </div>
      );
    });
    return items;
  };

  if (paperSize === "8K") {
    const leftSections: LectureSection[] = [];
    const rightSections: LectureSection[] = [];

    const estimateHeight = (sec: LectureSection) => {
      if (sec.type === "chapter") {
        return 80 + (sec.content?.length || 0) * 0.3 + (sec.children?.length || 0) * 150;
      }
      if (sec.type === "question") {
        return 120;
      }
      if (sec.type === "knowledge") {
        return 60 + (sec.content?.length || 0) * 0.3;
      }
      return 40;
    };

    let leftHeight = 0;
    let rightHeight = 0;

    sections.forEach((sec) => {
      const height = estimateHeight(sec);
      if (leftHeight <= rightHeight) {
        leftSections.push(sec);
        leftHeight += height;
      } else {
        rightSections.push(sec);
        rightHeight += height;
      }
    });

    return (
      <div className="grid grid-cols-2 gap-x-8">
        <div>{renderSectionList(leftSections, 0)}</div>
        <div>{renderSectionList(rightSections, 0)}</div>
      </div>
    );
  }

  return <div className="space-y-0">{renderSectionList(sections, 0)}</div>;
}

// ============ 题目信息弹窗 ============
function QuestionInfoPopover({
  question,
  questionNumber,
  questionAnswerSummary,
  lectureStudents,
  answeredCount,
  correctCount,
  partialCount,
  wrongCount,
  defaultBasket,
  isInDefaultBasket,
  baskets,
  answerEditing,
  savingStudentId,
  onEditScore,
  onAddToBasket,
  onRemoveFromBasket,
  onUpdateStudentAnswer,
  onToggleStudentScore,
  onSetAnswerEditing,
  onSetBasketPickerOpen,
}: {
  question: Question;
  questionNumber: number;
  questionAnswerSummary: { student: Student; score: AnswerScore | null }[];
  lectureStudents: Student[];
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  defaultBasket?: Basket;
  isInDefaultBasket: boolean;
  baskets: Basket[];
  answerEditing: boolean;
  savingStudentId: string | null;
  onEditScore: (questionId: string) => void;
  onAddToBasket?: (questionId: string, basketId: string) => void;
  onRemoveFromBasket?: (questionId: string, basketId: string) => void;
  onUpdateStudentAnswer?: (studentId: string, questionId: string, score: AnswerScore | null) => void;
  onToggleStudentScore: (studentId: string, currentScore: AnswerScore | null) => void;
  onSetAnswerEditing: (v: boolean) => void;
  onSetBasketPickerOpen: (v: boolean) => void;
}) {
  const handleAddToBasket = (basketId: string) => {
    if (onAddToBasket) {
      onAddToBasket(question.id, basketId);
    }
    onSetBasketPickerOpen(false);
  };

  const handleRemoveFromDefault = () => {
    if (!defaultBasket || !onRemoveFromBasket) return;
    onRemoveFromBasket(question.id, defaultBasket.id);
  };

  const handleQuickAddToDefault = () => {
    if (!defaultBasket || !onAddToBasket) return;
    onAddToBasket(question.id, defaultBasket.id);
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg border border-ink-200 text-xs space-y-3">
      {/* 题号与基本信息 */}
      <div className="flex items-center gap-2 pb-2 border-b border-ink-100">
        <span className="font-mono font-bold text-sm text-ink-700">{questionNumber}.</span>
        <span className={cn(
          "px-1.5 py-0.5 rounded border text-[10px] font-medium",
          question.difficulty <= 2 ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
          question.difficulty === 3 ? "border-amber-200 bg-amber-50 text-amber-700" :
          "border-red-200 bg-red-50 text-red-700"
        )}>
          {difficultyLabel[question.difficulty]}
        </span>
        <span className="text-[10px] text-ink-400">{typeLabel[question.type]}</span>
      </div>

      {/* 答题情况 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink-600">学生答题情况</span>
          <span className="text-[10px] text-ink-400">
            {answeredCount}/{lectureStudents.length} 已答
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-700 font-medium">{correctCount}</span>
            <span className="text-ink-500">全对</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-amber-700 font-medium">{partialCount}</span>
            <span className="text-ink-500">半对</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-700 font-medium">{wrongCount}</span>
            <span className="text-ink-500">做错</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-ink-300" />
            <span className="text-ink-500 font-medium">{lectureStudents.length - answeredCount}</span>
            <span className="text-ink-500">未做</span>
          </span>
        </div>

        {/* 学生标签 */}
        <div className="flex flex-wrap gap-1.5 pt-2">
          {questionAnswerSummary.map(({ student, score }) => {
            const name = student.name;
            const isSaving = savingStudentId === student.id;
            if (!answerEditing || !onUpdateStudentAnswer) {
              if (!score) {
                return (
                  <span
                    key={student.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-ink-100 text-ink-500"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-ink-300" />
                    {name}
                    <span className="opacity-70">未做</span>
                  </span>
                );
              }
              const cfg = {
                correct: { label: "全对", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
                partial: { label: "半对", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
                wrong: { label: "做错", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
              }[score];
              return (
                <span
                  key={student.id}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border",
                    cfg.cls,
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                  {name}
                  <span className="opacity-80">{cfg.label}</span>
                </span>
              );
            }
            if (!score) {
              return (
                <button
                  key={student.id}
                  onClick={() => onToggleStudentScore(student.id, null)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-ink-100 text-ink-500 hover:bg-ink-200 transition-colors disabled:opacity-50"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-300" />
                  {name}
                  <span className="opacity-70">未做</span>
                </button>
              );
            }
            const cfg = {
              correct: { label: "全对", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", dot: "bg-emerald-500" },
              partial: { label: "半对", cls: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100", dot: "bg-amber-500" },
              wrong: { label: "做错", cls: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100", dot: "bg-red-500" },
            }[score];
            return (
              <button
                key={student.id}
                onClick={() => onToggleStudentScore(student.id, score)}
                disabled={isSaving}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors disabled:opacity-50",
                  cfg.cls,
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                {name}
                <span className="opacity-80">{cfg.label}</span>
              </button>
            );
          })}
        </div>

        {onUpdateStudentAnswer && (
          <button
            onClick={() => onSetAnswerEditing(!answerEditing)}
            className={cn(
              "text-[11px] px-3 py-1.5 rounded transition-colors w-full text-center",
              answerEditing
                ? "bg-gold-100 text-gold-700 font-medium"
                : "bg-ink-50 text-ink-500 hover:bg-ink-100",
            )}
          >
            {answerEditing ? "完成编辑" : "编辑答题情况（点击学生标签切换）"}
          </button>
        )}
      </div>

      {/* 加入资源篮 */}
      <div className="space-y-2 pt-2 border-t border-ink-100">
        <div className="text-[11px] font-medium text-ink-600">加入资源篮</div>
        <div className="flex flex-wrap gap-1.5">
          {baskets.map((b) => {
            const isInThisBasket = b.questionIds?.includes(question.id);
            return (
              <button
                key={b.id}
                onClick={() => {
                  if (isInThisBasket && onRemoveFromBasket) {
                    onRemoveFromBasket(question.id, b.id);
                  } else if (!isInThisBasket && onAddToBasket) {
                    onAddToBasket(question.id, b.id);
                  }
                }}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors",
                  isInThisBasket
                    ? "bg-gold-50 text-gold-700 border-gold-200 hover:bg-gold-100"
                    : "bg-ink-50 text-ink-600 border-ink-200 hover:bg-ink-100"
                )}
              >
                <ShoppingBasket className="w-3 h-3" />
                {b.name}
                {b.isDefault && <span className="text-[9px] opacity-70">(默认)</span>}
                {isInThisBasket && <span className="text-[9px]">✓</span>}
              </button>
            );
          })}
          {baskets.length === 0 && (
            <span className="text-[10px] text-ink-400">暂无资源篮</span>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t border-ink-100">
        <button
          onClick={() => onEditScore(question.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-ink-50 text-ink-700 hover:bg-ink-100 transition-colors text-[11px]"
        >
          <UserCheck className="w-3.5 h-3.5" />
          编辑答题情况
        </button>
      </div>
    </div>
  );
}

// ============ 试题篮选择器 ============
function QuestionBasketPicker({
  open,
  question,
  baskets,
  onAdd,
  onClose,
}: {
  open: boolean;
  question: Question;
  baskets: Basket[];
  onAdd: (basketId: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="加入试题篮"
      description={`题目：${question.stem.slice(0, 40)}...`}
    >
      <div className="space-y-2">
        {baskets.length === 0 ? (
          <div className="text-center py-6 text-sm text-ink-500">
            暂无试题篮
          </div>
        ) : (
          baskets.map((b) => (
            <button
              key={b.id}
              onClick={() => onAdd(b.id)}
              className="w-full text-left p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors flex items-center justify-between"
            >
              <div>
                <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                  {b.name}
                  {b.isDefault && <Badge variant="gold">默认</Badge>}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">{b.questionIds.length} 道题</div>
              </div>
              <Plus className="w-4 h-4 text-ink-400" />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

// ============ 预览模式章节 ============
function PreviewSection({
  section,
  index,
  globalQuestionIndex,
  showSummary = true,
  answerRecords,
  students,
  lectureStudents,
  baskets,
  answeredQuestionIds,
  onEditScore,
  onAddToBasket,
  onRemoveFromBasket,
  onUpdateStudentAnswer,
}: {
  section: LectureSection;
  index: number;
  globalQuestionIndex?: number;
  showSummary?: boolean;
  answerRecords: AnswerRecord[];
  students: Student[];
  lectureStudents: Student[];
  baskets: Basket[];
  answeredQuestionIds: Set<string>;
  onEditScore: (questionId: string) => void;
  onAddToBasket?: (questionId: string, basketId: string) => void;
  onRemoveFromBasket?: (questionId: string, basketId: string) => void;
  onUpdateStudentAnswer?: (studentId: string, questionId: string, score: AnswerScore | null) => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [answerEditing, setAnswerEditing] = useState(false);
  const [basketPickerOpen, setBasketPickerOpen] = useState(false);
  const [savingStudentId, setSavingStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (section.type === "question" && section.questionId) {
      questionService.getQuestion(section.questionId).then(setQuestion);
    }
  }, [section]);

  const questionAnswerSummary = useMemo(() => {
    if (section.type !== "question" || !section.questionId) return [];
    return lectureStudents.map((s) => {
      const record = answerRecords.find(
        (r) => r.studentId === s.id && r.questionId === section.questionId,
      );
      const score = record ? inferScore(record) : null;
      return { student: s, score };
    });
  }, [section, lectureStudents, answerRecords]);

  const answeredCount = questionAnswerSummary.filter((a) => a.score).length;
  const correctCount = questionAnswerSummary.filter((a) => a.score === "correct").length;
  const partialCount = questionAnswerSummary.filter((a) => a.score === "partial").length;
  const wrongCount = questionAnswerSummary.filter((a) => a.score === "wrong").length;
  const defaultBasket = baskets.find((b) => b.isDefault);
  const isInDefaultBasket = question && defaultBasket?.questionIds?.includes(question.id);

  const handleToggleStudentScore = async (studentId: string, currentScore: AnswerScore | null) => {
    if (!question || !onUpdateStudentAnswer) return;
    const scoreOrder: (AnswerScore | null)[] = [null, "correct", "partial", "wrong"];
    const currentIndex = scoreOrder.indexOf(currentScore);
    const nextScore = scoreOrder[(currentIndex + 1) % scoreOrder.length];
    setSavingStudentId(studentId);
    try {
      await onUpdateStudentAnswer(studentId, question.id, nextScore);
    } finally {
      setSavingStudentId(null);
    }
  };

  const questionNumber = section.type === "question" ? (globalQuestionIndex ?? index) + 1 : index + 1;

  if (section.type === "chapter") {
    return (
      <div className="pt-6 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-serif text-xl font-bold text-ink-900">
            {index + 1}. {section.title}
          </span>
        </div>
        {section.content && (
          <div className="mb-4 text-sm text-ink-600 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        )}
        {section.children.length > 0 && (
          <div className="space-y-4 pl-2 border-l-2 border-ink-100 ml-2">
            {section.children.map((child, cIdx) => (
              <PreviewSection
                key={child.id}
                section={child}
                index={cIdx}
                showSummary={showSummary}
                answerRecords={answerRecords}
                students={students}
                lectureStudents={lectureStudents}
                baskets={baskets}
                answeredQuestionIds={answeredQuestionIds}
                onEditScore={onEditScore}
                onAddToBasket={onAddToBasket}
                onRemoveFromBasket={onRemoveFromBasket}
                onUpdateStudentAnswer={onUpdateStudentAnswer}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card-base overflow-hidden">
      <div className="px-4 py-3">
        {section.type === "question" ? (
          question ? (
            <div className="space-y-3">
              {/* 题干 + 编号 */}
              <div className="flex items-start gap-1.5">
                <button
                  onClick={() => setInfoOpen(!infoOpen)}
                  className={cn(
                    "flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-ink-100 transition-colors",
                    infoOpen ? "text-gold-600" : "text-ink-400"
                  )}
                  title={infoOpen ? "收起题目信息" : "展开题目信息"}
                >
                  {infoOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div
                  onClick={() => setExpanded(!expanded)}
                  className="text-sm text-ink-900 leading-relaxed whitespace-pre-wrap cursor-pointer hover:text-gold-700 transition-colors select-none flex-1"
                >
                  <span className="font-mono text-ink-400 mr-1.5">{section.customLabel || `${questionNumber}.`}</span>
                  {question.stem}
                  {section.questionId && answeredQuestionIds.has(section.questionId) && (
                    <span className="tag-gold ml-2 text-[10px] py-0.5">已做过</span>
                  )}
                </div>
              </div>

              {/* 题目信息弹窗 */}
              {infoOpen && (
                <div className="pl-6 animate-fade-in">
                  <QuestionInfoPopover
                    question={question}
                    questionNumber={questionNumber}
                    questionAnswerSummary={questionAnswerSummary}
                    lectureStudents={lectureStudents}
                    answeredCount={answeredCount}
                    correctCount={correctCount}
                    partialCount={partialCount}
                    wrongCount={wrongCount}
                    defaultBasket={defaultBasket}
                    isInDefaultBasket={!!isInDefaultBasket}
                    baskets={baskets}
                    answerEditing={answerEditing}
                    savingStudentId={savingStudentId}
                    onEditScore={onEditScore}
                    onAddToBasket={onAddToBasket}
                    onRemoveFromBasket={onRemoveFromBasket}
                    onUpdateStudentAnswer={onUpdateStudentAnswer}
                    onToggleStudentScore={handleToggleStudentScore}
                    onSetAnswerEditing={setAnswerEditing}
                    onSetBasketPickerOpen={setBasketPickerOpen}
                  />
                </div>
              )}

              {/* 选项（按数量自适应列数） */}
              {question.options && question.options.length > 0 && (
                <div className={cn(
                  "pl-6 gap-2 grid",
                  getOptionsGridCols(question.options.length),
                )}>
                  {question.options.map((opt, i) => (
                    <div
                      key={i}
                      className={cn(
                        "p-2 rounded-md border text-sm flex items-start gap-1.5 min-w-0",
                        expanded && question.answer.includes(String.fromCharCode(65 + i))
                          ? "border-emerald-200 bg-emerald-50/50"
                          : "border-ink-100 bg-paper",
                      )}
                    >
                      <span className="font-mono font-semibold text-ink-700 flex-shrink-0">
                        {String.fromCharCode(65 + i)}.
                      </span>
                      <span className="text-ink-900 break-all">{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 答案与解析 */}
              {expanded && (
                <div className="space-y-2 animate-fade-in pl-6">
                  <div className="p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 font-medium whitespace-pre-wrap">
                    <span className="font-bold">答案：</span>
                    {question.answer}
                  </div>
                  {showSummary && (
                    <div className="p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed whitespace-pre-wrap">
                      <span className="font-bold text-gold-700">解析：</span>
                      {question.analysis}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-ink-400">题目加载中...</div>
          )
        ) : section.type === "knowledge" ? (
          <div className="flex gap-3">
            <span className="font-mono text-ink-400 w-8 flex-shrink-0">{questionNumber}.</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <span className="font-serif font-medium text-ink-900">{section.title}</span>
              </div>
              <div className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed pl-6">
                {section.content}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <span className="font-mono text-ink-400 w-8 flex-shrink-0">{questionNumber}.</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Type className="w-4 h-4 text-ink-400" />
                <span className="font-serif font-medium text-ink-900">{section.title}</span>
              </div>
              <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed pl-6">
                {section.content}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 试题篮选择弹窗 */}
      {basketPickerOpen && question && (
        <Modal
          open={basketPickerOpen}
          onClose={() => setBasketPickerOpen(false)}
          size="sm"
          title="加入试题篮"
          description={`题目：${question.stem.slice(0, 40)}...`}
        >
          <div className="space-y-2">
            {baskets.length === 0 ? (
              <div className="text-center py-6 text-sm text-ink-500">
                暂无试题篮
              </div>
            ) : (
              baskets.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    if (onAddToBasket) onAddToBasket(question.id, b.id);
                    setBasketPickerOpen(false);
                  }}
                  className="w-full text-left p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-ink-900 flex items-center gap-2">
                      {b.name}
                      {b.isDefault && <Badge variant="gold">默认</Badge>}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">{b.questionIds.length} 道题</div>
                  </div>
                  <Plus className="w-4 h-4 text-ink-400" />
                </button>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============ 章节内容展示（编辑模式） ============
function ChapterContent({
  chapter,
  answeredQuestionIds,
  onEditSection,
  onEditQuestion,
  onAddQuestion,
  onAddKnowledge,
}: {
  chapter: LectureSection;
  answeredQuestionIds: Set<string>;
  onEditSection: (sec: LectureSection) => void;
  onEditQuestion: (q: Question) => void;
  onAddQuestion: () => void;
  onAddKnowledge: () => void;
}) {
  const questions = chapter.children.filter((c) => c.type === "question");
  const knowledges = chapter.children.filter((c) => c.type === "knowledge");
  const texts = chapter.children.filter((c) => c.type === "text");

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-ink-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-gold-500" />
              {chapter.title}
            </h2>
            {chapter.content && (
              <p className="text-sm text-ink-600 mt-1 whitespace-pre-wrap">
                {chapter.content}
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onEditSection(chapter)}>
            <Edit3 className="w-3.5 h-3.5" />
            编辑章节
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4 text-teal-500" />
                <h3 className="font-serif font-semibold text-ink-900 text-sm">题目列表</h3>
                <Badge variant="ink">{questions.length} 道</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={onAddQuestion}>
                <Plus className="w-3.5 h-3.5" />
                添加题目
              </Button>
            </div>
            {questions.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-ink-200 rounded-lg">
                <ListOrdered className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                <div className="text-xs text-ink-400">暂无题目</div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={onAddQuestion}>
                  从题库添加
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {questions.map((q, idx) => (
                  <ChapterQuestionItem
                    key={q.id}
                    section={q}
                    index={idx}
                    answeredQuestionIds={answeredQuestionIds}
                    onEdit={() => onEditSection(q)}
                    onEditQuestion={onEditQuestion}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-gold-500" />
                <h3 className="font-serif font-semibold text-ink-900 text-sm">知识点</h3>
                <Badge variant="ink">{knowledges.length + texts.length} 条</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={onAddKnowledge}>
                <Plus className="w-3.5 h-3.5" />
                AI 生成
              </Button>
            </div>
            {knowledges.length === 0 && texts.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-ink-200 rounded-lg">
                <Sparkles className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                <div className="text-xs text-ink-400">暂无知识点</div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={onAddKnowledge}>
                  AI 生成知识点
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {[...knowledges, ...texts].map((k, idx) => (
                  <ChapterKnowledgeItem
                    key={k.id}
                    section={k}
                    index={idx}
                    onEdit={() => onEditSection(k)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function ChapterQuestionItem({
  section,
  index,
  answeredQuestionIds,
  onEdit,
  onEditQuestion,
}: {
  section: LectureSection;
  index: number;
  answeredQuestionIds: Set<string>;
  onEdit: () => void;
  onEditQuestion: (q: Question) => void;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (section.questionId) {
      questionService.getQuestion(section.questionId).then(setQuestion);
    }
  }, [section.questionId]);

  const answered = Boolean(section.questionId && answeredQuestionIds.has(section.questionId));

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden hover:border-ink-200 transition-colors">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 p-3 cursor-pointer hover:bg-mist/50 transition-colors"
      >
        <span className="font-mono text-xs text-ink-400 w-auto min-w-[2rem] flex-shrink-0 pt-0.5">
          {section.customLabel || `${index + 1}.`}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-900 whitespace-pre-wrap">
            {question?.stem || "加载中..."}
            {answered && (
              <span className="tag-gold ml-2 text-[10px] py-0.5">已做过</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (question) onEditQuestion(question);
            }}
            className="p-1 text-ink-400 hover:text-gold-600 hover:bg-gold-50 rounded transition-colors"
            title="编辑题目（同步题库）"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-ink-400 transition-transform flex-shrink-0",
              expanded && "rotate-180",
            )}
          />
        </div>
      </div>
      {expanded && question && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-50 animate-fade-in space-y-2">
          {question.options && question.options.length > 0 && (
            <div className={cn(
              "gap-2 grid",
              getOptionsGridCols(question.options.length),
            )}>
              {question.options.map((opt, i) => (
                <div
                  key={i}
                  className="text-xs p-2 rounded border border-ink-100 flex items-start gap-1.5 min-w-0"
                >
                  <span className="font-mono font-semibold text-ink-500 flex-shrink-0">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span className="text-ink-700 break-all">{opt}</span>
                </div>
              ))}
            </div>
          )}
          <div className="p-2 rounded bg-emerald-50/40 border border-emerald-200 text-xs text-emerald-900">
            <span className="font-bold">答案：</span>
            {question.answer}
          </div>
          <div className="p-2 rounded bg-gold-50/30 border border-gold-200 text-xs text-ink-700">
            <span className="font-bold text-gold-700">解析：</span>
            {question.analysis}
          </div>
        </div>
      )}
    </div>
  );
}

function ChapterKnowledgeItem({
  section,
  index,
  onEdit,
}: {
  section: LectureSection;
  index: number;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden hover:border-ink-200 transition-colors">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 p-3 cursor-pointer hover:bg-mist/50 transition-colors"
      >
        <span className="font-mono text-xs text-ink-400 w-auto min-w-[2rem] flex-shrink-0 pt-0.5">
          {section.customLabel || `${index + 1}.`}
        </span>
        {section.type === "knowledge" ? (
          <Sparkles className="w-4 h-4 text-gold-500 flex-shrink-0 mt-0.5" />
        ) : (
          <Type className="w-4 h-4 text-ink-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-900 line-clamp-1">
            {section.title}
          </div>
          {!expanded && (
            <div className="text-xs text-ink-500 line-clamp-2 mt-0.5">
              {section.content}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 text-ink-400 hover:text-gold-600 hover:bg-gold-50 rounded transition-colors"
            title="编辑"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-ink-400 transition-transform flex-shrink-0",
              expanded && "rotate-180",
            )}
          />
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-ink-50 animate-fade-in">
          <div className="text-xs text-ink-700 whitespace-pre-wrap leading-relaxed">
            {section.content}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 编辑模式章节预览 ============
function SectionPreview({
  section,
  index,
  onEdit,
  onEditQuestion,
  answeredQuestionIds,
}: {
  section: LectureSection;
  index: number;
  onEdit: () => void;
  onEditQuestion?: (q: Question) => void;
  answeredQuestionIds: Set<string>;
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (section.type === "question" && section.questionId) {
      questionService.getQuestion(section.questionId).then(setQuestion);
    }
  }, [section]);

  const typeIcon = section.type === "question" ? ListOrdered : section.type === "knowledge" ? Sparkles : Type;
  const Icon = typeIcon;

  return (
    <div className="border border-ink-100 rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-mist border-b border-ink-100">
        <span className="font-mono text-xs text-ink-400 w-auto min-w-[2rem]">{section.customLabel || `${index + 1}.`}</span>
        <Icon className={cn(
          "w-3.5 h-3.5 flex-shrink-0",
          section.type === "question" ? "text-teal-500" : section.type === "knowledge" ? "text-gold-500" : "text-ink-400",
        )} />
        <span className="font-serif font-medium text-sm text-ink-900 flex-1 truncate">{section.title}</span>
        {section.type === "question" && question && onEditQuestion && (
          <button
            onClick={() => onEditQuestion(question)}
            className="text-xs text-teal-600 hover:text-teal-700 mr-2"
          >
            编辑题目
          </button>
        )}
        <button onClick={onEdit} className="text-xs text-ink-400 hover:text-gold-600">编辑</button>
      </div>

      <div className="px-3 py-2">
        {section.type === "question" ? (
          question ? (
            <div>
              <div
                onClick={() => setExpanded(!expanded)}
                className="text-sm text-ink-900 mb-1 cursor-pointer hover:text-gold-700 transition-colors select-none whitespace-pre-wrap"
              >
                {question.stem}
                {section.questionId && answeredQuestionIds.has(section.questionId) && (
                  <span className="tag-gold ml-2 text-[10px] py-0.5">已做过</span>
                )}
              </div>
              {question.options && (
                <div className={cn(
                  "text-xs text-ink-600 mb-1 gap-2 grid",
                  getOptionsGridCols(question.options.length),
                )}>
                  {question.options.map((opt, i) => (
                    <div key={i} className="min-w-0">
                      <span className="font-mono font-semibold">{String.fromCharCode(65 + i)}.</span>
                      <span className="break-all"> {opt}</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-teal-600 hover:text-teal-700 mt-1"
              >
                {expanded ? "收起答案与解析" : "查看答案与解析"}
              </button>
              {expanded && (
                <div className="mt-2 space-y-1.5 animate-fade-in">
                  <div className="text-xs p-2 rounded bg-emerald-50/40 border border-emerald-200">
                    <span className="font-medium text-emerald-700">答案：</span>
                    <span className="text-ink-900">{question.answer}</span>
                  </div>
                  <div className="text-xs p-2 rounded bg-gold-50/30 border border-gold-200">
                    <span className="font-medium text-gold-700">解析：</span>
                    <span className="text-ink-900">{question.analysis}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ink-400">题目加载中...</div>
          )
        ) : section.type === "knowledge" ? (
          <div className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed">{section.content}</div>
        ) : (
          <div className="text-sm text-ink-700 whitespace-pre-wrap">{section.content}</div>
        )}
      </div>
    </div>
  );
}

// ============ 试题篮题目选择器 ============
function BasketQuestionsSelector({
  basket,
  selectedIds,
  onSelect,
}: {
  basket: Basket;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    questionService.listQuestions({}).then((all) => {
      setQuestions(all.filter((q) => basket.questionIds.includes(q.id)));
      setLoading(false);
    });
  }, [basket]);

  if (loading) return <Spinner size={20} />;

  return (
    <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          showActions={false}
          selected={selectedIds.includes(q.id)}
          onSelect={(qq) => {
            onSelect(
              selectedIds.includes(qq.id)
                ? selectedIds.filter((id) => id !== qq.id)
                : [...selectedIds, qq.id],
            );
          }}
        />
      ))}
    </div>
  );
}
