import type { LessonSlideElement } from "@/types";

export function hasLessonElementAnimation(element: LessonSlideElement): boolean {
  const enterAnimation = element.enterAnimation ?? element.animation ?? "none";
  return enterAnimation !== "none"
    || (element.actionAnimation ?? "none") !== "none"
    || (element.exitAnimation ?? "none") !== "none";
}

export function getLessonElementAnimationOrder(element: LessonSlideElement): number | null {
  const order = element.animationOrder;
  return typeof order === "number" && Number.isFinite(order) && order > 0 ? order : null;
}
