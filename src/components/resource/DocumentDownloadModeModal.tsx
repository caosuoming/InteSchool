import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { DocumentDownloadMode } from "@/lib/docx";
import { cn } from "@/lib/utils";

const modeOptions: Array<{
  value: DocumentDownloadMode;
  label: string;
  description: string;
}> = [
  {
    value: "student",
    label: "学生用卷（无答案）",
    description: "保留题目内容，不包含答案和解析。",
  },
  {
    value: "teacher",
    label: "教师用卷（含答案解析）",
    description: "答案和解析紧跟在对应题目后。",
  },
  {
    value: "normal",
    label: "普通用卷（答案解析在最后）",
    description: "先排列完整题目，再在文档末尾集中列出答案解析。",
  },
  {
    value: "answers",
    label: "纯答案版",
    description: "仅保留题号和答案，便于快速核对。",
  },
];

interface DocumentDownloadModeModalProps {
  open: boolean;
  onClose: () => void;
  selectedModes: DocumentDownloadMode[];
  onSelectedModesChange: (modes: DocumentDownloadMode[]) => void;
  onDownload: () => void;
  loading?: boolean;
  resourceLabel: "试卷" | "讲义";
}

export function DocumentDownloadModeModal({
  open,
  onClose,
  selectedModes,
  onSelectedModesChange,
  onDownload,
  loading = false,
  resourceLabel,
}: DocumentDownloadModeModalProps) {
  const toggleMode = (mode: DocumentDownloadMode) => {
    onSelectedModesChange(
      selectedModes.includes(mode)
        ? selectedModes.filter((item) => item !== mode)
        : [...selectedModes, mode],
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`下载${resourceLabel}`}
      description="可同时选择多个版本；多选时会打包为 ZIP 一次下载。"
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>取消</Button>
          <Button
            variant="gold"
            onClick={onDownload}
            loading={loading}
            disabled={selectedModes.length === 0}
          >
            下载{selectedModes.length > 1 ? ` ${selectedModes.length} 个版本` : ""}
          </Button>
        </>
      )}
    >
      <div className="space-y-2">
        {modeOptions.map((option) => {
          const checked = selectedModes.includes(option.value);
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
                checked
                  ? "border-gold-300 bg-gold-50/60"
                  : "border-ink-100 hover:border-ink-200 hover:bg-mist/40",
              )}
            >
              <input
                type="checkbox"
                aria-label={option.label}
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-gold-600 focus:ring-gold-500"
                checked={checked}
                onChange={() => toggleMode(option.value)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-800">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-ink-500">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

export default DocumentDownloadModeModal;
