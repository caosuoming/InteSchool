import type { AnyClass } from "@/types";

export type DocumentLessonAudience = "school" | "personal";

export function documentLessonAudienceIds(
  classIds: readonly string[],
  classes: readonly AnyClass[],
): Record<DocumentLessonAudience, string[]> {
  const selected = new Set(classIds);
  return {
    school: classes.filter((item) => item.type === "school" && selected.has(item.id)).map((item) => item.id),
    personal: classes.filter((item) => item.type === "personal" && selected.has(item.id)).map((item) => item.id),
  };
}
