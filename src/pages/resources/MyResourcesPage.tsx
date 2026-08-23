import { openPage } from "@/lib/navigation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Search, FileQuestion, BookOpen, Lightbulb,
  Calendar, Eye, Presentation, FileBox,
  ArrowUpDown, Clock, ChevronDown, ChevronRight,
  FileSpreadsheet, Sparkles, Trash2, Share2, Upload, Filter, Library, FileText,
  PlayCircle, Copy, MessageSquareText, Star, Video,
  ShoppingCart, CheckSquare, Square, Plus, X,
  Layout,
  Gift, Users, Pencil, Check,
  Folder, FolderPlus, FolderMinus, Pin, PinOff, ArrowUp, ArrowDown,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { extractStoredFile } from "@/services/api";
import { questionService } from "@/services/question";
import { examPaperService } from "@/services/examPaper";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { lectureService } from "@/services/lecture";
import { shareService } from "@/services/share";
import { donationService } from "@/services/donation";
import { knowledgeService } from "@/services/knowledge";
import { reflectionService } from "@/services/reflection";
import { basketService } from "@/services/basket";
import { resourceFolderService } from "@/services/resourceFolder";
import { quotaService } from "@/services/quota";
import { classService } from "@/services/class";
import { analyticsService, type KnowledgeMastery } from "@/services/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PaginationBar } from "@/components/ui/PaginationBar";
import { Textarea, Input } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type {
  Lecture, ExamPaper, Courseware, Material, Question,
  TreeNode, FilterLogic, ShareScope,
  CoursewareType, MaterialType, ShareableResourceType,
  Reflection, Basket, AnyClass, Student, AnswerRecord,
  DonationCheckResult, DonationDecision, DonationItem, PlatformDonation, ResourceSemester,
  LessonDocumentBlock,
  ResourceFolder, ResourceFolderType,
  UserQuotaSnapshot,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { genId } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { getQuestionOptionGridColumns } from "@/lib/question-option-layout";
import QuestionBankPage from "@/pages/question-bank/QuestionBankPage";
import { AddToBasketDropdown } from "@/components/basket/AddToBasketDropdown";
import { DocumentDownloadButton } from "@/components/resource/DocumentDownloadButton";
import { DocumentFormatIcon } from "@/components/resource/DocumentFormatIcon";
import { MaterialImageThumbnail, MaterialPreviewModal } from "@/components/resource/MaterialPreviewModal";
import {
  ConfigurableResourceActions,
  type ConfigurableResourceAction,
} from "@/components/resource/ConfigurableResourceActions";
import { Badge } from "@/components/ui/Badge";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import { useDocumentTypeOptions } from "@/hooks/useDocumentTypeOptions";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionSupplementaryDetails } from "@/components/question/QuestionSupplementaryDetails";
import { QuestionVideoModal } from "@/components/question/QuestionVideoModal";
import { BasketAudiencePicker } from "@/components/basket/BasketAudiencePicker";
import {
  basketAudienceLabel,
  resolveBasketAudienceStudentIds,
  treeNameMap,
} from "@/lib/basket-audience";
import { promptToRemoveReferencedBasketQuestions } from "@/lib/basket-reference";
import { createBlankLessonCourseware } from "@/lib/lesson-courseware-create";
import {
  appendUniqueIds,
  batchResourceKey,
  parseBatchResourceKey,
  type BatchResourceRef,
} from "@/pages/resources/batch-resource";
import {
  currentParseConfig,
  isExtractTaskRunning,
  useExtractTasksStore,
} from "@/stores/extractTasks";
import { parseDocumentBlocks, type DocumentBlock } from "@/lib/document-block-parser";
import { matchingResourceTypeIds } from "@/lib/resource-type-hierarchy";
import { annotateTreeWithResourceCounts } from "@/lib/resource-tree-counts";
import { AddResourceToPrepModal } from "@/components/prep/AddResourceToPrepModal";
import { loadCoursewarePptSlides } from "@/lib/pptx";
import { openCoursewareInWps } from "@/lib/wps";
import {
  documentCategory,
  documentCategoryOptions,
  isPdfDocumentResource,
  type DocumentCategory,
} from "@/lib/document-resource";

type MyResourceTab = "question" | "examPaper" | "lecture" | "courseware" | "material" | "basket";
type RenameableResourceType = Exclude<MyResourceTab, "question" | "basket">;
type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "title";
type ResourceListItem = Question | ExamPaper | Lecture | Courseware | Material;

type ResourceListUnit =
  | { kind: "folder"; folder: ResourceFolder; items: ResourceListItem[] }
  | { kind: "resource"; item: ResourceListItem };

function resourceListTitle(item: ResourceListItem): string {
  return "title" in item ? item.title : item.stem;
}

function compareResourceListUnits(left: ResourceListUnit, right: ResourceListUnit, sortKey: SortKey): number {
  const leftPinned = left.kind === "folder" && left.folder.pinned;
  const rightPinned = right.kind === "folder" && right.folder.pinned;
  if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;

  const leftTitle = left.kind === "folder" ? left.folder.name : resourceListTitle(left.item);
  const rightTitle = right.kind === "folder" ? right.folder.name : resourceListTitle(right.item);
  const leftCreatedAt = left.kind === "folder" ? left.folder.createdAt : left.item.createdAt;
  const rightCreatedAt = right.kind === "folder" ? right.folder.createdAt : right.item.createdAt;
  const leftUpdatedAt = left.kind === "folder" ? left.folder.updatedAt : left.item.updatedAt;
  const rightUpdatedAt = right.kind === "folder" ? right.folder.updatedAt : right.item.updatedAt;

  if (sortKey === "updated") {
    const result = rightUpdatedAt.localeCompare(leftUpdatedAt);
    if (result !== 0) return result;
  } else if (sortKey === "created") {
    const result = rightCreatedAt.localeCompare(leftCreatedAt);
    if (result !== 0) return result;
  } else {
    const result = leftTitle.localeCompare(rightTitle, "zh-CN");
    if (result !== 0) return result;
  }

  return leftTitle.localeCompare(rightTitle, "zh-CN");
}

function isResourceFolderType(value: MyResourceTab): value is ResourceFolderType {
  return value === "examPaper" || value === "lecture" || value === "courseware";
}

interface MyResourcesPageProps {
  initialTab?: MyResourceTab;
}

const tabConfig: { key: MyResourceTab; label: string; icon: typeof FileText; description: string }[] = [
  { key: "question", label: "题库", icon: FileQuestion, description: "管理我的题目，支持查重和分享" },
  { key: "examPaper", label: "试卷库", icon: FileSpreadsheet, description: "管理试卷，支持拆解入题库" },
  { key: "lecture", label: "讲义库", icon: FileText, description: "管理和创建教学讲义" },
  { key: "courseware", label: "课件库", icon: Presentation, description: "管理课件资源，可在生成讲义时引用" },
  { key: "material", label: "素材库", icon: FileBox, description: "管理教学素材，可在生成讲义时引用" },
  { key: "basket", label: "资源篮", icon: ShoppingCart, description: "管理资源篮，快速将题目和素材生成讲义或试卷" },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "updated", label: "最近更新", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "created", label: "创建时间", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

const difficultyLabel = ["", "简单", "较易", "中等", "较难", "困难"];

const masteryPresentation: Record<
  KnowledgeMastery["masteryLevel"],
  { label: string; className: string }
> = {
  mastered: { label: "已掌握", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  basic: { label: "基本掌握", className: "border-amber-200 bg-amber-50 text-amber-700" },
  weak: { label: "薄弱", className: "border-red-200 bg-red-50 text-red-700" },
  untrained: { label: "未训练", className: "border-ink-100 bg-mist text-ink-500" },
};

function usageDateLabels(records: AnswerRecord[]): string[] {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Array.from(new Set(records.map((record) => formatter.format(new Date(record.answeredAt)))));
}

const coursewareTypeLabel: Record<CoursewareType, string> = {
  ppt: "PPT",
  ggb: "GeoGebra",
  pdf: "PDF",
  video: "视频",
  image: "图片",
  other: "其他",
};

const materialTypeLabel: Record<MaterialType, string> = {
  text: "文本",
  image: "图片",
  audio: "音频",
  video: "视频",
  link: "链接",
  file: "文件",
  knowledgeBlock: "知识块",
};

function hasLectureLessonBody(sections: Lecture["sections"]): boolean {
  return sections.some((section) =>
    section.type === "question"
    || section.type === "knowledge"
    || hasLectureLessonBody(section.children || []));
}

function lessonDocumentBlocks(blocks: DocumentBlock[]): LessonDocumentBlock[] {
  return blocks.flatMap<LessonDocumentBlock>((block) => {
    if (
      block.type === "documentTitle"
      || block.type === "documentInfo"
      || block.type === "groupTitle"
    ) {
      return [{
        id: block.id,
        type: block.type,
        content: block.content,
      }];
    }
    if (block.type === "knowledge") {
      return [{
        id: block.id,
        type: "knowledge" as const,
        title: block.knowledgeTitle,
        content: block.content,
      }];
    }
    if (block.type !== "question") return [];
    return [{
      id: block.id,
      type: "question" as const,
      content: block.content,
      questionType: block.questionType,
      options: block.options,
      answer: block.answer,
      analysis: block.analysis,
    }];
  });
}

async function fallbackLessonBlocks(
  resource: ExamPaper | Lecture,
  resourceType: "examPaper" | "lecture",
): Promise<LessonDocumentBlock[]> {
  const hasBody = resourceType === "examPaper"
    ? ((resource as ExamPaper).questions.length > 0
      || Boolean((resource as ExamPaper).contentBlocks?.some((block) =>
        block.type === "question" || block.type === "knowledge")))
    : hasLectureLessonBody((resource as Lecture).sections);
  if (hasBody || !resource.originalFileUrl) return [];

  const extracted = await extractStoredFile(resource.originalFileUrl);
  const blocks = lessonDocumentBlocks(parseDocumentBlocks(extracted.text, currentParseConfig()));
  if (!blocks.some((block) => block.type === "question" || block.type === "knowledge")) {
    throw new Error("文档中未识别出题目或知识块，请先进行文档拆解");
  }
  return blocks;
}

interface OriginalFileRowProps {
  fileUrl: string;
  fileName?: string;
  fileType?: "word" | "pdf";
  icon: typeof FileText;
  onView: () => void;
}

export function OriginalFileRow({
  fileUrl,
  fileName,
  fileType,
  icon: FileIcon,
  onView,
}: OriginalFileRowProps) {
  const displayName = fileName || "原稿文件";

  return (
    <div className="ml-4 flex min-w-0 items-center gap-3 rounded-lg bg-ink-50/60 px-3 py-2 text-sm">
      <DocumentFormatIcon fileType={fileType} fileName={fileName} />
      {!fileType && !fileName && <FileIcon className="h-4 w-4 flex-shrink-0 text-ink-400" />}
      <span className="min-w-0 flex-1 truncate text-ink-600">
        <span className="font-medium text-ink-500">原稿：</span>
        <span title={displayName}>{displayName}</span>
      </span>
      <div className="flex flex-shrink-0 items-center gap-3 text-xs">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-ink-600 transition-colors hover:text-ink-900"
          onClick={onView}
        >
          <Eye className="h-3.5 w-3.5" />
          查看
        </button>
        <DocumentDownloadButton
          fileUrl={fileUrl}
          fileName={fileName}
          className="text-gold-600 transition-colors hover:text-gold-700"
          iconClassName="h-3.5 w-3.5"
        />
      </div>
    </div>
  );
}

interface LinkedResourceRowProps {
  label: "原稿" | "课件";
  title: string;
  icon: typeof FileText;
  onView: () => void;
}

export function LinkedResourceRow({
  label,
  title,
  icon: ResourceIcon,
  onView,
}: LinkedResourceRowProps) {
  return (
    <div className="ml-4 flex min-w-0 items-center gap-3 rounded-lg bg-ink-50/60 px-3 py-2 text-sm">
      <ResourceIcon className="h-4 w-4 flex-shrink-0 text-ink-400" />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-ink-600 transition-colors hover:text-ink-900"
        onClick={onView}
        title={title}
      >
        <span className="font-medium text-ink-500">{label}：</span>
        <span>{title}</span>
      </button>
      <button
        type="button"
        className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-ink-600 transition-colors hover:text-ink-900"
        onClick={onView}
        aria-label={`查看${label}：${title}`}
      >
        <Eye className="h-3.5 w-3.5" />
        查看
      </button>
    </div>
  );
}

interface DocumentResourceGroupProps {
  children: React.ReactNode;
}

export function DocumentResourceGroup({ children }: DocumentResourceGroupProps) {
  return (
    <section
      className="rounded-xl border border-ink-200 bg-ink-50/35 p-3 shadow-sm"
      data-testid="document-resource-group"
    >
      <div className="space-y-2">{children}</div>
    </section>
  );
}

interface ResourceFolderHeaderProps {
  folder: ResourceFolder;
  collapsed: boolean;
  visibleCount: number;
  onToggle: () => void;
  onRename: (name: string) => Promise<void>;
  onTogglePin: () => void;
  onShare: () => void;
  onDonate: () => void;
  onDelete: () => void;
}

function ResourceFolderHeader({
  folder,
  collapsed,
  visibleCount,
  onToggle,
  onRename,
  onTogglePin,
  onShare,
  onDonate,
  onDelete,
}: ResourceFolderHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!renaming) setDraft(folder.name);
  }, [folder.name, renaming]);

  const save = async () => {
    const next = draft.trim();
    if (!next) {
      toast.warning("专辑名称不能为空");
      return;
    }
    if (next === folder.name) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(next);
      setRenaming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
      role="group"
      aria-label={`专辑：${folder.name}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <button
          type="button"
          className="rounded p-0.5 text-amber-700 hover:bg-amber-100"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "展开" : "收拢"}专辑：${folder.name}`}
        >
          {collapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </button>
        <Folder className="h-4 w-4 flex-none text-amber-700" />
        {renaming ? (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setRenaming(false);
            }}
            className="min-w-32 max-w-sm flex-1 rounded border border-amber-300 bg-paper px-2 py-1 text-sm font-medium outline-none focus:border-gold-400"
            autoFocus
            aria-label={`重命名专辑：${folder.name}`}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm font-semibold text-ink-800 hover:text-amber-800"
            onClick={onToggle}
            aria-expanded={!collapsed}
          >
            {folder.name}
          </button>
        )}
        <span className="flex-none text-xs text-ink-500">
          {visibleCount === folder.resourceIds.length
            ? `${folder.resourceIds.length} 个文档`
            : `${visibleCount}/${folder.resourceIds.length} 个文档`}
        </span>
        {folder.pinned && <Pin className="h-3.5 w-3.5 flex-none text-amber-700" aria-label="已置顶" />}
      </div>

      {renaming ? (
        <>
          <button
            type="button"
            className="rounded p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving}
            title="保存专辑名称"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 text-ink-500 hover:bg-ink-100"
            onClick={() => setRenaming(false)}
            title="取消改名"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="rounded p-1.5 text-ink-500 hover:bg-paper hover:text-ink-800"
          onClick={() => setRenaming(true)}
          title="修改专辑名称"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        className="rounded p-1.5 text-ink-500 hover:bg-paper hover:text-amber-700"
        onClick={onTogglePin}
        title={folder.pinned ? "取消置顶" : "置顶"}
      >
        {folder.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </button>
      <button
        type="button"
        className="rounded p-1.5 text-ink-500 hover:bg-paper hover:text-teal-700"
        onClick={onShare}
        title="分享专辑（含全部文档）"
      >
        <Share2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="rounded p-1.5 text-ink-500 hover:bg-paper hover:text-amber-700"
        onClick={onDonate}
        title="捐赠专辑（含全部文档）"
      >
        <Gift className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="rounded p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-600"
        onClick={onDelete}
        title="删除专辑（保留文档）"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function MyResourcesPage({ initialTab = "question" }: MyResourcesPageProps) {
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [activeTab, setActiveTab] = useState<MyResourceTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [leftTab, setLeftTab] = useState<LeftTab>("chapter");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");

  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [resourcePage, setResourcePage] = useState(1);
  const [resourcePageSize, setResourcePageSize] = useState(20);
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedExamPaperTypeId, setSelectedExamPaperTypeId] = useState("");
  const [selectedLectureTypeId, setSelectedLectureTypeId] = useState("");
  const [selectedDocumentCategory, setSelectedDocumentCategory] = useState<DocumentCategory | "">("");

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [examPapers, setExamPapers] = useState<ExamPaper[]>([]);
  const [coursewares, setCoursewares] = useState<Courseware[]>([]);
  const [coursewarePushKey, setCoursewarePushKey] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [quota, setQuota] = useState<UserQuotaSnapshot | null>(null);
  const [resourceFolders, setResourceFolders] = useState<ResourceFolder[]>([]);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());
  const knownFolderIdsRef = useRef<Set<string>>(new Set());
  const [folderWorking, setFolderWorking] = useState(false);
  const [folderCreateType, setFolderCreateType] = useState<ResourceFolderType | null>(null);
  const [folderCreateResourceIds, setFolderCreateResourceIds] = useState<string[]>([]);
  const [folderName, setFolderName] = useState("");
  const [folderMoveTarget, setFolderMoveTarget] = useState<{
    resourceType: ResourceFolderType;
    resourceId: string;
    resourceTitle: string;
  } | null>(null);
  const [folderMoveId, setFolderMoveId] = useState("");
  const [knowledgeVideoTarget, setKnowledgeVideoTarget] = useState<Material | null>(null);

  // 所有试卷/讲义（含拆解副本），用于查找源资源的拆解副本
  const [allExamPapers, setAllExamPapers] = useState<ExamPaper[]>([]);
  const [allLectures, setAllLectures] = useState<Lecture[]>([]);
  const [completedLessonSourceKeys, setCompletedLessonSourceKeys] = useState<Set<string>>(new Set());

  // 展开的题目 ID
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());

  // 分享弹窗
  const [shareTarget, setShareTarget] = useState<{
    resourceType: ShareableResourceType;
    resourceId: string;
    resourceTitle: string;
  } | null>(null);
  const [shareScope, setShareScope] = useState<ShareScope>("school");
  const [shareMessage, setShareMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  const [prepTarget, setPrepTarget] = useState<{
    resourceType: "examPaper" | "lecture";
    resourceId: string;
    resourceTitle: string;
  } | null>(null);

  // 批量操作选择可跨资源类型和 Tab 保留。
  const [resourceSelections, setResourceSelections] = useState<Set<string>>(new Set());
  const [teacherDonations, setTeacherDonations] = useState<PlatformDonation[]>([]);
  const [pendingDonationItems, setPendingDonationItems] = useState<DonationItem[]>([]);
  const [donationCheck, setDonationCheck] = useState<DonationCheckResult | null>(null);
  const [donationDecisions, setDonationDecisions] = useState<Record<string, DonationDecision>>({});
  const [donating, setDonating] = useState(false);
  const [batchWorking, setBatchWorking] = useState(false);
  const [batchDirectoryMode, setBatchDirectoryMode] = useState<"chapter" | "knowledge" | null>(null);
  const [batchDirectoryIds, setBatchDirectoryIds] = useState<string[]>([]);
  const [batchShareLink, setBatchShareLink] = useState("");
  const [batchShareCount, setBatchShareCount] = useState(0);
  const [resourceRefreshToken, setResourceRefreshToken] = useState(0);
  const [platformCopyQuestionIds, setPlatformCopyQuestionIds] = useState<Set<string>>(new Set());

  // 课后反思相关：targetId -> 反思列表
  const [reflectionsMap, setReflectionsMap] = useState<Record<string, Reflection[]>>({});
  const [viewingReflections, setViewingReflections] = useState<{
    title: string;
    list: Reflection[];
  } | null>(null);

  // 创建副本弹窗
  const [duplicateTarget, setDuplicateTarget] = useState<{
    type: "examPaper" | "lecture" | "courseware";
    id: string;
    originalTitle: string;
  } | null>(null);
  const [duplicateTitle, setDuplicateTitle] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const extractTasks = useExtractTasksStore((state) => state.tasks);
  const startExtractTask = useExtractTasksStore((state) => state.startTask);

  const handleOpenExtract = (resource: ExamPaper | Lecture, type: "examPaper" | "lecture") => {
    if (isPdfDocumentResource(resource)) {
      toast.warning("PDF 文档不支持拆解", "可直接打开浏览 PDF 原稿");
      return;
    }
    startExtractTask({
      resourceId: resource.id,
      resourceType: type,
      resourceTitle: resource.title,
      chapterIds: resource.chapterIds,
      knowledgePointIds: resource.knowledgePointIds,
      grade: resource.grade,
      schoolYear: resource.schoolYear,
      semester: resource.semester || "上学期",
      questionSourceType: resource.questionSourceType,
      questionCategory: resource.questionCategory,
    });
  };

  const handlePushCoursewareForEditing = async (item: Courseware) => {
    if (!teacher?.schoolId) return;
    setCoursewarePushKey(`${item.id}:editable`);
    try {
      let pptSlides: Array<{ title: string; content: string }> = [];
      if (item.type === "ppt") {
        try {
          pptSlides = await loadCoursewarePptSlides(item);
        } catch {
          toast.warning("PPT 页面内容读取失败，将按已记录页数创建编辑页");
        }
      }

      let source = item;
      if (pptSlides.length > 0 && item.pageCount !== pptSlides.length) {
        source = await coursewareService.updateCourseware(item.id, { pageCount: pptSlides.length });
        setCoursewares((items) => items.map((courseware) => courseware.id === source.id ? source : courseware));
      }

      const lesson = await lessonCoursewareService.createFromCourseware(
        teacher.id,
        teacher.schoolId,
        source,
        pptSlides,
      );
      toast.success("已生成二次编辑课件", `共 ${lesson.slides.length} 页`);
      navigate(`/my-lessons/${lesson.id}/edit`);
    } catch (error) {
      toast.error("推送失败", error instanceof Error ? error.message : undefined);
    } finally {
      setCoursewarePushKey("");
    }
  };

  const handlePushCoursewareDirect = async (item: Courseware) => {
    if (!teacher?.schoolId) return;
    setCoursewarePushKey(`${item.id}:direct`);
    try {
      await lessonCoursewareService.createDirectFromCourseware(
        teacher.id,
        teacher.schoolId,
        item,
      );
      toast.success("已直接推送到我的上课", "预览、编辑和上课时将使用本机 WPS");
      navigate("/my-lessons");
    } catch (error) {
      toast.error("推送失败", error instanceof Error ? error.message : undefined);
    } finally {
      setCoursewarePushKey("");
    }
  };

  // 资源篮相关状态
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selectedBasketId, setSelectedBasketId] = useState<string | null>(null);
  const [basketQuestions, setBasketQuestions] = useState<Question[]>([]);
  const [basketMaterials, setBasketMaterials] = useState<Material[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<Set<string>>(new Set());
  const [expandedBasketQuestionIds, setExpandedBasketQuestionIds] = useState<Set<string>>(new Set());
  const [excludedBasketQuestionTypes, setExcludedBasketQuestionTypes] = useState<Set<string>>(new Set());
  const [creatingBasket, setCreatingBasket] = useState(false);
  const [isCreatingBasket, setIsCreatingBasket] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");
  const [newBasketClassIds, setNewBasketClassIds] = useState<string[]>([]);
  const [newBasketStudentIds, setNewBasketStudentIds] = useState<string[]>([]);
  const [audienceClasses, setAudienceClasses] = useState<AnyClass[]>([]);
  const [audienceStudents, setAudienceStudents] = useState<Student[]>([]);
  const [editingBasketAudience, setEditingBasketAudience] = useState(false);
  const [savingBasketAudience, setSavingBasketAudience] = useState(false);
  const [draftBasketClassIds, setDraftBasketClassIds] = useState<string[]>([]);
  const [draftBasketStudentIds, setDraftBasketStudentIds] = useState<string[]>([]);
  const [basketAnswerRecords, setBasketAnswerRecords] = useState<AnswerRecord[]>([]);
  const [basketMastery, setBasketMastery] = useState<KnowledgeMastery[]>([]);
  const [basketInsightsLoading, setBasketInsightsLoading] = useState(false);

  const schoolId = teacher?.schoolId || "sch-1";
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear, defaultSemester } = useSchoolResourceOptions(schoolId);
  const {
    examPaperTypes,
    lectureTypes,
    examPaperTypeOptions,
    lectureTypeOptions,
    defaultExamPaperTypeId,
    defaultLectureTypeId,
    getExamPaperTypeLabel,
    getLectureTypeLabel,
  } = useDocumentTypeOptions(schoolId);
  const questionTypeConfig = useQuestionTypeOptions(schoolId);
  const getQuestionTypeLabel = questionTypeConfig.getLabel;
  const questionTypeOptions = questionTypeConfig.options ?? [];
  const selectedBasket = useMemo(
    () => baskets.find((basket) => basket.id === selectedBasketId) || null,
    [baskets, selectedBasketId],
  );
  const basketAudienceStudentIds = useMemo(
    () => selectedBasket
      ? resolveBasketAudienceStudentIds(selectedBasket, audienceClasses, audienceStudents)
      : [],
    [selectedBasket, audienceClasses, audienceStudents],
  );
  const knowledgeNameMap = useMemo(() => treeNameMap(knowledgeTree), [knowledgeTree]);
  const basketMasteryMap = useMemo(
    () => new Map(basketMastery.map((item) => [item.knowledgePointId, item])),
    [basketMastery],
  );
  const answerRecordsByQuestion = useMemo(() => {
    const result = new Map<string, AnswerRecord[]>();
    basketAnswerRecords.forEach((record) => {
      const current = result.get(record.questionId) || [];
      current.push(record);
      result.set(record.questionId, current);
    });
    result.forEach((records) => records.sort(
      (a, b) => new Date(b.answeredAt).getTime() - new Date(a.answeredAt).getTime(),
    ));
    return result;
  }, [basketAnswerRecords]);
  const visibleBasketQuestions = useMemo(
    () => basketQuestions.filter((question) => !excludedBasketQuestionTypes.has(question.type)),
    [basketQuestions, excludedBasketQuestionTypes],
  );
  const allVisibleQuestionsSelected = visibleBasketQuestions.length > 0
    && visibleBasketQuestions.every((question) => selectedQuestionIds.has(question.id));
  const generatedCoursewaresBySource = useMemo(() => {
    const result = new Map<string, Courseware[]>();
    coursewares.forEach((courseware) => {
      if (!courseware.sourceResourceType || !courseware.sourceResourceId) return;
      const key = `${courseware.sourceResourceType}:${courseware.sourceResourceId}`;
      result.set(key, [...(result.get(key) || []), courseware]);
    });
    return result;
  }, [coursewares]);

  const openLinkedCourseware = useCallback((courseware: Courseware) => {
    navigate(courseware.lessonCoursewareId
      ? `/my-lessons/${courseware.lessonCoursewareId}/edit`
      : `/coursewares/${courseware.id}`);
  }, [navigate]);
  const renderGeneratedCoursewareRows = (
    sourceType: "examPaper" | "lecture",
    sourceIds: string | string[],
  ) => {
    const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds];
    const seen = new Set<string>();
    return ids
      .flatMap((sourceId) => generatedCoursewaresBySource.get(`${sourceType}:${sourceId}`) || [])
      .filter((courseware) => {
        if (seen.has(courseware.id)) return false;
        seen.add(courseware.id);
        return true;
      })
      .map((courseware) => (
        <LinkedResourceRow
          key={courseware.id}
          label="课件"
          title={courseware.title}
          icon={Presentation}
          onView={() => openLinkedCourseware(courseware)}
        />
      ));
  };

  const loadTeacherDonations = useCallback(async () => {
    if (!teacher) return;
    const records = await donationService.listTeacherDonations(teacher.id);
    setTeacherDonations(records);
  }, [teacher]);

  const loadResourceFolders = useCallback(async () => {
    if (!teacher || !isResourceFolderType(activeTab)) {
      setResourceFolders([]);
      return;
    }
    const folders = await resourceFolderService.listFolders(teacher.id, activeTab);
    const nextFolders = folders || [];
    setResourceFolders(nextFolders);
    setCollapsedFolderIds((current) => {
      const next = new Set(current);
      for (const folder of nextFolders) {
        if (!knownFolderIdsRef.current.has(folder.id)) next.add(folder.id);
        knownFolderIdsRef.current.add(folder.id);
      }
      return next;
    });
  }, [activeTab, teacher]);

  useEffect(() => {
    loadTeacherDonations().catch(() => setTeacherDonations([]));
  }, [loadTeacherDonations]);

  useEffect(() => {
    loadResourceFolders().catch(() => setResourceFolders([]));
  }, [loadResourceFolders]);

  const loadAll = useCallback(async () => {
    if (activeTab === "question") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const baseFilter = {
      keyword,
      chapterIds: checkedChapters,
      chapterLogic,
      knowledgePointIds: checkedKnowledge,
      knowledgeLogic,
      schoolId,
      grade: selectedGrade || undefined,
      schoolYear: selectedYear || undefined,
      semester: (selectedSemester || undefined) as ResourceSemester | undefined,
    };
    try {
      const [lecData, examData, cwData, matData, completedLessons, quotaSnapshot] = await Promise.all([
        lectureService.listLectures({ ...baseFilter, teacherId: teacher?.id }),
        examPaperService.listPapers({ ...baseFilter, teacherId: teacher?.id }),
        coursewareService.listCoursewares({ ...baseFilter, teacherId: teacher?.id }),
        materialService.listMaterials({ ...baseFilter, teacherId: teacher?.id }),
        teacher?.id
          ? lessonCoursewareService.listCoursewares({
            teacherId: teacher.id,
            schoolId,
            lifecycleStatus: "completed",
          })
          : Promise.resolve([]),
        teacher?.id ? quotaService.getQuota(teacher.id).catch(() => null) : Promise.resolve(null),
      ]);
      const safeLectures = lecData || [];
      const safeExamPapers = examData || [];
      const safeCoursewares = cwData || [];
      const safeMaterials = matData || [];
      setLectures(safeLectures);
      setExamPapers(safeExamPapers);
      setCoursewares(safeCoursewares);
      setMaterials(safeMaterials);
      setQuota(quotaSnapshot);
      // 保存完整列表（含拆解副本），用于查找源资源的拆解副本
      setAllExamPapers(safeExamPapers);
      setAllLectures(safeLectures);
      setCompletedLessonSourceKeys(new Set(
        (completedLessons || [])
          .filter((lesson) => lesson.sourceId && ["examPaper", "lecture"].includes(lesson.sourceType))
          .map((lesson) => `${lesson.sourceType}:${lesson.sourceId}`),
      ));
      // 加载试卷/讲义/课件的课后反思（仅按 targetId 关联）
      const reflectionTargets: string[] = [
        ...safeExamPapers.map((r) => r.id),
        ...safeLectures.map((r) => r.id),
        ...safeCoursewares.map((r) => r.id),
      ];
      if (reflectionTargets.length > 0 && teacher) {
        const teacherRefs = await reflectionService.listByTeacher(teacher.id);
        const map: Record<string, Reflection[]> = {};
        (teacherRefs || []).forEach((r) => {
          if (reflectionTargets.includes(r.targetId)) {
            if (!map[r.targetId]) map[r.targetId] = [];
            map[r.targetId].push(r);
          }
        });
        setReflectionsMap(map);
      } else {
        setReflectionsMap({});
      }
    } catch (e) {
      console.error("加载资源失败", e);
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    keyword,
    checkedChapters,
    checkedKnowledge,
    chapterLogic,
    knowledgeLogic,
    schoolId,
    selectedGrade,
    selectedYear,
    selectedSemester,
    teacher,
  ]);

  useEffect(() => {
    if (activeTab === "question") return;
    knowledgeService.getChapterTree(schoolId).then(setChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
  }, [activeTab, schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => loadAll(), 300);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const handleExtractConfirmed = () => {
      void loadAll();
    };
    window.addEventListener("extract-task-confirmed", handleExtractConfirmed);
    return () => window.removeEventListener("extract-task-confirmed", handleExtractConfirmed);
  }, [loadAll]);

  // 资源篮加载逻辑
  useEffect(() => {
    if (activeTab !== "basket" || !teacher) return;
    basketService.listBaskets(teacher.id).then(setBaskets);
  }, [activeTab, teacher]);

  useEffect(() => {
    if (activeTab !== "basket" || !teacher) return;
    Promise.all([
      classService.listMyClasses(teacher.schoolId || null, teacher.id),
      classService.listMyStudents(teacher.schoolId || null, teacher.id),
    ]).then(([classes, students]) => {
      setAudienceClasses(classes);
      setAudienceStudents(students);
    }).catch(() => {
      setAudienceClasses([]);
      setAudienceStudents([]);
    });
  }, [activeTab, teacher]);

  useEffect(() => {
    if (!selectedBasketId) {
      setBasketQuestions([]);
      setBasketMaterials([]);
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
      setExpandedBasketQuestionIds(new Set());
      return;
    }
    basketService.getBasket(selectedBasketId).then(async (basket) => {
      if (!basket) return;
      const [qs, ms] = await Promise.all([
        questionService.listQuestions({ ids: basket.questionIds }),
        materialService.listMaterials({ ids: basket.materialIds }),
      ]);
      const questionMap = new Map(qs.map((question) => [question.id, question]));
      const materialMap = new Map(ms.map((material) => [material.id, material]));
      setBasketQuestions(
        basket.questionIds.map((questionId) => questionMap.get(questionId)).filter(Boolean) as Question[],
      );
      setBasketMaterials(
        basket.materialIds.map((materialId) => materialMap.get(materialId)).filter(Boolean) as Material[],
      );
      setBaskets((current) => current.map((item) => item.id === basket.id ? basket : item));
      setSelectedQuestionIds(new Set());
      setSelectedMaterialIds(new Set());
      setExpandedBasketQuestionIds(new Set());
    });
  }, [selectedBasketId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedBasket || basketAudienceStudentIds.length === 0) {
      setBasketAnswerRecords([]);
      setBasketMastery([]);
      setBasketInsightsLoading(false);
      return () => { cancelled = true; };
    }

    setBasketInsightsLoading(true);
    Promise.all([
      analyticsService.listAnswerRecordsByStudents(basketAudienceStudentIds),
      analyticsService.getKnowledgeMastery(basketAudienceStudentIds, schoolId),
    ]).then(([records, mastery]) => {
      if (cancelled) return;
      setBasketAnswerRecords(records);
      setBasketMastery(mastery);
    }).catch(() => {
      if (cancelled) return;
      setBasketAnswerRecords([]);
      setBasketMastery([]);
    }).finally(() => {
      if (!cancelled) setBasketInsightsLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedBasket, basketAudienceStudentIds, schoolId]);

  const loadBaskets = useCallback(async () => {
    if (!teacher) return;
    const list = await basketService.listBaskets(teacher.id);
    setBaskets(list);
  }, [teacher]);

  const handleCreateBasket = async () => {
    if (!teacher || !newBasketName.trim()) return;
    if (newBasketClassIds.length === 0 && newBasketStudentIds.length === 0) {
      toast.warning("请选择资源篮使用对象");
      return;
    }
    setIsCreatingBasket(true);
    try {
      const created = await basketService.createBasket(
        teacher.id,
        newBasketName.trim(),
        undefined,
        false,
        { classIds: newBasketClassIds, studentIds: newBasketStudentIds },
      );
      toast.success(`已创建资源篮「${newBasketName.trim()}」`);
      setNewBasketName("");
      setNewBasketClassIds([]);
      setNewBasketStudentIds([]);
      await loadBaskets();
      setSelectedBasketId(created.id);
      setIsCreatingBasket(false);
      setCreatingBasket(false);
    } catch (e: any) {
      toast.error("创建失败", e?.message);
      setIsCreatingBasket(false);
    }
  };

  const openBasketAudienceEditor = () => {
    if (!selectedBasket) return;
    setDraftBasketClassIds(selectedBasket.classIds || []);
    setDraftBasketStudentIds(selectedBasket.studentIds || []);
    setEditingBasketAudience(true);
  };

  const handleSaveBasketAudience = async () => {
    if (!selectedBasket) return;
    setSavingBasketAudience(true);
    try {
      const updated = await basketService.updateBasket(selectedBasket.id, {
        classIds: draftBasketClassIds,
        studentIds: draftBasketStudentIds,
      });
      setBaskets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingBasketAudience(false);
      toast.success("资源篮使用对象已更新");
    } catch (e: any) {
      toast.error("更新使用对象失败", e?.message);
    } finally {
      setSavingBasketAudience(false);
    }
  };

  const handleDeleteBasket = async (basketId: string, basketName: string) => {
    if (!confirm(`确定要删除资源篮「${basketName}」吗？`)) return;
    try {
      await basketService.deleteBasket(basketId);
      toast.success("已删除");
      if (selectedBasketId === basketId) {
        setSelectedBasketId(null);
      }
      loadBaskets();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  const handleSetDefaultBasket = async (basketId: string) => {
    if (!teacher) return;
    try {
      await basketService.setDefaultBasket(teacher.id, basketId);
      toast.success("已设为默认资源篮");
      loadBaskets();
    } catch (e: any) {
      toast.error("设置失败", e?.message);
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  };

  const toggleBasketQuestionExpanded = (questionId: string) => {
    setExpandedBasketQuestionIds((previous) => {
      const next = new Set(previous);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const toggleBasketQuestionType = (questionType: string) => {
    setExcludedBasketQuestionTypes((previous) => {
      const next = new Set(previous);
      if (next.has(questionType)) next.delete(questionType);
      else next.add(questionType);
      return next;
    });
  };

  const selectAllQuestions = () => {
    setSelectedQuestionIds((previous) => {
      const next = new Set(previous);
      if (allVisibleQuestionsSelected) {
        visibleBasketQuestions.forEach((question) => next.delete(question.id));
      } else {
        visibleBasketQuestions.forEach((question) => next.add(question.id));
      }
      return next;
    });
  };

  const selectAllMaterials = () => {
    if (selectedMaterialIds.size === basketMaterials.length) {
      setSelectedMaterialIds(new Set());
    } else {
      setSelectedMaterialIds(new Set(basketMaterials.map((m) => m.id)));
    }
  };

  const handleRemoveBasketQuestion = async (questionId: string) => {
    if (!selectedBasketId) return;
    try {
      await basketService.removeQuestion(selectedBasketId, questionId);
      setBasketQuestions((current) => current.filter((question) => question.id !== questionId));
      setSelectedQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
      setExpandedBasketQuestionIds((current) => {
        const next = new Set(current);
        next.delete(questionId);
        return next;
      });
      setBaskets((current) => current.map((basket) => basket.id === selectedBasketId
        ? { ...basket, questionIds: basket.questionIds.filter((id) => id !== questionId) }
        : basket));
      toast.success("已从资源篮移除题目");
    } catch (error: any) {
      toast.error("移除题目失败", error?.message);
    }
  };

  const promptToRemoveReferencedQuestions = async (questionIds: string[]) => {
    const result = await promptToRemoveReferencedBasketQuestions(selectedBasketId, questionIds);
    const removedQuestionIds = new Set(result.removedQuestionIds);

    if (removedQuestionIds.size > 0) {
      setBasketQuestions((current) => current.filter((question) => !removedQuestionIds.has(question.id)));
      setSelectedQuestionIds((current) => {
        const next = new Set(current);
        removedQuestionIds.forEach((questionId) => next.delete(questionId));
        return next;
      });
      setExpandedBasketQuestionIds((current) => {
        const next = new Set(current);
        removedQuestionIds.forEach((questionId) => next.delete(questionId));
        return next;
      });
      setBaskets((current) => current.map((basket) => basket.id === selectedBasketId
        ? {
            ...basket,
            questionIds: basket.questionIds.filter((questionId) => !removedQuestionIds.has(questionId)),
          }
        : basket));
    }

    if (result.failedQuestionIds.length > 0) {
      toast.warning("部分已引用题目未能从资源篮移除");
    }
  };

  const handleRemoveBasketMaterial = async (materialId: string) => {
    if (!selectedBasketId) return;
    try {
      await basketService.removeMaterial(selectedBasketId, materialId);
      setBasketMaterials((current) => current.filter((material) => material.id !== materialId));
      setSelectedMaterialIds((current) => {
        const next = new Set(current);
        next.delete(materialId);
        return next;
      });
      setBaskets((current) => current.map((basket) => basket.id === selectedBasketId
        ? { ...basket, materialIds: basket.materialIds.filter((id) => id !== materialId) }
        : basket));
      toast.success("已从资源篮移除素材");
    } catch (error: any) {
      toast.error("移除素材失败", error?.message);
    }
  };

  const handleGenerateLecture = async () => {
    if (!teacher || selectedQuestionIds.size === 0 && selectedMaterialIds.size === 0) {
      toast.warning("请先选择题目或素材");
      return;
    }
    const selectedQs = basketQuestions.filter((q) => selectedQuestionIds.has(q.id));
    const selectedMs = basketMaterials.filter((m) => selectedMaterialIds.has(m.id));
    const sections: Lecture["sections"] = [];
    selectedMs.forEach((m) => {
      sections.push({
        id: genId("sec"),
        title: m.title,
        type: "text",
        content: m.content,
        children: [],
      });
    });
    selectedQs.forEach((q) => {
      sections.push({
        id: genId("sec"),
        title: `题目 ${sections.length + 1}`,
        type: "question",
        content: q.stem,
        questionId: q.id,
        children: [],
      });
    });
    const lecture: Lecture = {
      id: genId("lec"),
      teacherId: teacher.id,
      schoolId: schoolId,
      title: `从资源篮生成的讲义`,
      description: `包含 ${selectedQs.length} 题、${selectedMs.length} 素材`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: selectedQs[0]?.grade || defaultGrade,
      schoolYear: selectedQs[0]?.schoolYear || defaultSchoolYear,
      semester: selectedQs[0]?.semester || defaultSemester,
      classIds: selectedBasket?.classIds || [],
      studentIds: selectedBasket?.studentIds || [],
      sections,
      version: 1,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const created = await lectureService.createLecture(teacher.id, schoolId, lecture);
      await promptToRemoveReferencedQuestions(selectedQs.map((question) => question.id));
      toast.success("讲义已生成，正在进入编辑...");
      navigate(`/lectures/${created.id}/edit`);
    } catch (e: any) {
      toast.error("生成讲义失败", e?.message);
    }
  };

  const handleGenerateExamPaper = async () => {
    if (!teacher || selectedQuestionIds.size === 0) {
      toast.warning("请至少选择一道题目");
      return;
    }
    const selectedQs = basketQuestions.filter((q) => selectedQuestionIds.has(q.id));
    const questions: ExamPaper["questions"] = selectedQs.map((q) => ({
      id: genId("eq"),
      questionId: q.id,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      score: q.type === "essay" ? 15 : q.type === "short" ? 5 : 2,
      type: q.type,
    }));
    const totalScore = questions.reduce((sum, q) => sum + q.score, 0);
    const paper: ExamPaper = {
      id: genId("exam"),
      teacherId: teacher.id,
      schoolId: schoolId,
      title: `从资源篮生成的试卷`,
      description: `包含 ${questions.length} 题、总分 ${totalScore} 分`,
      chapterIds: [],
      knowledgePointIds: [],
      grade: selectedQs[0]?.grade || defaultGrade,
      schoolYear: selectedQs[0]?.schoolYear || defaultSchoolYear,
      semester: selectedQs[0]?.semester || defaultSemester,
      duration: Math.max(30, questions.length * 5),
      totalScore,
      questions,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      const created = await examPaperService.createPaper(teacher.id, schoolId, paper);
      await promptToRemoveReferencedQuestions(selectedQs.map((question) => question.id));
      toast.success("试卷已生成，正在进入编辑...");
      navigate(`/exam-papers/${created.id}`);
    } catch (e: any) {
      toast.error("生成试卷失败", e?.message);
    }
  };

  // 创建空白试卷并进入编辑页面
  const handleCreateBlankExamPaper = async () => {
    if (!teacher) return;
    try {
      const created = await examPaperService.createPaper(teacher.id, schoolId, {
        title: "未命名试卷",
        description: "",
        chapterIds: [],
        knowledgePointIds: [],
        grade: defaultGrade,
        schoolYear: defaultSchoolYear,
        semester: defaultSemester,
        duration: 90,
        totalScore: 0,
        questions: [],
        typeId: defaultExamPaperTypeId || undefined,
        status: "draft",
      });
      navigate(`/exam-papers/${created.id}`);
    } catch (e: any) {
      toast.error("创建试卷失败", e?.message);
    }
  };

  // 创建空白讲义并进入编辑页面
  const handleCreateBlankLecture = async () => {
    if (!teacher) return;
    try {
      const created = await lectureService.createLecture(teacher.id, schoolId, {
        title: "未命名讲义",
        description: "",
        chapterIds: [],
        knowledgePointIds: [],
        grade: defaultGrade,
        schoolYear: defaultSchoolYear,
        semester: defaultSemester,
        classIds: [],
        studentIds: [],
        sections: [],
        typeId: defaultLectureTypeId || undefined,
      });
      navigate(`/lectures/${created.id}/edit`);
    } catch (e: any) {
      toast.error("创建讲义失败", e?.message);
    }
  };

  const handleCreateBlankCourseware = async () => {
    if (!teacher) return;
    try {
      const created = await createBlankLessonCourseware(teacher.id, schoolId, {
        grade: defaultGrade,
        schoolYear: defaultSchoolYear,
        semester: defaultSemester,
      });
      navigate(`/my-lessons/${created.id}/edit`);
    } catch (e: any) {
      toast.error("创建课件失败", e?.message);
    }
  };

  const noTreeSelection = checkedChapters.length === 0 && checkedKnowledge.length === 0;
  const resetDirectorySelections = useCallback(() => {
    setCheckedChapters([]);
    setCheckedKnowledge([]);
  }, []);

  // 排序
  const sortedData = useMemo<ResourceListItem[]>(() => {
    const sortByKey = <T extends { updatedAt: string; createdAt: string; title?: string; stem?: string }>(arr: T[]) => {
      const sorted = [...arr];
      switch (sortKey) {
        case "updated":
          sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          break;
        case "created":
          sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case "title":
          sorted.sort((a, b) => {
            const ta = a.title || a.stem || "";
            const tb = b.title || b.stem || "";
            return ta.localeCompare(tb, "zh");
          });
          break;
      }
      return sorted;
    };
    switch (activeTab) {
      case "question": return [];
      case "lecture": return sortByKey(lectures);
      case "examPaper": return sortByKey(examPapers);
      case "courseware": return sortByKey(coursewares);
      case "material": return sortByKey(materials);
      case "basket": return [];
    }
  }, [activeTab, lectures, examPapers, coursewares, materials, sortKey]);

  // 仅看未分类筛选
  const displayedData = useMemo(() => {
    let result = sortedData;
    if (onlyUncategorized && noTreeSelection) {
      result = result.filter((item) => {
        const chapterIds = (item as { chapterIds?: string[] }).chapterIds ?? [];
        const knowledgePointIds = (item as { knowledgePointIds?: string[] }).knowledgePointIds ?? [];
        return chapterIds.length === 0 && knowledgePointIds.length === 0;
      });
    }
    if (activeTab === "examPaper" && selectedExamPaperTypeId) {
      const matchingIds = matchingResourceTypeIds(selectedExamPaperTypeId, examPaperTypes);
      result = (result as ExamPaper[]).filter((item) => Boolean(item.typeId && matchingIds.has(item.typeId)));
    }
    if (activeTab === "lecture" && selectedLectureTypeId) {
      const matchingIds = matchingResourceTypeIds(selectedLectureTypeId, lectureTypes);
      result = (result as Lecture[]).filter((item) => Boolean(item.typeId && matchingIds.has(item.typeId)));
    }
    return result;
  }, [
    activeTab,
    examPaperTypes,
    lectureTypes,
    noTreeSelection,
    onlyUncategorized,
    selectedExamPaperTypeId,
    selectedLectureTypeId,
    sortedData,
  ]);

  const directoryCountResources = useMemo<ResourceListItem[] | null>(() => {
    switch (activeTab) {
      case "lecture":
        return lectures.filter((item) => !item.isExtractCopy);
      case "examPaper":
        return examPapers.filter((item) => !item.isExtractCopy);
      case "courseware":
        return coursewares;
      case "material":
        return materials;
      default:
        return null;
    }
  }, [activeTab, coursewares, examPapers, lectures, materials]);

  const displayedChapterTree = useMemo(() => {
    if (!chapterTree || !directoryCountResources) return chapterTree;
    return annotateTreeWithResourceCounts(chapterTree, directoryCountResources, "chapter");
  }, [chapterTree, directoryCountResources]);

  const displayedKnowledgeTree = useMemo(() => {
    if (!knowledgeTree || !directoryCountResources) return knowledgeTree;
    return annotateTreeWithResourceCounts(knowledgeTree, directoryCountResources, "knowledge");
  }, [directoryCountResources, knowledgeTree]);

  const currentTab = tabConfig.find((t) => t.key === activeTab)!;
  const activeResourceQuota = activeTab === "basket" ? null : quota?.resources[activeTab] || null;
  const hasCompletedLesson = (resourceType: "examPaper" | "lecture", resourceId: string) => (
    completedLessonSourceKeys.has(`${resourceType}:${resourceId}`)
  );

  // 试卷/讲义按同源文档分组分页，拆解副本作为源文档的组内子项展示。
  const examPapersFiltered = useMemo(
    () => (activeTab === "examPaper"
      ? (displayedData as ExamPaper[])
        .filter((paper) => !paper.isExtractCopy)
        .filter((paper) => !selectedDocumentCategory
          || documentCategory(paper, allExamPapers) === selectedDocumentCategory)
      : []),
    [activeTab, allExamPapers, displayedData, selectedDocumentCategory],
  );
  const lecturesFiltered = useMemo(
    () => (activeTab === "lecture"
      ? (displayedData as Lecture[])
        .filter((lecture) => !lecture.isExtractCopy)
        .filter((lecture) => !selectedDocumentCategory
          || documentCategory(lecture, allLectures) === selectedDocumentCategory)
      : []),
    [activeTab, allLectures, displayedData, selectedDocumentCategory],
  );

  const baseResourceListData = useMemo<ResourceListItem[]>(() => {
    switch (activeTab) {
      case "lecture":
        return lecturesFiltered;
      case "examPaper":
        return examPapersFiltered;
      case "courseware":
        return displayedData as Courseware[];
      case "material":
        return displayedData as Material[];
      default:
        return [];
    }
  }, [activeTab, displayedData, examPapersFiltered, lecturesFiltered]);

  const resourceListData = useMemo<ResourceListItem[]>(() => {
    if (!isResourceFolderType(activeTab) || resourceFolders.length === 0) {
      return baseResourceListData;
    }

    const resourceMap = new Map(baseResourceListData.map((item) => [item.id, item]));
    const used = new Set<string>();
    const units: ResourceListUnit[] = [];

    for (const folder of resourceFolders) {
      const visibleItems = folder.resourceIds
        .map((id) => resourceMap.get(id))
        .filter(Boolean) as ResourceListItem[];
      if (visibleItems.length === 0) continue;
      units.push({
        kind: "folder",
        folder,
        items: collapsedFolderIds.has(folder.id) ? visibleItems.slice(0, 1) : visibleItems,
      });
      visibleItems.forEach((item) => used.add(item.id));
    }

    baseResourceListData.forEach((item) => {
      if (!used.has(item.id)) units.push({ kind: "resource", item });
    });

    units.sort((left, right) => compareResourceListUnits(left, right, sortKey));
    return units.flatMap((unit) => unit.kind === "folder" ? unit.items : [unit.item]);
  }, [activeTab, baseResourceListData, collapsedFolderIds, resourceFolders, sortKey]);

  const visibleFolderFirstResourceIds = useMemo(() => {
    const map = new Map<string, string>();
    if (!isResourceFolderType(activeTab)) return map;
    const visibleIds = new Set(baseResourceListData.map((item) => item.id));
    resourceFolders.forEach((folder) => {
      const first = folder.resourceIds.find((id) => visibleIds.has(id));
      if (first) map.set(folder.id, first);
    });
    return map;
  }, [activeTab, baseResourceListData, resourceFolders]);

  const totalResourcePages = Math.max(1, Math.ceil(resourceListData.length / resourcePageSize));
  const safeResourcePage = Math.min(resourcePage, totalResourcePages);
  const paginatedResourceData = useMemo(() => {
    const start = (safeResourcePage - 1) * resourcePageSize;
    return resourceListData.slice(start, start + resourcePageSize);
  }, [resourceListData, resourcePageSize, safeResourcePage]);

  useEffect(() => {
    setResourcePage(1);
  }, [
    activeTab,
    checkedChapters,
    checkedKnowledge,
    keyword,
    onlyUncategorized,
    resourcePageSize,
    selectedExamPaperTypeId,
    selectedDocumentCategory,
    selectedGrade,
    selectedLectureTypeId,
    selectedSemester,
    selectedYear,
    sortKey,
  ]);

  useEffect(() => {
    if (resourcePage !== safeResourcePage) {
      setResourcePage(safeResourcePage);
    }
  }, [resourcePage, safeResourcePage]);

  const toggleQuestionExpand = (id: string) => {
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个资源吗？")) return;
    try {
      if (activeTab === "question") await questionService.deleteQuestion(id);
      else if (activeTab === "lecture") await lectureService.deleteLecture(id);
      else if (activeTab === "courseware") await coursewareService.deleteCourseware(id);
      else if (activeTab === "material") await materialService.deleteMaterial(id);
      else if (activeTab === "examPaper") await examPaperService.deletePaper(id);
      if (teacher && isResourceFolderType(activeTab)) {
        await resourceFolderService.removeResourceFromAll(teacher.id, activeTab, id);
        await loadResourceFolders();
      }
      toast.success("已删除");
      if (activeTab !== "basket") {
        const key = batchResourceKey(activeTab, id);
        setResourceSelections((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }
      loadAll();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  const handleRenameResource = async (
    resourceType: RenameableResourceType,
    id: string,
    title: string,
  ) => {
    const nextTitle = title.trim();
    if (!nextTitle) throw new Error("文档名称不能为空");

    try {
      if (resourceType === "lecture") {
        const updated = await lectureService.updateLecture(id, { title: nextTitle });
        setLectures((items) => items.map((item) => item.id === id ? updated : item));
        setAllLectures((items) => items.map((item) => item.id === id ? updated : item));
      } else if (resourceType === "examPaper") {
        const updated = await examPaperService.updatePaper(id, { title: nextTitle });
        setExamPapers((items) => items.map((item) => item.id === id ? updated : item));
        setAllExamPapers((items) => items.map((item) => item.id === id ? updated : item));
      } else if (resourceType === "courseware") {
        const updated = await coursewareService.updateCourseware(id, { title: nextTitle });
        setCoursewares((items) => items.map((item) => item.id === id ? updated : item));
      } else {
        const updated = await materialService.updateMaterial(id, { title: nextTitle });
        setMaterials((items) => items.map((item) => item.id === id ? updated : item));
      }
      toast.success("文档名称已修改");
    } catch (error) {
      toast.error("修改名称失败", error instanceof Error ? error.message : undefined);
      throw error;
    }
  };

  const handleMoveLectureToExamPaper = async (lectureId: string) => {
    if (!teacher) return;
    try {
      await lectureService.convertToExamPaper(lectureId);
      toast.success("已移至试卷库");
      navigate("/my-resources/exam-papers");
    } catch (error) {
      toast.error("移动失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleMoveExamPaperToLecture = async (paperId: string) => {
    if (!teacher) return;
    try {
      await examPaperService.convertToLecture(paperId);
      toast.success("已移至讲义库");
      navigate("/my-resources/lectures");
    } catch (error) {
      toast.error("移动失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleOpenShare = (resourceType: ShareableResourceType, resourceId: string, resourceTitle: string) => {
    setShareScope("school");
    setShareMessage("");
    setShareTarget({ resourceType, resourceId, resourceTitle });
  };

  const handleShare = async () => {
    if (!shareTarget || !teacher) return;
    setSharing(true);
    try {
      await shareService.createShare({
        fromTeacherId: teacher.id,
        fromSchoolId: schoolId,
        scope: shareScope,
        resourceType: shareTarget.resourceType,
        resourceId: shareTarget.resourceId,
        resourceTitle: shareTarget.resourceTitle,
        message: shareMessage.trim() || undefined,
      });
      toast.success("已发起分享");
      setShareTarget(null);
    } catch (e: any) {
      toast.error("分享失败", e?.message);
    } finally {
      setSharing(false);
    }
  };

  const openDuplicate = (type: "examPaper" | "lecture" | "courseware", id: string, originalTitle: string) => {
    setDuplicateTitle(`${originalTitle}（副本）`);
    setDuplicateTarget({ type, id, originalTitle });
  };

  const handleDuplicate = async () => {
    if (!duplicateTarget) return;
    setDuplicating(true);
    try {
      let resourceLabel: string;
      if (duplicateTarget.type === "examPaper") {
        await examPaperService.duplicatePaper(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "试卷";
      } else if (duplicateTarget.type === "lecture") {
        await lectureService.duplicateLecture(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "讲义";
      } else {
        await coursewareService.duplicateCourseware(duplicateTarget.id, duplicateTitle.trim() || undefined);
        resourceLabel = "课件";
      }
      toast.success(`${resourceLabel}副本已创建`, "课后反思已同步复制");
      setDuplicateTarget(null);
      loadAll();
    } catch (e: any) {
      toast.error("创建副本失败", e?.message);
    } finally {
      setDuplicating(false);
    }
  };

  const platformCopyKeys = useMemo(() => new Set([
    ...[...platformCopyQuestionIds].map((id) => batchResourceKey("question", id)),
    ...examPapers.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("examPaper", item.id)),
    ...lectures.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("lecture", item.id)),
    ...coursewares.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("courseware", item.id)),
    ...materials.filter((item) => item.platformSourceDonationIds?.length).map((item) => batchResourceKey("material", item.id)),
  ]), [platformCopyQuestionIds, examPapers, lectures, coursewares, materials]);

  const isDonated = (resourceType: ShareableResourceType, resourceId: string) =>
    teacherDonations.some((record) =>
      record.resourceType === resourceType && record.sourceResourceId === resourceId,
    );

  const toggleResourceSelection = (resourceType: ShareableResourceType, resourceId: string) => {
    const key = batchResourceKey(resourceType, resourceId);
    setResourceSelections((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const batchSelectionCardProps = (resourceType: ShareableResourceType, resourceId: string) => ({
    selected: resourceSelections.has(batchResourceKey(resourceType, resourceId)),
    donated: isDonated(resourceType, resourceId),
    donationLocked: platformCopyKeys.has(batchResourceKey(resourceType, resourceId)),
    onToggleSelection: () => toggleResourceSelection(resourceType, resourceId),
  });

  const selectedResourceRefs = (): BatchResourceRef[] =>
    [...resourceSelections].map(parseBatchResourceKey);

  const donationItemsFor = (refs: BatchResourceRef[], albumId?: string): DonationItem[] => refs
    .filter((item) => !platformCopyKeys.has(batchResourceKey(item.resourceType, item.resourceId)))
    .map((item) => albumId ? { ...item, albumId } : item);

  const completeDonation = async (items: DonationItem[], decisions: DonationDecision[] = []) => {
    if (!teacher || items.length === 0) return;
    setDonating(true);
    try {
      const result = await donationService.donateResources(
        teacher.id,
        schoolId,
        items,
        decisions,
      );
      toast.success("捐赠完成", `已处理 ${result.created.length} 个资源`);
      setResourceSelections(new Set());
      setDonationCheck(null);
      setPendingDonationItems([]);
      setDonationDecisions({});
      await loadTeacherDonations();
    } catch (error) {
      toast.error("捐赠失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDonating(false);
    }
  };

  const handlePrepareDonation = async (refsOverride?: BatchResourceRef[], albumId?: string) => {
    if (!teacher) return;
    const selectedItems = refsOverride || selectedResourceRefs();
    const items = donationItemsFor(selectedItems, albumId);
    if (items.length === 0) {
      toast.warning(selectedItems.length === 0 ? "请先选择资源" : "所选资源不可捐赠");
      return;
    }
    const skippedCount = selectedItems.length - items.length;
    if (skippedCount > 0) {
      toast.warning("已跳过不可捐赠资源", `${skippedCount} 个平台资源副本不会重复捐赠`);
    }
    setDonating(true);
    try {
      const check = await donationService.checkDonation(teacher.id, schoolId, items);
      const already = new Set(check.alreadyDonated.map((item) => batchResourceKey(item.resourceType, item.resourceId)));
      const pending = items.filter((item) =>
        item.albumId || !already.has(batchResourceKey(item.resourceType, item.resourceId)),
      );
      if (check.alreadyDonated.length > 0) {
        if (albumId) {
          toast.info("专辑包含已捐赠文档", `${check.alreadyDonated.length} 个已有平台资源会关联到该专辑`);
        } else {
          toast.warning("已跳过重复捐赠", `${check.alreadyDonated.length} 个资源已经捐赠过`);
        }
      }
      if (pending.length === 0) {
        setResourceSelections(new Set());
        await loadTeacherDonations();
        return;
      }
      if (check.conflicts.length === 0) {
        setDonating(false);
        await completeDonation(pending);
        return;
      }
      const defaults: Record<string, DonationDecision> = {};
      for (const conflict of check.conflicts) {
        defaults[conflict.item.resourceId] = {
          sourceResourceId: conflict.item.resourceId,
          action: "new",
          targetDonationId: conflict.targetDonationId,
          fields: {
            stem: "target",
            answer: "target",
            analysis: "target",
            summary: "target",
          },
        };
      }
      setPendingDonationItems(pending);
      setDonationCheck(check);
      setDonationDecisions(defaults);
    } catch (error) {
      toast.error("查重失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDonating(false);
    }
  };

  const updateDonationDecision = (
    resourceId: string,
    updater: (decision: DonationDecision) => DonationDecision,
  ) => {
    setDonationDecisions((previous) => ({
      ...previous,
      [resourceId]: updater(previous[resourceId]),
    }));
  };

  const deleteBatchResource = async ({ resourceType, resourceId }: BatchResourceRef) => {
    switch (resourceType) {
      case "question":
        return questionService.deleteQuestion(resourceId);
      case "examPaper":
        return examPaperService.deletePaper(resourceId);
      case "lecture":
        return lectureService.deleteLecture(resourceId);
      case "courseware":
        return coursewareService.deleteCourseware(resourceId);
      case "material":
        return materialService.deleteMaterial(resourceId);
    }
  };

  const getBatchResource = async ({ resourceType, resourceId }: BatchResourceRef) => {
    switch (resourceType) {
      case "question":
        return questionService.getQuestion(resourceId);
      case "examPaper":
        return examPaperService.getPaper(resourceId);
      case "lecture":
        return lectureService.getLecture(resourceId);
      case "courseware":
        return coursewareService.getCourseware(resourceId);
      case "material":
        return materialService.getMaterial(resourceId);
    }
  };

  const updateBatchResource = async (
    { resourceType, resourceId }: BatchResourceRef,
    patch: { chapterIds?: string[]; knowledgePointIds?: string[] },
  ) => {
    switch (resourceType) {
      case "question":
        return questionService.updateQuestion(resourceId, patch);
      case "examPaper":
        return examPaperService.updatePaper(resourceId, patch);
      case "lecture":
        return lectureService.updateLecture(resourceId, patch);
      case "courseware":
        return coursewareService.updateCourseware(resourceId, patch);
      case "material":
        return materialService.updateMaterial(resourceId, patch);
    }
  };

  const refreshResourceViews = async () => {
    await loadAll();
    setResourceRefreshToken((value) => value + 1);
  };

  const handleBatchShare = async (refsOverride?: BatchResourceRef[]) => {
    if (!teacher) return;
    const refs = refsOverride || selectedResourceRefs();
    if (refs.length === 0) return;

    setBatchWorking(true);
    try {
      const batchId = genId("batch-share");
      const results = await Promise.allSettled(refs.map(async (ref) => {
        const resource = await getBatchResource(ref);
        if (!resource) throw new Error(`资源不存在：${ref.resourceId}`);
        const resourceTitle = ref.resourceType === "question"
          ? (resource as Question).stem
          : (resource as ExamPaper | Lecture | Courseware | Material).title;
        return shareService.createShare({
          fromTeacherId: teacher.id,
          fromSchoolId: schoolId,
          scope: "public",
          resourceType: ref.resourceType,
          resourceId: ref.resourceId,
          resourceTitle,
          batchId,
        });
      }));
      const succeededCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = refs.length - succeededCount;

      if (succeededCount > 0) {
        setBatchShareLink(`${window.location.origin}/shared-resources/${encodeURIComponent(batchId)}`);
        setBatchShareCount(succeededCount);
        toast.success("批量分享链接已生成", `链接包含 ${succeededCount} 个资源`);
      }
      if (failedCount > 0) {
        toast.error("部分资源分享失败", `${failedCount} 个资源未加入分享链接`);
      }
    } finally {
      setBatchWorking(false);
    }
  };

  const handleCopyBatchShareLink = async () => {
    if (!batchShareLink) return;
    try {
      await navigator.clipboard.writeText(batchShareLink);
      toast.success("链接已复制");
    } catch (error) {
      toast.error("复制失败", error instanceof Error ? error.message : "请手动复制链接");
    }
  };

  const handleBatchAction = (action: string) => {
    switch (action) {
      case "share":
        void handleBatchShare();
        break;
      case "delete":
        void handleBatchDelete();
        break;
      case "donate":
        void handlePrepareDonation();
        break;
      case "chapter":
        openBatchDirectoryPicker("chapter");
        break;
      case "knowledge":
        openBatchDirectoryPicker("knowledge");
        break;
      case "folder":
        openCreateFolderFromSelection();
        break;
    }
  };

  const handleBatchDelete = async () => {
    const refs = selectedResourceRefs();
    if (refs.length === 0) return;
    if (!confirm(`确定要删除选中的 ${refs.length} 个资源吗？此操作不可撤销。`)) return;

    setBatchWorking(true);
    try {
      const results = await Promise.allSettled(refs.map(deleteBatchResource));
      const succeededKeys = new Set(
        refs
          .filter((_, index) => results[index].status === "fulfilled")
          .map((item) => batchResourceKey(item.resourceType, item.resourceId)),
      );
      const succeededRefs = refs.filter((item) =>
        succeededKeys.has(batchResourceKey(item.resourceType, item.resourceId)),
      );
      const failedCount = refs.length - succeededKeys.size;

      if (teacher) {
        await Promise.all(succeededRefs
          .filter((item): item is BatchResourceRef & { resourceType: ResourceFolderType } =>
            isResourceFolderType(item.resourceType as MyResourceTab),
          )
          .map((item) => resourceFolderService.removeResourceFromAll(
            teacher.id,
            item.resourceType,
            item.resourceId,
          )));
        if (isResourceFolderType(activeTab)) await loadResourceFolders();
      }

      setResourceSelections((previous) => {
        const next = new Set(previous);
        succeededKeys.forEach((key) => next.delete(key));
        return next;
      });
      await refreshResourceViews();

      if (succeededKeys.size > 0) {
        toast.success("批量删除完成", `已删除 ${succeededKeys.size} 个资源`);
      }
      if (failedCount > 0) {
        toast.error("部分资源删除失败", `${failedCount} 个资源未能删除，仍保持选中`);
      }
    } finally {
      setBatchWorking(false);
    }
  };

  const openBatchDirectoryPicker = (mode: "chapter" | "knowledge") => {
    setBatchDirectoryIds([]);
    setBatchDirectoryMode(mode);
  };

  const handleApplyBatchDirectory = async () => {
    if (!batchDirectoryMode || batchDirectoryIds.length === 0) {
      toast.warning(batchDirectoryMode === "chapter" ? "请选择要新增的章节" : "请选择要新增的知识点");
      return;
    }

    const refs = selectedResourceRefs();
    setBatchWorking(true);
    try {
      const results = await Promise.allSettled(refs.map(async (ref) => {
        const resource = await getBatchResource(ref);
        if (!resource) throw new Error(`资源不存在：${ref.resourceId}`);

        if (batchDirectoryMode === "chapter") {
          const chapterIds = appendUniqueIds(resource.chapterIds, batchDirectoryIds);
          return updateBatchResource(ref, { chapterIds });
        }
        const knowledgePointIds = appendUniqueIds(resource.knowledgePointIds, batchDirectoryIds);
        return updateBatchResource(ref, { knowledgePointIds });
      }));

      const succeededCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - succeededCount;
      await refreshResourceViews();

      if (succeededCount > 0) {
        const label = batchDirectoryMode === "chapter" ? "章节" : "知识点";
        toast.success(`已新增统一${label}`, `已更新 ${succeededCount} 个资源，原有关联保持不变`);
        setBatchDirectoryMode(null);
        setBatchDirectoryIds([]);
      }
      if (failedCount > 0) {
        toast.error("部分资源更新失败", `${failedCount} 个资源未能更新`);
      }
    } finally {
      setBatchWorking(false);
    }
  };


  const normalizeFolderResourceId = (
    resourceType: ResourceFolderType,
    resourceId: string,
  ): string => {
    if (resourceType === "examPaper") {
      const paper = allExamPapers.find((item) => item.id === resourceId);
      return paper?.isExtractCopy && paper.sourceResourceId ? paper.sourceResourceId : resourceId;
    }
    if (resourceType === "lecture") {
      const lecture = allLectures.find((item) => item.id === resourceId);
      return lecture?.isExtractCopy && lecture.sourceResourceId ? lecture.sourceResourceId : resourceId;
    }
    return resourceId;
  };

  const folderForResource = (resourceType: ResourceFolderType, resourceId: string) => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    return resourceFolders.find((folder) =>
      folder.resourceType === resourceType && folder.resourceIds.includes(normalizedId),
    ) || null;
  };

  const folderRefs = (folder: ResourceFolder): BatchResourceRef[] =>
    folder.resourceIds.map((resourceId) => ({
      resourceType: folder.resourceType,
      resourceId,
    }));

  const openCreateFolderFromSelection = () => {
    const refs = selectedResourceRefs();
    if (refs.length < 2) {
      toast.warning("请至少选择两个文档后创建专辑");
      return;
    }
    const resourceTypes = new Set(refs.map((ref) => ref.resourceType));
    if (resourceTypes.size !== 1) {
      toast.warning("创建专辑时请选择同一资源库中的文档");
      return;
    }
    const resourceType = refs[0].resourceType;
    if (!isResourceFolderType(resourceType as MyResourceTab)) {
      toast.warning("专辑仅支持试卷库、讲义库和课件库");
      return;
    }
    const folderType = resourceType as ResourceFolderType;
    const resourceIds = Array.from(new Set(
      refs.map((ref) => normalizeFolderResourceId(folderType, ref.resourceId)),
    ));
    if (resourceIds.length < 2) {
      toast.warning("请至少选择两个不同文档后创建专辑");
      return;
    }
    setFolderCreateType(folderType);
    setFolderCreateResourceIds(resourceIds);
    setFolderName("");
  };

  const handleCreateFolder = async () => {
    if (!teacher || !folderCreateType) return;
    const nextName = folderName.trim();
    if (!nextName) {
      toast.warning("请输入专辑名称");
      return;
    }
    setFolderWorking(true);
    try {
      const created = await resourceFolderService.createFolder(
        teacher.id,
        schoolId,
        folderCreateType,
        nextName,
        folderCreateResourceIds,
      );
      if (activeTab === folderCreateType) await loadResourceFolders();
      setCollapsedFolderIds((current) => {
        const next = new Set(current);
        next.delete(created.id);
        return next;
      });
      setResourceSelections(new Set());
      setFolderCreateType(null);
      setFolderCreateResourceIds([]);
      setFolderName("");
      toast.success("专辑已创建", `已加入 ${created.resourceIds.length} 个文档`);
    } catch (error) {
      toast.error("创建专辑失败", error instanceof Error ? error.message : undefined);
    } finally {
      setFolderWorking(false);
    }
  };

  const handleRenameFolder = async (folder: ResourceFolder, name: string) => {
    try {
      await resourceFolderService.updateFolder(folder.id, { name });
      await loadResourceFolders();
      toast.success("专辑名称已更新");
    } catch (error) {
      toast.error("修改专辑名称失败", error instanceof Error ? error.message : undefined);
      throw error;
    }
  };

  const handleToggleFolderPin = async (folder: ResourceFolder) => {
    try {
      await resourceFolderService.updateFolder(folder.id, { pinned: !folder.pinned });
      await loadResourceFolders();
    } catch (error) {
      toast.error("更新置顶状态失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleDeleteFolder = async (folder: ResourceFolder) => {
    if (!confirm(`确定删除专辑“${folder.name}”吗？专辑内文档会保留。`)) return;
    try {
      await resourceFolderService.deleteFolder(folder.id);
      await loadResourceFolders();
      setCollapsedFolderIds((current) => {
        const next = new Set(current);
        next.delete(folder.id);
        return next;
      });
      toast.success("专辑已删除", "文档已保留在资源库中");
    } catch (error) {
      toast.error("删除专辑失败", error instanceof Error ? error.message : undefined);
    }
  };

  const openFolderMove = (
    resourceType: ResourceFolderType,
    resourceId: string,
    resourceTitle: string,
  ) => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    const currentFolder = folderForResource(resourceType, normalizedId);
    setFolderMoveTarget({ resourceType, resourceId: normalizedId, resourceTitle });
    setFolderMoveId(currentFolder?.id || resourceFolders[0]?.id || "");
  };

  const handleApplyFolderMove = async () => {
    if (!folderMoveTarget || !folderMoveId) {
      toast.warning("请选择专辑");
      return;
    }
    setFolderWorking(true);
    try {
      await resourceFolderService.moveResources(folderMoveId, [folderMoveTarget.resourceId]);
      await loadResourceFolders();
      setFolderMoveTarget(null);
      setFolderMoveId("");
      toast.success("文档已加入专辑");
    } catch (error) {
      toast.error("移动文档失败", error instanceof Error ? error.message : undefined);
    } finally {
      setFolderWorking(false);
    }
  };

  const handleRemoveResourceFromFolder = async (
    resourceType: ResourceFolderType,
    resourceId: string,
  ) => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    const folder = folderForResource(resourceType, normalizedId);
    if (!folder) return;
    try {
      await resourceFolderService.removeResource(folder.id, normalizedId);
      await loadResourceFolders();
      toast.success("文档已移出专辑");
    } catch (error) {
      toast.error("移出专辑失败", error instanceof Error ? error.message : undefined);
    }
  };

  const handleMoveFolderResource = async (
    resourceType: ResourceFolderType,
    resourceId: string,
    direction: -1 | 1,
  ) => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    const folder = folderForResource(resourceType, normalizedId);
    if (!folder) return;
    const index = folder.resourceIds.indexOf(normalizedId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= folder.resourceIds.length) return;
    const nextIds = [...folder.resourceIds];
    [nextIds[index], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[index]];
    try {
      await resourceFolderService.reorderResources(folder.id, nextIds);
      await loadResourceFolders();
    } catch (error) {
      toast.error("调整专辑内文档顺序失败", error instanceof Error ? error.message : undefined);
    }
  };

  const folderActionsFor = (
    resourceType: ResourceFolderType,
    resourceId: string,
    resourceTitle: string,
  ): ConfigurableResourceAction[] => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    const folder = folderForResource(resourceType, normalizedId);
    const index = folder?.resourceIds.indexOf(normalizedId) ?? -1;
    const actions: ConfigurableResourceAction[] = [{
      key: "folderMove",
      label: folder ? "移动到专辑" : "加入专辑",
      icon: <FolderPlus />,
      onClick: () => {
        if (resourceFolders.length === 0) {
          toast.warning("请先选择至少两个文档，通过批量操作创建专辑");
          return;
        }
        openFolderMove(resourceType, normalizedId, resourceTitle);
      },
      tone: "amber",
    }];
    if (folder) {
      actions.push({
        key: "folderRemove",
        label: "移出专辑",
        icon: <FolderMinus />,
        onClick: () => void handleRemoveResourceFromFolder(resourceType, normalizedId),
      });
      if (index > 0) {
        actions.push({
          key: "folderMoveUp",
          label: "在专辑内上移",
          icon: <ArrowUp />,
          onClick: () => void handleMoveFolderResource(resourceType, normalizedId, -1),
        });
      }
      if (index >= 0 && index < folder.resourceIds.length - 1) {
        actions.push({
          key: "folderMoveDown",
          label: "在专辑内下移",
          icon: <ArrowDown />,
          onClick: () => void handleMoveFolderResource(resourceType, normalizedId, 1),
        });
      }
    }
    return actions;
  };

  const renderFolderedResource = (
    resourceType: ResourceFolderType,
    resourceId: string,
    node: React.ReactNode,
  ) => {
    const normalizedId = normalizeFolderResourceId(resourceType, resourceId);
    const folder = folderForResource(resourceType, normalizedId);
    if (!folder) return node;
    const isFirstVisible = visibleFolderFirstResourceIds.get(folder.id) === normalizedId;
    const collapsed = collapsedFolderIds.has(folder.id);
    const visibleIds = new Set(baseResourceListData.map((item) => item.id));
    const visibleCount = folder.resourceIds.filter((id) => visibleIds.has(id)).length;

    return (
      <div key={`${folder.id}:${normalizedId}`} className="space-y-2">
        {isFirstVisible && (
          <ResourceFolderHeader
            folder={folder}
            collapsed={collapsed}
            visibleCount={visibleCount}
            onToggle={() => setCollapsedFolderIds((current) => {
              const next = new Set(current);
              if (next.has(folder.id)) next.delete(folder.id);
              else next.add(folder.id);
              return next;
            })}
            onRename={(name) => handleRenameFolder(folder, name)}
            onTogglePin={() => void handleToggleFolderPin(folder)}
            onShare={() => void handleBatchShare(folderRefs(folder))}
            onDonate={() => void handlePrepareDonation(folderRefs(folder), folder.id)}
            onDelete={() => void handleDeleteFolder(folder)}
          />
        )}
        {!collapsed && (
          <div className="ml-5 border-l-2 border-amber-100 pl-3">
            {node}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="我的资源"
        description="统一管理我的题库、试卷库、讲义库、课件库、素材库"
        icon={<Library className="w-5 h-5" />}
      />

      {/* Tab 切换 */}
      <div className="mb-4 border-b border-ink-200">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {tabConfig.filter((t) => t.key !== "basket").map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                    active
                      ? "text-gold-600 border-gold-500"
                      : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 pb-px">
            {(() => {
              const basketTab = tabConfig.find((t) => t.key === "basket")!;
              const Icon = basketTab.icon;
              const active = activeTab === "basket";
              return (
                <button
                  onClick={() => setActiveTab("basket")}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-2",
                    active
                      ? "text-gold-600 border-gold-500"
                      : "text-ink-500 border-transparent hover:text-ink-700 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {basketTab.label}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {activeTab !== "question" && (
        <div className="mb-3 text-sm text-ink-500">{currentTab.description}</div>
      )}

      {/* 题库 Tab：渲染完整的题库管理/使用页面 */}
      {activeTab === "question" ? (
        <QuestionBankPage
          selectedQuestionIds={new Set(
            [...resourceSelections]
              .filter((key) => key.startsWith("question:"))
              .map((key) => key.slice("question:".length)),
          )}
          donatedQuestionIds={new Set(
            teacherDonations
              .filter((record) => record.resourceType === "question")
              .map((record) => record.sourceResourceId),
          )}
          onToggleSelection={(question) => {
            if (question.platformSourceDonationIds?.length) {
              setPlatformCopyQuestionIds((previous) => new Set(previous).add(question.id));
            }
            toggleResourceSelection("question", question.id);
          }}
          onQuestionDeleted={(questionId) => {
            setResourceSelections((previous) => {
              const next = new Set(previous);
              next.delete(batchResourceKey("question", questionId));
              return next;
            });
          }}
          refreshToken={resourceRefreshToken}
        />
      ) : activeTab === "basket" ? (
        <div className="grid grid-cols-12 gap-4">
          {/* 左侧：资源篮列表 */}
          <div className="col-span-3">
            <Card className="p-3 sticky top-4 h-fit">
              <div className="flex items-center justify-between mb-3">
                <div className="font-serif font-semibold text-sm text-ink-800 flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4" />
                  我的资源篮
                </div>
                <button
                  onClick={() => setCreatingBasket(true)}
                  className="p-1 rounded hover:bg-gold-50 text-gold-600"
                  title="新建资源篮"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {baskets.length === 0 ? (
                <div className="py-6 text-center text-xs text-ink-400">
                  暂无资源篮，点击右上角 + 创建
                </div>
              ) : (
                <div className="space-y-1">
                  {baskets.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        "p-2.5 rounded-md cursor-pointer transition-all flex items-start justify-between",
                        selectedBasketId === b.id
                          ? "bg-gold-50 border border-gold-200"
                          : "hover:bg-mist",
                      )}
                      onClick={() => setSelectedBasketId(b.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-ink-800 truncate">
                          {b.name}
                          {b.isDefault && <span className="ml-1 text-[10px] text-gold-600">默认</span>}
                        </div>
                        <div className="text-xs text-ink-400 mt-0.5">
                          {b.questionIds.length} 题 · {b.materialIds.length} 素材
                        </div>
                        <div className="text-[11px] text-ink-400 mt-0.5 truncate">
                          {basketAudienceLabel(b)}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefaultBasket(b.id);
                          }}
                          className={cn(
                            "p-1 rounded transition-colors",
                            b.isDefault
                              ? "text-gold-500 bg-gold-50"
                              : "text-ink-300 hover:text-gold-500 hover:bg-gold-50",
                          )}
                          title={b.isDefault ? "当前为默认资源篮" : "设为默认资源篮"}
                        >
                          <Star className="w-3 h-3" fill={b.isDefault ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBasket(b.id, b.name);
                          }}
                          className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50"
                          title="删除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* 右侧：资源篮内容 */}
          <div className="col-span-9">
            {!selectedBasketId ? (
              <EmptyState
                icon={<ShoppingCart className="w-12 h-12 text-ink-200" />}
                title="选择一个资源篮"
                description="点击左侧资源篮查看其中的题目和素材"
              />
            ) : (
              <div>
                {/* 顶部操作栏 */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="text-sm min-w-0">
                    <div>
                      <span className="font-medium text-ink-800">{selectedBasket?.name}</span>
                      <span className="text-ink-400 ml-2">
                        共 {basketQuestions.length} 题 · {basketMaterials.length} 素材
                      </span>
                    </div>
                    <div className={cn(
                      "mt-1 flex items-center gap-1.5 text-xs",
                      basketAudienceStudentIds.length > 0 ? "text-ink-500" : "text-amber-600",
                    )}>
                      <Users className="w-3.5 h-3.5" />
                      {selectedBasket
                        ? basketAudienceLabel(selectedBasket, basketAudienceStudentIds.length)
                        : "尚未选择使用对象"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button variant="outline" onClick={openBasketAudienceEditor}>
                      <Pencil className="w-4 h-4" />
                      调整使用对象
                    </Button>
                    <Button variant="outline" onClick={handleGenerateLecture} disabled={selectedQuestionIds.size === 0 && selectedMaterialIds.size === 0}>
                      <FileText className="w-4 h-4" />
                      生成讲义
                    </Button>
                    <Button variant="gold" onClick={handleGenerateExamPaper} disabled={selectedQuestionIds.size === 0}>
                      <FileSpreadsheet className="w-4 h-4" />
                      生成试卷
                    </Button>
                  </div>
                </div>

                {/* 题目列表 */}
                {basketQuestions.length > 0 && (
                  <Card className="p-3 mb-4">
                    <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-ink-100">
                      <div className="flex items-center gap-3 flex-wrap min-w-0">
                        <div className="text-sm font-medium text-ink-700 flex items-center gap-1.5 whitespace-nowrap">
                          <FileQuestion className="w-4 h-4" />
                          题目（{visibleBasketQuestions.length === basketQuestions.length
                            ? basketQuestions.length
                            : `${visibleBasketQuestions.length}/${basketQuestions.length}`}）
                        </div>
                        <fieldset
                          className="flex items-center gap-x-3 gap-y-1 flex-wrap"
                          aria-label="按题型筛选资源篮题目"
                        >
                          {questionTypeOptions.map((option) => (
                            <label
                              key={option.value}
                              className="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none"
                            >
                              <input
                                type="checkbox"
                                checked={!excludedBasketQuestionTypes.has(option.value)}
                                onChange={() => toggleBasketQuestionType(option.value)}
                                className="w-3.5 h-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                              />
                              {option.label}
                            </label>
                          ))}
                        </fieldset>
                      </div>
                      <button
                        onClick={selectAllQuestions}
                        disabled={visibleBasketQuestions.length === 0}
                        className="text-xs text-ink-500 hover:text-gold-600 disabled:text-ink-300 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {allVisibleQuestionsSelected ? "取消全选" : `全选 (${visibleBasketQuestions.length})`}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2" data-testid="basket-question-list">
                      {visibleBasketQuestions.map((q) => {
                        const usageRecords = answerRecordsByQuestion.get(q.id) || [];
                        const usedByAudience = usageRecords.length > 0;
                        const usageDates = usageDateLabels(usageRecords);
                        const expanded = expandedBasketQuestionIds.has(q.id);
                        return (
                          <div
                            key={q.id}
                            className={cn(
                              "p-3 rounded-md border transition-all flex items-start gap-2",
                              usedByAudience
                                ? "border-red-300 bg-red-50/40"
                                : selectedQuestionIds.has(q.id)
                                  ? "border-gold-300 bg-gold-50/50"
                                  : "border-ink-100 hover:border-ink-200",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedQuestionIds.has(q.id)}
                              onChange={() => toggleQuestionSelection(q.id)}
                              aria-label={`选择题目：${q.stem}`}
                              className="mt-1 h-4 w-4 flex-shrink-0 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="tag-gold">{getQuestionTypeLabel(q.type)}</span>
                                <span className="text-xs text-ink-400">难度：{difficultyLabel[q.difficulty]}</span>
                                {usedByAudience && (
                                  <span className="text-xs font-medium text-red-600">所选学生已使用</span>
                                )}
                              </div>
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={expanded}
                                title="查看完整答案、解析、总结和板书"
                                className="group cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
                                onClick={() => toggleBasketQuestionExpanded(q.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleBasketQuestionExpanded(q.id);
                                  }
                                }}
                              >
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <MathHtml className="whitespace-pre-wrap text-sm text-ink-800">{q.stem}</MathHtml>
                                    {q.options && q.options.length > 0 && (
                                      <div
                                        data-testid={`basket-question-options-${q.id}`}
                                        className={cn(
                                          "mt-2 grid gap-x-4 gap-y-1.5 text-sm text-ink-700",
                                          getQuestionOptionGridColumns(q.options),
                                        )}
                                      >
                                        {q.options.map((option, index) => (
                                          <div key={`${q.id}-option-${index}`} className="flex items-start gap-1">
                                            <span className="font-mono font-semibold text-ink-500 flex-shrink-0">
                                              {String.fromCharCode(65 + index)}.
                                            </span>
                                            <MathHtml className="min-w-0 break-all">{option}</MathHtml>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {expanded ? (
                                    <ChevronDown className="w-4 h-4 mt-0.5 flex-shrink-0 text-gold-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0 text-ink-400 group-hover:text-gold-600" />
                                  )}
                                </div>
                              </div>

                              {expanded && (
                                <div className="mt-3 grid gap-3 rounded-md border border-ink-100 bg-paper/70 p-3">
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">答案</div>
                                    <MathHtml className="question-answer-content text-sm text-ink-800">{q.answer || "暂无答案"}</MathHtml>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">解析</div>
                                    <MathHtml className="text-sm text-ink-800">{q.analysis || "暂无解析"}</MathHtml>
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-ink-500 mb-1">总结</div>
                                    <MathHtml className="text-sm text-ink-800">{q.summary || "暂无总结"}</MathHtml>
                                  </div>
                                  <QuestionSupplementaryDetails
                                    board={q.board}
                                    boardImages={q.boardImages}
                                    links={q.links}
                                    explanationVideo={q.explanationVideo}
                                    compact
                                  />
                                </div>
                              )}

                              {usedByAudience && (
                                <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                                  使用时间：{usageDates.slice(0, 3).join("、")}
                                  {usageDates.length > 3 && ` 等 ${usageDates.length} 天`}
                                  <span className="ml-2 text-red-500">共 {usageRecords.length} 条记录</span>
                                </div>
                              )}

                              {q.knowledgePointIds.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-ink-100/80">
                                  <div className="text-[11px] text-ink-400 mb-1.5">知识点掌握情况</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {q.knowledgePointIds.map((knowledgePointId) => {
                                      const mastery = basketMasteryMap.get(knowledgePointId);
                                      const presentation = mastery
                                        ? masteryPresentation[mastery.masteryLevel]
                                        : null;
                                      return (
                                        <span
                                          key={knowledgePointId}
                                          className={cn(
                                            "inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]",
                                            basketAudienceStudentIds.length === 0 || basketInsightsLoading
                                              ? "border-ink-100 bg-mist text-ink-500"
                                              : presentation?.className || "border-ink-100 bg-mist text-ink-500",
                                          )}
                                        >
                                          <span>{knowledgeNameMap.get(knowledgePointId) || mastery?.knowledgePointName || "未命名知识点"}</span>
                                          <span className="font-medium">
                                            {basketAudienceStudentIds.length === 0
                                              ? "未选择对象"
                                              : basketInsightsLoading
                                                ? "统计中"
                                                : mastery
                                                  ? `${presentation?.label}${mastery.totalAttempts > 0 ? ` ${Math.round(mastery.correctRate * 100)}%` : ""}`
                                                  : "暂无数据"}
                                          </span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveBasketQuestion(q.id)}
                              className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                              title="从资源篮移除"
                              aria-label="从资源篮移除题目"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                      {visibleBasketQuestions.length === 0 && (
                        <div className="py-8 text-center text-sm text-ink-400">
                          当前题型筛选下没有题目
                        </div>
                      )}
                    </div>
                  </Card>
                )}

                {/* 素材列表 */}
                {basketMaterials.length > 0 && (
                  <Card className="p-3">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-ink-100">
                      <div className="text-sm font-medium text-ink-700 flex items-center gap-1.5">
                        <FileBox className="w-4 h-4" />
                        素材（{basketMaterials.length}）
                      </div>
                      <button
                        onClick={selectAllMaterials}
                        className="text-xs text-ink-500 hover:text-gold-600"
                      >
                        {selectedMaterialIds.size === basketMaterials.length ? "取消全选" : `全选 (${basketMaterials.length})`}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {basketMaterials.map((material) => (
                        <BasketMaterialListItem
                          key={material.id}
                          material={material}
                          selected={selectedMaterialIds.has(material.id)}
                          onToggleSelection={() => toggleMaterialSelection(material.id)}
                          onRemove={() => handleRemoveBasketMaterial(material.id)}
                        />
                      ))}
                    </div>
                  </Card>
                )}

                {basketQuestions.length === 0 && basketMaterials.length === 0 && (
                  <EmptyState
                    icon={<FileText className="w-10 h-10 text-ink-200" />}
                    title="资源篮为空"
                    description="从题库或素材库添加资源到此处"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
      <ResizableSidebarLayout
        storageKey="inteschool.my-resources.directory-width"
        defaultWidth={300}
        separatorLabel="调整我的资源章节课与知识点目录宽度"
        sidebar={(
          <Card className="p-3 sticky top-4">
            <div className="flex gap-1 mb-3 p-1 bg-mist rounded-md">
              <button
                onClick={() => setLeftTab("chapter")}
                aria-label="章节课"
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "chapter" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="relative inline-flex">
                  <BookOpen className="w-3.5 h-3.5" />
                  {checkedChapters.length > 0 && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-paper"
                      aria-label="章节课目录已有勾选"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                章节课
              </button>
              <button
                onClick={() => setLeftTab("knowledge")}
                aria-label="知识点"
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "knowledge" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="relative inline-flex">
                  <Lightbulb className="w-3.5 h-3.5" />
                  {checkedKnowledge.length > 0 && (
                    <span
                      className="absolute -bottom-1.5 -right-1.5 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-paper"
                      aria-label="知识点目录已有勾选"
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </span>
                知识点
              </button>
            </div>
            {(leftTab === "chapter" ? displayedChapterTree : displayedKnowledgeTree) ? (
              leftTab === "chapter" ? (
                <SearchableTree
                  data={displayedChapterTree!}
                  title="章节课目录"
                  showTitle={false}
                  accent="gold"
                  checkable
                  checkedIds={checkedChapters}
                  onCheck={setCheckedChapters}
                  searchPlaceholder="搜索章节..."
                  showLogicSelector
                  logic={chapterLogic}
                  onLogicChange={setChapterLogic}
                  onReset={resetDirectorySelections}
                />
              ) : (
                <SearchableTree
                  data={displayedKnowledgeTree!}
                  title="知识点目录"
                  showTitle={false}
                  accent="teal"
                  checkable
                  checkedIds={checkedKnowledge}
                  onCheck={setCheckedKnowledge}
                  searchPlaceholder="搜索知识点..."
                  showLogicSelector
                  logic={knowledgeLogic}
                  onLogicChange={setKnowledgeLogic}
                  onReset={resetDirectorySelections}
                />
              )
            ) : (
              <div className="flex items-center justify-center py-10">
                <Spinner size={20} />
              </div>
            )}
          </Card>
        )}
      >
        {/* 右侧：资源列表 */}
        <div>
          {/* 搜索与排序 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索资源..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-paper focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              {activeTab === "examPaper" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleCreateBlankExamPaper}>
                    <Plus className="w-3.5 h-3.5" />
                    出试卷
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openPage("/upload?type=examPaper")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传试卷
                  </Button>
                </>
              )}
              {activeTab === "lecture" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleCreateBlankLecture}>
                    <Plus className="w-3.5 h-3.5" />
                    编讲义
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openPage("/upload?type=lecture")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传讲义
                  </Button>
                </>
              )}
              {activeTab === "courseware" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleCreateBlankCourseware}>
                    <Plus className="w-3.5 h-3.5" />
                    做课件
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openPage("/upload?type=courseware")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传课件
                  </Button>
                </>
              )}
              {activeTab === "material" && (
                <Button variant="outline" size="sm" onClick={() => openPage("/upload?type=material")}>
                  <Upload className="w-3.5 h-3.5" />
                  上传素材
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full">
              {(activeTab === "examPaper" || activeTab === "lecture") && (
                <FilterSelect
                  label="文档类别"
                  value={selectedDocumentCategory}
                  options={documentCategoryOptions}
                  onChange={(value) => setSelectedDocumentCategory(value as DocumentCategory | "")}
                />
              )}
              {activeTab === "examPaper" && (
                <FilterSelect
                  label="试卷类型"
                  value={selectedExamPaperTypeId}
                  options={examPaperTypeOptions}
                  onChange={setSelectedExamPaperTypeId}
                />
              )}
              {activeTab === "lecture" && (
                <FilterSelect
                  label="讲义类型"
                  value={selectedLectureTypeId}
                  options={lectureTypeOptions}
                  onChange={setSelectedLectureTypeId}
                />
              )}
              <FilterSelect
                label="年级"
                value={selectedGrade}
                options={gradeOptions}
                onChange={setSelectedGrade}
              />
              <FilterSelect
                label="学年"
                value={selectedYear}
                options={schoolYearOptions}
                onChange={setSelectedYear}
              />
              <FilterSelect
                label="学期"
                value={selectedSemester}
                options={semesterOptions}
                onChange={setSelectedSemester}
              />
              {noTreeSelection && (
                <button
                  onClick={() => setOnlyUncategorized((v) => !v)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                    onlyUncategorized
                      ? "bg-amber-100 border-amber-300 text-amber-800"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                  title="仅显示未关联任何章节/知识点的资源"
                >
                  <Filter className="w-3 h-3" />
                  仅看未分类
                </button>
              )}
              <ArrowUpDown className="w-3.5 h-3.5 text-ink-400" />
              <span className="text-xs text-ink-500">排序：</span>
              <div className="flex items-center gap-1">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSortKey(opt.value)}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                      sortKey === opt.value
                        ? "bg-gold-400 border-gold-400 text-ink-900"
                        : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!loading && resourceListData.length > 0 && (
            <div className="mb-3">
              <PaginationBar
                currentPage={safeResourcePage}
                totalPages={totalResourcePages}
                totalItems={resourceListData.length}
                pageSize={resourcePageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                itemLabel="项"
                summaryExtra={activeResourceQuota ? (
                  <span className="text-xs text-ink-500">
                    容量 {activeResourceQuota.used}/{activeResourceQuota.capacity}
                    {activeResourceQuota.donationBonus > 0
                      ? `（有效捐赠扩容 +${activeResourceQuota.donationBonus}）`
                      : ""}
                  </span>
                ) : undefined}
                onPageChange={(page) => setResourcePage(Math.min(totalResourcePages, Math.max(1, page)))}
                onPageSizeChange={(pageSize) => {
                  setResourcePageSize(pageSize);
                  setResourcePage(1);
                }}
              />
            </div>
          )}

          {/* 资源列表内容 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : resourceListData.length === 0 ? (
            <EmptyState
              icon={<currentTab.icon className="w-10 h-10 text-ink-200" />}
              title={`暂无${currentTab.label}资源`}
              description={noTreeSelection && onlyUncategorized
                ? "当前没有未分类资源"
                : "点击右上角「上传资源」按钮添加资源"}
            />
          ) : (
            <div className="space-y-3">
              {/* 讲义库 */}
              {activeTab === "lecture" && (paginatedResourceData as Lecture[]).map((item) => {
                const extractCopies = allLectures.filter(
                  (copy) => copy.sourceResourceId === item.id && copy.isExtractCopy
                );
                const hasExtractCopy = extractCopies.length > 0;
                const isExtracted = item.extractStatus === "done";
                const isExtracting = item.extractStatus === "extracting"
                  || isExtractTaskRunning(extractTasks, item.id, "lecture");
                const isPdfOriginal = isPdfDocumentResource(item);
                const mainLecture = hasExtractCopy ? extractCopies[0] : item;
                const lectureWasTaught = hasCompletedLesson("lecture", mainLecture.id)
                  || hasCompletedLesson("lecture", item.id);
                return renderFolderedResource("lecture", item.id, (
                  <DocumentResourceGroup key={item.id}>
                    <ResourceCard
                      key={mainLecture.id}
                      {...batchSelectionCardProps("lecture", mainLecture.id)}
                      title={mainLecture.title}
                      titleIcon={item.originalFileUrl ? (
                        <DocumentFormatIcon
                          fileType={item.originalFileType}
                          fileName={item.originalFileName}
                        />
                      ) : undefined}
                      titleActions={lectureWasTaught
                        || (item.originalFileUrl && !isExtracted && !hasExtractCopy) ? (
                        <>
                          {lectureWasTaught && <Badge variant="green">已上课</Badge>}
                          {item.originalFileUrl && !isExtracted && !hasExtractCopy && (
                            <>
                              <DocumentDownloadButton
                                fileUrl={item.originalFileUrl}
                                fileName={item.originalFileName}
                                className="text-xs font-normal text-gold-600 hover:text-gold-700"
                                iconClassName="w-3.5 h-3.5"
                              />
                              {!isPdfOriginal && (
                                <Button
                                  variant="gold"
                                  size="sm"
                                  onClick={() => handleOpenExtract(item, "lecture")}
                                  loading={isExtracting}
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  {isExtracting ? "拆解中..." : "文档拆解"}
                                </Button>
                              )}
                            </>
                          )}
                        </>
                      ) : undefined}
                      meta={[
                        { label: "类型", value: getLectureTypeLabel(mainLecture.typeId) },
                        { label: "年级", value: `${mainLecture.grade} · ${mainLecture.schoolYear} · ${mainLecture.semester || "上学期"}` },
                        { label: "内容", value: `${mainLecture.sections.length} 节` },
                        { label: "状态", value: mainLecture.status === "published" ? "已发布" : "草稿" },
                      ]}
                      updatedAt={mainLecture.updatedAt}
                      reflections={reflectionsMap[mainLecture.id]}
                      onClick={() => {
                        if (item.originalFileUrl && !isExtracted && !hasExtractCopy) {
                          openPage(`/resources/preview/${item.id}?type=lecture`);
                        } else {
                          openPage(`/lectures/${mainLecture.id}/preview`);
                        }
                      }}
                      onShare={() => handleOpenShare("lecture", mainLecture.id, mainLecture.title)}
                      onAddToPrep={() => setPrepTarget({
                        resourceType: "lecture",
                        resourceId: mainLecture.id,
                        resourceTitle: mainLecture.title,
                      })}
                      onDelete={() => handleDelete(mainLecture.id)}
                      onRename={(title) => handleRenameResource("lecture", mainLecture.id, title)}
                      onViewReflections={() => setViewingReflections({ title: mainLecture.title, list: reflectionsMap[mainLecture.id] || [] })}
                      onDuplicate={() => openDuplicate("lecture", mainLecture.id, mainLecture.title)}
                      additionalActions={folderActionsFor("lecture", item.id, mainLecture.title)}
                      alwaysShowActions
                      compactActions
                      configurableActions
                      detailsPresentation="titleTooltip"
                      onConvertToExamPaper={() => handleMoveLectureToExamPaper(mainLecture.id)}
                      showAddToLesson
                      titleBadge={hasExtractCopy
                        ? { text: "拆解稿", variant: "gold" }
                        : (!isExtracted && item.originalFileUrl
                          ? { text: "上传原稿", variant: "amber" }
                          : undefined)}
                      onAddToLesson={async () => {
                        if (!teacher) return;
                        try {
                          const documentBlocks = await fallbackLessonBlocks(mainLecture, "lecture");
                          const cw = await lessonCoursewareService.createFromLecture(
                            teacher.id,
                            teacher.schoolId!,
                            mainLecture.id,
                            documentBlocks,
                          );
                          toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                          navigate(`/my-lessons/${cw.id}/edit`);
                        } catch (err) {
                          toast.error("添加失败", err instanceof Error ? err.message : undefined);
                        }
                      }}
                    />
                    {renderGeneratedCoursewareRows(
                      "lecture",
                      [item.id, ...extractCopies.map((copy) => copy.id)],
                    )}
                    {item.originalFileUrl && !hasExtractCopy && isExtracted && (
                      <div className="flex items-center gap-3 text-xs flex-wrap pl-4">
                        <div className="flex items-center gap-2">
                          <DocumentFormatIcon
                            fileType={item.originalFileType}
                            fileName={item.originalFileName}
                          />
                          <span className="text-ink-500">原稿：{item.originalFileName}</span>
                          <DocumentDownloadButton
                            fileUrl={item.originalFileUrl}
                            fileName={item.originalFileName}
                            className="text-gold-600 hover:text-gold-700"
                            iconClassName="w-3 h-3"
                          />
                        </div>
                        <Badge variant="teal">已拆解</Badge>
                      </div>
                    )}
                    {hasExtractCopy && item.originalFileUrl && (
                      <OriginalFileRow
                        fileUrl={item.originalFileUrl}
                        fileName={item.originalFileName}
                        fileType={item.originalFileType}
                        icon={FileText}
                        onView={() => openPage(`/resources/preview/${item.id}?type=lecture`)}
                      />
                    )}
                  </DocumentResourceGroup>
                ));
              })}

              {/* 试卷库 */}
              {activeTab === "examPaper" && (paginatedResourceData as ExamPaper[]).map((item) => {
                const extractCopies = allExamPapers.filter(
                  (copy) => copy.sourceResourceId === item.id && copy.isExtractCopy
                );
                const hasExtractCopy = extractCopies.length > 0;
                const isExtracted = item.extractStatus === "done";
                const isExtracting = item.extractStatus === "extracting"
                  || isExtractTaskRunning(extractTasks, item.id, "examPaper");
                const isPdfOriginal = isPdfDocumentResource(item);
                return renderFolderedResource("examPaper", item.id, (
                  <DocumentResourceGroup key={item.id}>
                    {hasExtractCopy && extractCopies.map((copy) => (
                      <div key={copy.id} className="space-y-2">
                        <ResourceCard
                        {...batchSelectionCardProps("examPaper", copy.id)}
                        title={copy.title}
                        titleActions={hasCompletedLesson("examPaper", copy.id)
                          || hasCompletedLesson("examPaper", item.id)
                          ? <Badge variant="green">已上课</Badge>
                          : undefined}
                        meta={[
                          { label: "类型", value: getExamPaperTypeLabel(copy.typeId) },
                          { label: "年级", value: `${copy.grade} · ${copy.schoolYear} · ${copy.semester || "上学期"}` },
                          { label: "题目", value: `${copy.questions.length} 题` },
                          { label: "总分", value: `${copy.totalScore} 分` },
                          { label: "时长", value: `${copy.duration} 分钟` },
                          { label: "状态", value: copy.status === "published" ? "已发布" : "草稿" },
                        ]}
                        updatedAt={copy.updatedAt}
                        reflections={reflectionsMap[copy.id]}
                        onClick={() => openPage(`/exam-papers/${copy.id}/preview`)}
                        onShare={() => handleOpenShare("examPaper", copy.id, copy.title)}
                        onAddToPrep={() => setPrepTarget({
                          resourceType: "examPaper",
                          resourceId: copy.id,
                          resourceTitle: copy.title,
                        })}
                        onDelete={() => handleDelete(copy.id)}
                        onRename={(title) => handleRenameResource("examPaper", copy.id, title)}
                        onViewReflections={() => setViewingReflections({ title: copy.title, list: reflectionsMap[copy.id] || [] })}
                        onDuplicate={() => openDuplicate("examPaper", copy.id, copy.title)}
                        additionalActions={[
                          ...folderActionsFor("examPaper", item.id, copy.title),
                          {
                            key: "convertToLecture",
                            label: "转讲义",
                            icon: <FileText />,
                            onClick: () => handleMoveExamPaperToLecture(copy.id),
                            tone: "gold",
                          },
                        ]}
                        showAddToLesson
                        alwaysShowActions
                        compactActions
                        configurableActions
                        detailsPresentation="titleTooltip"
                        titleBadge={{ text: "拆解稿", variant: "gold" }}
                        onAddToLesson={async () => {
                          if (!teacher) return;
                          try {
                            const documentBlocks = await fallbackLessonBlocks(copy, "examPaper");
                            const cw = await lessonCoursewareService.createFromExamPaper(
                              teacher.id,
                              teacher.schoolId!,
                              copy.id,
                              documentBlocks,
                            );
                            toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                            navigate(`/my-lessons/${cw.id}/edit`);
                          } catch (err) {
                            toast.error("添加失败", err instanceof Error ? err.message : undefined);
                          }
                        }}
                        />
                      </div>
                    ))}
                    {!hasExtractCopy && (
                      <>
                        <ResourceCard
                          {...batchSelectionCardProps("examPaper", item.id)}
                          title={item.title}
                          titleIcon={item.originalFileUrl ? (
                            <DocumentFormatIcon
                              fileType={item.originalFileType}
                              fileName={item.originalFileName}
                            />
                          ) : undefined}
                          titleActions={hasCompletedLesson("examPaper", item.id)
                            || (item.originalFileUrl && !isExtracted) ? (
                            <>
                              {hasCompletedLesson("examPaper", item.id) && <Badge variant="green">已上课</Badge>}
                              {item.originalFileUrl && !isExtracted && (
                                <>
                                  <DocumentDownloadButton
                                    fileUrl={item.originalFileUrl}
                                    fileName={item.originalFileName}
                                    className="text-xs font-normal text-gold-600 hover:text-gold-700"
                                    iconClassName="w-3.5 h-3.5"
                                  />
                                  {!isPdfOriginal && (
                                    <Button
                                      variant="gold"
                                      size="sm"
                                      onClick={() => handleOpenExtract(item, "examPaper")}
                                      loading={isExtracting}
                                    >
                                      <Sparkles className="w-3.5 h-3.5" />
                                      {isExtracting ? "拆解中..." : "文档拆解"}
                                    </Button>
                                  )}
                                </>
                              )}
                            </>
                          ) : undefined}
                          meta={[
                            { label: "类型", value: getExamPaperTypeLabel(item.typeId) },
                            { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                            { label: "题目", value: `${item.questions.length} 题` },
                            { label: "总分", value: `${item.totalScore} 分` },
                            { label: "时长", value: `${item.duration} 分钟` },
                            { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                          ]}
                          updatedAt={item.updatedAt}
                          reflections={reflectionsMap[item.id]}
                          onClick={() => {
                            if (item.originalFileUrl && !isExtracted) {
                              openPage(`/resources/preview/${item.id}?type=examPaper`);
                            } else {
                              openPage(`/exam-papers/${item.id}/preview`);
                            }
                          }}
                          onShare={() => handleOpenShare("examPaper", item.id, item.title)}
                          onAddToPrep={() => setPrepTarget({
                            resourceType: "examPaper",
                            resourceId: item.id,
                            resourceTitle: item.title,
                          })}
                          onDelete={() => handleDelete(item.id)}
                          onRename={(title) => handleRenameResource("examPaper", item.id, title)}
                          onViewReflections={() => setViewingReflections({ title: item.title, list: reflectionsMap[item.id] || [] })}
                          onDuplicate={() => openDuplicate("examPaper", item.id, item.title)}
                          showAddToLesson
                          alwaysShowActions
                          compactActions
                          configurableActions
                          detailsPresentation="titleTooltip"
                          additionalActions={[
                            ...folderActionsFor("examPaper", item.id, item.title),
                            {
                              key: "answerSheet",
                              label: "制作答题卡",
                              icon: <Layout />,
                              onClick: () => openPage(`/exam-papers/${item.id}/answer-sheet`),
                              tone: "gold",
                            },
                            {
                              key: "convertToLecture",
                              label: "转讲义",
                              icon: <FileText />,
                              onClick: () => handleMoveExamPaperToLecture(item.id),
                              tone: "gold",
                            },
                          ]}
                          titleBadge={!isExtracted && item.originalFileUrl
                            ? { text: "上传原稿", variant: "amber" }
                            : undefined}
                          onAddToLesson={async () => {
                            if (!teacher) return;
                            try {
                              const documentBlocks = await fallbackLessonBlocks(item, "examPaper");
                              const cw = await lessonCoursewareService.createFromExamPaper(
                                teacher.id,
                                teacher.schoolId!,
                                item.id,
                                documentBlocks,
                              );
                              toast.success("已添加到上课", "可在「我的上课」中编辑课件");
                              navigate(`/my-lessons/${cw.id}/edit`);
                            } catch (err) {
                              toast.error("添加失败", err instanceof Error ? err.message : undefined);
                            }
                          }}
                        />
                        {item.originalFileUrl && isExtracted && (
                          <div className="flex items-center gap-3 text-xs flex-wrap pl-1">
                            <div className="flex items-center gap-2">
                              <DocumentFormatIcon
                                fileType={item.originalFileType}
                                fileName={item.originalFileName}
                              />
                              <span className="text-ink-500">原稿：{item.originalFileName}</span>
                              <DocumentDownloadButton
                                fileUrl={item.originalFileUrl}
                                fileName={item.originalFileName}
                                className="text-gold-600 hover:text-gold-700"
                                iconClassName="w-3 h-3"
                              />
                            </div>
                            <Badge variant="teal">已拆解</Badge>
                          </div>
                        )}
                      </>
                    )}
                    {renderGeneratedCoursewareRows(
                      "examPaper",
                      [item.id, ...extractCopies.map((copy) => copy.id)],
                    )}
                    {hasExtractCopy && item.originalFileUrl && (
                      <OriginalFileRow
                        fileUrl={item.originalFileUrl}
                        fileName={item.originalFileName}
                        fileType={item.originalFileType}
                        icon={FileSpreadsheet}
                        onView={() => openPage(`/resources/preview/${item.id}?type=examPaper`)}
                      />
                    )}
                  </DocumentResourceGroup>
                ));
              })}

              {/* 课件库 */}
              {activeTab === "courseware" && (paginatedResourceData as Courseware[]).map((item) => renderFolderedResource("courseware", item.id, (
                <div key={item.id} className="space-y-2">
                  <ResourceCard
                  {...batchSelectionCardProps("courseware", item.id)}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: coursewareTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  fileUrl={item.fileUrl}
                  type={item.type}
                  reflections={reflectionsMap[item.id]}
                  showAddToBasket={item.type === "ggb"}
                  basketResourceType="courseware"
                  basketResourceId={item.id}
                  onBasketChanged={loadAll}
                  onClick={() => item.lessonCoursewareId
                    ? openLinkedCourseware(item)
                    : item.type === "ppt"
                      ? void openCoursewareInWps(item)
                      : openPage(`/coursewares/${item.id}`)}
                  primaryActions={item.lessonCoursewareId ? (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => openLinkedCourseware(item)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      编辑课件
                    </Button>
                  ) : item.type === "ppt" ? (
                    <>
                      <Button
                        variant="gold"
                        size="sm"
                        loading={coursewarePushKey === `${item.id}:editable`}
                        disabled={Boolean(coursewarePushKey)}
                        onClick={() => void handlePushCoursewareForEditing(item)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        推送到我的上课（二次编辑）
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        loading={coursewarePushKey === `${item.id}:direct`}
                        disabled={Boolean(coursewarePushKey)}
                        onClick={() => void handlePushCoursewareDirect(item)}
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        直接推送我要上课（PPT上课）
                      </Button>
                    </>
                  ) : undefined}
                  alwaysShowActions
                  showAddToLesson={!item.lessonCoursewareId && item.type !== "ppt"}
                  onAddToLesson={async () => {
                    if (!teacher) return;
                    try {
                      const lesson = await lessonCoursewareService.createFromCourseware(
                        teacher.id,
                        teacher.schoolId!,
                        item,
                      );
                      toast.success("已添加到上课", "请选择班级并完成发布");
                      navigate(`/my-lessons/${lesson.id}/edit`);
                    } catch (error) {
                      toast.error("添加失败", error instanceof Error ? error.message : undefined);
                    }
                  }}
                  onShare={() => handleOpenShare("courseware", item.id, item.title)}
                  onDelete={() => handleDelete(item.id)}
                  onRename={(title) => handleRenameResource("courseware", item.id, title)}
                  onViewReflections={() => setViewingReflections({ title: item.title, list: reflectionsMap[item.id] || [] })}
                  onDuplicate={() => openDuplicate("courseware", item.id, item.title)}
                  additionalActions={folderActionsFor("courseware", item.id, item.title)}
                  />
                  {item.sourceResourceType && item.sourceResourceId && (
                    <LinkedResourceRow
                      label="原稿"
                      title={item.sourceResourceTitle || "源文档"}
                      icon={item.sourceResourceType === "examPaper" ? FileSpreadsheet : FileText}
                      onView={() => openPage(item.sourceResourceType === "examPaper"
                        ? `/exam-papers/${item.sourceResourceId}/preview`
                        : `/lectures/${item.sourceResourceId}/preview`)}
                    />
                  )}
                </div>
              )))}

              {/* 素材库 */}
              {activeTab === "material" && (paginatedResourceData as Material[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  {...batchSelectionCardProps("material", item.id)}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: materialTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear} · ${item.semester || "上学期"}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                    ...(item.type === "knowledgeBlock"
                      ? [{ label: "讲解视频", value: item.explanationVideo?.title || "未关联" }]
                      : []),
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  fileUrl={item.fileUrl}
                  type={item.type}
                  showAddToBasket
                  basketResourceType="material"
                  basketResourceId={item.id}
                  onBasketChanged={loadAll}
                  onShare={() => handleOpenShare("material", item.id, item.title)}
                  onExplanationVideo={item.type === "knowledgeBlock"
                    ? () => setKnowledgeVideoTarget(item)
                    : undefined}
                  onDelete={() => handleDelete(item.id)}
                  onRename={(title) => handleRenameResource("material", item.id, title)}
                  alwaysShowActions
                />
              ))}
            </div>
          )}

          {!loading && resourceListData.length > 0 && (
            <div className="mt-4">
              <PaginationBar
                currentPage={safeResourcePage}
                totalPages={totalResourcePages}
                totalItems={resourceListData.length}
                pageSize={resourcePageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                itemLabel="项"
                summaryExtra={activeResourceQuota ? (
                  <span className="text-xs text-ink-500">
                    容量 {activeResourceQuota.used}/{activeResourceQuota.capacity}
                    {activeResourceQuota.donationBonus > 0
                      ? `（有效捐赠扩容 +${activeResourceQuota.donationBonus}）`
                      : ""}
                  </span>
                ) : undefined}
                onPageChange={(page) => setResourcePage(Math.min(totalResourcePages, Math.max(1, page)))}
                onPageSizeChange={(pageSize) => {
                  setResourcePageSize(pageSize);
                  setResourcePage(1);
                }}
              />
            </div>
          )}
        </div>
      </ResizableSidebarLayout>
      )}

      <QuestionVideoModal
        open={Boolean(knowledgeVideoTarget)}
        question={null}
        material={knowledgeVideoTarget}
        teacherId={teacher?.id}
        schoolId={teacher?.schoolId}
        onClose={() => setKnowledgeVideoTarget(null)}
        onMaterialSaved={(updated) => {
          setMaterials((current) => current.map((item) => item.id === updated.id ? updated : item));
          setKnowledgeVideoTarget(null);
        }}
      />

      {resourceSelections.size > 0 && (
        <div
          role="region"
          aria-label="批量操作"
          className="fixed bottom-6 right-6 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border border-ink-200 bg-paper p-2 shadow-xl"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResourceSelections(new Set())}
            disabled={batchWorking || donating}
            className="whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" />
            取消批量选择
          </Button>
          <select
            value=""
            onChange={(event) => handleBatchAction(event.target.value)}
            disabled={batchWorking || donating}
            aria-label="选择批量操作"
            className="h-8 min-w-44 cursor-pointer rounded-md border border-ink-200 bg-paper px-3 text-sm text-ink-700 outline-none transition-colors hover:border-ink-300 focus:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              {batchWorking || donating ? "正在处理..." : `批量操作（${resourceSelections.size}）`}
            </option>
            <option value="share">批量分享</option>
            <option value="delete">批量删除</option>
            <option value="donate">捐赠到平台</option>
            {resourceSelections.size >= 2 && <option value="folder">创建专辑</option>}
            <option value="chapter">新增统一章节</option>
            <option value="knowledge">新增统一知识点</option>
          </select>
        </div>
      )}

      <Modal
        open={!!batchShareLink}
        onClose={() => setBatchShareLink("")}
        title="批量分享链接"
        description={`已生成包含 ${batchShareCount} 个资源的分享链接。接收者登录后可一次性导入。`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBatchShareLink("")}>关闭</Button>
            <Button variant="gold" onClick={handleCopyBatchShareLink}>
              <Copy className="h-4 w-4" />
              复制链接
            </Button>
          </div>
        }
      >
        <Input
          label="分享链接"
          aria-label="批量分享链接"
          value={batchShareLink}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="font-mono text-xs"
        />
      </Modal>

      <Modal
        open={!!batchDirectoryMode}
        onClose={() => {
          if (batchWorking) return;
          setBatchDirectoryMode(null);
          setBatchDirectoryIds([]);
        }}
        title={batchDirectoryMode === "chapter" ? "新增统一章节" : "新增统一知识点"}
        description={`所选目录会追加到 ${resourceSelections.size} 个资源，原有关联不会被覆盖。`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setBatchDirectoryMode(null);
                setBatchDirectoryIds([]);
              }}
              disabled={batchWorking}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleApplyBatchDirectory}
              loading={batchWorking}
              disabled={batchDirectoryIds.length === 0}
            >
              确认新增
            </Button>
          </div>
        }
      >
        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {batchDirectoryMode === "chapter" ? (
            displayedChapterTree ? (
              <SearchableTree
                data={displayedChapterTree}
                title="选择章节"
                accent="gold"
                checkable
                checkedIds={batchDirectoryIds}
                onCheck={setBatchDirectoryIds}
                searchPlaceholder="搜索章节..."
              />
            ) : (
              <div className="flex justify-center py-10"><Spinner size={20} /></div>
            )
          ) : displayedKnowledgeTree ? (
            <SearchableTree
              data={displayedKnowledgeTree}
              title="选择知识点"
              accent="teal"
              checkable
              checkedIds={batchDirectoryIds}
              onCheck={setBatchDirectoryIds}
              searchPlaceholder="搜索知识点..."
            />
          ) : (
            <div className="flex justify-center py-10"><Spinner size={20} /></div>
          )}
        </div>
      </Modal>

      <Modal
        open={folderCreateType !== null}
        onClose={() => {
          if (folderWorking) return;
          setFolderCreateType(null);
          setFolderCreateResourceIds([]);
          setFolderName("");
        }}
        title="创建专辑"
        description={`将选中的 ${folderCreateResourceIds.length} 个文档加入新专辑。`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setFolderCreateType(null);
                setFolderCreateResourceIds([]);
                setFolderName("");
              }}
              disabled={folderWorking}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleCreateFolder}
              loading={folderWorking}
              disabled={!folderName.trim()}
            >
              <FolderPlus className="h-4 w-4" />
              创建
            </Button>
          </div>
        }
      >
        <Input
          label="专辑名称"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
          placeholder="输入专辑名称"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && folderName.trim()) void handleCreateFolder();
          }}
        />
      </Modal>

      <Modal
        open={folderMoveTarget !== null}
        onClose={() => {
          if (folderWorking) return;
          setFolderMoveTarget(null);
          setFolderMoveId("");
        }}
        title={folderMoveTarget && folderForResource(
          folderMoveTarget.resourceType,
          folderMoveTarget.resourceId,
        ) ? "移动到专辑" : "加入专辑"}
        description={folderMoveTarget?.resourceTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setFolderMoveTarget(null);
                setFolderMoveId("");
              }}
              disabled={folderWorking}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleApplyFolderMove}
              loading={folderWorking}
              disabled={!folderMoveId}
            >
              确认
            </Button>
          </div>
        }
      >
        <label className="block text-sm text-ink-700">
          <span className="mb-1.5 block font-medium">目标专辑</span>
          <select
            value={folderMoveId}
            onChange={(event) => setFolderMoveId(event.target.value)}
            className="w-full rounded-md border border-ink-200 bg-paper px-3 py-2 outline-none focus:border-gold-400"
            aria-label="目标专辑"
          >
            {resourceFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </label>
      </Modal>

      {/* 分享弹窗 */}
      <Modal
        open={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="分享资源"
        description={shareTarget?.resourceTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShareTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleShare} loading={sharing}>
              <Share2 className="w-4 h-4" />
              确认分享
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-ink-700 mb-2">分享范围</div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "school", label: "本校", desc: "校内教师可见" },
                { value: "friends", label: "好友", desc: "指定教师" },
                { value: "public", label: "平台公开", desc: "全平台可见" },
              ] as { value: ShareScope; label: string; desc: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setShareScope(opt.value)}
                  className={cn(
                    "p-2.5 rounded-md border text-left transition-all",
                    shareScope === opt.value
                      ? "border-gold-300 bg-gold-50"
                      : "border-ink-200 bg-paper hover:border-ink-300",
                  )}
                >
                  <div className="text-sm font-medium text-ink-800">{opt.label}</div>
                  <div className="text-[10px] text-ink-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="附言（可选）"
            placeholder="给接收者留一句话..."
            value={shareMessage}
            onChange={(e) => setShareMessage(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>

      {prepTarget && (
        <AddResourceToPrepModal
          open
          onClose={() => setPrepTarget(null)}
          resourceType={prepTarget.resourceType}
          resourceId={prepTarget.resourceId}
          resourceTitle={prepTarget.resourceTitle}
        />
      )}

      {/* 捐赠题目查重与合并 */}
      <Modal
        open={!!donationCheck && donationCheck.conflicts.length > 0}
        onClose={() => {
          setDonationCheck(null);
          setPendingDonationItems([]);
          setDonationDecisions({});
        }}
        title="题目查重"
        description="以下题目与平台现有题目的相似度超过 80%。题干只能二选一，答案、解析、总结可复选并保留为第二项。"
        size="full"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDonationCheck(null);
                setPendingDonationItems([]);
                setDonationDecisions({});
              }}
            >
              取消
            </Button>
            <Button
              variant="gold"
              loading={donating}
              onClick={() => completeDonation(pendingDonationItems, Object.values(donationDecisions))}
            >
              <Gift className="w-4 h-4" />
              确认捐赠
            </Button>
          </div>
        }
      >
        <div className="space-y-5 max-h-[68vh] overflow-y-auto pr-1">
          {donationCheck?.conflicts.map((conflict) => {
            const decision = donationDecisions[conflict.item.resourceId];
            if (!decision) return null;
            const fieldRows = [
              { key: "stem", label: "题干", source: conflict.sourceQuestion.stem, target: conflict.targetQuestion.stem },
              { key: "answer", label: "答案", source: conflict.sourceQuestion.answer, target: conflict.targetQuestion.answer },
              { key: "analysis", label: "解析", source: conflict.sourceQuestion.analysis, target: conflict.targetQuestion.analysis },
              { key: "summary", label: "总结", source: conflict.sourceQuestion.summary || "（无）", target: conflict.targetQuestion.summary || "（无）" },
            ] as const;
            return (
              <Card key={conflict.item.resourceId} className="p-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="font-medium text-ink-900">相似题目比较</div>
                    <div className="text-xs text-ink-500 mt-1">
                      相似度 {(conflict.similarity * 100).toFixed(1)}% · 平台贡献者：{conflict.targetDonorNickname}
                    </div>
                  </div>
                  <div className="flex rounded-md border border-ink-200 overflow-hidden">
                    {([
                      { value: "new", label: "作为新题新增" },
                      { value: "merge", label: "合并到现有题" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          action: option.value,
                        }))}
                        className={cn(
                          "px-3 py-1.5 text-xs transition-colors",
                          decision.action === option.value
                            ? "bg-gold-400 text-ink-900"
                            : "bg-paper text-ink-600 hover:bg-mist",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[88px_1fr_1fr] gap-2 text-xs">
                  <div />
                  <div className="font-medium text-ink-600 px-2">本次捐赠</div>
                  <div className="font-medium text-ink-600 px-2">平台现有</div>
                  {fieldRows.map((field) => (
                    <div key={field.key} className="contents">
                      <div className="font-medium text-ink-700 py-2">{field.label}</div>
                      <button
                        disabled={decision.action !== "merge"}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          fields: {
                            ...current.fields,
                            [field.key]: field.key === "stem"
                              ? "source"
                              : current.fields[field.key] === "both"
                                ? "target"
                                : current.fields[field.key] === "target"
                                  ? "both"
                                  : "source",
                          },
                        }))}
                        className={cn(
                          "text-left p-2 rounded-md border whitespace-pre-wrap break-words",
                          decision.action === "merge" && ["source", "both"].includes(decision.fields[field.key])
                            ? "border-gold-400 bg-gold-50"
                            : "border-ink-100 bg-mist/40",
                          decision.action !== "merge" && "opacity-60 cursor-default",
                        )}
                      >
                        {field.source}
                      </button>
                      <button
                        disabled={decision.action !== "merge"}
                        onClick={() => updateDonationDecision(conflict.item.resourceId, (current) => ({
                          ...current,
                          fields: {
                            ...current.fields,
                            [field.key]: field.key === "stem"
                              ? "target"
                              : current.fields[field.key] === "both"
                                ? "source"
                                : current.fields[field.key] === "source"
                                  ? "both"
                                  : "target",
                          },
                        }))}
                        className={cn(
                          "text-left p-2 rounded-md border whitespace-pre-wrap break-words",
                          decision.action === "merge" && ["target", "both"].includes(decision.fields[field.key])
                            ? "border-gold-400 bg-gold-50"
                            : "border-ink-100 bg-mist/40",
                          decision.action !== "merge" && "opacity-60 cursor-default",
                        )}
                      >
                        {field.target}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </Modal>

      {/* 课后反思查看弹窗 */}
      <Modal
        open={!!viewingReflections}
        onClose={() => setViewingReflections(null)}
        title="课后反思"
        description={viewingReflections?.title}
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setViewingReflections(null)}>关闭</Button>
          </div>
        }
      >
        {viewingReflections && viewingReflections.list.length > 0 ? (
          <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
            {viewingReflections.list.map((r) => (
              <div key={r.id} className="p-3 rounded-md border border-gold-200 bg-gold-50/40">
                <div className="flex items-center gap-2 mb-1.5">
                  {r.rating && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "w-3.5 h-3.5",
                            i < r.rating!
                              ? "fill-gold-500 text-gold-500"
                              : "text-ink-200",
                          )}
                        />
                      ))}
                    </div>
                  )}
                  <span className="text-[11px] text-ink-400 ml-auto">{timeAgo(r.createdAt)}</span>
                </div>
                <div className="text-sm text-ink-800 leading-relaxed whitespace-pre-wrap">
                  {r.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-ink-400">
            <MessageSquareText className="w-10 h-10 mx-auto mb-2 text-ink-200" />
            暂无课后反思
          </div>
        )}
      </Modal>

      {/* 创建副本弹窗 */}
      <Modal
        open={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        title="创建副本"
        description={duplicateTarget?.originalTitle}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDuplicateTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="w-4 h-4" />
              确认创建副本
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="新标题"
            value={duplicateTitle}
            onChange={(e) => setDuplicateTitle(e.target.value)}
            placeholder="输入新资源标题"
          />
          <div className="p-2.5 rounded-md bg-teal-50/60 border border-teal-200 text-xs text-teal-800 flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <div>
              创建副本会生成一个新的资源，并自动复制所有关联的课后反思。
            </div>
          </div>
        </div>
      </Modal>

      {/* 新建资源篮弹窗 */}
      <Modal
        open={creatingBasket}
        onClose={() => {
          setCreatingBasket(false);
          setNewBasketName("");
          setNewBasketClassIds([]);
          setNewBasketStudentIds([]);
        }}
        size="lg"
        title="新建资源篮"
        description="创建资源篮并选择它面向的班级或具体学生"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setCreatingBasket(false);
                setNewBasketName("");
                setNewBasketClassIds([]);
                setNewBasketStudentIds([]);
              }}
            >
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleCreateBasket}
              loading={isCreatingBasket}
              disabled={!newBasketName.trim() || newBasketClassIds.length + newBasketStudentIds.length === 0}
            >
              创建
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="资源篮名称"
            value={newBasketName}
            onChange={(e) => setNewBasketName(e.target.value)}
            placeholder="输入资源篮名称"
            autoFocus
          />
          <BasketAudiencePicker
            classes={audienceClasses}
            students={audienceStudents}
            classIds={newBasketClassIds}
            studentIds={newBasketStudentIds}
            onChange={({ classIds, studentIds }) => {
              setNewBasketClassIds(classIds);
              setNewBasketStudentIds(studentIds);
            }}
          />
        </div>
      </Modal>

      <Modal
        open={editingBasketAudience}
        onClose={() => setEditingBasketAudience(false)}
        size="lg"
        title="调整资源篮使用对象"
        description={selectedBasket ? `资源篮：${selectedBasket.name}` : undefined}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              variant="ghost"
              onClick={() => {
                setDraftBasketClassIds([]);
                setDraftBasketStudentIds([]);
              }}
            >
              清空选择
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingBasketAudience(false)}>取消</Button>
              <Button variant="gold" onClick={handleSaveBasketAudience} loading={savingBasketAudience}>
                保存
              </Button>
            </div>
          </div>
        }
      >
        <BasketAudiencePicker
          classes={audienceClasses}
          students={audienceStudents}
          classIds={draftBasketClassIds}
          studentIds={draftBasketStudentIds}
          onChange={({ classIds, studentIds }) => {
            setDraftBasketClassIds(classIds);
            setDraftBasketStudentIds(studentIds);
          }}
        />
      </Modal>

    </div>
  );
}

// ============ 题目列表项组件 ============
interface QuestionListItemProps {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
  onShare: () => void;
  onDelete: () => void;
}

export function QuestionListItem({ question, expanded, onToggle, onShare, onDelete }: QuestionListItemProps) {
  const { teacher } = useAuthStore();
  const { getLabel: getQuestionTypeLabel } = useQuestionTypeOptions(teacher?.schoolId);
  const difficultyVariant =
    question.difficulty <= 2
      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
      : question.difficulty <= 3
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : "bg-red-50 text-red-700 border border-red-200";

  return (
    <div className="card-base p-4 hover:shadow-cardHover transition-all group">
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 p-0.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700 flex-shrink-0"
          title={expanded ? "收起" : "展开"}
        >
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="tag-ink">{getQuestionTypeLabel(question.type)}</span>
            <span className={cn("tag-base", difficultyVariant)}>
              {difficultyLabel[question.difficulty]}
            </span>
            {question.duplicateHash && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                <Sparkles className="w-3 h-3" />
                已查重
              </span>
            )}
            {question.isShared && <span className="tag-teal">共享</span>}
            {question.recommendation >= 4 && <span className="tag-gold">推荐</span>}
          </div>

          <div
            className="text-sm text-ink-900 leading-relaxed mb-1"
            onClick={onToggle}
            role="button"
          >
            <MathHtml className="whitespace-pre-wrap">{question.stem}</MathHtml>
          </div>

          {question.options && question.options.length > 0 && expanded && (
            <div
              data-testid={`resource-question-options-${question.id}`}
              className={cn(
                "mb-2 mt-2 grid gap-x-4 gap-y-1.5 rounded bg-mist/40 p-2 text-xs text-ink-600",
                getQuestionOptionGridColumns(question.options),
              )}
            >
              {question.options.map((opt, i) => (
                <div key={i} className="flex min-w-0 items-start gap-1">
                  <span className="font-mono font-semibold flex-shrink-0">{String.fromCharCode(65 + i)}.</span>
                  <MathHtml className="min-w-0 flex-1 break-all whitespace-pre-wrap">{opt}</MathHtml>
                </div>
              ))}
            </div>
          )}

          {expanded && (
            <div className="text-xs text-ink-600 space-y-1.5 mt-2 bg-mist/40 p-2 rounded">
              <div>
                <span className="text-ink-400">答案：</span>
                <MathHtml className="question-answer-content text-ink-800">{question.answer}</MathHtml>
              </div>
              {question.analysis && (
                <div>
                  <span className="text-ink-400">解析：</span>
                  <MathHtml className="text-ink-700">{question.analysis}</MathHtml>
                </div>
              )}
              {question.remark && (
                <div>
                  <span className="text-ink-400">备注：</span>
                  <span className="text-ink-700">{question.remark}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400 mt-2">
            <span>使用 {question.usageCount} 次</span>
            {question.grade && <span>年级：{question.grade}</span>}
            <span className="ml-auto">{timeAgo(question.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggle}
            className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
            title="查看详情"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={onShare}
            className="p-1.5 rounded text-ink-400 hover:bg-teal-50 hover:text-teal-700"
            title="分享"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 资源卡片组件 ============
interface ResourceCardProps {
  title: string;
  titleIcon?: React.ReactNode;
  titleActions?: React.ReactNode;
  primaryActions?: React.ReactNode;
  description?: string;
  meta: { label: string; value: string }[];
  content?: string;
  updatedAt: string;
  onClick?: () => void;
  onRename?: (title: string) => void | Promise<void>;
  onShare?: () => void;
  onDelete?: () => void;
  onAddToLesson?: () => void;
  onAddToPrep?: () => void;
  onDuplicate?: () => void;
  onExplanationVideo?: () => void;
  onConvertToExamPaper?: () => void;
  onViewReflections?: () => void;
  reflections?: Reflection[];
  fileUrl?: string;
  type?: string;
  showAddToLesson?: boolean;
  showAddToBasket?: boolean;
  basketResourceType?: "material" | "courseware";
  basketResourceId?: string;
  onBasketChanged?: () => void;
  className?: string;
  titleBadge?: { text: string; variant: "gold" | "teal" | "ink" | "red" | "green" | "amber" | "default" };
  selected?: boolean;
  donated?: boolean;
  donationLocked?: boolean;
  onToggleSelection?: () => void;
  alwaysShowActions?: boolean;
  compactActions?: boolean;
  configurableActions?: boolean;
  detailsPresentation?: "inline" | "titleTooltip";
  additionalActions?: ConfigurableResourceAction[];
}

export function ResourceCard({ title, titleIcon, titleActions, primaryActions, description, meta, content, updatedAt, onClick, onRename, onShare, onDelete, onAddToLesson, onAddToPrep, onDuplicate, onExplanationVideo, onConvertToExamPaper, onViewReflections, reflections, fileUrl, type, showAddToLesson, showAddToBasket, basketResourceType, basketResourceId, onBasketChanged, className, titleBadge, selected, donated, donationLocked, onToggleSelection, alwaysShowActions, compactActions, configurableActions, detailsPresentation = "inline", additionalActions = [] }: ResourceCardProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [savingTitle, setSavingTitle] = useState(false);
  const isImage = type === "image";
  const isKnowledgeBlock = type === "knowledgeBlock";
  const handlePreviewOpen = () => setPreviewOpen(true);
  const toggleKnowledge = () => setKnowledgeExpanded((expanded) => !expanded);
  const primaryClick = isKnowledgeBlock
    ? toggleKnowledge
    : onClick || (isImage ? handlePreviewOpen : undefined);
  const reflectionCount = reflections?.length || 0;
  const latestReflection = reflections?.[0];
  const actionButtonPadding = compactActions ? "p-1" : "p-1.5";
  const actionIconSize = compactActions ? "w-3.5 h-3.5" : "w-4 h-4";
  const titleDetails = [
    ...meta.map((item) => `${item.label}：${item.value}`),
    `更新：${timeAgo(updatedAt)}`,
  ].join("\n");
  const resourceActions: ConfigurableResourceAction[] = [
    ...(onClick ? [{
      key: "view",
      label: "查看/编辑",
      icon: <Eye />,
      onClick,
    }] : []),
    ...(onRename ? [{
      key: "rename",
      label: "修改名称",
      ariaLabel: `修改名称：${title}`,
      icon: <Pencil />,
      onClick: () => {
        setTitleDraft(title);
        setRenaming(true);
      },
      disabled: renaming || savingTitle,
      tone: "gold" as const,
    }] : []),
    ...((isImage || isKnowledgeBlock) ? [{
      key: "preview",
      label: isImage ? "预览图片" : knowledgeExpanded ? "收起知识块" : "展开知识块",
      icon: <Eye />,
      onClick: isImage ? handlePreviewOpen : toggleKnowledge,
      tone: "gold" as const,
    }] : []),
    ...(onShare ? [{
      key: "share",
      label: "分享",
      icon: <Share2 />,
      onClick: onShare,
      tone: "teal" as const,
    }] : []),
    ...(onAddToPrep ? [{
      key: "addToPrep",
      label: "添加到集体备课",
      icon: <Users />,
      onClick: onAddToPrep,
      tone: "amber" as const,
    }] : []),
    ...(onExplanationVideo ? [{
      key: "explanationVideo",
      label: "讲解视频",
      icon: <Video />,
      onClick: onExplanationVideo,
      tone: "violet" as const,
    }] : []),
    ...(showAddToLesson && onAddToLesson ? [{
      key: "addToLesson",
      label: "添加到上课",
      icon: <PlayCircle />,
      onClick: onAddToLesson,
      tone: "gold" as const,
    }] : []),
    ...(onConvertToExamPaper ? [{
      key: "convertToExamPaper",
      label: "转试卷",
      icon: <FileSpreadsheet />,
      onClick: onConvertToExamPaper,
      tone: "gold" as const,
    }] : []),
    ...(onDuplicate ? [{
      key: "duplicate",
      label: "创建副本",
      icon: <Copy />,
      onClick: onDuplicate,
      tone: "indigo" as const,
    }] : []),
    ...additionalActions,
    ...(onDelete ? [{
      key: "delete",
      label: "删除",
      icon: <Trash2 />,
      onClick: onDelete,
      tone: "danger" as const,
    }] : []),
  ];

  useEffect(() => {
    if (!renaming) setTitleDraft(title);
  }, [renaming, title]);

  const beginRename = () => {
    setTitleDraft(title);
    setRenaming(true);
  };

  const cancelRename = () => {
    setTitleDraft(title);
    setRenaming(false);
  };

  const saveTitle = async () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      toast.warning("文档名称不能为空");
      return;
    }
    if (nextTitle === title) {
      setRenaming(false);
      return;
    }

    setSavingTitle(true);
    try {
      await onRename?.(nextTitle);
      setRenaming(false);
    } catch {
      // 页面级回调负责显示具体错误；保留编辑态便于用户修正或重试。
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <>
      <div className={cn(
        "card-base p-4 hover:shadow-cardHover transition-all group",
        selected && "ring-2 ring-gold-300/60 bg-gold-50/20",
        className,
      )}>
        <div data-testid="resource-card-main-row" className="flex items-start gap-3">
          {onToggleSelection && (
            <button
              onClick={onToggleSelection}
              className={cn(
                "mt-0.5 rounded p-0.5 flex-shrink-0 transition-colors",
                selected ? "text-gold-600" : "text-ink-300 hover:text-gold-600",
              )}
              aria-label={selected ? `取消选择资源：${title}` : `选择资源：${title}`}
              title={selected ? "取消选择" : "选择资源"}
            >
              {selected
                ? <CheckSquare className="w-4 h-4" />
                : <Square className="w-4 h-4" />}
            </button>
          )}
          {isImage && fileUrl && (
            <MaterialImageThumbnail
              title={title}
              fileUrl={fileUrl}
              onOpen={handlePreviewOpen}
              className="h-20 w-20"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2" data-testid="resource-card-title-row">
              {renaming ? (
                <div className="flex min-w-[16rem] flex-1 items-center gap-1.5">
                  <input
                    autoFocus
                    aria-label={`修改文档名称：${title}`}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveTitle();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    disabled={savingTitle}
                    className="h-8 min-w-0 flex-1 rounded-md border border-gold-300 bg-paper px-2 text-sm font-medium text-ink-900 outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-100"
                  />
                  <button
                    type="button"
                    onClick={() => void saveTitle()}
                    disabled={savingTitle}
                    className="rounded p-1.5 text-teal-700 hover:bg-teal-50 disabled:cursor-wait disabled:opacity-50"
                    title="保存名称"
                    aria-label="保存名称"
                  >
                    {savingTitle ? <Spinner size={14} /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    disabled={savingTitle}
                    className="rounded p-1.5 text-ink-400 hover:bg-mist hover:text-ink-700 disabled:opacity-50"
                    title="取消修改"
                    aria-label="取消修改"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  data-testid="resource-card-title"
                  className={cn("font-medium text-ink-900 flex min-w-0 items-center gap-2", primaryClick && "cursor-pointer hover:text-gold-700")}
                  onClick={primaryClick}
                  title={detailsPresentation === "titleTooltip" ? titleDetails : undefined}
                >
                  {titleIcon}
                  <span className="truncate">{title}</span>
                  {titleBadge && <Badge variant={titleBadge.variant}>{titleBadge.text}</Badge>}
                </div>
              )}
              {titleActions && (
                <div className="flex items-center gap-2" data-testid="resource-card-title-actions">
                  {titleActions}
                </div>
              )}
            </div>
            {description && (
              <div className="text-xs text-ink-500 mb-2 line-clamp-1">{description}</div>
            )}
            {content && !isImage && (
              isKnowledgeBlock ? (
                <button
                  type="button"
                  aria-label={`${knowledgeExpanded ? "收起" : "展开"}知识块：${title}`}
                  aria-expanded={knowledgeExpanded}
                  onClick={toggleKnowledge}
                  className="mb-2 w-full rounded bg-mist/40 p-2 text-left text-xs leading-relaxed text-ink-600 transition-colors hover:bg-mist/70 hover:text-ink-800"
                >
                  <MathHtml className={cn("whitespace-pre-wrap", !knowledgeExpanded && "line-clamp-3")}>
                    {content}
                  </MathHtml>
                </button>
              ) : (
                <div className="mb-2 rounded bg-mist/40 p-2 text-xs leading-relaxed text-ink-600 line-clamp-2">
                  {content}
                </div>
              )
            )}
            {/* 关联课后反思预览 */}
            {reflectionCount > 0 && (
              <div
                onClick={onViewReflections}
                className="mb-2 p-2 rounded-md bg-gold-50/60 border border-gold-200 cursor-pointer hover:bg-gold-50 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs text-gold-800 mb-0.5">
                  <MessageSquareText className="w-3.5 h-3.5" />
                  <span className="font-medium">课后反思 · {reflectionCount} 条</span>
                  {latestReflection?.rating && (
                    <span className="flex items-center gap-0.5 ml-1">
                      <Star className="w-3 h-3 fill-gold-500 text-gold-500" />
                      <span>{latestReflection.rating}</span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-600 line-clamp-1 pl-5">
                  {latestReflection?.content}
                </div>
              </div>
            )}
          </div>
          <div className={cn("flex items-start flex-shrink-0", compactActions ? "gap-1" : "gap-2")}>
            {donated && <Badge variant="teal">已捐赠</Badge>}
            {donationLocked && <Badge variant="ink">平台副本</Badge>}
            <div
              data-testid="resource-card-actions"
              className={cn(
                "flex items-center transition-opacity",
                compactActions ? "gap-0.5" : "gap-1",
                alwaysShowActions ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
            {configurableActions ? (
              <ConfigurableResourceActions actions={resourceActions} compact={compactActions} />
            ) : (
              <>
            {onClick && (
              <button
                onClick={onClick}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-mist hover:text-ink-700")}
                title="查看/编辑"
              >
                <Eye className={actionIconSize} />
              </button>
            )}
            {onRename && (
              <button
                onClick={beginRename}
                disabled={renaming || savingTitle}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-gold-50 hover:text-gold-700 disabled:opacity-40")}
                title="修改名称"
                aria-label={`修改名称：${title}`}
              >
                <Pencil className={actionIconSize} />
              </button>
            )}
            {(isImage || isKnowledgeBlock) && (
              <button
                onClick={isImage ? handlePreviewOpen : toggleKnowledge}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600")}
                title={isImage ? "预览图片" : knowledgeExpanded ? "收起知识块" : "展开知识块"}
              >
                <Eye className={actionIconSize} />
              </button>
            )}
            {onShare && (
              <button
                onClick={onShare}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-teal-50 hover:text-teal-700")}
                title="分享"
              >
                <Share2 className={actionIconSize} />
              </button>
            )}
            {onAddToPrep && (
              <button
                onClick={onAddToPrep}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-amber-50 hover:text-amber-700")}
                title="添加到集体备课"
              >
                <Users className={actionIconSize} />
              </button>
            )}
            {onExplanationVideo && (
              <button
                onClick={onExplanationVideo}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-violet-50 hover:text-violet-700")}
                title="讲解视频"
              >
                <Video className={actionIconSize} />
              </button>
            )}
            {showAddToLesson && onAddToLesson && (
              <button
                onClick={onAddToLesson}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600")}
                title="添加到上课"
              >
                <PlayCircle className={actionIconSize} />
              </button>
            )}
            {onConvertToExamPaper && (
              <button
                onClick={onConvertToExamPaper}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600")}
                title="转试卷"
              >
                <FileSpreadsheet className={actionIconSize} />
              </button>
            )}
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-indigo-50 hover:text-indigo-700")}
                title="创建副本"
              >
                <Copy className={actionIconSize} />
              </button>
            )}
            {additionalActions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  actionButtonPadding,
                  "rounded disabled:cursor-not-allowed disabled:opacity-40",
                  action.tone === "amber"
                    ? "text-ink-400 hover:bg-amber-50 hover:text-amber-700"
                    : action.tone === "gold"
                      ? "text-ink-400 hover:bg-gold-50 hover:text-gold-700"
                      : action.tone === "teal"
                        ? "text-ink-400 hover:bg-teal-50 hover:text-teal-700"
                        : action.tone === "danger"
                          ? "text-ink-400 hover:bg-red-50 hover:text-red-600"
                          : "text-ink-400 hover:bg-mist hover:text-ink-700",
                  compactActions ? "[&_svg]:h-3.5 [&_svg]:w-3.5" : "[&_svg]:h-4 [&_svg]:w-4",
                )}
                title={action.label}
                aria-label={action.ariaLabel || action.label}
              >
                {action.icon}
              </button>
            ))}
            {onDelete && (
              <button
                onClick={onDelete}
                className={cn(actionButtonPadding, "rounded text-ink-400 hover:bg-red-50 hover:text-red-600")}
                title="删除"
              >
                <Trash2 className={actionIconSize} />
              </button>
            )}
              </>
            )}
            </div>
          </div>
        </div>
        {detailsPresentation === "inline" && (
          <div
            data-testid="resource-card-details"
            className="mt-2 flex w-full items-center gap-x-4 gap-y-1.5 text-xs text-ink-400"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
              {meta.map((m, i) => (
                <span key={i}>
                  <span className="text-ink-300">{m.label}：</span>
                  <span className="text-ink-600">{m.value}</span>
                </span>
              ))}
            </div>
            <span className="flex-shrink-0 text-ink-300">{timeAgo(updatedAt)}</span>
          </div>
        )}
        {showAddToBasket && basketResourceType && basketResourceId && (
          <div className="mt-3 border-t border-ink-50 pt-3">
            <AddToBasketDropdown
              resourceType={basketResourceType}
              resourceId={basketResourceId}
              resourceTitle={title}
              size="sm"
              variant="outline"
              onAdded={onBasketChanged}
            />
          </div>
        )}
        {primaryActions && (
          <div
            data-testid="resource-card-primary-actions"
            className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-ink-50 pt-3"
          >
            {primaryActions}
          </div>
        )}
      </div>

      {isImage && (
        <MaterialPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={title}
          type={type as MaterialType}
          content={content}
          fileUrl={fileUrl}
        />
      )}
    </>
  );
}

interface BasketMaterialListItemProps {
  material: Material;
  selected: boolean;
  onToggleSelection: () => void;
  onRemove: () => void;
}

export function BasketMaterialListItem({
  material,
  selected,
  onToggleSelection,
  onRemove,
}: BasketMaterialListItemProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(false);
  const isImage = material.type === "image";
  const isKnowledgeBlock = material.type === "knowledgeBlock";
  const openPreview = () => setPreviewOpen(true);
  const toggleKnowledge = () => setKnowledgeExpanded((expanded) => !expanded);
  const primaryClick = isKnowledgeBlock ? toggleKnowledge : isImage ? openPreview : undefined;

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-3 rounded-md border p-3 transition-all",
          selected
            ? "border-gold-300 bg-gold-50/50"
            : "border-ink-100 hover:border-ink-200",
        )}
      >
        <button
          type="button"
          onClick={onToggleSelection}
          className="mt-0.5 flex-shrink-0"
          aria-label={selected ? `取消选择素材：${material.title}` : `选择素材：${material.title}`}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-gold-600" />
          ) : (
            <Square className="h-4 w-4 text-ink-300" />
          )}
        </button>
        {isImage && material.fileUrl && (
          <MaterialImageThumbnail
            title={material.title}
            fileUrl={material.fileUrl}
            onOpen={openPreview}
            className="h-20 w-20"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="tag-teal">{materialTypeLabel[material.type]}</span>
          </div>
          <div
            className={cn(
              "text-sm font-medium text-ink-800",
              (isImage || isKnowledgeBlock) && "cursor-pointer hover:text-gold-700",
            )}
            onClick={primaryClick}
          >
            {material.title}
          </div>
          {material.content && (
            isKnowledgeBlock ? (
              <button
                type="button"
                aria-label={`${knowledgeExpanded ? "收起" : "展开"}知识块：${material.title}`}
                aria-expanded={knowledgeExpanded}
                onClick={toggleKnowledge}
                className="mt-1 w-full text-left text-xs leading-relaxed text-ink-500 hover:text-ink-700"
              >
                <MathHtml className={cn("whitespace-pre-wrap", !knowledgeExpanded && "line-clamp-3")}>
                  {material.content}
                </MathHtml>
              </button>
            ) : (
              <div className="mt-1 text-xs text-ink-500 line-clamp-1">{material.content}</div>
            )
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 rounded p-1 text-ink-300 hover:bg-red-50 hover:text-red-500"
          title="从资源篮移除"
          aria-label="从资源篮移除素材"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isImage && (
        <MaterialPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={material.title}
          type={material.type}
          content={material.content}
          fileUrl={material.fileUrl}
        />
      )}
    </>
  );
}

// ============ 筛选下拉组件 ============
function FilterSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-all",
          value
            ? "bg-gold-50 border-gold-300 text-gold-800"
            : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
        )}
      >
        <span>{label}</span>
        {value && <span className="font-medium">· {options.find((o) => o.value === value)?.label}</span>}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 min-w-40 w-max max-w-64 bg-paper border border-ink-100 rounded-lg shadow-lg z-20 py-1 animate-fade-in">
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs hover:bg-mist transition-colors",
                !value && "text-gold-700 font-medium",
              )}
            >
              全部
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-mist transition-colors",
                  value === o.value && "text-gold-700 font-medium",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
