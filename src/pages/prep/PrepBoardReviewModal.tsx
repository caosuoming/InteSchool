import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  Highlighter,
  Image as ImageIcon,
  PenLine,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { OfficeDocumentHtml } from "@/components/resource/OfficeDocumentHtml";
import { extractStoredFile } from "@/services/api";
import { prepService } from "@/services/prep";
import { toast } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type {
  PrepAnnotationStroke,
  PrepAssignment,
  PrepTask,
  PrepWorkflow,
  Teacher,
} from "@/types";

interface PrepBoardReviewModalProps {
  open: boolean;
  onClose: () => void;
  task: PrepTask;
  teacher: Teacher;
  teacherNames: Map<string, string>;
  onAnnotationsSaved?: () => Promise<void> | void;
}

type AnnotationTool = Pick<PrepAnnotationStroke, "tool" | "color">;

type ReviewItem = {
  key: string;
  targetId: string;
  assignment: PrepAssignment;
  workflow: PrepWorkflow;
  title: string;
  submitter: string;
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
  previewText?: string;
  kind: "image" | "pdf" | "document" | "resource";
};

const toolOptions: Array<AnnotationTool & { label: string; hex: string }> = [
  { tool: "pen", color: "black", label: "黑色笔", hex: "#1f2937" },
  { tool: "pen", color: "red", label: "红色笔", hex: "#dc2626" },
  { tool: "pen", color: "blue", label: "蓝色笔", hex: "#2563eb" },
  { tool: "highlighter", color: "yellow", label: "黄色荧光笔", hex: "#facc15" },
  { tool: "highlighter", color: "green", label: "绿色荧光笔", hex: "#4ade80" },
];

const colorHex: Record<PrepAnnotationStroke["color"], string> = {
  black: "#1f2937",
  red: "#dc2626",
  blue: "#2563eb",
  yellow: "#facc15",
  green: "#4ade80",
};

function fileKind(fileName = "", mimeType = ""): ReviewItem["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || /\.pdf$/i.test(fileName)) return "pdf";
  return "document";
}

function createItems(task: PrepTask, teacherNames: Map<string, string>): ReviewItem[] {
  return task.workflows
    .slice()
    .sort((a, b) => a.order - b.order)
    .flatMap((workflow): ReviewItem[] =>
      task.assignments
        .filter((assignment) => assignment.workflowId === workflow.id && assignment.submission)
        .flatMap((assignment): ReviewItem[] => {
          const submission = assignment.submission!;
          const submitter = teacherNames.get(assignment.teacherId) || "未知教师";
          if (submission.kind === "resource" && submission.resourceId) {
            return [{
              key: `${assignment.id}:resource:${submission.resourceId}`,
              targetId: `resource:${submission.resourceId}`,
              assignment,
              workflow,
              title: submission.resourceTitle || submission.title,
              submitter,
              fileUrl: submission.resourceFileUrl,
              fileName: submission.resourceFileName,
              previewText: submission.resourcePreviewText,
              kind: "resource" as const,
            }];
          }
          return submission.assets.map((asset, index) => ({
            key: `${assignment.id}:${asset.id}`,
            targetId: asset.id,
            assignment,
            workflow,
            title: submission.assets.length > 1 ? `${workflow.name} · 图片 ${index + 1}` : asset.name,
            submitter,
            fileUrl: asset.url,
            fileName: asset.name,
            mimeType: asset.mimeType,
            kind: fileKind(asset.name, asset.mimeType),
          }));
        }),
    );
}

function pathData(stroke: PrepAnnotationStroke): string {
  return stroke.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 1000} ${point.y * 1000}`)
    .join(" ");
}

function canExtract(fileName = ""): boolean {
  return /\.(docx|txt|md)$/i.test(fileName);
}

export function PrepBoardReviewModal({
  open,
  onClose,
  task,
  teacher,
  teacherNames,
  onAnnotationsSaved,
}: PrepBoardReviewModalProps) {
  const items = useMemo(() => createItems(task, teacherNames), [task, teacherNames]);
  const [index, setIndex] = useState(0);
  const [activeTool, setActiveTool] = useState<AnnotationTool>(toolOptions[0]);
  const [strokes, setStrokes] = useState<PrepAnnotationStroke[]>([]);
  const [drawingId, setDrawingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentPreview, setDocumentPreview] = useState({ loading: false, html: "", error: "" });
  const previewRef = useRef<HTMLDivElement>(null);

  const item = items[index] || null;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
  }, [open, task.id]);

  useEffect(() => {
    if (!item?.assignment.submission) {
      setStrokes([]);
      return;
    }
    setStrokes(
      (item.assignment.submission.annotations || []).filter((stroke) => stroke.targetId === item.targetId),
    );
    setDrawingId(null);
  }, [item]);

  useEffect(() => {
    if (!item?.fileUrl || !canExtract(item.fileName)) {
      setDocumentPreview({ loading: false, html: "", error: "" });
      return;
    }
    let active = true;
    setDocumentPreview({ loading: true, html: "", error: "" });
    extractStoredFile(item.fileUrl)
      .then((result) => {
        if (active) setDocumentPreview({ loading: false, html: result.html, error: "" });
      })
      .catch((error) => {
        if (active) {
          setDocumentPreview({
            loading: false,
            html: "",
            error: error instanceof Error ? error.message : "文档预览失败",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [item?.fileName, item?.fileUrl]);

  const pointerPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!item) return;
    const point = pointerPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const id = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setDrawingId(id);
    setStrokes((current) => [
      ...current,
      {
        id,
        targetId: item.targetId,
        tool: activeTool.tool,
        color: activeTool.color,
        points: [point, point],
        createdBy: teacher.id,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingId) return;
    const point = pointerPoint(event);
    if (!point) return;
    setStrokes((current) =>
      current.map((stroke) =>
        stroke.id === drawingId
          ? { ...stroke, points: [...stroke.points, point] }
          : stroke,
      ),
    );
  };

  const handlePointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrawingId(null);
  };

  const handleUndo = () => {
    setStrokes((current) => {
      const lastMine = [...current].reverse().find((stroke) => stroke.createdBy === teacher.id);
      return lastMine ? current.filter((stroke) => stroke.id !== lastMine.id) : current;
    });
  };

  const handleClearMine = () => {
    setStrokes((current) => current.filter((stroke) => stroke.createdBy !== teacher.id));
  };

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    try {
      const mine = strokes
        .filter((stroke) => stroke.createdBy === teacher.id)
        .map(({ id, tool, color, points }) => ({ id, tool, color, points }));
      const saved = await prepService.saveSubmissionAnnotations(
        task.id,
        item.assignment.id,
        item.targetId,
        mine,
        teacher,
      );
      setStrokes(saved.filter((stroke) => stroke.targetId === item.targetId));
      toast.success("批注已保存");
      await onAnnotationsSaved?.();
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const renderPreview = () => {
    if (!item) return null;
    if (item.kind === "image") {
      return <img src={item.fileUrl} alt={item.title} className="max-h-full max-w-full object-contain" />;
    }
    if (item.kind === "pdf" || (item.kind === "resource" && /\.pdf$/i.test(item.fileName || ""))) {
      return <iframe src={item.fileUrl} title={item.title} className="h-full w-full border-0" />;
    }
    if (documentPreview.loading) {
      return <div className="flex h-full items-center justify-center"><Spinner size={24} /></div>;
    }
    if (documentPreview.html) {
      return (
        <div className="h-full overflow-auto bg-white p-8">
          <OfficeDocumentHtml html={documentPreview.html} className="mx-auto max-w-4xl text-ink-900" />
        </div>
      );
    }
    if (item.previewText) {
      return (
        <div className="h-full overflow-auto bg-white p-8">
          <pre className="mx-auto max-w-4xl whitespace-pre-wrap font-sans text-sm leading-7 text-ink-800">
            {item.previewText}
          </pre>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <File className="h-14 w-14 text-ink-200" />
        <div className="mt-4 text-sm font-medium text-ink-700">{item.fileName || item.title}</div>
        <div className="mt-1 text-xs text-ink-400">
          {documentPreview.error || "该格式暂不支持在线预览，请下载查看"}
        </div>
        {item.fileUrl && (
          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="mt-4">
            <Button variant="gold" size="sm">
              <Download className="h-4 w-4" />
              下载成果
            </Button>
          </a>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      className="h-[92vh]"
      title="集体备课成果预览"
      description={`全部任务已完成，共 ${items.length} 份成果。可顺次查看并使用批注工具。`}
    >
      {item ? (
        <div className="grid h-[74vh] gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex min-w-0 flex-col rounded-xl border border-ink-100 bg-mist/60">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-paper px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">{item.title}</span>
                  <Badge variant="gold">{item.workflow.name}</Badge>
                </div>
                <div className="mt-1 text-xs text-ink-500">提交人：{item.submitter}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => setIndex((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一份
                </Button>
                <span className="min-w-14 text-center text-xs text-ink-500">{index + 1}/{items.length}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={index === items.length - 1}
                  onClick={() => setIndex((current) => Math.min(items.length - 1, current + 1))}
                >
                  下一份
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div ref={previewRef} className="relative min-h-0 flex-1 overflow-hidden bg-white">
              <div className="flex h-full items-center justify-center overflow-auto">{renderPreview()}</div>
              <svg
                aria-label="成果批注画布"
                className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              >
                {strokes.map((stroke) => (
                  <path
                    key={stroke.id}
                    d={pathData(stroke)}
                    fill="none"
                    stroke={colorHex[stroke.color]}
                    strokeWidth={stroke.tool === "highlighter" ? 26 : 5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={stroke.tool === "highlighter" ? 0.32 : 0.95}
                  />
                ))}
              </svg>
            </div>
          </div>

          <aside className="flex flex-col rounded-xl border border-ink-100 bg-paper p-4">
            <div>
              <h4 className="text-sm font-semibold text-ink-900">批注工具</h4>
              <p className="mt-1 text-xs leading-5 text-ink-500">选择画笔后直接在左侧成果上书写。</p>
            </div>

            <div className="mt-4 space-y-2">
              {toolOptions.map((option) => {
                const active = activeTool.tool === option.tool && activeTool.color === option.color;
                const Icon = option.tool === "pen" ? PenLine : Highlighter;
                return (
                  <button
                    key={`${option.tool}-${option.color}`}
                    type="button"
                    aria-label={option.label}
                    onClick={() => setActiveTool({ tool: option.tool, color: option.color })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      active ? "border-gold-400 bg-gold-50 text-ink-900" : "border-ink-100 text-ink-700 hover:bg-mist",
                    )}
                  >
                    <span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: option.hex }} />
                    <Icon className="h-4 w-4 text-ink-500" />
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={handleUndo}>
                <Undo2 className="h-4 w-4" />
                撤销
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearMine}>
                <Trash2 className="h-4 w-4" />
                清除我的
              </Button>
            </div>

            <div className="mt-auto pt-5">
              <div className="mb-3 rounded-lg bg-mist px-3 py-2 text-xs leading-5 text-ink-500">
                当前显示 {strokes.length} 条批注，其中 {strokes.filter((stroke) => stroke.createdBy === teacher.id).length} 条由你添加。
              </div>
              <Button className="w-full" variant="gold" loading={saving} onClick={() => void handleSave()}>
                <Save className="h-4 w-4" />
                保存当前批注
              </Button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex h-[60vh] flex-col items-center justify-center text-center">
          <ImageIcon className="h-12 w-12 text-ink-200" />
          <div className="mt-4 text-sm font-medium text-ink-700">暂无可预览成果</div>
        </div>
      )}
    </Modal>
  );
}

export default PrepBoardReviewModal;
