import { BookOpen, Copy, FileSpreadsheet, Presentation } from "lucide-react";
import {
  ExamPaperPreview,
  GenericResourcePreview,
  LecturePreview,
} from "@/components/resource/SchoolResourcePreviewModal";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { Courseware, ExamPaper, Lecture } from "@/types";

export type PlatformPreviewResource =
  | { resourceType: "examPaper"; title: string; snapshot: ExamPaper }
  | { resourceType: "lecture"; title: string; snapshot: Lecture }
  | { resourceType: "courseware"; title: string; snapshot: Courseware };

const resourceTypeLabel = {
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
} as const;

const resourceTypeIcon = {
  examPaper: FileSpreadsheet,
  lecture: BookOpen,
  courseware: Presentation,
} as const;

export interface PlatformResourcePreviewModalProps {
  resource: PlatformPreviewResource | null;
  donorName?: string;
  subject?: string;
  albumName?: string;
  canSave: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onBack: () => void;
}

export function PlatformResourcePreviewModal({
  resource,
  donorName,
  subject,
  albumName,
  canSave,
  saving,
  saved,
  onSave,
  onBack,
}: PlatformResourcePreviewModalProps) {
  if (!resource) return null;

  const Icon = resourceTypeIcon[resource.resourceType];

  return (
    <Modal
      open
      onClose={onBack}
      size="xl"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>返回</Button>
          {canSave && (
            <Button
              variant="gold"
              onClick={onSave}
              loading={saving}
              disabled={saved}
            >
              <Copy className="h-3.5 w-3.5" />
              {saved ? "已另存" : "另存"}
            </Button>
          )}
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="border-b border-ink-100 pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 flex-none text-gold-600" />
            <h3 className="min-w-0 truncate font-serif text-lg font-semibold text-ink-900">
              {resource.title}
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
            <span>{resourceTypeLabel[resource.resourceType]} · 平台资源预览</span>
            {subject && <span>学科：{subject}</span>}
            {donorName && <span>捐赠者：{donorName}</span>}
            {albumName && <span>专辑：{albumName}</span>}
          </div>
        </div>

        {resource.resourceType === "examPaper" ? (
          <ExamPaperPreview paper={resource.snapshot} />
        ) : resource.resourceType === "lecture" ? (
          <LecturePreview lecture={resource.snapshot} />
        ) : (
          <GenericResourcePreview resource={resource.snapshot} />
        )}
      </div>
    </Modal>
  );
}

export default PlatformResourcePreviewModal;
