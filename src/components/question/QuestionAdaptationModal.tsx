import { useEffect, useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import type { Question } from "@/types";

interface QuestionAdaptationModalProps {
  open: boolean;
  question: Question | null;
  onClose: () => void;
  onCreated: (question: Question) => void;
}

export function QuestionAdaptationModal({
  open,
  question,
  onClose,
  onCreated,
}: QuestionAdaptationModalProps) {
  const [stem, setStem] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && question) setStem(question.stem);
  }, [open, question]);

  const canSave = useMemo(() => {
    if (!question) return false;
    const next = stem.trim();
    return Boolean(next) && next !== question.stem.trim();
  }, [question, stem]);

  const handleSave = async () => {
    if (!question || !canSave) return;
    setSaving(true);
    try {
      const created = await questionService.adaptQuestion(question.id, stem.trim());
      toast.success("改编题目已加入题库");
      onCreated(created);
    } catch (error) {
      toast.error("题目改编失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="题目改编"
      description="只修改题干；确认后将保留原题全部属性并新增一道题。"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="gold" onClick={handleSave} loading={saving} disabled={!canSave}>
            <WandSparkles className="h-4 w-4" />
            改变新题确认
          </Button>
        </div>
      )}
    >
      {question && (
        <div className="space-y-4">
          <div className="rounded-lg border border-ink-100 bg-mist/40 p-3">
            <div className="mb-1 text-xs font-medium text-ink-500">原题题干</div>
            <MathHtml className="text-sm leading-relaxed text-ink-800">{question.stem}</MathHtml>
          </div>
          <Textarea
            label="改编后的题干"
            value={stem}
            onChange={(event) => setStem(event.target.value)}
            rows={7}
            autoFocus
            placeholder="修改题干后才能确认新增"
          />
          <div className="text-xs text-ink-400">
            题型、选项、答案、解析、总结、板书、链接、视频、章节、知识点及其他属性均沿用原题。
          </div>
        </div>
      )}
    </Modal>
  );
}

export default QuestionAdaptationModal;
