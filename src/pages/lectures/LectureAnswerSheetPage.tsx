import { openPage } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AnswerSheetComposer } from "@/components/answer-sheet/AnswerSheetComposer";
import { Spinner } from "@/components/ui/Spinner";
import type { AnswerSheetQuestion } from "@/lib/answer-sheet";
import { lectureService } from "@/services/lecture";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import type { Lecture, LectureSection } from "@/types";

function flattenQuestionSections(sections: LectureSection[]): LectureSection[] {
  return sections.flatMap((section) => [
    ...(section.type === "question" ? [section] : []),
    ...flattenQuestionSections(section.children || []),
  ]);
}

export default function LectureAnswerSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [questions, setQuestions] = useState<AnswerSheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const loadedLecture = await lectureService.getLecture(id);
      if (!loadedLecture) {
        toast.error("讲义不存在");
        navigate("/my-resources");
        return;
      }

      const questionSections = flattenQuestionSections(loadedLecture.sections);
      const loadedQuestions = await Promise.all(
        questionSections.map(async (section): Promise<AnswerSheetQuestion> => {
          const question = section.questionId
            ? await questionService.getQuestion(section.questionId).catch(() => null)
            : null;
          return {
            id: section.id,
            type: question?.type || "essay",
            stem: question?.stem || section.content || section.title,
            options: question?.options,
          };
        }),
      );

      if (cancelled) return;
      setLecture(loadedLecture);
      setQuestions(loadedQuestions);
    };

    load().catch((error) => {
      if (!cancelled) {
        toast.error("加载答题卡失败", error instanceof Error ? error.message : "无法读取讲义");
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

  if (!lecture) return null;

  return (
    <AnswerSheetComposer
      title={lecture.title}
      description={`${lecture.grade} · ${lecture.schoolYear}`}
      resourceType="lecture"
      resourceId={lecture.id}
      resourceLabel="讲义"
      questions={questions}
      onBack={() => openPage(`/lectures/${lecture.id}/preview`)}
    />
  );
}
