import { useMemo, useState } from "react";
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
  type AnswerSheetChoiceLayout,
  type AnswerSheetPaperSize,
  type AnswerSheetQuestion,
  type AnswerSheetResourceType,
  type AnswerSheetSettings,
} from "@/lib/answer-sheet";

const paperSizeConfig: Record<AnswerSheetPaperSize, {
  editWidth: string;
  previewWidth: string;
  minHeight: string;
  previewColumns: 1 | 2;
  className: string;
}> = {
  A4: { editWidth: "210mm", previewWidth: "210mm", minHeight: "297mm", previewColumns: 1, className: "answer-sheet-paper-a4" },
  A3: { editWidth: "210mm", previewWidth: "420mm", minHeight: "297mm", previewColumns: 2, className: "answer-sheet-paper-a3" },
  "8K": { editWidth: "185mm", previewWidth: "370mm", minHeight: "260mm", previewColumns: 2, className: "answer-sheet-paper-8k" },
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

function isChoiceQuestion(question: AnswerSheetQuestion): boolean {
  return question.type === "single" || question.type === "multiple";
}

function groupQuestions(questions: AnswerSheetQuestion[]): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>();
  questions.forEach((question, index) => {
    const current = groups.get(question.type) || {
      type: question.type,
      label: typeLabels[question.type] || question.type,
      items: [],
    };
    current.items.push({ question, number: index + 1 });
    groups.set(question.type, current);
  });

  const known = preferredTypeOrder
    .map((type) => groups.get(type))
    .filter((group): group is QuestionGroup => Boolean(group));
  const unknown = Array.from(groups.values()).filter(
    (group) => !preferredTypeOrder.includes(group.type),
  );
  return [...known, ...unknown];
}

function StudentNumberGrid({ digits }: { digits: number }) {
  return (
    <div className="inline-flex items-stretch border border-ink-900 bg-white">
      <div className="flex w-8 items-center justify-center bg-ink-100 text-xs font-semibold tracking-[0.3em] text-ink-800 [writing-mode:vertical-rl]">
        学号
      </div>
      <div className="space-y-0.5 p-1" aria-label={`${digits}位学号涂填区`}>
        {Array.from({ length: digits }, (_, row) => (
          <div key={row} className="flex gap-0.5" data-testid="student-number-row">
            {Array.from({ length: 10 }, (_, digit) => (
              <span
                key={digit}
                className="flex h-[15px] w-[23px] items-center justify-center border border-ink-700 font-mono text-[8px] leading-none text-ink-700"
              >
                [{digit}]
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
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

function FillAnswer({ number, hideNumber = false }: { number: number; hideNumber?: boolean }) {
  return (
    <div className="flex items-end gap-2">
      {!hideNumber && <span className="w-7 shrink-0 font-mono text-xs font-semibold text-ink-800">{number}.</span>}
      <span className="h-5 flex-1 border-b border-dashed border-ink-800" />
    </div>
  );
}

function EssayAnswer({ number, hideNumber = false }: { number: number; hideNumber?: boolean }) {
  return (
    <div className="border border-ink-800 p-2">
      {!hideNumber && <div className="mb-2 font-mono text-xs font-semibold text-ink-800">{number}.</div>}
      <div className="space-y-5">
        {Array.from({ length: 4 }, (_, line) => (
          <div key={line} className="border-b border-dashed border-ink-400" />
        ))}
      </div>
    </div>
  );
}

function AnswerField({ question, number, hideNumber = false }: NumberedQuestion & { hideNumber?: boolean }) {
  if (isChoiceQuestion(question)) {
    return <ChoiceAnswer number={number} optionCount={question.options?.length || 4} />;
  }
  if (question.type === "judge") return <JudgeAnswer number={number} hideNumber={hideNumber} />;
  if (question.type === "short" || question.type === "conceptFill") {
    return <FillAnswer number={number} hideNumber={hideNumber} />;
  }
  return <EssayAnswer number={number} hideNumber={hideNumber} />;
}

function InlineChoiceQuestion({ question, number }: NumberedQuestion) {
  const options = question.options?.length ? question.options : Array.from({ length: 4 }, () => "");
  return (
    <div className="space-y-2" data-testid="inline-choice-question">
      <div className="flex items-start gap-2 text-xs text-ink-800">
        <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
        <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
      </div>
      <div className="grid gap-1.5 pl-7 sm:grid-cols-2">
        {options.map((option, index) => {
          const label = String.fromCharCode(65 + index);
          return (
            <div key={`${label}-${index}`} className="flex min-w-0 items-start gap-1.5 text-xs text-ink-800">
              <span className="shrink-0 font-mono font-semibold">[{label}]</span>
              {option && <MathHtml className="min-w-0 flex-1">{option}</MathHtml>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuestionWithAnswer({ question, number }: NumberedQuestion) {
  return (
    <div className="space-y-1.5">
      {question.stem && (
        <div className="flex items-start gap-2 text-xs text-ink-700">
          <span className="w-7 shrink-0 font-mono font-semibold text-ink-800">{number}.</span>
          <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
        </div>
      )}
      <div className={question.stem ? "pl-7" : undefined}>
        <AnswerField question={question} number={number} hideNumber={Boolean(question.stem)} />
      </div>
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
  const choiceItems = useMemo<NumberedQuestion[]>(
    () => questions.flatMap((question, index) => isChoiceQuestion(question) ? [{ question, number: index + 1 }] : []),
    [questions],
  );
  const qrPayload = useMemo(
    () => buildAnswerSheetQrPayload(resourceType, resourceId),
    [resourceId, resourceType],
  );
  const paperSize = paperSizeConfig[settings.paperSize];
  const isPreview = viewMode === "preview";
  const paperColumns = isPreview ? paperSize.previewColumns : 1;
  const paperWidth = isPreview ? paperSize.previewWidth : paperSize.editWidth;

  const updateSettings = (patch: Partial<AnswerSheetSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      onSettingsChange?.(next);
      return next;
    });
  };

  const renderGroupItem = (item: NumberedQuestion) => {
    const { question, number } = item;
    if (settings.mode === "blank") return <AnswerField question={question} number={number} />;
    if (isChoiceQuestion(question)) {
      if (settings.choiceLayout === "inline") return <InlineChoiceQuestion question={question} number={number} />;
      return question.stem ? (
        <div className="flex items-start gap-2 text-xs text-ink-700">
          <span className="w-7 shrink-0 font-mono font-semibold text-ink-800">{number}.</span>
          <MathHtml className="min-w-0 flex-1 whitespace-pre-wrap">{question.stem}</MathHtml>
        </div>
      ) : null;
    }
    return <QuestionWithAnswer question={question} number={number} />;
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

          {!isPreview && <Card className="mb-6 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1.2fr_0.7fr_0.7fr_auto] xl:items-end">
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
          </Card>}
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
              className="answer-sheet-qr absolute z-10 flex flex-col items-center bg-white"
              style={{ top: "2.7%", right: "2.7%", width: "26mm" }}
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

            <header className="mb-4 pr-[32mm]">
              <h1 className="mb-1 text-center font-serif text-xl font-bold">{title}</h1>
              {description && <div className="mb-3 text-center text-xs text-ink-500">{description}</div>}

              <div className="border border-ink-900 p-3">
                <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 text-sm">
                  <span>姓名：</span><span className="h-5 min-w-36 flex-1 border-b border-ink-700" />
                  <span>班级：</span><span className="h-5 min-w-28 flex-1 border-b border-ink-700" />
                  <span>学号：</span><span className="h-5 min-w-36 flex-1 border-b border-ink-700" />
                </div>
                <StudentNumberGrid digits={settings.studentNumberDigits} />
              </div>
            </header>

            <main className={paperColumns === 2 ? "answer-sheet-two-column" : "space-y-4"}>
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
                <section key={group.type} className="mb-4 break-inside-avoid">
                  <div className="mb-1 text-sm font-semibold">
                    {groupIndex + 1}、{group.label}（{group.items.length}题）
                  </div>
                  <div className="space-y-2 border border-ink-800 p-3">
                    {group.items.map((item) => (
                      <div key={item.question.id} className="break-inside-avoid">
                        {renderGroupItem(item)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </main>

            <footer className="mt-5 border-t border-ink-300 pt-2 text-center text-[10px] text-ink-500 [column-span:all]">
              {typeof totalScore === "number" ? `总分：${totalScore}分` : "答题结束后请检查学号与作答内容"}
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
