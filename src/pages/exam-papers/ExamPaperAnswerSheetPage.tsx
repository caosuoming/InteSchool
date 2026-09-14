import { openPage } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnswerSheetComposer } from "@/components/answer-sheet/AnswerSheetComposer";
import { Spinner } from "@/components/ui/Spinner";
import { examPaperService } from "@/services/examPaper";
import { toast } from "@/stores/ui";
import type { ExamPaper } from "@/types";

export default function ExamPaperAnswerSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [initialViewMode, setInitialViewMode] = useState<"edit" | "preview">("edit");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const existingPaper = await examPaperService.getPaper(id);
      if (!existingPaper) {
        toast.error("试卷不存在");
        navigate("/my-resources");
        return;
      }
      const wasCreated = Boolean(existingPaper.hasAnswerSheet);
      const loadedPaper = wasCreated
        ? existingPaper
        : await examPaperService.markAnswerSheetCreated(id);
      if (cancelled || !loadedPaper) return;
      setInitialViewMode(wasCreated ? "preview" : "edit");
      setPaper(loadedPaper);
    };

    load().catch((error) => {
      if (!cancelled) {
        toast.error("加载答题卡失败", error instanceof Error ? error.message : "无法读取试卷");
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={24} />
      </div>
    );
  }

  if (!paper) return null;

  return (
    <AnswerSheetComposer
      title={paper.title}
      description={`${paper.grade} · ${paper.schoolYear} · ${paper.duration}分钟`}
      resourceType="exam-paper"
      resourceId={paper.id}
      resourceLabel="试卷"
      questions={paper.questions}
      totalScore={paper.totalScore}
      initialSettings={paper.answerSheetSettings}
      initialViewMode={initialViewMode}
      onSettingsChange={(settings) => {
        setPaper((current) => current ? { ...current, answerSheetSettings: settings } : current);
        void examPaperService.markAnswerSheetCreated(paper.id, settings).catch((error) => {
          toast.error("保存答题卡设置失败", error instanceof Error ? error.message : undefined);
        });
      }}
      onBack={() => openPage(`/exam-papers/${paper.id}/preview`)}
    />
  );
}
