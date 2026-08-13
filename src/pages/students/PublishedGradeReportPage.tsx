import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import type { GradeClassAverageScorePair } from "@/lib/grade-class-average";
import type { GradeClassAverageSubjectScoreMode } from "@/types";
import type { GradePublishedReportBundle } from "@/lib/grade-published-report";
import { gradeService } from "@/services/grade";

function numberText(value: number | string | null | undefined): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  return value == null || value === "" ? "—" : String(value);
}

function pairText(pair: GradeClassAverageScorePair, mode: GradeClassAverageSubjectScoreMode): string {
  if (mode === "both") return `${numberText(pair.raw)} / ${numberText(pair.assigned)}`;
  return numberText(mode === "assigned" ? pair.assigned : pair.raw);
}

function ReportHeading({ title, date }: { title: string; date: string }) {
  return (
    <div className="mb-3 flex min-w-max items-end justify-between gap-4 px-1">
      <h2 className="font-serif text-lg font-semibold text-ink-900">{title}</h2>
      <div className="shrink-0 text-sm font-medium text-ink-600">{date.replace(/-/g, ".")}</div>
    </div>
  );
}

function ClassAverageTable({ bundle }: { bundle: GradePublishedReportBundle }) {
  const report = bundle.classAverage;
  if (!report) return null;
  const rows = report.groups.flatMap((group) => group.rows);
  return (
    <Card className="overflow-hidden p-5">
      <ReportHeading title={report.title} date={report.reportDate} />
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead><tr className="bg-ink-50 text-ink-700">
            <th className="border border-ink-300 px-2 py-2">班级</th>
            {report.options.showTeacherRows && <th className="border border-ink-300 px-2 py-2">班主任</th>}
            {report.subjects.map((subject) => <th key={subject} className="border border-ink-300 px-2 py-2">{subject}</th>)}
            <th className="border border-ink-300 px-2 py-2">总分平均</th>
          </tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.classId}>
                <th className="border border-ink-300 px-2 py-2 text-left">{row.classLabel}</th>
                {report.options.showTeacherRows && <td className="border border-ink-300 px-2 py-2">{row.homeroomTeachers.join("、") || "—"}</td>}
                {report.subjects.map((subject) => (
                  <td key={subject} className="border border-ink-300 px-2 py-2 text-center tabular-nums">
                    {pairText(row.subjectAverages[subject], row.subjectScoreModes[subject] || "assigned")}
                  </td>
                ))}
                <td className="border border-ink-300 px-2 py-2 text-center font-medium tabular-nums">
                  {pairText(row.totalAverages, report.options.totalScoreMode || "assigned")}
                </td>
              </tr>
            ))}
            {report.options.showOverallAverage && (
              <tr className="bg-ink-50 font-semibold">
                <th className="border border-ink-300 px-2 py-2 text-left" colSpan={report.options.showTeacherRows ? 2 : 1}>总体平均</th>
                {report.subjects.map((subject) => (
                  <td key={subject} className="border border-ink-300 px-2 py-2 text-center tabular-nums">
                    {pairText(report.overallAverage.subjectValues[subject], report.overallSubjectScoreModes[subject] || "assigned")}
                  </td>
                ))}
                <td className="border border-ink-300 px-2 py-2 text-center tabular-nums">
                  {pairText(report.overallAverage.totalValues, report.options.totalScoreMode || "assigned")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TotalScoreTable({ bundle }: { bundle: GradePublishedReportBundle }) {
  const report = bundle.totalScoreSegment;
  if (!report) return null;
  return (
    <Card className="overflow-hidden p-5">
      <ReportHeading title={report.title} date={report.reportDate} />
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-[11px]">
          <thead><tr className="bg-ink-50 text-ink-700">
            <th className="border border-ink-300 px-2 py-1.5">总分分数段</th>
            {report.columns.map((column) => <th key={column.key} className="border border-ink-300 px-2 py-1.5">{column.label}</th>)}
          </tr></thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.threshold}>
                <th className="border border-ink-300 px-2 py-1.5">{row.threshold}分以上</th>
                {report.columns.map((column) => <td key={column.key} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{row.counts[column.key] || 0}</td>)}
              </tr>
            ))}
            {report.summaryRows.map((row) => (
              <tr key={row.key} className="bg-ink-50/50">
                <th className="border border-ink-300 px-2 py-1.5">{row.label}</th>
                {report.columns.map((column) => <td key={column.key} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{numberText(row.values[column.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SubjectTables({ bundle }: { bundle: GradePublishedReportBundle }) {
  const report = bundle.subjectScoreSegment;
  if (!report || report.subjects.length === 0) return null;
  return (
    <Card className="space-y-8 overflow-hidden p-5">
      {report.subjects.map((subject) => (
        <section key={subject.subject} className="overflow-x-auto">
          <ReportHeading title={subject.title} date={report.reportDate} />
          <table className="w-max min-w-full border-collapse text-[11px]">
            <thead><tr className="bg-ink-50 text-ink-700">
              <th className="border border-ink-300 px-2 py-1.5">班级</th>
              <th className="border border-ink-300 px-2 py-1.5">{subject.subject}</th>
              <th className="border border-ink-300 px-2 py-1.5">实考人数</th>
              {subject.thresholds.map((threshold) => <th key={threshold} className="border border-ink-300 px-2 py-1.5">{threshold}分以上</th>)}
            </tr></thead>
            <tbody>
              {subject.rows.map((row) => (
                <tr key={row.classId}>
                  <th className="border border-ink-300 px-2 py-1.5">{row.classLabel}</th>
                  <td className="border border-ink-300 px-2 py-1.5">{row.teacherNames.join("、") || "—"}</td>
                  <td className="border border-ink-300 px-2 py-1.5 text-center">{row.candidateCount}</td>
                  {subject.thresholds.map((threshold) => <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{row.counts[threshold] || 0}</td>)}
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={2} className="border border-ink-300 px-2 py-1.5">累计</th>
                <td className="border border-ink-300 px-2 py-1.5 text-center">{subject.totalCandidateCount}</td>
                {subject.thresholds.map((threshold) => <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{subject.totalCounts[threshold] || 0}</td>)}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </Card>
  );
}

function ElectiveTables({ bundle }: { bundle: GradePublishedReportBundle }) {
  const report = bundle.electiveScoreSegment;
  if (!report || report.subjects.length === 0) return null;
  return (
    <Card className="space-y-8 overflow-hidden p-5">
      {report.subjects.map((subject) => (
        <section key={subject.subject} className="overflow-x-auto">
          <ReportHeading title={subject.title} date={report.reportDate} />
          <table className="w-max min-w-full border-collapse text-[11px]">
            <thead><tr className="bg-ink-50 text-ink-700">
              <th className="border border-ink-300 px-2 py-1.5">班级</th>
              <th className="border border-ink-300 px-2 py-1.5">任课教师</th>
              <th className="border border-ink-300 px-2 py-1.5">实际考试人数</th>
              {subject.gradeLabels.map((label) => <th key={label} className="border border-ink-300 px-2 py-1.5">{label}</th>)}
              {subject.thresholds.map((threshold) => <th key={threshold} className="border border-ink-300 px-2 py-1.5">{threshold}分以上</th>)}
            </tr></thead>
            <tbody>
              {subject.rows.map((row) => (
                <tr key={row.classId}>
                  <th className="border border-ink-300 px-2 py-1.5">{row.classLabel}</th>
                  <td className="border border-ink-300 px-2 py-1.5">{row.teacherNames.join("、") || "—"}</td>
                  <td className="border border-ink-300 px-2 py-1.5 text-center">{row.candidateCount}</td>
                  {subject.gradeLabels.map((label) => <td key={label} className="border border-ink-300 px-2 py-1.5 text-center">{row.gradeCounts[label] || 0}</td>)}
                  {subject.thresholds.map((threshold) => <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{row.scoreCounts[threshold] || 0}</td>)}
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={2} className="border border-ink-300 px-2 py-1.5">累计</th>
                <td className="border border-ink-300 px-2 py-1.5 text-center">{subject.totalCandidateCount}</td>
                {subject.gradeLabels.map((label) => <td key={label} className="border border-ink-300 px-2 py-1.5 text-center">{subject.totalGradeCounts[label] || 0}</td>)}
                {subject.thresholds.map((threshold) => <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{subject.totalScoreCounts[threshold] || 0}</td>)}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </Card>
  );
}

export default function PublishedGradeReportPage() {
  const { token = "" } = useParams();
  const [bundle, setBundle] = useState<GradePublishedReportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    gradeService.getPublishedReportByToken(token)
      .then((next) => { if (active) setBundle(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "成绩分享链接无效"); });
    return () => { active = false; };
  }, [token]);

  if (!bundle && !error) return <div className="flex min-h-screen items-center justify-center bg-mist"><Spinner size={32} /></div>;
  if (error || !bundle) {
    return (
      <div className="min-h-screen bg-mist p-6">
        <div className="mx-auto max-w-3xl pt-24"><Card><EmptyState title="无法查看成绩统计表" description={error || "该发布已撤回。"} /></Card></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-gold-50 p-2 text-gold-700"><BarChart3 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl font-semibold text-ink-900">{bundle.exam.cohortLabel}{bundle.exam.name}成绩统计</h1>
              <div className="mt-1 text-sm text-ink-500">
                考试时间：{bundle.exam.examDate || "未填写"} · 发布时间：{new Date(bundle.exam.publishedAt).toLocaleString("zh-CN")}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
                <ShieldCheck className="h-3.5 w-3.5" />此公开页面仅包含聚合统计，不包含学生姓名和逐人成绩。
              </div>
            </div>
          </div>
        </Card>
        <ClassAverageTable bundle={bundle} />
        <TotalScoreTable bundle={bundle} />
        <SubjectTables bundle={bundle} />
        <ElectiveTables bundle={bundle} />
      </div>
    </main>
  );
}
