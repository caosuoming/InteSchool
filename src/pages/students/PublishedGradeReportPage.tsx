import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  classAverageScoreCellValue,
  formatGradeClassRangeLabel,
  type GradeClassAverageScorePair,
} from "@/lib/grade-class-average";
import type { GradeClassAverageSubjectScoreMode } from "@/types";
import type { GradePublishedReportBundle } from "@/lib/grade-published-report";
import { gradeService } from "@/services/grade";

const TOTAL_SCORE_STANDARD_LABELS = [
  ["highScore1", "高分1"],
  ["highScore2", "高分2"],
  ["firstTier", "一本"],
  ["undergraduate", "二本"],
] as const;

function numberText(value: number | string | null | undefined): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.00$/, "");
  return value == null || value === "" ? "—" : String(value);
}

function scoreText(pair: GradeClassAverageScorePair, mode: GradeClassAverageSubjectScoreMode): string {
  const value = classAverageScoreCellValue(pair, mode);
  return typeof value === "number" ? value.toFixed(2) : value || "—";
}

function countText(value: number): string {
  return value === 0 ? "" : String(value);
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

  return (
    <Card className="overflow-hidden p-5">
      <ReportHeading title={report.title} date={report.reportDate} />
      <div className="overflow-x-auto">
        <table className="w-max min-w-full table-auto border-collapse text-[11px]">
          <thead>
            <tr className="bg-ink-50 text-ink-700">
              <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">类别</th>
              <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">班级</th>
              <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">班主任 / 人数</th>
              {report.subjects.map((subject) => (
                <th key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">{subject}</th>
              ))}
              <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">总分平均</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.map((group) => {
              const summaryRows = group.rows.length > 1
                ? Number(report.options.showGroupDifference) + Number(report.options.showGroupAverage)
                : 0;
              const rowSpan = group.rows.length * (report.options.showTeacherRows ? 2 : 1) + summaryRows;
              let categoryRendered = false;
              return [
                ...group.rows.flatMap((row) => {
                  const categoryCell = !categoryRendered ? (
                    <td
                      rowSpan={rowSpan}
                      className="whitespace-nowrap border border-ink-300 bg-ink-50/70 px-2 py-1.5 text-center align-middle font-medium text-ink-800"
                    >
                      {group.category}
                    </td>
                  ) : null;
                  categoryRendered = true;
                  const teacherRow = report.options.showTeacherRows ? (
                    <tr key={`${row.classId}-teachers`}>
                      {categoryCell}
                      <td rowSpan={2} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold text-ink-800">
                        {row.classLabel}
                      </td>
                      <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center text-ink-600">
                        {row.homeroomTeachers.join("、") || "—"}
                      </td>
                      {report.subjects.map((subject) => (
                        <td key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center text-ink-600">
                          {row.subjectTeachers[subject]?.join("、") || "—"}
                        </td>
                      ))}
                      <td className="border border-ink-300 px-3 py-2" />
                    </tr>
                  ) : null;
                  const scoreRow = (
                    <tr key={`${row.classId}-scores`} className="bg-paper">
                      {!report.options.showTeacherRows && categoryCell}
                      {!report.options.showTeacherRows && (
                        <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold text-ink-800">
                          {row.classLabel}
                        </td>
                      )}
                      <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center text-ink-500">{row.studentCount} 人</td>
                      {report.subjects.map((subject) => (
                        <td key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-semibold tabular-nums text-ink-900">
                          {scoreText(row.subjectAverages[subject], row.subjectScoreModes[subject])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">
                        {scoreText(row.totalAverages, report.options.totalScoreMode || "assigned")}
                      </td>
                    </tr>
                  );
                  return teacherRow ? [teacherRow, scoreRow] : [scoreRow];
                }),
                ...(group.rows.length > 1 && report.options.showGroupDifference ? [(
                  <tr key={`${group.category}-difference`} className="bg-amber-50/40">
                    <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-medium">分差</td>
                    <td className="border border-ink-300 px-3 py-2" />
                    {report.subjects.map((subject) => (
                      <td key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right tabular-nums">
                        {scoreText(group.difference.subjectValues[subject], group.subjectScoreModes[subject])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-semibold tabular-nums">
                      {scoreText(group.difference.totalValues, report.options.totalScoreMode || "assigned")}
                    </td>
                  </tr>
                )] : []),
                ...(group.rows.length > 1 && report.options.showGroupAverage ? [(
                  <tr key={`${group.category}-average`} className="bg-blue-50/40">
                    <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-medium">
                      平均（{formatGradeClassRangeLabel(group.rows.map((row) => row.classLabel))}）
                    </td>
                    <td className="border border-ink-300 px-3 py-2" />
                    {report.subjects.map((subject) => (
                      <td key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-semibold tabular-nums">
                        {scoreText(group.average.subjectValues[subject], group.subjectScoreModes[subject])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-bold tabular-nums">
                      {scoreText(group.average.totalValues, report.options.totalScoreMode || "assigned")}
                    </td>
                  </tr>
                )] : []),
              ];
            })}
            {report.options.showOverallAverage && (
              <tr className="bg-ink-100/70">
                <td colSpan={3} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-bold text-ink-900">全校平均</td>
                {report.subjects.map((subject) => (
                  <td key={subject} className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">
                    {scoreText(report.overallAverage.subjectValues[subject], report.overallSubjectScoreModes[subject])}
                  </td>
                ))}
                <td className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-right font-bold tabular-nums text-ink-900">
                  {scoreText(report.overallAverage.totalValues, report.options.totalScoreMode || "assigned")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-2 text-xs text-ink-400">
          均分按实际有分数的学生计算；分组平均和全校平均按学生人数加权，分差为同类别班级均分的最大值减最小值。
        </div>
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
        <table className="w-max min-w-full table-auto border-collapse text-[11px]">
          <thead>
            <tr className="bg-ink-50 text-ink-700">
              <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold">总分分数段</th>
              {report.columns.map((column) => (
                <th key={column.key} className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold ${column.kind === "class" ? "" : "bg-emerald-50 text-emerald-900"}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.threshold} className="bg-paper">
                <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold text-ink-800">{row.threshold}分以上</th>
                {report.columns.map((column) => (
                  <td key={column.key} className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums text-ink-900 ${column.kind === "class" ? "" : "bg-emerald-50/50"}`}>
                    {countText(row.counts[column.key])}
                  </td>
                ))}
              </tr>
            ))}
            <tr data-testid="track-standard-summary" className="bg-amber-50/40">
              <td colSpan={report.columns.length + 1} className="border border-ink-300 px-3 py-2 text-center text-[11px] text-ink-700">
                <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-1">
                  {(["science", "arts"] as const).map((track) => (
                    <span key={track} className="whitespace-nowrap">
                      <span className="font-semibold text-ink-900">{track === "science" ? "理科标准" : "文科标准"}：</span>
                      {TOTAL_SCORE_STANDARD_LABELS.map(([key, label], index) => (
                        <span key={key}>
                          {index > 0 && <span className="mx-1.5 text-ink-300">|</span>}
                          {label} {report.trackStandards[track][key] === null
                            ? "未设置"
                            : `${report.trackStandards[track][key]}分`}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
            {report.summaryRows.map((row) => (
              <tr key={row.key} className="bg-paper">
                <th className="whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold text-ink-800">{row.label}</th>
                {report.columns.map((column) => {
                  const value = row.values[column.key];
                  return (
                    <td key={column.key} className={`whitespace-nowrap border border-ink-300 px-2 py-1.5 text-center font-semibold tabular-nums text-ink-900 ${column.kind === "class" ? "" : "bg-emerald-50/50"}`}>
                      {row.kind === "count" && value === 0 ? "" : numberText(value)}
                    </td>
                  );
                })}
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
          <table className="w-max min-w-full table-auto border-collapse text-[11px]">
            <thead>
              <tr className="bg-ink-50 text-ink-700">
                <th className="border border-ink-300 px-2 py-1.5 text-center">班级</th>
                <th className="border border-ink-300 px-2 py-1.5 text-center">{subject.subject}</th>
                <th className="border border-ink-300 px-2 py-1.5 text-center">实考人数</th>
                {subject.thresholds.map((threshold) => (
                  <th key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{threshold}分以上</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subject.rows.map((row) => (
                <tr key={row.classId}>
                  <th className="border border-ink-300 px-2 py-1.5 text-center">{row.classLabel}</th>
                  <td className="border border-ink-300 px-2 py-1.5 text-center">{row.teacherNames.join("、") || "—"}</td>
                  <td className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(row.candidateCount)}</td>
                  {subject.thresholds.map((threshold) => (
                    <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(row.counts[threshold])}</td>
                  ))}
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={2} className="border border-ink-300 px-2 py-1.5 text-center">累计</th>
                <td className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(subject.totalCandidateCount)}</td>
                {subject.thresholds.map((threshold) => (
                  <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(subject.totalCounts[threshold])}</td>
                ))}
              </tr>
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={3} className="border border-ink-300 px-2 py-1.5 text-center">所占比例</th>
                {subject.thresholds.map((threshold) => (
                  <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">
                    {subject.totalCandidateCount > 0 ? subject.totalRates[threshold] : ""}
                  </td>
                ))}
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
          <table className="w-max min-w-full table-auto border-collapse text-[11px]">
            <thead>
              <tr className="bg-ink-50 text-ink-700">
                <th className="border border-ink-300 px-2 py-1.5 text-center">班级</th>
                <th className="border border-ink-300 px-2 py-1.5 text-center">任课教师</th>
                <th className="border border-ink-300 px-2 py-1.5 text-center">实际考试人数</th>
                {subject.gradeLabels.map((label) => (
                  <th key={label} className="border border-ink-300 px-2 py-1.5 text-center">{label}</th>
                ))}
                {subject.thresholds.map((threshold) => (
                  <th key={threshold} className="border border-ink-300 px-2 py-1.5 text-center">{threshold}分以上</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subject.rows.map((row) => (
                <tr key={row.classId}>
                  <th className="border border-ink-300 px-2 py-1.5 text-center">{row.classLabel}</th>
                  <td className="border border-ink-300 px-2 py-1.5 text-center">{row.teacherNames.join("、") || "—"}</td>
                  <td className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(row.candidateCount)}</td>
                  {subject.gradeLabels.map((label) => (
                    <td key={label} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(row.gradeCounts[label])}</td>
                  ))}
                  {subject.thresholds.map((threshold) => (
                    <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(row.scoreCounts[threshold])}</td>
                  ))}
                </tr>
              ))}
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={2} className="border border-ink-300 px-2 py-1.5 text-center">累计</th>
                <td className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(subject.totalCandidateCount)}</td>
                {subject.gradeLabels.map((label) => (
                  <td key={label} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(subject.totalGradeCounts[label])}</td>
                ))}
                {subject.thresholds.map((threshold) => (
                  <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">{countText(subject.totalScoreCounts[threshold])}</td>
                ))}
              </tr>
              <tr className="bg-ink-50 font-semibold">
                <th colSpan={3} className="border border-ink-300 px-2 py-1.5 text-center">所占比例</th>
                {subject.gradeLabels.map((label) => (
                  <td key={label} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">
                    {subject.totalCandidateCount > 0 ? subject.totalGradeRates[label] : ""}
                  </td>
                ))}
                {subject.thresholds.map((threshold) => (
                  <td key={threshold} className="border border-ink-300 px-2 py-1.5 text-center tabular-nums">
                    {subject.totalCandidateCount > 0 ? subject.totalScoreRates[threshold] : ""}
                  </td>
                ))}
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
