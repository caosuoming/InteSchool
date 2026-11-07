import { useState } from "react";
import { CheckSquare } from "lucide-react";
import { analyticsService } from "@/services/analytics";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type Mode = "done" | "pending";

interface Props {
  documentId: string;
  questions: Array<{ id: string; number: number }>;
  disabled?: boolean;
  onApplied: () => Promise<void>;
}

export function DocumentQuestionCompletionBatch({ documentId, questions, disabled, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>("done");
  const [saving, setSaving] = useState(false);
  const uniqueQuestions = questions.filter((question, index) =>
    questions.findIndex((item) => item.id === question.id) === index);

  const openPicker = () => {
    setSelectedIds(new Set(uniqueQuestions.map((question) => question.id)));
    setMode("done");
    setOpen(true);
  };

  const apply = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try {
      const result = await analyticsService.batchSetDocumentQuestionStatus(
        documentId, Array.from(selectedIds), mode,
      );
      await onApplied();
      setOpen(false);
      toast.success("批量设置完成", mode === "done"
        ? `新增 ${result.created} 条已做记录，${result.excluded} 道题不再待做`
        : `清除 ${result.cleared} 条已做记录，${result.excluded} 道题不再待做`);
    } catch (error) {
      toast.error("批量设置失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={openPicker}
        disabled={disabled || uniqueQuestions.length === 0}>
        <CheckSquare className="w-3.5 h-3.5" /> 全部设为已做
      </Button>
      <Modal open={open} onClose={() => { if (!saving) setOpen(false); }}
        title="批量设置题目完成情况"
        description="选择要处理的题号，默认全选。未勾选题目将不再标记为待做；已有对错得分记录会保留。"
        size="md"
        footer={<>
          <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button variant="gold" loading={saving} onClick={() => void apply()}>
            确认{mode === "done" ? "设为已做" : "设为待做"}（{selectedIds.size} 题）
          </Button>
        </>}
      >
        <fieldset className="mb-4 flex flex-wrap items-center gap-4">
          <legend className="mb-2 text-sm font-medium text-ink-700">操作方式</legend>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="radio" name="document-batch-status" checked={mode === "done"}
              onChange={() => setMode("done")} />全部设为已做
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="radio" name="document-batch-status" checked={mode === "pending"}
              onChange={() => setMode("pending")} />全部设为待做
          </label>
        </fieldset>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-700">题目编号（已选 {selectedIds.size}/{uniqueQuestions.length}）</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set(uniqueQuestions.map((item) => item.id)))}>全选</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>清空</Button>
          </div>
        </div>
        <div role="group" aria-label="题目编号" className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {uniqueQuestions.map((question) => (
            <label key={question.id} className="flex items-center gap-2 rounded-md border border-ink-200 p-2 text-sm text-ink-700 cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(question.id)}
                onChange={(event) => setSelectedIds((previous) => {
                  const next = new Set(previous);
                  if (event.target.checked) next.add(question.id);
                  else next.delete(question.id);
                  return next;
                })} />
              第 {question.number} 题
            </label>
          ))}
        </div>
        {mode === "pending" && (
          <p className="mt-3 text-xs text-ink-500">“待做”将清除这些题目的普通“已做”标记，保留已经录入的正确、错误或部分得分记录。</p>
        )}
      </Modal>
    </>
  );
}
