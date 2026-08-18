import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, TableProperties } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import {
  buildGradeClassStatisticsReport,
  type GradeClassStatisticsOptions,
} from "@/lib/grade-class-statistics";
import type { GradeExam } from "@/types";

interface GradeClassStatisticsTableProps {
  exam: GradeExam;
  comparisonExams: GradeExam[];
  options: GradeClassStatisticsOptions;
  onOptionsChange: (options: GradeClassStatisticsOptions) => void;
}

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function GradeClassStatisticsTable({
  exam,
  comparisonExams,
  options,
  onOptionsChange,
}: GradeClassStatisticsTableProps) {
  const report = useMemo(
    () => buildGradeClassStatisticsReport(exam, comparisonExams, options),
    [comparisonExams, exam, options],
  );
  const [selectedClassId, setSelectedClassId] = useState(report.classes[0]?.classId || "");

  useEffect(() => {
    setSelectedClassId((current) => (
      report.classes.some((item) => item.classId === current)
        ? current
        : report.classes[0]?.classId || ""
    ));
  }, [exam.id, report.classes]);

  const selectedClass = report.classes.find((item) => item.classId === selectedClassId) || report.classes[0];
  const patchOptions = (patch: Partial<GradeClassStatisticsOptions>) => {
    onOptionsChange({ ...options, ...patch });
  };
  const toggleComparison = (examId: string) => {
    patchOptions({
      comparisonExamIds: options.comparisonExamIds.includes(examId)
        ? options.comparisonExamIds.filter((id) => id !== examId)
        : [...options.comparisonExamIds, examId],
    });
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-ink-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
            <TableProperties className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">表六、各班成绩统计</div>
            <div className="mt-0.5 text-xs text-ink-500">
              每个学生固定展示班级、姓名和各科成绩；可追加单科排名、原始/赋分总分及相应排名，并与勾选的历史考试并列比较。
            </div>
          </div>
        </div>
        {report.classes.length > 0 && (
          <div className="w-full lg:w-60">
            <Select
              label="查看班级"
              value={selectedClass?.classId || ""}
              onChange={(event) => setSelectedClassId(event.target.value)}
              options={report.classes.map((item) => ({ value: item.classId, label: item.className }))}
            />
          </div>
        )}
      </div>

      <div className="space-y-4 border-b border-ink-100 bg-ink-50/40 p-5">
        <div>
          <div className="text-xs font-medium text-ink-700">可选字段</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.showSubjectClassRanks}
                onChange={(event) => patchOptions({ showSubjectClassRanks: event.target.checked })}
              />
              各科班级排名
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.showSubjectGradeRanks}
                onChange={(event) => patchOptions({ showSubjectGradeRanks: event.target.checked })}
              />
              各科年级排名
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.showRawTotal}
                onChange={(event) => patchOptions({ showRawTotal: event.target.checked })}
              />
              总分（原始）及排名
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.showAssignedTotal}
                onChange={(event) => patchOptions({ showAssignedTotal: event.target.checked })}
              />
              总分（赋分）及排名
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
            <GitCompareArrows className="h-3.5 w-3.5" />
            与之前考试对比
          </div>
          {comparisonExams.length === 0 ? (
            <div className="mt-1 text-xs text-ink-400">当前考试之前没有可比较的已导入考试。</div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-700">
              {comparisonExams.map((item) => (
                <label key={item.id} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={options.comparisonExamIds.includes(item.id)}
                    onChange={() => toggleComparison(item.id)}
                  />
                  {item.name}{item.examDate ? `（${item.examDate}）` : ""}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selectedClass ? (
        <EmptyState title="当前考试没有班级成绩" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-ink-50 text-xs text-ink-600">
              <tr>
                {report.columns.map((column) => (
                  <th
                    key={column.key}
                    className="whitespace-nowrap border-b border-r border-ink-100 px-3 py-2.5 text-center font-medium last:border-r-0"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedClass.rows.map((row) => (
                <tr key={row.studentId} className="border-b border-ink-100 last:border-b-0">
                  {report.columns.map((column) => (
                    <td
                      key={column.key}
                      className="whitespace-nowrap border-r border-ink-100 px-3 py-2.5 text-center tabular-nums last:border-r-0"
                    >
                      {displayValue(row.values[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
