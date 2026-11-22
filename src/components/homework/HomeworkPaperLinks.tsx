import { useState } from "react";
import { FileText } from "lucide-react";
import { Link } from "react-router";
import type { ClassroomHomework } from "@/types";
import { cn } from "@/lib/utils";
import { HomeworkPaperAnnotation } from "./HomeworkPaperAnnotation";

type HomeworkPaper = NonNullable<ClassroomHomework["linkedPapers"]>[number];

export function HomeworkPaperLinks({ papers, theme = "light", className, classroomPreview = false }: {
  papers?: readonly HomeworkPaper[];
  theme?: "light" | "dark";
  className?: string;
  classroomPreview?: boolean;
}) {
  const [previewing, setPreviewing] = useState<HomeworkPaper | null>(null);
  if (!papers?.length) return null;
  const linkClassName = cn("inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:underline",
    theme === "dark"
      ? "border-neutral-700 bg-neutral-900 text-amber-300 hover:border-amber-600"
      : "border-teal-200 bg-teal-50/40 text-teal-700 hover:border-teal-400");
  const url = (paper: HomeworkPaper) => paper.originalFileUrl
    ? `/resources/preview/${encodeURIComponent(paper.id)}?type=examPaper`
    : `/exam-papers/${encodeURIComponent(paper.id)}/preview`;
  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)} aria-label="关联试卷">
        {papers.map((paper) => classroomPreview ? (
          <button type="button" key={paper.id} onClick={() => setPreviewing(paper)} className={linkClassName}
            title={`打开并批注 ${paper.title}`}>
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{paper.title}</span>
          </button>
        ) : (
          <Link key={paper.id} to={url(paper)} className={linkClassName}>
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{paper.title}</span>
          </Link>
        ))}
      </div>
      {classroomPreview && previewing && (
        <HomeworkPaperAnnotation title={previewing.title} url={url(previewing)} onClose={() => setPreviewing(null)} />
      )}
    </>
  );
}
