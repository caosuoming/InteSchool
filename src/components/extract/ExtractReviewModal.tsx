import { useCallback, useEffect, useRef, useState } from "react";
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
import { questionService } from "@/services/question";
import { examPaperService } from "@/services/examPaper";
import { lectureService } from "@/services/lecture";
import { renderExtractText } from "@/lib/extract-text-renderer";
import { stripLeadingScoreLabels } from "@/lib/question-text-cleanup";
import {
  parseDocumentBlocks,
  type DocumentBlock as DocBlock,
  type DocumentBlockType as BlockType,
} from "@/lib/document-block-parser";
import { extractStoredFile } from "@/services/api";
import {
  officeMetafilePreviewClassName,
  useOfficeMetafileImages,
} from "@/hooks/useOfficeMetafileImages";
import type {
  ExamPaper,
  ExtractedDocumentBlock,
  ExtractedQuestionItem,
  Lecture,
  Material,
  Question,
  QuestionType,
  ResourceSemester,
} from "@/types";
import { includeCurrentQuestionType, useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import {
  QuestionDuplicateReviewModal,
  type QuestionDuplicateResolution,
} from "./QuestionDuplicateReviewModal";

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
  semester: ResourceSemester;
  questionSourceType?: string;
  questionCategory?: string;
  initialBlocks?: DocBlock[];
  onConfirmed?: () => void;
}

type Phase = "extracting" | "review" | "confirming";
type SolutionField = "answer" | "analysis" | "summary";

interface DuplicateCheck {
  candidate: Question;
  similarity: number;
  incoming: Pick<
    ExtractedQuestionItem,
    "stem" | "options" | "answer" | "analysis" | "summary"
  >;
  resolution?: QuestionDuplicateResolution;
}

const solutionFieldOptions: Array<{ value: SolutionField; label: string }> = [
  { value: "answer", label: "答案" },
  { value: "analysis", label: "解析" },
  { value: "summary", label: "总结" },
];

const solutionFieldStyles: Record<SolutionField, {
  border: string;
  background: string;
  text: string;
}> = {
  answer: {
    border: "border-emerald-100",
    background: "bg-emerald-50/60",
    text: "text-emerald-700",
  },
  analysis: {
    border: "border-blue-100",
    background: "bg-blue-50/60",
    text: "text-blue-700",
  },
  summary: {
    border: "border-amber-100",
    background: "bg-amber-50/60",
    text: "text-amber-700",
  },
};

const blockTypeLabel: Record<BlockType, string> = {
  documentTitle: "文档标题",
  documentInfo: "文档信息",
  groupTitle: "题型或项目名",
  question: "题目",
  knowledge: "知识块",
};

const optionLetter = (idx: number) => String.fromCharCode(65 + idx);

function genBlockId() {
  return `doc-block-${crypto.randomUUID()}`;
}

function blockTypeBadgeVariant(type: BlockType): "green" | "teal" | "ink" | "gold" | "default" {
  switch (type) {
    case "documentTitle":
      return "gold";
    case "documentInfo":
      return "default";
    case "groupTitle":
      return "ink";
    case "question":
      return "green";
    case "knowledge":
      return "teal";
  }
}

function blockBorderClass(type: BlockType): string {
  switch (type) {
    case "documentTitle":
      return "border-gold-200 hover:border-gold-300";
    case "documentInfo":
      return "border-slate-200 hover:border-slate-300";
    case "groupTitle":
      return "border-ink-200 hover:border-ink-300";
    case "question":
      return "border-emerald-200 hover:border-emerald-300";
    case "knowledge":
      return "border-teal-200 hover:border-teal-300";
  }
}

function blockBgClass(type: BlockType): string {
  switch (type) {
    case "documentTitle":
      return "bg-gold-50/50";
    case "documentInfo":
      return "bg-slate-50/50";
    case "groupTitle":
      return "bg-ink-50/50";
    case "question":
      return "bg-emerald-50/50";
    case "knowledge":
      return "bg-teal-50/50";
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
        `^[\\s]*(${escapedKeywords.join("|")})([\\s]*[\\d一二三四五六七八九十]+[、．.．）)]?)?[\\s]*[:：、.．-]?[\\s]*`,
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

function normalizeQuestionField(text: string, missingMarkers: string[] = []): string {
  const normalized = text.trim();
  return normalized && !missingMarkers.includes(normalized) ? normalized : "略";
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
  semester,
  questionSourceType,
  questionCategory,
  initialBlocks,
  onConfirmed,
}: ExtractReviewModalProps) {
  const previewRootRef = useRef<HTMLDivElement>(null);
  useOfficeMetafileImages(previewRootRef);
  const { teacher } = useAuthStore();
  const { options: questionTypeOptions, defaultType: defaultQuestionType } = useQuestionTypeOptions(teacher?.schoolId);
  const extractConfig = useExtractConfigStore();
  const [phase, setPhase] = useState<Phase>(initialBlocks ? "review" : "extracting");
  const [progress, setProgress] = useState(initialBlocks ? 100 : 0);
  const [progressMsg, setProgressMsg] = useState(initialBlocks ? "拆解完成，等待审阅" : "正在初始化...");
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DocBlock[]>(initialBlocks || []);
  const [preservedScoreLabelBlockIds, setPreservedScoreLabelBlockIds] = useState<Set<string>>(new Set());
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [duplicateChecks, setDuplicateChecks] = useState<Record<string, DuplicateCheck>>({});
  const [showKeywordConfig, setShowKeywordConfig] = useState(false);
  const [newKeywordValue, setNewKeywordValue] = useState("");
  const [activeKeywordTab, setActiveKeywordTab] = useState<"question" | "answerAnalysis" | "questionType">("question");
  const [selectedKeywordType, setSelectedKeywordType] = useState<"answer" | "analysis" | "summary">("answer");
  const [selectedQuestionType, setSelectedQuestionType] = useState<"single" | "multiple" | "fillblank" | "essay">("single");
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
    setPreservedScoreLabelBlockIds(new Set());
    setEditingBlockId(null);
    setDuplicateChecks({});

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
      setProgressMsg("正在由服务端解析文档...");

      const fileName = resource.originalFileName || "";
      if (!/\.(docx|pdf|txt|md)$/i.test(fileName)) {
        throw new Error("暂不支持该格式文档的文档拆解");
      }

      const extracted = await extractStoredFile(resource.originalFileUrl, { textOnly: true });
      setProgress(60);
      setProgressMsg("正在分析文档结构...");
      let blocks: DocBlock[] = parseDocumentBlocks(extracted.text, extractConfig);

      if (blocks.length === 0) {
        blocks = parseDocumentBlocks("文档内容为空，请检查文档是否包含题目或知识块内容。", extractConfig);
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
    if (initialBlocks) {
      setPhase("review");
      setProgress(100);
      setProgressMsg("拆解完成，等待审阅");
      setError(null);
      setBlocks(initialBlocks);
      setPreservedScoreLabelBlockIds(new Set());
      setEditingBlockId(null);
      setDuplicateChecks({});
      return;
    }
    runExtraction();
  }, [initialBlocks, open, runExtraction]);

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
    let documentTitleCount = 0;
    let documentInfoCount = 0;
    let groupTitleCount = 0;
    let questionCount = 0;
    let knowledgeCount = 0;
    for (const b of blocks) {
      switch (b.type) {
        case "documentTitle":
          documentTitleCount++;
          break;
        case "documentInfo":
          documentInfoCount++;
          break;
        case "groupTitle":
          groupTitleCount++;
          break;
        case "question":
          questionCount++;
          break;
        case "knowledge":
          knowledgeCount++;
          break;
      }
    }
    return {
      total: blocks.length,
      documentTitle: documentTitleCount,
      documentInfo: documentInfoCount,
      groupTitle: groupTitleCount,
      question: questionCount,
      knowledge: knowledgeCount,
      toStore: questionCount + knowledgeCount,
    };
  })();

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
    if (field.content !== undefined) {
      setDuplicateChecks((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  const convertSolutionField = (
    blockId: string,
    sourceField: SolutionField,
    targetField: SolutionField,
  ) => {
    if (sourceField === targetField) return;

    setBlocks((list) =>
      list.map((block) => {
        if (block.id !== blockId) return block;

        const sourceValue = block[sourceField] || "";
        const targetValue = block[targetField] || "";

        return {
          ...block,
          [sourceField]: targetValue,
          [targetField]: sourceValue,
          status: "edited",
        };
      }),
    );
  };

  const setScoreLabelCleanupEnabled = (id: string, enabled: boolean) => {
    setPreservedScoreLabelBlockIds((current) => {
      const next = new Set(current);
      if (enabled) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
      type: "documentInfo",
      content: secondPart,
      order: idx + 1,
      status: "new",
    };
    const newBlocks = [...blocks];
    newBlocks.splice(idx, 1, newBlock1, newBlock2);
    newBlocks.forEach((b, i) => (b.order = i));
    setBlocks(newBlocks);
  };

  const handleConfirm = async (
    reviewResolutions?: Record<string, QuestionDuplicateResolution>,
  ) => {
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

      const extractedQuestions = questionBlocks.map((b) => {
        const keywordFilteredStem = removeKeywords(b.content, questionKeywords);
        const stem = preservedScoreLabelBlockIds.has(b.id)
          ? keywordFilteredStem
          : stripLeadingScoreLabels(keywordFilteredStem).text;
        return {
          id: b.id,
          type: b.questionType || defaultQuestionType,
          stem,
          options: b.options?.map(opt => removeKeywords(opt, questionKeywords)),
          answer: normalizeQuestionField(
            removeKeywords(b.answer || "", answerKeywords),
            ["待教师补充"],
          ),
          analysis: normalizeQuestionField(
            removeKeywords(b.analysis || "", analysisKeywords),
            ["待教师补充解析"],
          ),
          summary: normalizeQuestionField(removeKeywords(b.summary || "", summaryKeywords)),
          difficulty: b.difficulty || 3,
          status: b.status as "new" | "duplicate" | "confirmed" | "edited",
          duplicateOf: b.duplicateOf as Question | undefined,
        };
      });

      if (extractedQuestions.some((question) => !question.stem.trim())) {
        toast.warning("过滤分值说明后存在题干为空的题目，请检查后重试");
        setPhase("review");
        return;
      }

      const duplicateResults = await Promise.all(
        extractedQuestions.map(async (item) => ({
          item,
          candidates: await questionService.findSimilarQuestions(
            item.stem,
            teacher.schoolId!,
          ),
        })),
      );
      const nextDuplicateChecks: Record<string, DuplicateCheck> = {};
      for (const { item, candidates } of duplicateResults) {
        const candidate = candidates[0];
        if (!candidate) continue;
        const previous = duplicateChecks[item.id];
        nextDuplicateChecks[item.id] = {
          candidate: candidate.question,
          similarity: candidate.similarity,
          incoming: item,
          resolution: reviewResolutions?.[item.id]
            || (previous?.candidate.id === candidate.question.id
              ? previous.resolution
              : undefined),
        };
      }
      setDuplicateChecks(nextDuplicateChecks);
      if (Object.values(nextDuplicateChecks).some((check) => !check.resolution)) {
        toast.warning("发现高度相似题目，请完成重题处理后再入库");
        setPhase("review");
        return;
      }

      const resolvedQuestions = extractedQuestions.map((item) => {
        const check = nextDuplicateChecks[item.id];
        if (!check) return item;
        if (check.resolution?.action === "merge") {
          return {
            ...item,
            status: "duplicate" as const,
            duplicateOf: undefined,
            duplicateAction: "merge" as const,
            duplicateTargetId: check.candidate.id,
            duplicateFields: check.resolution.fields,
          };
        }
        return {
          ...item,
          status: "confirmed" as const,
          duplicateOf: undefined,
          duplicateAction: "add" as const,
          duplicateTargetId: undefined,
          duplicateFields: undefined,
        };
      });

      const extractedKnowledge = knowledgeBlocks.map((b) => ({
        id: b.id,
        title: b.knowledgeTitle || truncate(removeKeywords(b.content, questionKeywords), 20),
        content: removeKeywords(b.content, questionKeywords),
        status: b.status as "new" | "duplicate" | "confirmed" | "edited",
        duplicateOf: b.duplicateOf as Material | undefined,
      }));

      const {
        createdQuestions,
        mergedQuestions,
        createdMaterials,
        questionIdByItemId,
        materialIdByItemId,
      } = await extractService.confirmExtract(
        teacher.id,
        teacher.schoolId!,
        { questions: resolvedQuestions, knowledgeBlocks: extractedKnowledge },
        chapterIds,
        knowledgePointIds,
        grade,
        schoolYear,
        semester,
        resourceId,
        questionSourceType,
        questionCategory,
      );

      const extractedQuestionById = new Map(extractedQuestions.map((item) => [item.id, item]));
      const extractedKnowledgeById = new Map(extractedKnowledge.map((item) => [item.id, item]));
      const extractCopyBlocks: ExtractedDocumentBlock[] = blocks.map((block) => {
        if (block.type === "question") {
          const item = extractedQuestionById.get(block.id);
          return {
            id: block.id,
            type: "question",
            content: item?.stem || block.content,
            questionType: item?.type || block.questionType || defaultQuestionType,
            questionId: questionIdByItemId[block.id],
          };
        }
        if (block.type === "knowledge") {
          const item = extractedKnowledgeById.get(block.id);
          return {
            id: block.id,
            type: "knowledge",
            title: item?.title || block.knowledgeTitle,
            content: item?.content || block.content,
            materialId: materialIdByItemId[block.id],
          };
        }
        if (block.type === "documentTitle") {
          return {
            id: block.id,
            type: "documentTitle",
            content: block.content,
          };
        }
        if (block.type === "groupTitle") {
          return {
            id: block.id,
            type: "groupTitle",
            content: block.content,
          };
        }
        return {
          id: block.id,
          type: "documentInfo",
          content: block.content,
        };
      });

      if (resourceType === "examPaper") {
        await examPaperService.createExtractCopy(resourceId, extractCopyBlocks);
      } else {
        await lectureService.createExtractCopy(resourceId, extractCopyBlocks);
      }

      toast.success(
        "入库成功",
        `已新增 ${createdQuestions.length} 道题目、合并 ${mergedQuestions.length} 道重题、添加 ${createdMaterials.length} 个知识块`,
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

  const renderDocumentBlock = (block: DocBlock) => {
    const isEditing = editingBlockId === block.id;
    const duplicateCheck = duplicateChecks[block.id];
    const scoreLabelCleanup = block.type === "question"
      ? stripLeadingScoreLabels(removeKeywords(block.content, extractConfig.questionKeywords))
      : { text: block.content, labels: [] };
    const scoreLabelCleanupEnabled = !preservedScoreLabelBlockIds.has(block.id);

    const renderSolutionField = (field: SolutionField) => {
      const value = block[field];
      if (!value) return null;

      const label = solutionFieldOptions.find((option) => option.value === field)?.label || field;
      const styles = solutionFieldStyles[field];

      return (
        <div className={cn("rounded border px-2 py-1.5 text-xs", styles.border, styles.background)}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={cn("font-medium", styles.text)}>{label}：</span>
            <select
              aria-label={`将${label}内容转换为`}
              title="切换内容类型"
              value={field}
              onChange={(event) =>
                convertSolutionField(block.id, field, event.target.value as SolutionField)
              }
              className="h-6 rounded border border-ink-200 bg-paper px-1.5 text-[11px] text-ink-600 outline-none transition-colors hover:border-gold-300 focus:border-gold-400"
            >
              {solutionFieldOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  转为{option.label}
                </option>
              ))}
            </select>
          </div>
          <div
            className={cn("whitespace-pre-wrap text-ink-700", field === "answer" && "question-answer-content")}
            dangerouslySetInnerHTML={{ __html: renderExtractText(value, allKeywords, true) }}
          />
        </div>
      );
    };

    return (
      <div
        key={block.id}
        className={cn(
          "overflow-hidden rounded-xl border transition-colors",
          blockBorderClass(block.type),
          blockBgClass(block.type),
        )}
      >
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant={blockTypeBadgeVariant(block.type)}>
                  {blockTypeLabel[block.type]}
                </Badge>
                <span className="text-xs text-ink-400">#{block.order + 1}</span>
                {block.status === "edited" && <Badge variant="gold">已编辑</Badge>}
                {block.status === "duplicate" && <Badge variant="amber">重复</Badge>}
                {duplicateCheck && !duplicateCheck.resolution && <Badge variant="amber">待重题处理</Badge>}
              </div>

              {block.type === "documentTitle" && (
                <div
                  className="font-serif text-xl font-bold text-ink-900"
                  dangerouslySetInnerHTML={{ __html: renderExtractText(block.content, allKeywords, true) }}
                />
              )}

              {block.type === "groupTitle" && (
                <div
                  className="font-serif text-lg font-bold text-ink-900"
                  dangerouslySetInnerHTML={{ __html: renderExtractText(block.content, allKeywords, true) }}
                />
              )}

              {block.type === "documentInfo" && (
                <div
                  className="whitespace-pre-wrap text-sm leading-relaxed text-ink-600"
                  dangerouslySetInnerHTML={{ __html: renderExtractText(block.content, allKeywords, true) }}
                />
              )}

              {block.type === "knowledge" && (
                <div className="space-y-1">
                  {block.knowledgeTitle && (
                    <div
                      className="text-sm font-semibold text-ink-900"
                      dangerouslySetInnerHTML={{ __html: renderExtractText(block.knowledgeTitle, allKeywords, true) }}
                    />
                  )}
                  <div
                    className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700"
                    dangerouslySetInnerHTML={{ __html: renderExtractText(block.content, allKeywords, true) }}
                  />
                </div>
              )}

              {block.type === "question" && (
                <div className="space-y-2">
                  <div
                    className="whitespace-pre-wrap text-sm text-ink-800"
                    dangerouslySetInnerHTML={{ __html: renderExtractText(block.content, allKeywords, true) }}
                  />
                  {block.options && block.options.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5 pl-1 sm:grid-cols-2">
                      {block.options.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-sm"
                          dangerouslySetInnerHTML={{ __html: `<span class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-medium text-white ${getOptionColor(idx)}">${optionLetter(idx)}</span><span class="text-ink-700 flex-1">${renderExtractText(opt, allKeywords, true)}</span>` }}
                        />
                      ))}
                    </div>
                  )}
                  {renderSolutionField("answer")}
                  {renderSolutionField("analysis")}
                  {renderSolutionField("summary")}
                  {scoreLabelCleanup.labels.length > 0 && (
                    <label className="flex cursor-pointer items-start gap-2 rounded border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-xs text-amber-900">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300"
                        checked={scoreLabelCleanupEnabled}
                        onChange={(event) => setScoreLabelCleanupEnabled(block.id, event.target.checked)}
                      />
                      <span>
                        入库时过滤分值说明
                        <span className="ml-1 font-medium">{scoreLabelCleanup.labels.join("、")}</span>
                      </span>
                    </label>
                  )}
                </div>
              )}

            </div>

            <div className="w-full flex-shrink-0 space-y-3 rounded-lg border border-ink-100 bg-paper/90 p-3 lg:w-56">
              <Select
                label="调整区域属性"
                value={block.type}
                onChange={(e) => handleChangeBlockType(block.id, e.target.value as BlockType)}
                className="h-9 py-0 text-sm"
                options={[
                  { value: "documentTitle", label: "文档标题" },
                  { value: "documentInfo", label: "文档信息" },
                  { value: "knowledge", label: "知识块" },
                  { value: "groupTitle", label: "题型或项目名" },
                  { value: "question", label: "题目" },
                ]}
              />
              {block.type === "question" && (
                <Select
                  label="题型选择"
                  value={block.questionType || defaultQuestionType}
                  className="h-9 py-0 text-sm"
                  options={includeCurrentQuestionType(questionTypeOptions, block.questionType)}
                  onChange={(e) =>
                    updateBlockField(block.id, {
                      questionType: e.target.value as QuestionType,
                    })
                  }
                />
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
            <Button size="sm" variant={isEditing ? "gold" : "outline"} onClick={() => handleEditBlock(block.id)}>
              <Edit3 className="h-3.5 w-3.5" />
              {isEditing ? "收起编辑" : "编辑内容"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => mergeWithPrevious(block.id)}
              disabled={block.order === 0}
            >
              <Merge className="h-3.5 w-3.5" />
              与上一块合并
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => moveBlockUp(block.id)}
              disabled={block.order === 0}
              title="上移"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              上移
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => moveBlockDown(block.id)}
              disabled={block.order === blocks.length - 1}
              title="下移"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              下移
            </Button>
            {block.type !== "question" && (
              <Button size="sm" variant="outline" onClick={() => splitBlock(block.id)}>
                <Split className="h-3.5 w-3.5" />
                拆分
              </Button>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="space-y-3 border-t border-ink-100 bg-paper/80 p-4">
            {block.type === "question" && (
              <>
                <Textarea
                  label="题干"
                  value={block.content}
                  onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                  rows={3}
                />
                {(block.questionType === "single" || block.questionType === "multiple") && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="block text-sm font-medium text-ink-700">选项</label>
                      <button
                        type="button"
                        onClick={() => addOption(block.id)}
                        className="text-xs text-gold-600 hover:text-gold-700"
                      >
                        + 添加选项
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                      {(block.options || []).map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-xs font-medium text-white ${getOptionColor(idx)}`}>
                            {optionLetter(idx)}
                          </span>
                          <Input
                            value={opt}
                            onChange={(e) => updateOption(block.id, idx, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(block.id, idx)}
                            className="flex-shrink-0 p-1 text-ink-400 hover:text-red-600"
                            title="删除选项"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea
                  label="答案"
                  value={block.answer || ""}
                  onChange={(e) => updateBlockField(block.id, { answer: e.target.value })}
                  rows={2}
                />
                <Textarea
                  label="解析"
                  value={block.analysis || ""}
                  onChange={(e) => updateBlockField(block.id, { analysis: e.target.value })}
                  rows={2}
                />
                <Textarea
                  label="总结"
                  value={block.summary || ""}
                  onChange={(e) => updateBlockField(block.id, { summary: e.target.value })}
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
                  onChange={(e) => updateBlockField(block.id, { difficulty: Number(e.target.value) })}
                />
              </>
            )}

            {block.type === "knowledge" && (
              <>
                <Input
                  label="标题"
                  value={block.knowledgeTitle || ""}
                  onChange={(e) => updateBlockField(block.id, { knowledgeTitle: e.target.value })}
                />
                <Textarea
                  label="内容"
                  value={block.content}
                  onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                  rows={5}
                />
              </>
            )}

            {block.type === "documentTitle" && (
              <Textarea
                label="文档标题"
                value={block.content}
                onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                rows={2}
              />
            )}

            {block.type === "groupTitle" && (
              <Textarea
                label="题型或项目名"
                value={block.content}
                onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                rows={2}
              />
            )}

            {block.type === "documentInfo" && (
              <>
                <Textarea
                  label="文档信息"
                  value={block.content}
                  onChange={(e) => updateBlockField(block.id, { content: e.target.value })}
                  rows={4}
                />
                <div className="text-sm text-ink-500">文档信息不会入库，仅保留在文档原始结构中。</div>
              </>
            )}

            <div className="flex justify-end pt-1">
              <Button size="sm" variant="gold" onClick={() => handleEditBlock(block.id)}>
                <Save className="h-3.5 w-3.5" />
                完成编辑
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
        <button
          type="button"
          onClick={() => setActiveKeywordTab("questionType")}
          className={cn(
            "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            activeKeywordTab === "questionType"
              ? "bg-paper text-ink-900 shadow-sm"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          题型识别关键字
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
              value={selectedKeywordType}
              className="text-xs h-7 w-24"
              options={[
                { value: "answer", label: "答案" },
                { value: "analysis", label: "解析" },
                { value: "summary", label: "总结" },
              ]}
              onChange={(e) => {
                setSelectedKeywordType(e.target.value as "answer" | "analysis" | "summary");
              }}
            />
            <Input
              value={newKeywordValue}
              onChange={(e) => setNewKeywordValue(e.target.value)}
              placeholder="新增关键字"
              className="text-xs h-7 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeywordValue.trim()) {
                  if (selectedKeywordType === "answer") {
                    extractConfig.addAnswerKeyword(newKeywordValue.trim());
                  } else if (selectedKeywordType === "analysis") {
                    extractConfig.addAnalysisKeyword(newKeywordValue.trim());
                  } else {
                    extractConfig.addSummaryKeyword(newKeywordValue.trim());
                  }
                  setNewKeywordValue("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (newKeywordValue.trim()) {
                  if (selectedKeywordType === "answer") {
                    extractConfig.addAnswerKeyword(newKeywordValue.trim());
                  } else if (selectedKeywordType === "analysis") {
                    extractConfig.addAnalysisKeyword(newKeywordValue.trim());
                  } else {
                    extractConfig.addSummaryKeyword(newKeywordValue.trim());
                  }
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

      {/* 题型识别关键字 */}
      {activeKeywordTab === "questionType" && (
        <div className="space-y-3">
          <div className="text-xs text-ink-500">
            以下关键字用于识别题目类型，当题目内容包含这些关键字时会自动识别为对应题型
          </div>
          
          {/* 单选题 */}
          <div>
            <div className="text-xs text-ink-500 mb-1.5">单选题关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.singleChoiceKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-blue-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-blue-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeSingleChoiceKeyword(idx)}
                    className="p-0.5 text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 多选题 */}
          <div>
            <div className="text-xs text-ink-500 mb-1.5">多选题关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.multipleChoiceKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-green-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeMultipleChoiceKeyword(idx)}
                    className="p-0.5 text-green-400 hover:text-green-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 填空题 */}
          <div>
            <div className="text-xs text-ink-500 mb-1.5">填空题关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.fillBlankKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-purple-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeFillBlankKeyword(idx)}
                    className="p-0.5 text-purple-400 hover:text-purple-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 解答题 */}
          <div>
            <div className="text-xs text-ink-500 mb-1.5">解答题关键字</div>
            <div className="flex flex-wrap gap-1">
              {extractConfig.essayKeywords.map((keyword, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded">
                  <span className="text-xs text-amber-700">{keyword}</span>
                  <button
                    type="button"
                    onClick={() => extractConfig.removeEssayKeyword(idx)}
                    className="p-0.5 text-amber-400 hover:text-amber-600"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 添加新关键字 */}
          <div className="flex gap-1">
            <Select
              value={selectedQuestionType || "single"}
              className="text-xs h-7 w-24"
              options={[
                { value: "single", label: "单选" },
                { value: "multiple", label: "多选" },
                { value: "fillblank", label: "填空" },
                { value: "essay", label: "解答" },
              ]}
              onChange={(e) => {
                setSelectedQuestionType(e.target.value as "single" | "multiple" | "fillblank" | "essay");
              }}
            />
            <Input
              value={newKeywordValue}
              onChange={(e) => setNewKeywordValue(e.target.value)}
              placeholder="新增关键字"
              className="text-xs h-7 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeywordValue.trim()) {
                  const type = selectedQuestionType || "single";
                  if (type === "single") {
                    extractConfig.addSingleChoiceKeyword(newKeywordValue.trim());
                  } else if (type === "multiple") {
                    extractConfig.addMultipleChoiceKeyword(newKeywordValue.trim());
                  } else if (type === "fillblank") {
                    extractConfig.addFillBlankKeyword(newKeywordValue.trim());
                  } else {
                    extractConfig.addEssayKeyword(newKeywordValue.trim());
                  }
                  setNewKeywordValue("");
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (newKeywordValue.trim()) {
                  const type = selectedQuestionType || "single";
                  if (type === "single") {
                    extractConfig.addSingleChoiceKeyword(newKeywordValue.trim());
                  } else if (type === "multiple") {
                    extractConfig.addMultipleChoiceKeyword(newKeywordValue.trim());
                  } else if (type === "fillblank") {
                    extractConfig.addFillBlankKeyword(newKeywordValue.trim());
                  } else {
                    extractConfig.addEssayKeyword(newKeywordValue.trim());
                  }
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
      <div className="flex h-full flex-col overflow-hidden rounded-lg bg-mist/30">
        <div className="flex-shrink-0 border-b border-ink-100 bg-mist/90 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 text-ink-500" />
                <span className="font-serif font-semibold text-ink-900">{resourceTitle}</span>
                <Badge variant="default">{resourceType === "examPaper" ? "试卷" : "讲义"}</Badge>
              </div>
              <div className="mt-1 text-xs text-ink-500">文档预览 · 共 {stats.total} 个切块</div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowKeywordConfig(true)}>
              <Settings className="h-3.5 w-3.5" />
              关键字与重新拆解
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="default">共 {stats.total} 块</Badge>
            <Badge variant="green">题目 {stats.question}</Badge>
            <Badge variant="gold">文档标题 {stats.documentTitle}</Badge>
            <Badge variant="default">文档信息 {stats.documentInfo}</Badge>
            <Badge variant="teal">知识块 {stats.knowledge}</Badge>
            <Badge variant="ink">题型或项目名 {stats.groupTitle}</Badge>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {blocks.length === 0 ? (
            <div className="py-12 text-center text-sm text-ink-400">
              <FileText className="mx-auto mb-2 h-10 w-10 text-ink-200" />
              暂无文档块
            </div>
          ) : (
            blocks.map(renderDocumentBlock)
          )}
        </div>
      </div>
    );
  };

  const duplicateReviewItems = Object.entries(duplicateChecks)
    .filter(([, check]) => !check.resolution)
    .map(([id, check]) => ({
      id,
      similarity: check.similarity,
      existing: check.candidate,
      canMerge: check.candidate.teacherId === teacher?.id,
      incoming: check.incoming,
    }));
  const duplicateReviewOpen = open && duplicateReviewItems.length > 0;

  return (
    <>
      <Modal
        open={open && !duplicateReviewOpen}
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
                  未入库 {stats.documentTitle + stats.documentInfo + stats.groupTitle}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={phase === "confirming"}>
                  取消
                </Button>
                <Button
                  variant="gold"
                  onClick={() => void handleConfirm()}
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
        <div
          ref={previewRootRef}
          className={cn("question-rich-content", officeMetafilePreviewClassName)}
        >
          {phase === "extracting" ? renderExtracting() : renderReview()}
        </div>
      </Modal>

      {duplicateReviewOpen && (
        <QuestionDuplicateReviewModal
          items={duplicateReviewItems}
          onClose={() => setDuplicateChecks({})}
          onConfirm={(resolutions) => {
            setDuplicateChecks((current) => Object.fromEntries(
              Object.entries(current).map(([id, check]) => [
                id,
                { ...check, resolution: resolutions[id] || check.resolution },
              ]),
            ));
            void handleConfirm(resolutions);
          }}
        />
      )}
      
      {/* 关键字配置弹窗 - 可拖动 */}
      {showKeywordConfig && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-[2000]"
            onClick={() => setShowKeywordConfig(false)}
          />
          <div
            className="fixed z-[2001] w-96 min-h-[500px] max-h-[80vh] bg-white rounded-lg shadow-xl border border-ink-200 flex flex-col overflow-hidden"
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
            <div className="p-4 flex-1 overflow-y-auto">
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
