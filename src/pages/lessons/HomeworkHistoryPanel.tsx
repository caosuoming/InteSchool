import { useMemo } from "react";
import type { HomeworkClassOverviewRecord } from "@/types";

export function HomeworkHistoryPanel({
  records,
  students,
}: {
  records: HomeworkClassOverviewRecord[];
  students: { id: string; name: string }[];
}) {
  const previous = useMemo(() => records.filter((item) => item.homeworkDate < new Date(
    Date.now() - new Date().getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 10)).sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate)), [records]);
  const studentNames = new Map(students.map((student) => [student.id, student.name]));
  const missingCounts = new Map<string, number>();
  for (const record of records) {
    if (!record.attendanceTaken) continue;
    const excluded = new Set([...record.submittedStudentIds, ...record.absentStudentIds]);
    for (const id of record.studentIds) {
      if (!excluded.has(id)) missingCounts.set(id, (missingCounts.get(id) || 0) + 1);
    }
  }

  return (
    <div className="max-h-[65vh] overflow-y-auto" aria-label="历史作业记录">
      <h2 className="mb-3 text-sm font-semibold text-ink-900">历史作业记录</h2>
      {previous.length === 0 ? <p className="py-6 text-center text-xs text-ink-400">暂无历史作业记录</p> : (
        <div className="space-y-3">
          {previous.map((record) => {
            const excluded = new Set([...record.submittedStudentIds, ...record.absentStudentIds]);
            const missing = record.attendanceTaken ? record.studentIds.filter((id) => !excluded.has(id)) : [];
            return (
              <article key={record.id} className="rounded-lg border border-ink-100 bg-mist/30 p-3">
                <h3 className="text-xs font-semibold text-ink-800">{record.homeworkDate}</h3>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">作业概况：{record.summary || "未填写"}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-600">
                  作业点名：{!record.attendanceTaken ? "未点名"
                    : missing.length ? missing.map((id) => `${record.studentNames?.[id] || studentNames.get(id) || id}（${missingCounts.get(id) || 1}次）`).join("、") : "全部已交或请假"}
                </p>
                {(record.images?.length || 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {record.images?.map((image) => (
                      <a key={image.id} href={image.url} target="_blank" rel="noreferrer" title="点击放大作业图片">
                        <img src={image.url} alt={image.name} className="h-24 w-28 rounded border border-ink-200 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
