import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/stores/ui";
import { rpcCall } from "@/services/api";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionDuplicateReviewModal } from "@/components/extract/QuestionDuplicateReviewModal";
import type { DuplicateQuestionMergeFields, Question } from "@/types";

type Kind = "library" | "student";
type Repeat = "once" | "daily" | "weekend";
interface Schedule { id: string; kind: Kind; repeat: Repeat; enabled: boolean; nextRunAt: string | null; lastRunAt?: string; runStatus?: "queued" | "running" | "failed" }
interface CandidateQuestion extends Pick<Question, "id" | "stem" | "options" | "answer" | "analysis" | "summary" | "subject"> {
  sources: string[];
}
interface Candidate {
  id: string; kind: Kind; leftQuestion: CandidateQuestion | null; rightQuestion: CandidateQuestion | null;
  similarity: number; studentCount?: number;
}

function CandidateQuestionPreview({ question }: { question: CandidateQuestion | null }) {
  if (!question) return <p className="text-ink-500">题目已删除</p>;
  return (
    <div className="space-y-1.5">
      <MathHtml className="whitespace-pre-wrap">{question.stem}</MathHtml>
      {question.options?.map((option, index) => (
        <div className="flex gap-2" key={index}>
          <span className="font-semibold">{String.fromCharCode(65 + index)}.</span>
          <MathHtml className="flex-1 whitespace-pre-wrap">{option}</MathHtml>
        </div>
      ))}
    </div>
  );
}

function CandidateQuestionDetails({ question }: { question: CandidateQuestion | null }) {
  if (!question) return null;
  return (
    <div className="space-y-2 text-xs">
      <div><h5 className="font-semibold">来源文档</h5>
        {question.sources.length ? question.sources.map((source) => <p key={source}>{source}</p>)
          : <p className="text-ink-500">未关联来源文档</p>}
      </div>
      {(["answer", "analysis", "summary"] as const).map((field) => (
        <div key={field}>
          <h5 className="font-semibold">{({ answer: "答案", analysis: "解析", summary: "总结" } as const)[field]}</h5>
          <MathHtml className="whitespace-pre-wrap">{question[field] || "（无）"}</MathHtml>
        </div>
      ))}
    </div>
  );
}
const kindLabel: Record<Kind, string> = { library: "本库重题搜索", student: "同一题检索" };
const repeatLabel: Record<Repeat, string> = { once: "执行一次", daily: "每天执行", weekend: "每周末执行" };
const displayDate = (date?: string | null) => date ? new Date(date).toLocaleString("zh-CN") : "无";

export function ScheduledDuplicatePanel({ teacherId }: { teacherId: string }) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Schedule[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [kind, setKind] = useState<Kind>("library");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mergeCandidate, setMergeCandidate] = useState<Candidate | null>(null);
  const completedTasks = tasks.filter((task) => !task.enabled && task.lastRunAt && !task.runStatus);
  const activeTasks = tasks.filter((task) => !completedTasks.includes(task));
  const sortedCandidates = [...candidates].sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id));
  const refresh = useCallback(async () => {
    const [nextTasks, nextCandidates] = await Promise.all([
      rpcCall<Schedule[]>("scheduledDuplicate", "listSchedules", [teacherId]),
      rpcCall<Candidate[]>("scheduledDuplicate", "listCandidates", [teacherId]),
    ]);
    setTasks(nextTasks);
    setCandidates(nextCandidates);
  }, [teacherId]);
  useEffect(() => { void refresh().catch(() => toast.error("预约任务加载失败")); }, [refresh]);
  const scanning = tasks.some((task) => task.runStatus === "queued" || task.runStatus === "running");
  useEffect(() => {
    if (!scanning && !open) return;
    let stopped = false;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const nextTasks = await rpcCall<Schedule[]>("scheduledDuplicate", "listSchedules", [teacherId]);
        if (stopped) return;
        const completed = nextTasks.some((next) => tasks.find((task) => task.id === next.id)?.lastRunAt !== next.lastRunAt);
        if (completed) {
          const nextCandidates = await rpcCall<Candidate[]>("scheduledDuplicate", "listCandidates", [teacherId]);
          if (stopped) return;
          setCandidates(nextCandidates);
        }
        setTasks(nextTasks);
      } catch { /* Retry transient failures on the next poll. */ }
      finally { polling = false; }
    }, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [scanning, open, teacherId, tasks]);
  async function execute(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setBusy(true);
    try { await action(); await refresh(); toast.success(success); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : "操作失败"); return false; }
    finally { setBusy(false); }
  }
  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const renderTask = (task: Schedule) => <div key={task.id} className="flex items-center justify-between gap-2 border rounded-md p-3 text-sm">
              <div><div className="font-medium">{kindLabel[task.kind]} · {repeatLabel[task.repeat]}</div>
                <div className="text-ink-500">{task.enabled ? `下次执行：${displayDate(task.nextRunAt)}` : "已结束"} · 上次执行：{displayDate(task.lastRunAt)}</div>
                {task.runStatus && <div role="status" className="text-ink-500">{({ queued: "排队中", running: "后台检索中", failed: "检索失败，可重试" })[task.runStatus]}</div>}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy || task.runStatus === "queued" || task.runStatus === "running"} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "startSchedule", [teacherId, task.id]), "已提交后台检索，可继续使用平台")}><Play className="w-4 h-4" /> 立即执行</Button>
                {task.enabled && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "cancelSchedule", [teacherId, task.id]), "已停止任务")}><Trash2 className="w-4 h-4" /> 停止</Button>}
              </div>
            </div>;
  return (
    <>
      <Card>
        <CardHeader title="预约定时任务" action={<Button size="sm" onClick={() => { setOpen(true); void refresh().catch(() => toast.error("预约任务加载失败")); }}><CalendarClock className="w-4 h-4" /> 管理任务</Button>} />
        <div className="px-4 pb-4 text-sm text-ink-600">
          {tasks.filter((t) => t.enabled).length} 个运行中任务 · {candidates.length} 组待确认题目
          {candidates.length > 0 && <button className="ml-3 text-gold-600 hover:underline" onClick={() => setOpen(true)}>处理待办</button>}
        </div>
      </Card>
      <Modal open={open && !mergeCandidate} onClose={() => setOpen(false)} title="预约定时任务" description="定时扫描并人工确认相似题目；确认过的题目对不会重复提醒。" size="lg">
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">任务类型
              <select aria-label="任务类型" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="mt-1 w-full border rounded-md p-2 bg-paper">
                {Object.entries(kindLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm">循环
              <select aria-label="循环" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className="mt-1 w-full border rounded-md p-2 bg-paper">
                {Object.entries(repeatLabel).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm">预约时刻
              <input aria-label="预约时刻" type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border rounded-md p-2 bg-paper" />
            </label>
          </div>
          <Button disabled={!time || busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "createSchedule", [teacherId, kind, repeat, new Date(time).toISOString(), new Date(time).getTimezoneOffset()]), "预约创建成功")}>创建预约</Button>
          <div className="space-y-2">
            <h4 className="font-medium">已创建任务</h4>
            {tasks.length === 0 && <p className="text-sm text-ink-500">暂无任务</p>}
            {activeTasks.map(renderTask)}
            {completedTasks.length > 0 && <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-medium text-ink-600">已完成任务（{completedTasks.length}）</summary>
              {completedTasks.map(renderTask)}
            </details>}
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">待确认重题（{candidates.length}，按相似度降序）</h4>
              {candidates.length > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
                if (!window.confirm(`取消剩余 ${candidates.length} 组题目的确认？已确认的结果将保留，未确认的题目对会在下次查重时重新出现。`)) return;
                void execute(() => rpcCall("scheduledDuplicate", "cancelPendingCandidates", [teacherId]), "已取消剩余确认，下次查重仍可发现这些题目");
              }}>取消剩余确认</Button>}
            </div>
            {candidates.length === 0 && <p className="text-sm text-ink-500">暂无待确认题目</p>}
            {sortedCandidates.map((item) => <div key={item.id} className="border rounded-lg p-3 space-y-2 text-sm">
              <div className="font-medium">{kindLabel[item.kind]} · 相似度 {(item.similarity * 100).toFixed(0)}% {item.studentCount ? `· 涉及 ${item.studentCount} 条作答` : ""}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="bg-mist p-3 rounded-md"><div className="text-ink-500 mb-1">我的题库</div><CandidateQuestionPreview question={item.leftQuestion} /></div>
                <div className="bg-mist p-3 rounded-md"><div className="text-ink-500 mb-1">待比对题目</div><CandidateQuestionPreview question={item.rightQuestion} /></div>
              </div>
              {expandedIds.has(item.id) && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="border rounded-md p-3"><CandidateQuestionDetails question={item.leftQuestion} /></div>
                  <div className="border rounded-md p-3"><CandidateQuestionDetails question={item.rightQuestion} /></div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => toggleExpanded(item.id)}>
                  {expandedIds.has(item.id) ? "收起详情" : "展开来源、答案、解析和总结"}
                </Button>
                {item.kind === "library" ? <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "keep"]), "已保留两题")}>保留</Button>
                  <Button size="sm" disabled={busy || !item.leftQuestion || !item.rightQuestion} onClick={() => setMergeCandidate(item)}>合并</Button>
                </> : <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "add"]), "已新增至题库")}>新增</Button>
                  <Button size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "same"]), "已认定同一题")}>认定同一题</Button>
                </>}
              </div>
            </div>)}
          </div>
        </div>
      </Modal>
      {mergeCandidate?.leftQuestion && mergeCandidate.rightQuestion && (
        <QuestionDuplicateReviewModal
          mode="merge"
          items={[{
            id: mergeCandidate.id,
            similarity: mergeCandidate.similarity,
            existing: mergeCandidate.leftQuestion,
            incoming: mergeCandidate.rightQuestion,
            existingSources: mergeCandidate.leftQuestion.sources,
            incomingSources: mergeCandidate.rightQuestion.sources,
            canMerge: true,
          }]}
          existingLabel="题目一"
          incomingLabel="题目二"
          onClose={() => setMergeCandidate(null)}
          onConfirm={(resolutions) => {
            const fields: DuplicateQuestionMergeFields = resolutions[mergeCandidate.id].fields;
            void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, mergeCandidate.id, "merge", fields]), "已合并并同步来源文档")
              .then((success) => { if (success) setMergeCandidate(null); });
          }}
        />
      )}
    </>
  );
}
