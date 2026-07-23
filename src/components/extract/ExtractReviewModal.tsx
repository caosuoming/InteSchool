import { useCallback, useEffect, useState, useRef } from "react";
import "katex/dist/katex.min.css";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  Save,
  X,
  ChevronUp,
  ChevronDown,
  Merge,
  Split,
  FileText,
  BookOpen,
  Ban,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  RotateCcw,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useExtractConfigStore } from "@/stores/extractConfig";
import { extractService } from "@/services/extract";
import { examPaperService } from "@/services/examPaper";
import { lectureService } from "@/services/lecture";
import { parseDocxFromBase64, renderInlineMath } from "@/lib/docx-parser";
import type { QuestionType, Question, Material, Lecture, ExamPaper } from "@/types";

type BlockType = "question" | "knowledge" | "heading" | "unused";

interface DocBlock {
  id: string;
  type: BlockType;
  content: string;
  order: number;
  questionType?: QuestionType;
  options?: string[];
  answer?: string;
  analysis?: string;
  summary?: string;
  difficulty?: number;
  knowledgeTitle?: string;
  status: "new" | "duplicate" | "edited";
  duplicateOf?: Question | Material;
}

interface ExtractReviewModalProps {
  open: boolean;
  onClose: () => void;
  resourceId: string;
  resourceType: "examPaper" | "lecture";
  resourceTitle: string;
  chapterIds: string[];
  knowledgePointIds: string[];
  grade: string;
  schoolYear: string;
  onConfirmed?: () => void;
}

type Phase = "extracting" | "review" | "confirming";

const questionTypeLabel: Record<QuestionType, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  short: "填空",
  essay: "解答",
};

const blockTypeLabel: Record<BlockType, string> = {
  question: "题目",
  knowledge: "知识块",
  heading: "标题",
  unused: "未使用",
};

const optionLetter = (idx: number) => String.fromCharCode(65 + idx);

function genBlockId() {
  return `doc-block-${Math.random().toString(36).slice(2, 11)}`;
}

function generateMockDocBlocks(): DocBlock[] {
  return [
    {
      id: genBlockId(),
      type: "heading",
      content: "第一章 集合与函数",
      order: 0,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "knowledge",
      content:
        "集合是由确定的对象组成的整体。集合中的对象称为元素。集合具有确定性、互异性、无序性三个特征。\n\n常用的集合表示方法有：列举法、描述法、图示法。",
      order: 1,
      knowledgeTitle: "集合的基本概念",
      status: "new",
    },
    {
      id: genBlockId(),
      type: "question",
      content: "已知集合 A = {1, 2, 3}，B = {2, 3, 4}，则 A ∩ B =",
      order: 2,
      questionType: "single",
      options: ["{1}", "{2, 3}", "{2, 3, 4}", "{1, 2, 3, 4}"],
      answer: "B",
      analysis: "集合 A 与 B 的交集为两个集合的共同元素，即 {2, 3}。",
      difficulty: 2,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "question",
      content: "下列函数中，在定义域内单调递增的是（多选）",
      order: 3,
      questionType: "multiple",
      options: ["y = 2x + 1", "y = -x²", "y = log₂x", "y = (1/2)ˣ"],
      answer: "AC",
      analysis: "y=2x+1 斜率为正单调递增；y=log₂x 在定义域内单调递增。",
      difficulty: 3,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "knowledge",
      content:
        "交集：A ∩ B = {x | x ∈ A 且 x ∈ B}。\n并集：A ∪ B = {x | x ∈ A 或 x ∈ B}。\n\n交集取共同元素，并集取所有元素。",
      order: 4,
      knowledgeTitle: "交集与并集",
      status: "new",
    },
    {
      id: genBlockId(),
      type: "question",
      content: "函数 y = √(x-1) 的定义域为 [1, +∞)。",
      order: 5,
      questionType: "judge",
      answer: "正确",
      analysis: "要使根号内非负，需 x-1 ≥ 0，即 x ≥ 1，故定义域为 [1, +∞)。",
      difficulty: 2,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "question",
      content: "设集合 A = {x | 0 < x < 2}，B = {x | 1 ≤ x ≤ 3}，则 A ∩ B = ___",
      order: 6,
      questionType: "short",
      answer: "[1, 2)",
      analysis: "A ∩ B 即两集合的交集，x 同时满足 0<x<2 和 1≤x≤3，得 1≤x<2。",
      difficulty: 3,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "question",
      content:
        "已知集合 A = {x | x² - 3x + 2 = 0}，B = {x | x² - mx + 1 = 0}，若 B ⊆ A，求 m 的取值范围。",
      order: 7,
      questionType: "essay",
      answer: "m ∈ [-2, 2]",
      analysis:
        "A = {1, 2}。B ⊆ A 分情况讨论：B=∅、B={1}、B={2}、B={1,2}，分别求解后取并集。",
      difficulty: 4,
      status: "new",
    },
    {
      id: genBlockId(),
      type: "unused",
      content: "第一章结束，下一章将学习函数的性质与图像。",
      order: 8,
      status: "new",
    },
  ];
}

function parseDocContent(
  content: string,
  config: {
    headingKeywords: string[];
    questionKeywords: string[];
    answerKeywords: string[];
    analysisKeywords: string[];
    summaryKeywords: string[];
  },
): DocBlock[] {
  const blocks: DocBlock[] = [];
  const lines = content.split("\n");
  let currentBlock: Partial<DocBlock> = {};
  let order = 0;

  const headingPattern = new RegExp(
    `^(${config.headingKeywords.join("|")})[、．.．）)]`,
  );
  // 添加数字编号和"巩固题"识别
  const questionPattern = new RegExp(
    `^(?:(${config.questionKeywords.join("|")})|巩固题)[\\d\\s]*(?:题|\\.|\\）|\\))?[\\s\\d]*|^[\\d一二三四五六七八九十]+[、．.．）)]`,
  );
  const answerPattern = new RegExp(
    `^(${config.answerKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );
  const analysisPattern = new RegExp(
    `^(${config.analysisKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );
  const summaryPattern = new RegExp(
    `^(${config.summaryKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );

  const ignorePatterns = [
    /^[\s\t]*$/,
    /^[-—–]{3,}$/,
    /^=+$/,
    /^\*+$/,
  ];

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (ignorePatterns.some((p) => p.test(trimmedLine))) {
      return;
    }

    if (headingPattern.test(trimmedLine)) {
      if (currentBlock.content) {
        blocks.push({
          ...currentBlock,
          id: genBlockId(),
          order: order++,
          status: "new",
        } as DocBlock);
        currentBlock = {};
      }
      currentBlock.type = "heading";
      currentBlock.content = trimmedLine;
      return;
    }

    if (questionPattern.test(trimmedLine)) {
      if (currentBlock.content) {
        blocks.push({
          ...currentBlock,
          id: genBlockId(),
          order: order++,
          status: "new",
        } as DocBlock);
        currentBlock = {};
      }
      currentBlock.type = "question";
      currentBlock.content = trimmedLine;
      currentBlock.questionType = "single";
      currentBlock.options = [];
      return;
    }

    if (answerPattern.test(trimmedLine)) {
      currentBlock.answer = trimmedLine.replace(/^【答案】\s*/, "");
      return;
    }

    if (analysisPattern.test(trimmedLine)) {
      currentBlock.analysis = trimmedLine.replace(/^【解析】|^【分析】|^【解题思路】\s*/, "");
      return;
    }

    if (summaryPattern.test(trimmedLine)) {
      currentBlock.summary = trimmedLine.replace(/^【总结】|^【点评】|^【归纳】\s*/, "");
      return;
    }

    if (currentBlock.type === "question" && /^[A-Da-d][、．.）)]\s*/.test(trimmedLine)) {
      const optionContent = trimmedLine.replace(/^[A-Da-d][、．.）)]\s*/, "");
      if (currentBlock.options) {
        currentBlock.options.push(optionContent);
      }
      return;
    }

    if (currentBlock.type === "question" && currentBlock.options && currentBlock.options.length > 0) {
      if (/^[\d一二三四五六七八九十]+[、．.）)]\s*/.test(trimmedLine)) {
        const optionContent = trimmedLine.replace(/^[\d一二三四五六七八九十]+[、．.）)]\s*/, "");
        currentBlock.options.push(optionContent);
        return;
      }
    }

    if (currentBlock.content) {
      currentBlock.content += "\n" + line;
    } else {
      currentBlock.type = "knowledge";
      currentBlock.content = line;
      currentBlock.knowledgeTitle = trimmedLine.slice(0, 20);
    }
  });

  if (currentBlock.content) {
    blocks.push({
      ...currentBlock,
      id: genBlockId(),
      order: order++,
      status: "new",
    } as DocBlock);
  }

  blocks.forEach((block) => {
    if (block.type === "question") {
      if (!block.questionType) {
        block.questionType = "single";
      }
      if (!block.options) {
        block.options = [];
      }
      if (!block.difficulty) {
        block.difficulty = 3;
      }
    }
    if (block.type === "knowledge" && !block.knowledgeTitle) {
      const trimmed = block.content.trim();
      block.knowledgeTitle = trimmed.length > 20 ? trimmed.slice(0, 20) + "..." : trimmed;
    }
  });

  return blocks;
}

function blockTypeBadgeVariant(type: BlockType): "green" | "teal" | "ink" | "default" {
  switch (type) {
    case "question":
      return "green";
    case "knowledge":
      return "teal";
    case "heading":
      return "ink";
    case "unused":
      return "default";
  }
}

function blockBorderClass(type: BlockType, selected: boolean): string {
  if (selected) return "border-gold-400 ring-2 ring-gold-200";
  switch (type) {
    case "question":
      return "border-emerald-200 hover:border-emerald-300";
    case "knowledge":
      return "border-teal-200 hover:border-teal-300";
    case "heading":
      return "border-ink-200 hover:border-ink-300";
    case "unused":
      return "border-gray-200 hover:border-gray-300 opacity-70";
  }
}

function blockBgClass(type: BlockType): string {
  switch (type) {
    case "question":
      return "bg-emerald-50/50";
    case "knowledge":
      return "bg-teal-50/50";
    case "heading":
      return "bg-ink-50/50";
    case "unused":
      return "bg-gray-50/50";
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

/**
 * 获取选项的颜色（用于不同选项的色块显示）
 */
function getOptionColor(index: number): string {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-cyan-500",
    "bg-red-500",
    "bg-teal-500",
  ];
  return colors[index % colors.length];
}

/**
 * 渲染包含 LaTeX 公式的文本，使用 KaTeX 渲染公式部分，并高亮关键字
 */
/**
 * 渲染包含 LaTeX 公式的文本，使用和讲义预览相同的 renderInlineMath 函数
 */
function renderTextWithFormula(text: string, keywords: string[] = [], highlightEnabled: boolean = true): string {
  if (!text) return "";
  
  // 先处理 HTML 转义字符，确保 $ 符号正确
  const processedText = text
    .replace(/&dollar;/g, "$")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  
  // 先使用 renderInlineMath 渲染公式（和讲义预览使用相同的逻辑）
  const formulaHtml = renderInlineMath(processedText);
  
  // 如果需要高亮关键字
  if (highlightEnabled && keywords.length > 0) {
    // 将公式HTML拆分为普通文本和公式部分
    // 公式部分已经被渲染为HTML，我们需要保留它们
    // 只对普通文本部分进行关键字高亮
    
    // 使用临时div来解析HTML
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = formulaHtml;
    
    const parts: string[] = [];
    
    // 遍历所有子节点
    const processNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent || "";
        if (textContent.trim()) {
          processTextWithKeywords(textContent, keywords, parts);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        // 如果是公式元素，直接保留其HTML
        if (el.classList.contains("formula-inline")) {
          parts.push(el.outerHTML);
        } else {
          // 对于其他元素，递归处理其子节点
          parts.push(`<${el.tagName.toLowerCase()}`);
          for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i];
            parts.push(` ${attr.name}="${attr.value}"`);
          }
          parts.push(">");
          Array.from(el.childNodes).forEach(processNode);
          parts.push(`</${el.tagName.toLowerCase()}>`);
        }
      }
    };
    
    Array.from(tempDiv.childNodes).forEach(processNode);
    return parts.join("");
  }
  
  return formulaHtml;
}

/**
 * 处理文本中的关键字高亮（只在行首识别关键字）
 */
function processTextWithKeywords(text: string, keywords: string[], parts: string[]) {
  if (!text || keywords.length === 0) {
    parts.push(escapeHtml(text));
    return;
  }
  
  // 将文本按换行符分割，逐行处理
  const lines = text.split(/(\r?\n)/);
  
  lines.forEach((line, idx) => {
    // 如果是换行符本身，直接添加
    if (line === "\n" || line === "\r\n") {
      parts.push(line);
      return;
    }
    
    // 构建行首关键字正则表达式（只匹配行首的关键字）
    const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const lineStartPattern = new RegExp(
      `^([\\s]*)(?:(${escapedKeywords.join("|")})([\\s]*[\\d一二三四五六七八九十]+[、．.．）)]?)?)`,
      "g"
    );
    
    const match = lineStartPattern.exec(line);
    if (match) {
      const leadingSpaces = match[1]; // 行首空格
      const keyword = match[2]; // 关键字
      const numbering = match[3] || ""; // 编号部分
      
      // 添加行首空格
      if (leadingSpaces) {
        parts.push(escapeHtml(leadingSpaces));
      }
      
      // 高亮关键字和编号
      if (keyword) {
        parts.push(`<span class="bg-ink-700 text-white px-0.5 py-0 rounded text-xs">${escapeHtml(keyword + numbering)}</span>`);
      }
      
      // 添加剩余文本
      const remaining = line.substring(match.index + match[0].length);
      if (remaining) {
        parts.push(escapeHtml(remaining));
      }
    } else {
      // 没有匹配到行首关键字，整行作为普通文本
      parts.push(escapeHtml(line));
    }
  });
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 从文本中移除行首的关键字和编号（用于入库时过滤）
 */
function removeKeywords(text: string, keywords: string[]): string {
  if (!text) return text;
  
  // 将文本按换行符分割，逐行处理
  const lines = text.split(/(\r?\n)/);
  
  const processedLines = lines.map((line) => {
    // 如果是换行符本身，直接返回
    if (line === "\n" || line === "\r\n") {
      return line;
    }
    
    let processedLine = line;
    
    // 只移除行首的关键字及其后的编号
    if (keywords.length > 0) {
      const escapedKeywords = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const lineStartKeywordPattern = new RegExp(
        `^[\\s]*(${escapedKeywords.join("|")})([\\s]*[\\d一二三四五六七八九十]+[、．.．）)]?)?`,
        "g"
      );
      processedLine = processedLine.replace(lineStartKeywordPattern, "");
    }
    
    // 移除行首的数字编号（如 "1."、"一、" 等）
    processedLine = processedLine.replace(/^[\d一二三四五六七八九十]+[、．.．）)]\s*/, "");
    
    return processedLine;
  });
  
  // 合并处理后的行并去除首尾空白
  return processedLines.join("").trim();
}

export function ExtractReviewModal({
  open,
  onClose,
  resourceId,
  resourceType,
  resourceTitle,
  chapterIds,
  knowledgePointIds,
  grade,
  schoolYear,
  onConfirmed,
}: ExtractReviewModalProps) {
  const { teacher } = useAuthStore();
  const extractConfig = useExtractConfigStore();
  const [phase, setPhase] = useState<Phase>("extracting");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("正在初始化...");
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [showKeywordConfig, setShowKeywordConfig] = useState(false);
  const [newKeywordValue, setNewKeywordValue] = useState("");
  const [activeKeywordTab, setActiveKeywordTab] = useState<"question" | "answerAnalysis">("question");
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 拖动弹窗状态 - 初始位置居右，靠近切块列表
  const [dragPosition, setDragPosition] = useState({ x: window.innerWidth - 350, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const runExtraction = useCallback(async () => {
    const cancelled = false;

    setPhase("extracting");
    setProgress(0);
    setProgressMsg("正在初始化...");
    setError(null);
    setBlocks([]);
    setSelectedBlockId(null);
    setEditingBlockId(null);

    if (!teacher) {
      setError("未获取到教师信息，请重新登录后再试");
      setPhase("review");
      return;
    }

    try {
      setProgress(10);
      setProgressMsg("正在获取文档信息...");

      let resource: Lecture | ExamPaper | null = null;
      if (resourceType === "lecture") {
        resource = await lectureService.getLecture(resourceId);
      } else {
        resource = await examPaperService.getPaper(resourceId);
      }

      if (!resource || !resource.originalFileUrl) {
        throw new Error("文档文件不存在");
      }

      setProgress(20);
      setProgressMsg("正在下载文档...");

      let base64: string;
      if (resource.originalFileUrl.startsWith("data:")) {
        base64 = resource.originalFileUrl;
      } else {
        const response = await fetch(resource.originalFileUrl);
        const blob = await response.blob();
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("文件读取失败"));
          reader.readAsDataURL(blob);
        });
      }

      setProgress(40);
      setProgressMsg("正在解析文档结构...");

      const fileName = resource.originalFileName || "";
      let blocks: DocBlock[] = [];

      if (fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
        const parseResult = await parseDocxFromBase64(base64);
        
        // 提取所有文本内容（包括公式文本）
        const allItems = parseResult.items
          .map(item => item.text || item.latex || "")
          .filter(text => text.trim());
        blocks = parseDocContent(allItems.join("\n\n"), extractConfig);
      } else {
        throw new Error("暂不支持该格式文档的文档拆解");
      }

      if (blocks.length === 0) {
        blocks = parseDocContent("文档内容为空，请检查文档是否包含题目或知识块内容。", extractConfig);
      }

      setProgress(80);
      setProgressMsg("正在整理切块结果...");

      await new Promise((r) => setTimeout(r, 300));
      
      setProgress(100);
      setBlocks(blocks);
      setPhase("review");
    } catch (e) {
      if (cancelled) return;
      const message = e instanceof Error ? e.message : "文档拆解失败，请稍后重试";
      setError(message);
      setPhase("review");
    }
  }, [extractConfig, resourceId, resourceType, teacher]);

  useEffect(() => {
    if (!open) return;
    runExtraction();
  }, [open, runExtraction]);

  // 拖动处理函数
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - dragPosition.x,
      y: e.clientY - dragPosition.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setDragPosition({
        x: Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 500, e.clientY - dragOffset.y)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const stats = (() => {
    let questionCount = 0;
    let knowledgeCount = 0;
    let headingCount = 0;
    let unusedCount = 0;
    for (const b of blocks) {
      switch (b.type) {
        case "question":
          questionCount++;
          break;
        case "knowledge":
          knowledgeCount++;
          break;
        case "heading":
          headingCount++;
          break;
        case "unused":
          unusedCount++;
          break;
      }
    }
    return {
      total: blocks.length,
      question: questionCount,
      knowledge: knowledgeCount,
      heading: headingCount,
      unused: unusedCount,
      toStore: questionCount + knowledgeCount,
    };
  })();

  const handleSelectBlock = (id: string) => {
    setSelectedBlockId(id);
    const el = blockRefs.current[id];
    if (el && leftPanelRef.current) {
      const panelRect = leftPanelRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (elRect.top < panelRect.top || elRect.bottom > panelRect.bottom) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const handleChangeBlockType = (id: string, type: BlockType) => {
    setBlocks((list) =>
      list.map((b) => {
        if (b.id !== id) return b;
        const updated: DocBlock = { ...b, type, status: "edited" };
        if (type === "question" && !updated.questionType) {
          updated.questionType = "single";
          updated.options = ["", ""];
          updated.answer = "";
          updated.analysis = "";
          updated.difficulty = 3;
        }
        if (type === "knowledge" && !updated.knowledgeTitle) {
          updated.knowledgeTitle = truncate(b.content, 20);
        }
        return updated;
      }),
    );
  };

  const handleEditBlock = (id: string) => {
    setEditingBlockId(editingBlockId === id ? null : id);
  };

  const updateBlockField = (id: string, field: Partial<DocBlock>) => {
    setBlocks((list) =>
      list.map((b) => (b.id === id ? { ...b, ...field, status: "edited" } : b)),
    );
  };

  const updateOption = (blockId: string, idx: number, value: string) => {
    setBlocks((list) =>
      list.map((b) => {
        if (b.id !== blockId) return b;
        const options = [...(b.options || [])];
        options[idx] = value;
        return { ...b, options, status: "edited" };
      }),
    );
  };

  const addOption = (blockId: string) => {
    setBlocks((list) =>
      list.map((b) => {
        if (b.id !== blockId) return b;
        return { ...b, options: [...(b.options || []), ""], status: "edited" };
      }),
    );
  };

  const removeOption = (blockId: string, idx: number) => {
    setBlocks((list) =>
      list.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          options: (b.options || []).filter((_, i) => i !== idx),
          status: "edited",
        };
      }),
    );
  };

  const moveBlockUp = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx <= 0) return;
    const newBlocks = [...blocks];
    [newBlocks[idx - 1], newBlocks[idx]] = [newBlocks[idx], newBlocks[idx - 1]];
    newBlocks[idx - 1].order = idx - 1;
    newBlocks[idx].order = idx;
    setBlocks(newBlocks);
  };

  const moveBlockDown = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0 || idx >= blocks.length - 1) return;
    const newBlocks = [...blocks];
    [newBlocks[idx], newBlocks[idx + 1]] = [newBlocks[idx + 1], newBlocks[idx]];
    newBlocks[idx].order = idx;
    newBlocks[idx + 1].order = idx + 1;
    setBlocks(newBlocks);
  };

  const mergeWithPrevious = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx <= 0) return;
    const prev = blocks[idx - 1];
    const curr = blocks[idx];
    const merged: DocBlock = {
      ...prev,
      content: `${prev.content}\n\n${curr.content}`,
      status: "edited",
    };
    if (curr.options) {
      merged.options = [...(prev.options || []), ...curr.options];
    }
    if (curr.answer) {
      merged.answer = curr.answer;
    }
    if (curr.analysis) {
      merged.analysis = prev.analysis ? `${prev.analysis}\n\n${curr.analysis}` : curr.analysis;
    }
    if (curr.summary) {
      merged.summary = prev.summary ? `${prev.summary}\n\n${curr.summary}` : curr.summary;
    }
    const newBlocks = [...blocks];
    newBlocks[idx - 1] = merged;
    newBlocks.splice(idx, 1);
    newBlocks.forEach((b, i) => (b.order = i));
    setBlocks(newBlocks);
    if (selectedBlockId === id) setSelectedBlockId(prev.id);
    if (editingBlockId === id) setEditingBlockId(prev.id);
  };

  const splitBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const block = blocks[idx];
    const mid = Math.floor(block.content.length / 2);
    let splitIndex = block.content.indexOf("\n", mid);
    if (splitIndex === -1 || splitIndex < mid - 20) {
      splitIndex = mid;
    }
    const firstPart = block.content.slice(0, splitIndex).trim();
    const secondPart = block.content.slice(splitIndex).trim();
    if (!firstPart || !secondPart) {
      toast.warning("内容太短，无法拆分");
      return;
    }
    const newBlock1: DocBlock = {
      ...block,
      id: genBlockId(),
      content: firstPart,
      order: idx,
      status: "edited",
    };
    const newBlock2: DocBlock = {
      id: genBlockId(),
      type: "unused",
      content: secondPart,
      order: idx + 1,
      status: "new",
    };
    const newBlocks = [...blocks];
    newBlocks.splice(idx, 1, newBlock1, newBlock2);
    newBlocks.forEach((b, i) => (b.order = i));
    setBlocks(newBlocks);
  };

  const handleConfirm = async () => {
    if (!teacher) {
      toast.error("未获取到教师信息");
      return;
    }
    const questionBlocks = blocks.filter((b) => b.type === "question");
    const knowledgeBlocks = blocks.filter((b) => b.type === "knowledge");

    if (questionBlocks.length === 0 && knowledgeBlocks.length === 0) {
      toast.warning("没有可入库的题目或知识块");
      return;
    }

    for (const q of questionBlocks) {
      if (!q.content.trim()) {
        toast.warning("存在题干为空的题目");
        return;
      }
    }
    for (const k of knowledgeBlocks) {
      if (!k.content.trim()) {
        toast.warning("存在内容为空的知识块");
        return;
      }
    }

    setPhase("confirming");
    try {
      // 入库时过滤关键字
      const questionKeywords = [...extractConfig.questionKeywords];
      const answerKeywords = [...extractConfig.answerKeywords];
      const analysisKeywords = [...extractConfig.analysisKeywords];
      const summaryKeywords = [...extractConfig.summaryKeywords];

      const extractedQuestions = questionBlocks.map((b) => ({
        id: b.id,
        type: b.questionType || "single",
        stem: removeKeywords(b.content, questionKeywords),
        options: b.options?.map(opt => removeKeywords(opt, questionKeywords)),
        answer: removeKeywords(b.answer || "", answerKeywords),
        analysis: removeKeywords(b.analysis || "", analysisKeywords),
        summary: removeKeywords(b.summary || "", summaryKeywords),
        difficulty: b.difficulty || 3,
        status: b.status as "new" | "duplicate" | "confirmed" | "edited",
        duplicateOf: b.duplicateOf as Question | undefined,
      }));

      const extractedKnowledge = knowledgeBlocks.map((b) => ({
        id: b.id,
        title: b.knowledgeTitle || truncate(removeKeywords(b.content, questionKeywords), 20),
        content: removeKeywords(b.content, questionKeywords),
        status: b.status as "new" | "duplicate" | "confirmed" | "edited",
        duplicateOf: b.duplicateOf as Material | undefined,
      }));

      const { createdQuestions, createdMaterials } = await extractService.confirmExtract(
        teacher.id,
        teacher.schoolId!,
        { questions: extractedQuestions, knowledgeBlocks: extractedKnowledge },
        chapterIds,
        knowledgePointIds,
        grade,
        schoolYear,
        resourceId,
      );

      if (resourceType === "examPaper") {
        await examPaperService.createExtractCopy(resourceId);
      } else {
        await lectureService.createExtractCopy(resourceId);
      }

      toast.success(
        "入库成功",
        `已添加 ${createdQuestions.length} 道题目、${createdMaterials.length} 个知识块`,
      );
      onConfirmed?.();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "未知错误";
      toast.error("入库失败", message);
    } finally {
      setPhase("review");
    }
  };

  const renderExtracting = () => (
    <div className="py-16 px-4">
      <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-gold-50 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-gold-500" />
        </div>
        <div className="text-center">
          <div className="font-serif text-xl font-semibold text-ink-900 mb-2">
            AI 拆解中
          </div>
          <div className="text-sm text-ink-500">{progressMsg}</div>
        </div>
        <div className="w-full">
          <div className="h-2.5 bg-mist rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 text-right text-xs text-ink-400">{progress}%</div>
        </div>
        <div className="text-xs text-ink-400 text-center leading-relaxed">
          正在识别文档结构，自动切分为题目、知识块、标题等区域...
        </div>
      </div>
    </div>
  );

  // 收集所有关键字用于高亮
  const allKeywords = [
    ...extractConfig.questionKeywords,
    ...extractConfig.answerKeywords,
    ...extractConfig.analysisKeywords,
    ...extractConfig.summaryKeywords,
  ];

  const renderLeftBlock = (block: DocBlock) => {
    const isSelected = selectedBlockId === block.id;
    return (
      <div
        key={block.id}
        ref={(el) => (blockRefs.current[block.id] = el)}
        onClick={() => handleSelectBlock(block.id)}
        className={cn(
          "rounded-lg border p-4 cursor-pointer transition-all",
          blockBorderClass(block.type, isSelected),
          blockBgClass(block.type),
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={blockTypeBadgeVariant(block.type)}>
            {block.type === "question" && block.questionType
              ? questionTypeLabel[block.questionType]
              : blockTypeLabel[block.type]}
          </Badge>
          <span className="text-xs text-ink-400">#{block.order + 1}</span>
        </div>

        {block.type === "heading" && (
          <div className="font-serif text-lg font-bold text-ink-900">{block.content}</div>
        )}

        {block.type === "knowledge" && (
          <div className="space-y-1">
            {block.knowledgeTitle && (
              <div className="font-semibold text-ink-900 text-sm">
                {block.knowledgeTitle}
              </div>
            )}
            <div className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: renderTextWithFormula(block.content, allKeywords, true) }} />
          </div>
        )}

        {block.type === "question" && (
          <div className="space-y-2">
            <div className="text-sm text-ink-800 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderTextWithFormula(block.content, allKeywords, true) }} />
            {block.options && block.options.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 pl-1">
                {block.options.map((opt, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-sm" dangerouslySetInnerHTML={{ __html: `<span class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-medium text-white ${getOptionColor(idx)}">${optionLetter(idx)}</span><span class="text-ink-700 flex-1">${renderTextWithFormula(opt, allKeywords, true)}</span>` }} />
                ))}
              </div>
            )}
            {block.answer && (
              <div className="text-xs bg-emerald-50/60 border border-emerald-100 rounded px-2 py-1">
                <span className="text-emerald-700 font-medium">答案：</span>
                <span className="text-ink-700">{block.answer}</span>
              </div>
            )}
            {block.analysis && (
              <div className="text-xs bg-blue-50/60 border border-blue-100 rounded px-2 py-1" dangerouslySetInnerHTML={{ __html: `<span class="text-blue-700 font-medium">解析：</span>${renderTextWithFormula(block.analysis, allKeywords, true)}` }} />
            )}
            {block.summary && (
              <div className="text-xs bg-amber-50/60 border border-amber-100 rounded px-2 py-1" dangerouslySetInnerHTML={{ __html: `<span class="text-amber-700 font-medium">总结：</span>${renderTextWithFormula(block.summary, allKeywords, true)}` }} />
            )}
          </div>
        )}

        {block.type === "unused" && (
          <div className="text-sm text-ink-500 whitespace-pre-wrap italic" dangerouslySetInnerHTML={{ __html: renderTextWithFormula(block.content, allKeywords, true) }} />
        )}
      </div>
    );
  };

  const renderRightBlock = (block: DocBlock) => {
    const isEditing = editingBlockId === block.id;
    const isSelected = selectedBlockId === block.id;

    return (
      <div
        key={block.id}
        className={cn(
          "rounded-lg border bg-paper transition-all",
          isSelected ? "border-gold-300 ring-1 ring-gold-200" : "border-ink-100",
        )}
      >
        <div
          className="p-3 cursor-pointer"
          onClick={() => handleSelectBlock(block.id)}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <Select
                value={block.type}
                onChange={(e) => {
                  e.stopPropagation();
                  handleChangeBlockType(block.id, e.target.value as BlockType);
                }}
                className="text-xs h-7 py-0 px-2 w-24"
                options={[
                  { value: "question", label: "题目" },
                  { value: "knowledge", label: "知识块" },
                  { value: "heading", label: "标题" },
                  { value: "unused", label: "未使用" },
                ]}
              />
              {block.type === "question" && block.questionType && (
                <Badge variant="green">{questionTypeLabel[block.questionType]}</Badge>
              )}
              {block.status === "edited" && <Badge variant="gold">已编辑</Badge>}
              {block.status === "duplicate" && <Badge variant="amber">重复</Badge>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditBlock(block.id);
                }}
              >
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="text-sm text-ink-700 line-clamp-2 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: renderTextWithFormula(block.type === "knowledge" && block.knowledgeTitle ? `${block.knowledgeTitle}：${block.content}` : block.content, [], false) }} />
        </div>

        {isEditing && (
          <div className="border-t border-ink-100 p-3 space-y-3 bg-mist/30">
            {block.type === "question" && (
              <>
                <Select
                  label="题型"
                  value={block.questionType || "single"}
                  options={[
                    { value: "single", label: "单选题" },
                    { value: "multiple", label: "多选题" },
                    { value: "judge", label: "判断题" },
                    { value: "short", label: "填空题" },
                    { value: "essay", label: "解答题" },
                  ]}
                  onChange={(e) =>
                    updateBlockField(block.id, {
                      questionType: e.target.value as QuestionType,
                    })
                  }
                />
                <Textarea
                  label="题干"
                  value={block.content}
                  onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                  rows={3}
                />
                {(block.questionType === "single" || block.questionType === "multiple") && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-ink-700">选项</label>
                      <button
                        type="button"
                        onClick={() => addOption(block.id)}
                        className="text-xs text-gold-600 hover:text-gold-700"
                      >
                        + 添加选项
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(block.options || []).map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-medium text-white ${getOptionColor(idx)}`}>
                            {optionLetter(idx)}
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(block.id, idx, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(block.id, idx)}
                            className="p-1 text-ink-400 hover:text-red-600 flex-shrink-0"
                            title="删除选项"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Input
                  label="答案"
                  value={block.answer || ""}
                  onChange={(e) => updateBlockField(block.id, { answer: e.target.value })}
                />
                <Textarea
                  label="解析"
                  value={block.analysis || ""}
                  onChange={(e) =>
                    updateBlockField(block.id, { analysis: e.target.value })
                  }
                  rows={2}
                />
                <Textarea
                  label="分析总结"
                  value={block.summary || ""}
                  onChange={(e) =>
                    updateBlockField(block.id, { summary: e.target.value })
                  }
                  rows={2}
                />
                <Select
                  label="难度"
                  value={String(block.difficulty || 3)}
                  options={[
                    { value: "1", label: "简单" },
                    { value: "2", label: "较易" },
                    { value: "3", label: "中等" },
                    { value: "4", label: "较难" },
                    { value: "5", label: "困难" },
                  ]}
                  onChange={(e) =>
                    updateBlockField(block.id, { difficulty: Number(e.target.value) })
                  }
                />
              </>
            )}

            {block.type === "knowledge" && (
              <>
                <Input
                  label="标题"
                  value={block.knowledgeTitle || ""}
                  onChange={(e) =>
                    updateBlockField(block.id, { knowledgeTitle: e.target.value })
                  }
                />
                <Textarea
                  label="内容"
                  value={block.content}
                  onChange={(e) =>
                    updateBlockField(block.id, { content: e.target.value })
                  }
                  rows={5}
                />
              </>
            )}

            {block.type === "heading" && (
              <Textarea
                label="标题文本"
                value={block.content}
                onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                rows={2}
              />
            )}

            {block.type === "unused" && (
              <div className="text-sm text-ink-500">
                未使用块不会入库，仅保留在文档原始结构中。
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => moveBlockUp(block.id)}
                disabled={block.order === 0}
              >
                <ChevronUp className="w-3.5 h-3.5" /> 上移
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => moveBlockDown(block.id)}
                disabled={block.order === blocks.length - 1}
              >
                <ChevronDown className="w-3.5 h-3.5" /> 下移
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => mergeWithPrevious(block.id)}
                disabled={block.order === 0}
              >
                <Merge className="w-3.5 h-3.5" /> 合并上一块
              </Button>
              {block.type === "unused" && (
                <Button size="sm" variant="outline" onClick={() => splitBlock(block.id)}>
                  <Split className="w-3.5 h-3.5" /> 拆分
                </Button>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <Button size="sm" variant="gold" onClick={() => handleEditBlock(block.id)}>
                <Save className="w-3.5 h-3.5" /> 完成
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderKeywordConfig = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-4 h-4 text-ink-500" />
        <span className="text-sm font-medium text-ink-900">拆解关键字配置</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={extractConfig.resetToDefault}
          className="ml-auto"
          title="重置为默认"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex gap-1 p-1 bg-mist/50 rounded-lg">
        <button
          type="button"
          onClick={() => setActiveKeywordTab("question")}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            activeKeywordTab === "question"
              ? "bg-paper text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          题目拆解关键字
        </button>
        <button
          type="button"
          onClick={() => setActiveKeywordTab("answerAnalysis")}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            activeKeywordTab === "answerAnalysis"
              ? "bg-paper text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          答案解析关键字
        </button>
      </div>

      {activeKeywordTab === "question" && (
        <div className="space-y-2">
          <div className="text-xs text-ink-500">
            以下关键字用于识别题目开头，如"例1"、"变式2"等
          </div>
          <div className="space-y-1">
            {extractConfig.questionKeywords.map((keyword, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-xs text-ink-400 w-4">{idx + 1}.</span>
                <span className="flex-1 text-sm text-ink-700 bg-mist/50 px-2 py-1 rounded">
                  {keyword}
                </span>
                <button
                  type="button"
                  onClick={() => extractConfig.removeQuestionKeyword(idx)}
                  className="p-0.5 text-ink-400 hover:text-red-600"
                  title="删除"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newKeywordValue}
              onChange={(e) => setNewKeywordValue(e.target.value)}
              placeholder="新增关键字"
              className="text-xs h-7"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeywordValue.trim()) {
                  extractConfig.addQuestionKeyword(newKeywordValue.trim());
                  setNewKeywordValue("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (newKeywordValue.trim()) {
                  extractConfig.addQuestionKeyword(newKeywordValue.trim());
                  setNewKeywordValue("");
                }
              }}
              className="h-7 px-2"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {activeKeywordTab === "answerAnalysis" && (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-ink-500 mb-1.5">答案关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.answerKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-emerald-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeAnswerKeyword(idx)}
                    className="p-0.5 text-emerald-400 hover:text-emerald-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-1.5">解析关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.analysisKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-blue-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeAnalysisKeyword(idx)}
                    className="p-0.5 text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-1.5">总结关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.summaryKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-amber-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeSummaryKeyword(idx)}
                    className="p-0.5 text-amber-400 hover:text-amber-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1">
            <Select
              value="answer"
              className="text-xs h-7 w-24"
              options={[
                { value: "answer", label: "答案" },
                { value: "analysis", label: "解析" },
                { value: "summary", label: "总结" },
              ]}
              onChange={(e) => {
                const type = e.target.value as "answer" | "analysis" | "summary";
                if (newKeywordValue.trim()) {
                  if (type === "answer") {
                    extractConfig.addAnswerKeyword(newKeywordValue.trim());
                  } else if (type === "analysis") {
                    extractConfig.addAnalysisKeyword(newKeywordValue.trim());
                  } else {
                    extractConfig.addSummaryKeyword(newKeywordValue.trim());
                  }
                  setNewKeywordValue("");
                }
              }}
            />
            <Input
              value={newKeywordValue}
              onChange={(e) => setNewKeywordValue(e.target.value)}
              placeholder="新增关键字"
              className="text-xs h-7 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeywordValue.trim()) {
                  extractConfig.addAnswerKeyword(newKeywordValue.trim());
                  setNewKeywordValue("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (newKeywordValue.trim()) {
                  extractConfig.addAnswerKeyword(newKeywordValue.trim());
                  setNewKeywordValue("");
                }
              }}
              className="h-7 px-2"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderReview = () => {
    return (
      <>
        <div className="flex gap-4 h-[70vh]">
          <div
            ref={leftPanelRef}
            className="w-3/5 bg-mist/30 rounded-lg p-4 overflow-y-auto space-y-3"
          >
            <div className="sticky top-0 bg-mist/80 backdrop-blur-sm -mx-4 -mt-4 px-4 py-3 mb-2 border-b border-ink-100 z-10">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-ink-500" />
                <span className="font-serif font-semibold text-ink-900">
                  {resourceTitle}
                </span>
                <Badge variant="default">{resourceType === "examPaper" ? "试卷" : "讲义"}</Badge>
              </div>
              <div className="text-xs text-ink-500">
                文档预览 · 共 {stats.total} 个切块
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {blocks.length === 0 ? (
              <div className="text-center py-12 text-sm text-ink-400">
                <FileText className="w-10 h-10 mx-auto mb-2 text-ink-200" />
                暂无文档块
              </div>
            ) : (
              blocks.map(renderLeftBlock)
            )}
          </div>

          <div className="w-2/5 flex flex-col bg-paper rounded-lg border border-ink-100">
            <div className="px-4 py-3 border-b border-ink-100 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-ink-900">切块列表</div>
                <button
                  type="button"
                  onClick={() => setShowKeywordConfig(true)}
                  className="flex items-center gap-1 px-2 py-1 bg-mist/50 hover:bg-mist rounded text-xs text-ink-600 transition-colors"
                >
                  <Settings className="w-3 h-3" />
                  <span>关键字</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="default">共 {stats.total} 块</Badge>
                <Badge variant="green">题目 {stats.question}</Badge>
                <Badge variant="teal">知识块 {stats.knowledge}</Badge>
                <Badge variant="ink">标题 {stats.heading}</Badge>
                <Badge variant="default">未使用 {stats.unused}</Badge>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {blocks.length === 0 ? (
                <div className="text-center py-12 text-sm text-ink-400">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 text-ink-200" />
                  暂无切块
                </div>
              ) : (
                blocks.map(renderRightBlock)
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="full"
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold-500" />
            文档拆解审阅
          </div>
        }
        description={
          <span className="truncate inline-flex items-center">
            {resourceTitle}
            <span className="ml-2 text-xs text-ink-400">
              （{resourceType === "examPaper" ? "试卷" : "讲义"}）
            </span>
          </span>
        }
        footer={
          phase === "extracting" ? (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              拆解进行中，请稍候...
            </div>
          ) : (
            <div className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  将入库 {stats.toStore} 项
                </span>
                <span className="inline-flex items-center gap-1 text-ink-500">
                  <FileText className="w-3.5 h-3.5" />
                  题目 {stats.question} + 知识块 {stats.knowledge}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-400">
                  <Ban className="w-3.5 h-3.5" />
                  忽略 {stats.unused + stats.heading}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={phase === "confirming"}>
                  取消
                </Button>
                <Button
                  variant="gold"
                  onClick={handleConfirm}
                  loading={phase === "confirming"}
                  disabled={stats.toStore === 0}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  确认入库
                </Button>
              </div>
            </div>
          )
        }
      >
        {phase === "extracting" ? renderExtracting() : renderReview()}
      </Modal>
      
      {/* 关键字配置弹窗 - 可拖动 */}
      {showKeywordConfig && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-[2000]"
            onClick={() => setShowKeywordConfig(false)}
          />
          <div
            className="fixed z-[2001] w-72 bg-white rounded-lg shadow-xl border border-ink-200 flex flex-col"
            style={{
              left: dragPosition.x,
              top: dragPosition.y,
              cursor: isDragging ? "grabbing" : "default",
            }}
          >
            {/* 标题栏 - 可拖动 */}
            <div
              className="px-4 py-2 bg-mist/50 border-b border-ink-100 flex items-center justify-between cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-ink-600" />
                <span className="text-sm font-medium text-ink-900">关键字配置</span>
              </div>
              <button
                onClick={() => setShowKeywordConfig(false)}
                className="text-ink-400 hover:text-ink-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* 内容区域 */}
            <div className="p-4 max-h-80 overflow-y-auto">
              {renderKeywordConfig()}
            </div>
            
            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t border-ink-100 flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={runExtraction}>
                <RotateCcw className="w-3 h-3 mr-1" />
                重新拆解
              </Button>
              <Button size="sm" onClick={() => setShowKeywordConfig(false)}>
                关闭
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default ExtractReviewModal;
