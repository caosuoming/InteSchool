import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Images, Link2, UploadCloud } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { uploadFile } from "@/services/api";
import { examPaperService } from "@/services/examPaper";
import { lectureService } from "@/services/lecture";
import { prepService } from "@/services/prep";
import { toast } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type {
  ExamPaper,
  Lecture,
  PrepAssignment,
  PrepSubmissionAsset,
  PrepSubmissionInput,
  PrepWorkflow,
  Teacher,
} from "@/types";

type SubmissionTab = "document" | "resource" | "images";

interface PrepSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  assignment: PrepAssignment | null;
  workflow: PrepWorkflow | null;
  teacher: Teacher;
  onSubmitted: () => Promise<void> | void;
}

const tabs: Array<{
  key: SubmissionTab;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    key: "document",
    label: "上传文档",
    description: "Word、PDF、PPT、表格或文本文件",
    icon: FileText,
  },
  {
    key: "resource",
    label: "关联我的资源",
    description: "选择已有讲义或试卷",
    icon: Link2,
  },
  {
    key: "images",
    label: "上传图片",
    description: "一次提交 1 至 12 张图片",
    icon: Images,
  },
];

function toAsset(uploaded: Awaited<ReturnType<typeof uploadFile>>): PrepSubmissionAsset {
  return {
    id: uploaded.id,
    name: uploaded.originalName,
    url: uploaded.url,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
  };
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function PrepSubmissionModal({
  open,
  onClose,
  taskId,
  assignment,
  workflow,
  teacher,
  onSubmitted,
}: PrepSubmissionModalProps) {
  const [tab, setTab] = useState<SubmissionTab>("document");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedResource, setSelectedResource] = useState("");
  const [loadingResources, setLoadingResources] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab(assignment?.submission?.kind || "document");
    setDocumentFile(null);
    setImageFiles([]);
    setSelectedResource(
      assignment?.submission?.resourceType && assignment.submission.resourceId
        ? `${assignment.submission.resourceType}:${assignment.submission.resourceId}`
        : "",
    );
  }, [assignment, open]);

  useEffect(() => {
    if (!open || tab !== "resource") return;
    let active = true;
    setLoadingResources(true);
    Promise.all([
      lectureService.listLectures({ teacherId: teacher.id, schoolId: teacher.schoolId }),
      examPaperService.listPapers({ teacherId: teacher.id, schoolId: teacher.schoolId }),
    ])
      .then(([lectureList, paperList]) => {
        if (!active) return;
        setLectures(lectureList);
        setPapers(paperList);
      })
      .catch((error) => {
        if (!active) return;
        toast.error("资源加载失败", error instanceof Error ? error.message : undefined);
      })
      .finally(() => {
        if (active) setLoadingResources(false);
      });
    return () => {
      active = false;
    };
  }, [open, tab, teacher.id, teacher.schoolId]);

  const resources = useMemo(() => [
    ...lectures.map((resource) => ({
      key: `lecture:${resource.id}`,
      type: "讲义",
      title: resource.title,
      detail: `${resource.grade || "未分年级"} · ${resource.schoolYear || "未设置学年"}`,
    })),
    ...papers.map((resource) => ({
      key: `examPaper:${resource.id}`,
      type: "试卷",
      title: resource.title,
      detail: `${resource.grade || "未分年级"} · ${resource.totalScore || 0} 分`,
    })),
  ], [lectures, papers]);

  const handleSubmit = async () => {
    if (!assignment) return;
    let input: PrepSubmissionInput;
    setSubmitting(true);
    try {
      if (tab === "document") {
        if (!documentFile) throw new Error("请选择要提交的文档");
        const uploaded = await uploadFile(documentFile);
        input = { kind: "document", assets: [toAsset(uploaded)] };
      } else if (tab === "images") {
        if (imageFiles.length === 0) throw new Error("请选择至少一张图片");
        if (imageFiles.length > 12) throw new Error("一次最多上传 12 张图片");
        const uploaded = await Promise.all(imageFiles.map((file) => uploadFile(file)));
        input = { kind: "images", assets: uploaded.map(toAsset) };
      } else {
        if (!selectedResource) throw new Error("请选择一份讲义或试卷");
        const separator = selectedResource.indexOf(":");
        input = {
          kind: "resource",
          resourceType: selectedResource.slice(0, separator) as "lecture" | "examPaper",
          resourceId: selectedResource.slice(separator + 1),
        };
      }

      await prepService.submitAssignment(taskId, assignment.id, input, teacher);
      toast.success("成果已提交", "现在可以完成任务");
      await onSubmitted();
      onClose();
    } catch (error) {
      toast.error("提交失败", error instanceof Error ? error.message : "请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`提交成果${workflow ? `：${workflow.name}` : ""}`}
      description="提交文档、关联“我的资源”中的讲义或试卷，或上传图片。提交后才能完成任务。"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button variant="gold" onClick={() => void handleSubmit()} loading={submitting}>
            <UploadCloud className="h-4 w-4" />
            提交成果
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {assignment?.submission && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            当前已提交：{assignment.submission.title}。重新提交会替换原成果。
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-3">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-gold-400 bg-gold-50"
                    : "border-ink-100 hover:border-gold-200 hover:bg-mist",
                )}
              >
                <Icon className={cn("mb-2 h-5 w-5", active ? "text-gold-700" : "text-ink-400")} />
                <div className="text-sm font-medium text-ink-900">{item.label}</div>
                <div className="mt-1 text-xs leading-5 text-ink-500">{item.description}</div>
              </button>
            );
          })}
        </div>

        {tab === "document" && (
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-ink-200 bg-mist/40 p-8 text-center hover:border-gold-300 hover:bg-gold-50/30">
            <input
              aria-label="选择成果文档"
              type="file"
              className="sr-only"
              accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.txt,.md"
              onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
            />
            <UploadCloud className="mx-auto h-9 w-9 text-ink-300" />
            <div className="mt-3 text-sm font-medium text-ink-800">
              {documentFile ? documentFile.name : "点击选择一个文档"}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              {documentFile ? fileSizeLabel(documentFile.size) : "支持 Word、PDF、PPT、Excel、TXT 和 Markdown"}
            </div>
          </label>
        )}

        {tab === "images" && (
          <div className="space-y-3">
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-ink-200 bg-mist/40 p-6 text-center hover:border-gold-300 hover:bg-gold-50/30">
              <input
                aria-label="选择成果图片"
                type="file"
                className="sr-only"
                accept="image/*"
                multiple
                onChange={(event) => setImageFiles(Array.from(event.target.files || []).slice(0, 12))}
              />
              <Images className="mx-auto h-9 w-9 text-ink-300" />
              <div className="mt-3 text-sm font-medium text-ink-800">
                {imageFiles.length > 0 ? `已选择 ${imageFiles.length} 张图片` : "点击选择图片"}
              </div>
              <div className="mt-1 text-xs text-ink-500">支持 PNG、JPG、GIF、WebP，最多 12 张</div>
            </label>
            {imageFiles.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {imageFiles.map((file) => (
                  <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{file.name}</span>
                    <span className="text-xs text-ink-400">{fileSizeLabel(file.size)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "resource" && (
          <div className="min-h-48">
            {loadingResources ? (
              <div className="flex items-center justify-center py-14"><Spinner size={22} /></div>
            ) : resources.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {resources.map((resource) => (
                  <label
                    key={resource.key}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                      selectedResource === resource.key
                        ? "border-gold-300 bg-gold-50"
                        : "border-ink-100 hover:border-ink-200 hover:bg-mist",
                    )}
                  >
                    <input
                      type="radio"
                      name="prep-resource"
                      checked={selectedResource === resource.key}
                      onChange={() => setSelectedResource(resource.key)}
                      className="h-4 w-4 border-ink-300 text-gold-600 focus:ring-gold-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink-900">{resource.title}</span>
                        <Badge variant="gold">{resource.type}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-ink-500">{resource.detail}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-ink-200 px-4 py-12 text-center">
                <Link2 className="mx-auto h-8 w-8 text-ink-300" />
                <div className="mt-3 text-sm font-medium text-ink-700">“我的资源”中暂无讲义或试卷</div>
                <div className="mt-1 text-xs text-ink-400">请先在资源中心创建或上传资源</div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default PrepSubmissionModal;
