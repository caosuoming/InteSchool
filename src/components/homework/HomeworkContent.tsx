import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { homeworkMarkup } from "@/lib/homework-rich-text";

/** Legacy assignments remain plain text. Only explicitly versioned content is parsed as HTML. */
export function HomeworkContent({ content, className, ...props }: {
  content: string;
} & HTMLAttributes<HTMLDivElement>) {
  const markup = homeworkMarkup(content);
  return markup === null
    ? <div className={cn("whitespace-pre-wrap break-words", className)} {...props}>{content}</div>
    : <div className={cn("whitespace-pre-wrap break-words [&_p]:my-1 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5", className)} {...props}
        dangerouslySetInnerHTML={{ __html: markup }} />;
}
