import { useEffect, useState, useMemo, useCallback } from "react";
import {
  BarChart3, Users, GraduationCap, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Circle, TrendingUp,
  Award, FileText, Calendar, User, Clock, Network, BookOpen,
  ArrowUpToLine, ArrowDownToLine,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { classService } from "@/services/class";
import { settingsService } from "@/services/settings";
import { knowledgeService } from "@/services/knowledge";
import { analyticsService, type KnowledgeMastery, type StudentAnswerDetail, type DateRange } from "@/services/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResizableSplitPane } from "@/components/layout/ResizableSplitPane";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SchoolClass, PersonalClass, Student, AnyClass, AnswerScore, ClassTypeCategory, Chapter } from "@/types";
import { formatDate } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import {
  knowledgePointDisplayName,
  orderKnowledgeMasteryRows,
  type KnowledgePointPlacement,
} from "./student-learning-table";
import { buildChapterMastery } from "./student-learning-chapters";
import { ChapterMasteryCard } from "./ChapterMasteryCard";

const questionTypeLabel: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const masteryConfig: Record<
  KnowledgeMastery["masteryLevel"],
  { label: string; color: string; bg: string; icon: typeof CheckCircle2 }
> = {
  mastered: { label: "已掌握", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  basic: { label: "基本掌握", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: AlertCircle },
  weak: { label: "薄弱", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: XCircle },
  untrained: { label: "未训练", color: "text-ink-400", bg: "bg-mist border-ink-200", icon: Circle },
};

const scoreConfig: Record<AnswerScore, { label: string; color: string; bg: string }> = {
  correct: { label: "全对", color: "text-emerald-700", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  partial: { label: "半对", color: "text-amber-700", bg: "bg-amber-50 text-amber-700 border-amber-200" },
  wrong: { label: "做错", color: "text-red-700", bg: "bg-red-50 text-red-700 border-red-200" },
  done: { label: "已做", color: "text-teal-700", bg: "bg-teal-50 text-teal-700 border-teal-200" },
};

type TimeRangeKey = "all" | "1month" | "2month" | "3month" | "6month" | "1year" | "2year";
type MasteryView = "chapter" | "knowledge";

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

interface Selection {
  type: "class" | "student";
  classId: string;
  className: string;
  studentId?: string;
  studentName?: string;
}

export default function StudentLearningPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { teacher } = useAuthStore();
  const schoolId = teacher?.schoolId || "sch-1";

  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [personalClasses, setPersonalClasses] = useState<PersonalClass[]>([]);
  const [classTypes, setClassTypes] = useState<ClassTypeCategory[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, Student[]>>({});
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);

  const [mastery, setMastery] = useState<KnowledgeMastery[]>([]);
  const [answerDetails, setAnswerDetails] = useState<StudentAnswerDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [masteryView, setMasteryView] = useState<MasteryView>("chapter");

  // 对比数据
  const [sameGradeTypeAvg, setSameGradeTypeAvg] = useState<KnowledgeMastery[]>([]);
  const [prevBestClass, setPrevBestClass] = useState<{ mastery: KnowledgeMastery[]; className: string } | null>(null);
  const [classAvgMastery, setClassAvgMastery] = useState<KnowledgeMastery[]>([]);
  const [showComparison, setShowComparison] = useState(true);
  const [showParentNodes, setShowParentNodes] = useState(false);
  const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState<Set<string>>(new Set());
  const [knowledgePointPlacements, setKnowledgePointPlacements] = useState<Record<string, KnowledgePointPlacement>>({});
  const [timeRangeKey, setTimeRangeKey] = useState<TimeRangeKey>("all");
  const dateRange = useMemo(() => getDateRange(timeRangeKey), [timeRangeKey]);
  const orderedMastery = useMemo(
    () => orderKnowledgeMasteryRows(mastery, knowledgePointPlacements),
    [knowledgePointPlacements, mastery],
  );
  const chapterMastery = useMemo(
    () => buildChapterMastery(chapters, answerDetails),
    [answerDetails, chapters],
  );
  const allKnowledgePointsSelected = mastery.length > 0
    && mastery.every((item) => selectedKnowledgePointIds.has(item.knowledgePointId));

  // 加载班级列表
  useEffect(() => {
    const load = async () => {
      setLoadingList(true);
      const [allClasses, ct, chapterList] = await Promise.all([
        classService.listMyClasses(schoolId, teacher?.id || ""),
        settingsService.listClassTypes(schoolId),
        knowledgeService.listChapters(schoolId),
      ]);
      setSchoolClasses(allClasses.filter((item): item is SchoolClass => item.type === "school"));
      setPersonalClasses(allClasses.filter((item): item is PersonalClass => item.type === "personal"));
      setClassTypes(ct);
      setChapters(chapterList);
      setLoadingList(false);
    };
    load();
  }, [schoolId, teacher?.id]);

  // 展开班级时加载学生
  const toggleClassExpand = useCallback(async (classId: string) => {
    setExpandedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
    if (!studentsByClass[classId]) {
      const students = await classService.listStudentsByClass(classId);
      setStudentsByClass((prev) => ({ ...prev, [classId]: students }));
    }
  }, [studentsByClass]);

  // 选中班级或学生时加载数据
  useEffect(() => {
    if (!selection) return;
    const load = async () => {
      setLoading(true);
      let studentIds: string[] = [];
      if (selection.type === "student" && selection.studentId) {
        studentIds = [selection.studentId];
      } else {
        const students = studentsByClass[selection.classId] || [];
        studentIds = students.map((s) => s.id);
        if (studentIds.length === 0) {
          const loaded = await classService.listStudentsByClass(selection.classId);
          studentIds = loaded.map((s) => s.id);
        }
      }
      const [m, d] = await Promise.all([
        analyticsService.getKnowledgeMastery(studentIds, schoolId, dateRange),
        analyticsService.getStudentAnswerDetails(studentIds, dateRange),
      ]);
      setMastery(m);
      setAnswerDetails(d);

      // 加载对比数据
      if (selection.type === "class") {
        // 整班模式：同年级同班型平均 + 上届最好班
        const [avg, prev] = await Promise.all([
          analyticsService.getSameGradeTypeAverage(selection.classId, schoolId, dateRange),
          analyticsService.getPrevGradeBestClass(selection.classId, schoolId, dateRange),
        ]);
        setSameGradeTypeAvg(avg);
        setPrevBestClass(prev);
        setClassAvgMastery([]);
      } else {
        // 个别学生模式：班级平均
        const avg = await analyticsService.getClassAverageMastery(selection.classId, schoolId, dateRange);
        setClassAvgMastery(avg);
        setSameGradeTypeAvg([]);
        setPrevBestClass(null);
      }

      setLoading(false);
    };
    load();
  }, [selection, schoolId, studentsByClass, dateRange]);

  // 统计概览
  const overview = useMemo(() => {
    const trained = mastery.filter((m) => m.totalAttempts > 0);
    const totalAttempts = trained.reduce((sum, m) => sum + m.totalAttempts, 0);
    const totalCorrect = trained.reduce((sum, m) => sum + m.correctCount, 0);
    const avgRate = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;
    const mastered = trained.filter((m) => m.masteryLevel === "mastered").length;
    const weak = trained.filter((m) => m.masteryLevel === "weak").length;
    return {
      totalQuestions: answerDetails.length,
      totalAttempts,
      avgRate,
      trainedKps: trained.length,
      totalKps: mastery.length,
      mastered,
      weak,
    };
  }, [mastery, answerDetails]);

  const chapterOverview = useMemo(() => {
    const trained = chapterMastery.filter((item) => item.totalAttempts > 0);
    return {
      total: chapterMastery.length,
      trained: trained.length,
      mastered: trained.filter((item) => item.masteryLevel === "mastered").length,
      weak: trained.filter((item) => item.masteryLevel === "weak").length,
    };
  }, [chapterMastery]);

  const selectClass = (cls: AnyClass) => {
    setSelectedKnowledgePointIds(new Set());
    setKnowledgePointPlacements({});
    setSelection({
      type: "class",
      classId: cls.id,
      className: cls.name,
    });
    if (!expandedClasses.has(cls.id)) {
      toggleClassExpand(cls.id);
    }
  };

  const selectStudent = (cls: AnyClass, student: Student) => {
    setSelectedKnowledgePointIds(new Set());
    setKnowledgePointPlacements({});
    setSelection({
      type: "student",
      classId: cls.id,
      className: cls.name,
      studentId: student.id,
      studentName: student.name,
    });
  };

  const toggleKnowledgePoint = (knowledgePointId: string) => {
    setSelectedKnowledgePointIds((previous) => {
      const next = new Set(previous);
      if (next.has(knowledgePointId)) next.delete(knowledgePointId);
      else next.add(knowledgePointId);
      return next;
    });
  };

  const toggleAllKnowledgePoints = () => {
    setSelectedKnowledgePointIds(
      allKnowledgePointsSelected
        ? new Set()
        : new Set(mastery.map((item) => item.knowledgePointId)),
    );
  };

  const placeSelectedKnowledgePoints = (placement: KnowledgePointPlacement) => {
    setKnowledgePointPlacements((previous) => {
      const next = { ...previous };
      selectedKnowledgePointIds.forEach((knowledgePointId) => {
        next[knowledgePointId] = placement;
      });
      return next;
    });
    setSelectedKnowledgePointIds(new Set());
  };

  const renderClassItem = (cls: AnyClass, isPersonal: boolean) => {
    const expanded = expandedClasses.has(cls.id);
    const isClassSelected = selection?.type === "class" && selection.classId === cls.id;
    const students = studentsByClass[cls.id] || [];
    const ct = !isPersonal
      ? classTypes.find((t) => t.id === (cls as SchoolClass).classTypeId)
      : null;

    return (
      <div key={cls.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm cursor-pointer transition-colors group",
            isClassSelected
              ? "bg-gold-400/10 text-gold-700"
              : "text-ink-700 hover:bg-mist",
          )}
        >
          <button
            onClick={() => toggleClassExpand(cls.id)}
            className="p-0.5 rounded hover:bg-ink-200 flex-shrink-0"
          >
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
              : <ChevronRight className="w-3.5 h-3.5 text-ink-400" />}
          </button>
          <button
            onClick={() => selectClass(cls)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            {isPersonal
              ? <User className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
              : <GraduationCap className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />}
            <span className="truncate">{cls.name}</span>
            {ct && (
              <span
                className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded border"
                style={{
                  backgroundColor: ct.color + "15",
                  color: ct.color,
                  borderColor: ct.color + "40",
                }}
              >
                {ct.name}
              </span>
            )}
          </button>
        </div>
        {!isPersonal && (cls as SchoolClass).gradeYear && (
          <div className="ml-7 text-[10px] text-ink-400 pb-1">
            {(cls as SchoolClass).gradeYear}级 / {(cls as SchoolClass).gradYear}届
          </div>
        )}
        {expanded && students.length > 0 && (
          <div className="ml-4 border-l border-ink-100 pl-1.5 space-y-0.5">
            {students.map((s) => {
              const isStudentSelected =
                selection?.type === "student" && selection.studentId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => selectStudent(cls, s)}
                  className={cn(
                    "flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs transition-colors text-left",
                    isStudentSelected
                      ? "bg-gold-400/10 text-gold-700 font-medium"
                      : "text-ink-600 hover:bg-mist",
                  )}
                >
                  <span className="w-5 h-5 rounded-full bg-ink-100 text-ink-600 flex items-center justify-center text-[10px] font-medium flex-shrink-0">
                    {s.name.charAt(0)}
                  </span>
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        )}
        {expanded && students.length === 0 && (
          <div className="ml-6 text-xs text-ink-400 py-1">暂无学生</div>
        )}
      </div>
    );
  };

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="学生学情"
          description="点击班级或学生查看各知识点训练与掌握情况、做题记录"
          icon={<BarChart3 className="w-5 h-5" />}
        />
      )}

      <ResizableSplitPane
        storageKey="inteschool:student-learning-sidebar-width"
        className="items-start"
        sidebarClassName="min-w-0"
        sidebar={
          <Card className="p-3 sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2 px-1">
              班级列表
            </div>
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : schoolClasses.length === 0 && personalClasses.length === 0 ? (
              <div className="text-center py-8 text-sm text-ink-400">暂无班级</div>
            ) : (
              <div className="space-y-1">
                {schoolClasses.length > 0 && (
                  <>
                    <div className="text-[10px] text-ink-400 font-medium px-2 pt-1 pb-0.5">学校班级</div>
                    {schoolClasses.map((c) => renderClassItem(c, false))}
                  </>
                )}
                {personalClasses.length > 0 && (
                  <>
                    <div className="text-[10px] text-ink-400 font-medium px-2 pt-3 pb-0.5">个人班级</div>
                    {personalClasses.map((c) => renderClassItem(c, true))}
                  </>
                )}
              </div>
            )}
          </Card>
        }
      >
          {!selection ? (
            <EmptyState
              icon={<Users className="w-10 h-10 text-ink-200" />}
              title="请选择班级或学生"
              description="从左侧选择一个班级或具体学生，查看知识点掌握情况和做题记录"
            />
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : (
            <div className="space-y-5">
              {/* 选中对象标题 + 时间周期 */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    {selection.type === "student" ? (
                      <User className="w-5 h-5 text-gold-600" />
                    ) : (
                      <GraduationCap className="w-5 h-5 text-gold-600" />
                    )}
                    <h2 className="font-serif text-lg font-semibold text-ink-900">
                      {selection.type === "student"
                        ? `${selection.studentName}（${selection.className}）`
                        : `${selection.className}（全班）`}
                    </h2>
                    {selection.type === "class" && (() => {
                      const sc = schoolClasses.find((c) => c.id === selection.classId);
                      const ct = sc ? classTypes.find((t) => t.id === sc.classTypeId) : null;
                      if (!ct) return null;
                      return (
                        <span
                          className="text-[11px] px-2 py-0.5 rounded border"
                          style={{
                            backgroundColor: ct.color + "15",
                            color: ct.color,
                            borderColor: ct.color + "40",
                          }}
                        >
                          {ct.name}
                        </span>
                      );
                    })()}
                  </div>
                  {selection.type === "class" && (() => {
                    const sc = schoolClasses.find((c) => c.id === selection.classId);
                    if (!sc || !sc.gradeYear) return null;
                    return (
                      <div className="text-xs text-ink-500 mt-1 ml-7">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {sc.grade} · {sc.gradeYear}级 / {sc.gradYear}届
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* 时间周期选择 */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-ink-400" />
                  <select
                    value={timeRangeKey}
                    onChange={(e) => setTimeRangeKey(e.target.value as TimeRangeKey)}
                    className="text-sm border border-ink-200 rounded-md px-3 py-1.5 bg-paper text-ink-700 cursor-pointer focus:outline-none focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                  >
                    {timeRangeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 概览卡片 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-ink-500 mb-1">做题总数</div>
                      <div className="font-serif text-2xl font-bold text-ink-900">{overview.totalQuestions}</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-gold-50 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-gold-600" />
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-ink-500 mb-1">平均正确率</div>
                      <div className="font-serif text-2xl font-bold text-emerald-600">
                        {Math.round(overview.avgRate * 100)}%
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-ink-500 mb-1">
                        {masteryView === "chapter" ? "已掌握章节课" : "已掌握知识点"}
                      </div>
                      <div className="font-serif text-2xl font-bold text-ink-900">
                        <span className="text-emerald-600">
                          {masteryView === "chapter" ? chapterOverview.mastered : overview.mastered}
                        </span>
                        <span className="text-ink-400 text-base">
                          {" / "}{masteryView === "chapter" ? chapterOverview.total : overview.totalKps}
                        </span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <Award className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-ink-500 mb-1">
                        {masteryView === "chapter" ? "薄弱章节课" : "薄弱知识点"}
                      </div>
                      <div className="font-serif text-2xl font-bold text-red-600">
                        {masteryView === "chapter" ? chapterOverview.weak : overview.weak}
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    </div>
                  </div>
                </Card>
              </div>

              {/* 章节课 / 知识点掌握情况切换 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="tablist" aria-label="训练与掌握情况视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={masteryView === "chapter"}
                  onClick={() => setMasteryView("chapter")}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    masteryView === "chapter"
                      ? "border-gold-400 bg-gold-50/70 shadow-sm ring-1 ring-gold-200"
                      : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-mist/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={cn(
                        "font-serif text-base font-semibold",
                        masteryView === "chapter" ? "text-gold-800" : "text-ink-800",
                      )}>
                        章节课训练与掌握情况
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        共 {chapterOverview.total} 个章节课，已训练 {chapterOverview.trained} 个
                      </div>
                    </div>
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      masteryView === "chapter" ? "bg-gold-100 text-gold-700" : "bg-mist text-ink-400",
                    )}>
                      <BookOpen className="h-4 w-4" />
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={masteryView === "knowledge"}
                  onClick={() => setMasteryView("knowledge")}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all",
                    masteryView === "knowledge"
                      ? "border-gold-400 bg-gold-50/70 shadow-sm ring-1 ring-gold-200"
                      : "border-ink-100 bg-paper hover:border-ink-200 hover:bg-mist/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={cn(
                        "font-serif text-base font-semibold",
                        masteryView === "knowledge" ? "text-gold-800" : "text-ink-800",
                      )}>
                        知识点训练与掌握情况
                      </div>
                      <div className="mt-1 text-xs text-ink-500">
                        共 {overview.totalKps} 个知识点，已训练 {overview.trainedKps} 个
                      </div>
                    </div>
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      masteryView === "knowledge" ? "bg-gold-100 text-gold-700" : "bg-mist text-ink-400",
                    )}>
                      <Network className="h-4 w-4" />
                    </div>
                  </div>
                </button>
              </div>

              {masteryView === "chapter" ? (
                <ChapterMasteryCard mastery={chapterMastery} />
              ) : (
              <Card className="relative">
                <CardHeader
                  title="知识点训练与掌握情况"
                  subtitle={`共 ${overview.totalKps} 个知识点，已训练 ${overview.trainedKps} 个`}
                  action={
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        aria-pressed={showParentNodes}
                        onClick={() => setShowParentNodes((visible) => !visible)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                          showParentNodes
                            ? "border-gold-300 bg-gold-50 text-gold-700"
                            : "border-ink-200 text-ink-600 hover:border-ink-300 hover:bg-mist",
                        )}
                      >
                        <Network className="w-3.5 h-3.5" />
                        显示知识点的父节点
                      </button>
                      {showComparison && hasComparisonData(selection, sameGradeTypeAvg, prevBestClass, classAvgMastery) && (
                        <div className="flex items-center gap-3 text-xs text-ink-500">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-gold-400" />
                            <span>本班</span>
                          </div>
                          {selection?.type === "class" && sameGradeTypeAvg.some((m) => m.totalAttempts > 0) && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded bg-blue-400" />
                              <span>同类型平均</span>
                            </div>
                          )}
                          {selection?.type === "class" && prevBestClass && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded bg-emerald-400" />
                              <span>上届最好班</span>
                            </div>
                          )}
                          {selection?.type === "student" && classAvgMastery.some((m) => m.totalAttempts > 0) && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded bg-blue-400" />
                              <span>班级平均</span>
                            </div>
                          )}
                        </div>
                      )}
                      {hasComparisonData(selection, sameGradeTypeAvg, prevBestClass, classAvgMastery) && (
                        <button
                          onClick={() => setShowComparison(!showComparison)}
                          className="text-xs text-gold-600 hover:text-gold-700 font-medium"
                        >
                          {showComparison ? "隐藏对比" : "显示对比"}
                        </button>
                      )}
                      <BarChart3 className="w-4 h-4 text-gold-600" />
                    </div>
                  }
                />
                {mastery.length === 0 ? (
                  <div className="text-center py-8 text-sm text-ink-400">暂无知识点数据</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 text-xs text-ink-500">
                          <th className="text-left py-2 px-3 font-medium">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                aria-label="全选知识点"
                                checked={allKnowledgePointsSelected}
                                onChange={toggleAllKnowledgePoints}
                                className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                              />
                              <span>知识点</span>
                            </label>
                          </th>
                          <th className="text-center py-2 px-3 font-medium">训练次数</th>
                          <th className="text-center py-2 px-3 font-medium">全对</th>
                          <th className="text-center py-2 px-3 font-medium">半对</th>
                          <th className="text-center py-2 px-3 font-medium">做错</th>
                          <th className="text-center py-2 px-3 font-medium">正确率</th>
                          <th className="text-center py-2 px-3 font-medium">掌握状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedMastery.map((m) => {
                            const cfg = masteryConfig[m.masteryLevel];
                            const MasteryIcon = cfg.icon;
                            const selected = selectedKnowledgePointIds.has(m.knowledgePointId);
                            const displayName = knowledgePointDisplayName(m, showParentNodes);
                            return (
                              <tr
                                key={m.knowledgePointId}
                                className={cn(
                                  "border-b border-ink-50 transition-colors",
                                  selected ? "bg-gold-50/70" : "hover:bg-mist/50",
                                )}
                              >
                                <td className="py-2.5 px-3 text-ink-900 font-medium">
                                  <label className="flex min-w-[180px] items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      aria-label={`选择知识点 ${displayName}`}
                                      checked={selected}
                                      onChange={() => toggleKnowledgePoint(m.knowledgePointId)}
                                      className="w-3.5 h-3.5 flex-shrink-0 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
                                    />
                                    <span className="whitespace-nowrap" title={displayName}>{displayName}</span>
                                  </label>
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono text-ink-700">
                                  {m.totalAttempts}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {m.correctCount > 0 ? (
                                    <span className="text-emerald-600 font-mono">{m.correctCount}</span>
                                  ) : (
                                    <span className="text-ink-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {m.partialCount > 0 ? (
                                    <span className="text-amber-600 font-mono">{m.partialCount}</span>
                                  ) : (
                                    <span className="text-ink-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {m.wrongCount > 0 ? (
                                    <span className="text-red-600 font-mono">{m.wrongCount}</span>
                                  ) : (
                                    <span className="text-ink-300">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {m.totalAttempts > 0 ? (
                                    <div className="flex flex-col items-center gap-1">
                                      {showComparison && hasComparisonData(selection, sameGradeTypeAvg, prevBestClass, classAvgMastery) ? (
                                        <div className="w-full min-w-[140px] space-y-1">
                                          {/* 本班 */}
                                          <div className="flex items-center gap-2">
                                            <div className="w-8 text-[10px] text-right text-ink-500 flex-shrink-0">本班</div>
                                            <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                              <div
                                                className="h-full rounded-full bg-gold-400"
                                                style={{ width: `${m.correctRate * 100}%` }}
                                              />
                                            </div>
                                            <span className="w-10 text-left font-mono text-xs text-ink-600">
                                              {Math.round(m.correctRate * 100)}%
                                            </span>
                                          </div>
                                          {/* 同年级同类型平均（整班模式） */}
                                          {selection?.type === "class" && (() => {
                                            const avg = sameGradeTypeAvg.find((a) => a.knowledgePointId === m.knowledgePointId);
                                            if (!avg || avg.totalAttempts === 0) return null;
                                            const diff = m.correctRate - avg.correctRate;
                                            return (
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 text-[10px] text-right text-ink-500 flex-shrink-0">同类</div>
                                                <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                                  <div
                                                    className="h-full rounded-full bg-blue-400"
                                                    style={{ width: `${avg.correctRate * 100}%` }}
                                                  />
                                                </div>
                                                <span className={cn(
                                                  "w-10 text-left font-mono text-xs",
                                                  diff >= 0 ? "text-emerald-600" : "text-red-500",
                                                )}>
                                                  {diff >= 0 ? "+" : ""}{Math.round(diff * 100)}%
                                                </span>
                                              </div>
                                            );
                                          })()}
                                          {/* 上届最好班（整班模式） */}
                                          {selection?.type === "class" && prevBestClass && (() => {
                                            const prev = prevBestClass.mastery.find((p) => p.knowledgePointId === m.knowledgePointId);
                                            if (!prev || prev.totalAttempts === 0) return null;
                                            const diff = m.correctRate - prev.correctRate;
                                            return (
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 text-[10px] text-right text-ink-500 flex-shrink-0">上届</div>
                                                <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                                  <div
                                                    className="h-full rounded-full bg-emerald-400"
                                                    style={{ width: `${prev.correctRate * 100}%` }}
                                                  />
                                                </div>
                                                <span className={cn(
                                                  "w-10 text-left font-mono text-xs",
                                                  diff >= 0 ? "text-emerald-600" : "text-red-500",
                                                )}>
                                                  {diff >= 0 ? "+" : ""}{Math.round(diff * 100)}%
                                                </span>
                                              </div>
                                            );
                                          })()}
                                          {/* 班级平均（个别学生模式） */}
                                          {selection?.type === "student" && (() => {
                                            const avg = classAvgMastery.find((a) => a.knowledgePointId === m.knowledgePointId);
                                            if (!avg || avg.totalAttempts === 0) return null;
                                            const diff = m.correctRate - avg.correctRate;
                                            return (
                                              <div className="flex items-center gap-2">
                                                <div className="w-8 text-[10px] text-right text-ink-500 flex-shrink-0">班级</div>
                                                <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                                  <div
                                                    className="h-full rounded-full bg-blue-400"
                                                    style={{ width: `${avg.correctRate * 100}%` }}
                                                  />
                                                </div>
                                                <span className={cn(
                                                  "w-10 text-left font-mono text-xs",
                                                  diff >= 0 ? "text-emerald-600" : "text-red-500",
                                                )}>
                                                  {diff >= 0 ? "+" : ""}{Math.round(diff * 100)}%
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-center gap-1.5">
                                          <div className="w-12 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                                            <div
                                              className={cn(
                                                "h-full rounded-full",
                                                m.correctRate >= 0.8 ? "bg-emerald-400" : m.correctRate >= 0.6 ? "bg-amber-400" : "bg-red-400",
                                              )}
                                              style={{ width: `${m.correctRate * 100}%` }}
                                            />
                                          </div>
                                          <span className="font-mono text-xs text-ink-600">
                                            {Math.round(m.correctRate * 100)}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-ink-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border", cfg.bg, cfg.color)}>
                                    <MasteryIcon className="w-3 h-3" />
                                    {cfg.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
                {selectedKnowledgePointIds.size > 0 && (
                  <div
                    role="toolbar"
                    aria-label="知识点排序操作"
                    className="fixed right-6 top-1/2 z-40 -translate-y-1/2 rounded-xl border border-ink-200 bg-paper/95 p-2 shadow-xl backdrop-blur"
                  >
                    <div className="px-2 pb-1.5 text-[11px] text-ink-500">
                      已选择 {selectedKnowledgePointIds.size} 个知识点
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => placeSelectedKnowledgePoints("top")}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-ink-700 hover:bg-gold-50 hover:text-gold-700"
                      >
                        <ArrowUpToLine className="w-3.5 h-3.5" />
                        置顶
                      </button>
                      <button
                        type="button"
                        onClick={() => placeSelectedKnowledgePoints("bottom")}
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-ink-700 hover:bg-mist"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                        沉底
                      </button>
                    </div>
                  </div>
                )}
              </Card>
              )}

              {/* 做过的题目列表 */}
              <Card>
                <CardHeader
                  title="做过的题目"
                  subtitle={`共 ${answerDetails.length} 条答题记录`}
                  action={<FileText className="w-4 h-4 text-gold-600" />}
                />
                {answerDetails.length === 0 ? (
                  <div className="text-center py-8 text-sm text-ink-400">暂无答题记录</div>
                ) : (
                  <div className="space-y-2">
                    {answerDetails.map((detail) => {
                      const { record, question, lectureTitle } = detail;
                      const score = record.score || (record.isCorrect ? "correct" : "wrong");
                      const sc = scoreConfig[score];
                      return (
                        <div
                          key={record.id}
                          className="flex items-start gap-3 p-3 rounded-md border border-ink-100 hover:bg-mist/30 transition-colors"
                        >
                          {/* 答题结果标记 */}
                          <div className={cn("flex-shrink-0 px-2 py-1 rounded text-[10px] font-medium border", sc.bg)}>
                            {sc.label}
                          </div>

                          {/* 题目内容 */}
                          <div className="flex-1 min-w-0">
                            {question ? (
                              <>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Badge variant="default">{questionTypeLabel[question.type] || question.type}</Badge>
                                  <span className="text-[10px] text-ink-400">
                                    难度：{"★".repeat(question.difficulty)}
                                  </span>
                                </div>
                                <div className="text-sm text-ink-900 line-clamp-2 mb-1">
                                  {question.stem}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-ink-400 flex-wrap">
                                  {selection.type === "class" && (
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {questionService_studentName(record.studentId, studentsByClass, selection)}
                                    </span>
                                  )}
                                  {lectureTitle && (
                                    <span className="flex items-center gap-1">
                                      <FileText className="w-3 h-3" />
                                      {lectureTitle}
                                    </span>
                                  )}
                                  {question.knowledgePointIds.length > 0 && (
                                    <span className="flex items-center gap-1 text-teal-600">
                                      {question.knowledgePointIds.length} 个知识点
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1 ml-auto">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(record.answeredAt, true)}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-ink-500">
                                题目已删除（ID: {record.questionId}）
                                <div className="text-xs text-ink-400 mt-1">
                                  {formatDate(record.answeredAt, true)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
      </ResizableSplitPane>
    </div>
  );
}

/** 辅助：从已加载的学生列表中查找学生姓名 */
function questionService_studentName(
  studentId: string,
  studentsByClass: Record<string, Student[]>,
  selection: Selection,
): string {
  const students = studentsByClass[selection.classId] || [];
  return students.find((s) => s.id === studentId)?.name || studentId;
}

/** 辅助：判断是否有可用的对比数据 */
function hasComparisonData(
  selection: Selection | null,
  sameGradeTypeAvg: KnowledgeMastery[],
  prevBestClass: { mastery: KnowledgeMastery[]; className: string } | null,
  classAvgMastery: KnowledgeMastery[],
): boolean {
  if (!selection) return false;
  if (selection.type === "class") {
    return sameGradeTypeAvg.some((m) => m.totalAttempts > 0) || prevBestClass !== null;
  }
  return classAvgMastery.some((m) => m.totalAttempts > 0);
}
