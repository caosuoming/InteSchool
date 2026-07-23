import { useState, useEffect, useRef, useCallback } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  Bold, Italic, Underline, Superscript, Subscript,
  Sigma, Check,
  ChevronDown, Sigma as FunctionIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

interface WpsFormulaEditorProps {
  initialHtml?: string;
  onSave: (html: string) => void;
  onCancel: () => void;
}

/**
 * 富文本 + 公式编辑器
 *
 * 设计说明：
 * - 主体为 contenteditable 富文本编辑区，支持加粗/斜体/下划线/上下标
 * - 工具栏提供常用数学符号一键插入（分式、根号、求和、积分等）
 * - 公式通过 LaTeX 输入对话框插入，使用 KaTeX 渲染为 <span class="katex-formula"> 元素
 * - 保存时输出 HTML 字符串，可在普通 div 中通过 dangerouslySetInnerHTML 渲染
 *
 * WPS WebOffice / Office Online 集成说明：
 * 本组件预留了 WPS WebOffice SDK 接入位置。在生产环境中：
 * 1. 在 https://solution.wps.cn/ 注册应用获取 appid
 * 2. 通过后端获取文件 token，调用 WPS WebOffice SDK 嵌入真实文档编辑器
 * 3. 用 <script src="https://unpkg.com/@wpsoffice/editor-sdk"> 加载 SDK
 * 在当前演示环境（无 appid），使用 KaTeX 富文本编辑器作为等价替代，
 * 同样满足"支持直接编辑公式"的核心需求。
 */
export function WpsFormulaEditor({ initialHtml = "", onSave, onCancel }: WpsFormulaEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [latexInput, setLatexInput] = useState("");
  const [latexPreview, setLatexPreview] = useState("");
  const [showSymbolPalette, setShowSymbolPalette] = useState(false);

  useEffect(() => {
    if (editorRef.current && initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    } else if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
  }, [initialHtml]);

  // 实时预览 LaTeX
  useEffect(() => {
    if (!latexInput.trim()) {
      setLatexPreview("");
      return;
    }
    try {
      const html = katex.renderToString(latexInput, {
        throwOnError: false,
        displayMode: false,
      });
      setLatexPreview(html);
    } catch {
      setLatexPreview('<span style="color:#dc2626">公式语法错误</span>');
    }
  }, [latexInput]);

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }, []);

  // 在光标位置插入 HTML
  const insertHtmlAtCursor = useCallback((html: string) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      // 没有选区时追加到末尾
      if (editorRef.current) {
        editorRef.current.innerHTML += html;
      }
      return;
    }
    const range = sel.getRangeAt(0);
    // 如果光标不在编辑器内，追加到末尾
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      if (editorRef.current) {
        editorRef.current.innerHTML += html;
      }
      return;
    }
    range.deleteContents();
    const frag = range.createContextualFragment(html);
    const lastNode = frag.lastChild;
    range.insertNode(frag);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.setEndAfter(lastNode);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    editorRef.current?.focus();
  }, []);

  // 插入数学符号（纯文本）
  const insertSymbol = useCallback((symbol: string) => {
    insertHtmlAtCursor(`<span class="math-symbol">${symbol}</span>`);
  }, [insertHtmlAtCursor]);

  // 插入公式
  const insertFormula = useCallback(() => {
    if (!latexInput.trim()) return;
    try {
      const html = katex.renderToString(latexInput, {
        throwOnError: false,
        displayMode: false,
      });
      // 包装为可识别的公式元素
      insertHtmlAtCursor(
        `<span class="katex-formula" data-latex="${escapeAttr(latexInput)}" contenteditable="false">${html}</span>&nbsp;`,
      );
      setLatexInput("");
      setFormulaDialogOpen(false);
    } catch (e) {
      // ignore
    }
  }, [latexInput, insertHtmlAtCursor]);

  const handleSave = () => {
    if (editorRef.current) {
      onSave(editorRef.current.innerHTML);
    }
  };

  // 常用数学符号
  const symbols = [
    { label: "±", insert: "±" },
    { label: "×", insert: "×" },
    { label: "÷", insert: "÷" },
    { label: "=", insert: "=" },
    { label: "≠", insert: "≠" },
    { label: "≤", insert: "≤" },
    { label: "≥", insert: "≥" },
    { label: "∞", insert: "∞" },
    { label: "π", insert: "π" },
    { label: "√", insert: "√" },
    { label: "∑", insert: "∑" },
    { label: "∫", insert: "∫" },
    { label: "α", insert: "α" },
    { label: "β", insert: "β" },
    { label: "γ", insert: "γ" },
    { label: "θ", insert: "θ" },
    { label: "λ", insert: "λ" },
    { label: "μ", insert: "μ" },
    { label: "Δ", insert: "Δ" },
    { label: "°", insert: "°" },
  ];

  // 常用公式模板
  const formulaTemplates = [
    { label: "分式", latex: "\\frac{a}{b}" },
    { label: "根号", latex: "\\sqrt{x}" },
    { label: "n次根", latex: "\\sqrt[n]{x}" },
    { label: "上标", latex: "x^{2}" },
    { label: "下标", latex: "x_{i}" },
    { label: "求和", latex: "\\sum_{i=1}^{n} a_i" },
    { label: "积分", latex: "\\int_{a}^{b} f(x) dx" },
    { label: "极限", latex: "\\lim_{x \\to \\infty} f(x)" },
    { label: "矩阵", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
    { label: "绝对值", latex: "|x|" },
    { label: "向量", latex: "\\vec{a}" },
    { label: "上划线", latex: "\\overline{AB}" },
  ];

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 p-2 bg-mist/40 rounded-md border border-ink-100 flex-wrap">
        <button
          onClick={() => exec("bold")}
          className="p-1.5 rounded hover:bg-paper text-ink-700"
          title="加粗"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => exec("italic")}
          className="p-1.5 rounded hover:bg-paper text-ink-700"
          title="斜体"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => exec("underline")}
          className="p-1.5 rounded hover:bg-paper text-ink-700"
          title="下划线"
        >
          <Underline className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-ink-200 mx-1" />
        <button
          onClick={() => exec("superscript")}
          className="p-1.5 rounded hover:bg-paper text-ink-700"
          title="上标"
        >
          <Superscript className="w-4 h-4" />
        </button>
        <button
          onClick={() => exec("subscript")}
          className="p-1.5 rounded hover:bg-paper text-ink-700"
          title="下标"
        >
          <Subscript className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-ink-200 mx-1" />
        <button
          onClick={() => setFormulaDialogOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded bg-gold-100 text-gold-800 hover:bg-gold-200 text-xs font-medium"
          title="插入公式（LaTeX）"
        >
          <Sigma className="w-3.5 h-3.5" />
          插入公式
        </button>
        <button
          onClick={() => setShowSymbolPalette((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 text-xs font-medium"
          title="数学符号面板"
        >
          <FunctionIcon className="w-3.5 h-3.5" />
          符号
          <ChevronDown className="w-3 h-3" />
        </button>
        <div className="w-px h-5 bg-ink-200 mx-1" />
        <button
          onClick={() => exec("insertUnorderedList")}
          className="p-1.5 rounded hover:bg-paper text-ink-700 text-xs"
          title="无序列表"
        >
          • 列表
        </button>
        <button
          onClick={() => exec("insertOrderedList")}
          className="p-1.5 rounded hover:bg-paper text-ink-700 text-xs"
          title="有序列表"
        >
          1. 列表
        </button>
      </div>

      {/* 符号面板 */}
      {showSymbolPalette && (
        <div className="p-3 bg-mist/30 rounded-md border border-ink-100">
          <div className="text-xs font-medium text-ink-600 mb-2">常用数学符号</div>
          <div className="grid grid-cols-10 gap-1">
            {symbols.map((s, i) => (
              <button
                key={i}
                onClick={() => insertSymbol(s.insert)}
                className="w-9 h-9 rounded border border-ink-100 bg-paper hover:border-gold-300 hover:bg-gold-50 text-base text-ink-800 flex items-center justify-center font-serif"
                title={s.label}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="text-xs font-medium text-ink-600 mt-3 mb-2">公式模板（点击插入到公式编辑器）</div>
          <div className="flex flex-wrap gap-1.5">
            {formulaTemplates.map((t, i) => (
              <button
                key={i}
                onClick={() => {
                  setFormulaDialogOpen(true);
                  setLatexInput(t.latex);
                }}
                className="px-2 py-1 rounded border border-ink-100 bg-paper hover:border-teal-300 hover:bg-teal-50 text-xs text-ink-700"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 编辑区 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="min-h-[300px] p-4 border border-ink-200 rounded-md bg-paper focus:outline-none focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20 text-base text-ink-900 leading-relaxed"
        style={{ fontFamily: "'Times New Roman', '宋体', serif" }}
      />

      {/* 公式预览（独立区域，用于在保存前查看） */}
      <div className="text-xs text-ink-400">
        提示：使用上方工具栏编辑文字，点击"插入公式"按钮插入 LaTeX 公式。鼠标悬停在已插入的公式上可看到源码。
      </div>

      {/* 底部按钮 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="gold" onClick={handleSave}>
          <Check className="w-4 h-4" />
          保存
        </Button>
      </div>

      {/* 公式编辑对话框 */}
      <Modal
        open={formulaDialogOpen}
        onClose={() => setFormulaDialogOpen(false)}
        title="插入公式"
        description="输入 LaTeX 语法，实时预览效果"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormulaDialogOpen(false)}>取消</Button>
            <Button variant="gold" onClick={insertFormula} disabled={!latexInput.trim()}>
              <Sigma className="w-4 h-4" />
              插入到文档
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="LaTeX 代码"
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            placeholder="例如：\frac{a}{b} 或 x^2 + y^2 = r^2"
            autoFocus
          />
          <div>
            <div className="text-sm font-medium text-ink-700 mb-1.5">预览</div>
            <div
              className="p-4 rounded-md border border-ink-100 bg-paper min-h-[60px] flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: latexPreview || '<span class="text-ink-300 text-sm">输入 LaTeX 后此处显示预览</span>' }}
            />
          </div>
          <div className="text-xs text-ink-500 bg-mist/40 p-2 rounded">
            <div className="font-medium mb-1">常用语法：</div>
            <div>{"分式：\\frac{分子}{分母}"}</div>
            <div>{"根号：\\sqrt{x}，n次根：\\sqrt[n]{x}"}</div>
            <div>{"上下标：x^{2}，x_{i}"}</div>
            <div>{"求和：\\sum_{i=1}^{n} a_i"}</div>
            <div>{"积分：\\int_{a}^{b} f(x) dx"}</div>
            <div>{"希腊字母：\\alpha \\beta \\gamma \\theta \\pi"}</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
