import { classAudienceLabel } from "@/lib/class-audience";
import type { AnyClass, ExamPaper, Lecture } from "@/types";

export function documentResourceUsageSummary(
  resource: Pick<Lecture, "id" | "classIds"> | Pick<ExamPaper, "id" | "classIds">,
  classes: AnyClass[],
  usedDocumentIds: ReadonlySet<string>,
): string {
  const usage = usedDocumentIds.has(resource.id) ? "已用" : "未用";
  const classIds = resource.classIds || [];
  if (classIds.length === 0) return usage;

  const knownClassCount = classes.filter((item) => classIds.includes(item.id)).length;
  const audience = knownClassCount === classIds.length
    ? classAudienceLabel(classIds, classes)
    : `${classIds.length} 个班级`;
  return `适用对象：${audience || `${classIds.length} 个班级`} · ${usage}`;
}
