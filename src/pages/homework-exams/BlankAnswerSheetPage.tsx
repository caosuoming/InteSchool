import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Download, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "@/stores/ui";
import {
  BLANK_PAPER_MM, BLANK_QUESTION_TYPES, DEFAULT_BLANK_ANSWER_SHEET,
  blankAnswerSheetTotal, paginateBlankAnswerSheet,
  type BlankAnswerSheetConfig, type BlankQuestionType, type BlankSheetBlock,
} from "@/lib/blank-answer-sheet";
import "./BlankAnswerSheetPage.css";

const OPTIONS = ["A", "B", "C", "D"];
const INSTRUCTIONS = "请在各题目的答题区域作答，超出答题区域的答案无效";

function Identity({ config }: { config: BlankAnswerSheetConfig }) {
  return (
    <div className="blank-sheet-identity" data-testid="blank-sheet-identity">
      <div className="blank-sheet-heading">
        <strong>{config.title.trim() || "考试答题卡"}</strong>
        <span>{config.subtitle.trim() || "答题卡"}</span>
      </div>
      <div className="blank-sheet-student-fields">
        <span>姓名：<i /></span><span>班级：<i /></span><span>考号：<i /></span>
      </div>
      <div className="blank-sheet-notice-grid">
        {config.showInstructions && (
          <div className="blank-sheet-instructions">
            <b>注意事项</b>
            <div>{config.instructions}</div>
          </div>
        )}
        {config.identityMode === "barcode" ? (
          <div className="blank-sheet-barcode" aria-label="条形码粘贴区">
            <span>条形码粘贴区</span>
            <small>请将条形码粘贴在框内</small>
          </div>
        ) : (
          <div className="blank-sheet-exam-number" aria-label={config.examNumberDigits + "位考试号涂填区"}>
            <b>考试号涂填区（2B铅笔）</b>
            <div className="blank-sheet-number-columns">
              {Array.from({ length: config.examNumberDigits }, (_, digit) => (
                <div key={digit} className="blank-sheet-number-column">
                  <span>{digit + 1}</span>
                  {Array.from({ length: 10 }, (_, number) => <span className="blank-sheet-bubble" key={number}>{number}</span>)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionBlock({ block }: { block: BlankSheetBlock }) {
  const isChoice = block.type === "single" || block.type === "multiple" || block.type === "judge";
  const groups = [block.numbers.slice(0, 5), block.numbers.slice(5)];
  return (
    <section className="blank-sheet-question-block" style={{ height: block.heightMm + "mm" }} data-question-type={block.type}>
      <h3>{block.heading}</h3>
      {isChoice ? (
        <div className="blank-sheet-choice-groups">
          {groups.filter((group) => group.length > 0).map((group) => (
            <div className="blank-sheet-choice-group" key={group[0]}>
              {group.map((number) => (
                <div className="blank-sheet-choice-row" key={number} data-question-number={number}>
                  <span className="blank-sheet-number">{number}.</span>
                  {(block.type === "judge" ? ["对", "错"] : OPTIONS).map((option) =>
                    <span className="blank-sheet-choice" key={option}>{option}</span>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : block.type === "fill" ? (
        <div className="blank-sheet-fill-rows">
          {block.numbers.map((number) => <div key={number} className="blank-sheet-fill-row" data-question-number={number}><span>{number}.</span><i /></div>)}
        </div>
      ) : (
        <div className="blank-sheet-essay-box" style={{ height: block.answerSpaceMm + "mm" }} data-question-number={block.numbers[0]}>
          <span>{block.numbers[0]}.</span>
        </div>
      )}
    </section>
  );
}

async function exportPdf(pages: HTMLElement[], config: BlankAnswerSheetConfig) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"), import("html2canvas"),
  ]);
  const paper = BLANK_PAPER_MM[config.paperSize];
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [paper.width, paper.height], compress: true });
  const host = document.createElement("div");
  Object.assign(host.style, { position: "fixed", left: "-100000px", top: "0", backgroundColor: "#fff" });
  document.body.appendChild(host);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    for (const [index, source] of pages.entries()) {
      if (index > 0) pdf.addPage([paper.width, paper.height], "landscape");
      const clone = source.cloneNode(true) as HTMLElement;
      clone.style.boxShadow = "none";
      host.replaceChildren(clone);
      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff", scale: 2, logging: false, useCORS: true,
        windowWidth: Math.round(paper.width * 96 / 25.4),
        windowHeight: Math.round(paper.height * 96 / 25.4),
      });
      pdf.addImage(canvas, "PNG", 0, 0, paper.width, paper.height, undefined, "FAST");
    }
    pdf.save((config.title.trim() || "空白答题卡").replace(/[\\/:*?"<>|]/g, "_") + ".pdf");
  } finally {
    host.remove();
  }
}

export default function BlankAnswerSheetPage() {
  const [config, setConfig] = useState<BlankAnswerSheetConfig>(() => ({
    ...DEFAULT_BLANK_ANSWER_SHEET,
    sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((section) => ({ ...section })),
  }));
  const [exporting, setExporting] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pages = useMemo(() => paginateBlankAnswerSheet(config), [config]);
  const totalQuestions = config.sections.reduce((sum, section) => sum + section.count, 0);
  const totalScore = blankAnswerSheetTotal(config.sections);

  const update = <K extends keyof BlankAnswerSheetConfig>(key: K, value: BlankAnswerSheetConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };
  const updateSection = (type: BlankQuestionType, key: "count" | "score", value: number) => {
    const limit = key === "count" ? BLANK_QUESTION_TYPES.find((item) => item.type === type)!.max : 100;
    const next = Number.isFinite(value) ? Math.min(limit, Math.max(0, value)) : 0;
    setConfig((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.type === type ? { ...section, [key]: key === "count" ? Math.trunc(next) : Math.round(next * 10) / 10 } : section),
    }));
  };

  const download = async () => {
    const nodes = Array.from(pagesRef.current?.querySelectorAll<HTMLElement>(".blank-sheet-page") || []);
    if (nodes.length === 0) return;
    setExporting(true);
    try {
      await exportPdf(nodes, config);
      toast.success("空白答题卡已下载");
    } catch (error) {
      toast.error("PDF 导出失败", error instanceof Error ? error.message : "未知错误");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="blank-answer-sheet-builder" data-testid="blank-answer-sheet-builder">
      <div className="no-print">
        <PageHeader
          title="制作空白答题卡"
          description="无需先创建试卷，设定题型、分值与考生信息即可生成可打印的答题卡。"
          action={<Link to="/homework-exams/exams" className="btn-outline flex items-center gap-1.5 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" />返回考试管理</Link>}
        />
      </div>
      <div className="blank-sheet-workspace">
        <aside className="blank-sheet-controls no-print">
          <div className="blank-sheet-control-heading">
            <h2>答题卡设置</h2>
            <Button size="sm" variant="ghost" onClick={() => setConfig({ ...DEFAULT_BLANK_ANSWER_SHEET, sections: DEFAULT_BLANK_ANSWER_SHEET.sections.map((item) => ({ ...item })) })}>
              <RotateCcw className="h-3.5 w-3.5" />恢复默认
            </Button>
          </div>
          <div className="blank-sheet-control-body">
            <Input label="考试名称" maxLength={60} value={config.title} onChange={(event) => update("title", event.target.value)} />
            <Input label="副标题" maxLength={50} value={config.subtitle} onChange={(event) => update("subtitle", event.target.value)} />
            <Select label="纸张规格" value={config.paperSize} onChange={(event) => update("paperSize", event.target.value as BlankAnswerSheetConfig["paperSize"])}
              options={[{ label: "A4 横向（三栏）", value: "A4" }, { label: "A3 横向（三栏）", value: "A3" }]} />
            <div className="blank-sheet-control-section">
              <h3>题型与分值</h3>
              <p>题号按下列顺序连续编排，题量为 0 的题型不打印。</p>
              <div className="blank-sheet-section-table">
                <span>题型</span><span>题量</span><span>每题分值</span>
                {BLANK_QUESTION_TYPES.map(({ type, label, max }) => {
                  const section = config.sections.find((item) => item.type === type)!;
                  return (
                    <div className="blank-sheet-section-row" key={type}>
                      <span>{label}</span>
                      <input aria-label={label + "题量"} type="number" min={0} max={max} step={1} value={section.count}
                        onChange={(event) => updateSection(type, "count", Number(event.target.value))} />
                      <input aria-label={label + "每题分值"} type="number" min={0} max={100} step={0.5} value={section.score}
                        onChange={(event) => updateSection(type, "score", Number(event.target.value))} />
                    </div>
                  );
                })}
              </div>
              <div className="blank-sheet-total">{totalQuestions} 题 · 满分 {totalScore} 分 · {pages.length} 页</div>
              <Input label="每道解答题答题区高度（毫米）" type="number" min={30} max={150} step={5} value={config.essaySpaceMm}
                onChange={(event) => update("essaySpaceMm", Math.max(30, Math.min(150, Number(event.target.value) || 30)))} />
            </div>
            <div className="blank-sheet-control-section">
              <h3>考生信息</h3>
              <div className="blank-sheet-radio-list">
                <label><input type="radio" name="blank-identity" checked={config.identityMode === "barcode"} onChange={() => update("identityMode", "barcode")} />条形码粘贴区</label>
                <label><input type="radio" name="blank-identity" checked={config.identityMode === "examNumber"} onChange={() => update("identityMode", "examNumber")} />考试号填涂区</label>
              </div>
              {config.identityMode === "examNumber" && (
                <Input label="考试号位数" type="number" min={4} max={10} step={1} value={config.examNumberDigits}
                  onChange={(event) => update("examNumberDigits", Math.max(4, Math.min(10, Math.trunc(Number(event.target.value) || 4))))} />
              )}
            </div>
            <div className="blank-sheet-control-section">
              <label className="blank-sheet-switch"><input type="checkbox" checked={config.showInstructions} onChange={(event) => update("showInstructions", event.target.checked)} />显示注意事项</label>
              {config.showInstructions && <Textarea label="注意事项内容" rows={4} maxLength={90} value={config.instructions} onChange={(event) => update("instructions", event.target.value)} />}
            </div>
          </div>
        </aside>
        <div className="blank-sheet-preview">
          <div className="blank-sheet-preview-bar no-print">
            <div><strong>打印预览</strong><span>{config.paperSize} 横向 · {pages.length} 页，打印时请使用 100% 比例</span></div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />打印</Button>
              <Button variant="gold" loading={exporting} disabled={exporting} onClick={() => void download()}><Download className="h-4 w-4" />下载 PDF</Button>
            </div>
          </div>
          <div ref={pagesRef} className="blank-sheet-stack">
            {pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                className={"blank-sheet-page blank-sheet-paper-" + config.paperSize.toLowerCase()}
                style={{ width: BLANK_PAPER_MM[config.paperSize].width + "mm", height: BLANK_PAPER_MM[config.paperSize].height + "mm" }}
                data-testid="blank-sheet-page"
              >
                <span className="blank-sheet-marker top-left" /><span className="blank-sheet-marker top-right" />
                <span className="blank-sheet-marker bottom-left" /><span className="blank-sheet-marker bottom-right" />
                <div className="blank-sheet-columns">
                  {page.columns.map((blocks, columnIndex) => (
                    <div className="blank-sheet-column" key={columnIndex}>
                      {columnIndex === 0 ? <Identity config={config} /> : config.showInstructions ? <p className="blank-sheet-column-warning">{INSTRUCTIONS}</p> : null}
                      <div className="blank-sheet-column-content">
                        {blocks.map((block) => <QuestionBlock key={block.type + "-" + block.numbers[0]} block={block} />)}
                      </div>
                      {config.showInstructions && <div className="blank-sheet-column-footer">{INSTRUCTIONS}</div>}
                    </div>
                  ))}
                </div>
                <div className="blank-sheet-page-footer">第 {pageIndex + 1} 页 / 共 {pages.length} 页</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
