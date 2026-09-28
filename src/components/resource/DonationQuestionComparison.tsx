import { ChevronRight } from "lucide-react";
import { MathHtml } from "@/components/ui/MathHtml";
import { cn } from "@/lib/utils";
import type { DonationConflict, DonationDecision } from "@/types";

type DonationFieldKey = keyof DonationDecision["fields"];

interface DonationQuestionComparisonProps {
  conflict: DonationConflict;
  decision: DonationDecision;
  onChange: (next: DonationDecision) => void;
}

interface ComparisonField {
  key: DonationFieldKey;
  label: string;
  source: string;
  target: string;
}

function nextFieldChoice(
  current: DonationDecision["fields"][DonationFieldKey],
  field: DonationFieldKey,
  side: "source" | "target",
): DonationDecision["fields"][DonationFieldKey] {
  if (field === "stem") return side;

  if (side === "source") {
    if (current === "both") return "target";
    if (current === "target") return "both";
    return "source";
  }

  if (current === "both") return "source";
  if (current === "source") return "both";
  return "target";
}

function ComparisonCell({
  content,
  label,
  selected,
  disabled,
  onSelect,
}: {
  content: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "relative rounded-md border p-2 text-left",
        selected ? "border-gold-400 bg-gold-50" : "border-ink-100 bg-mist/40",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
      />
      <MathHtml className="pointer-events-none relative whitespace-pre-wrap break-words text-xs text-ink-800">
        {content || "（无）"}
      </MathHtml>
    </div>
  );
}

export function DonationQuestionComparison({
  conflict,
  decision,
  onChange,
}: DonationQuestionComparisonProps) {
  const fields: ComparisonField[] = [
    {
      key: "stem",
      label: "题干",
      source: conflict.sourceQuestion.stem,
      target: conflict.targetQuestion.stem,
    },
    {
      key: "answer",
      label: "答案",
      source: conflict.sourceQuestion.answer || "（无）",
      target: conflict.targetQuestion.answer || "（无）",
    },
    {
      key: "analysis",
      label: "解析",
      source: conflict.sourceQuestion.analysis || "（无）",
      target: conflict.targetQuestion.analysis || "（无）",
    },
    {
      key: "summary",
      label: "总结",
      source: conflict.sourceQuestion.summary || "（无）",
      target: conflict.targetQuestion.summary || "（无）",
    },
  ];

  const updateField = (field: DonationFieldKey, side: "source" | "target") => {
    onChange({
      ...decision,
      fields: {
        ...decision.fields,
        [field]: nextFieldChoice(decision.fields[field], field, side),
      },
    });
  };

  const renderField = (field: ComparisonField) => (
    <div key={field.key} className="contents">
      <div className="py-2 font-medium text-ink-700">{field.label}</div>
      <ComparisonCell
        content={field.source}
        label={`选择本次捐赠的${field.label}`}
        selected={decision.action === "merge" && ["source", "both"].includes(decision.fields[field.key])}
        disabled={decision.action !== "merge"}
        onSelect={() => updateField(field.key, "source")}
      />
      <ComparisonCell
        content={field.target}
        label={`选择平台现有的${field.label}`}
        selected={decision.action === "merge" && ["target", "both"].includes(decision.fields[field.key])}
        disabled={decision.action !== "merge"}
        onSelect={() => updateField(field.key, "target")}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-[88px_1fr_1fr] gap-2 text-xs">
      <div />
      <div className="px-2 font-medium text-ink-600">本次捐赠</div>
      <div className="px-2 font-medium text-ink-600">平台现有</div>

      {renderField(fields[0])}

      <details
        data-testid={`donation-question-details-${conflict.item.resourceId}`}
        className="group col-span-3 rounded-md border border-ink-100 bg-paper/70"
      >
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-medium text-ink-600 hover:text-ink-800">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          查看答案、解析和总结
        </summary>
        <div className="grid grid-cols-[88px_1fr_1fr] gap-2 border-t border-ink-100 p-2">
          {fields.slice(1).map(renderField)}
        </div>
      </details>
    </div>
  );
}

export default DonationQuestionComparison;
