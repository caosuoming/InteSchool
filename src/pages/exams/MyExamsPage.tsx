import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  MapPinned,
  Save,
  Settings2,
  TableProperties,
  Upload,
  UsersRound,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { gradeService } from "@/services/grade";
import type {
  GradeCohort,
  GradeCohortSettings,
  GradeExam,
  GradeExamSettings,
  GradeImportContext,
} from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import {
  ASSIGNMENT_GRADE_SUBJECTS,
  buildDefaultGradeSettings,
  DEFAULT_ASSIGNMENT_RULES,
  normalizeGradeSettings,
} from "@/lib/grade-statistics";
import { GradeSettingsEditor } from "@/pages/students/GradeSettingsEditor";
import { GradeImportWizard } from "@/pages/students/GradeImportWizard";
import { GradeClassAverageTable } from "@/pages/students/GradeClassAverageTable";
import ExamRoomArrangementPage from "@/pages/students/ExamRoomArrangementPage";
import { GRADE_SUBJECT_OPTIONS } from "@/lib/grade-spreadsheet";

export type MyExamsSection = "rooms" | "invigilation" | "grades";

const DEFAULT_COHORT_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "政治", "历史", "地理"];

function ExamSectionTabs({ section }: { section: MyExamsSection }) {
  return (
    <div className="mb-5 flex gap-1 rounded-xl border border-ink-100 bg-paper p-1.5 shadow-sm">
      {([
        ["rooms", "/my-exams/rooms", "考场布置", MapPinned],
        ["invigilation", "/my-exams/invigilation", "监考表", ClipboardCheck],
        ["grades", "/my-exams/grades", "成绩统计", FileSpreadsheet],
      ] as const).map(([value, path, label, Icon]) => (
        <Link
          key={value}
          to={path}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
            section === value
              ? "bg-ink-900 text-paper shadow-sm"
              : "text-ink-500 hover:bg-ink-50 hover:text-ink-800",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}

function InvigilationTableSection() {
  return (
    <Card>
      <EmptyState
        icon={<ClipboardCheck className="h-8 w-8" />}
        title="暂无监考表"
        description="请先完成考场布置并生成考场方案，再维护对应的监考安排。"
        action={(
          <Link to="/my-exams/rooms">
            <Button variant="outline">
              前往考场布置<ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      />
    </Card>
  );
}

function addSubject(
  current: GradeExamSettings,
  subject: string,
  context: GradeImportContext,
): GradeExamSettings {
  const teacherIds = context.teachers
    .filter((teacher) => teacher.subject === subject)
    .map((teacher) => teacher.id);
  const classSubjectTeacherIds = Object.fromEntries(context.classes.map((classItem) => [
    classItem.id,
    {
      ...current.classSubjectTeacherIds?.[classItem.id],
      [subject]: context.teachers
        .filter((teacher) => (
          teacher.subject === subject
          && (!teacher.teachingClassIds?.length || teacher.teachingClassIds.includes(classItem.id))
        ))
        .map((teacher) => teacher.id),
    },
  ]));
  const classSubjectTeacherNames = Object.fromEntries(context.classes.map((classItem) => [
    classItem.id,
    {
      ...current.classSubjectTeacherNames?.[classItem.id],
      [subject]: current.classSubjectTeacherNames?.[classItem.id]?.[subject] || [],
    },
  ]));
  const usesAssignment = ASSIGNMENT_GRADE_SUBJECTS.includes(
    subject as (typeof ASSIGNMENT_GRADE_SUBJECTS)[number],
  );
  return {
    ...current,
    subjectTeacherIds: {
      ...current.subjectTeacherIds,
      [subject]: teacherIds,
    },
    classSubjectTeacherIds,
    classSubjectTeacherNames,
    assignmentRules: usesAssignment
      ? {
          ...current.assignmentRules,
          [subject]: DEFAULT_ASSIGNMENT_RULES.map((rule) => ({ ...rule })),
        }
      : current.assignmentRules,
    classSubjects: current.classSubjects.map((item) => ({
      ...item,
      examSubjects: item.examSubjects.includes(subject) ? item.examSubjects : [...item.examSubjects, subject],
      statisticSubjects: item.statisticSubjects.includes(subject)
        ? item.statisticSubjects
        : [...item.statisticSubjects, subject],
    })),
    templates: current.templates.map((item) => ({
      ...item,
      subjects: item.subjects.includes(subject) ? item.subjects : [...item.subjects, subject],
    })),
  };
}

function GradePreprocessing({
  schoolId,
  teacherId,
  cohorts,
  cohortKey,
  onCohortChange,
}: {
  schoolId: string;
  teacherId: string;
  cohorts: GradeCohort[];
  cohortKey: string;
  onCohortChange: (value: string) => void;
}) {
  const [context, setContext] = useState<GradeImportContext | null>(null);
  const [record, setRecord] = useState<GradeCohortSettings | null>(null);
  const [exams, setExams] = useState<GradeExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [draft, setDraft] = useState<GradeExamSettings | null>(null);
  const [copySource, setCopySource] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    if (!cohortKey) {
      setContext(null);
      setRecord(null);
      setExams([]);
      setSelectedExamId("");
      setSubjects([]);
      setDraft(null);
      return;
    }
    setLoading(true);
    try {
      const [nextContext, nextRecord, nextExams] = await Promise.all([
        gradeService.getImportContext(schoolId, cohortKey),
        gradeService.getCohortSettings(schoolId, cohortKey),
        gradeService.listExams(schoolId, cohortKey),
      ]);
      const nextSubjects = nextRecord?.subjects?.length
        ? nextRecord.subjects
        : DEFAULT_COHORT_SUBJECTS;
      const classSubjectAvailability = Object.fromEntries(
        Object.entries(nextContext.classProfiles || {})
          .filter(([, profile]) => profile.hasImportedScores)
          .map(([classId, profile]) => [classId, profile.scoreSubjects]),
      );
      const baseSettings = nextRecord?.settings || buildDefaultGradeSettings(
        nextSubjects,
        nextContext.classes.map((item) => item.id),
        nextContext.teachers,
        classSubjectAvailability,
      );
      const nextSettings = normalizeGradeSettings(
        nextContext.templateProfile
          ? { ...baseSettings, templates: structuredClone(nextContext.templateProfile.templates) }
          : baseSettings,
        nextSubjects,
        nextContext.classes.map((item) => item.id),
        nextContext.teachers.map((item) => item.id),
      );
      setContext(nextContext);
      setRecord(nextRecord);
      setExams(nextExams);
      setSelectedExamId((current) => (
        nextExams.some((item) => item.id === current) ? current : nextExams[0]?.id || ""
      ));
      setSubjects(nextSubjects);
      setDraft(nextSettings);
      setCopySource("");
    } catch (error) {
      toast.error("加载年级预处理配置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [cohortKey, schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const otherCohorts = useMemo(
    () => cohorts.filter((item) => item.key !== cohortKey),
    [cohortKey, cohorts],
  );
  const selectedExam = useMemo(
    () => exams.find((item) => item.id === selectedExamId) || exams[0] || null,
    [exams, selectedExamId],
  );
  const classAverageTemplate = useMemo(
    () => draft?.templates.find((item) => item.kind === "classAverage") || null,
    [draft?.templates],
  );

  const handleImported = (exam: GradeExam) => {
    setImportOpen(false);
    setExams((current) => [exam, ...current.filter((item) => item.id !== exam.id)]);
    setSelectedExamId(exam.id);
    setContext((current) => current ? {
      ...current,
      sampleRecords: exam.records.slice(0, 8),
    } : current);
  };

  const toggleSubject = (subject: string) => {
    if (!context || !draft) return;
    const selected = subjects.includes(subject);
    const nextSubjects = selected
      ? subjects.filter((item) => item !== subject)
      : [...subjects, subject];
    if (nextSubjects.length === 0) {
      toast.error("至少保留一个成绩科目");
      return;
    }
    const expanded = selected ? draft : addSubject(draft, subject, context);
    setSubjects(nextSubjects);
    setDraft(normalizeGradeSettings(
      expanded,
      nextSubjects,
      context.classes.map((item) => item.id),
      context.teachers.map((item) => item.id),
    ));
  };

  const save = async () => {
    if (!draft || !cohortKey) return;
    setSaving(true);
    try {
      const saved = await gradeService.saveCohortSettings(
        schoolId,
        teacherId,
        cohortKey,
        subjects,
        draft,
      );
      const refreshedExams = await gradeService.listExams(schoolId, cohortKey);
      setRecord(saved);
      setExams(refreshedExams);
      setSelectedExamId((current) => (
        refreshedExams.some((item) => item.id === current) ? current : refreshedExams[0]?.id || ""
      ));
      setSubjects(saved.subjects);
      setDraft(structuredClone(saved.settings));
      toast.success("年级预处理配置已保存", "该年级已有考试已按新配置重新计算");
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!copySource || !cohortKey) return;
    setCopying(true);
    try {
      const copied = await gradeService.copyCohortSettings(
        schoolId,
        teacherId,
        copySource,
        cohortKey,
      );
      setRecord(copied);
      setSubjects(copied.subjects);
      setDraft(structuredClone(copied.settings));
      setCopySource("");
      toast.success("已复制年级配置", "班级配置已按目标年级重新对应，可继续修改后保存");
    } catch (error) {
      toast.error("复制失败", error instanceof Error ? error.message : undefined);
    } finally {
      setCopying(false);
    }
  };

  if (!cohortKey) {
    return <Card><EmptyState icon={<FileSpreadsheet className="h-8 w-8" />} title="请选择需要配置的年级" /></Card>;
  }
  if (loading || !context || !draft) {
    return <div className="flex justify-center py-24"><Spinner size={32} /></div>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_auto] xl:items-end">
          <Select
            label="所属年级"
            value={cohortKey}
            onChange={(event) => onCohortChange(event.target.value)}
            options={cohorts.map((item) => ({
              value: item.key,
              label: `${item.label}（${item.studentCount} 人）`,
            }))}
          />
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select
              label="从其他年级复制"
              value={copySource}
              onChange={(event) => setCopySource(event.target.value)}
              placeholder="选择已有配置的年级"
              options={otherCohorts.map((item) => ({ value: item.key, label: item.label }))}
            />
            <Button variant="outline" onClick={copy} disabled={!copySource} loading={copying}>
              <Copy className="h-4 w-4" />复制并适配
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />导入成绩
            </Button>
            <Button variant="gold" onClick={save} loading={saving}>
              <Save className="h-4 w-4" />保存年级配置
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4 text-xs text-ink-500">
          <Badge variant={record ? "green" : "amber"}>{record ? "已保存" : "尚未保存"}</Badge>
          <span>同一年级的所有考试共享任课教师、赋分表、班级科目和成绩模板。</span>
          {record && <span>最后更新：{new Date(record.updatedAt).toLocaleString("zh-CN")}</span>}
          <Link to="/my-students/grades" className="ml-auto inline-flex items-center gap-1 text-gold-700 hover:text-gold-800">
            查看已导入成绩<ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-start gap-3 border-b border-ink-100 px-5 py-4">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><ClipboardList className="h-4 w-4" /></div>
          <div>
            <div className="font-medium text-ink-900">年级考试科目</div>
            <div className="mt-0.5 text-xs text-ink-500">导入具体考试时会按实际 Excel 科目自动裁剪；此处维护年级可复用的完整科目集合。</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-5">
          {GRADE_SUBJECT_OPTIONS.map((subject) => {
            const selected = subjects.includes(subject);
            return (
              <button
                key={subject}
                type="button"
                onClick={() => toggleSubject(subject)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs transition-colors",
                  selected
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-ink-200 bg-paper text-ink-500 hover:border-ink-300",
                )}
              >
                {selected ? "✓ " : "+ "}{subject}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4"><UsersRound className="mb-2 h-5 w-5 text-teal-600" /><div className="font-medium text-sm">班级任课教师</div><div className="mt-1 text-xs text-ink-500">{Object.values(draft.classSubjectTeacherIds || {}).flatMap((item) => Object.values(item)).flat().length + Object.values(draft.classSubjectTeacherNames || {}).flatMap((item) => Object.values(item)).flat().length} 个教师关联</div></Card>
        <Card className="p-4"><Settings2 className="mb-2 h-5 w-5 text-gold-600" /><div className="font-medium text-sm">选修课赋分表</div><div className="mt-1 text-xs text-ink-500">{Object.keys(draft.assignmentRules).length} 个赋分科目</div></Card>
        <Card className="p-4"><TableProperties className="mb-2 h-5 w-5 text-purple-600" /><div className="font-medium text-sm">成绩模板</div><div className="mt-1 text-xs text-ink-500">{draft.templates.filter((item) => item.enabled).length} 个启用模板</div></Card>
      </div>

      {exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<TableProperties className="h-8 w-8" />}
            title="尚未上传该年级成绩"
            description="导入成绩后，系统会在这里自动生成可调整的班级平均分统计表。"
            action={(
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />导入成绩
              </Button>
            )}
          />
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,26rem)_1fr] md:items-end">
              <Select
                label="班级平均分数据来源"
                value={selectedExam?.id || ""}
                onChange={(event) => setSelectedExamId(event.target.value)}
                options={exams.map((exam) => ({
                  value: exam.id,
                  label: `${exam.name}${exam.examDate ? `（${exam.examDate}）` : ""}`,
                }))}
              />
              <div className="text-xs text-ink-500 md:pb-2">
                已上传 {exams.length} 次考试；切换考试只更换统计数据，表格布局和教师配置仍按当前年级配置复用。
              </div>
            </div>
          </Card>
          {selectedExam && classAverageTemplate && (
            <GradeClassAverageTable
              exam={selectedExam}
              settings={draft}
              template={classAverageTemplate}
              context={context}
              onChange={setDraft}
            />
          )}
        </>
      )}

      <GradeSettingsEditor
        settings={draft}
        subjects={subjects}
        context={context}
        onChange={setDraft}
      />

      <GradeImportWizard
        open={importOpen}
        schoolId={schoolId}
        teacherId={teacherId}
        cohorts={cohorts}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />
    </div>
  );
}

export default function MyExamsPage({ section = "rooms" }: { section?: MyExamsSection }) {
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const affiliation = getCurrentAffiliation();
  const schoolId = affiliation?.schoolId || null;
  const [searchParams, setSearchParams] = useSearchParams();
  const [cohorts, setCohorts] = useState<GradeCohort[]>([]);
  const [loading, setLoading] = useState(true);
  const cohortKey = searchParams.get("cohort") || "";

  useEffect(() => {
    if (!schoolId) {
      setCohorts([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    gradeService.listCohorts(schoolId)
      .then((items) => {
        if (!active) return;
        setCohorts(items);
        const requested = searchParams.get("cohort");
        if ((!requested || !items.some((item) => item.key === requested)) && items[0]) {
          setSearchParams({ cohort: items[0].key }, { replace: true });
        }
      })
      .catch((error) => {
        if (active) toast.error("加载年级失败", error instanceof Error ? error.message : undefined);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [schoolId, searchParams, setSearchParams]);

  const changeCohort = (value: string) => {
    setSearchParams(value ? { cohort: value } : {}, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="我的考试"
        description="统一管理考场布置、监考表和按年级复用的成绩统计配置"
        icon={<ClipboardList className="h-5 w-5" />}
      />
      <ExamSectionTabs section={section} />

      {!schoolId || !teacher ? (
        <Card><EmptyState title="请切换到学校身份" description="我的考试仅对已认证学校的管理身份开放。" /></Card>
      ) : loading ? (
        <div className="flex justify-center py-24"><Spinner size={32} /></div>
      ) : cohorts.length === 0 ? (
        <Card><EmptyState title="暂无可管理年级" description="请先在班级管理中创建学校班级并设置年级。" /></Card>
      ) : section === "rooms" ? (
        <ExamRoomArrangementPage embedded />
      ) : section === "invigilation" ? (
        <InvigilationTableSection />
      ) : (
        <GradePreprocessing
          schoolId={schoolId}
          teacherId={teacher.id}
          cohorts={cohorts}
          cohortKey={cohortKey}
          onCohortChange={changeCohort}
        />
      )}
    </div>
  );
}
