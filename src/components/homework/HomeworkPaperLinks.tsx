import { FileText } from "lucide-react";
import { Link } from "react-router";
import type { ClassroomHomework } from "@/types";
import { cn } from "@/lib/utils";

type HomeworkPaper = NonNullable<ClassroomHomework["linkedPapers"]>[number];

export function HomeworkPaperLinks({ papers, theme = "light", className }: {
  papers?: readonly HomeworkPaper[];
  theme?: "light" | "dark";
  className?: string;
}) {
  if (!papers?.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)} aria-label="关联试卷">
      {papers.map((paper) => (
        <Link key={paper.id}
          to={paper.originalFileUrl
            ? `/resources/preview/${encodeURIComponent(paper.id)}?type=examPaper`
            : `/exam-papers/${encodeURIComponent(paper.id)}/preview`}
          className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:underline",
            theme === "dark"
              ? "border-neutral-700 bg-neutral-900 text-amber-300 hover:border-amber-600"
              : "border-teal-200 bg-teal-50/40 text-teal-700 hover:border-teal-400")}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="break-all">{paper.title}</span>
        </Link>
      ))}
    </div>
  );
}
