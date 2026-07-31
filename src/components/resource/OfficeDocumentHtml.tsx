import { useRef } from "react";
import { useOfficeMetafileImages, officeMetafilePreviewClassName } from "@/hooks/useOfficeMetafileImages";
import { cn } from "@/lib/utils";

interface OfficeDocumentHtmlProps {
  html: string;
  className?: string;
}

/** Renders sanitized document HTML and converts legacy Office WMF/EMF previews to PNG in-browser. */
export function OfficeDocumentHtml({ html, className }: OfficeDocumentHtmlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useOfficeMetafileImages(rootRef);

  return (
    <div
      ref={rootRef}
      className={cn(officeMetafilePreviewClassName, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export default OfficeDocumentHtml;
