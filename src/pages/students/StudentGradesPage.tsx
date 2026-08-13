import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckSquare,
  ExternalLink,
  LineChart,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { gradeService } from "@/services/grade";
import { toast } from "@/stores/ui";
import type {
  GradeQueryData,
  GradeQueryExam,
  GradeQueryRecord,
} from "@/types";
import { StudentSectionTabs } from "./StudentSectionTabs";

type QueryView = "classComparison" | "studentTrend" | "classOverview" | "scopeOverview";

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
}

function examTimestamp(exam: GradeQueryExam): number {
  const value = exam.examDate || exam.createdAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function examDateLabel(exam: GradeQueryExam): string {
  if (exam.examDate) return exam.examDate;
  return new Date(exam.createdAt).toLocaleDateString("zh-CN");
}

function signedNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
      <div className="mt-1 text-xs text-ink-500">{hint}</div>
    </Card>
  );
}

function Delta({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return <span className="text-ink-400">—</span>;
  if (value === 0) return <span className="text-ink-500">0</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", value > 0 ? "text-emerald-700" : "text-red-600")}>
      {value > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {signedNumber(value)}
    </span>
  );
}

function TrendChart({
  labels,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  invert = false,
}: {
  labels: string[];
  primary: Array<number | null>;
  secondary?: Array<number | null>;
  primaryLabel: string;
  secondaryLabel?: string;
  invert?: boolean;
}) {
  const width = 760;
  const height = 250;
  const padding = { left: 52, right: 24, top: 24, bottom: 46 };
  const allValues = [...primary, ...(secondary || [])].filter((value): value is number => typeof value === "number");
  if (labels.length === 0 || allValues.length === 0) {
    return <div className="py-14 text-center text-sm text-ink-400">所选考试暂无可绘制的数据</div>;
  }
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const span = Math.max(rawMax - rawMin, 1);
  const min = Math.max(0, rawMin - span * 0.12);
  const max = rawMax + span * 0.12;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index: number) => labels.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (labels.length - 1)) * plotWidth;
  const y = (value: number) => {
    const ratio = (value - min) / Math.max(max - min, 1);
    const normalized = invert ? ratio : 1 - ratio;
    return padding.top + normalized * plotHeight;
  };
  const path = (values: Array<number | null>) => values
    .map((value, index) => typeof value === "number" ? `${x(index)},${y(value)}` : null)
    .filter(Boolean)
    .join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = invert ? min + ratio * (max - min) : max - ratio * (max - min);
    return { value, y: padding.top + ratio * plotHeight };
  });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label={`${primaryLabel}变化趋势`}>
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line x1={padding.left} x2={width - padding.right} y1={tick.y} y2={tick.y} className="stroke-ink-100" />
            <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" className="fill-ink-400 text-[11px]">
              {formatNumber(tick.value)}
            </text>
          </g>
        ))}
        {secondary && <polyline points={path(secondary)} fill="none" className="stroke-ink-400" strokeWidth="2" strokeDasharray="6 5" />}
        <polyline points={path(primary)} fill="none" className="stroke-gold-600" strokeWidth="3" />
        {primary.map((value, index) => typeof value === "number" && (
          <circle key={`primary-${labels[index]}`} cx={x(index)} cy={y(value)} r="4" className="fill-gold-600" />
        ))}
        {secondary?.map((value, index) => typeof value === "number" && (
          <circle key={`secondary-${labels[index]}`} cx={x(index)} cy={y(value)} r="3" className="fill-ink-400" />
        ))}
        {labels.map((label, index) => (
          <text key={label} x={x(index)} y={height - 18} textAnchor="middle" className="fill-ink-500 text-[11px]">
            {label.length > 10 ? `${label.slice(0, 9)}…` : label}
          </text>
        ))}
      </svg>
      <div className="flex justify-center gap-5 pb-2 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-gold-600" />{primaryLabel}</span>
        {secondaryLabel && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-ink-400" />{secondaryLabel}</span>}
      </div>
    </div>
  );
}

function ExamPicker({
  exams,
  selectedIds,
  onChange,
}: {
  exams: GradeQueryExam[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = new Set(selectedIds);
  const toggle = (id: string) => onChange(selected.has(id)
    ? selectedIds.filter((item) => item !== id)
    : [...selectedIds, id]);

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
            <CheckSquare className="h-4 w-4 text-gold-600" />
            勾选重要考试
          </div>
          <div className="mt-1 text-xs text-ink-500">趋势和差距仅比较已勾选的考试，可跨多次考试查看变化。</div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onChange(exams.slice(0, 3).map((item) => item.id))}>最近三次</Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(exams.map((item) => item.id))}>全部</Button>
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>清空</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {exams.map((exam) => (
          <div
            key={exam.id}
            className={cn(
              "rounded-lg border transition-colors",
              selected.has(exam.id) ? "border-gold-300 bg-gold-50/60" : "border-ink-100 hover:border-ink-200",
            )}
          >
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
              <input type="checkbox" className="mt-0.5" checked={selected.has(exam.id)} onChange={() => toggle(exam.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-800">{exam.name}</span>
                <span className="mt-0.5 block text-xs text-ink-400">{exam.cohortLabel} · {examDateLabel(exam)}</span>
              </span>
            </label>
            {exam.reportToken && (
              <a
                href={`/grade-reports/${exam.reportToken}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 border-t border-ink-100 px-3 py-2 text-xs font-medium text-gold-700 hover:bg-gold-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />查看已发布统计表
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function findClassSummary(exam: GradeQueryExam, classId: string) {
  return exam.classSummaries.find((item) => item.classId === classId) || null;
}

function ClassComparison({
  data,
  exams,
  subject,
  classId,
  onSubjectChange,
  onClassChange,
}: {
  data: GradeQueryData;
  exams: GradeQueryExam[];
  subject: string;
  classId: string;
  onSubjectChange: (value: string) => void;
  onClassChange: (value: string) => void;
}) {
  const classOptions = data.classes.filter((item) => item.access !== "aggregate");
  const selectedClass = data.classes.find((item) => item.id === classId) || null;
  const allSubjects = [...new Set(data.exams.flatMap((exam) => exam.subjects))];
  const subjects = selectedClass?.access === "all"
    ? allSubjects
    : allSubjects.filter((item) => item === data.subject);
  const effectiveSubject = subjects.includes(subject) ? subject : subjects[0] || subject;
  const rows = exams.flatMap((exam) => {
    const summary = findClassSummary(exam, classId);
    const classAverage = summary?.subjectAverages[effectiveSubject];
    if (typeof classAverage !== "number") return [];
    const scopeAverage = exam.subjectAverages[effectiveSubject];
    const ranked = exam.classSummaries
      .filter((item) => typeof item.subjectAverages[effectiveSubject] === "number")
      .sort((left, right) => (right.subjectAverages[effectiveSubject] as number) - (left.subjectAverages[effectiveSubject] as number));
    return [{
      exam,
      classAverage,
      scopeAverage,
      delta: typeof scopeAverage === "number" ? Math.round((classAverage - scopeAverage) * 100) / 100 : null,
      rank: ranked.findIndex((item) => item.classId === classId) + 1,
      classCount: ranked.length,
    }];
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="比较班级"
            value={classId}
            onChange={(event) => onClassChange(event.target.value)}
            options={classOptions.map((item) => ({ value: item.id, label: `${item.grade} · ${item.name}` }))}
          />
          <Select
            label="比较学科"
            value={effectiveSubject}
            onChange={(event) => onSubjectChange(event.target.value)}
            options={subjects.map((item) => ({ value: item, label: item }))}
          />
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-ink-100 px-4 py-3">
          <div className="text-sm font-medium text-ink-900">{selectedClass?.name || "班级"} · {effectiveSubject}历次成绩差距</div>
          <div className="mt-1 text-xs text-ink-500">虚线为考试范围平均分；班级排名按该学科均分计算。</div>
        </div>
        <TrendChart
          labels={rows.map((item) => item.exam.name)}
          primary={rows.map((item) => item.classAverage)}
          secondary={rows.map((item) => item.scopeAverage)}
          primaryLabel={`${selectedClass?.name || "本班"}均分`}
          secondaryLabel={`${data.scope === "school" ? "全校" : "同年级"}均分`}
        />
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="min-w-[920px] w-full text-xs">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">考试</th>
                <th className="px-4 py-2.5 text-left font-medium">日期</th>
                <th className="px-4 py-2.5 text-right font-medium">本班均分</th>
                <th className="px-4 py-2.5 text-right font-medium">范围均分</th>
                <th className="px-4 py-2.5 text-right font-medium">差距</th>
                <th className="px-4 py-2.5 text-right font-medium">班级排名</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((item) => (
                <tr key={item.exam.id}>
                  <td className="px-4 py-3 font-medium text-ink-900">{item.exam.name}</td>
                  <td className="px-4 py-3 text-ink-500">{examDateLabel(item.exam)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink-900">{formatNumber(item.classAverage)}</td>
                  <td className="px-4 py-3 text-right text-ink-600">{formatNumber(item.scopeAverage)}</td>
                  <td className="px-4 py-3 text-right"><Delta value={item.delta} /></td>
                  <td className="px-4 py-3 text-right text-ink-700">{item.rank > 0 ? `${item.rank}/${item.classCount}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-12 text-center text-sm text-ink-400">所选考试中没有该班级或学科数据</div>}
        </div>
      </Card>
    </div>
  );
}

function StudentTrend({
  data,
  exams,
  classId,
  studentId,
  onClassChange,
  onStudentChange,
}: {
  data: GradeQueryData;
  exams: GradeQueryExam[];
  classId: string;
  studentId: string;
  onClassChange: (value: string) => void;
  onStudentChange: (value: string) => void;
}) {
  const classes = data.classes.filter((item) => item.access !== "aggregate");
  const students = useMemo(() => {
    const byId = new Map<string, GradeQueryRecord>();
    data.exams.forEach((exam) => exam.records
      .filter((record) => record.classId === classId)
      .forEach((record) => byId.set(record.studentId, record)));
    return [...byId.values()].sort((left, right) => left.studentName.localeCompare(right.studentName, "zh-CN"));
  }, [classId, data.exams]);
  const rows = exams.flatMap((exam) => {
    const record = exam.records.find((item) => item.studentId === studentId);
    if (!record) return [];
    const visibleSubject = exam.subjects.find((item) => typeof record.assignedScores[item] === "number");
    const metricValue = typeof record.assignedTotal === "number"
      ? record.assignedTotal
      : visibleSubject
        ? record.assignedScores[visibleSubject]
        : null;
    return [{ exam, record, metricValue, metricLabel: typeof record.assignedTotal === "number" ? "赋分总分" : visibleSubject || "成绩" }];
  });
  const maxRank = Math.max(1, ...rows.map((item) => item.record.gradeRank));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="学生班级"
            value={classId}
            onChange={(event) => onClassChange(event.target.value)}
            options={classes.map((item) => ({ value: item.id, label: `${item.grade} · ${item.name}` }))}
          />
          <Select
            label="选择学生"
            value={studentId}
            onChange={(event) => onStudentChange(event.target.value)}
            placeholder="选择学生"
            options={students.map((item) => ({ value: item.studentId, label: `${item.studentName} · ${item.studentNo}` }))}
          />
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-ink-100 px-4 py-3">
          <div className="text-sm font-medium text-ink-900">学生年级名次变化</div>
          <div className="mt-1 text-xs text-ink-500">纵轴数值越小代表名次越靠前；当前所选考试最大名次为 {maxRank}。</div>
        </div>
        <TrendChart
          labels={rows.map((item) => item.exam.name)}
          primary={rows.map((item) => item.record.gradeRank)}
          primaryLabel="年级名次"
          invert
        />
        <div className="overflow-x-auto border-t border-ink-100">
          <table className="min-w-[720px] w-full text-xs">
            <thead className="bg-ink-50 text-ink-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">考试</th>
                <th className="px-4 py-2.5 text-left font-medium">日期</th>
                <th className="px-4 py-2.5 text-right font-medium">年级名次</th>
                <th className="px-4 py-2.5 text-right font-medium">名次变化</th>
                <th className="px-4 py-2.5 text-left font-medium">科目名次</th>
                <th className="px-4 py-2.5 text-right font-medium">成绩口径</th>
                <th className="px-4 py-2.5 text-right font-medium">成绩</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((item, index) => {
                const previous = rows[index - 1]?.record.gradeRank;
                const change = typeof previous === "number" ? previous - item.record.gradeRank : null;
                return (
                  <tr key={item.exam.id}>
                    <td className="px-4 py-3 font-medium text-ink-900">{item.exam.name}</td>
                    <td className="px-4 py-3 text-ink-500">{examDateLabel(item.exam)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gold-700">{item.record.gradeRank}</td>
                    <td className="px-4 py-3 text-right"><Delta value={change} /></td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-52 flex-wrap gap-1.5">
                        {item.exam.subjects.flatMap((subject) => {
                          const rank = item.record.subjectRanks?.[subject];
                          if (typeof rank !== "number") return [];
                          const scope = item.record.subjectRankScopes?.[subject] === "class" ? "班内" : "年级";
                          return [(
                            <span key={subject} className="rounded bg-ink-50 px-2 py-1 text-ink-600">
                              {subject} · {scope}第 {rank}
                            </span>
                          )];
                        })}
                        {!item.exam.subjects.some((subject) => typeof item.record.subjectRanks?.[subject] === "number") && (
                          <span className="text-ink-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-ink-500">{item.metricLabel}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-800">{formatNumber(item.metricValue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="py-12 text-center text-sm text-ink-400">请选择有历次成绩的学生</div>}
        </div>
      </Card>
    </div>
  );
}

function ClassOverview({
  data,
  exams,
  classId,
  studentId,
  onClassChange,
  onStudentChange,
}: {
  data: GradeQueryData;
  exams: GradeQueryExam[];
  classId: string;
  studentId: string;
  onClassChange: (value: string) => void;
  onStudentChange: (value: string) => void;
}) {
  const fullClasses = data.classes.filter((item) => item.access === "all");
  const ordered = [...exams].sort((left, right) => examTimestamp(left) - examTimestamp(right));
  const earliest = ordered.find((exam) => findClassSummary(exam, classId));
  const latest = [...ordered].reverse().find((exam) => findClassSummary(exam, classId));
  const earliestSummary = earliest ? findClassSummary(earliest, classId) : null;
  const latestSummary = latest ? findClassSummary(latest, classId) : null;
  const subjects = latest?.subjects || [];
  const rows = subjects.map((subject) => {
    const current = latestSummary?.subjectAverages[subject];
    const baseline = earliestSummary?.subjectAverages[subject];
    const scopeAverage = latest?.subjectAverages[subject];
    return {
      subject,
      current,
      scopeAverage,
      delta: typeof current === "number" && typeof scopeAverage === "number" ? Math.round((current - scopeAverage) * 100) / 100 : null,
      change: typeof current === "number" && typeof baseline === "number" ? Math.round((current - baseline) * 100) / 100 : null,
    };
  }).sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0));
  const students = useMemo(() => {
    const byId = new Map<string, GradeQueryRecord>();
    data.exams.forEach((exam) => exam.records
      .filter((record) => record.classId === classId)
      .forEach((record) => byId.set(record.studentId, record)));
    return [...byId.values()].sort((left, right) => left.studentName.localeCompare(right.studentName, "zh-CN"));
  }, [classId, data.exams]);
  const latestStudent = latest?.records.find((item) => item.studentId === studentId) || null;
  const weakSubjects = latestStudent
    ? latest!.subjects.flatMap((subject) => {
        const score = latestStudent.assignedScores[subject];
        const scopeAverage = latest!.subjectAverages[subject];
        if (typeof score !== "number" || typeof scopeAverage !== "number") return [];
        return [{ subject, score, scopeAverage, delta: Math.round((score - scopeAverage) * 100) / 100 }];
      }).sort((left, right) => left.delta - right.delta).slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            label="班主任班级"
            value={classId}
            onChange={(event) => onClassChange(event.target.value)}
            options={fullClasses.map((item) => ({ value: item.id, label: `${item.grade} · ${item.name}` }))}
          />
          <Select
            label="分析单个学生"
            value={studentId}
            onChange={(event) => onStudentChange(event.target.value)}
            placeholder="选择学生"
            options={students.map((item) => ({ value: item.studentId, label: `${item.studentName} · ${item.studentNo}` }))}
          />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="text-sm font-medium text-ink-900">班级各学科整体情况</div>
            <div className="mt-1 text-xs text-ink-500">
              {latest ? `当前：${latest.name}` : "暂无考试"}
              {earliest && latest && earliest.id !== latest.id ? `；变化基准：${earliest.name}` : ""}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full text-xs">
              <thead className="bg-ink-50 text-ink-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">学科</th>
                  <th className="px-4 py-2.5 text-right font-medium">本班均分</th>
                  <th className="px-4 py-2.5 text-right font-medium">年级均分</th>
                  <th className="px-4 py-2.5 text-right font-medium">相对差距</th>
                  <th className="px-4 py-2.5 text-right font-medium">历次变化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((item) => (
                  <tr key={item.subject}>
                    <td className="px-4 py-3 font-medium text-ink-900">{item.subject}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900">{formatNumber(item.current)}</td>
                    <td className="px-4 py-3 text-right text-ink-600">{formatNumber(item.scopeAverage)}</td>
                    <td className="px-4 py-3 text-right"><Delta value={item.delta} /></td>
                    <td className="px-4 py-3 text-right"><Delta value={item.change} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="py-12 text-center text-sm text-ink-400">所选考试中没有该班级数据</div>}
          </div>
        </Card>
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-ink-100 px-4 py-3">
            <div className="text-sm font-medium text-ink-900">学生薄弱学科</div>
            <div className="mt-1 text-xs text-ink-500">按最近一次所选考试与年级均分的差值排序。</div>
          </div>
          {weakSubjects.length > 0 ? (
            <div className="divide-y divide-ink-100">
              {weakSubjects.map((item, index) => (
                <div key={item.subject} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-xs font-medium text-ink-500">{index + 1}</span>
                    <div>
                      <div className="text-sm font-medium text-ink-900">{item.subject}</div>
                      <div className="text-xs text-ink-400">学生 {formatNumber(item.score)} · 年级 {formatNumber(item.scopeAverage)}</div>
                    </div>
                  </div>
                  <Delta value={item.delta} />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-14 text-center text-sm text-ink-400">请选择有成绩的学生</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ScopeOverview({
  data,
  exams,
  subject,
  onSubjectChange,
}: {
  data: GradeQueryData;
  exams: GradeQueryExam[];
  subject: string;
  onSubjectChange: (value: string) => void;
}) {
  const subjects = [...new Set(data.exams.flatMap((exam) => exam.subjects))];
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Select
          label={`${data.scopeLabel}总览学科`}
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          options={subjects.map((item) => ({ value: item, label: item }))}
        />
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {exams.map((exam) => {
          const rows = exam.classSummaries
            .filter((item) => typeof item.subjectAverages[subject] === "number")
            .sort((left, right) => (right.subjectAverages[subject] as number) - (left.subjectAverages[subject] as number));
          return (
            <Card key={exam.id} className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink-900">{exam.name}</div>
                  <div className="mt-0.5 text-xs text-ink-400">{exam.cohortLabel} · {examDateLabel(exam)}</div>
                </div>
                <Badge variant="gold">{subject}均分 {formatNumber(exam.subjectAverages[subject])}</Badge>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-ink-50 text-ink-500">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">名次</th>
                      <th className="px-4 py-2 text-left font-medium">班级</th>
                      <th className="px-4 py-2 text-right font-medium">人数</th>
                      <th className="px-4 py-2 text-right font-medium">均分</th>
                      <th className="px-4 py-2 text-right font-medium">差距</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((item, index) => {
                      const value = item.subjectAverages[subject];
                      const scopeAverage = exam.subjectAverages[subject];
                      const delta = typeof value === "number" && typeof scopeAverage === "number"
                        ? Math.round((value - scopeAverage) * 100) / 100
                        : null;
                      return (
                        <tr key={item.classId}>
                          <td className="px-4 py-2.5 font-medium text-gold-700">{index + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-ink-900">{item.className}</td>
                          <td className="px-4 py-2.5 text-right text-ink-500">{item.studentCount}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-ink-800">{formatNumber(value)}</td>
                          <td className="px-4 py-2.5 text-right"><Delta value={delta} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length === 0 && <div className="py-10 text-center text-sm text-ink-400">暂无该学科数据</div>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function scopeDescription(data: GradeQueryData): string {
  if (data.scope === "school") return "可查看全校历次成绩，并按重要考试比较班级和学科变化。";
  if (data.scope === "grade") return `可全览${data.scopeLabel}各班、各学科和学生成绩变化。`;
  if (data.scope === "homeroom") return "可查看任教学科差距、学生名次趋势，以及班主任班级的全科和薄弱学科分析。";
  return `仅展示任教班级的${data.subject}明细，并提供同年级班级汇总对比。`;
}

export default function StudentGradesPage() {
  const [data, setData] = useState<GradeQueryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [view, setView] = useState<QueryView>("classComparison");
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await gradeService.getQueryData();
      setData(next);
      setSelectedExamIds(next.exams.slice(0, 3).map((item) => item.id));
      const subjects = [...new Set(next.exams.flatMap((exam) => exam.subjects))];
      setSubject(subjects.includes(next.subject) ? next.subject : subjects[0] || "");
      const firstClass = next.classes.find((item) => item.access !== "aggregate");
      setClassId(firstClass?.id || "");
      const firstStudent = next.exams.flatMap((exam) => exam.records).find((record) => record.classId === firstClass?.id);
      setStudentId(firstStudent?.studentId || "");
    } catch (error) {
      toast.error("加载成绩查询失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedExams = useMemo(() => {
    if (!data) return [];
    const selected = new Set(selectedExamIds);
    return data.exams
      .filter((exam) => selected.has(exam.id))
      .sort((left, right) => examTimestamp(left) - examTimestamp(right));
  }, [data, selectedExamIds]);

  const fullClasses = data?.classes.filter((item) => item.access === "all") || [];
  const detailClasses = data?.classes.filter((item) => item.access !== "aggregate") || [];
  const availableViews = useMemo(() => {
    if (!data) return [] as QueryView[];
    const result: QueryView[] = ["classComparison", "studentTrend"];
    if (data.fullClassIds.length > 0) result.push("classOverview");
    if (data.scope === "grade" || data.scope === "school") result.push("scopeOverview");
    return result;
  }, [data]);

  useEffect(() => {
    if (!availableViews.includes(view)) setView(availableViews[0] || "classComparison");
  }, [availableViews, view]);

  const handleClassChange = (nextClassId: string) => {
    setClassId(nextClassId);
    if (!data) return;
    const first = data.exams.flatMap((exam) => exam.records).find((record) => record.classId === nextClassId);
    setStudentId(first?.studentId || "");
  };

  const searchableStudents = useMemo(() => {
    if (!data) return [];
    const normalized = studentSearch.trim().toLowerCase();
    const byId = new Map<string, GradeQueryRecord>();
    data.exams.forEach((exam) => exam.records.forEach((record) => byId.set(record.studentId, record)));
    return [...byId.values()].filter((record) => !normalized
      || record.studentName.toLowerCase().includes(normalized)
      || record.studentNo.toLowerCase().includes(normalized)
      || record.className.toLowerCase().includes(normalized));
  }, [data, studentSearch]);

  if (loading) return <div className="flex justify-center py-28"><Spinner size={32} /></div>;

  return (
    <div>
      <PageHeader
        title="成绩查询"
        description="按当前学校身份查看授权范围内的历次成绩与变化趋势"
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <StudentSectionTabs />

      {!data ? (
        <Card><EmptyState title="无法加载成绩查询" description="请刷新页面后重试。" /></Card>
      ) : data.exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" />}
            title="当前范围暂无可查询成绩"
            description="成绩导入、模板和统计设置已移至成绩统计模块；完成处理后，这里只提供查询与比较。"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-gold-50 p-2 text-gold-700"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-ink-900">当前查询范围：{data.scopeLabel}</div>
                  <Badge variant="gold">{data.scope === "school" ? "校级" : data.scope === "grade" ? "年级组长" : data.scope === "homeroom" ? "班主任" : `${data.subject}任课教师`}</Badge>
                </div>
                <div className="mt-1 text-xs text-ink-500">{scopeDescription(data)}</div>
              </div>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="搜索授权范围内学生"
                className="input-base pl-9"
              />
              {studentSearch && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-ink-200 bg-paper p-1 shadow-lg">
                  {searchableStudents.slice(0, 20).map((record) => (
                    <button
                      key={record.studentId}
                      type="button"
                      onClick={() => {
                        setClassId(record.classId);
                        setStudentId(record.studentId);
                        setView("studentTrend");
                        setStudentSearch("");
                      }}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-ink-50"
                    >
                      <span className="text-sm font-medium text-ink-800">{record.studentName}</span>
                      <span className="text-xs text-ink-400">{record.className} · {record.studentNo}</span>
                    </button>
                  ))}
                  {searchableStudents.length === 0 && <div className="px-3 py-4 text-center text-xs text-ink-400">未找到学生</div>}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="可查询考试" value={data.exams.length} hint="按当前身份自动过滤" />
            <SummaryCard label="可查看班级" value={detailClasses.length} hint={`${data.classes.length - detailClasses.length} 个班仅提供汇总对比`} />
            <SummaryCard label="全科班级" value={fullClasses.length} hint={fullClasses.length > 0 ? "可进行班级与薄弱学科分析" : `仅可查看${data.subject}`} />
            <SummaryCard label="已选重要考试" value={selectedExams.length} hint="用于下方趋势和差距比较" />
          </div>

          <ExamPicker exams={data.exams} selectedIds={selectedExamIds} onChange={setSelectedExamIds} />

          <div className="flex gap-1 overflow-x-auto rounded-lg bg-ink-100 p-1">
            {([
              ["classComparison", "班级学科对比", BarChart3],
              ["studentTrend", "学生名次趋势", LineChart],
              ["classOverview", "班级全科分析", Users],
              ["scopeOverview", `${data.scope === "school" ? "全校" : "年级"}总览`, ShieldCheck],
            ] as const).filter(([key]) => availableViews.includes(key)).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-xs font-medium transition-colors",
                  view === key ? "bg-paper text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800",
                )}
              >
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>

          {selectedExams.length === 0 ? (
            <Card><EmptyState title="尚未选择重要考试" description="请在上方至少勾选一次考试后再进行比较。" /></Card>
          ) : view === "classComparison" ? (
            <ClassComparison
              data={data}
              exams={selectedExams}
              subject={subject}
              classId={classId}
              onSubjectChange={setSubject}
              onClassChange={handleClassChange}
            />
          ) : view === "studentTrend" ? (
            <StudentTrend
              data={data}
              exams={selectedExams}
              classId={classId}
              studentId={studentId}
              onClassChange={handleClassChange}
              onStudentChange={setStudentId}
            />
          ) : view === "classOverview" ? (
            <ClassOverview
              data={data}
              exams={selectedExams}
              classId={fullClasses.some((item) => item.id === classId) ? classId : fullClasses[0]?.id || ""}
              studentId={studentId}
              onClassChange={handleClassChange}
              onStudentChange={setStudentId}
            />
          ) : (
            <ScopeOverview data={data} exams={selectedExams} subject={subject} onSubjectChange={setSubject} />
          )}
        </div>
      )}
    </div>
  );
}
