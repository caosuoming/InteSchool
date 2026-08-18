import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import {
  buildAnswerSheetQrPayload,
  DEFAULT_STUDENT_NUMBER_DIGITS,
  MAX_STUDENT_NUMBER_DIGITS,
  MIN_STUDENT_NUMBER_DIGITS,
  normalizeStudentNumberDigits,
  type AnswerSheetMode,
  type AnswerSheetPaperSize,
  type AnswerSheetQuestion,
  type AnswerSheetResourceType,
} from "@/lib/answer-sheet";

const paperSizeConfig: Record<AnswerSheetPaperSize, { width: string; minHeight: string }> = {
  A4: { width: "210mm", minHeight: "297mm" },
  A3: { width: "297mm", minHeight: "420mm" },
  "8K": { width: "260mm", minHeight: "370mm" },
};

const typeLabels: Record<string, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  short: "填空题",
  conceptFill: "概念填空",
  essay: "解答题",
};

const preferredTypeOrder = ["single", "multiple", "judge", "short", "conceptFill", "essay"];

interface QuestionGroup {
  type: string;
  label: string;
  items: Array<{ question: AnswerSheetQuestion; number: number }>;
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
    <div className="flex items-stretch border border-ink-900 bg-white">
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

function JudgeAnswer({ number }: { number: number }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-900">
      <span className="w-7 shrink-0 font-mono font-semibold">{number}.</span>
      <span>[√]</span>
      <span>[×]</span>
    </div>
  );
}

function FillAnswer({ number }: { number: number }) {
  return (
    <div className="flex items-end gap-2">
      <span className="w-7 shrink-0 font-mono text-xs font-semibold text-ink-800">{number}.</span>
      <span className="h-5 flex-1 border-b border-dashed border-ink-800" />
    </div>
  );
}

function EssayAnswer({ number }: { number: number }) {
  return (
    <div className="border border-ink-800 p-2">
      <div className="mb-2 font-mono text-xs font-semibold text-ink-800">{number}.</div>
      <div className="space-y-5">
        {Array.from({ length: 4 }, (_, line) => (
          <div key={line} className="border-b border-dashed border-ink-400" />
        ))}
      </div>
    </div>
  );
}

function AnswerField({ question, number }: { question: AnswerSheetQuestion; number: number }) {
  if (question.type === "single" || question.type === "multiple") {
    return <ChoiceAnswer number={number} optionCount={question.options?.length || 4} />;
  }
  if (question.type === "judge") return <JudgeAnswer number={number} />;
  if (question.type === "short" || question.type === "conceptFill") {
    return <FillAnswer number={number} />;
  }
  return <EssayAnswer number={number} />;
}

interface AnswerSheetComposerProps {
  title: string;
  description?: string;
  resourceType: AnswerSheetResourceType;
  resourceId: string;
  resourceLabel: "试卷" | "讲义";
  questions: AnswerSheetQuestion[];
  totalScore?: number;
  onBack: () => void;
}

export function AnswerSheetComposer({
  title,
  description,
  resourceType,
  resourceId,
  resourceLabel,
  questions,
  totalScore,
  onBack,
}: AnswerSheetComposerProps) {
  const [size, setSize] = useState<AnswerSheetPaperSize>("A4");
  const [mode, setMode] = useState<AnswerSheetMode>("blank");
  const [studentNumberDigits, setStudentNumberDigits] = useState(DEFAULT_STUDENT_NUMBER_DIGITS);
  const groups = useMemo(() => groupQuestions(questions), [questions]);
  const qrPayload = useMemo(
    () => buildAnswerSheetQrPayload(resourceType, resourceId),
    [resourceId, resourceType],
  );
  const paperSize = paperSizeConfig[size];

  return (
    <div className="min-h-screen bg-ink-100 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="no-print">
          <PageHeader
            title="制作答题卡"
            description={`${resourceLabel}：${title}`}
            icon={<FileSpreadsheet className="h-5 w-5" />}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={onBack}>返回预览</Button>
                <Button variant="gold" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  打印答题卡
                </Button>
              </div>
            }
          />

          <Card className="mb-6 p-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_0.8fr_0.8fr_auto] xl:items-end">
              <div>
                <div className="mb-2 text-sm font-medium text-ink-700">答题卡内容</div>
                <div className="flex h-[42px] items-center gap-5">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                    <input
                      type="radio"
                      name="answer-sheet-mode"
                      checked={mode === "blank"}
                      onChange={() => setMode("blank")}
                    />
                    仅答题区
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-600">
                    <input
                      type="radio"
                      name="answer-sheet-mode"
                      checked={mode === "with-questions"}
                      onChange={() => setMode("with-questions")}
                    />
                    附题干
                  </label>
                </div>
              </div>
              <Select
                label="纸张"
                value={size}
                onChange={(event) => setSize(event.target.value as AnswerSheetPaperSize)}
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
                value={studentNumberDigits}
                onChange={(event) => setStudentNumberDigits(normalizeStudentNumberDigits(Number(event.target.value)))}
              />
              <div className="flex h-[42px] items-center gap-2">
                <Badge variant="ink">{questions.length}题</Badge>
                {typeof totalScore === "number" && <Badge variant="gold">{totalScore}分</Badge>}
              </div>
            </div>
          </Card>
        </div>

        <div className="answer-sheet-print-shell overflow-x-auto pb-8">
          <article
            className="answer-sheet-paper mx-auto bg-white p-[8mm] text-ink-950 shadow-xl"
            style={{ width: paperSize.width, minHeight: paperSize.minHeight }}
          >
            <header className="mb-4">
              <h1 className="mb-1 text-center font-serif text-xl font-bold">{title}</h1>
              {description && <div className="mb-3 text-center text-xs text-ink-500">{description}</div>}

              <div className="grid grid-cols-[1fr_auto_auto] items-stretch border border-ink-900">
                <div className="grid content-center gap-4 p-4 text-sm">
                  <div className="flex items-end gap-2">
                    <span>姓名：</span><span className="h-5 min-w-36 flex-1 border-b border-ink-700" />
                    <span>班级：</span><span className="h-5 min-w-28 flex-1 border-b border-ink-700" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span>学号：</span><span className="h-5 max-w-64 flex-1 border-b border-ink-700" />
                  </div>
                </div>
                <StudentNumberGrid digits={studentNumberDigits} />
                <div className="flex min-w-28 flex-col items-center justify-center border-l border-ink-900 p-2">
                  <QRCodeSVG
                    value={qrPayload}
                    size={82}
                    level="M"
                    aria-label={`${resourceLabel}答题卡二维码`}
                  />
                  <div className="mt-1 max-w-28 truncate font-mono text-[8px] text-ink-500" title={resourceId}>
                    {resourceType}:{resourceId}
                  </div>
                </div>
              </div>
            </header>

            <main className="space-y-4">
              {groups.map((group, groupIndex) => (
                <section key={group.type}>
                  <div className="mb-1 text-sm font-semibold">
                    {groupIndex + 1}、{group.label}（{group.items.length}题）
                  </div>
                  <div className="space-y-2 border border-ink-800 p-3">
                    {group.items.map(({ question, number }) => (
                      <div key={question.id} className="break-inside-avoid">
                        {mode === "with-questions" && question.stem && (
                          <MathHtml className="mb-1 pl-7 text-xs text-ink-700">
                            {question.stem}
                          </MathHtml>
                        )}
                        <AnswerField question={question} number={number} />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </main>

            <footer className="mt-5 border-t border-ink-300 pt-2 text-center text-[10px] text-ink-500">
              {typeof totalScore === "number" ? `总分：${totalScore}分` : "答题结束后请检查学号与作答内容"}
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
