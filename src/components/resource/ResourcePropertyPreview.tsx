import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { MathHtml } from "@/components/ui/MathHtml";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";
import { alignGeographyQuestionAnswer, isGeographyChoiceGroup } from "@/lib/geography-paper-layout";
import { cn } from "@/lib/utils";
import type { Material, Question } from "@/types";

type ResourcePropertyPreviewProps =
  | { type: "question"; resource: Question }
  | { type: "material"; resource: Material };

function ExpandableSection({ label, content, question }: {
  label: "答案" | "解析";
  content: string;
  question: Question;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="rounded-lg border border-ink-100 bg-paper">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-700 hover:bg-mist/60"
      >
        <span>{label}</span>
        <span className="flex items-center gap-1 text-xs text-ink-500">
          {expanded ? "收起" : "展开"}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-ink-100 px-3 py-3 text-sm leading-relaxed text-ink-800">
          <MathHtml className={cn("whitespace-pre-wrap", label === "答案" && "question-answer-content")}>
            {alignGeographyQuestionAnswer(question.stem, content, question.type, question.subject) || `暂无${label}`}
          </MathHtml>
        </div>
      )}
    </section>
  );
}

/** Read-only content preview alongside resource attribute editors. */
export function ResourcePropertyPreview(props: ResourcePropertyPreviewProps) {
  return (
    <section aria-label="资源内容预览" className="min-w-0 rounded-lg border border-ink-200 bg-mist/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-ink-100 pb-2">
        <h4 className="text-sm font-semibold text-ink-800">{props.type === "question" ? "题目预览" : "素材预览"}</h4>
        <span className="text-xs text-ink-400">完整内容</span>
      </div>
      {props.type === "question" ? (
        <div className="space-y-4" data-testid="resource-property-question-preview">
          <MathHtml
            emphasizeEnglishQuestions={props.resource.subject === "英语"}
            geographyLabels={props.resource.subject?.trim() === "地理"}
            geographyChoiceGroup={isGeographyChoiceGroup(props.resource.stem, props.resource.type, props.resource.subject)}
            className="block whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-900"
          >
            {props.resource.stem}
          </MathHtml>
          {props.resource.options && props.resource.options.length > 0 && (
            <div className={cn("grid gap-x-4 gap-y-2", getQuestionOptionGridColumns(props.resource.options))}>
              {props.resource.options.map((option, index) => (
                <div key={index} className="flex min-w-0 items-start gap-2 text-sm text-ink-800">
                  <span className="shrink-0 font-mono font-medium text-ink-500">{String.fromCharCode(65 + index)}.</span>
                  <MathHtml className="min-w-0 flex-1 break-words whitespace-pre-wrap">{option}</MathHtml>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 border-t border-ink-100 pt-3">
            <ExpandableSection key={`${props.resource.id}-answer`} label="答案" content={props.resource.answer || ""} question={props.resource} />
            <ExpandableSection key={`${props.resource.id}-analysis`} label="解析" content={props.resource.analysis || ""} question={props.resource} />
          </div>
        </div>
      ) : (
        <div className="space-y-3" data-testid="resource-property-material-preview">
          <div className="font-medium text-ink-900">{props.resource.title}</div>
          {props.resource.description && <p className="whitespace-pre-wrap text-xs text-ink-500">{props.resource.description}</p>}
          {props.resource.type === "image" && props.resource.fileUrl ? (
            <img src={props.resource.fileUrl} alt={props.resource.title} className="max-h-64 w-full rounded object-contain" />
          ) : props.resource.type === "video" && props.resource.fileUrl ? (
            <video src={props.resource.fileUrl} controls preload="metadata" className="max-h-64 w-full" />
          ) : props.resource.type === "audio" && props.resource.fileUrl ? (
            <audio src={props.resource.fileUrl} controls preload="metadata" className="w-full" />
          ) : (
            <MathHtml className="block whitespace-pre-wrap break-words text-sm text-ink-800">{props.resource.content || "暂无内容"}</MathHtml>
          )}
        </div>
      )}
    </section>
  );
}
