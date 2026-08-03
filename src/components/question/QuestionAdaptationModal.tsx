import { useEffect, useMemo, useState } from "react";
import { WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import type { Question, QuestionAdaptationInput } from "@/types";

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
  const [answer, setAnswer] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !question) return;
    setStem(question.stem);
    setAnswer(question.answer);
    setAnalysis(question.analysis);
    setSummary(question.summary || "");
  }, [open, question]);

  const canSave = useMemo(() => {
    if (!question) return false;
    const next: QuestionAdaptationInput = {
      stem: stem.trim(),
      answer: answer.trim(),
      analysis: analysis.trim(),
      summary: summary.trim(),
    };
    return Object.values(next).every(Boolean)
      && next.stem !== question.stem.trim()
      && next.answer !== question.answer.trim()
      && next.analysis !== question.analysis.trim()
      && next.summary !== (question.summary || "").trim();
  }, [analysis, answer, question, stem, summary]);

  const handleSave = async () => {
    if (!question || !canSave) return;
    setSaving(true);
    try {
      const created = await questionService.adaptQuestion(question.id, {
        stem: stem.trim(),
        answer: answer.trim(),
        analysis: analysis.trim(),
        summary: summary.trim(),
      });
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
      size="xl"
      title="题目改编"
      description="请同步修改题干、答案、解析和总结；确认后将保留其他属性并新增一道题。"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="gold" onClick={handleSave} loading={saving} disabled={!canSave}>
            <WandSparkles className="h-4 w-4" />
            改编新题确认
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
          <div className="grid gap-4 lg:grid-cols-2">
            <Textarea
              label="改编后的题干"
              value={stem}
              onChange={(event) => setStem(event.target.value)}
              rows={8}
              autoFocus
              placeholder="修改题干"
            />
            <div className="space-y-4">
              <Textarea
                label="改编后的答案"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                placeholder="修改答案"
              />
              <Textarea
                label="改编后的解析"
                value={analysis}
                onChange={(event) => setAnalysis(event.target.value)}
                rows={5}
                placeholder="修改解析"
              />
              <Textarea
                label="改编后的总结"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={3}
                placeholder="修改总结"
              />
            </div>
          </div>
          <div className="text-xs text-ink-400">
            四项内容都完成修改后才能确认。题型、选项、板书、链接、视频、章节、知识点及其他属性均沿用原题。
          </div>
        </div>
      )}
    </Modal>
  );
}

export default QuestionAdaptationModal;
