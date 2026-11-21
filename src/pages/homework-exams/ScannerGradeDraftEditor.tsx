import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { scannerService, type ScannerPageRecord } from "@/services/scanner";
import type { ScannerGradingInput, ScannerGradingQuestion } from "@/lib/scanner-grading";
import { ScannerChoiceImageAssistant } from "./ScannerChoiceImageAssistant";

interface Props {
  record: ScannerPageRecord;
  onUpdated: (record: ScannerPageRecord) => void;
}

export function ScannerGradeDraftEditor({ record, onUpdated }: Props) {
  const [questions, setQuestions] = useState<ScannerGradingQuestion[]>([]);
  const [entries, setEntries] = useState<Record<string, ScannerGradingInput>>(() => Object.fromEntries(
    (record.gradingEntries || []).map((entry) => [entry.questionId, {
      questionId: entry.questionId, observedMark: entry.observedMark,
      observedBox: entry.observedBox, confirmedScore: entry.confirmedScore,
    }]),
  ));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assistedQuestionId, setAssistedQuestionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    scannerService.gradingQuestions(record.id).then((items) => {
      if (!active) return;
      setQuestions(items);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "题目加载失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [record.id]);

  const setField = (questionId: string, patch: Partial<ScannerGradingInput>) => {
    setEntries((previous) => ({
      ...previous,
      [questionId]: { questionId, observedMark: "", observedBox: "", confirmedScore: null, ...previous[questionId], ...patch },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const active = questions.filter((question) => {
        const entry = entries[question.id];
        return entry && (entry.observedMark.trim() || (entry.observedBox || "").trim() || entry.confirmedScore != null);
      }).map((question) => entries[question.id]);
      onUpdated(await scannerService.saveGradingDraft(record.id, active));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "评分草稿保存失败"); }
    finally { setSaving(false); }
  };

  const suggested = new Map((record.gradingEntries || []).map((entry) => [entry.questionId, entry]));

  return (
    <section className="w-full space-y-3 rounded-lg border border-ink-200 bg-mist p-3" aria-label="扫描评分复核草稿">
      <h4 className="text-sm font-semibold">逐题评分复核草稿</h4>
      <p className="text-xs text-ink-600">逐题查看原扫描图，选择题可框选填涂区域生成待核对候选；红笔批注仍需人工转录。图像候选需教师确认，人工核定分数也不会写入正式成绩。</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {loading ? <p className="text-xs">加载题目…</p> : questions.length === 0 ? <p className="text-xs">当前试卷暂无可评分题目</p> : (
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {questions.map((question) => {
            const current = entries[question.id] || { questionId: question.id, observedMark: "", observedBox: "", confirmedScore: null };
            const saved = suggested.get(question.id);
            return (
              <div key={question.id} className="space-y-1 rounded-md bg-paper p-2 text-xs">
                <div className="font-medium">第 {question.number} 题 · {question.kind === "choice" ? "选择" : question.kind === "fill" ? "填空" : "解答"} · 满分 {question.fullScore}</div>
                <div className="flex flex-wrap gap-2">
                  <label className="min-w-[9rem] flex-1">转录{question.kind === "choice" ? "选项（如 AC）" : question.kind === "fill" ? "红笔标记（× 或反斜杠）" : "红笔加减分（如 -2）"}
                    <input aria-label={`第${question.number}题红笔或选项`} value={current.observedMark} maxLength={100} onChange={(e) => setField(question.id, { observedMark: e.target.value })} className="mt-1 w-full rounded border border-ink-200 px-2 py-1" />
                  </label>
                  {question.kind === "essay" && <label className="min-w-[7rem] flex-1">右下角分数框（优先）
                    <input aria-label={`第${question.number}题右下角分数`} value={current.observedBox || ""} maxLength={100} onChange={(e) => setField(question.id, { observedBox: e.target.value })} className="mt-1 w-full rounded border border-ink-200 px-2 py-1" />
                  </label>}
                  <label className="w-24">人工核定分数
                    <input aria-label={`第${question.number}题人工核定分数`} type="number" min={0} max={question.fullScore} step="0.01" value={current.confirmedScore ?? ""} onChange={(e) => setField(question.id, { confirmedScore: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full rounded border border-ink-200 px-2 py-1" />
                  </label>
                </div>
                {question.kind === "choice" && record.qrCurrent !== false && (
                  <Button size="sm" variant="outline" onClick={() => setAssistedQuestionId((previous) => previous === question.id ? null : question.id)}>
                    {assistedQuestionId === question.id ? "收起选项图像辅助" : "从扫描图像辅助识别选项"}
                  </Button>
                )}
                {assistedQuestionId === question.id && record.qrCurrent !== false && (
                  <ScannerChoiceImageAssistant key={question.id} fileId={record.fileId} question={question}
                    onAdopt={(candidate) => { setField(question.id, { observedMark: candidate, confirmedScore: null }); setAssistedQuestionId(null); }} />
                )}
                {saved && <p className="text-ink-600">上次保存建议：{saved.suggestedScore === null ? "待人工判定" : `${saved.suggestedScore} 分`} · {saved.reason}</p>}
              </div>
            );
          })}
        </div>
      )}
      <Button size="sm" onClick={() => void save()} disabled={loading || saving || !questions.length || record.qrCurrent === false} loading={saving}>保存复核草稿</Button>
      {record.gradingUpdatedAt && <p className="text-xs text-ink-500">最后保存：{new Date(record.gradingUpdatedAt).toLocaleString("zh-CN")}（未发布成绩）{record.gradingRevisionCurrent === false ? " · 历史答题卡版本草稿，不可用于当前评分" : ""}</p>}
    </section>
  );
}
