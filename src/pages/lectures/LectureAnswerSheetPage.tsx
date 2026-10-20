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

function flattenQuestionSections(sections: LectureSection[], projectId?: string): { section: LectureSection; projectId?: string }[] {
  return sections.flatMap((section) => [
    ...(section.type === "question" ? [{ section, projectId }] : []),
    ...flattenQuestionSections(section.children || [], section.type === "chapter" && !projectId ? section.id : projectId),
  ]);
}

export default function LectureAnswerSheetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [initialViewMode, setInitialViewMode] = useState<"edit" | "preview">("edit");
  const [questions, setQuestions] = useState<AnswerSheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const existingLecture = await lectureService.getLecture(id);
      if (!existingLecture) {
        toast.error("讲义不存在");
        navigate("/my-resources");
        return;
      }
      const wasCreated = Boolean(existingLecture.hasAnswerSheet);
      const loadedLecture = wasCreated
        ? existingLecture
        : await lectureService.markAnswerSheetCreated(id);
      if (!loadedLecture) return;
      setInitialViewMode(wasCreated ? "preview" : "edit");

      const questionSections = flattenQuestionSections(loadedLecture.sections);
      const loadedQuestions = await Promise.all(
        questionSections.map(async ({ section, projectId }): Promise<AnswerSheetQuestion> => {
          const question = section.questionId
            ? await questionService.getQuestion(section.questionId).catch(() => null)
            : null;
          return {
            id: section.id,
            projectId,
            label: section.customLabel,
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
      sourceLayoutMode={lecture.sections.some((section) => section.type === "chapter") ? "flat" : "grouped"}
      projects={lecture.sections.filter((section) => section.type === "chapter").map((section) => ({ id: section.id, name: section.title }))}
      initialSettings={lecture.answerSheetSettings}
      initialViewMode={initialViewMode}
      published={Boolean(lecture.answerSheetPublishedAt)}
      onPublicationChange={async (publish, settings) => {
        const updated = publish
          ? await lectureService.publishAnswerSheet(lecture.id, settings)
          : await lectureService.unpublishAnswerSheet(lecture.id);
        setLecture(updated);
      }}
      onSettingsChange={(settings) => {
        setLecture((current) => current ? { ...current, answerSheetSettings: settings } : current);
        void lectureService.markAnswerSheetCreated(lecture.id, settings).catch((error) => {
          toast.error("保存答题卡设置失败", error instanceof Error ? error.message : undefined);
        });
      }}
      onBack={() => openPage(`/lectures/${lecture.id}/preview`)}
    />
  );
}
