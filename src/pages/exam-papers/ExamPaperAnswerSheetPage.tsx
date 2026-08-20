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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    examPaperService.getPaper(id).then((loadedPaper) => {
      if (cancelled) return;
      if (!loadedPaper) {
        toast.error("试卷不存在");
        navigate("/my-resources");
        return;
      }
      setPaper(loadedPaper);
    }).catch((error) => {
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
      onBack={() => openPage(`/exam-papers/${paper.id}/preview`)}
    />
  );
}
