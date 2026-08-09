import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft, Save, Send, Plus, Sparkles, FileText, BookOpen,
  Trash2, ShoppingBasket, Library, Files,
  GraduationCap, Users, Loader2, X, ChevronDown, ChevronRight,
  Type, ListOrdered, CheckCircle2, Edit3, Eye,
  UserCheck, Award, Clock, Presentation, FileBox,
  Lightbulb, Printer, LayoutTemplate, FileStack,
  CheckSquare, Lock,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { basketService } from "@/services/basket";
import { promptToRemoveReferencedBasketQuestions } from "@/lib/basket-reference";
import { classService as classSvc } from "@/services/class";
import { knowledgeService } from "@/services/knowledge";
import { aiService } from "@/services/ai";
import { analyticsService, type DateRange } from "@/services/analytics";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { examPaperService } from "@/services/examPaper";
import { settingsService } from "@/services/settings";
import { prepService } from "@/services/prep";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { DocumentDownloadButton } from "@/components/resource/DocumentDownloadButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { TreeView } from "@/components/tree/TreeView";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { QuestionCard } from "@/components/question/QuestionCard";
import { QuestionEditor } from "@/components/question/QuestionEditor";
import { QuestionDistributionPanel } from "@/components/editor/QuestionDistributionPanel";
import { ClassAudiencePicker } from "@/components/editor/ClassAudiencePicker";
import { StudentAnswerStatusControl } from "@/components/editor/StudentAnswerStatusControl";
import { AddResourceToPrepModal } from "@/components/prep/AddResourceToPrepModal";
import { ResourceCommentButton } from "@/components/prep/ResourceCommentButton";
import { LectureSectionEditorRow } from "@/pages/lectures/LectureSectionEditorRow";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import type {
  Lecture, LectureSection, Question, Basket, AnyClass, TreeNode,
  Student, AnswerRecord, AnswerScore, Courseware, Material, SchoolClass, PersonalClass,
  LectureColumnTemplate, LectureType, ResourceSemester, ExamPaper,
  LessonCourseware, PrepResourceComment, PrepTask,
} from "@/types";
import { cn, getOptionsGridCols } from "@/lib/utils";
import { inferScore } from "@/services/analytics";
import { buildResourceTypeOptions } from "@/lib/resource-type-hierarchy";
import { isDocumentStructureLocked } from "@/lib/document-resource";
import { classAudienceLabel, resolveClassAudienceStudents } from "@/lib/class-audience";

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

type AddSource = "basket" | "bank" | "examPaper" | "lecture" | "courseware" | "material";

function flattenLectureSections(sections: LectureSection[]): LectureSection[] {
  return sections.flatMap((section) => [section, ...flattenLectureSections(section.children)]);
}

function findTreeNodesByIds(root: TreeNode, ids: Set<string>): TreeNode[] {
  const matches = root.id !== "root" && ids.has(root.id) ? [root] : [];
  return [...matches, ...root.children.flatMap((child) => findTreeNodesByIds(child, ids))];
}

export default function LectureEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get("preview") === "1";
  const prepTaskId = searchParams.get("prepTask");
  const { teacher } = useAuthStore();
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear, defaultSemester, ready: resourceOptionsReady } = useSchoolResourceOptions(teacher?.schoolId);

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const isStructureLocked = isDocumentStructureLocked(lecture);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [semester, setSemester] = useState<ResourceSemester>("上学期");
  const [typeId, setTypeId] = useState<string>("");
  const [lectureTypes, setLectureTypes] = useState<LectureType[]>([]);
  const lectureTypeOptions = useMemo(
    () => buildResourceTypeOptions(lectureTypes, { enabledOnly: true, currentId: typeId }),
    [lectureTypes, typeId],
  );
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<AnyClass[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [audienceClassPickerOpen, setAudienceClassPickerOpen] = useState(false);
  const [audienceSaving, setAudienceSaving] = useState(false);
  const [sections, setSections] = useState<LectureSection[]>([]);
  const [lectureQuestions, setLectureQuestions] = useState<Record<string, Question>>({});
  const [markingAllDone, setMarkingAllDone] = useState(false);

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
  const [selectedLectureSectionIds, setSelectedLectureSectionIds] = useState<string[]>([]);
  const [otherPapers, setOtherPapers] = useState<ExamPaper[]>([]);
  const [selectedOtherPaper, setSelectedOtherPaper] = useState<ExamPaper | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [replacingQuestion, setReplacingQuestion] = useState<{ sectionId: string; parentId?: string } | null>(null);

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
  const [columnTemplateOpen, setColumnTemplateOpen] = useState(false);
  const [templateChapterIds, setTemplateChapterIds] = useState<string[]>([]);
  const [columnTemplates, setColumnTemplates] = useState<LectureColumnTemplate[]>([]);
  const [createColumnTemplateOpen, setCreateColumnTemplateOpen] = useState(false);
  const [columnTemplateName, setColumnTemplateName] = useState("");
  const [columnTemplateDescription, setColumnTemplateDescription] = useState("");
  const [savingColumnTemplate, setSavingColumnTemplate] = useState(false);
  const [deletingColumnTemplateId, setDeletingColumnTemplateId] = useState<string | null>(null);

  // 预览稿等视图中的题目编辑（同步题库）
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
  const lectureQuestionIds = useMemo(
    () => Array.from(new Set(
      flattenLectureSections(sections)
        .filter((section) => section.type === "question" && section.questionId)
        .map((section) => section.questionId!),
    )),
    [sections],
  );
  const lectureQuestionList = useMemo(
    () => lectureQuestionIds.map((questionId) => lectureQuestions[questionId]).filter(Boolean),
    [lectureQuestionIds, lectureQuestions],
  );
  const selectedColumn = useMemo(
    () => sections.find((section) => section.id === selectedChapterId && section.type === "chapter") || null,
    [sections, selectedChapterId],
  );
  const activeColumnSections = useMemo(
    () => selectedColumn
      ? selectedColumn.children
      : sections.filter((section) => section.type !== "chapter"),
    [sections, selectedColumn],
  );
  const lectureStudents = useMemo(
    () => resolveClassAudienceStudents(selectedClassIds, classes, students),
    [selectedClassIds, classes, students],
  );
  const lectureStudentIds = useMemo(
    () => lectureStudents.map((student) => student.id),
    [lectureStudents],
  );
  const selectedClassLabel = useMemo(
    () => classAudienceLabel(selectedClassIds, classes),
    [selectedClassIds, classes],
  );

  useEffect(() => {
    let cancelled = false;
    if (lectureQuestionIds.length === 0) {
      setLectureQuestions({});
      return () => { cancelled = true; };
    }
    Promise.all(lectureQuestionIds.map((questionId) => questionService.getQuestion(questionId)))
      .then((loaded) => {
        if (cancelled) return;
        setLectureQuestions(Object.fromEntries(
          loaded.filter((question): question is Question => Boolean(question)).map((question) => [question.id, question]),
        ));
      });
    return () => { cancelled = true; };
  }, [lectureQuestionIds]);

  useEffect(() => {
    const load = async () => {
      if (!teacher || (id === "new" && !resourceOptionsReady)) return;
      setLoading(true);
      try {
        const [chs, kps, lecTypes, savedColumnTemplates] = await Promise.all([
          knowledgeService.getChapterTree(teacher.schoolId!),
          knowledgeService.getKnowledgeTree(teacher.schoolId!),
          settingsService.listLectureTypes(teacher.schoolId!),
          lectureService.listColumnTemplates(teacher.id, teacher.schoolId!),
        ]);
        setChapterTree(chs);
        setKnowledgeTree(kps);
        setLectureTypes(lecTypes);
        setColumnTemplates(savedColumnTemplates);
        const allClasses = await classSvc.listAllClasses(teacher.schoolId!, teacher.id);
        setClasses(allClasses);
        setBaskets(await basketService.listBaskets(teacher.id));
        const allStudents = await classSvc.listStudentsBySchool(teacher.schoolId!);
        setStudents(allStudents);
        classSvc.listSchoolClasses(teacher.schoolId!).then(setSchoolClasses);
        classSvc.listPersonalClasses(teacher.id).then(setPersonalClasses);

        if (id && id !== "new") {
          let lec: Lecture | null;
          if (prepTaskId) {
            const linked = await prepService.getLinkedResource(prepTaskId, prepPassword || undefined);
            if (!("sections" in linked.resource)) throw new Error("该协作任务关联的不是讲义");
            lec = linked.resource;
            setPrepTask(linked.task);
            setPrepComments(linked.comments);
          } else {
            lec = await lectureService.getLecture(id);
            setPrepTask(null);
            setPrepComments([]);
          }
          if (!lec) {
            toast.error("讲义不存在");
            navigate("/my-resources/lectures");
            return;
          }
          setLecture(lec);
          setTitle(lec.title);
          setDescription(lec.description || "");
          setGrade(lec.grade);
          setSchoolYear(lec.schoolYear);
          setSemester(lec.semester || "上学期");
          setTypeId(lec.typeId || "");
          setSelectedChapterIds(lec.chapterIds);
          setSelectedPointIds(lec.knowledgePointIds);
          setSelectedClassIds(lec.classIds);
          setSections(lec.sections);
          setSelectedChapterId(lec.sections.find((section) => section.type === "chapter")?.id || null);
          setSelectedStudentIds([]);
          setPrepPasswordOpen(false);

          const records = await analyticsService.listAnswerRecordsByLecture(lec.id);
          setAnswerRecords(records);
        } else {
          setTitle("未命名讲义");
          setGrade(defaultGrade);
          setSchoolYear(defaultSchoolYear);
          setSemester(defaultSemester);
          const initialColumn: LectureSection = {
            id: `sec-${Date.now()}`,
            title: "新建栏目",
            type: "chapter",
            content: "",
            children: [],
          };
          setSections([initialColumn]);
          setSelectedChapterId(initialColumn.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "讲义加载失败";
        if (prepTaskId && message.includes("密码")) {
          setPrepPasswordOpen(true);
        } else {
          toast.error("加载失败", message);
          navigate(prepTaskId ? "/prep" : "/my-resources/lectures");
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [id, teacher, navigate, defaultGrade, defaultSchoolYear, defaultSemester, resourceOptionsReady, prepPassword, prepTaskId]);

  useEffect(() => {
    if (prepTaskId || !lecture || !teacher || lecture.teacherId !== teacher.id || !teacher.schoolId) {
      setLinkedCourseware(null);
      setLinkedCoursewareLoading(false);
      return;
    }
    let cancelled = false;
    setLinkedCoursewareLoading(true);
    lessonCoursewareService.getCoursewareBySource(
      teacher.id,
      teacher.schoolId,
      "lecture",
      lecture.id,
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
  }, [lecture, prepTaskId, teacher]);

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
    if (teacher && addSource === "examPaper") {
      examPaperService.listPapers({ teacherId: teacher.id, schoolId: teacher.schoolId! }).then(setOtherPapers);
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

  const buildLecturePatch = () => ({
    title,
    description,
    chapterIds: selectedChapterIds,
    knowledgePointIds: selectedPointIds,
    grade,
    schoolYear,
    semester,
    classIds: selectedClassIds,
    studentIds: [],
    typeId: typeId || undefined,
    ...(isStructureLocked ? {} : { sections }),
  });

  const handleSave = async (publish = false) => {
    if (!teacher) return;
    if (!title.trim()) {
      toast.error("请填写讲义标题");
      return;
    }
    setSaving(true);
    if (publish) setPublishing(true);

    try {
      const payload = buildLecturePatch();

      if (lecture) {
        const updated = prepTaskId
          ? await prepService.updateLinkedResource(prepTaskId, payload, prepPassword || undefined) as Lecture
          : await lectureService.updateLecture(lecture.id, payload);
        if (publish && !prepTaskId) await lectureService.publish(lecture.id);
        toast.success(publish ? "讲义已发布" : "讲义已保存");
        setLecture(updated);
      } else {
        const created = await lectureService.createLecture(teacher.id, teacher.schoolId!, {
          ...payload,
          sections,
        });
        if (publish) await lectureService.publish(created.id);
        toast.success(publish ? "讲义已创建并发布" : "讲义已创建");
        navigate(`/lectures/${created.id}/edit`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "保存失败";
      if (prepTaskId && message.includes("密码")) setPrepPasswordOpen(true);
      toast.error("保存失败", message);
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const handleSendToMyCourseware = async () => {
    if (!lecture || !teacher?.schoolId || prepTaskId) return;
    if (linkedCourseware) {
      navigate(`/my-lessons/${linkedCourseware.id}/edit?preview=1`);
      return;
    }
    if (!title.trim()) {
      toast.error("请填写讲义标题");
      return;
    }
    setSendingToCourseware(true);
    try {
      if (!isPreview) {
        const updated = await lectureService.updateLecture(lecture.id, buildLecturePatch());
        setLecture(updated);
      }
      const courseware = await lessonCoursewareService.createFromLecture(
        teacher.id,
        teacher.schoolId,
        lecture.id,
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

  const handleConfirmAudience = async () => {
    if (!isPreview || !lecture) {
      setAudienceClassPickerOpen(false);
      return;
    }
    setAudienceSaving(true);
    try {
      const updated = await lectureService.updateLecture(lecture.id, {
        classIds: selectedClassIds,
        studentIds: [],
      });
      setLecture(updated);
      setAudienceClassPickerOpen(false);
      toast.success("使用对象已更新");
    } catch (error) {
      toast.error("更新使用对象失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAudienceSaving(false);
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

  // 添加栏目
  const handleAddChapter = () => {
    const columnCount = sections.filter((section) => section.type === "chapter").length;
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: columnCount === 0 ? "新建栏目" : `栏目 ${columnCount + 1}`,
      type: "chapter",
      content: "",
      children: [],
    };
    setSections((prev) => [...prev, newSec]);
    setSelectedChapterId(newSec.id);
    setOutlineExpanded((prev) => ({ ...prev, [newSec.id]: true }));
  };

  const handleAddColumnsFromTemplate = () => {
    if (!chapterTree || templateChapterIds.length === 0) {
      toast.warning("请至少选择一个栏目模板");
      return;
    }
    const nodes = findTreeNodesByIds(chapterTree, new Set(templateChapterIds));
    const existingTitles = new Set(sections.filter((section) => section.type === "chapter").map((section) => section.title));
    const now = Date.now();
    const newColumns = nodes
      .filter((node) => !existingTitles.has(node.name))
      .map<LectureSection>((node, index) => ({
        id: `sec-template-${now}-${index}`,
        title: node.name,
        type: "chapter",
        content: node.description || "",
        children: [],
      }));
    if (newColumns.length === 0) {
      toast.warning("所选模板栏目已存在");
      return;
    }
    setSections((previous) => [...previous, ...newColumns]);
    setSelectedChapterIds((previous) => Array.from(new Set([...previous, ...templateChapterIds])));
    setSelectedChapterId(newColumns[0].id);
    setOutlineExpanded((previous) => ({
      ...previous,
      ...Object.fromEntries(newColumns.map((column) => [column.id, true])),
    }));
    setColumnTemplateOpen(false);
    setTemplateChapterIds([]);
    toast.success(`已从模板添加 ${newColumns.length} 个栏目`);
  };

  const handleApplySavedColumnTemplate = (template: LectureColumnTemplate) => {
    const existingTitles = new Set(
      sections
        .filter((section) => section.type === "chapter")
        .map((section) => section.title.trim()),
    );
    const now = Date.now();
    const newColumns = template.columns
      .filter((column) => !existingTitles.has(column.title.trim()))
      .map<LectureSection>((column, index) => ({
        id: `sec-saved-template-${now}-${index}`,
        title: column.title,
        type: "chapter",
        content: column.content,
        children: [],
      }));
    if (newColumns.length === 0) {
      toast.warning("该模板中的栏目已全部存在");
      return;
    }
    setSections((previous) => [...previous, ...newColumns]);
    setSelectedChapterId(newColumns[0].id);
    setOutlineExpanded((previous) => ({
      ...previous,
      ...Object.fromEntries(newColumns.map((column) => [column.id, true])),
    }));
    setColumnTemplateOpen(false);
    setTemplateChapterIds([]);
    toast.success(`已使用模板“${template.name}”添加 ${newColumns.length} 个栏目`);
  };

  const handleCreateColumnTemplate = async () => {
    if (!teacher?.schoolId) return;
    const columns = sections
      .filter((section) => section.type === "chapter")
      .map((section) => ({ title: section.title, content: section.content }));
    if (!columnTemplateName.trim()) {
      toast.warning("请填写模板名称");
      return;
    }
    if (columns.length === 0) {
      toast.warning("当前讲义没有可保存的栏目");
      return;
    }
    setSavingColumnTemplate(true);
    try {
      const created = await lectureService.createColumnTemplate(teacher.id, teacher.schoolId, {
        name: columnTemplateName,
        description: columnTemplateDescription,
        columns,
      });
      setColumnTemplates((previous) => [created, ...previous]);
      setCreateColumnTemplateOpen(false);
      setColumnTemplateName("");
      setColumnTemplateDescription("");
      toast.success(`已保存栏目模板“${created.name}”`);
    } catch (error) {
      toast.error("保存栏目模板失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSavingColumnTemplate(false);
    }
  };

  const handleDeleteColumnTemplate = async (template: LectureColumnTemplate) => {
    if (!teacher) return;
    setDeletingColumnTemplateId(template.id);
    try {
      await lectureService.deleteColumnTemplate(template.id, teacher.id);
      setColumnTemplates((previous) => previous.filter((item) => item.id !== template.id));
      toast.success(`已删除栏目模板“${template.name}”`);
    } catch (error) {
      toast.error("删除栏目模板失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDeletingColumnTemplateId(null);
    }
  };

  const handleAddTextSection = (targetChapterId = selectedChapterId) => {
    const newSec: LectureSection = {
      id: `sec-${Date.now()}`,
      title: "新文本段落",
      type: "text",
      content: "在此输入段落内容...",
      children: [],
    };
    if (targetChapterId) {
      setSections((prev) =>
        prev.map((s) =>
          s.id === targetChapterId
            ? { ...s, children: [...s.children, newSec] }
            : s,
        ),
      );
      setOutlineExpanded((prev) => ({ ...prev, [targetChapterId]: true }));
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
      const knowledgeMap: Record<string, string> = {};
      allKnowledges.forEach((k) => { knowledgeMap[k.id] = k.name; });

      const targetChapterIds = autoSelChapterIds;
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

        const chapterQs = shuffledQs.filter((q) => q.chapterIds?.includes(chId));
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

        const chapterMats = shuffledMats.filter((m) => m.chapterIds.includes(chId));
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

      if (autoIncludeKnowledgeAnalysis) {
        for (const kid of targetKnowledgeIds) {
          const kpName = knowledgeMap[kid] || "知识点";
          try {
            const analysis = await aiService.generateKnowledgePoint(kpName);
            newSections.push({
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

  const closeAddSourceModal = () => {
    setAddSource(null);
    setSelectedQuestionIds([]);
    setSelectedLectureSectionIds([]);
    setSelectedResourceIds([]);
    setSelectedBasket(null);
    setSelectedOtherLecture(null);
    setSelectedOtherPaper(null);
    setReplacingQuestion(null);
  };

  // 添加讲义内容 / 换题
  const handleConfirmAddQuestions = async () => {
    const selectedCount = addSource === "lecture"
      ? selectedLectureSectionIds.length
      : selectedQuestionIds.length;
    if (!addSource || selectedCount === 0) {
      toast.error(addSource === "lecture" ? "请选择至少一个知识块或题目" : "请选择至少一道题目");
      return;
    }

    let questionsToAdd: Question[] = [];
    let newSections: LectureSection[] = [];
    if (addSource === "basket" && selectedBasket) {
      const candidateIds = selectedBasket.questionIds.filter((questionId) => selectedQuestionIds.includes(questionId));
      questionsToAdd = await questionService.listQuestions({ schoolId: teacher!.schoolId!, ids: candidateIds });
    } else if (addSource === "bank") {
      questionsToAdd = bankQuestions.filter((q) => selectedQuestionIds.includes(q.id));
    } else if (addSource === "examPaper" && selectedOtherPaper) {
      const candidateIds = selectedOtherPaper.questions
        .map((question) => question.questionId)
        .filter((questionId): questionId is string => Boolean(questionId) && selectedQuestionIds.includes(questionId));
      questionsToAdd = await questionService.listQuestions({ schoolId: teacher!.schoolId!, ids: candidateIds });
    } else if (addSource === "lecture" && selectedOtherLecture) {
      const now = Date.now();
      newSections = flattenLectureSections(selectedOtherLecture.sections)
        .filter((section) =>
          selectedLectureSectionIds.includes(section.id)
          && (section.type === "knowledge" || section.type === "question"),
        )
        .map((section, index) => ({
          ...section,
          id: `sec-import-${now}-${index}-${section.id}`,
          children: [],
        }));
    }

    if (newSections.length === 0) {
      newSections = questionsToAdd.map((q) => ({
        id: `sec-${Date.now()}-${q.id}`,
        title: `题目·${q.stem.slice(0, 18)}${q.stem.length > 18 ? "..." : ""}`,
        type: "question",
        content: "",
        questionId: q.id,
        children: [],
      }));
    }

    if (newSections.length === 0) {
      toast.error("没有可添加的内容");
      return;
    }

    if (replacingQuestion) {
      const replacement = newSections[0];
      if (newSections.length !== 1 || replacement.type !== "question" || !replacement.questionId) {
        toast.error("换题时只能选择一道题目");
        return;
      }
      setSections((previous) => previous.map((section) => {
        if (replacingQuestion.parentId && section.id === replacingQuestion.parentId) {
          return {
            ...section,
            children: section.children.map((child) =>
              child.id === replacingQuestion.sectionId
                ? {
                    ...child,
                    title: replacement.title,
                    content: replacement.content,
                    questionId: replacement.questionId,
                    children: [],
                  }
                : child,
            ),
          };
        }
        if (!replacingQuestion.parentId && section.id === replacingQuestion.sectionId) {
          return {
            ...section,
            title: replacement.title,
            content: replacement.content,
            questionId: replacement.questionId,
            children: [],
          };
        }
        return section;
      }));
      toast.success("题目已更换");
    } else {
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
        const questionIds = newSections
          .filter((section) => section.type === "question" && section.questionId)
          .map((section) => section.questionId!);
        for (const questionId of questionIds) {
          await lectureService.addQuestionToLecture(lecture.id, questionId);
        }
      }

      const questionCount = newSections.filter((section) => section.type === "question").length;
      const knowledgeCount = newSections.filter((section) => section.type === "knowledge").length;
      toast.success(
        knowledgeCount > 0
          ? `已添加 ${knowledgeCount} 个知识块、${questionCount} 道题目`
          : `已添加 ${questionCount} 道题目`,
      );
    }

    if (addSource === "basket" && selectedBasket) {
      const referencedQuestions = replacingQuestion ? questionsToAdd.slice(0, 1) : questionsToAdd;
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

    closeAddSourceModal();
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
    if (!parentId && selectedChapterId === secId) {
      const nextColumn = sections.find((section) => section.id !== secId && section.type === "chapter");
      setSelectedChapterId(nextColumn?.id || null);
    }
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

  const handleMoveChildSection = (parentId: string, idx: number, direction: "up" | "down") => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== parentId) return section;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= section.children.length) return section;
        const children = [...section.children];
        [children[idx], children[target]] = [children[target], children[idx]];
        return { ...section, children };
      }),
    );
  };

  const handleUpdateColumnTitle = (sectionId: string, nextTitle: string) => {
    setSections((previous) => previous.map((section) =>
      section.id === sectionId
        ? { ...section, title: nextTitle }
        : section,
    ));
  };

  const handleUpdateSectionLabel = (sectionId: string, label: string, parentId?: string) => {
    setSections((previous) => previous.map((section) => {
      if (parentId && section.id === parentId) {
        return {
          ...section,
          children: section.children.map((child) =>
            child.id === sectionId
              ? { ...child, customLabel: label || undefined }
              : child,
          ),
        };
      }
      if (!parentId && section.id === sectionId) {
        return { ...section, customLabel: label || undefined };
      }
      return section;
    }));
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

  const handleMarkAllDone = async () => {
    if (!lecture) {
      toast.warning("请先保存讲义，再标注学生完成情况");
      return;
    }
    if (lectureStudentIds.length === 0) {
      toast.warning("请先添加使用班级");
      return;
    }
    if (lectureQuestionIds.length === 0) {
      toast.warning("讲义中暂无题目");
      return;
    }

    setMarkingAllDone(true);
    try {
      const existingRecords = await analyticsService.listAnswerRecordsByStudents(lectureStudentIds);
      const existingKeys = new Set(
        existingRecords
          .filter((record) => record.lectureId === lecture.id)
          .map((record) => `${record.studentId}:${record.questionId}`),
      );
      const pendingRecords = lectureStudentIds.flatMap((studentId) =>
        lectureQuestionIds
          .filter((questionId) => !existingKeys.has(`${studentId}:${questionId}`))
          .map((questionId) => ({
            studentId,
            questionId,
            lectureId: lecture.id,
            score: "done" as const,
            source: "manual" as const,
          })),
      );
      if (pendingRecords.length > 0) {
        await analyticsService.batchSaveAnswerRecords(pendingRecords);
      }
      const [records, answeredIds] = await Promise.all([
        analyticsService.listAnswerRecordsByLecture(lecture.id),
        analyticsService.getAnsweredQuestionIds(lectureStudentIds, dateRange),
      ]);
      setAnswerRecords(records);
      setAnsweredQuestionIds(answeredIds);
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

  const lectureFormat = useMemo(() => {
    const type = lectureTypes.find((t) => t.id === typeId);
    return type?.format || "mixed";
  }, [lectureTypes, typeId]);

  const prepPasswordModal = (
    <Modal
      open={prepPasswordOpen}
      onClose={() => navigate("/prep")}
      title="输入协作文档密码"
      description="该讲义设置了查看密码，验证后才能查看和编辑。"
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

  if (prepPasswordOpen && !lecture) return <div>{prepPasswordModal}</div>;

  const audienceClassModal = (
    <Modal
      open={audienceClassPickerOpen}
      onClose={() => setAudienceClassPickerOpen(false)}
      size="lg"
      title="添加使用对象"
      description="使用对象只设置到班级；具体学生的答题情况可在预览中逐题调整。"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClassIds([])}>
            清空选择
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAudienceClassPickerOpen(false)}>
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
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title={lecture?.title || title}
          description={lecture?.description || description || "预览模式"}
          icon={<FileText className="w-5 h-5" />}
          action={
            <div className="flex items-center gap-2">
              {!prepTaskId && (
                <Button variant="outline" onClick={() => setAudienceClassPickerOpen(true)}>
                  <Users className="w-4 h-4" />
                  <span className="max-w-48 truncate">
                    {selectedClassIds.length > 0 ? selectedClassLabel : "添加使用对象"}
                  </span>
                  {selectedClassIds.length > 0 && <Badge variant="gold">{selectedClassIds.length}班</Badge>}
                </Button>
              )}
              {!prepTaskId && lecture?.teacherId === teacher?.id && (
                <Button
                  variant="outline"
                  onClick={handleSendToMyCourseware}
                  loading={sendingToCourseware}
                  disabled={linkedCoursewareLoading}
                >
                  <Presentation className="w-4 h-4" />
                  {linkedCourseware ? "课件" : "发送到我的课件"}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleMarkAllDone}
                loading={markingAllDone}
                disabled={lectureStudentIds.length === 0 || lectureQuestionIds.length === 0}
              >
                <CheckSquare className="w-4 h-4" />
                全部设为使用
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/lectures/${id}/edit${prepTaskId ? `?prepTask=${prepTaskId}` : ""}`)}
              >
                <Edit3 className="w-4 h-4" />
                返回编辑
              </Button>
            </div>
          }
        />

        {/* 讲义信息 */}
        <Card className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-gold-500" />
              <span className="text-ink-500">年级：</span>
              <span className="font-medium text-ink-900">{grade} · {schoolYear} · {semester}</span>
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
            <LectureEditorPreviewSection
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
                          done: { label: "已做", cls: "text-teal-600 bg-teal-50" },
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
                        done: { label: "已做", cls: "bg-teal-50 text-teal-700 border-teal-200" },
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
        {audienceClassModal}
      </div>
    );
  }

  // ===== 编辑模式 =====
  return (
    <div>
      <PageHeader
        title={lecture ? `编辑：${lecture.title}` : "新建讲义"}
        description="编排栏目、知识块与题目，并设置讲义使用班级"
        icon={<FileText className="w-5 h-5" />}
        action={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => navigate(prepTaskId ? `/prep/tasks/${prepTaskId}` : "/my-resources/lectures")}
              >
                <ArrowLeft className="w-4 h-4" />
                返回
              </Button>
              {lecture && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/lectures/${lecture.id}/preview`)}
                >
                  <Eye className="w-4 h-4" />
                  预览
                </Button>
              )}
              <Button variant="outline" onClick={() => handleSave(false)} loading={saving}>
                <Save className="w-4 h-4" />
                保存
              </Button>
              {!prepTaskId && (
                <Button variant="gold" onClick={() => handleSave(true)} loading={publishing}>
                  <Send className="w-4 h-4" />
                  发布
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {!prepTaskId && lecture?.teacherId === teacher?.id && (
                <Button variant="outline" onClick={() => setPrepSetupOpen(true)}>
                  <Users className="w-4 h-4" />
                  添加到集体备课
                </Button>
              )}
              {!prepTaskId && lecture?.teacherId === teacher?.id && (
                <Button
                  variant="outline"
                  onClick={handleSendToMyCourseware}
                  loading={sendingToCourseware}
                  disabled={linkedCoursewareLoading}
                >
                  <Presentation className="w-4 h-4" />
                  {linkedCourseware ? "课件" : "发送到我的课件"}
                </Button>
              )}
              <Button variant="outline" onClick={() => setAudienceClassPickerOpen(true)}>
                <UserCheck className="w-4 h-4" />
                <span className="max-w-48 truncate">
                  {selectedClassIds.length > 0 ? selectedClassLabel : "添加使用对象"}
                </span>
                {selectedClassIds.length > 0 && <Badge variant="gold">{selectedClassIds.length}班</Badge>}
              </Button>
            </div>
          </div>
        }
      />

      {/* 完成情况学生选择器 + 时间周期选择器 */}
      {currentVersionType !== "extract" && (
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
      )}

      {/* 根据版本类型显示不同内容 */}
      {currentVersionType === "extract" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-gold-600" />
                <h3 className="font-serif font-semibold text-ink-900">讲义属性</h3>
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-500">
                <span>{sections.filter((section) => section.type === "chapter").length} 个栏目</span>
                <span className="font-semibold text-gold-700">{lectureQuestionIds.length} 道题</span>
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <Input label="标题" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="lg:col-span-2">
                <Textarea
                  label="描述"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={1}
                  placeholder="讲义简介"
                />
              </div>
              <Select
                label="适用年级"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                options={includeCurrentOption(gradeOptions, grade)}
              />
              <Select
                label="学年"
                value={schoolYear}
                onChange={(event) => setSchoolYear(event.target.value)}
                options={includeCurrentOption(schoolYearOptions, schoolYear)}
              />
              <Select
                label="学期"
                value={semester}
                onChange={(event) => setSemester(event.target.value as ResourceSemester)}
                options={semesterOptions}
              />
              <Select
                label="讲义类型"
                value={typeId}
                onChange={(event) => setTypeId(event.target.value)}
                options={[
                  { value: "", label: "未设置" },
                  ...lectureTypeOptions,
                ]}
              />
              <details className="md:col-span-2 lg:col-span-4 rounded-lg border border-ink-100 bg-ink-50/40">
                <summary className="px-3 py-2 text-xs font-medium text-ink-600 cursor-pointer select-none">
                  章节目录与知识点
                </summary>
                <div className="grid lg:grid-cols-2 gap-4 p-3 border-t border-ink-100 bg-paper">
                  <div>
                    <div className="text-xs font-medium text-ink-600 mb-1.5">章节目录</div>
                    {chapterTree && (
                      <TreeView
                        data={chapterTree}
                        checkable
                        checkedIds={selectedChapterIds}
                        onCheck={setSelectedChapterIds}
                        expandLevel={1}
                        className="text-xs max-h-52 overflow-auto"
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
                        className="text-xs max-h-52 overflow-auto"
                      />
                    )}
                  </div>
                </div>
              </details>
            </div>
          </Card>

          {isStructureLocked && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-900">
              <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>上传原稿和拆解稿可修改文档属性；栏目、内容块、题目和顺序保持原稿结构。</span>
            </div>
          )}

          <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <Card className="min-w-0 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-ink-100">
                <div className="flex items-center gap-2">
                  <ListOrdered className="w-4 h-4 text-teal-500" />
                  <h3 className="font-serif font-semibold text-ink-900">讲义全貌</h3>
                  <Badge variant="ink">{sections.length} 个内容块</Badge>
                </div>
                {!isStructureLocked && <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setColumnTemplateOpen(true)}>
                    <LayoutTemplate className="w-3.5 h-3.5" /> 栏目模板
                  </Button>
                  <Button variant="gold" size="sm" onClick={handleAddChapter}>
                    <Plus className="w-3.5 h-3.5" /> 添加栏目
                  </Button>
                </div>}
              </div>

              {editingSection && editingSection.type !== "chapter" && !isStructureLocked && (
                <div className="p-3 mb-4 rounded-lg border border-gold-200 bg-gold-50/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-ink-700">
                      {editingSection.type === "question" ? "编辑题目块" : "编辑内容块"}
                    </span>
                    <button type="button" onClick={() => setEditingSection(null)} className="text-ink-400 hover:text-ink-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <Input
                      label="编号标签"
                      value={sectionLabel}
                      onChange={(event) => setSectionLabel(event.target.value)}
                      placeholder="如：例1、变式2"
                    />
                    <Input
                      label="标题"
                      value={sectionTitle}
                      onChange={(event) => setSectionTitle(event.target.value)}
                    />
                    {editingSection.type !== "question" && (
                      <div className="md:col-span-2">
                        <Textarea
                          label="内容"
                          value={sectionContent}
                          onChange={(event) => setSectionContent(event.target.value)}
                          rows={4}
                        />
                      </div>
                    )}
                  </div>
                  {editingSection.type === "question" && (
                    <div className="text-[11px] text-ink-500 mt-2">题目正文在题库中统一编辑；题号也可直接在下方题目左上角修改。</div>
                  )}
                  <div className="flex justify-end mt-3">
                    <Button variant="gold" size="sm" onClick={handleSaveSection}>
                      <Save className="w-3.5 h-3.5" /> 保存
                    </Button>
                  </div>
                </div>
              )}

              {sections.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-ink-200" />
                  <div className="text-sm text-ink-500 mb-1">讲义暂无栏目</div>
                  <div className="text-xs text-ink-400 mb-3">先创建栏目，再加入知识块、文本或题目。</div>
                  {!isStructureLocked && (
                    <Button variant="gold" size="sm" onClick={handleAddChapter}>
                      <Plus className="w-3.5 h-3.5" /> 创建第一个栏目
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {sections.map((section, sectionIndex) => {
                    if (section.type !== "chapter") return null;
                    const selected = selectedChapterId === section.id;
                    return (
                      <section
                        key={section.id}
                        className={cn(
                          "rounded-xl border p-3 transition-colors",
                          selected ? "border-gold-300 bg-gold-50/20" : "border-ink-100 bg-paper",
                        )}
                      >
                        <div className="flex flex-wrap items-start gap-2 mb-3 pb-3 border-b border-ink-100">
                          <div
                            onClick={() => setSelectedChapterId(section.id)}
                            className="min-w-0 flex-1"
                          >
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 flex-shrink-0 text-gold-600" />
                              <input
                                aria-label={`栏目名称 ${sectionIndex + 1}`}
                                value={section.title}
                                disabled={isStructureLocked}
                                onFocus={() => setSelectedChapterId(section.id)}
                                onChange={(event) => handleUpdateColumnTitle(section.id, event.target.value)}
                                placeholder="栏目名称（可留空）"
                                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-serif font-bold text-ink-900 outline-none transition-colors placeholder:font-sans placeholder:font-normal placeholder:text-ink-300 hover:border-ink-200 focus:border-gold-400 focus:bg-paper disabled:cursor-default disabled:hover:border-transparent"
                              />
                              {selected && <Badge variant="gold">当前栏目</Badge>}
                            </div>
                            {section.content && (
                              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-500">{section.content}</p>
                            )}
                          </div>
                          {!isStructureLocked && <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveSection(sectionIndex, "up")}
                              disabled={sectionIndex === 0}
                              className="rounded p-1 text-ink-400 hover:bg-gold-50 hover:text-gold-700 disabled:opacity-25"
                              title="栏目上移"
                            >↑</button>
                            <button
                              type="button"
                              onClick={() => handleMoveSection(sectionIndex, "down")}
                              disabled={sectionIndex === sections.length - 1}
                              className="rounded p-1 text-ink-400 hover:bg-gold-50 hover:text-gold-700 disabled:opacity-25"
                              title="栏目下移"
                            >↓</button>
                            <button
                              type="button"
                              onClick={() => handleRemoveSection(section.id)}
                              className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
                              title="删除栏目"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>}
                        </div>

                        {!isStructureLocked && <div className="flex flex-wrap items-center gap-1.5 mb-3 rounded-lg border border-ink-100 bg-ink-50/50 p-2">
                          <span className="mr-1 text-xs font-medium text-ink-500">添加内容</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("basket");
                            }}
                          >
                            <ShoppingBasket className="w-3.5 h-3.5" /> 资源篮
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("bank");
                            }}
                          >
                            <Library className="w-3.5 h-3.5" /> 题库
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("lecture");
                            }}
                          >
                            <Files className="w-3.5 h-3.5" /> 其它讲义
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("examPaper");
                            }}
                          >
                            <FileStack className="w-3.5 h-3.5" /> 其它试卷
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("material");
                            }}
                          >
                            <FileBox className="w-3.5 h-3.5" /> 素材库
                          </Button>
                        </div>}

                        {section.children.length === 0 ? (
                          <button
                            type="button"
                            disabled={isStructureLocked}
                            onClick={() => {
                              setSelectedChapterId(section.id);
                              setAddSource("bank");
                            }}
                            className="w-full rounded-lg border border-dashed border-ink-200 py-8 text-xs text-ink-400 hover:border-gold-300 hover:text-gold-700 disabled:cursor-default disabled:hover:border-ink-200 disabled:hover:text-ink-400"
                          >
                            {isStructureLocked ? "当前栏目暂无内容" : "当前栏目暂无内容，点击添加题目"}
                          </button>
                        ) : (
                          <div className="space-y-3">
                            {section.children.map((child, childIndex) => {
                              const questionIndex = section.children
                                .slice(0, childIndex + 1)
                                .filter((item) => item.type === "question").length - 1;
                              const question = child.questionId ? lectureQuestions[child.questionId] : undefined;
                              return (
                                <div key={child.id} className="space-y-1">
                                  <LectureSectionEditorRow
                                    section={child}
                                    index={Math.max(0, questionIndex)}
                                    question={question}
                                    answered={Boolean(child.questionId && answeredQuestionIds.has(child.questionId))}
                                    canMoveUp={childIndex > 0}
                                    canMoveDown={childIndex < section.children.length - 1}
                                    onLabelChange={(label) => handleUpdateSectionLabel(child.id, label, section.id)}
                                    onMoveUp={() => handleMoveChildSection(section.id, childIndex, "up")}
                                    onMoveDown={() => handleMoveChildSection(section.id, childIndex, "down")}
                                    onEditSection={() => {
                                      setEditingSection(child);
                                      setSectionTitle(child.title);
                                      setSectionContent(child.content);
                                      setSectionLabel(child.customLabel || "");
                                    }}
                                    onReplaceQuestion={question ? () => {
                                      setReplacingQuestion({ sectionId: child.id, parentId: section.id });
                                      setSelectedQuestionIds([]);
                                      setAddSource("bank");
                                    } : undefined}
                                    onRemove={() => handleRemoveSection(child.id, section.id)}
                                    readOnly={isStructureLocked}
                                  />
                                  {prepTaskId && (
                                    <div className="flex justify-end">
                                      <ResourceCommentButton
                                        taskId={prepTaskId}
                                        targetId={child.id}
                                        targetLabel={child.title}
                                        password={prepPassword || undefined}
                                        comments={prepComments}
                                        onCommentsChange={setPrepComments}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    );
                  })}

                  {sections.some((section) => section.type !== "chapter") && (
                    <section className="rounded-xl border border-ink-100 bg-paper p-3">
                      <div className="mb-3 flex items-center gap-2 border-b border-ink-100 pb-3">
                        <FileText className="w-4 h-4 text-ink-500" />
                        <h2 className="font-serif font-bold text-ink-900">未归入栏目内容</h2>
                      </div>
                      <div className="space-y-3">
                        {sections.filter((section) => section.type !== "chapter").map((section, rootIndex, ungrouped) => {
                          const questionIndex = ungrouped
                            .slice(0, rootIndex + 1)
                            .filter((item) => item.type === "question").length - 1;
                          const question = section.questionId ? lectureQuestions[section.questionId] : undefined;
                          return (
                            <LectureSectionEditorRow
                              key={section.id}
                              section={section}
                              index={Math.max(0, questionIndex)}
                              question={question}
                              answered={Boolean(section.questionId && answeredQuestionIds.has(section.questionId))}
                              canMoveUp={rootIndex > 0}
                              canMoveDown={rootIndex < ungrouped.length - 1}
                              onLabelChange={(label) => handleUpdateSectionLabel(section.id, label)}
                              onMoveUp={() => handleMoveSection(sections.indexOf(section), "up")}
                              onMoveDown={() => handleMoveSection(sections.indexOf(section), "down")}
                              onEditSection={() => {
                                setEditingSection(section);
                                setSectionTitle(section.title);
                                setSectionContent(section.content);
                                setSectionLabel(section.customLabel || "");
                              }}
                              onReplaceQuestion={question ? () => {
                                setReplacingQuestion({ sectionId: section.id });
                                setSelectedQuestionIds([]);
                                setAddSource("bank");
                              } : undefined}
                              onRemove={() => handleRemoveSection(section.id)}
                              readOnly={isStructureLocked}
                            />
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </Card>

            <div className="space-y-4 xl:sticky xl:top-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold-500" />
                  <h3 className="font-serif font-semibold text-ink-900 text-sm">讲义工具</h3>
                </div>
                {isStructureLocked ? (
                  <div className="flex items-start gap-2 rounded-md bg-ink-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-500">
                    <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>当前文档结构已锁定，不能新增、删除或调整内容。</span>
                  </div>
                ) : (
                  <>
                <Select
                  label="内容添加到"
                  value={selectedChapterId || ""}
                  onChange={(event) => setSelectedChapterId(event.target.value || null)}
                  options={sections
                    .filter((section) => section.type === "chapter")
                    .map((section) => ({ value: section.id, label: section.title || "未命名栏目" }))}
                  placeholder="请选择栏目"
                />
                <Button variant="gold" size="sm" className="w-full justify-start" onClick={() => setAutoGenOpen(true)}>
                  <Sparkles className="w-3.5 h-3.5" /> AI 自动组讲义
                </Button>
                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="outline" size="sm" onClick={handleAddChapter}>
                    <Plus className="w-3.5 h-3.5" /> 新建栏目
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setColumnTemplateOpen(true)}>
                    <LayoutTemplate className="w-3.5 h-3.5" /> 栏目模板
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCreateColumnTemplateOpen(true)}>
                    <Save className="w-3.5 h-3.5" /> 保存模板
                  </Button>
                  <Button variant="outline" size="sm" disabled={!selectedColumn} onClick={() => setAddSource("basket")}>
                    <ShoppingBasket className="w-3.5 h-3.5" /> 资源篮
                  </Button>
                  <Button variant="outline" size="sm" disabled={!selectedColumn} onClick={() => setAddSource("bank")}>
                    <Library className="w-3.5 h-3.5" /> 题库
                  </Button>
                  <Button variant="outline" size="sm" disabled={!selectedColumn} onClick={() => setAddSource("lecture")}>
                    <Files className="w-3.5 h-3.5" /> 其它讲义
                  </Button>
                  <Button variant="outline" size="sm" disabled={!selectedColumn} onClick={() => setAddSource("examPaper")}>
                    <FileStack className="w-3.5 h-3.5" /> 其它试卷
                  </Button>
                  <Button variant="outline" size="sm" disabled={!selectedColumn} onClick={() => setAddSource("material")}>
                    <FileBox className="w-3.5 h-3.5" /> 素材库
                  </Button>
                </div>
                  </>
                )}

                <div className="pt-3 border-t border-ink-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-500">当前栏目</span>
                    <span className="max-w-[180px] truncate font-medium text-ink-800">
                      {selectedColumn ? selectedColumn.title || "未命名栏目" : "未选择"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-500">内容块</span>
                    <span className="font-medium text-ink-800">{selectedColumn?.children.length || 0} 个</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-500">题目总数</span>
                    <span className="font-semibold text-gold-700">{lectureQuestionIds.length} 道</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-ink-100">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-serif font-semibold text-ink-900 text-sm">使用班级</h3>
                    <Badge variant="ink">{selectedClassIds.length}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setAudienceClassPickerOpen(true)}>
                    <Plus className="w-3.5 h-3.5" /> 添加
                  </Button>
                </div>

                {selectedClassIds.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setAudienceClassPickerOpen(true)}
                    className="w-full py-8 rounded-lg border border-dashed border-ink-200 text-xs text-ink-400 hover:border-gold-300 hover:text-gold-700"
                  >
                    添加该讲义使用班级
                  </button>
                ) : (
                  <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {classes.filter((item) => selectedClassIds.includes(item.id)).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-md border border-ink-100 px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-ink-800 truncate">{item.name}</div>
                          <div className="text-[10px] text-ink-400 truncate">
                            {item.type === "personal" ? "个人班级" : item.grade || "未设置年级"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedClassIds((previous) => previous.filter((classId) => classId !== item.id))}
                          className="text-ink-300 hover:text-red-600"
                          title="移除班级"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedClassIds.length > 0 && (
                  <div className="space-y-2 pt-3 mt-3 border-t border-ink-100">
                    <div className="text-[11px] text-ink-500">共覆盖 {lectureStudents.length} 名学生</div>
                    <Button
                      variant="gold"
                      size="sm"
                      className="w-full"
                      onClick={handleMarkAllDone}
                      loading={markingAllDone}
                      disabled={!lecture || lectureStudentIds.length === 0 || lectureQuestionIds.length === 0}
                    >
                      <CheckSquare className="w-3.5 h-3.5" /> 一键标记全部学生已做
                    </Button>
                    {!lecture && <div className="text-[11px] text-ink-400">先保存讲义后即可标记学生答题情况。</div>}
                  </div>
                )}
              </Card>

              <QuestionDistributionPanel questions={lectureQuestionList} knowledgeTree={knowledgeTree} />
            </div>
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
              <MathHtml className="text-xl font-bold text-center text-ink-900 mb-2">
                {lecture?.title || title}
              </MathHtml>
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
              <DocumentDownloadButton
                fileUrl={lecture.originalFileUrl}
                fileName={lecture.originalFileName}
                label="下载原稿"
                className="gap-2 px-4 py-2 bg-gold-500 text-white rounded-lg hover:bg-gold-600 transition-colors"
              />
              <p className="text-xs text-ink-400 mt-4">原稿为未拆解的原始上传文件，如需编辑请切换到{lecture?.isExtractCopy ? "拆解稿" : "正稿"}</p>
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


      {/* 栏目模板 */}
      <Modal
        open={columnTemplateOpen}
        onClose={() => {
          setColumnTemplateOpen(false);
          setTemplateChapterIds([]);
        }}
        size="lg"
        title="栏目模板"
        description={`已保存 ${columnTemplates.length} 个模板；也可从章节目录生成栏目`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setColumnTemplateOpen(false);
                setTemplateChapterIds([]);
              }}
            >
              取消
            </Button>
            <Button variant="gold" onClick={handleAddColumnsFromTemplate} disabled={templateChapterIds.length === 0}>
              <Plus className="w-3.5 h-3.5" />
              从章节目录添加{templateChapterIds.length > 0 ? `（${templateChapterIds.length}）` : ""}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="text-sm font-semibold text-ink-800">我的栏目模板</h4>
                <p className="text-xs text-ink-400 mt-0.5">保存当前讲义的栏目结构，并在其它讲义中复用。</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setColumnTemplateOpen(false);
                  setCreateColumnTemplateOpen(true);
                }}
              >
                <Save className="w-3.5 h-3.5" /> 保存当前栏目
              </Button>
            </div>
            {columnTemplates.length === 0 ? (
              <div className="py-8 text-center rounded-lg border border-dashed border-ink-200 text-sm text-ink-400">
                暂无已保存模板
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {columnTemplates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-ink-100 p-3 bg-paper">
                    <div className="flex items-start gap-2">
                      <LayoutTemplate className="w-4 h-4 text-gold-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-800 truncate">{template.name}</div>
                        <div className="text-xs text-ink-400 mt-0.5">
                          {template.columns.length} 个栏目{template.description ? ` · ${template.description}` : ""}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {template.columns.slice(0, 4).map((column, index) => (
                            <span key={`${column.title}-${index}`} className="px-1.5 py-0.5 rounded bg-ink-50 text-[10px] text-ink-500">
                              {column.title}
                            </span>
                          ))}
                          {template.columns.length > 4 && <span className="text-[10px] text-ink-400">+{template.columns.length - 4}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-1.5 mt-3 pt-2 border-t border-ink-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={deletingColumnTemplateId === template.id}
                        onClick={() => handleDeleteColumnTemplate(template)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 删除
                      </Button>
                      <Button variant="gold" size="sm" onClick={() => handleApplySavedColumnTemplate(template)}>
                        <Plus className="w-3.5 h-3.5" /> 使用模板
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pt-4 border-t border-ink-100">
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-ink-800">从章节目录生成栏目</h4>
              <p className="text-xs text-ink-400 mt-0.5">将学校章节树中的节点批量转换为讲义栏目。</p>
            </div>
            {chapterTree ? (
              <div className="h-[300px] overflow-y-auto rounded-lg border border-ink-100 p-2">
                <SearchableTree
                  data={chapterTree}
                  title="章节目录"
                  accent="gold"
                  checkable
                  checkedIds={templateChapterIds}
                  onCheck={(ids) => setTemplateChapterIds(ids.filter((id) => id !== "root"))}
                  expandLevel={2}
                  searchPlaceholder="搜索章节..."
                />
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-ink-400">暂无可用章节目录</div>
            )}
          </section>
        </div>
      </Modal>

      <Modal
        open={createColumnTemplateOpen}
        onClose={() => {
          setCreateColumnTemplateOpen(false);
          setColumnTemplateName("");
          setColumnTemplateDescription("");
        }}
        size="sm"
        title="保存栏目模板"
        description={`将当前 ${sections.filter((section) => section.type === "chapter").length} 个栏目保存为可复用模板`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateColumnTemplateOpen(false)}>取消</Button>
            <Button variant="gold" loading={savingColumnTemplate} onClick={handleCreateColumnTemplate}>
              <Save className="w-3.5 h-3.5" /> 保存模板
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="模板名称"
            value={columnTemplateName}
            onChange={(event) => setColumnTemplateName(event.target.value)}
            placeholder="如：专题复习讲义"
          />
          <Textarea
            label="模板说明"
            value={columnTemplateDescription}
            onChange={(event) => setColumnTemplateDescription(event.target.value)}
            rows={3}
            placeholder="说明该模板的适用场景（可选）"
          />
          <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
            <div className="text-xs font-medium text-ink-600 mb-2">将保存以下栏目</div>
            <div className="flex flex-wrap gap-1.5">
              {sections.filter((section) => section.type === "chapter").map((section) => (
                <span key={section.id} className="px-2 py-1 rounded bg-paper border border-ink-100 text-xs text-ink-600">
                  {section.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* 添加题目弹窗 */}
      <Modal
        open={Boolean(addSource)}
        onClose={closeAddSourceModal}
        size="lg"
        title={
          replacingQuestion ? "换题" :
          addSource === "basket" ? "从资源篮添加题目" :
          addSource === "bank" ? "从题库添加题目" :
          addSource === "examPaper" ? "从其它试卷添加题目" :
          addSource === "lecture" ? "从其它讲义添加内容" :
          addSource === "courseware" ? "引用课件到讲义" :
          addSource === "material" ? "从素材库添加内容" : "添加内容"
        }
        description={
          replacingQuestion
            ? "请选择一道题目替换当前题目"
            : addSource === "lecture"
              ? `已选择 ${selectedLectureSectionIds.length} 个知识块或题目`
              : addSource === "courseware" || addSource === "material"
            ? `已选择 ${selectedResourceIds.length} 个资源`
            : `已选择 ${selectedQuestionIds.length} 道题目`
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeAddSourceModal}>取消</Button>
            {addSource === "courseware" || addSource === "material" ? (
              <Button variant="gold" onClick={handleAddResources}>
                <Plus className="w-3.5 h-3.5" />
                添加选中内容
              </Button>
            ) : (
              <Button variant="gold" onClick={handleConfirmAddQuestions}>
                <Plus className="w-3.5 h-3.5" />
                {replacingQuestion ? "确认换题" : addSource === "lecture" ? "添加选中内容" : "添加选中题目"}
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
                    if (replacingQuestion) {
                      setSelectedQuestionIds([qq.id]);
                      return;
                    }
                    setSelectedQuestionIds((prev) =>
                      prev.includes(qq.id) ? prev.filter((id) => id !== qq.id) : [...prev, qq.id],
                    );
                  }}
                />
              ))}
            </div>
          </div>
        )}


        {addSource === "examPaper" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {otherPapers.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  onClick={() => {
                    setSelectedOtherPaper(paper);
                    setSelectedQuestionIds([]);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition-all",
                    selectedOtherPaper?.id === paper.id
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "border-ink-200 hover:border-ink-300",
                  )}
                >
                  {paper.title} ({paper.questions.length})
                </button>
              ))}
              {otherPapers.length === 0 && (
                <div className="w-full py-8 text-center text-sm text-ink-400">暂无可引用的试卷</div>
              )}
            </div>
            {selectedOtherPaper && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedOtherPaper.questions.map((paperQuestion, index) => {
                  const questionId = paperQuestion.questionId;
                  const checked = Boolean(questionId && selectedQuestionIds.includes(questionId));
                  return (
                    <label
                      key={paperQuestion.id}
                      className={cn(
                        "flex items-start gap-2 p-3 rounded-md border transition-colors",
                        questionId ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                        checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!questionId}
                        onChange={(event) => {
                          if (!questionId) return;
                          setSelectedQuestionIds((previous) =>
                            event.target.checked
                              ? [...previous, questionId]
                              : previous.filter((id) => id !== questionId),
                          );
                        }}
                        className="mt-1 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1 text-sm text-ink-900">
                          <span className="flex-shrink-0">{index + 1}.</span>
                          <MathHtml className="min-w-0 flex-1 line-clamp-2">{paperQuestion.stem}</MathHtml>
                        </div>
                        {!questionId && (
                          <div className="text-[11px] text-ink-400 mt-1">该题尚未关联题库，无法直接引用</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {addSource === "lecture" && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:min-h-96">
            <div className="min-w-0 overflow-hidden rounded-lg border border-ink-100 bg-ink-50/40">
              <div className="border-b border-ink-100 px-3 py-2 text-xs font-medium text-ink-600">
                选择讲义
              </div>
              <div className="max-h-96 space-y-1 overflow-y-auto p-2">
                {otherLectures.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setSelectedOtherLecture(l);
                      setSelectedLectureSectionIds([]);
                    }}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      selectedOtherLecture?.id === l.id
                        ? "border-gold-300 bg-gold-50 text-ink-900"
                        : "border-transparent bg-paper text-ink-700 hover:border-ink-200 hover:bg-mist",
                    )}
                  >
                    <span className="block truncate">{l.title}</span>
                  </button>
                ))}
                {otherLectures.length === 0 && (
                  <div className="py-8 text-center text-sm text-ink-400">暂无可引用的讲义</div>
                )}
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-lg border border-ink-100 bg-paper">
              {selectedOtherLecture ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink-900">{selectedOtherLecture.title}</div>
                      <div className="mt-0.5 text-[11px] text-ink-400">选择要添加到当前讲义的内容</div>
                    </div>
                    {selectedLectureSectionIds.length > 0 && (
                      <Badge variant="gold">已选 {selectedLectureSectionIds.length}</Badge>
                    )}
                  </div>
                  <div className="max-h-96 space-y-2 overflow-y-auto p-2">
                    {flattenLectureSections(selectedOtherLecture.sections)
                      .filter((s) => s.type === "knowledge" || (s.type === "question" && s.questionId))
                      .map((s) => {
                        const checked = selectedLectureSectionIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={cn(
                              "flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                              checked ? "border-gold-300 bg-gold-50/30" : "border-ink-100 hover:bg-mist",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLectureSectionIds((prev) => [...prev, s.id]);
                                } else {
                                  setSelectedLectureSectionIds((prev) => prev.filter((sectionId) => sectionId !== s.id));
                                }
                              }}
                              className="mt-1 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="mb-1 flex items-center gap-2">
                                <Badge variant={s.type === "knowledge" ? "gold" : "teal"}>
                                  {s.type === "knowledge" ? "知识块" : "题目"}
                                </Badge>
                                <MathHtml className="min-w-0 flex-1 text-sm font-medium text-ink-900">
                                  {s.title || (s.type === "knowledge" ? "未命名知识块" : "未命名题目")}
                                </MathHtml>
                              </div>
                              {s.type === "knowledge" && s.content && (
                                <MathHtml className="line-clamp-3 text-xs text-ink-500">{s.content}</MathHtml>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    {flattenLectureSections(selectedOtherLecture.sections)
                      .filter((s) => s.type === "knowledge" || (s.type === "question" && s.questionId)).length === 0 && (
                      <div className="py-8 text-center text-sm text-ink-400">该讲义暂无可添加的知识块或题目</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex min-h-64 items-center justify-center px-4 text-center text-sm text-ink-400 md:min-h-96">
                  点击左侧讲义后，在这里选择要添加的知识块或题目
                </div>
              )}
            </div>
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

      {audienceClassModal}

      {/* 完成情况分析学生选择弹窗 */}
      <Modal
        open={showStudentPicker}
        onClose={() => setShowStudentPicker(false)}
        size="lg"
        title="选择学生"
        description="选择用于查看所选时间段完成情况的学生；不会改变讲义使用对象。"
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

      {lecture && (
        <AddResourceToPrepModal
          open={prepSetupOpen}
          onClose={() => setPrepSetupOpen(false)}
          resourceType="lecture"
          resourceId={lecture.id}
          resourceTitle={lecture.title}
          onCreated={(task) => navigate(`/lectures/${lecture.id}/edit?prepTask=${task.id}`)}
        />
      )}
      {prepPasswordModal}
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
  onEditQuestion?: (question: Question) => void;
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
  onEditQuestion,
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
      <LectureEditorPreviewSection
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
        onEditQuestion={onEditQuestion}
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
  answerRecords,
  lectureStudents,
  answeredCount,
  correctCount,
  partialCount,
  wrongCount,
  doneCount,
  defaultBasket,
  isInDefaultBasket,
  baskets,
  answerEditing,
  savingStudentId,
  onEditScore,
  onEditQuestion,
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
  answerRecords: AnswerRecord[];
  lectureStudents: Student[];
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  doneCount: number;
  defaultBasket?: Basket;
  isInDefaultBasket: boolean;
  baskets: Basket[];
  answerEditing: boolean;
  savingStudentId: string | null;
  onEditScore: (questionId: string) => void;
  onEditQuestion?: (question: Question) => void;
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
        <div className="flex items-center gap-4 text-[11px] flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span className="text-teal-700 font-medium">{doneCount}</span>
            <span className="text-ink-500">已做</span>
          </span>
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

        <StudentAnswerStatusControl
          students={lectureStudents}
          answerRecords={answerRecords}
          questionId={question.id}
          onChange={(studentId, questionId, score) => onUpdateStudentAnswer?.(studentId, questionId, score)}
        />
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
        {onEditQuestion && (
          <button
            onClick={() => onEditQuestion(question)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-ink-50 text-ink-700 hover:bg-ink-100 transition-colors text-[11px]"
          >
            <Edit3 className="w-3.5 h-3.5" />
            编辑题目
          </button>
        )}
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
export function LectureEditorPreviewSection({
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
  onEditQuestion,
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
  onEditQuestion?: (question: Question) => void;
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
  const doneCount = questionAnswerSummary.filter((a) => a.score === "done").length;
  const defaultBasket = baskets.find((b) => b.isDefault);
  const isInDefaultBasket = question && defaultBasket?.questionIds?.includes(question.id);

  const handleToggleStudentScore = async (studentId: string, currentScore: AnswerScore | null) => {
    if (!question || !onUpdateStudentAnswer) return;
    const scoreOrder: (AnswerScore | null)[] = [null, "done", "correct", "partial", "wrong"];
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
          <MathHtml className="font-serif text-xl font-bold text-ink-900">
            {`${index + 1}. ${section.title}`}
          </MathHtml>
        </div>
        {section.content && (
          <MathHtml className="mb-4 text-sm text-ink-600 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </MathHtml>
        )}
        {section.children.length > 0 && (
          <div className="space-y-4 pl-2 border-l-2 border-ink-100 ml-2">
            {section.children.map((child, cIdx) => (
              <LectureEditorPreviewSection
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
                onEditQuestion={onEditQuestion}
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
                {section.displayMode !== "stem-only" && (
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
                )}
                <div
                  onClick={() => section.displayMode !== "stem-only" && setExpanded(!expanded)}
                  className={cn(
                    "text-sm text-ink-900 leading-relaxed select-none flex-1 flex items-start gap-1.5 min-w-0",
                    section.displayMode !== "stem-only" && "cursor-pointer hover:text-gold-700 transition-colors",
                  )}
                >
                  <span className="font-mono text-ink-400 flex-shrink-0">{section.customLabel || `${questionNumber}.`}</span>
                  <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
                  {section.questionId && answeredQuestionIds.has(section.questionId) && (
                    <span className="tag-gold text-[10px] py-0.5 flex-shrink-0">已做过</span>
                  )}
                </div>
              </div>

              {/* 题目信息弹窗 */}
              {section.displayMode !== "stem-only" && infoOpen && (
                <div className="pl-6 animate-fade-in">
                  <QuestionInfoPopover
                    question={question}
                    questionNumber={questionNumber}
                    questionAnswerSummary={questionAnswerSummary}
                    answerRecords={answerRecords}
                    lectureStudents={lectureStudents}
                    answeredCount={answeredCount}
                    correctCount={correctCount}
                    partialCount={partialCount}
                    wrongCount={wrongCount}
                    doneCount={doneCount}
                    defaultBasket={defaultBasket}
                    isInDefaultBasket={!!isInDefaultBasket}
                    baskets={baskets}
                    answerEditing={answerEditing}
                    savingStudentId={savingStudentId}
                    onEditScore={onEditScore}
                    onEditQuestion={onEditQuestion}
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
              {section.displayMode !== "stem-only" && question.options && question.options.length > 0 && (
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
                      <MathHtml className="min-w-0 text-ink-900 break-all">{opt}</MathHtml>
                    </div>
                  ))}
                </div>
              )}

              {/* 答案与解析 */}
              {section.displayMode !== "stem-only" && expanded && (
                <div className="space-y-2 animate-fade-in pl-6">
                  <div className="p-2.5 rounded-md bg-emerald-50/40 border border-emerald-200 text-sm text-emerald-900 font-medium flex items-start gap-1">
                    <span className="font-bold flex-shrink-0">答案：</span>
                    <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.answer}</MathHtml>
                  </div>
                  {showSummary && (
                    <div className="p-2.5 rounded-md bg-gold-50/30 border border-gold-200 text-sm text-ink-900 leading-relaxed flex items-start gap-1">
                      <span className="font-bold text-gold-700 flex-shrink-0">解析：</span>
                      <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.analysis}</MathHtml>
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
                <MathHtml className="font-serif font-medium text-ink-900">{section.title}</MathHtml>
              </div>
              <MathHtml className="text-sm text-ink-800 whitespace-pre-wrap leading-relaxed pl-6">
                {section.content}
              </MathHtml>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <span className="font-mono text-ink-400 w-8 flex-shrink-0">{questionNumber}.</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Type className="w-4 h-4 text-ink-400" />
                <MathHtml className="font-serif font-medium text-ink-900">{section.title}</MathHtml>
              </div>
              <MathHtml className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed pl-6">
                {section.content}
              </MathHtml>
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
              {section.displayMode !== "stem-only" && question.options && (
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
              {section.displayMode !== "stem-only" && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-teal-600 hover:text-teal-700 mt-1"
                >
                  {expanded ? "收起答案与解析" : "查看答案与解析"}
                </button>
              )}
              {section.displayMode !== "stem-only" && expanded && (
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
