import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, Eye, FileSpreadsheet, Pencil, Printer } from "lucide-react";
import { toast } from "@/stores/ui";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import {
  buildAnswerSheetQrPayload,
  DEFAULT_ANSWER_SHEET_SETTINGS,
  MAX_STUDENT_NUMBER_DIGITS,
  MIN_STUDENT_NUMBER_DIGITS,
  normalizeAnswerSheetStemFontSize,
  normalizeStudentNumberDigits,
  type AnswerSheetBoxStyle,
  type AnswerSheetOptionBreak,
  type AnswerSheetChoiceLayout,
  type AnswerSheetChoiceDirection,
  type AnswerSheetPaperSize,
  type AnswerSheetInlineImageLayout,
  type AnswerSheetQuestion,
  type AnswerSheetProject,
  type AnswerSheetResourceType,
  type AnswerSheetSettings,
  type AnswerSheetWideColumns,
} from "@/lib/answer-sheet";
import { decorateFillBlankAnswerAreas } from "@/lib/fill-blank";
import { layoutChoiceOptions } from "@/lib/answer-sheet-choice-options";
import type { AnswerSheetImageLayout } from "@/lib/answer-sheet";
import { EssayImages } from "./EssayImages";
import { QuestionImages } from "./QuestionImages";

const PAGE_PADDING_MM = 8;
const COLUMN_GAP_MM = 6;
const WIDE_COLUMN_PAGE_NUMBER_MM = 6;
const MM_TO_CSS_PX = 96 / 25.4;
const CHOICE_GROUP_SIZE = 5;
const CHOICE_GROUP_GAP_MM = 5;
const CHOICE_VERTICAL_GROUP_WIDTH_MM = 48;
const CHOICE_NUMBER_WIDTH_MM = 8;
const CHOICE_OPTION_WIDTH_MM = 6;

const paperSizeConfig: Record<AnswerSheetPaperSize, {
  physicalWidthMm: number;
  heightMm: number;
  className: string;
}> = {
  A4: {
    physicalWidthMm: 210,
    heightMm: 297,
    className: "answer-sheet-paper-a4",
  },
  "16K": {
    physicalWidthMm: 185,
    heightMm: 260,
    className: "answer-sheet-paper-16k",
  },
  A3: {
    physicalWidthMm: 420,
    heightMm: 297,
    className: "answer-sheet-paper-a3",
  },
  "8K": {
    physicalWidthMm: 370,
    heightMm: 260,
    className: "answer-sheet-paper-8k",
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

const EMPTY_PROJECTS: AnswerSheetProject[] = [];

const answerSheetTypeOrder = ["single", "multiple", "judge", "short", "conceptFill", "essay", "comprehensive"];

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

function choiceOptionCount(question: AnswerSheetQuestion): number {
  return Math.min(8, Math.max(2, question.options?.length || 4));
}

function groupChoiceRows(
  choices: NumberedQuestion[],
  direction: AnswerSheetChoiceDirection,
  widthMm: number,
): NumberedQuestion[][][] {
  const rows: NumberedQuestion[][][] = [];
  let usedWidth = 0;
  for (let index = 0; index < choices.length; index += CHOICE_GROUP_SIZE) {
    const group = choices.slice(index, index + CHOICE_GROUP_SIZE);
    const width = direction === "vertical"
      ? CHOICE_VERTICAL_GROUP_WIDTH_MM
      : CHOICE_NUMBER_WIDTH_MM + Math.max(...group.map(({ question }) => choiceOptionCount(question))) * CHOICE_OPTION_WIDTH_MM;
    const gap = usedWidth > 0 ? CHOICE_GROUP_GAP_MM : 0;
    if (usedWidth > 0 && usedWidth + gap + width > widthMm) usedWidth = 0;
    if (usedWidth === 0) rows.push([]);
    rows[rows.length - 1].push(group);
    usedWidth += (usedWidth > 0 ? CHOICE_GROUP_GAP_MM : 0) + width;
  }
  return rows;
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
    return scores.map((score, index) => `第${group.items[index].question.label || group.items[index].number}题${score}分`).join("，");
  }
  const knownScores = group.items
    .filter(({ question }) => typeof question.score === "number" && Number.isFinite(question.score))
    .map(({ question, number }) => `第${question.label || number}题${question.score}分`);
  return knownScores.length
    ? `${group.items.length}题，${knownScores.join("，")}`
    : `${group.items.length}题`;
}

interface FlowItem {
  key: string;
  kind:
    | "zone-heading"
    | "zone-choice"
    | "zone-fill"
    | "group-heading"
    | "question"
    | "footer";
  item?: NumberedQuestion;
  choiceGroups?: NumberedQuestion[][];
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

function groupQuestions(questions: AnswerSheetQuestion[], consolidateTypes = false): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  const byType = new Map<string, QuestionGroup>();
  questions.forEach((question, index) => {
    const type = question.type;
    const existing = consolidateTypes ? byType.get(type) : groups[groups.length - 1];
    if (existing?.type === type) {
      existing.items.push({ question, number: index + 1 });
    } else {
      const group = {
        type,
        label: typeLabels[type] || type,
        items: [{ question, number: index + 1 }],
      };
      groups.push(group);
      if (consolidateTypes) byType.set(type, group);
    }
  });
  if (consolidateTypes) {
    const priority = (type: string) => {
      const index = answerSheetTypeOrder.indexOf(type);
      return index < 0 ? answerSheetTypeOrder.length : index;
    };
    groups.sort((left, right) => priority(left.type) - priority(right.type));
  }
  return groups;
}

function groupProjectQuestions(questions: AnswerSheetQuestion[], projects: AnswerSheetProject[]): QuestionGroup[] {
  const projectIds = new Set(projects.map((project) => project.id));
  const numbered = questions.map((question, index) => ({ question, number: index + 1 }));
  const ungrouped = numbered.filter(({ question }) => !question.projectId || !projectIds.has(question.projectId));
  return [
    ...(ungrouped.length ? [{ type: "project", label: "未分组", items: ungrouped }] : []),
    ...projects.map((project) => ({
      type: "project",
      label: project.name,
      items: numbered.filter(({ question }) => question.projectId === project.id),
    })).filter((group) => group.items.length > 0),
  ];
}

function StudentNumberGrid({ digits }: { digits: number }) {
  return (
    <div
      className="w-[46mm] shrink-0 space-y-0.5 bg-white"
      aria-label={`${digits}位学号涂填区`}
      data-testid="student-number-grid"
    >
      {Array.from({ length: digits }, (_, row) => (
        <div key={row} className="flex gap-0.5" data-testid="student-number-row">
          {Array.from({ length: 10 }, (_, digit) => (
            <span
              key={digit}
              className="flex h-[4mm] w-[4mm] shrink-0 items-center justify-center border border-ink-700 font-mono text-[8px] leading-none text-ink-700"
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

function ChoiceAnswer({ number, optionCount, direction = "horizontal", grouped = false }: {
  number: number | string;
  optionCount: number;
  direction?: AnswerSheetChoiceDirection;
  grouped?: boolean;
}) {
  const count = Math.min(8, Math.max(2, optionCount || 4));
  const vertical = direction === "vertical";
  return (
    <div
      className={vertical ? "flex w-[8mm] flex-col items-center gap-1" : "flex items-center"}
      style={!vertical && !grouped ? { width: `${CHOICE_NUMBER_WIDTH_MM + count * CHOICE_OPTION_WIDTH_MM}mm` } : undefined}
      data-testid="choice-answer"
    >
      <span className={vertical
        ? "font-mono text-xs font-semibold text-ink-800"
        : "w-[8mm] shrink-0 font-mono text-xs font-semibold text-ink-800"}>{number}.</span>
      <div
        className={vertical ? "flex flex-col items-center gap-[1mm]" : "flex min-w-0 flex-1 items-center"}
        data-testid="choice-answer-options"
        data-direction={direction}
      >
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={vertical
              ? "font-mono text-xs text-ink-900"
              : "min-w-0 flex-1 whitespace-nowrap text-center font-mono text-xs text-ink-900"}
          >
            [{String.fromCharCode(65 + index)}]
          </span>
        ))}
      </div>
    </div>
  );
}

function ChoiceAnswerGroup({ items, direction }: {
  items: NumberedQuestion[];
  direction: AnswerSheetChoiceDirection;
}) {
  const width = direction === "vertical"
    ? CHOICE_VERTICAL_GROUP_WIDTH_MM
    : CHOICE_NUMBER_WIDTH_MM + Math.max(...items.map(({ question }) => choiceOptionCount(question))) * CHOICE_OPTION_WIDTH_MM;
  return (
    <div
      className={direction === "vertical"
        ? "flex shrink-0 items-start justify-between"
        : "flex shrink-0 flex-col gap-[1mm]"}
      style={{ width: `${width}mm` }}
      data-testid="choice-answer-group"
      data-direction={direction}
    >
      {items.map(({ question, number }) => (
        <ChoiceAnswer
          key={question.id}
          number={question.label || number}
          optionCount={choiceOptionCount(question)}
          direction={direction}
          grouped
        />
      ))}
    </div>
  );
}

function JudgeAnswer({ number, hideNumber = false }: { number: number | string; hideNumber?: boolean }) {
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
  lined = false,
  editable,
  height,
  width,
  resizableBoth = false,
  onHeightChange,
  onWidthChange,
  children,
}: {
  number: number | string;
  hideNumber?: boolean;
  boxStyle: AnswerSheetBoxStyle;
  compact?: boolean;
  lined?: boolean;
  editable: boolean;
  height?: number;
  width?: number;
  resizableBoth?: boolean;
  onHeightChange?: (height: number) => void;
  onWidthChange?: (width: number) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={`answer-sheet-answer-box relative box-border w-full border border-ink-800 p-2 ${boxStyle === "dashed" ? "border-dashed" : "border-solid"}`}
      style={{
        height: height ? `${height}px` : undefined,
        width: width ? `${width}px` : undefined,
        minHeight: compact ? "13mm" : "30mm",
        minWidth: resizableBoth ? "32mm" : undefined,
        maxWidth: "100%",
        resize: editable ? (resizableBoth ? "both" : "vertical") : "none",
        overflow: "hidden",
      }}
      onPointerUp={(event) => {
        if (!editable || event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const nextHeight = Math.round(rect.height);
        if (onHeightChange && nextHeight > 0 && nextHeight !== height) onHeightChange(nextHeight);
        const nextWidth = Math.round(rect.width);
        if (resizableBoth && onWidthChange && nextWidth > 0 && nextWidth !== width) onWidthChange(nextWidth);
      }}
      data-testid="answer-box"
      data-answer-box-style={boxStyle}
    >
      {!hideNumber && <div className="font-mono text-xs font-semibold text-ink-800">{number}.</div>}
      {children && (
        <div className="min-h-0 flow-root pr-[14mm] pb-[9mm]" data-testid="answer-box-content">
          {children}
        </div>
      )}
      {lined && <span className="answer-sheet-fill-rule" data-testid="fill-answer-rule" aria-hidden="true" />}
      <div
        className="pointer-events-none absolute bottom-0 right-0 flex h-[9mm] w-[13mm] items-center justify-center border-l border-t border-ink-800 bg-white text-[8px] text-ink-500"
        aria-label={`第${number}题评分框`}
      >
        得分
      </div>
    </div>
  );
}

interface QuestionImageProps {
  imageLayouts?: Record<string, AnswerSheetInlineImageLayout[]>;
  onImageLayoutChange: (part: string, index: number, layout: AnswerSheetInlineImageLayout) => void;
}

function DraggableQuestionContent({
  children,
  className,
  editable,
  number,
  part,
  imageLayouts,
  onImageLayoutChange,
}: {
  children: string;
  className?: string;
  editable: boolean;
  number: number | string;
  part: string;
} & QuestionImageProps) {
  return (
    <div
      className={`answer-sheet-question-content ${className || ""}`}
      data-answer-sheet-editable={editable ? "true" : "false"}
    >
      <QuestionImages
        markup={children}
        editable={editable}
        number={number}
        part={part}
        layouts={imageLayouts?.[part]}
        onLayoutChange={(index, layout) => onImageLayoutChange(part, index, layout)}
      />
    </div>
  );
}

interface ChoiceQuestionProps extends NumberedQuestion, QuestionImageProps {
  editable: boolean;
  breaks?: Record<number, AnswerSheetOptionBreak>;
}

/** Measures rendered option widths, including rich text and mathematical notation. */
function ChoiceOptions({
  question,
  number,
  editable,
  breaks,
  labelStyle,
  imageLayouts,
  onImageLayoutChange,
}: ChoiceQuestionProps & { labelStyle: "brackets" | "dots" }) {
  const options = useMemo(
    () => question.options?.length ? question.options : (labelStyle === "brackets" ? Array(4).fill("") as string[] : []),
    [question.options, labelStyle],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<number, HTMLDivElement>());
  const [measurements, setMeasurements] = useState<{ width: number; widths: number[] }>({
    width: 0,
    widths: [],
  });

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const width = root.clientWidth || root.getBoundingClientRect().width || 0;
    const widths = options.map((_, index) => {
      const element = optionRefs.current.get(index);
      return element ? (element.scrollWidth || element.getBoundingClientRect().width || 0) : 0;
    });
    setMeasurements((previous) => (
      previous.width === width && sameNumberArray(previous.widths, widths)
        ? previous
        : { width, widths }
    ));
  }, [options]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  const rows = layoutChoiceOptions(
    measurements.widths.length === options.length ? measurements.widths : options.map(() => 0),
    measurements.width,
    breaks,
  );
  const rowKey = rows.map((row) => row.join(",")).join("|");

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    optionRefs.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [measure, rowKey]);

  if (!options.length) return null;

  return (
    <div className="pl-7">
      <div ref={rootRef} className="space-y-1.5" data-testid="choice-option-layout">
        {rows.map((row) => (
          <div
            key={row[0]}
            className="grid min-w-0 items-start gap-2"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            data-testid="choice-option-row"
          >
            {row.map((index) => {
              const label = String.fromCharCode(65 + index);
              return (
                <div
                  key={index}
                  ref={(element) => {
                    if (element) optionRefs.current.set(index, element);
                    else optionRefs.current.delete(index);
                  }}
                  className="answer-sheet-choice-option inline-flex min-w-0 items-start gap-1.5 text-xs text-ink-800"
                  data-testid="choice-option"
                >
                  <span className="shrink-0 font-mono font-semibold">
                    {labelStyle === "brackets" ? `[${label}]` : `${label}.`}
                  </span>
                  {options[index] && (
                    <DraggableQuestionContent className="answer-sheet-choice-option-content min-w-0 max-w-full" editable={editable}
                      number={question.label || number} part={`option-${index}`} imageLayouts={imageLayouts} onImageLayoutChange={onImageLayoutChange}>
                      {options[index]}
                    </DraggableQuestionContent>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function InlineChoiceQuestion(props: ChoiceQuestionProps) {
  const { question, number, editable, imageLayouts, onImageLayoutChange } = props;
  return (
    <div className="space-y-2" data-testid="inline-choice-question" data-answer-sheet-question>
      <div className="flex items-start gap-0 text-xs text-ink-800">
        <span className="shrink-0 font-mono font-semibold">{question.label || number}.</span>
        <DraggableQuestionContent className="answer-sheet-question-stem min-w-0 flex-1 whitespace-pre-wrap" editable={editable}
        number={question.label || number} part="stem" imageLayouts={imageLayouts} onImageLayoutChange={onImageLayoutChange}>
          {question.stem}
        </DraggableQuestionContent>
      </div>
      <ChoiceOptions {...props} labelStyle="brackets" />
    </div>
  );
}

function ChoiceQuestionText(props: ChoiceQuestionProps) {
  const { question, number, editable, imageLayouts, onImageLayoutChange } = props;
  return (
    <div className="space-y-1.5" data-testid="concentrated-choice-question" data-answer-sheet-question>
      <div className="flex items-start gap-0 text-xs text-ink-800">
        <span className="shrink-0 font-mono font-semibold">{question.label || number}.</span>
        <DraggableQuestionContent className="answer-sheet-question-stem min-w-0 flex-1 whitespace-pre-wrap" editable={editable}
        number={question.label || number} part="stem" imageLayouts={imageLayouts} onImageLayoutChange={onImageLayoutChange}>
          {question.stem}
        </DraggableQuestionContent>
      </div>
      <ChoiceOptions {...props} labelStyle="dots" />
    </div>
  );
}

function FillQuestionInline({ question, number, editable, imageLayouts, onImageLayoutChange }: NumberedQuestion & { editable: boolean } & QuestionImageProps) {
  const decoratedStem = useMemo(
    () => decorateFillBlankAnswerAreas(question.stem),
    [question.stem],
  );

  return (
    <div className="flex items-start gap-0 text-xs text-ink-800" data-testid="inline-fill-question" data-answer-sheet-question>
      <span className="shrink-0 font-mono font-semibold">{question.label || number}.</span>
      <DraggableQuestionContent className="answer-sheet-question-stem min-w-0 flex-1 whitespace-pre-wrap" editable={editable}
        number={question.label || number} part="stem" imageLayouts={imageLayouts} onImageLayoutChange={onImageLayoutChange}>
        {decoratedStem}
      </DraggableQuestionContent>
    </div>
  );
}

function QuestionStemOnly({ question, number, editable, imageLayouts, onImageLayoutChange }: NumberedQuestion & { editable: boolean } & QuestionImageProps) {
  return (
    <div className="flex items-start gap-0 text-xs text-ink-800" data-testid="concentrated-fill-question" data-answer-sheet-question>
      <span className="shrink-0 font-mono font-semibold">{question.label || number}.</span>
      <DraggableQuestionContent className="answer-sheet-question-stem min-w-0 flex-1 whitespace-pre-wrap" editable={editable}
        number={question.label || number} part="stem" imageLayouts={imageLayouts} onImageLayoutChange={onImageLayoutChange}>
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
    return <ChoiceAnswer number={question.label || number} optionCount={question.options?.length || 4} />;
  }
  if (question.type === "judge") return <JudgeAnswer number={question.label || number} hideNumber={hideNumber} />;
  const essayContent = question.type === "essay"
    ? splitEssayStemContent(question.stem)
    : null;
  return (
    <AnswerBox
      number={question.label || number}
      hideNumber={hideNumber}
      boxStyle={boxStyle}
      compact={isFillQuestion(question)}
      lined={isFillQuestion(question)}
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
  stemImageLayouts,
  onStemImageLayoutChange,
}: NumberedQuestion & {
  boxStyle: AnswerSheetBoxStyle;
  editable: boolean;
  height?: number;
  onHeightChange?: (height: number) => void;
  imageLayouts?: AnswerSheetImageLayout[];
  onImageLayoutChange: (index: number, layout: AnswerSheetImageLayout) => void;
  stemImageLayouts?: Record<string, AnswerSheetInlineImageLayout[]>;
  onStemImageLayoutChange: (part: string, index: number, layout: AnswerSheetInlineImageLayout) => void;
}) {
  const essayContent = question.type === "essay"
    ? splitEssayStemContent(question.stem)
    : null;
  const displayStem = essayContent?.stem ?? question.stem;

  return (
    <div className="space-y-1.5" data-answer-sheet-question>
      {displayStem && (
        <div
          className="flex items-start gap-0 text-xs text-ink-700"
          data-testid={question.type === "essay" ? "essay-question-stem" : undefined}
        >
          <span className="shrink-0 font-mono font-semibold text-ink-800">{question.label || number}.</span>
          <DraggableQuestionContent className="answer-sheet-question-stem min-w-0 flex-1 whitespace-pre-wrap" editable={editable}
        number={question.label || number} part="stem" imageLayouts={stemImageLayouts} onImageLayoutChange={onStemImageLayoutChange}>
            {displayStem}
          </DraggableQuestionContent>
        </div>
      )}
      {question.type === "judge" ? (
        <div className={displayStem ? "pl-7" : undefined}>
          <JudgeAnswer number={question.label || number} hideNumber={Boolean(displayStem)} />
        </div>
      ) : (
        <div className={displayStem && question.type !== "essay" ? "pl-7" : undefined}>
          <AnswerBox
            number={question.label || number}
            hideNumber={Boolean(displayStem)}
            boxStyle={boxStyle}
            compact={isFillQuestion(question)}
            lined={isFillQuestion(question)}
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
  sourceLayoutMode?: "grouped" | "flat";
  projects?: AnswerSheetProject[];
  totalScore?: number;
  initialSettings?: Partial<AnswerSheetSettings>;
  initialViewMode?: "edit" | "preview";
  published?: boolean;
  onPublicationChange?: (publish: boolean, settings: AnswerSheetSettings) => Promise<void>;
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
    a4Columns: initialSettings?.a4Columns === 2 ? 2 : 1,
    concentratedChoiceDirection: initialSettings?.concentratedChoiceDirection === "vertical" ? "vertical" : "horizontal",
    answerBoxStyle: initialSettings?.answerBoxStyle === "dashed" ? "dashed" : "solid",
    stemFontSize: normalizeAnswerSheetStemFontSize(
      initialSettings?.stemFontSize ?? DEFAULT_ANSWER_SHEET_SETTINGS.stemFontSize,
    ),
  };
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function AnswerSheetComposer({
  title,
  resourceType,
  resourceId,
  resourceLabel,
  questions,
  sourceLayoutMode,
  projects = EMPTY_PROJECTS,
  totalScore,
  initialSettings,
  initialViewMode = "edit",
  published = false,
  onPublicationChange,
  onSettingsChange,
  onBack,
}: AnswerSheetComposerProps) {
  const [settings, setSettings] = useState<AnswerSheetSettings>(() => buildInitialSettings(initialSettings));
  const [viewMode, setViewMode] = useState<"edit" | "preview">(initialViewMode);
  const [pageStarts, setPageStarts] = useState<number[]>([0]);
  const [publishing, setPublishing] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState("");
  const flowItemRefs = useRef(new Map<number, HTMLDivElement>());
  const headerRef = useRef<HTMLElement>(null);

  const groups = useMemo(
    () => sourceLayoutMode === "flat" ? groupProjectQuestions(questions, projects) : groupQuestions(questions),
    [questions, projects, sourceLayoutMode],
  );
  const numberedQuestions = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const choiceItems = useMemo(
    () => numberedQuestions.filter(({ question }) => isChoiceQuestion(question)),
    [numberedQuestions],
  );
  const selectedChoice = choiceItems.find(({ question }) => question.id === selectedChoiceId) ?? choiceItems[0];
  const fillItems = useMemo(
    () => numberedQuestions.filter(({ question }) => isFillQuestion(question)),
    [numberedQuestions],
  );
  const qrPayload = useMemo(
    () => buildAnswerSheetQrPayload(resourceType, resourceId),
    [resourceId, resourceType],
  );

  const paperSize = paperSizeConfig[settings.paperSize];
  const isWidePaper = settings.paperSize === "A3" || settings.paperSize === "8K";
  const paperColumns = isWidePaper ? settings.widePaperColumns : settings.a4Columns;
  const columnWidthMm = (paperSize.physicalWidthMm - PAGE_PADDING_MM * 2 - COLUMN_GAP_MM * (paperColumns - 1)) / paperColumns;
  const pageContentHeightPx = (paperSize.heightMm - PAGE_PADDING_MM * 2) * MM_TO_CSS_PX;
  const isPreview = viewMode === "preview" || published;
  const wideEditor = !isPreview && isWidePaper;
  const choiceRows = useMemo(
    () => groupChoiceRows(choiceItems, settings.concentratedChoiceDirection, columnWidthMm - 7),
    [choiceItems, columnWidthMm, settings.concentratedChoiceDirection],
  );

  const changePublication = async (publish: boolean, print = false) => {
    if (!onPublicationChange || publishing) return;
    setPublishing(true);
    try {
      await onPublicationChange(publish, settings);
      toast.success(publish ? "答题卡已发布" : "已撤回发布");
      if (print) window.print();
    } catch (error) {
      toast.error("答题卡操作失败", error instanceof Error ? error.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const updateSettings = (patch: Partial<AnswerSheetSettings>) => {
    if (published) return;
    setSettings((current) => {
      const next = { ...current, ...patch };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateAnswerBoxHeight = (questionId: string, height: number) => {
    if (published) return;
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

  const updateAnswerBoxWidth = (questionId: string, width: number) => {
    if (published) return;
    setSettings((current) => {
      if (current.answerBoxWidths?.[questionId] === width) return current;
      const next = {
        ...current,
        answerBoxWidths: { ...current.answerBoxWidths, [questionId]: width },
      };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateChoiceOptionBreak = (questionId: string, index: number, value: AnswerSheetOptionBreak | "auto") => {
    if (published) return;
    setSettings((current) => {
      const perQuestion = { ...current.choiceOptionBreaks?.[questionId] };
      if (value === "auto") delete perQuestion[index];
      else perQuestion[index] = value;
      const choiceOptionBreaks = { ...current.choiceOptionBreaks };
      if (Object.keys(perQuestion).length) choiceOptionBreaks[questionId] = perQuestion;
      else delete choiceOptionBreaks[questionId];
      const next = { ...current, choiceOptionBreaks };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateQuestionImageLayout = (questionId: string, part: string, index: number, layout: AnswerSheetInlineImageLayout) => {
    if (published) return;
    setSettings((current) => {
      const questionLayouts = { ...current.questionImageLayouts?.[questionId] };
      const partLayouts = [...(questionLayouts[part] || [])];
      partLayouts[index] = layout;
      questionLayouts[part] = partLayouts;
      const next = {
        ...current,
        questionImageLayouts: { ...current.questionImageLayouts, [questionId]: questionLayouts },
      };
      onSettingsChange?.(next);
      return next;
    });
  };

  const updateEssayImageLayout = (questionId: string, index: number, layout: AnswerSheetImageLayout) => {
    if (published) return;
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
    const items: FlowItem[] = [];

    if (settings.mode === "with-questions" && settings.choiceLayout === "concentrated") {
      if (choiceItems.length > 0) {
        items.push({
          key: "zone-choice-heading",
          kind: "zone-heading",
          label: "选择题填涂区",
          testId: "concentrated-choice-area",
        });
        choiceRows.forEach((choiceGroups, index) => {
          items.push({
            key: `zone-choice-${index}`,
            kind: "zone-choice",
            choiceGroups,
            first: index === 0,
            last: index === choiceRows.length - 1,
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
        key: `group-heading-${groupIndex}`,
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
  }, [choiceItems, choiceRows, fillItems, groups, settings.choiceLayout, settings.mode]);

  const recalculatePagination = useCallback(() => {
    if (flowItems.length === 0 || pageContentHeightPx <= 0) return;

    const heights = flowItems.map((_, index) => {
      const node = flowItemRefs.current.get(index);
      return node ? node.getBoundingClientRect().height : null;
    });
    if (heights.some((height) => height === null)) return;

    const nextStarts = [0];
    let usedHeight = 0;
    let columnIndex = 0;
    const measuredHeaderHeight = headerRef.current?.getBoundingClientRect().height || 0;
    const pageNumberHeight = isWidePaper ? WIDE_COLUMN_PAGE_NUMBER_MM * MM_TO_CSS_PX : 0;

    for (let index = 0; index < flowItems.length; index += 1) {
      const height = heights[index] || 0;
      const flowItem = flowItems[index];
      const keepWithNext = flowItem.kind === "zone-heading" || flowItem.kind === "group-heading";
      const nextHeight = keepWithNext && index + 1 < heights.length
        ? (heights[index + 1] || 0)
        : 0;
      const requiredHeight = height + nextHeight;

      const hasHeader = isWidePaper ? columnIndex === 0 : columnIndex < paperColumns;
      const availableHeight = Math.max(0, pageContentHeightPx - pageNumberHeight
        - (hasHeader ? measuredHeaderHeight : 0));
      if (usedHeight > 0 && usedHeight + requiredHeight > availableHeight) {
        nextStarts.push(index);
        usedHeight = 0;
        columnIndex += 1;
      }

      usedHeight += height;
    }

    setPageStarts((current) => sameNumberArray(current, nextStarts) ? current : nextStarts);
  }, [flowItems, isWidePaper, pageContentHeightPx, paperColumns]);

  useLayoutEffect(() => {
    recalculatePagination();
  }, [
    columnWidthMm, pageStarts, recalculatePagination, settings.answerBoxStyle,
    settings.answerBoxHeights, settings.answerBoxWidths, settings.studentNumberDigits,
    settings.choiceOptionBreaks, settings.concentratedChoiceDirection, settings.stemFontSize,
    settings.questionImageLayouts, settings.essayImageLayouts, viewMode,
  ]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => recalculatePagination());
    flowItemRefs.current.forEach((node) => observer.observe(node));
    if (headerRef.current) observer.observe(headerRef.current);
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

  const sheets = useMemo(() => {
    const sheets: number[][][] = [];
    for (let index = 0; index < logicalPages.length; index += paperColumns) {
      sheets.push(logicalPages.slice(index, index + paperColumns));
    }
    return sheets;
  }, [logicalPages, paperColumns]);

  const renderHeader = () => (
    <header
      className="box-border w-full shrink-0 pb-4"
      ref={headerRef}
      data-testid="answer-sheet-page-header"
    >
      <h1 className="mb-1 text-center font-serif text-xl font-bold">{title}</h1>

      <div
        className="flex min-w-0 items-stretch border border-ink-900"
        data-testid="answer-sheet-identity-area"
      >
        <div
          className={isWidePaper ? "w-[38mm] shrink-0 px-[1mm] pb-[1mm] pt-[2.5mm]" : "w-[75mm] shrink-0 px-2.5 pb-2.5 pt-[4mm]"}
          data-testid="answer-sheet-identity-fields"
        >
          <div className={isWidePaper ? "mb-1 flex items-center gap-1 text-xs" : "mb-2 flex items-center gap-2 text-sm"}>
            <span className="shrink-0">班级：</span>
            <span className="h-5 min-w-10 flex-1 border-b border-ink-700" aria-label="班级填写区" />
          </div>
          <div className={isWidePaper ? "flex flex-col items-start gap-1 text-xs" : "flex flex-col items-start gap-1 text-sm"}>
            <div>姓名：</div>
            <span
              className="block h-[13mm] w-[26.67mm] shrink-0 border border-dashed border-ink-700"
              aria-label="姓名签名填写区"
              data-answer-sheet-field="signature"
              data-signature-history-limit="10"
            />
          </div>
        </div>
        <div className="contents">
          <div className="min-w-0 flex-1" aria-hidden="true" />
          <div
            className={isWidePaper
              ? "flex w-[49mm] shrink-0 items-center border-l border-ink-900 p-[1mm]"
              : "flex w-[52mm] shrink-0 items-center border-l border-ink-900 p-2"}
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
        return <InlineChoiceQuestion {...item} editable={!isPreview}
          imageLayouts={settings.questionImageLayouts?.[question.id]}
          onImageLayoutChange={(part, index, layout) => updateQuestionImageLayout(question.id, part, index, layout)}
          breaks={settings.choiceOptionBreaks?.[question.id]} />;
      }
      return <ChoiceQuestionText {...item} editable={!isPreview}
        imageLayouts={settings.questionImageLayouts?.[question.id]}
        onImageLayoutChange={(part, index, layout) => updateQuestionImageLayout(question.id, part, index, layout)}
        breaks={settings.choiceOptionBreaks?.[question.id]} />;
    }

    if (isFillQuestion(question)) {
      if (settings.choiceLayout === "inline") {
        return <FillQuestionInline {...item} editable={!isPreview}
          imageLayouts={settings.questionImageLayouts?.[question.id]}
          onImageLayoutChange={(part, index, layout) => updateQuestionImageLayout(question.id, part, index, layout)} />;
      }
      return <QuestionStemOnly {...item} editable={!isPreview}
        imageLayouts={settings.questionImageLayouts?.[question.id]}
        onImageLayoutChange={(part, index, layout) => updateQuestionImageLayout(question.id, part, index, layout)} />;
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
        stemImageLayouts={settings.questionImageLayouts?.[question.id]}
        onStemImageLayoutChange={(part, index, layout) => updateQuestionImageLayout(question.id, part, index, layout)}
      />
    );
  };

  const renderFlowItem = (flowItem: FlowItem) => {
    if (flowItem.kind === "zone-heading") {
      return (
        <div className="pt-1 pb-1 text-sm font-semibold" data-testid={flowItem.testId}>
          {flowItem.label}
        </div>
      );
    }

    if (flowItem.kind === "zone-choice" && flowItem.choiceGroups) {
      return (
        <div
          className={`flex flex-wrap gap-[5mm] border-x border-ink-800 px-3 py-1.5 ${flowItem.first ? "border-t pt-3" : ""} ${flowItem.last ? "border-b pb-3 mb-4" : ""}`}
          data-answer-sheet-question
          data-testid="choice-answer-row"
        >
          {flowItem.choiceGroups.map((items) => (
            <ChoiceAnswerGroup
              key={items[0].question.id}
              items={items}
              direction={settings.concentratedChoiceDirection}
            />
          ))}
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
            number={flowItem.item.question.label || flowItem.item.number}
            boxStyle={settings.answerBoxStyle}
            compact
            lined
            editable={!isPreview}
            resizableBoth
            height={settings.answerBoxHeights?.[flowItem.item.question.id]}
            width={settings.answerBoxWidths?.[flowItem.item.question.id]}
            onHeightChange={(height) => updateAnswerBoxHeight(flowItem.item!.question.id, height)}
            onWidthChange={(width) => updateAnswerBoxWidth(flowItem.item!.question.id, width)}
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
    <div className="answer-sheet-page-content min-h-0 flex-1 overflow-hidden">
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

  const renderColumn = (indices: number[] | undefined, columnIndex: number) => (
    <section
      key={columnIndex}
      className="answer-sheet-preview-column box-border flex h-full min-w-0 flex-col overflow-hidden"
      style={{ width: `${columnWidthMm}mm` }}
      data-editor-page={columnIndex + 1}
    >
      {isWidePaper && columnIndex === 0 && renderHeader()}
      {indices ? renderPageContent(indices) : <div className="min-h-0 flex-1" />}
      {isWidePaper && (
        <div
          className="flex h-[6mm] shrink-0 items-end justify-center text-[10px] text-ink-700"
          data-testid="answer-sheet-column-page-number"
        >
          {columnIndex + 1}
        </div>
      )}
    </section>
  );

  return (
    <div
      className="min-h-screen bg-ink-100 px-4 py-8"
      style={{ "--answer-sheet-stem-font-size": `${settings.stemFontSize}px` } as CSSProperties}
    >
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
                    <Button variant="outline" onClick={() => setViewMode("edit")} disabled={published}>
                      <Pencil className="h-4 w-4" />
                      编辑答题卡
                    </Button>
                    {onPublicationChange && (
                      <Button variant="outline" loading={publishing} onClick={() => void changePublication(!published)}>
                        {published ? "撤回发布" : "发布答题卡"}
                      </Button>
                    )}
                    <Button variant="gold" disabled={publishing} onClick={() => void (published ? Promise.resolve().then(() => window.print()) : changePublication(true, true))}>
                      <Download className="h-4 w-4" />
                      下载答题卡
                    </Button>
                    <Button variant="outline" disabled={publishing} onClick={() => void (published ? Promise.resolve().then(() => window.print()) : changePublication(true, true))}>
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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[1.2fr_1.1fr_0.65fr_0.65fr_0.65fr_0.8fr_0.8fr_auto] 2xl:items-end">
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
                      不显题干
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                      <input
                        type="radio"
                        name="answer-sheet-mode"
                        checked={settings.mode === "with-questions"}
                        onChange={() => updateSettings({ mode: "with-questions" })}
                      />
                      显题干
                    </label>
                  </div>
                </div>
                <Select
                  label="显题干答题区布局"
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
                    { value: "16K", label: "16K" },
                    { value: "8K", label: "8K" },
                    { value: "A3", label: "A3" },
                  ]}
                />
                <Select
                  label="题目栏数"
                  value={String(paperColumns)}
                  onChange={(event) => !isWidePaper
                    ? updateSettings({ a4Columns: Number(event.target.value) as 1 | 2 })
                    : updateSettings({ widePaperColumns: Number(event.target.value) as AnswerSheetWideColumns })}
                  options={!isWidePaper ? [
                    { value: "1", label: "单栏" },
                    { value: "2", label: "双栏" },
                  ] : [
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
                  label="题干字号（px）"
                  type="number"
                  min={10}
                  max={20}
                  value={settings.stemFontSize}
                  disabled={settings.mode !== "with-questions"}
                  onChange={(event) => updateSettings({
                    stemFontSize: normalizeAnswerSheetStemFontSize(Number(event.target.value)),
                  })}
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
              {settings.mode === "with-questions" && choiceItems.length > 0 && (
                <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-ink-200 pt-4" data-testid="answer-sheet-choice-controls">
                  <div className="w-36">
                    <Select
                      label="选择题号"
                      value={selectedChoice?.question.id ?? ""}
                      onChange={(event) => setSelectedChoiceId(event.target.value)}
                      options={choiceItems.map(({ question, number }) => ({
                        value: question.id,
                        label: "第" + (question.label || number) + "题",
                      }))}
                    />
                  </div>
                  {selectedChoice && Array.from(
                    { length: Math.min(8, Math.max(2, selectedChoice.question.options?.length || 4)) - 1 },
                    (_, offset) => offset + 1,
                  ).map((index) => {
                    const label = String.fromCharCode(65 + index);
                    return (
                      <div className="w-32" key={selectedChoice.question.id + "-" + index}>
                        <Select
                          label={label + " 选项位置"}
                          aria-label={"第" + (selectedChoice.question.label || selectedChoice.number) + "题选项" + label + "排列方式"}
                          value={settings.choiceOptionBreaks?.[selectedChoice.question.id]?.[index] ?? "auto"}
                          onChange={(event) => updateChoiceOptionBreak(
                            selectedChoice.question.id, index, event.target.value as AnswerSheetOptionBreak | "auto",
                          )}
                          options={[
                            { value: "auto", label: "自动" },
                            { value: "new-line", label: "另起一行" },
                            { value: "same-line", label: "接上一项" },
                          ]}
                        />
                      </div>
                    );
                  })}
                  {settings.choiceLayout === "concentrated" && (
                    <div className="w-36">
                      <Select
                        label="选择题填涂方向"
                        value={settings.concentratedChoiceDirection ?? "horizontal"}
                        onChange={(event) => updateSettings({
                          concentratedChoiceDirection: event.target.value as AnswerSheetChoiceDirection,
                        })}
                        options={[
                          { value: "horizontal", label: "横向" },
                          { value: "vertical", label: "竖向" },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="answer-sheet-print-shell overflow-x-auto pb-8">
          <div className="space-y-6" data-testid={isPreview ? "answer-sheet-preview-pages" : "answer-sheet-editor-pages"}>
            {wideEditor ? logicalPages.map((indices, columnIndex) => (
              <article
                key={columnIndex}
                className={`answer-sheet-paper answer-sheet-editor-page ${paperSize.className} relative mx-auto box-border overflow-hidden bg-white p-[8mm] text-ink-950 shadow-xl`}
                style={{
                  width: `${columnWidthMm + PAGE_PADDING_MM * 2}mm`,
                  height: `${paperSize.heightMm}mm`,
                }}
                data-paper-size={settings.paperSize}
                data-paper-view="edit"
                data-paper-columns="1"
                data-layout-columns={paperColumns}
                data-editor-page={columnIndex + 1}
              >
                {renderColumn(indices, columnIndex)}
              </article>
            )) : sheets.map((sheetColumns, sheetIndex) => (
              <article
                key={sheetIndex}
                className={`answer-sheet-paper ${isPreview ? "answer-sheet-preview-sheet" : "answer-sheet-editor-page"} ${paperSize.className} relative mx-auto flex box-border flex-col overflow-hidden bg-white p-[8mm] text-ink-950 shadow-xl`}
                style={{
                  width: `${paperSize.physicalWidthMm}mm`,
                  height: `${paperSize.heightMm}mm`,
                }}
                data-paper-size={settings.paperSize}
                data-paper-view={isPreview ? "preview" : "edit"}
                data-paper-columns={paperColumns}
                data-paper-page={sheetIndex + 1}
              >
                {!isWidePaper && sheetIndex === 0 && renderHeader()}
                <div
                  className="answer-sheet-preview-grid grid min-h-0 flex-1"
                  style={{
                    gridTemplateColumns: `repeat(${paperColumns}, minmax(0, 1fr))`,
                    columnGap: `${COLUMN_GAP_MM}mm`,
                  }}
                  data-testid="answer-sheet-column-flow"
                >
                  {Array.from({ length: paperColumns }, (_, columnIndex) => (
                    renderColumn(sheetColumns[columnIndex], sheetIndex * paperColumns + columnIndex)
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
