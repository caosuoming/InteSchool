import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { toast } from "@/stores/ui";
import { rpcCall } from "@/services/api";

type Kind = "library" | "student";
type Repeat = "once" | "daily" | "weekend";
interface Schedule { id: string; kind: Kind; repeat: Repeat; enabled: boolean; nextRunAt: string | null; lastRunAt?: string }
interface Candidate { id: string; kind: Kind; leftStem: string; rightStem: string; similarity: number; studentCount?: number }
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
  const refresh = useCallback(async () => {
    const [nextTasks, nextCandidates] = await Promise.all([
      rpcCall<Schedule[]>("scheduledDuplicate", "listSchedules", [teacherId]),
      rpcCall<Candidate[]>("scheduledDuplicate", "listCandidates", [teacherId]),
    ]);
    setTasks(nextTasks);
    setCandidates(nextCandidates);
  }, [teacherId]);
  useEffect(() => { void refresh().catch(() => toast.error("预约任务加载失败")); }, [refresh]);
  async function execute(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); await refresh(); toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }
  return (
    <>
      <Card>
        <CardHeader title="预约定时任务" action={<Button size="sm" onClick={() => setOpen(true)}><CalendarClock className="w-4 h-4" /> 管理任务</Button>} />
        <div className="px-4 pb-4 text-sm text-ink-600">
          {tasks.filter((t) => t.enabled).length} 个运行中任务 · {candidates.length} 组待确认题目
          {candidates.length > 0 && <button className="ml-3 text-gold-600 hover:underline" onClick={() => setOpen(true)}>处理待办</button>}
        </div>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="预约定时任务" description="定时扫描并人工确认相似题目；确认过的题目对不会重复提醒。" size="lg">
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
            {tasks.map((task) => <div key={task.id} className="flex items-center justify-between gap-2 border rounded-md p-3 text-sm">
              <div><div className="font-medium">{kindLabel[task.kind]} · {repeatLabel[task.repeat]}</div>
                <div className="text-ink-500">{task.enabled ? `下次执行：${displayDate(task.nextRunAt)}` : "已结束"} · 上次执行：{displayDate(task.lastRunAt)}</div></div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void execute(async () => {
                  const count = await rpcCall<number>("scheduledDuplicate", "runSchedule", [teacherId, task.id]);
                  toast.info(`新增 ${count} 组待确认题目`);
                }, "扫描完成")}><Play className="w-4 h-4" /> 立即执行</Button>
                {task.enabled && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "cancelSchedule", [teacherId, task.id]), "已停止任务")}><Trash2 className="w-4 h-4" /> 停止</Button>}
              </div>
            </div>)}
          </div>
          <div className="space-y-3">
            <h4 className="font-medium">待确认重题（{candidates.length}）</h4>
            {candidates.length === 0 && <p className="text-sm text-ink-500">暂无待确认题目</p>}
            {candidates.map((item) => <div key={item.id} className="border rounded-lg p-3 space-y-2 text-sm">
              <div className="font-medium">{kindLabel[item.kind]} · 相似度 {(item.similarity * 100).toFixed(0)}% {item.studentCount ? `· 涉及 ${item.studentCount} 条作答` : ""}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="bg-mist p-3 rounded-md"><div className="text-ink-500 mb-1">我的题库</div><div className="whitespace-pre-wrap break-words">{item.leftStem}</div></div>
                <div className="bg-mist p-3 rounded-md"><div className="text-ink-500 mb-1">待比对题目</div><div className="whitespace-pre-wrap break-words">{item.rightStem}</div></div>
              </div>
              <div className="flex gap-2 justify-end">
                {item.kind === "library" ? <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "keep"]), "已保留两题")}>保留</Button>
                  <Button size="sm" disabled={busy} onClick={() => { if (window.confirm("确定将右侧重复题合并进左侧题目？此操作不可撤销。")) void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "merge"]), "已合并"); }}>合并</Button>
                </> : <>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "add"]), "已新增至题库")}>新增</Button>
                  <Button size="sm" disabled={busy} onClick={() => void execute(() => rpcCall("scheduledDuplicate", "resolveCandidate", [teacherId, item.id, "same"]), "已认定同一题")}>认定同一题</Button>
                </>}
              </div>
            </div>)}
          </div>
        </div>
      </Modal>
    </>
  );
}
