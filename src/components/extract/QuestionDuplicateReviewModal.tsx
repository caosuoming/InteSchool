import { useState } from "react";
import { ChevronDown, ChevronUp, Merge, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { renderMathHtml } from "@/lib/math-html";
import { cn } from "@/lib/utils";
import type {
  DuplicateQuestionMergeFields,
  ExtractedQuestionItem,
  Question,
} from "@/types";

export interface QuestionDuplicateReviewItem {
  id: string;
  similarity: number;
  existing: Question;
  canMerge: boolean;
  incoming: Pick<
    ExtractedQuestionItem,
    "stem" | "options" | "answer" | "analysis" | "summary"
  >;
}

export interface QuestionDuplicateResolution {
  action: "merge" | "add";
  fields: DuplicateQuestionMergeFields;
}

interface QuestionDuplicateReviewModalProps {
  items: QuestionDuplicateReviewItem[];
  onClose: () => void;
  onConfirm: (resolutions: Record<string, QuestionDuplicateResolution>) => void;
}

const defaultFields = (): DuplicateQuestionMergeFields => ({
  stem: "existing",
  answer: "existing",
  analysis: "existing",
  summary: "existing",
});

type DetailField = "answer" | "analysis" | "summary";

const detailFields: Array<{ key: DetailField; label: string }> = [
  { key: "answer", label: "答案" },
  { key: "analysis", label: "解析" },
  { key: "summary", label: "总结" },
];

function displayValue(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized || "（无）";
}

function stemWithOptions(stem: string, options?: string[]): string {
  const normalizedOptions = (options || [])
    .map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`)
    .filter((option) => option.trim());
  return [displayValue(stem), ...normalizedOptions].join("\n");
}

interface DifferenceParts {
  prefix: string;
  changed: string;
  suffix: string;
}

interface TextRange {
  start: number;
  end: number;
}

function mathRanges(value: string): TextRange[] {
  const ranges: TextRange[] = [];
  const pattern = /\$\$[\s\S]+?\$\$|\$(?:\\.|[^$])+?\$/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function markdownImageRanges(value: string): TextRange[] {
  const ranges: TextRange[] = [];
  const pattern = /!\[[^\]]*\]\([^)]+\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function keepRichTokensIntact(value: string, start: number, end: number): TextRange {
  let expandedStart = start;
  let expandedEnd = end;

  for (const range of [...mathRanges(value), ...markdownImageRanges(value)]) {
    const touchesRange = expandedStart < range.end && expandedEnd > range.start;
    const startsInsideRange = expandedStart > range.start && expandedStart < range.end;
    const endsInsideRange = expandedEnd > range.start && expandedEnd < range.end;
    if (touchesRange || startsInsideRange || endsInsideRange) {
      expandedStart = Math.min(expandedStart, range.start);
      expandedEnd = Math.max(expandedEnd, range.end);
    }
  }

  return { start: expandedStart, end: expandedEnd };
}

function differenceParts(value: string, peer: string): DifferenceParts {
  const chars = Array.from(value);
  const peerChars = Array.from(peer);
  let prefixLength = 0;
  while (
    prefixLength < chars.length
    && prefixLength < peerChars.length
    && chars[prefixLength] === peerChars[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < chars.length - prefixLength
    && suffixLength < peerChars.length - prefixLength
    && chars[chars.length - suffixLength - 1] === peerChars[peerChars.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const changedEnd = chars.length - suffixLength;
  const range = keepRichTokensIntact(value, prefixLength, changedEnd);

  return {
    prefix: chars.slice(0, range.start).join(""),
    changed: chars.slice(range.start, range.end).join(""),
    suffix: chars.slice(range.end).join(""),
  };
}

function RenderedText({ value }: { value: string }) {
  return (
    <span
      className="question-rich-content whitespace-pre-wrap break-words"
      dangerouslySetInnerHTML={{ __html: renderMathHtml(value) }}
    />
  );
}

function IncomingDifferenceText({ value, peer }: { value: string; peer: string }) {
  const containsRichHtml = /<[a-z][\s\S]*>/i.test(value) || /<[a-z][\s\S]*>/i.test(peer);
  if (containsRichHtml) {
    return value === peer ? (
      <RenderedText value={value} />
    ) : (
      <mark className="rounded bg-amber-200/80 px-0.5 text-inherit">
        <RenderedText value={value} />
      </mark>
    );
  }

  const parts = differenceParts(value, peer);
  if (!parts.changed && value === peer) {
    return <RenderedText value={value} />;
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      <RenderedText value={parts.prefix} />
      {parts.changed ? (
        <mark className="rounded bg-amber-200/80 px-0.5 text-inherit">
          <RenderedText value={parts.changed} />
        </mark>
      ) : (
        <mark className="rounded bg-amber-200/80 px-1 text-amber-900">此处缺失</mark>
      )}
      <RenderedText value={parts.suffix} />
    </span>
  );
}

function selectedOnSide(
  value: DuplicateQuestionMergeFields[DetailField],
  side: "existing" | "incoming",
): boolean {
  return value === side || value === "both";
}

function toggleFieldSide(
  value: DuplicateQuestionMergeFields[DetailField],
  side: "existing" | "incoming",
): DuplicateQuestionMergeFields[DetailField] {
  if (side === "existing") {
    if (value === "incoming") return "both";
    if (value === "both") return "incoming";
    return value;
  }
  if (value === "existing") return "both";
  if (value === "both") return "existing";
  return value;
}

function FieldHeading({
  label,
  control,
}: {
  label: string;
  control: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-xs font-semibold text-ink-700">{label}</span>
      {control}
    </div>
  );
}

export function QuestionDuplicateReviewModal({
  items,
  onClose,
  onConfirm,
}: QuestionDuplicateReviewModalProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, {
    action?: "merge" | "add";
    fields: DuplicateQuestionMergeFields;
  }>>(() => Object.fromEntries(items.map((item) => [
    item.id,
    { action: undefined, fields: defaultFields() },
  ])));

  const updateFields = (
    itemId: string,
    updater: (fields: DuplicateQuestionMergeFields) => DuplicateQuestionMergeFields,
  ) => {
    setResolutions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        fields: updater(current[itemId]?.fields || defaultFields()),
      },
    }));
  };

  const setAction = (itemId: string, action: "merge" | "add") => {
    setResolutions((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        action,
        fields: current[itemId]?.fields || defaultFields(),
      },
    }));
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const allResolved = items.every((item) => Boolean(resolutions[item.id]?.action));

  const submit = () => {
    if (!allResolved) return;
    onConfirm(Object.fromEntries(items.map((item) => {
      const resolution = resolutions[item.id];
      return [item.id, {
        action: resolution.action!,
        fields: resolution.fields,
      }];
    })));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="重题处理"
      description="左侧为题库中的相似题，右侧为本次上传题。题干必须二选一；答案、解析、总结至少保留一侧，也可以同时保留。"
      size="full"
      className="max-w-[1400px]"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-ink-500">
            已处理 {items.filter((item) => resolutions[item.id]?.action).length} / {items.length} 道
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>返回审阅</Button>
            <Button type="button" variant="gold" disabled={!allResolved} onClick={submit}>
              完成重题处理并入库
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {items.map((item, index) => {
          const resolution = resolutions[item.id] || { fields: defaultFields() };
          const expanded = expandedIds.has(item.id);
          const existingStem = stemWithOptions(item.existing.stem, item.existing.options);
          const incomingStem = stemWithOptions(item.incoming.stem, item.incoming.options);

          return (
            <section key={item.id} className="overflow-hidden rounded-xl border border-ink-200 bg-paper shadow-sm">
              <div className="flex flex-col gap-3 border-b border-ink-100 bg-mist/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink-900">相似题 {index + 1}</div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    相似度 {(item.similarity * 100).toFixed(1)}% · 题库 ID：{item.existing.id}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!resolution.action && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                      待选择操作
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`相似题 ${index + 1} 合并`}
                    title={item.canMerge ? "合并到库中题" : "只能合并到自己的题目"}
                    disabled={!item.canMerge}
                    onClick={() => setAction(item.id, "merge")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      resolution.action === "merge"
                        ? "border-gold-400 bg-gold-400 text-ink-950"
                        : "border-ink-200 bg-paper text-ink-700 hover:border-gold-300 hover:bg-gold-50",
                      !item.canMerge && "cursor-not-allowed opacity-45 hover:border-ink-200 hover:bg-paper",
                    )}
                  >
                    <Merge className="h-4 w-4" />
                    合并
                  </button>
                  <button
                    type="button"
                    aria-label={`相似题 ${index + 1} 新增`}
                    onClick={() => setAction(item.id, "add")}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      resolution.action === "add"
                        ? "border-ink-700 bg-ink-800 text-white"
                        : "border-ink-200 bg-paper text-ink-700 hover:border-ink-400 hover:bg-mist",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    新增
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                <div
                  role="group"
                  aria-label={`相似题 ${index + 1} 库中题`}
                  className="border-b border-ink-100 p-4 md:border-b-0 md:border-r"
                >
                  <div className="mb-3 text-sm font-semibold text-ink-800">库中题</div>
                  <div className={cn(
                    "rounded-lg border p-3",
                    resolution.fields.stem === "existing" ? "border-gold-400 bg-gold-50/60" : "border-ink-100 bg-mist/20",
                  )}>
                    <FieldHeading
                      label="题干"
                      control={(
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
                          <input
                            type="radio"
                            name={`stem-${item.id}`}
                            aria-label={`相似题 ${index + 1} 选择库中题题干`}
                            checked={resolution.fields.stem === "existing"}
                            onChange={() => updateFields(item.id, (fields) => ({ ...fields, stem: "existing" }))}
                          />
                          采用
                        </label>
                      )}
                    />
                    <button
                      type="button"
                      aria-label={`相似题 ${index + 1} 点击库中题题干${expanded ? "收起" : "展开"}详情`}
                      onClick={() => toggleExpanded(item.id)}
                      className="block w-full text-left text-sm leading-relaxed text-ink-800"
                    >
                      <RenderedText value={existingStem} />
                    </button>
                  </div>
                </div>

                <div
                  role="group"
                  aria-label={`相似题 ${index + 1} 上传题`}
                  className="p-4"
                >
                  <div className="mb-3 text-sm font-semibold text-ink-800">上传题</div>
                  <div className={cn(
                    "rounded-lg border p-3",
                    resolution.fields.stem === "incoming" ? "border-gold-400 bg-gold-50/60" : "border-ink-100 bg-mist/20",
                  )}>
                    <FieldHeading
                      label="题干"
                      control={(
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
                          <input
                            type="radio"
                            name={`stem-${item.id}`}
                            aria-label={`相似题 ${index + 1} 选择上传题题干`}
                            checked={resolution.fields.stem === "incoming"}
                            onChange={() => updateFields(item.id, (fields) => ({ ...fields, stem: "incoming" }))}
                          />
                          采用
                        </label>
                      )}
                    />
                    <button
                      type="button"
                      aria-label={`相似题 ${index + 1} 点击上传题题干${expanded ? "收起" : "展开"}详情`}
                      onClick={() => toggleExpanded(item.id)}
                      className="block w-full text-left text-sm leading-relaxed text-ink-800"
                    >
                      <IncomingDifferenceText value={incomingStem} peer={existingStem} />
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toggleExpanded(item.id)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 bg-mist/20 px-4 py-2.5 text-xs font-medium text-ink-600 hover:bg-mist/50"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "收起答案、解析与总结" : "展开答案、解析与总结"}
              </button>

              {expanded && (
                <div className="divide-y divide-ink-100 border-t border-ink-100">
                  {detailFields.map(({ key, label }) => {
                    const existingValue = displayValue(item.existing[key]);
                    const incomingValue = displayValue(item.incoming[key]);
                    const selected = resolution.fields[key];
                    return (
                      <div key={key} className={cn("grid grid-cols-1 md:grid-cols-2", key === "answer" && "question-answer-content")}>
                        <div className={cn(
                          "p-4 md:border-r",
                          selectedOnSide(selected, "existing") ? "bg-gold-50/40" : "bg-paper",
                        )}>
                          <FieldHeading
                            label={label}
                            control={(
                              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
                                <input
                                  type="checkbox"
                                  aria-label={`相似题 ${index + 1} 保留库中题${label}`}
                                  checked={selectedOnSide(selected, "existing")}
                                  onChange={() => updateFields(item.id, (fields) => ({
                                    ...fields,
                                    [key]: toggleFieldSide(fields[key], "existing"),
                                  }))}
                                />
                                保留
                              </label>
                            )}
                          />
                          <RenderedText value={existingValue} />
                        </div>
                        <div className={cn(
                          "border-t border-ink-100 p-4 md:border-t-0",
                          selectedOnSide(selected, "incoming") ? "bg-gold-50/40" : "bg-paper",
                        )}>
                          <FieldHeading
                            label={label}
                            control={(
                              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-600">
                                <input
                                  type="checkbox"
                                  aria-label={`相似题 ${index + 1} 保留上传题${label}`}
                                  checked={selectedOnSide(selected, "incoming")}
                                  onChange={() => updateFields(item.id, (fields) => ({
                                    ...fields,
                                    [key]: toggleFieldSide(fields[key], "incoming"),
                                  }))}
                                />
                                保留
                              </label>
                            )}
                          />
                          <IncomingDifferenceText value={incomingValue} peer={existingValue} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

export default QuestionDuplicateReviewModal;
