import type { ExamPaper, Lecture } from "../types/index.js";

export type DocumentCategory = "uploaded" | "extracted" | "authored";

export const documentCategoryOptions: Array<{ value: DocumentCategory; label: string }> = [
  { value: "uploaded", label: "上传原稿" },
  { value: "extracted", label: "拆解稿" },
  { value: "authored", label: "自编或副本" },
];

type DocumentResource = {
  id: ExamPaper["id"] | Lecture["id"];
  originalFileUrl?: ExamPaper["originalFileUrl"] | Lecture["originalFileUrl"];
  isExtractCopy?: ExamPaper["isExtractCopy"] | Lecture["isExtractCopy"];
  sourceResourceId?: ExamPaper["sourceResourceId"] | Lecture["sourceResourceId"];
  extractStatus?: ExamPaper["extractStatus"] | Lecture["extractStatus"];
};

export function isDocumentStructureLocked(resource: DocumentResource | null | undefined): boolean {
  return Boolean(resource && (resource.originalFileUrl || resource.isExtractCopy));
}

export function documentCategory(
  resource: DocumentResource,
  allResources: readonly DocumentResource[],
): DocumentCategory {
  if (resource.isExtractCopy) return "extracted";
  if (!resource.originalFileUrl) return "authored";

  const hasExtractCopy = allResources.some((candidate) => (
    candidate.isExtractCopy && candidate.sourceResourceId === resource.id
  ));
  return resource.extractStatus === "done" || hasExtractCopy ? "extracted" : "uploaded";
}

export function documentCategoryLabel(category: DocumentCategory): string {
  return documentCategoryOptions.find((option) => option.value === category)?.label || category;
}
