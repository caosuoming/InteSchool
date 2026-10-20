import type { HomeworkImageCategory, HomeworkOverviewImage } from "@/types";

export const HOMEWORK_IMAGE_CATEGORIES: { id: HomeworkImageCategory; label: string }[] = [
  { id: "excellent", label: "优秀作业" },
  { id: "poor", label: "糟糕作业" },
];

/** 兼容旧记录：缺少分类的图片归到优秀作业。 */
export function imageCategory(image: HomeworkOverviewImage): HomeworkImageCategory {
  return image.category === "poor" ? "poor" : "excellent";
}
