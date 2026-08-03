import type {
  LessonQuestionContentSection,
  LessonSlide,
  LessonSlideElement,
} from "@/types";

export type LessonQuestionContentVisibility = Record<
  Exclude<LessonQuestionContentSection, "stem">,
  boolean
>;

export const STEM_ONLY_QUESTION_VISIBILITY: LessonQuestionContentVisibility = {
  options: false,
  answer: false,
  analysis: false,
  supplementary: false,
};

export function isLessonSlideElementVisible(
  element: LessonSlideElement,
  visibility: LessonQuestionContentVisibility,
): boolean {
  if (!element.questionSection || element.questionSection === "stem") return true;
  return visibility[element.questionSection];
}

export function getVisibleLessonSlideElements(
  slide: LessonSlide,
  visibility: LessonQuestionContentVisibility,
): LessonSlideElement[] {
  if (slide.type !== "question") return slide.elements || [];
  return (slide.elements || []).filter((element) =>
    isLessonSlideElementVisible(element, visibility));
}

export function mergeVisibleLessonSlideElements(
  allElements: LessonSlideElement[],
  visibleElements: LessonSlideElement[],
): LessonSlideElement[] {
  const updatedById = new Map(visibleElements.map((element) => [element.id, element]));
  return allElements.map((element) => updatedById.get(element.id) || element);
}
