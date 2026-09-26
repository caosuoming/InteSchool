import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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

const paperSizeConfig: Record<AnswerSheetPaperSize, {
  editWidth: string;
  previewWidth: string;
  minHeight: string;
  className: string;
  supportsMultipleColumns: boolean;
}> = {
  A4: {
    editWidth: "210mm",
    previewWidth: "210mm",
    minHeight: "297mm",
    className: "answer-sheet-paper-a4",
    supportsMultipleColumns: false,
  },
  A3: {
    editWidth: "210mm",
    previewWidth: "420mm",
    minHeight: "297mm",
    className: "answer-sheet-paper-a3",
    supportsMultipleColumns: true,
  },
  "8K": {
    editWidth: "185mm",
    previewWidth: "370mm",
    minHeight: "260mm",
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

interface NumberedQuestion {
  question: AnswerSheetQuestion;
  number: number;
}

interface QuestionGroup {
  type: string;
  label: string;
  items: NumberedQuestion[];
}

interface QuestionGroupDraft {
  type: string;
  label: string;
  questions: AnswerSheetQuestion[];
}

function isChoiceQuestion(question: AnswerSheetQuestion): boolean {
  return question.type === "single" || question.type === "multiple";
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
              className="flex h-[15px] min-w-[17px] flex-1 items-center justify-center border border-ink-700 font-mono text-[8px] leading-none text-ink-700"
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
  children,
}: {
  number: number;
  hideNumber?: boolean;
  boxStyle: AnswerSheetBoxStyle;
  compact?: boolean;
  editable: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`answer-sheet-answer-box relative box-border max-w-full border border-ink-800 p-2 ${boxStyle === "dashed" ? "border-dashed" : "border-solid"}`}
      style={{
        width: "100%",
        minHeight: compact ? "13mm" : "30mm",
        resize: editable ? "both" : "none",
        overflow: "hidden",
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

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [children, editable]);

  return (
    <div ref={rootRef} className={className}>
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

function AnswerField({
  question,
  number,
  hideNumber = false,
  boxStyle,
  editable,
}: NumberedQuestion & {
  hideNumber?: boolean;
  boxStyle: AnswerSheetBoxStyle;
  editable: boolean;
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
      compact={question.type === "short" || question.type === "conceptFill"}
      editable={editable}
    >
      {essayContent?.images && (
        <DraggableQuestionContent className="min-w-0" editable={editable}>
          {essayContent.images}
        </DraggableQuestionContent>
      )}
    </AnswerBox>
  );
}

function QuestionWithAnswer({
  question,
  number,
  boxStyle,
  editable,
}: NumberedQuestion & { boxStyle: AnswerSheetBoxStyle; editable: boolean }) {
  const isFill = question.type === "short" || question.type === "conceptFill";
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
        <div className={displayStem ? "pl-7" : undefined} data-testid={isFill ? "fill-answer-region" : undefined}>
          <AnswerBox
            number={number}
            hideNumber={Boolean(displayStem)}
            boxStyle={boxStyle}
            compact={isFill}
            editable={editable}
          >
            {essayContent?.images && (
              <DraggableQuestionContent className="min-w-0" editable={editable}>
                {essayContent.images}
              </DraggableQuestionContent>
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
  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const numberedQuestions = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const choiceItems = useMemo(
    () => numberedQuestions.filter(({ question }) => isChoiceQuestion(question)),
    [numberedQuestions],
  );
  const qrPayload = useMemo(
    () => buildAnswerSheetQrPayload(resourceType, resourceId),
    [resourceId, resourceType],
  );
  const paperSize = paperSizeConfig[settings.paperSize];
  const isPreview = viewMode === "preview";
  const paperColumns = isPreview && paperSize.supportsMultipleColumns ? settings.widePaperColumns : 1;
  const paperWidth = isPreview ? paperSize.previewWidth : paperSize.editWidth;

  const updateSettings = (patch: Partial<AnswerSheetSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      onSettingsChange?.(next);
      return next;
    });
  };

  const renderGroupItem = (item: NumberedQuestion) => {
    const { question } = item;
    if (settings.mode === "blank") {
      return (
        <AnswerField
          {...item}
          boxStyle={settings.answerBoxStyle}
          editable={!isPreview}
        />
      );
    }
    if (isChoiceQuestion(question)) {
      if (settings.choiceLayout === "inline") {
        return <InlineChoiceQuestion {...item} editable={!isPreview} />;
      }
      return <ChoiceQuestionText {...item} editable={!isPreview} />;
    }
    return (
      <QuestionWithAnswer
        {...item}
        boxStyle={settings.answerBoxStyle}
        editable={!isPreview}
      />
    );
  };

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
                  label="附题干选择题填涂方式"
                  value={settings.choiceLayout}
                  disabled={settings.mode !== "with-questions"}
                  onChange={(event) => updateSettings({ choiceLayout: event.target.value as AnswerSheetChoiceLayout })}
                  options={[
                    { value: "inline", label: "填涂区在选项中" },
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
          <article
            className={`answer-sheet-paper ${paperSize.className} relative mx-auto box-border bg-white p-[8mm] text-ink-950 shadow-xl`}
            style={{ width: paperWidth, minHeight: paperSize.minHeight }}
            data-paper-size={settings.paperSize}
            data-paper-view={viewMode}
            data-paper-columns={paperColumns}
          >
            <div
              className={paperColumns > 1 ? "answer-sheet-columns" : undefined}
              style={paperColumns > 1 ? { columnCount: paperColumns } : undefined}
              data-testid="answer-sheet-column-flow"
            >
              <header
                className="relative mb-4 box-border min-w-0 break-inside-avoid"
                data-testid="answer-sheet-first-column-header"
              >
                <div
                  className="answer-sheet-qr absolute right-0 top-0 z-10 flex w-[24mm] flex-col items-center bg-white"
                  data-testid="answer-sheet-qr-position"
                >
                  <QRCodeSVG
                    value={qrPayload}
                    size={98}
                    style={{ width: "100%", height: "auto", display: "block" }}
                    level="M"
                    aria-label={`${resourceLabel}答题卡二维码`}
                  />
                  <div className="mt-1 w-full truncate text-center font-mono text-[8px] text-ink-500" title={resourceId}>
                    {resourceType}:{resourceId}
                  </div>
                </div>

                <div className="pr-[27mm]">
                  <h1 className="mb-1 text-center font-serif text-xl font-bold">{title}</h1>
                  {description && <div className="mb-3 text-center text-xs text-ink-500">{description}</div>}
                </div>

                <div
                  className="mr-[27mm] flex min-w-0 items-stretch border border-ink-900"
                  data-testid="answer-sheet-identity-area"
                >
                  <div className="min-w-0 flex-1 p-2.5" data-testid="answer-sheet-identity-fields">
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="shrink-0">班级：</span>
                      <span className="h-5 min-w-20 flex-1 border-b border-ink-700" aria-label="班级填写区" />
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
                    className="flex min-w-[48mm] shrink-0 items-center border-l border-ink-900 p-2.5"
                    data-testid="answer-sheet-student-number-column"
                  >
                    <StudentNumberGrid digits={settings.studentNumberDigits} />
                  </div>
                </div>
              </header>

              <main className={paperColumns > 1 ? "contents" : "space-y-4"}>
              {settings.mode === "with-questions" && settings.choiceLayout === "concentrated" && choiceItems.length > 0 && (
                <section className="mb-4 break-inside-avoid" data-testid="concentrated-choice-area">
                  <div className="mb-1 text-sm font-semibold">选择题填涂区</div>
                  <div className="space-y-2 border border-ink-800 p-3">
                    {choiceItems.map(({ question, number }) => (
                      <ChoiceAnswer
                        key={question.id}
                        number={number}
                        optionCount={question.options?.length || 4}
                      />
                    ))}
                  </div>
                </section>
              )}

              {groups.map((group, groupIndex) => (
                <section key={group.type} className="mb-4">
                  <div className="mb-1 text-sm font-semibold">
                    {groupIndex + 1}、{group.label}（{group.items.length}题）
                  </div>
                  <div className="space-y-2 border border-ink-800 p-3">
                    {group.items.map((item) => (
                      <div key={item.question.id} className="break-inside-avoid" data-answer-sheet-question>
                        {renderGroupItem(item)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              </main>
            </div>

            <footer className="mt-5 border-t border-ink-300 pt-2 text-center text-[10px] text-ink-500 [column-span:all]">
              {typeof totalScore === "number" ? `总分：${totalScore}分` : "答题结束后请检查学号与作答内容"}
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
