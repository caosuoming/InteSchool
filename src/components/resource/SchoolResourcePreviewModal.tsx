import { useEffect, useState } from "react";
import { Copy, FileBox, FileQuestion, FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { ExpandableQuestionContent } from "@/components/resource/ExpandableQuestionContent";
import { Button } from "@/components/ui/Button";
import { MathHtml } from "@/components/ui/MathHtml";
import { Modal } from "@/components/ui/Modal";
import { parseSchoolResourceSnapshot } from "@/lib/school-resource-snapshot";
import { ExtractedQuestionContent } from "@/pages/exam-papers/ExtractedQuestionContent";
import type {
  Courseware,
  ExamPaper,
  ExtractedDocumentBlock,
  Lecture,
  LectureSection,
  Material,
  Question,
  SchoolBackupResourceType,
  SchoolResourceBackup,
} from "@/types";

const resourceTypeLabel: Record<SchoolBackupResourceType, string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
};

const resourceTypeIcon: Record<SchoolBackupResourceType, typeof FileText> = {
  question: FileQuestion,
  examPaper: FileSpreadsheet,
  lecture: FileText,
  courseware: Presentation,
  material: FileBox,
};

function SnapshotMetadata({ backup, providerName }: {
  backup: SchoolResourceBackup;
  providerName?: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-ink-100 bg-mist/40 px-3 py-2 text-xs text-ink-500">
      <span>提供者：<span className="text-ink-700">{providerName || "未知"}</span></span>
      {backup.grade && <span>年级：<span className="text-ink-700">{backup.grade}</span></span>}
      {backup.schoolYear && <span>学年：<span className="text-ink-700">{backup.schoolYear}</span></span>}
      {backup.semester && <span>学期：<span className="text-ink-700">{backup.semester}</span></span>}
      {Object.entries(backup.meta).map(([key, value]) => (
        <span key={key}>{key}：<span className="text-ink-700">{value}</span></span>
      ))}
    </div>
  );
}

function DocumentBlocksPreview({ blocks }: { blocks: ExtractedDocumentBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "question") {
          return (
            <div key={block.id} className="rounded-md border border-ink-100 p-3">
              <div className="mb-1 text-xs font-medium text-ink-400">第 {index + 1} 项 · 题目</div>
              <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                {block.content}
              </MathHtml>
            </div>
          );
        }
        return (
          <div key={block.id} className="rounded-md border border-ink-100 bg-paper p-3">
            {block.title && (
              <MathHtml className="mb-1 font-medium text-ink-900">{block.title}</MathHtml>
            )}
            <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
              {block.content}
            </MathHtml>
          </div>
        );
      })}
    </div>
  );
}

function ExamPaperPreview({ paper }: { paper: ExamPaper }) {
  return (
    <div className="space-y-4">
      {paper.description && (
        <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
          {paper.description}
        </MathHtml>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-ink-500">
        <span>题目数：{paper.questions.length}</span>
        <span>总分：{paper.totalScore}</span>
        <span>时长：{paper.duration} 分钟</span>
      </div>
      {paper.questions.length > 0 ? (
        <div className="space-y-4">
          {paper.questions.map((question, index) => (
            <div key={question.id} className="rounded-md border border-ink-100 bg-paper p-3">
              <ExtractedQuestionContent
                number={index + 1}
                stem={question.stem}
                options={question.options}
                answer={question.answer}
                analysis={question.analysis}
              />
              <div className="mt-2 text-right text-xs text-ink-400">{question.score} 分</div>
            </div>
          ))}
        </div>
      ) : paper.contentBlocks?.length ? (
        <DocumentBlocksPreview blocks={paper.contentBlocks} />
      ) : (
        <div className="rounded-md border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
          该试卷快照暂无可预览的题目内容
        </div>
      )}
    </div>
  );
}

function LectureSectionPreview({ section, depth = 0 }: { section: LectureSection; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-4 border-l border-ink-100 pl-3" : ""}>
      <div className="rounded-md border border-ink-100 bg-paper p-3">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-ink-400">{section.type}</span>
          <MathHtml className="font-medium text-ink-900">{section.title}</MathHtml>
        </div>
        {section.content && (
          <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
            {section.content}
          </MathHtml>
        )}
        {section.questionId && !section.content && (
          <div className="text-xs text-ink-400">关联题目：{section.questionId}</div>
        )}
      </div>
      {section.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {section.children.map((child) => (
            <LectureSectionPreview key={child.id} section={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function LecturePreview({ lecture }: { lecture: Lecture }) {
  return (
    <div className="space-y-4">
      {lecture.description && (
        <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
          {lecture.description}
        </MathHtml>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-ink-500">
        <span>章节数：{lecture.sections.length}</span>
        <span>版本：{lecture.version}</span>
      </div>
      {lecture.contentBlocks?.length ? (
        <DocumentBlocksPreview blocks={lecture.contentBlocks} />
      ) : lecture.sections.length > 0 ? (
        <div className="space-y-3">
          {lecture.sections.map((section) => (
            <LectureSectionPreview key={section.id} section={section} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
          该讲义快照暂无可预览的正文内容
        </div>
      )}
    </div>
  );
}

function GenericResourcePreview({ resource }: { resource: Courseware | Material }) {
  return (
    <div className="space-y-3">
      {resource.description && (
        <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
          {resource.description}
        </MathHtml>
      )}
      <div className="rounded-md border border-ink-100 bg-mist/30 p-4">
        <MathHtml className="whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
          {resource.content || "（无文本内容）"}
        </MathHtml>
      </div>
    </div>
  );
}

export interface SchoolResourcePreviewModalProps {
  backup: SchoolResourceBackup | null;
  providerName?: string;
  isProvider: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
}

export function SchoolResourcePreviewModal({
  backup,
  providerName,
  isProvider,
  saving,
  saved,
  onSave,
  onClose,
}: SchoolResourcePreviewModalProps) {
  const [questionExpanded, setQuestionExpanded] = useState(false);

  useEffect(() => {
    setQuestionExpanded(false);
  }, [backup?.id]);

  if (!backup) return null;

  const Icon = resourceTypeIcon[backup.resourceType];
  const snapshot = parseSchoolResourceSnapshot<Question | ExamPaper | Lecture | Courseware | Material>(backup);

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 flex-shrink-0 text-gold-600" />
          <span className="truncate">{backup.title}</span>
        </div>
      }
      description={`${resourceTypeLabel[backup.resourceType]} · 校本资源预览`}
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          <Button
            variant="gold"
            onClick={onSave}
            loading={saving}
            disabled={isProvider || saved}
          >
            <Copy className="h-3.5 w-3.5" />
            {isProvider ? "本人提供" : saved ? "已在我的资源" : "另存到我的资源"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SnapshotMetadata backup={backup} providerName={providerName} />
        {!snapshot ? (
          <div className="rounded-md border border-red-200 bg-red-50/40 p-4 text-sm text-red-700">
            资源快照无法解析，暂时不能预览。
          </div>
        ) : backup.resourceType === "question" ? (
          <ExpandableQuestionContent
            question={snapshot as Question}
            expanded={questionExpanded}
            onToggle={() => setQuestionExpanded((value) => !value)}
            optionsTestId="school-preview-question-options"
          />
        ) : backup.resourceType === "examPaper" ? (
          <ExamPaperPreview paper={snapshot as ExamPaper} />
        ) : backup.resourceType === "lecture" ? (
          <LecturePreview lecture={snapshot as Lecture} />
        ) : (
          <GenericResourcePreview resource={snapshot as Courseware | Material} />
        )}
      </div>
    </Modal>
  );
}

export default SchoolResourcePreviewModal;
