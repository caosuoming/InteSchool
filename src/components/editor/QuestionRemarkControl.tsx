import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import type { Question } from "@/types";

export function QuestionRemarkControl({
  question,
  onUpdated,
  className = "",
}: {
  question: Question;
  onUpdated?: (question: Question) => void;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAdding(false);
    setContent("");
  }, [question.id]);

  const remarks = question.remarks || [];
  const legacyRemark = remarks.length === 0 ? question.remark.trim() : "";

  const addRemark = async () => {
    const nextContent = content.trim();
    if (!nextContent) return;

    setSaving(true);
    try {
      const remark = await questionService.addRemark(question.id, nextContent);
      const updated = await questionService.getQuestion(question.id);
      onUpdated?.(updated || {
        ...question,
        remark: remark.content,
        remarks: [...remarks, remark],
        updatedAt: remark.updatedAt,
      });
      setContent("");
      setAdding(false);
      toast.success("备注已添加");
    } catch (error) {
      toast.error("添加备注失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium text-ink-500">题目备注</div>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3" />
            添加备注
          </Button>
        )}
      </div>

      {remarks.length === 0 && !legacyRemark && !adding ? (
        <div className="text-[11px] leading-5 text-ink-400">暂无备注</div>
      ) : remarks.length > 0 || legacyRemark ? (
        <div className="space-y-1.5">
          {[...remarks].reverse().map((remark) => (
            <div
              key={remark.id}
              className="rounded-md border border-ink-100 bg-ink-50/50 px-2 py-1.5 text-[11px] leading-5 text-ink-600 whitespace-pre-wrap"
            >
              {remark.content}
            </div>
          ))}
          {legacyRemark && (
            <div className="rounded-md border border-ink-100 bg-ink-50/50 px-2 py-1.5 text-[11px] leading-5 text-ink-600 whitespace-pre-wrap">
              {legacyRemark}
            </div>
          )}
        </div>
      ) : null}

      {adding && (
        <div className="mt-2 space-y-2">
          <Textarea
            aria-label="新增题目备注"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="输入备注内容..."
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setContent("");
              }}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              variant="gold"
              size="sm"
              onClick={() => void addRemark()}
              loading={saving}
              disabled={!content.trim()}
            >
              <Save className="h-3 w-3" />
              添加
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
