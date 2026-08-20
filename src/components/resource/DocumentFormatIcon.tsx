import { FileText } from "lucide-react";

import {
  originalDocumentFileType,
  type OriginalDocumentFileType,
} from "@/lib/document-resource";
import { cn } from "@/lib/utils";

interface DocumentFormatIconProps {
  fileType?: OriginalDocumentFileType;
  fileName?: string;
  className?: string;
}

export function DocumentFormatIcon({ fileType, fileName, className }: DocumentFormatIconProps) {
  const resolvedType = originalDocumentFileType({
    originalFileType: fileType,
    originalFileName: fileName,
  });
  if (!resolvedType) return null;

  const isPdf = resolvedType === "pdf";
  const label = isPdf ? "PDF 文档" : "Word 文档";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold leading-none",
        isPdf ? "text-red-600" : "text-blue-600",
        className,
      )}
      title={label}
      aria-label={label}
    >
      <FileText className="h-4 w-4" aria-hidden="true" />
      <span aria-hidden="true">{isPdf ? "PDF" : "W"}</span>
    </span>
  );
}
