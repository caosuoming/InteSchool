import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronUp, ClipboardCheck, Users } from "lucide-react";
import type {
  AnyClass,
  ClassroomHomework,
  HomeworkClassOverviewRecord,
  Student,
} from "@/types";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { homeworkRecordService } from "@/services/homeworkRecord";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function attendanceCounts(record: HomeworkClassOverviewRecord) {
  const submitted = new Set(record.submittedStudentIds || []);
  const absent = new Set(record.absentStudentIds || []);
  const missing = (record.studentIds || []).filter((id) => !submitted.has(id) && !absent.has(id)).length;
  return {
    submitted: submitted.size,
    absent: absent.size,
    missing,
  };
}

export function ClassHomeworkOverview({
  classInfo,
  students,
  teacherId,
}: {
  classInfo: AnyClass;
  students: Student[];
  teacherId: string;
}) {
  const [homeworkDate, setHomeworkDate] = useState(localToday);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [record, setRecord] = useState<HomeworkClassOverviewRecord | null>(null);
  const [history, setHistory] = useState<HomeworkClassOverviewRecord[]>([]);
  const [summary, setSummary] = useState("");
  const [savedSummary, setSavedSummary] = useState("");
  const [submittedStudentIds, setSubmittedStudentIds] = useState<Set<string>>(() => new Set());
  const [absentStudentIds, setAbsentStudentIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [summaryPending, setSummaryPending] = useState(false);
  const [attendancePending, setAttendancePending] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, records, assigned] = await Promise.all([
        homeworkRecordService.getClassOverview(classInfo.id, homeworkDate),
        homeworkRecordService.listClassOverviews(classInfo.id),
        classroomHomeworkService.listHomeworks({
          teacherId,
          classId: classInfo.id,
          assignedDate: homeworkDate,
        }),
      ]);
      setRecord(current);
      setHistory(records);
      setSummary(current?.summary || "");
      setSavedSummary(current?.summary || "");
      setSubmittedStudentIds(new Set(current?.submittedStudentIds || []));
      setAbsentStudentIds(new Set(current?.absentStudentIds || []));
      setHomeworks(assigned);
    } catch (error) {
      toast.error("加载班级作业总览失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [classInfo.id, homeworkDate, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSummary = async () => {
    if (summaryPending) return;
    setSummaryPending(true);
    try {
      const saved = await homeworkRecordService.saveClassOverview({
        classId: classInfo.id,
        homeworkDate,
        summary,
      });
      setRecord(saved);
      setSummary(saved.summary);
      setSavedSummary(saved.summary);
      setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]
        .sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate)));
      toast.success(saved.summary ? "作业概况已保存" : "作业概况已清除");
    } catch (error) {
      toast.error("保存作业概况失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSummaryPending(false);
    }
  };

  const toggleSubmitted = (studentId: string) => {
    if (attendancePending) return;
    setSubmittedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setAbsentStudentIds((current) => {
      if (!current.has(studentId)) return current;
      const next = new Set(current);
      next.delete(studentId);
      return next;
    });
  };

  const toggleAbsent = (studentId: string) => {
    if (attendancePending) return;
    setAbsentStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setSubmittedStudentIds((current) => {
      if (!current.has(studentId)) return current;
      const next = new Set(current);
      next.delete(studentId);
      return next;
    });
  };

  const saveAttendance = async () => {
    if (attendancePending) return;
    setAttendancePending(true);
    try {
      const saved = await homeworkRecordService.saveClassOverview({
        classId: classInfo.id,
        homeworkDate,
        submittedStudentIds: [...submittedStudentIds],
        absentStudentIds: [...absentStudentIds],
        attendanceTaken: true,
      });
      setRecord(saved);
      setSubmittedStudentIds(new Set(saved.submittedStudentIds));
      setAbsentStudentIds(new Set(saved.absentStudentIds));
      setHistory((current) => [saved, ...current.filter((item) => item.id !== saved.id)]
        .sort((a, b) => b.homeworkDate.localeCompare(a.homeworkDate)));
      toast.success("作业点名已保存");
    } catch (error) {
      toast.error("保存作业点名失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAttendancePending(false);
    }
  };

  const currentMissingCount = useMemo(() => students.filter((student) => (
    !submittedStudentIds.has(student.id) && !absentStudentIds.has(student.id)
  )).length, [absentStudentIds, students, submittedStudentIds]);

  const previousRecords = useMemo(
    () => history.filter((item) => item.homeworkDate !== homeworkDate),
    [history, homeworkDate],
  );
  const visibleHistory = historyExpanded ? previousRecords : previousRecords.slice(0, 3);

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={24} /></div>;
  }

  return (
    <div>
      <section className="border-b border-gold-200 bg-gold-50/40 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">{classInfo.name} · 作业情况总览</h3>
            <p className="mt-0.5 text-xs text-ink-500">查看当天作业、记录班级概况并完成作业点名</p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-600">
            <CalendarDays className="h-4 w-4 text-gold-600" />
            <span>作业日期</span>
            <input
              type="date"
              aria-label="班级作业日期"
              value={homeworkDate}
              onChange={(event) => event.target.value && setHomeworkDate(event.target.value)}
              className="rounded-lg border border-ink-200 bg-paper px-2.5 py-1.5 text-xs text-ink-700 outline-none transition-colors focus:border-gold-400"
            />
          </label>
        </div>
      </section>

      <section className="border-b border-ink-100 p-4 lg:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-gold-600" />
          <h3 className="text-sm font-semibold text-ink-900">当天作业内容</h3>
        </div>
        {homeworks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 bg-mist/30 px-4 py-5 text-center text-xs text-ink-400">
            当天没有布置班级作业
          </div>
        ) : (
          <div className="space-y-2">
            {homeworks.map((homework) => (
              <div key={homework.id} className="rounded-lg border border-ink-100 bg-paper px-3 py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-ink-400">
                  <span className="font-medium text-ink-600">{homework.subject}</span>
                  <span>·</span>
                  <span>{homework.teacherName}</span>
                </div>
                {homework.content && (
                  <div className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{homework.content}</div>
                )}
                {(homework.attachments?.length || 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {homework.attachments?.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-ink-200 bg-mist/40 px-2 py-1 text-[11px] text-ink-600 hover:border-gold-300"
                      >
                        {attachment.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border-b border-ink-100 p-4 lg:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            label="当天作业概况"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="记录全班完成情况、共性问题、需要讲评的内容等..."
            rows={3}
            disabled={summaryPending}
            className="min-h-[88px] bg-paper"
          />
          <Button
            variant="gold"
            size="sm"
            className="sm:mb-[2px] sm:shrink-0"
            onClick={() => void saveSummary()}
            loading={summaryPending}
            disabled={summaryPending || summary.trim() === savedSummary.trim()}
          >
            保存概况
          </Button>
        </div>
      </section>

      <section className="border-b border-ink-100">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-5">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gold-600" />
              <h3 className="text-sm font-semibold text-ink-900">作业点名</h3>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              勾选表示已交作业；未勾选且未请假会记为未交，并同步到“师生互动”时间线
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-700">已交 {submittedStudentIds.size}</span>
            <span className="text-red-600">未交 {currentMissingCount}</span>
            <span className="text-amber-700">请假 {absentStudentIds.size}</span>
          </div>
        </div>
        {students.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-400">该班级暂无学生</div>
        ) : (
          <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3 lg:px-5 lg:pb-5">
            {students.map((student) => {
              const submitted = submittedStudentIds.has(student.id);
              const absent = absentStudentIds.has(student.id);
              return (
                <div
                  key={student.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5",
                    absent ? "border-amber-200 bg-amber-50/60"
                      : submitted ? "border-emerald-200 bg-emerald-50/50"
                        : "border-red-100 bg-red-50/30",
                  )}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <span className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      submitted ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-300 bg-paper",
                    )}>
                      {submitted && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={submitted}
                      onChange={() => toggleSubmitted(student.id)}
                      aria-label={`${student.name}已交作业`}
                    />
                    <span className="truncate text-sm font-medium text-ink-800">{student.name}</span>
                    {student.studentNo && <span className="shrink-0 text-[10px] text-ink-400">{student.studentNo}</span>}
                  </label>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-amber-700">
                    <input
                      type="checkbox"
                      checked={absent}
                      onChange={() => toggleAbsent(student.id)}
                      aria-label={`${student.name}请假`}
                      className="rounded border-ink-300 text-amber-600 focus:ring-amber-400"
                    />
                    请假
                  </label>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 px-4 py-3 lg:px-5">
          <span className="text-[11px] text-ink-400">
            {record?.attendanceTaken ? "本次点名已保存，可继续修改后再次保存" : "尚未保存本次点名"}
          </span>
          <Button
            variant="gold"
            size="sm"
            onClick={() => void saveAttendance()}
            loading={attendancePending}
            disabled={attendancePending || students.length === 0}
          >
            保存作业点名
          </Button>
        </div>
      </section>

      <section className="p-4 lg:p-5">
        <h3 className="text-sm font-semibold text-ink-900">以前的作业概况</h3>
        <p className="mt-0.5 text-xs text-ink-500">默认显示最近 3 次，其余记录可展开查看</p>
        {visibleHistory.length === 0 ? (
          <div className="py-6 text-center text-xs text-ink-400">暂无以前的作业概况</div>
        ) : (
          <div className="mt-3 space-y-2">
            {visibleHistory.map((item) => {
              const counts = attendanceCounts(item);
              return (
                <div key={item.id} className="rounded-lg border border-ink-100 bg-mist/30 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-700">{item.homeworkDate}</span>
                    {item.attendanceTaken && (
                      <span className="text-[11px] text-ink-400">
                        已交 {counts.submitted} · 未交 {counts.missing} · 请假 {counts.absent}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 whitespace-pre-wrap text-sm text-ink-600">
                    {item.summary || "未填写作业概况"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {previousRecords.length > 3 && (
          <button
            type="button"
            onClick={() => setHistoryExpanded((current) => !current)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-800"
          >
            {historyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {historyExpanded ? "收起其余记录" : `展开其余 ${previousRecords.length - 3} 次`}
          </button>
        )}
      </section>
    </div>
  );
}

export default ClassHomeworkOverview;
