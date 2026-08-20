import { useState } from "react";
import { Eye, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { FileNameDuplicateMatch } from "@/lib/file-name-duplicate";

export interface UploadFileDuplicateConflict {
  id: string;
  file: File;
  title: string;
  matches: FileNameDuplicateMatch[];
}

export type UploadDuplicateDecision = "skip" | "upload";

interface FileDuplicateReviewModalProps {
  conflicts: UploadFileDuplicateConflict[];
  onClose: () => void;
  onConfirm: (decisions: Record<string, UploadDuplicateDecision>) => void;
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return "未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function previewLocalFile(file: File) {
  const url = URL.createObjectURL(file);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function FileDuplicateReviewModal({
  conflicts,
  onClose,
  onConfirm,
}: FileDuplicateReviewModalProps) {
  const [decisions, setDecisions] = useState<Record<string, UploadDuplicateDecision>>({});
  const allResolved = conflicts.every((conflict) => Boolean(decisions[conflict.id]));

  return (
    <Modal
      open
      onClose={onClose}
      title="发现同名或相似文件"
      description="请比较本次文件与资源库中的相似文件内容，再决定放弃该文件或继续上传。"
      size="xl"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-ink-500">
            已处理 {conflicts.filter((conflict) => decisions[conflict.id]).length} / {conflicts.length} 个文件
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>取消上传</Button>
            <Button
              type="button"
              variant="gold"
              disabled={!allResolved}
              onClick={() => onConfirm(decisions)}
            >
              继续处理上传
            </Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        {conflicts.map((conflict, index) => (
          <section key={conflict.id} className="overflow-hidden rounded-xl border border-ink-200 bg-paper">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-mist/40 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-ink-900">待上传文件 {index + 1}</div>
                <div className="mt-0.5 text-xs text-ink-500">{conflict.file.name}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDecisions((current) => ({ ...current, [conflict.id]: "skip" }))}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    decisions[conflict.id] === "skip"
                      ? "border-red-300 bg-red-50 text-red-700"
                      : "border-ink-200 bg-paper text-ink-700 hover:border-red-200 hover:bg-red-50/60"
                  }`}
                >
                  <X className="h-4 w-4" />
                  放弃该文件
                </button>
                <button
                  type="button"
                  onClick={() => setDecisions((current) => ({ ...current, [conflict.id]: "upload" }))}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    decisions[conflict.id] === "upload"
                      ? "border-gold-400 bg-gold-50 text-ink-900"
                      : "border-ink-200 bg-paper text-ink-700 hover:border-gold-300 hover:bg-gold-50/60"
                  }`}
                >
                  <Upload className="h-4 w-4" />
                  继续上传
                </button>
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-ink-100 p-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink-800">本次上传</div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => previewLocalFile(conflict.file)}>
                    <Eye className="h-3.5 w-3.5" />
                    预览本次文件
                  </Button>
                </div>
                <dl className="space-y-2 text-sm">
                  <div><dt className="text-xs text-ink-400">文件名</dt><dd className="break-all text-ink-800">{conflict.file.name}</dd></div>
                  <div><dt className="text-xs text-ink-400">资源标题</dt><dd className="break-all text-ink-800">{conflict.title}</dd></div>
                  <div><dt className="text-xs text-ink-400">文件大小</dt><dd className="text-ink-800">{formatFileSize(conflict.file.size)}</dd></div>
                </dl>
              </div>

              <div className="p-4">
                <div className="mb-3 text-sm font-semibold text-ink-800">资源库中的相似文件</div>
                <div className="space-y-3">
                  {conflict.matches.map(({ candidate, similarity }) => (
                    <div key={candidate.id} className="rounded-lg border border-ink-100 bg-mist/20 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="break-all text-sm font-medium text-ink-900">
                            {candidate.fileName || candidate.title}
                          </div>
                          {candidate.fileName && candidate.title !== candidate.fileName && (
                            <div className="mt-0.5 break-all text-xs text-ink-500">标题：{candidate.title}</div>
                          )}
                        </div>
                        <Badge variant={similarity === 1 ? "red" : "gold"}>
                          {similarity === 1 ? "同名" : `相似 ${(similarity * 100).toFixed(0)}%`}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs text-ink-500">
                        文件大小：{formatFileSize(candidate.fileSize)}
                      </div>
                      {candidate.description && (
                        <div className="mt-2 whitespace-pre-wrap break-words text-xs text-ink-600">
                          {candidate.description}
                        </div>
                      )}
                      {candidate.fileUrl && (
                        <a
                          href={candidate.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          预览库中文件
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
