import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Eye, FileSpreadsheet, Pencil, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import {
  buildAnswerSheetQrPayload,
  DEFAULT_ANSWER_SHEET_SETTINGS,
  MAX_STUDENT_NUMBER_DIGITS,
  MIN_STUDENT_NUMBER_DIGITS,
  normalizeStudentNumberDigits,
  type AnswerSheetBoxStyle,
  type AnswerSheetChoiceLayout,
  type AnswerSheetPaperSize,
  type AnswerSheetQuestion,
  type AnswerSheetResourceType,
  type AnswerSheetSettings,
  type AnswerSheetWideColumns,
} from "@/lib/answer-sheet";
import { decorateFillBlankAnswerAreas } from "@/lib/fill-blank";
import type { AnswerSheetImageLayout } from "@/lib/answer-sheet";
import { EssayImages } from "./EssayImages";

const PAGE_PADDING_MM = 8;
const MM_TO_CSS_PX = 96 / 25.4;

const paperSizeConfig: Record<AnswerSheetPaperSize, {
  physicalWidthMm: number;
  heightMm: number;
  className: string;
  supportsMultipleColumns: boolean;
}> = {
  A4: {
    physicalWidthMm: 210,
    heightMm: 297,
    className: "answer-sheet-paper-a4",
    supportsMultipleColumns: false,
  },
  A3: {
    physicalWidthMm: 420,
    heightMm: 297,
    className: "answer-sheet-paper-a3",
    supportsMultipleColumns: true,
  },
  "8K": {
    physicalWidthMm: 370,
    heightMm: 260,
    className: "answer-sheet-paper-8k",
    supportsMultipleColumns: true,
  },
};

const typeLabels: Record<string, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  short: "填空题",
  conceptFill: "概念填空",
  essay: "解答题",
  comprehensive: "综合题",
};

const preferredTypeOrder = ["single", "multiple", "judge", "short", "conceptFill", "essay", "comprehensive"];
const chineseNumerals = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chineseSectionNumber(number: number): string {
  if (number < 10) return chineseNumerals[number];
  if (number < 100) {
    const tens = Math.floor(number / 10);
    return `${tens === 1 ? "" : chineseNumerals[tens]}十${number % 10 ? chineseNumerals[number % 10] : ""}`;
  }
  return String(number);
}

interface NumberedQuestion {
  question: AnswerSheetQuestion;
  number: number;
}

interface QuestionGroup {
  type: string;
  label: string;
  items: NumberedQuestion[];
}

function groupScoreLabel(group: QuestionGroup): string {
  const scores = group.items.map(({ question }) => question.score);
  if (scores.every((score) => typeof score === "number" && Number.isFinite(score))) {
    if (scores.every((score) => score === scores[0])) {
      return `${scores.length}题，每题${scores[0]}分`;
    }
    return scores.map((score, index) => `第${group.items[index].number}题${score}分`).join("，");
  }
  const knownScores = group.items
    .filter(({ question }) => typeof question.score === "number" && Number.isFinite(question.score))
    .map(({ question, number }) => `第${number}题${question.score}分`);
  return knownScores.length
    ? `${group.items.length}题，${knownScores.join("，")}`
    : `${group.items.length}题`;
}

interface QuestionGroupDraft {
  type: string;
  label: string;
  questions: AnswerSheetQuestion[];
}

interface FlowItem {
  key: string;
  kind:
    | "header"
    | "zone-heading"
    | "zone-choice"
    | "zone-fill"
    | "group-heading"
    | "question"
    | "footer";
  item?: NumberedQuestion;
  group?: QuestionGroup;
  groupIndex?: number;
  first?: boolean;
  last?: boolean;
  label?: string;
  testId?: string;
}

function isChoiceQuestion(question: AnswerSheetQuestion): boolean {
  return question.type === "single" || question.type === "multiple";
}

function isFillQuestion(question: AnswerSheetQuestion): boolean {
  return question.type === "short" || question.type === "conceptFill";
}

function groupQuestions(questions: AnswerSheetQuestion[]): QuestionGroup[] {
  const groups = new Map<string, QuestionGroupDraft>();
  questions.forEach((question) => {
    const current = groups.get(question.type) || {
      type: question.type,
      label: typeLabels[question.type] || question.type,
      questions: [],
    };
    current.questions.push(question);
    groups.set(question.type, current);
  });

  const known = preferredTypeOrder
    .map((type) => groups.get(type))
    .filter((group): group is QuestionGroupDraft => Boolean(group));
  const unknown = Array.from(groups.values()).filter(
    (group) => !preferredTypeOrder.includes(group.type),
  );

  let nextNumber = 1;
  return [...known, ...unknown].map((group) => ({
    type: group.type,
    label: group.label,
    items: group.questions.map((question) => ({ question, number: nextNumber++ })),
  }));
}

function StudentNumberGrid({ digits }: { digits: number }) {
  return (
    <div
      className="min-w-0 space-y-0.5 overflow-hidden bg-white"
      aria-label={`${digits}位学号涂填区`}
      data-testid="student-number-grid"
    >
      {Array.from({ length: digits }, (_, row) => (
        <div key={row} className="flex gap-0.5" data-testid="student-number-row">
          {Array.from({ length: 10 }, (_, digit) => (
            <span
              key={digit}
              className="flex h-[15px] min-w-[16px] flex-1 items-center justify-center border border-ink-700 font-mono text-[8px] leading-none text-ink-700"
            >
              [{digit}]
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

interface EssayStemContent {
  stem: string;
  images: string;
}

const QUESTION_IMAGE_PATTERN = /<img\b[^>]*>|!\[[^\]]*\]\([^)]+\)/gi;
const EMPTY_BLOCK_PATTERN = /<(p|div)(?:\s[^>]*)?>\s*(?:(?:&nbsp;|&#160;|<br\s*\/?>)\s*)*<\/\1>/gi;

function splitEssayStemContent(stem: string): EssayStemContent {
  const images: string[] = [];
  let compacted = stem.replace(QUESTION_IMAGE_PATTERN, (imageMarkup) => {
    images.push(imageMarkup);
    return "";
  });

  let previous: string;
  do {
    previous = compacted;
    compacted = compacted.replace(EMPTY_BLOCK_PATTERN, "");
  } while (compacted !== previous);

  compacted = compacted
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/(?:\r?\n[ \t]*){2,}/g, "\n")
    .replace(/^(?:\s|<br\s*\/?>)+/gi, "")
    .replace(/(?:\s|<br\s*\/?>)+$/gi, "")
    .trim();

  return {
    stem: compacted,
    images: images.join(""),
  };
}

function ChoiceAnswer({ number, optionCount }: { number: number; optionCount: number }) {
  const count = Math.min(8, Math.max(2, optionCount || 4));
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 shrink-0 font-mono text-xs font-semibold text-ink-800">{number}.</span>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, index) => (
          <span key={index} className="font-mono text-xs text-ink-900">
            [{String.fromCharCode(65 + index)}]
          </span>
        ))}
      </div>
    </div>
  );
}

function JudgeAnswer({ number, hideNumber = false }: { number: number; hideNumber?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-900">
      {!hideNumber && <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>}
      <span>[√]</span>
      <span>[×]</span>
    </div>
  );
}

function AnswerBox({
  number,
  hideNumber = false,
  boxStyle,
  compact = false,
  editable,
  height,
  onHeightChange,
  children,
}: {
  number: number;
  hideNumber?: boolean;
  boxStyle: AnswerSheetBoxStyle;
  compact?: boolean;
  editable: boolean;
  height?: number;
  onHeightChange?: (height: number) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`answer-sheet-answer-box relative box-border w-full border border-ink-800 p-2 ${boxStyle === "dashed" ? "border-dashed" : "border-solid"}`}
      style={{
        height: height ? `${height}px` : undefined,
        minHeight: compact ? "13mm" : "30mm",
        resize: editable ? "vertical" : "none",
        overflow: "hidden",
      }}
      onPointerUp={(event) => {
        if (!editable || !onHeightChange || event.target !== event.currentTarget) return;
        const nextHeight = Math.round(event.currentTarget.getBoundingClientRect().height);
        if (nextHeight > 0 && nextHeight !== height) onHeightChange(nextHeight);
      }}
      data-testid="answer-box"
      data-answer-box-style={boxStyle}
    >
      {!hideNumber && <div className="font-mono text-xs font-semibold text-ink-800">{number}.</div>}
      {children && (
        <div className="min-h-0 pr-[14mm] pb-[9mm]" data-testid="answer-box-content">
          {children}
        </div>
      )}
      <div
        className="absolute bottom-0 right-0 flex h-[9mm] w-[13mm] items-center justify-center border-l border-t border-ink-800 bg-white text-[8px] text-ink-500"
        aria-label={`第${number}题评分框`}
      >
        得分
      </div>
    </div>
  );
}

function DraggableQuestionContent({
  children,
  className,
  editable,
}: {
  children: string;
  className?: string;
  editable: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const cleanups: Array<() => void> = [];
    root.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
      image.draggable = editable;
      image.classList.add("answer-sheet-floating-image");
      image.title = editable ? "拖动图片可调整其在答题区域中的左右浮动位置" : "";

      if (!editable) return;
      const handleDragEnd = (event: DragEvent) => {
        const question = image.closest<HTMLElement>("[data-answer-sheet-question]");
        if (!question) return;
        const rect = question.getBoundingClientRect();
        const side = event.clientX >= rect.left + rect.width / 2 ? "right" : "left";
        image.style.float = side;
        image.style.marginLeft = side === "right" ? "6px" : "0";
        image.style.marginRight = side === "left" ? "6px" : "0";

        if (event.clientY > rect.top) {
          const maxOffset = Math.max(0, rect.height - image.getBoundingClientRect().height);
          const offset = Math.min(maxOffset, Math.max(0, event.clientY - rect.top - 16));
          image.style.marginTop = `${Math.round(offset)}px`;
        }
      };
      image.addEventListener("dragend", handleDragEnd);
      cleanups.push(() => image.removeEventListener("dragend", handleDragEnd));
    });

    root.querySelectorAll<HTMLElement>(".answer-sheet-inline-blank").forEach((blank, index) => {
      blank.dataset.answerSheetInlineBlank = String(index);
      blank.dataset.answerSheetEditable = editable ? "true" : "false";
      blank.title = editable ? "拖动右下角可调整填空区域的长度和高度" : "";
      blank.style.resize = editable ? "both" : "none";
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [children, editable]);

  return (
    <div
      ref={rootRef}
      className={`answer-sheet-question-content ${className || ""}`}
      data-answer-sheet-editable={editable ? "true" : "false"}
    >
      <MathHtml>{children}</MathHtml>
    </div>
  );
}

function InlineChoiceQuestion({ question, number, editable }: NumberedQuestion & { editable: boolean }) {
  const options = question.options?.length ? question.options : Array.from({ length: 4 }, () => "");
  return (
    <div className="space-y-2" data-testid="inline-choice-question" data-answer-sheet-question>
      <div className="flex items-start gap-2 text-xs text-ink-800">
        <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
        <DraggableQuestionContent className="min-w-0 flex-1 whitespace-pre-wrap" editable={editable}>
          {question.stem}
        </DraggableQuestionContent>
      </div>
      <div className="grid gap-1.5 pl-7 sm:grid-cols-2">
        {options.map((option, index) => {
          const label = String.fromCharCode(65 + index);
          return (
            <div key={`${label}-${index}`} className="flex min-w-0 items-start gap-1.5 text-xs text-ink-800">
              <span className="shrink-0 font-mono font-semibold">[{label}]</span>
              {option && (
                <DraggableQuestionContent className="min-w-0 flex-1" editable={editable}>
                  {option}
                </DraggableQuestionContent>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceQuestionText({ question, number, editable }: NumberedQuestion & { editable: boolean }) {
  const options = question.options || [];
  return (
    <div className="space-y-1.5" data-testid="concentrated-choice-question" data-answer-sheet-question>
      <div className="flex items-start gap-2 text-xs text-ink-800">
        <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
        <DraggableQuestionContent className="min-w-0 flex-1 whitespace-pre-wrap" editable={editable}>
          {question.stem}
        </DraggableQuestionContent>
      </div>
      {options.length > 0 && (
        <div className="grid gap-1 pl-7 sm:grid-cols-2">
          {options.map((option, index) => (
            <div key={index} className="flex min-w-0 gap-1 text-xs text-ink-700">
              <span className="shrink-0 font-mono font-semibold">{String.fromCharCode(65 + index)}.</span>
              <DraggableQuestionContent className="min-w-0 flex-1" editable={editable}>
                {option}
              </DraggableQuestionContent>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FillQuestionInline({ question, number, editable }: NumberedQuestion & { editable: boolean }) {
  const decoratedStem = useMemo(
    () => decorateFillBlankAnswerAreas(question.stem),
    [question.stem],
  );

  return (
    <div className="flex items-start gap-2 text-xs text-ink-800" data-testid="inline-fill-question" data-answer-sheet-question>
      <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
      <DraggableQuestionContent className="min-w-0 flex-1 whitespace-pre-wrap" editable={editable}>
        {decoratedStem}
      </DraggableQuestionContent>
    </div>
  );
}

function QuestionStemOnly({ question, number, editable }: NumberedQuestion & { editable: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs text-ink-800" data-testid="concentrated-fill-question" data-answer-sheet-question>
      <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
      <DraggableQuestionContent className="min-w-0 flex-1 whitespace-pre-wrap" editable={editable}>
        {question.stem}
      </DraggableQuestionContent>
    </div>
  );
}

function AnswerField({
  question,
  number,
  hideNumber = false,
  boxStyle,
  editable,
  height,
  onHeightChange,
  imageLayouts,
  onImageLayoutChange,
}: NumberedQuestion & {
  hideNumber?: boolean;
  boxStyle: AnswerSheetBoxStyle;
  editable: boolean;
  height?: number;
  onHeightChange?: (height: number) => void;
  imageLayouts?: AnswerSheetImageLayout[];
  onImageLayoutChange: (index: number, layout: AnswerSheetImageLayout) => void;
}) {
  if (isChoiceQuestion(question)) {
    return <ChoiceAnswer number={number} optionCount={question.options?.length || 4} />;
  }
  if (question.type === "judge") return <JudgeAnswer number={number} hideNumber={hideNumber} />;
  const essayContent = question.type === "essay"
    ? splitEssayStemContent(question.stem)
    : null;
  return (
    <AnswerBox
      number={number}
      hideNumber={hideNumber}
      boxStyle={boxStyle}
      compact={isFillQuestion(question)}
      editable={editable}
      height={height}
      onHeightChange={onHeightChange}
    >
      {essayContent?.images && (
        <EssayImages
          markup={essayContent.images}
          number={number}
          editable={editable}
          layouts={imageLayouts}
          onLayoutChange={onImageLayoutChange}
        />
      )}
    </AnswerBox>
  );
}

function QuestionWithAnswer({
  question,
  number,
  boxStyle,
  editable,
  height,
  onHeightChange,
  imageLayouts,
  onImageLayoutChange,
}: NumberedQuestion & {
  boxStyle: AnswerSheetBoxStyle;
  editable: boolean;
  height?: number;
  onHeightChange?: (height: number) => void;
  imageLayouts?: AnswerSheetImageLayout[];
  onImageLayoutChange: (index: number, layout: AnswerSheetImageLayout) => void;
}) {
  const essayContent = question.type === "essay"
    ? splitEssayStemContent(question.stem)
    : null;
  const displayStem = essayContent?.stem ?? question.stem;

  return (
    <div className="space-y-1.5" data-answer-sheet-question>
      {displayStem && (
        <div
          className="flex items-start gap-2 text-xs text-ink-700"
          data-testid={question.type === "essay" ? "essay-question-stem" : undefined}
        >
          <span className="w-7 shrink-0 font-mono font-semibold text-ink-800">{number}.</span>
          <DraggableQuestionContent className="min-w-0 flex-1 whitespace-pre-wrap" editable={editable}>
            {displayStem}
          </DraggableQuestionContent>
        </div>
      )}
      {question.type === "judge" ? (
        <div className={displayStem ? "pl-7" : undefined}>
          <JudgeAnswer number={number} hideNumber={Boolean(displayStem)} />
        </div>
      ) : (
        <div className={displayStem && question.type !== "essay" ? "pl-7" : undefined}>
          <AnswerBox
            number={number}
            hideNumber={Boolean(displayStem)}
            boxStyle={boxStyle}
            compact={isFillQuestion(question)}
            editable={editable}
            height={height}
            onHeightChange={onHeightChange}
          >
            {essayContent?.images && (
              <EssayImages
                markup={essayContent.images}
                number={number}
                editable={editable}
                layouts={imageLayouts}
                onLayoutChange={onImageLayoutChange}
              />
            )}
          </AnswerBox>
        </div>
      )}
    </div>
  );
}

interface AnswerSheetComposerProps {
  title: string;
  description?: string;
  resourceType: AnswerSheetResourceType;
  resourceId: string;
  resourceLabel: "试卷" | "讲义";
  questions: AnswerSheetQuestion[];
  totalScore?: number;
  initialSettings?: Partial<AnswerSheetSettings>;
  initialViewMode?: "edit" | "preview";
  onSettingsChange?: (settings: AnswerSheetSettings) => void;
  onBack: () => void;
}

function buildInitialSettings(initialSettings?: Partial<AnswerSheetSettings>): AnswerSheetSettings {
  return {
    ...DEFAULT_ANSWER_SHEET_SETTINGS,
    ...initialSettings,
    studentNumberDigits: normalizeStudentNumberDigits(
      initialSettings?.studentNumberDigits ?? DEFAULT_ANSWER_SHEET_SETTINGS.studentNumberDigits,
    ),
    widePaperColumns: initialSettings?.widePaperColumns === 3 ? 3 : 2,
    answerBoxStyle: initialSettings?.answerBoxStyle === "dashed" ? "dashed" : "solid",
  };
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function AnswerSheetComposer({
  title,
  description,
  resourceType,
  resourceId,
  resourceLabel,
  questions,
  totalScore,
  initialSettings,
  initialViewMode = "edit",
  onSettingsChange,
  onBack,
}: AnswerSheetComposerProps) {
  const [settings, setSettings] = useState<AnswerSheetSettings>(() => buildInitialSettings(initialSettings));
  const [viewMode, setViewMode] = useState<"edit" | "preview">(initialViewMode);
  const [pageStarts, setPageStarts] = useState<number[]>([0]);
  const flowItemRefs = useRef(new Map<number, HTMLDivElement>());

  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const numberedQuestions = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const choiceItems = useMemo(
    () => numberedQuestions.filter(({ question }) => isChoiceQuestion(question)),
    [numberedQuestions],
  );
  const fillItems = useMemo(
    () => numberedQuestions.filter(({ question }) => isFillQuestion(question)),
    [numberedQuestions],
  );
  const qrPayload = useMemo(
    () => buildAnswerSheetQrPayload(resourceType, resourceId),
    [resourceId, resourceType],
  );

  const paperSize = paperSizeConfig[settings.paperSize];
  const paperColumns = paperSize.supportsMultipleColumns ? settings.widePaperColumns : 1;
  const logicalPageWidthMm = paperSize.physicalWidthMm / paperColumns;
  const pageContentHeightPx = (paperSize.heightMm - PAGE_PADDING_MM * 2) * MM_TO_CSS_PX;
  const isPreview = viewMode === "preview";

  const updateSettings = (patch: Partial<AnswerSheetSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateAnswerBoxHeight = (questionId: string, height: number) => {
    setSettings((current) => {
      if (current.answerBoxHeights?.[questionId] === height) return current;
      const next = {
        ...current,
        answerBoxHeights: { ...current.answerBoxHeights, [questionId]: height },
      };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateEssayImageLayout = (questionId: string, index: number, layout: AnswerSheetImageLayout) => {
    setSettings((current) => {
      const positions = [...(current.essayImageLayouts?.[questionId] || [])];
      positions[index] = layout;
      const next = {
        ...current,
        essayImageLayouts: { ...current.essayImageLayouts, [questionId]: positions },
      };
      onSettingsChange?.(next);
      return next;
    });
  };

  const flowItems = useMemo<FlowItem[]>(() => {
    const items: FlowItem[] = [{ key: "header", kind: "header" }];

    if (settings.mode === "with-questions" && settings.choiceLayout === "concentrated") {
      if (choiceItems.length > 0) {
        items.push({
          key: "zone-choice-heading",
          kind: "zone-heading",
          label: "选择题填涂区",
          testId: "concentrated-choice-area",
        });
        choiceItems.forEach((item, index) => {
          items.push({
            key: `zone-choice-${item.question.id}`,
            kind: "zone-choice",
            item,
            first: index === 0,
            last: index === choiceItems.length - 1,
          });
        });
      }

      if (fillItems.length > 0) {
        items.push({
          key: "zone-fill-heading",
          kind: "zone-heading",
          label: "填空题答题区",
          testId: "concentrated-fill-area",
        });
        fillItems.forEach((item, index) => {
          items.push({
            key: `zone-fill-${item.question.id}`,
            kind: "zone-fill",
            item,
            first: index === 0,
            last: index === fillItems.length - 1,
          });
        });
      }
    }

    groups.forEach((group, groupIndex) => {
      items.push({
        key: `group-heading-${group.type}`,
        kind: "group-heading",
        group,
        groupIndex,
      });
      group.items.forEach((item, itemIndex) => {
        items.push({
          key: `question-${item.question.id}`,
          kind: "question",
          item,
          group,
          groupIndex,
          first: itemIndex === 0,
          last: itemIndex === group.items.length - 1,
        });
      });
    });

    items.push({ key: "footer", kind: "footer" });
    return items;
  }, [choiceItems, fillItems, groups, settings.choiceLayout, settings.mode]);

  const recalculatePagination = useCallback(() => {
    if (flowItems.length === 0 || pageContentHeightPx <= 0) return;

    const heights = flowItems.map((_, index) => {
      const node = flowItemRefs.current.get(index);
      return node ? node.getBoundingClientRect().height : null;
    });
    if (heights.some((height) => height === null)) return;

    const nextStarts = [0];
    let usedHeight = 0;

    for (let index = 0; index < flowItems.length; index += 1) {
      const height = heights[index] || 0;
      const flowItem = flowItems[index];
      const keepWithNext = flowItem.kind === "zone-heading" || flowItem.kind === "group-heading";
      const nextHeight = keepWithNext && index + 1 < heights.length
        ? (heights[index + 1] || 0)
        : 0;
      const requiredHeight = height + nextHeight;

      if (usedHeight > 0 && usedHeight + requiredHeight > pageContentHeightPx) {
        nextStarts.push(index);
        usedHeight = 0;
      }

      usedHeight += height;
    }

    setPageStarts((current) => sameNumberArray(current, nextStarts) ? current : nextStarts);
  }, [flowItems, pageContentHeightPx]);

  useLayoutEffect(() => {
    recalculatePagination();
  }, [logicalPageWidthMm, pageStarts, recalculatePagination, settings.answerBoxStyle, viewMode]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => recalculatePagination());
    flowItemRefs.current.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [flowItems.length, pageStarts, recalculatePagination]);

  const logicalPages = useMemo(() => {
    const normalizedStarts = Array.from(new Set([
      0,
      ...pageStarts.filter((start) => start > 0 && start < flowItems.length),
    ])).sort((left, right) => left - right);

    return normalizedStarts.map((start, pageIndex) => {
      const end = normalizedStarts[pageIndex + 1] ?? flowItems.length;
      return Array.from({ length: Math.max(0, end - start) }, (_, offset) => start + offset);
    });
  }, [flowItems.length, pageStarts]);

  const previewSheets = useMemo(() => {
    const sheets: number[][][] = [];
    for (let index = 0; index < logicalPages.length; index += paperColumns) {
      sheets.push(logicalPages.slice(index, index + paperColumns));
    }
    return sheets;
  }, [logicalPages, paperColumns]);

  const renderHeader = () => (
    <header
      className="box-border min-w-0 pb-4"
      data-testid="answer-sheet-first-column-header"
    >
      <div>
        <h1 className="mb-1 text-center font-serif text-xl font-bold">{title}</h1>
        {description && <div className="mb-3 text-center text-xs text-ink-500">{description}</div>}
      </div>

      <div
        className="flex min-w-0 items-stretch border border-ink-900"
        data-testid="answer-sheet-identity-area"
      >
        <div className="min-w-0 flex-1 p-2.5" data-testid="answer-sheet-identity-fields">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="shrink-0">班级：</span>
            <span className="h-5 min-w-10 flex-1 border-b border-ink-700" aria-label="班级填写区" />
          </div>
          <div className="flex items-stretch gap-2 text-sm">
            <span className="shrink-0 pt-1">姓名：</span>
            <span
              className="h-[13mm] min-w-0 flex-1 border border-dashed border-ink-700"
              aria-label="姓名签名填写区"
              data-answer-sheet-field="signature"
              data-signature-history-limit="10"
            />
          </div>
        </div>
        <div
          className="flex min-w-[43mm] max-w-[52mm] shrink-0 items-center border-l border-ink-900 p-2"
          data-testid="answer-sheet-student-number-column"
        >
          <StudentNumberGrid digits={settings.studentNumberDigits} />
        </div>
        <div
          className="answer-sheet-qr flex w-[24mm] shrink-0 flex-col items-center justify-center border-l border-ink-900 p-1.5"
          data-testid="answer-sheet-qr-position"
        >
          <QRCodeSVG
            value={qrPayload}
            size={82}
            style={{ width: "20mm", height: "20mm", display: "block" }}
            level="M"
            aria-label={`${resourceLabel}答题卡二维码`}
          />
          <div className="mt-1 w-full truncate text-center font-mono text-[7px] text-ink-500" title={resourceId}>
            {resourceType}:{resourceId}
          </div>
        </div>
      </div>
    </header>
  );

  const renderGroupItem = (item: NumberedQuestion) => {
    const { question } = item;
    if (settings.mode === "blank") {
      return (
        <AnswerField
          {...item}
          boxStyle={settings.answerBoxStyle}
          editable={!isPreview}
          height={settings.answerBoxHeights?.[question.id]}
          onHeightChange={(height) => updateAnswerBoxHeight(question.id, height)}
          imageLayouts={settings.essayImageLayouts?.[question.id]}
          onImageLayoutChange={(index, layout) => updateEssayImageLayout(question.id, index, layout)}
        />
      );
    }

    if (isChoiceQuestion(question)) {
      if (settings.choiceLayout === "inline") {
        return <InlineChoiceQuestion {...item} editable={!isPreview} />;
      }
      return <ChoiceQuestionText {...item} editable={!isPreview} />;
    }

    if (isFillQuestion(question)) {
      if (settings.choiceLayout === "inline") {
        return <FillQuestionInline {...item} editable={!isPreview} />;
      }
      return <QuestionStemOnly {...item} editable={!isPreview} />;
    }

    return (
      <QuestionWithAnswer
        {...item}
        boxStyle={settings.answerBoxStyle}
        editable={!isPreview}
        height={settings.answerBoxHeights?.[question.id]}
        onHeightChange={(height) => updateAnswerBoxHeight(question.id, height)}
        imageLayouts={settings.essayImageLayouts?.[question.id]}
        onImageLayoutChange={(index, layout) => updateEssayImageLayout(question.id, index, layout)}
      />
    );
  };

  const renderFlowItem = (flowItem: FlowItem) => {
    if (flowItem.kind === "header") return renderHeader();

    if (flowItem.kind === "zone-heading") {
      return (
        <div className="pt-1 pb-1 text-sm font-semibold" data-testid={flowItem.testId}>
          {flowItem.label}
        </div>
      );
    }

    if (flowItem.kind === "zone-choice" && flowItem.item) {
      return (
        <div
          className={`border-x border-ink-800 px-3 py-1.5 ${flowItem.first ? "border-t pt-3" : ""} ${flowItem.last ? "border-b pb-3 mb-4" : ""}`}
          data-answer-sheet-question
        >
          <ChoiceAnswer
            number={flowItem.item.number}
            optionCount={flowItem.item.question.options?.length || 4}
          />
        </div>
      );
    }

    if (flowItem.kind === "zone-fill" && flowItem.item) {
      return (
        <div
          className={`border-x border-ink-800 px-3 py-1.5 ${flowItem.first ? "border-t pt-3" : ""} ${flowItem.last ? "border-b pb-3 mb-4" : ""}`}
          data-answer-sheet-question
        >
          <AnswerBox
            number={flowItem.item.number}
            boxStyle={settings.answerBoxStyle}
            compact
            editable={!isPreview}
            height={settings.answerBoxHeights?.[flowItem.item.question.id]}
            onHeightChange={(height) => updateAnswerBoxHeight(flowItem.item!.question.id, height)}
          />
        </div>
      );
    }

    if (flowItem.kind === "group-heading" && flowItem.group && flowItem.groupIndex !== undefined) {
      return (
        <div className="pt-1 pb-1 text-sm font-semibold">
          {chineseSectionNumber(flowItem.groupIndex + 1)}、{flowItem.group.label}（{groupScoreLabel(flowItem.group)}）
        </div>
      );
    }

    if (flowItem.kind === "question" && flowItem.item) {
      return (
        <div
          className={`border-x border-ink-800 ${flowItem.item.question.type === "essay" ? "px-[1mm]" : "px-3"} py-2 ${flowItem.first ? "border-t pt-3" : ""} ${flowItem.last ? "border-b pb-3 mb-4" : ""}`}
          data-answer-sheet-question
        >
          {renderGroupItem(flowItem.item)}
        </div>
      );
    }

    return (
      <footer className="pt-2 text-center text-[10px] text-ink-500 border-t border-ink-300">
        {typeof totalScore === "number" ? `总分：${totalScore}分` : "答题结束后请检查学号与作答内容"}
      </footer>
    );
  };

  const renderPageContent = (indices: number[]) => (
    <div className="answer-sheet-page-content h-full overflow-hidden">
      {indices.map((flowIndex) => (
        <div
          key={flowItems[flowIndex].key}
          ref={(node) => {
            if (node) {
              flowItemRefs.current.set(flowIndex, node);
            } else {
              flowItemRefs.current.delete(flowIndex);
            }
          }}
          data-answer-sheet-flow-item={flowItems[flowIndex].kind}
        >
          {renderFlowItem(flowItems[flowIndex])}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-100 px-4 py-8">
      <div className="mx-auto max-w-[460mm]">
        <div className="no-print">
          <PageHeader
            title={isPreview ? "预览答题卡" : "制作答题卡"}
            description={`${resourceLabel}：${title}`}
            icon={<FileSpreadsheet className="h-5 w-5" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={onBack}>返回预览</Button>
                {isPreview ? (
                  <>
                    <Button variant="outline" onClick={() => setViewMode("edit")}>
                      <Pencil className="h-4 w-4" />
                      编辑答题卡
                    </Button>
                    <Button variant="gold" onClick={() => window.print()}>
                      <Printer className="h-4 w-4" />
                      打印答题卡
                    </Button>
                  </>
                ) : (
                  <Button variant="gold" onClick={() => setViewMode("preview")}>
                    <Eye className="h-4 w-4" />
                    预览答题卡
                  </Button>
                )}
              </div>
            }
          />

          {!isPreview && (
            <Card className="mb-6 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[1.2fr_1.1fr_0.65fr_0.65fr_0.65fr_0.8fr_auto] 2xl:items-end">
                <div>
                  <div className="mb-2 text-sm font-medium text-ink-700">答题卡内容</div>
                  <div className="flex h-[42px] items-center gap-5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                      <input
                        type="radio"
                        name="answer-sheet-mode"
                        checked={settings.mode === "blank"}
                        onChange={() => updateSettings({ mode: "blank" })}
                      />
                      仅答题区
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                      <input
                        type="radio"
                        name="answer-sheet-mode"
                        checked={settings.mode === "with-questions"}
                        onChange={() => updateSettings({ mode: "with-questions" })}
                      />
                      附题干
                    </label>
                  </div>
                </div>
                <Select
                  label="附题干答题区布局"
                  value={settings.choiceLayout}
                  disabled={settings.mode !== "with-questions"}
                  onChange={(event) => updateSettings({ choiceLayout: event.target.value as AnswerSheetChoiceLayout })}
                  options={[
                    { value: "inline", label: "填涂在选项中" },
                    { value: "concentrated", label: "填涂区集中" },
                  ]}
                />
                <Select
                  label="纸张"
                  value={settings.paperSize}
                  onChange={(event) => updateSettings({ paperSize: event.target.value as AnswerSheetPaperSize })}
                  options={[
                    { value: "A4", label: "A4" },
                    { value: "8K", label: "8K" },
                    { value: "A3", label: "A3" },
                  ]}
                />
                <Select
                  label="宽版栏数"
                  value={String(settings.widePaperColumns)}
                  disabled={!paperSize.supportsMultipleColumns}
                  onChange={(event) => updateSettings({ widePaperColumns: Number(event.target.value) as AnswerSheetWideColumns })}
                  options={[
                    { value: "2", label: "两栏" },
                    { value: "3", label: "三栏" },
                  ]}
                />
                <Select
                  label="答题框边线"
                  value={settings.answerBoxStyle}
                  onChange={(event) => updateSettings({ answerBoxStyle: event.target.value as AnswerSheetBoxStyle })}
                  options={[
                    { value: "solid", label: "实线" },
                    { value: "dashed", label: "虚线" },
                  ]}
                />
                <Input
                  label="学号位数"
                  type="number"
                  min={MIN_STUDENT_NUMBER_DIGITS}
                  max={MAX_STUDENT_NUMBER_DIGITS}
                  value={settings.studentNumberDigits}
                  onChange={(event) => updateSettings({
                    studentNumberDigits: normalizeStudentNumberDigits(Number(event.target.value)),
                  })}
                />
                <div className="flex h-[42px] items-center gap-2">
                  <Badge variant="ink">{questions.length}题</Badge>
                  {typeof totalScore === "number" && <Badge variant="gold">{totalScore}分</Badge>}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="answer-sheet-print-shell overflow-x-auto pb-8">
          {!isPreview ? (
            <div className="space-y-6" data-testid="answer-sheet-editor-pages">
              {logicalPages.map((indices, pageIndex) => (
                <article
                  key={`edit-page-${pageIndex}`}
                  className={`answer-sheet-paper answer-sheet-editor-page ${paperSize.className} relative mx-auto box-border overflow-hidden bg-white p-[8mm] text-ink-950 shadow-xl`}
                  style={{
                    width: `${logicalPageWidthMm}mm`,
                    height: `${paperSize.heightMm}mm`,
                  }}
                  data-paper-size={settings.paperSize}
                  data-paper-view="edit"
                  data-paper-columns="1"
                  data-paper-page={pageIndex + 1}
                >
                  {renderPageContent(indices)}
                </article>
              ))}
            </div>
          ) : (
            <div className="space-y-6" data-testid="answer-sheet-preview-pages">
              {previewSheets.map((sheetPages, sheetIndex) => (
                <article
                  key={`preview-sheet-${sheetIndex}`}
                  className={`answer-sheet-paper answer-sheet-preview-sheet ${paperSize.className} relative mx-auto box-border overflow-hidden bg-white text-ink-950 shadow-xl`}
                  style={{
                    width: `${paperSize.physicalWidthMm}mm`,
                    height: `${paperSize.heightMm}mm`,
                  }}
                  data-paper-size={settings.paperSize}
                  data-paper-view="preview"
                  data-paper-columns={paperColumns}
                  data-paper-page={sheetIndex + 1}
                >
                  <div
                    className="answer-sheet-preview-grid grid h-full"
                    style={{
                      gridTemplateColumns: `repeat(${paperColumns}, minmax(0, 1fr))`,
                      columnCount: paperColumns,
                    }}
                    data-testid="answer-sheet-column-flow"
                  >
                    {Array.from({ length: paperColumns }, (_, columnIndex) => {
                      const indices = sheetPages[columnIndex];
                      return (
                        <section
                          key={columnIndex}
                          className="answer-sheet-preview-column box-border h-full min-w-0 overflow-hidden p-[8mm]"
                          style={{ width: `${logicalPageWidthMm}mm` }}
                          data-editor-page={sheetIndex * paperColumns + columnIndex + 1}
                        >
                          {indices ? renderPageContent(indices) : null}
                        </section>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
