import type { ExamPaperProject, ExamPaperQuestion } from "@/types";

export interface PaperProjectSection {
  project: ExamPaperProject | null;
  questions: ExamPaperQuestion[];
}

/** 未指定或失效的项目归属保留为未分组题目，避免数据丢失。 */
export function getProjectSections(
  questions: readonly ExamPaperQuestion[],
  projects: readonly ExamPaperProject[],
): PaperProjectSection[] {
  const ids = new Set(projects.map((project) => project.id));
  const ungrouped = questions.filter((question) => !question.projectId || !ids.has(question.projectId));
  return [
    ...(ungrouped.length ? [{ project: null, questions: ungrouped }] : []),
    ...projects.map((project) => ({
      project,
      questions: questions.filter((question) => question.projectId === project.id),
    })),
  ];
}
