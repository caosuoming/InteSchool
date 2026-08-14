import { useEffect, useMemo, useState } from "react";
import { Copy, History, Search, Send, SlidersHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { gradeService } from "@/services/grade";
import { toast } from "@/stores/ui";
import type {
  GradeExam,
  GradeScoreAdjustmentKind,
  GradeScoreRecord,
} from "@/types";

interface GradeExamAdjustmentPanelProps {
  exam: GradeExam;
  onExamUpdated: (exam: GradeExam) => void;
}

function scoreText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function displayScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function ScoreEditor({
  label,
  value,
  disabled,
  hint,
  onCommit,
}: {
  label: string;
  value: number | null | undefined;
  disabled: boolean;
  hint?: string;
  onCommit: (value: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(scoreText(value));

  useEffect(() => {
    setDraft(scoreText(value));
  }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && !Number.isFinite(next)) {
      toast.error("请输入有效成绩");
      setDraft(scoreText(value));
      return;
    }
    const current = typeof value === "number" ? value : null;
    if (current === next) return;
    try {
      await onCommit(next);
    } catch {
      setDraft(scoreText(value));
    }
  };

  return (
    <Input
      label={label}
      type="number"
      step="0.01"
      min={-1000}
      max={1000}
      value={draft}
      disabled={disabled}
      hint={hint}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function studentLabel(record: GradeScoreRecord): string {
  const suffix = [record.className, record.studentNo].filter(Boolean).join(" · ");
  return suffix ? `${record.studentName} · ${suffix}` : record.studentName;
}

export function GradeExamAdjustmentPanel({ exam, onExamUpdated }: GradeExamAdjustmentPanelProps) {
  const [examName, setExamName] = useState(exam.name);
  const [examDate, setExamDate] = useState(exam.examDate || "");
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(exam.records[0]?.studentId || "");
  const [studentSearch, setStudentSearch] = useState("");
  const [savingScore, setSavingScore] = useState<string | null>(null);
  const [publicationSaving, setPublicationSaving] = useState(false);
  const published = Boolean(exam.publication);
  const shareUrl = exam.publication
    ? `${window.location.origin}/grade-reports/${exam.publication.shareToken}`
    : "";

  useEffect(() => {
    setExamName(exam.name);
    setExamDate(exam.examDate || "");
  }, [exam.id, exam.name, exam.examDate]);

  useEffect(() => {
    if (!exam.records.some((record) => record.studentId === selectedStudentId)) {
      setSelectedStudentId(exam.records[0]?.studentId || "");
    }
  }, [exam.records, selectedStudentId]);

  const records = useMemo(
    () => [...exam.records].sort((left, right) =>
      left.className.localeCompare(right.className, "zh-CN", { numeric: true })
      || left.studentName.localeCompare(right.studentName, "zh-CN")
      || left.studentNo.localeCompare(right.studentNo, "zh-CN")),
    [exam.records],
  );
  const selectedRecord = records.find((record) => record.studentId === selectedStudentId) || null;
  const searchResults = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return [];
    return records.filter((record) =>
      record.studentName.toLowerCase().includes(keyword)
      || record.studentNo.toLowerCase().includes(keyword)
      || record.className.toLowerCase().includes(keyword),
    ).slice(0, 20);
  }, [records, studentSearch]);
  const history = useMemo(
    () => [...(exam.scoreAdjustments || [])].reverse(),
    [exam.scoreAdjustments],
  );

  const saveMetadata = async () => {
    if (!examName.trim()) {
      toast.error("请填写考试名称");
      return;
    }
    setMetadataSaving(true);
    try {
      const updated = await gradeService.updateExamMetadata(exam.id, {
        name: examName,
        examDate: examDate || undefined,
      });
      onExamUpdated(updated);
      toast.success("考试信息已保存", "后续统计表表头已同步更新");
    } catch (error) {
      toast.error("保存考试信息失败", error instanceof Error ? error.message : undefined);
    } finally {
      setMetadataSaving(false);
    }
  };

  const publishResults = async () => {
    setPublicationSaving(true);
    try {
      const updated = await gradeService.publishExamResults(exam.id);
      onExamUpdated(updated);
      toast.success("成绩已发布", "任课教师和班主任可按权限查看，分享链接已生成");
    } catch (error) {
      toast.error("发布成绩失败", error instanceof Error ? error.message : undefined);
    } finally {
      setPublicationSaving(false);
    }
  };

  const unpublishResults = async () => {
    setPublicationSaving(true);
    try {
      const updated = await gradeService.unpublishExamResults(exam.id);
      onExamUpdated(updated);
      toast.success("已撤回发布", "原分享链接已失效，可以继续修改后重新发布");
    } catch (error) {
      toast.error("撤回发布失败", error instanceof Error ? error.message : undefined);
    } finally {
      setPublicationSaving(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("分享链接已复制");
    } catch {
      toast.error("复制失败", "请手动复制分享链接");
    }
  };

  const saveScore = async (
    subject: string,
    kind: GradeScoreAdjustmentKind,
    value: number | null,
  ) => {
    if (!selectedRecord) return;
    const key = `${selectedRecord.studentId}:${subject}:${kind}`;
    setSavingScore(key);
    try {
      const updated = await gradeService.adjustExamScore(
        exam.id,
        selectedRecord.studentId,
        subject,
        kind,
        value,
      );
      onExamUpdated(updated);
      toast.success("成绩微调已保存", `${selectedRecord.studentName} · ${subject}`);
    } catch (error) {
      toast.error("成绩修改失败", error instanceof Error ? error.message : undefined);
      throw error;
    } finally {
      setSavingScore(null);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-ink-100 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-ink-900">考试信息与学生成绩微调</div>
            <div className="mt-0.5 text-xs text-ink-500">
              考试名称和时间会同步到后续统计表；成绩修改后自动重算赋分、总分与排名。
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-ink-100 bg-ink-50/40 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
              {published ? "成绩已发布" : "成绩尚未发布"}
              {exam.publication && (
                <span className="text-xs font-normal text-ink-400">
                  {new Date(exam.publication.publishedAt).toLocaleString("zh-CN")} · {exam.publication.publishedByName}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              发布后，任课教师仅查看任教学科和学生，班主任可查看本班全科；公开链接只展示四张聚合统计表。
            </div>
          </div>
          <Button
            variant={published ? "outline" : "gold"}
            onClick={() => void (published ? unpublishResults() : publishResults())}
            loading={publicationSaving}
          >
            {published ? <Undo2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {published ? "撤回发布" : "发布"}
          </Button>
        </div>
        {published && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input aria-label="成绩分享链接" value={shareUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" onClick={() => void copyShareUrl()}>
              <Copy className="h-4 w-4" />复制链接
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 border-b border-ink-100 p-5 md:grid-cols-[minmax(0,1fr)_13rem_auto] md:items-end">
        <Input
          label="考试名称"
          value={examName}
          disabled={published}
          onChange={(event) => setExamName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveMetadata();
          }}
        />
        <Input
          label="考试时间"
          type="date"
          value={examDate}
          disabled={published}
          onChange={(event) => setExamDate(event.target.value)}
        />
        <Button variant="outline" onClick={() => void saveMetadata()} loading={metadataSaving} disabled={published}>
          保存考试信息
        </Button>
      </div>

      <div className="space-y-4 border-b border-ink-100 p-5">
        <div>
          <div className="font-medium text-ink-900">学生成绩微调</div>
          <div className="mt-0.5 text-xs text-ink-500">
            {published
              ? "当前成绩已发布；请先撤回发布，再继续修改学生成绩。"
              : "可下拉选择或搜索学生。修改分数后失焦即保存；赋分留空表示恢复按原始分和当前规则自动计算。"}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Select
            label="选择学生"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            placeholder="选择学生"
            options={records.map((record) => ({ value: record.studentId, label: studentLabel(record) }))}
          />
          <div className="relative">
            <Input
              label="搜索学生"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="输入姓名、学号或班级"
              className="pl-9"
            />
            <Search className="pointer-events-none absolute left-3 top-[2.65rem] h-4 w-4 text-ink-400" />
            {studentSearch.trim() && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-ink-200 bg-paper p-1 shadow-lg">
                {searchResults.map((record) => (
                  <button
                    key={record.studentId}
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(record.studentId);
                      setStudentSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-ink-50"
                  >
                    <span className="text-sm font-medium text-ink-800">{record.studentName}</span>
                    <span className="text-xs text-ink-400">{record.className} · {record.studentNo || "无学号"}</span>
                  </button>
                ))}
                {searchResults.length === 0 && (
                  <div className="px-3 py-4 text-center text-xs text-ink-400">未找到学生</div>
                )}
              </div>
            )}
          </div>
        </div>

        {selectedRecord ? (
          <div
            aria-label="各科成绩"
            className="grid grid-flow-col auto-cols-[minmax(14rem,1fr)] gap-3 overflow-x-auto pb-1"
          >
            {exam.subjects.map((subject) => {
              const assignedConfigured = Object.prototype.hasOwnProperty.call(exam.settings.assignmentRules, subject)
                || selectedRecord.sourceAssignedScores?.[subject] !== undefined;
              const rawKey = `${selectedRecord.studentId}:${subject}:raw`;
              const assignedKey = `${selectedRecord.studentId}:${subject}:assigned`;
              return (
                <div key={subject} className="rounded-lg border border-ink-200 bg-ink-50/30 p-3">
                  <div className="mb-3 text-sm font-medium text-ink-800">{subject}</div>
                  <div className={assignedConfigured ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
                    <ScoreEditor
                      label={assignedConfigured ? "原始分" : "成绩"}
                      value={selectedRecord.scores[subject]}
                      disabled={published || savingScore !== null}
                      onCommit={(value) => saveScore(subject, "raw", value)}
                    />
                    {assignedConfigured && (
                      <ScoreEditor
                        label="赋分"
                        value={selectedRecord.assignedScores[subject]}
                        disabled={published || savingScore !== null}
                        hint={selectedRecord.sourceAssignedScores?.[subject] == null ? "当前为自动计算" : "当前为手工/导入赋分"}
                        onCommit={(value) => saveScore(subject, "assigned", value)}
                      />
                    )}
                  </div>
                  {(savingScore === rawKey || savingScore === assignedKey) && (
                    <div className="mt-2 text-[11px] text-ink-400">正在保存并重新计算…</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-ink-200 py-8 text-center text-sm text-ink-400">
            当前考试没有可修改的学生成绩
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3 text-sm font-medium text-ink-900">
          <History className="h-4 w-4 text-ink-500" />
          修改记录
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-400">暂无成绩微调记录</div>
        ) : (
          <div className="max-h-72 overflow-auto">
            <table className="min-w-[760px] w-full text-xs">
              <thead className="sticky top-0 bg-ink-50 text-ink-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">修改时间</th>
                  <th className="px-4 py-2.5 text-left font-medium">学生</th>
                  <th className="px-4 py-2.5 text-left font-medium">科目</th>
                  <th className="px-4 py-2.5 text-left font-medium">口径</th>
                  <th className="px-4 py-2.5 text-right font-medium">原值</th>
                  <th className="px-4 py-2.5 text-right font-medium">新值</th>
                  <th className="px-4 py-2.5 text-left font-medium">修改人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {history.map((item) => (
                  <tr key={item.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{new Date(item.changedAt).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink-800">{item.studentName}</div>
                      <div className="text-[11px] text-ink-400">{item.className} · {item.studentNo || "无学号"}</div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-ink-700">{item.subject}</td>
                    <td className="px-4 py-2.5 text-ink-500">{item.kind === "raw" ? "原始分" : "赋分"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{displayScore(item.previousValue)}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink-800">{displayScore(item.nextValue)}</td>
                    <td className="px-4 py-2.5 text-ink-600">{item.changedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
