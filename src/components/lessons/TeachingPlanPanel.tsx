import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronDown, ChevronUp, History, Save } from "lucide-react";
import type {
  TeacherTeachingActualRecord,
  TeacherTeachingPlan,
  TeacherTeachingPlanEntry,
  TeacherTeachingPlanSemester,
} from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface TeachingPlanPanelProps {
  plan: TeacherTeachingPlan | null;
  loading: boolean;
  saving: boolean;
  onSave: (startDate: string, endDate: string, entries: TeacherTeachingPlanEntry[]) => void;
}

function localDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
  ) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function datesBetween(startDate: string, endDate: string): string[] {
  const start = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end && dates.length < 550) {
    dates.push(localDateValue(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function weekdayLabel(date: string): string {
  return WEEKDAYS[parseDateValue(date)?.getDay() ?? 0];
}

function actualByDate(records: TeacherTeachingActualRecord[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const record of records) {
    const titles = grouped.get(record.date) || [];
    if (!titles.includes(record.coursewareTitle)) titles.push(record.coursewareTitle);
    grouped.set(record.date, titles);
  }
  return grouped;
}

function ReadonlySemesterTable({
  semester,
  actualRecords,
}: {
  semester: TeacherTeachingPlanSemester;
  actualRecords: TeacherTeachingActualRecord[];
}) {
  const entries = new Map(semester.entries.map((entry) => [entry.date, entry]));
  const actuals = actualByDate(actualRecords);
  const dates = datesBetween(semester.startDate, semester.endDate).filter((date) => (
    entries.has(date) || actuals.has(date)
  ));

  return (
    <div className="overflow-x-auto rounded-lg border border-ink-100">
      <table className="min-w-[900px] w-full border-collapse text-sm">
        <thead className="bg-mist/80 text-left text-xs font-medium text-ink-600">
          <tr>
            <th className="w-32 px-3 py-2.5">日期</th>
            <th className="w-24 px-3 py-2.5">星期</th>
            <th className="min-w-48 px-3 py-2.5">备注</th>
            <th className="min-w-64 px-3 py-2.5">教学计划</th>
            <th className="min-w-64 px-3 py-2.5">实际教学</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {dates.length === 0 ? (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-400">该学期没有已填写或实际教学记录。</td></tr>
          ) : dates.map((date) => {
            const entry = entries.get(date);
            const actual = actuals.get(date) || [];
            return (
              <tr key={date} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 font-medium text-ink-800">{date}</td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-500">{weekdayLabel(date)}</td>
                <td className="whitespace-pre-wrap px-3 py-3 text-ink-700">{entry?.note || "—"}</td>
                <td className="whitespace-pre-wrap px-3 py-3 text-ink-700">{entry?.plan || "—"}</td>
                <td className="px-3 py-3 text-ink-700">{actual.length ? actual.join("、") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TeachingPlanPanel({ plan, loading, saving, onSave }: TeachingPlanPanelProps) {
  const current = plan?.current;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [entries, setEntries] = useState<TeacherTeachingPlanEntry[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState("");

  useEffect(() => {
    if (!current) return;
    setStartDate(current.startDate);
    setEndDate(current.endDate);
    setEntries(current.entries);
    setShowPast(false);
  }, [current]);

  useEffect(() => {
    if (!plan?.history.length) {
      setSelectedHistoryId("");
      return;
    }
    setSelectedHistoryId((value) => (
      plan.history.some((item) => item.id === value) ? value : plan.history[0].id
    ));
  }, [plan?.history]);

  const dateValues = useMemo(() => datesBetween(startDate, endDate), [endDate, startDate]);
  const today = localDateValue();
  const hasPast = dateValues.some((date) => date < today);
  const visibleDates = showPast ? dateValues : dateValues.filter((date) => date >= today);
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.date, entry])), [entries]);
  const actuals = useMemo(() => actualByDate(plan?.actualRecords || []), [plan?.actualRecords]);
  const selectedHistory = plan?.history.find((item) => item.id === selectedHistoryId);
  const rangeChanged = Boolean(current && (current.startDate !== startDate || current.endDate !== endDate));

  const updateEntry = (date: string, field: "note" | "plan", value: string) => {
    setEntries((items) => {
      const previous = items.find((item) => item.date === date) || { date, note: "", plan: "" };
      const next = { ...previous, [field]: value };
      const remaining = items.filter((item) => item.date !== date);
      if (!next.note.trim() && !next.plan.trim()) return remaining;
      return [...remaining, next].sort((left, right) => left.date.localeCompare(right.date));
    });
  };

  if (loading) {
    return <Card className="p-8 text-center text-sm text-ink-400">教学计划加载中...</Card>;
  }
  if (!current || !plan) {
    return <Card className="p-8 text-center text-sm text-ink-400">教学计划暂不可用。</Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-ink-900">教学计划</h2>
              <p className="mt-1 text-xs text-ink-500">
                配置本学期起止日期并逐日填写计划。一体机连续展示同一课件满 30 分钟后，会自动写入当天“实际教学”。
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="gold"
            disabled={saving || dateValues.length === 0}
            onClick={() => onSave(
              startDate,
              endDate,
              entries.filter((entry) => entry.date >= startDate && entry.date <= endDate),
            )}
          >
            <Save className="h-3.5 w-3.5" />{saving ? "保存中..." : "保存教学计划"}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Input label="本学期开始日期" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <Input label="本学期结束日期" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        {rangeChanged && (
          <p className="mt-2 text-xs text-amber-700">保存新的学期起止日期后，当前计划会自动进入“历史教学计划”。</p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            <div className="font-medium text-ink-900">{startDate} 至 {endDate}</div>
            <div className="mt-1 text-xs text-ink-400">默认只显示今天及以后的日期；备注和教学计划可直接编辑。</div>
          </div>
          {hasPast && (
            <Button variant="outline" size="sm" onClick={() => setShowPast((value) => !value)} aria-expanded={showPast}>
              {showPast ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showPast ? "收起之前日期" : "展开之前日期"}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-mist/70 text-left text-xs font-medium text-ink-600">
              <tr>
                <th className="w-32 px-3 py-2.5">日期</th>
                <th className="w-24 px-3 py-2.5">星期</th>
                <th className="min-w-52 px-3 py-2.5">备注</th>
                <th className="min-w-72 px-3 py-2.5">教学计划</th>
                <th className="min-w-72 px-3 py-2.5">实际教学</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {visibleDates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-400">
                    {dateValues.length === 0 ? "请设置有效的学期起止日期。" : "本学期已没有今天及以后的日期，可展开之前日期查看。"}
                  </td>
                </tr>
              ) : visibleDates.map((date) => {
                const entry = entryMap.get(date);
                const actual = actuals.get(date) || [];
                const isToday = date === today;
                return (
                  <tr key={date} className={`align-top ${isToday ? "bg-gold-50/40" : ""}`}>
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-ink-800">
                      <div className="flex items-center gap-2">{date}{isToday && <Badge variant="amber">今天</Badge>}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-ink-500">{weekdayLabel(date)}</td>
                    <td className="px-3 py-2">
                      <textarea
                        aria-label={`备注 ${date}`}
                        value={entry?.note || ""}
                        onChange={(event) => updateEntry(date, "note", event.target.value)}
                        placeholder="备注"
                        maxLength={500}
                        rows={2}
                        className="w-full resize-y rounded-md border border-ink-150 bg-paper px-2.5 py-2 text-sm text-ink-800 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <textarea
                        aria-label={`教学计划 ${date}`}
                        value={entry?.plan || ""}
                        onChange={(event) => updateEntry(date, "plan", event.target.value)}
                        placeholder="填写当天教学计划"
                        maxLength={2000}
                        rows={2}
                        className="w-full resize-y rounded-md border border-ink-150 bg-paper px-2.5 py-2 text-sm text-ink-800 outline-none transition focus:border-gold-400 focus:ring-2 focus:ring-gold-100"
                      />
                    </td>
                    <td className="px-3 py-3 text-ink-700">
                      {actual.length ? (
                        <div className="space-y-1.5">
                          {actual.map((title) => <div key={title}>{title}</div>)}
                          <div className="text-[11px] text-ink-400">由教室一体机自动记录</div>
                        </div>
                      ) : <span className="text-ink-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {plan.history.length > 0 && (
        <Card className="p-5">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
          >
            <span className="flex items-center gap-2 font-medium text-ink-900">
              <History className="h-4 w-4 text-ink-500" />历史教学计划
              <Badge variant="ink">{plan.history.length}</Badge>
            </span>
            {historyOpen ? <ChevronUp className="h-4 w-4 text-ink-400" /> : <ChevronDown className="h-4 w-4 text-ink-400" />}
          </button>
          {historyOpen && selectedHistory && (
            <div className="mt-4 border-t border-ink-100 pt-4">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <label className="text-sm font-medium text-ink-700">
                  <span className="mb-1.5 block text-xs text-ink-500">历史学期</span>
                  <select
                    aria-label="历史学期"
                    value={selectedHistoryId}
                    onChange={(event) => setSelectedHistoryId(event.target.value)}
                    className="min-w-64 rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-800"
                  >
                    {plan.history.map((semester) => (
                      <option key={semester.id} value={semester.id}>{semester.startDate} 至 {semester.endDate}</option>
                    ))}
                  </select>
                </label>
                <div className="text-xs text-ink-400">历史计划只读显示。</div>
              </div>
              <ReadonlySemesterTable semester={selectedHistory} actualRecords={plan.actualRecords} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
