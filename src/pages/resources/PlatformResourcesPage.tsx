import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Calendar,
  Clock,
  Cloud,
  Crown,
  Edit3,
  FileBox,
  FileQuestion,
  FileSpreadsheet,
  FileText,
  Folder,
  ChevronDown,
  ChevronRight,
  Images,
  Lightbulb,
  MessageSquareWarning,
  Plus,
  Presentation,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { shareService } from "@/services/share";
import { donationService } from "@/services/donation";
import { uploadFile } from "@/services/api";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type {
  Courseware,
  CoursewareType,
  DonationAlbumSnapshot,
  DonationContributor,
  DonationPrivileges,
  ExamPaper,
  FilterLogic,
  Lecture,
  Material,
  MaterialType,
  PlatformResourceCorrection,
  PlatformSaveCheckResult,
  PlatformSaveDecision,
  Question,
  ShareRecord,
  ShareableResourceType,
  Teacher,
  TreeNode,
  ResourceSemester,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";
import { MathHtml } from "@/components/ui/MathHtml";
import { ExpandableQuestionContent } from "@/components/resource/ExpandableQuestionContent";
import {
  PlatformResourcePreviewModal,
  type PlatformPreviewResource,
} from "@/components/resource/PlatformResourcePreviewModal";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";

type ResourceTypeFilter = "all" | "album" | ShareableResourceType;
type LeftTab = "chapter" | "knowledge";
type SortKey = "layout" | "updated" | "created" | "title";
type ShareableResource = Question | ExamPaper | Lecture | Courseware | Material;

interface PlatformResourceItem {
  shareId: string;
  resourceType: ShareableResourceType;
  title: string;
  description?: string;
  content?: string;
  originalFileName?: string;
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  fromTeacherId: string;
  fromSchoolId: string;
  subject: string;
  order: number;
  chapterIds: string[];
  knowledgePointIds: string[];
  createdAt: string;
  updatedAt: string;
  meta: { label: string; value: string }[];
  snapshot: ShareableResource;
  donationAlbum?: DonationAlbumSnapshot;
  question?: Question;
}

interface PlatformAlbumGroup {
  key: string;
  subject: string;
  album: DonationAlbumSnapshot;
  items: PlatformResourceItem[];
}

interface PlatformResourceFilters {
  grade: string;
  schoolYear: string;
  semester: string;
  questionType: string;
  difficulty: string;
  recommendation: string;
  category: string;
  sourceType: string;
  status: string;
  layoutMode: string;
  originalFileType: string;
  versionType: string;
  coursewareType: string;
  materialType: string;
  tag: string;
}

interface FilterOption {
  value: string;
  label: string;
}

const emptyFilters: PlatformResourceFilters = {
  grade: "",
  schoolYear: "",
  semester: "",
  questionType: "",
  difficulty: "",
  recommendation: "",
  category: "",
  sourceType: "",
  status: "",
  layoutMode: "",
  originalFileType: "",
  versionType: "",
  coursewareType: "",
  materialType: "",
  tag: "",
};

const typeFilterConfig: { key: ResourceTypeFilter; label: string; icon: typeof FileText }[] = [
  { key: "all", label: "全部", icon: FileText },
  { key: "album", label: "专辑", icon: Folder },
  { key: "question", label: "题目", icon: FileQuestion },
  { key: "examPaper", label: "试卷", icon: FileSpreadsheet },
  { key: "lecture", label: "讲义", icon: FileText },
  { key: "courseware", label: "课件", icon: Presentation },
  { key: "material", label: "素材", icon: FileBox },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "layout", label: "平台编排", icon: <ArrowUpDown className="w-3.5 h-3.5" /> },
  { value: "updated", label: "最近更新", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "created", label: "捐赠时间", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

const resourceTypeLabel: Record<ShareableResourceType, string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
};

const resourceTypeIcon: Record<ShareableResourceType, typeof FileText> = {
  question: FileQuestion,
  examPaper: FileSpreadsheet,
  lecture: BookOpen,
  courseware: Presentation,
  material: FileBox,
};

const coursewareTypeLabel: Record<CoursewareType, string> = {
  ppt: "PPT", ggb: "GeoGebra", pdf: "PDF", video: "视频", image: "图片", other: "其他",
};

const materialTypeLabel: Record<MaterialType, string> = {
  text: "文本", image: "图片", audio: "音频", video: "视频", link: "链接", file: "文件", knowledgeBlock: "知识块",
};

const difficultyLabelText = ["", "简单", "较易", "中等", "较难", "困难"];

const questionCategoryLabel: Record<string, string> = {
  practice: "练习",
  exam: "考试",
  homework: "作业",
  review: "复习",
};

const questionSourceLabel: Record<string, string> = {
  imported: "文档导入",
  manual: "手工录入",
  shared: "分享获得",
};

const resourceStatusLabel: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
};

const examLayoutLabel: Record<string, string> = {
  grouped: "按题型分组",
  flat: "连续编排",
};

const originalFileTypeLabel: Record<string, string> = {
  word: "Word",
  pdf: "PDF",
};

const lectureVersionLabel: Record<string, string> = {
  origin: "原稿",
  extract: "正稿",
  preview: "预览稿",
  "answer-sheet": "答题卡",
};

function uniqueFilterOptions(
  values: Array<string | number | undefined>,
  getLabel: (value: string) => string = (value) => value,
): FilterOption[] {
  return [...new Set(values.filter((value): value is string | number => value !== undefined && value !== "").map(String))]
    .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }))
    .map((value) => ({ value, label: getLabel(value) }));
}

function getActiveAffiliation(teacher: Teacher | null) {
  if (!teacher) return null;
  return teacher.affiliations?.find((item) => item.id === teacher.currentAffiliationId)
    || teacher.affiliations?.find((item) => item.isCurrent)
    || null;
}

function getActiveRole(teacher: Teacher | null): Teacher["role"] | null {
  return getActiveAffiliation(teacher)?.role || teacher?.role || null;
}

function getActiveSubject(teacher: Teacher | null): string {
  return getActiveAffiliation(teacher)?.subject?.trim() || teacher?.subject?.trim() || "";
}

function CompactFilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <label className="flex min-w-[148px] items-center gap-2 rounded-md border border-ink-200 bg-paper px-2.5 py-1.5">
      <span className="shrink-0 text-xs text-ink-500">{label}</span>
      <select
        aria-label={`${label}筛选`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs text-ink-700 outline-none"
      >
        <option value="">全部</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function snapshotToItem(share: ShareRecord): PlatformResourceItem | null {
  const snapshot = share.resourceSnapshot as ShareableResource | undefined;
  if (!snapshot) return null;
  const base = {
    shareId: share.id,
    resourceType: share.resourceType,
    fromTeacherId: share.fromTeacherId,
    fromSchoolId: share.fromSchoolId,
    subject: share.platformSubject?.trim() || "未分类",
    order: share.platformOrder || 0,
    createdAt: share.createdAt,
    updatedAt: snapshot.updatedAt || share.createdAt,
    grade: snapshot.grade,
    schoolYear: snapshot.schoolYear,
    semester: snapshot.semester || "上学期",
    snapshot,
    donationAlbum: share.donationAlbum,
    chapterIds: share.directorySnapshot?.chapters.filter((item) => item.selected).map((item) => item.id) || [],
    knowledgePointIds: share.directorySnapshot?.knowledgePoints.filter((item) => item.selected).map((item) => item.id) || [],
  };
  switch (share.resourceType) {
    case "question": {
      const question = snapshot as Question;
      return {
        ...base,
        title: question.stem,
        description: question.analysis,
        question,
        meta: [
          { label: "题型", value: getDefaultQuestionTypeLabel(question.type) },
          { label: "难度", value: difficultyLabelText[question.difficulty] },
          { label: "推荐", value: `${question.recommendation} 星` },
          { label: "年级", value: `${question.grade || "未指定"} · ${question.schoolYear || "未指定"} · ${question.semester || "上学期"}` },
        ],
      };
    }
    case "examPaper": {
      const paper = snapshot as ExamPaper;
      return {
        ...base,
        title: paper.title,
        description: paper.description,
        originalFileName: paper.originalFileName,
        meta: [
          { label: "年级", value: `${paper.grade} · ${paper.schoolYear} · ${paper.semester || "上学期"}` },
          { label: "题目", value: `${paper.questions.length} 题` },
          { label: "总分", value: `${paper.totalScore} 分` },
        ],
      };
    }
    case "lecture": {
      const lecture = snapshot as Lecture;
      return {
        ...base,
        title: lecture.title,
        description: lecture.description,
        originalFileName: lecture.originalFileName,
        meta: [
          { label: "年级", value: `${lecture.grade} · ${lecture.schoolYear} · ${lecture.semester || "上学期"}` },
          { label: "内容", value: `${lecture.sections.length} 节` },
        ],
      };
    }
    case "courseware": {
      const courseware = snapshot as Courseware;
      return {
        ...base,
        title: courseware.title,
        description: courseware.description,
        content: courseware.content,
        meta: [
          { label: "类型", value: coursewareTypeLabel[courseware.type] },
          { label: "年级", value: `${courseware.grade} · ${courseware.schoolYear} · ${courseware.semester || "上学期"}` },
        ],
      };
    }
    case "material": {
      const material = snapshot as Material;
      return {
        ...base,
        title: material.title,
        description: material.description,
        content: material.content,
        meta: [
          { label: "类型", value: materialTypeLabel[material.type] },
          { label: "年级", value: `${material.grade} · ${material.schoolYear} · ${material.semester || "上学期"}` },
        ],
      };
    }
  }
}

interface PlatformQuestionContentProps {
  question: Question;
  expanded: boolean;
  onToggle: () => void;
}

export function PlatformQuestionContent({
  question,
  expanded,
  onToggle,
}: PlatformQuestionContentProps) {
  return (
    <ExpandableQuestionContent
      question={question}
      expanded={expanded}
      onToggle={onToggle}
      optionsTestId="platform-question-options"
    />
  );
}

function resolveNames(tree: TreeNode | null, ids: string[]): string {
  if (!tree || ids.length === 0) return "";
  const names: string[] = [];
  const walk = (node: TreeNode) => {
    if (ids.includes(node.id) && node.id !== "root") names.push(node.name);
    node.children.forEach(walk);
  };
  walk(tree);
  return names.slice(0, 2).join("、") + (names.length > 2 ? ` 等${names.length}个` : "");
}

export default function PlatformResourcesPage() {
  const { teacher } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [leftTab, setLeftTab] = useState<LeftTab>("chapter");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("layout");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [moderatorSubject, setModeratorSubject] = useState("");
  const [items, setItems] = useState<PlatformResourceItem[]>([]);
  const [contributors, setContributors] = useState<DonationContributor[]>([]);
  const [privileges, setPrivileges] = useState<DonationPrivileges | null>(null);
  const [filters, setFilters] = useState<PlatformResourceFilters>(emptyFilters);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [ownContributionIds, setOwnContributionIds] = useState<Set<string>>(new Set());
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(new Set());
  const [expandedAlbumKeys, setExpandedAlbumKeys] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<PlatformResourceItem | null>(null);
  const [albumWorkingKey, setAlbumWorkingKey] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState<{
    item: PlatformResourceItem;
    check: PlatformSaveCheckResult;
    decision: PlatformSaveDecision;
  } | null>(null);
  const [editItem, setEditItem] = useState<PlatformResourceItem | null>(null);
  const [corrections, setCorrections] = useState<PlatformResourceCorrection[]>([]);
  const [activeCorrectionId, setActiveCorrectionId] = useState<string | null>(null);
  const [correctionItem, setCorrectionItem] = useState<PlatformResourceItem | null>(null);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [correctionImages, setCorrectionImages] = useState<File[]>([]);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [formulaEditorOpen, setFormulaEditorOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "", description: "", grade: "", schoolYear: "", semester: "上学期" as ResourceSemester, originalFileName: "", difficulty: "", recommendation: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingModeratorId, setUpdatingModeratorId] = useState<string | null>(null);

  const schoolId = teacher?.schoolId || "sch-1";
  const platformAdmin = getActiveRole(teacher) === "platform_admin";
  const teacherSubject = getActiveSubject(teacher);
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(schoolId);

  const loadAll = useCallback(async () => {
    if (!teacher) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [donations, myDonations, contributorList, myPrivileges, chapterData, knowledgeData, correctionList] = await Promise.all([
        shareService.listPublicDonations(teacher.id),
        shareService.listDonationStatus(teacher.id),
        shareService.listDonationContributors(teacher.id),
        shareService.getDonationPrivileges(teacher.id),
        shareService.getPlatformDirectoryTree("chapter", teacher.id),
        shareService.getPlatformDirectoryTree("knowledge", teacher.id),
        shareService.listDonationCorrections(teacher.id),
      ]);
      const nextItems = donations.map(snapshotToItem).filter((item): item is PlatformResourceItem => Boolean(item));
      setItems(nextItems);
      setOwnContributionIds(new Set(myDonations.map((record) => record.mergedIntoDonationId || record.id)));
      setContributors(contributorList);
      setPrivileges(myPrivileges);
      setChapterTree(chapterData);
      setKnowledgeTree(knowledgeData);
      setCorrections(correctionList);
      if (!platformAdmin) setSelectedSubject(teacherSubject);
    } catch (error) {
      console.error("加载平台资源失败", error);
      toast.error("加载平台资源失败");
    } finally {
      setLoading(false);
    }
  }, [platformAdmin, teacher, teacherSubject]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const contributorMap = useMemo(
    () => new Map(contributors.map((item) => [item.teacherId, item])),
    [contributors],
  );

  const subjectOptions = useMemo(() => [...new Set([
    ...items.map((item) => item.subject),
    ...contributors.flatMap((item) => [...item.subjects, ...item.moderatorSubjects]),
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN")), [contributors, items]);

  const managedContributors = useMemo(() => {
    const subject = moderatorSubject || selectedSubject || subjectOptions[0] || "";
    return contributors.filter((item) => item.subjects.includes(subject) || item.moderatorSubjects.includes(subject));
  }, [contributors, moderatorSubject, selectedSubject, subjectOptions]);

  const commonFilterOptions = useMemo(() => ({
    grade: uniqueFilterOptions(items.map((item) => item.grade)),
    schoolYear: uniqueFilterOptions(items.map((item) => item.schoolYear)).reverse(),
    semester: uniqueFilterOptions(items.map((item) => item.semester)),
  }), [items]);

  const typeSpecificFilterOptions = useMemo(() => {
    const typedItems = typeFilter === "all" || typeFilter === "album"
      ? []
      : items.filter((item) => item.resourceType === typeFilter);
    if (typeFilter === "question") {
      const questions = typedItems.map((item) => item.snapshot as Question);
      return {
        questionType: uniqueFilterOptions(questions.map((item) => item.type), getDefaultQuestionTypeLabel),
        difficulty: uniqueFilterOptions(
          questions.map((item) => item.difficulty),
          (value) => `${value} · ${difficultyLabelText[Number(value)]}`,
        ),
        recommendation: uniqueFilterOptions(questions.map((item) => item.recommendation), (value) => `${value} 星`),
        category: uniqueFilterOptions(questions.map((item) => item.category), (value) => questionCategoryLabel[value] || value),
        sourceType: uniqueFilterOptions(questions.map((item) => item.sourceType), (value) => questionSourceLabel[value] || value),
      };
    }
    if (typeFilter === "examPaper") {
      const papers = typedItems.map((item) => item.snapshot as ExamPaper);
      return {
        status: uniqueFilterOptions(papers.map((item) => item.status), (value) => resourceStatusLabel[value] || value),
        layoutMode: uniqueFilterOptions(papers.map((item) => item.layoutMode), (value) => examLayoutLabel[value] || value),
        originalFileType: uniqueFilterOptions(papers.map((item) => item.originalFileType), (value) => originalFileTypeLabel[value] || value),
      };
    }
    if (typeFilter === "lecture") {
      const lectures = typedItems.map((item) => item.snapshot as Lecture);
      return {
        status: uniqueFilterOptions(lectures.map((item) => item.status), (value) => resourceStatusLabel[value] || value),
        versionType: uniqueFilterOptions(lectures.map((item) => item.versionType), (value) => lectureVersionLabel[value] || value),
        originalFileType: uniqueFilterOptions(lectures.map((item) => item.originalFileType), (value) => originalFileTypeLabel[value] || value),
      };
    }
    if (typeFilter === "courseware") {
      const coursewares = typedItems.map((item) => item.snapshot as Courseware);
      return {
        coursewareType: uniqueFilterOptions(
          coursewares.map((item) => item.type),
          (value) => coursewareTypeLabel[value as CoursewareType] || value,
        ),
        tag: uniqueFilterOptions(coursewares.flatMap((item) => item.tags || [])),
      };
    }
    if (typeFilter === "material") {
      const materials = typedItems.map((item) => item.snapshot as Material);
      return {
        materialType: uniqueFilterOptions(
          materials.map((item) => item.type),
          (value) => materialTypeLabel[value as MaterialType] || value,
        ),
        tag: uniqueFilterOptions(materials.flatMap((item) => item.tags || [])),
      };
    }
    return {};
  }, [items, typeFilter]);

  const displayedItems = useMemo(() => {
    let list = items;
    if (selectedSubject) list = list.filter((item) => item.subject === selectedSubject);
    if (typeFilter === "album") list = list.filter((item) => Boolean(item.donationAlbum));
    else if (typeFilter !== "all") list = list.filter((item) => item.resourceType === typeFilter);
    if (keyword.trim()) {
      const term = keyword.trim().toLowerCase();
      list = list.filter((item) =>
        item.title.toLowerCase().includes(term)
        || item.description?.toLowerCase().includes(term)
        || item.content?.toLowerCase().includes(term)
        || item.donationAlbum?.name.toLowerCase().includes(term),
      );
    }
    if (filters.grade) list = list.filter((item) => item.grade === filters.grade);
    if (filters.schoolYear) list = list.filter((item) => item.schoolYear === filters.schoolYear);
    if (filters.semester) list = list.filter((item) => item.semester === filters.semester);
    if (typeFilter === "question") {
      list = list.filter((item) => {
        const question = item.snapshot as Question;
        return (!filters.questionType || question.type === filters.questionType)
          && (!filters.difficulty || String(question.difficulty) === filters.difficulty)
          && (!filters.recommendation || String(question.recommendation) === filters.recommendation)
          && (!filters.category || question.category === filters.category)
          && (!filters.sourceType || question.sourceType === filters.sourceType);
      });
    }
    if (typeFilter === "examPaper") {
      list = list.filter((item) => {
        const paper = item.snapshot as ExamPaper;
        return (!filters.status || paper.status === filters.status)
          && (!filters.layoutMode || paper.layoutMode === filters.layoutMode)
          && (!filters.originalFileType || paper.originalFileType === filters.originalFileType);
      });
    }
    if (typeFilter === "lecture") {
      list = list.filter((item) => {
        const lecture = item.snapshot as Lecture;
        return (!filters.status || lecture.status === filters.status)
          && (!filters.versionType || lecture.versionType === filters.versionType)
          && (!filters.originalFileType || lecture.originalFileType === filters.originalFileType);
      });
    }
    if (typeFilter === "courseware") {
      list = list.filter((item) => {
        const courseware = item.snapshot as Courseware;
        return (!filters.coursewareType || courseware.type === filters.coursewareType)
          && (!filters.tag || courseware.tags.includes(filters.tag));
      });
    }
    if (typeFilter === "material") {
      list = list.filter((item) => {
        const material = item.snapshot as Material;
        return (!filters.materialType || material.type === filters.materialType)
          && (!filters.tag || material.tags.includes(filters.tag));
      });
    }
    if (checkedChapters.length > 0) {
      list = list.filter((item) => chapterLogic === "and"
        ? checkedChapters.every((id) => item.chapterIds.includes(id))
        : checkedChapters.some((id) => item.chapterIds.includes(id)));
    }
    if (checkedKnowledge.length > 0) {
      list = list.filter((item) => knowledgeLogic === "and"
        ? checkedKnowledge.every((id) => item.knowledgePointIds.includes(id))
        : checkedKnowledge.some((id) => item.knowledgePointIds.includes(id)));
    }
    const sorted = [...list];
    if (sortKey === "layout") sorted.sort((a, b) => a.subject.localeCompare(b.subject, "zh-CN") || a.order - b.order || b.createdAt.localeCompare(a.createdAt));
    if (sortKey === "updated") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sortKey === "created") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sortKey === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    return sorted;
  }, [items, selectedSubject, typeFilter, keyword, filters, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, sortKey]);

  const platformAlbumGroups = useMemo<PlatformAlbumGroup[]>(() => {
    const grouped = new Map<string, PlatformAlbumGroup>();
    for (const item of displayedItems) {
      if (!item.donationAlbum) continue;
      const key = `${item.subject}:${item.donationAlbum.id}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        grouped.set(key, {
          key,
          subject: item.subject,
          album: item.donationAlbum,
          items: [item],
        });
      }
    }
    return [...grouped.values()]
      .map((group) => ({ ...group, items: [...group.items].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-CN")) }))
      .sort((a, b) => a.subject.localeCompare(b.subject, "zh-CN") || a.album.name.localeCompare(b.album.name, "zh-CN"));
  }, [displayedItems]);

  const updateFilter = (key: keyof PlatformResourceFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleTypeFilterChange = (nextType: ResourceTypeFilter) => {
    setTypeFilter(nextType);
    setFilters((current) => ({
      ...emptyFilters,
      grade: current.grade,
      schoolYear: current.schoolYear,
      semester: current.semester,
    }));
  };

  const hasActiveFilters = Object.values(filters).some(Boolean)
    || checkedChapters.length > 0
    || checkedKnowledge.length > 0;

  const clearAllFilters = () => {
    setFilters(emptyFilters);
    setCheckedChapters([]);
    setCheckedKnowledge([]);
  };

  const saveToMyResources = async (
    item: PlatformResourceItem,
    decision?: PlatformSaveDecision,
  ) => {
    if (!teacher) return;
    setAddingIds((current) => new Set(current).add(item.shareId));
    try {
      const result = await donationService.saveAsOwnResource(item.shareId, teacher.id, schoolId, decision);
      setSavedIds((current) => new Set(current).add(item.shareId));
      setSaveConflict(null);
      toast.success(result.merged ? "已合并到我的题目" : "副本已创建", item.title);
    } catch (error: any) {
      toast.error("创建副本失败", error?.message);
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(item.shareId);
        return next;
      });
    }
  };

  const handleAddToMyResources = async (item: PlatformResourceItem) => {
    if (!teacher) return;
    if (ownContributionIds.has(item.shareId)) {
      toast.warning("本人捐赠或参与合并的平台资源不能创建副本");
      return;
    }
    setAddingIds((current) => new Set(current).add(item.shareId));
    try {
      const check = await donationService.checkSaveAsOwnResource(item.shareId, teacher.id, schoolId);
      if (!check.canSave) {
        if (check.alreadySaved) setSavedIds((current) => new Set(current).add(item.shareId));
        toast.warning(check.reason || "该平台资源不能创建副本");
        return;
      }
      if (!check.conflict) {
        await saveToMyResources(item);
        return;
      }
      setSaveConflict({
        item,
        check,
        decision: {
          action: "new",
          targetResourceId: check.conflict.targetResourceId,
          fields: {
            stem: "target",
            answer: "target",
            analysis: "target",
            summary: "target",
          },
        },
      });
    } catch (error: any) {
      toast.error("查重失败", error?.message);
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(item.shareId);
        return next;
      });
    }
  };

  const openEdit = useCallback((item: PlatformResourceItem, correctionId?: string | null) => {
    const difficulty = item.resourceType === "question"
      ? String(difficultyLabelText.indexOf(item.meta.find((meta) => meta.label === "难度")?.value || ""))
      : "";
    const recommendation = item.resourceType === "question"
      ? item.meta.find((meta) => meta.label === "推荐")?.value.replace(/\D/g, "") || ""
      : "";
    setEditForm({
      title: item.title,
      description: item.description || "",
      grade: item.grade || "",
      schoolYear: item.schoolYear || "",
      semester: item.semester || "上学期",
      originalFileName: item.originalFileName || "",
      difficulty,
      recommendation,
    });
    setActiveCorrectionId(correctionId || null);
    setEditItem(item);
  }, []);

  const closeEdit = useCallback(() => {
    setEditItem(null);
    setActiveCorrectionId(null);
    setFormulaEditorOpen(false);
    if (searchParams.has("edit") || searchParams.has("correction")) {
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      next.delete("correction");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (loading || editItem) return;
    const donationId = searchParams.get("edit");
    if (!donationId) return;
    const item = items.find((candidate) => candidate.shareId === donationId);
    if (item) openEdit(item, searchParams.get("correction"));
  }, [editItem, items, loading, openEdit, searchParams]);

  const openCorrection = (item: PlatformResourceItem) => {
    setCorrectionItem(item);
    setCorrectionMessage("");
    setCorrectionImages([]);
  };

  const closeCorrection = () => {
    setCorrectionItem(null);
    setCorrectionMessage("");
    setCorrectionImages([]);
  };

  const submitCorrection = async () => {
    if (!teacher || !correctionItem) return;
    if (!correctionMessage.trim() && correctionImages.length === 0) {
      toast.warning("请填写纠错说明或上传图片");
      return;
    }
    setSubmittingCorrection(true);
    try {
      const uploaded = await Promise.all(correctionImages.map((file) => uploadFile(file)));
      const correction = await shareService.createDonationCorrection(teacher.id, {
        donationId: correctionItem.shareId,
        message: correctionMessage,
        attachments: uploaded.map((file) => ({
          id: file.id,
          name: file.originalName,
          url: file.url,
          mimeType: file.mimeType,
          size: file.size,
        })),
      });
      setCorrections((current) => [correction, ...current]);
      toast.success("纠错信息已提交", "已加入资源捐赠者的待办事项");
      closeCorrection();
    } catch (error: any) {
      toast.error("提交纠错失败", error?.message);
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const pendingEditCorrections = editItem
    ? corrections.filter((correction) =>
      correction.donationId === editItem.shareId && correction.status === "pending",
    )
    : [];

  const saveEdit = async () => {
    if (!teacher || !editItem) return;
    setSavingEdit(true);
    try {
      await shareService.updateDonationResource(teacher.id, editItem.shareId, {
        title: editForm.title,
        description: editForm.description,
        grade: editForm.grade,
        schoolYear: editForm.schoolYear,
        semester: editForm.semester,
        originalFileName: editForm.originalFileName,
        difficulty: editForm.difficulty ? Number(editForm.difficulty) as 1 | 2 | 3 | 4 | 5 : undefined,
        recommendation: editForm.recommendation ? Number(editForm.recommendation) as 1 | 2 | 3 | 4 | 5 : undefined,
      });
      const activeCorrection = pendingEditCorrections.find((correction) => correction.id === activeCorrectionId);
      if (activeCorrection) {
        try {
          await shareService.resolveDonationCorrection(teacher.id, activeCorrection.id);
        } catch (error: any) {
          toast.warning("资源已更新，但纠错待办未完成", error?.message);
        }
      }
      toast.success("平台资源已更新");
      closeEdit();
      await loadAll();
    } catch (error: any) {
      toast.error("更新失败", error?.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const movePlatformItem = async (item: PlatformResourceItem, direction: -1 | 1) => {
    if (!teacher) return;
    const subjectItems = items
      .filter((candidate) => candidate.subject === item.subject)
      .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
    const index = subjectItems.findIndex((candidate) => candidate.shareId === item.shareId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= subjectItems.length) return;
    [subjectItems[index], subjectItems[targetIndex]] = [subjectItems[targetIndex], subjectItems[index]];
    setReorderingId(item.shareId);
    try {
      await shareService.updateDonationOrder(teacher.id, item.subject, subjectItems.map((candidate) => candidate.shareId));
      toast.success("平台资源布局已更新");
      await loadAll();
    } catch (error: any) {
      toast.error("调整布局失败", error?.message);
    } finally {
      setReorderingId(null);
    }
  };

  const deletePlatformItem = async (item: PlatformResourceItem) => {
    if (!teacher || !platformAdmin) return;
    if (!window.confirm(`确认删除平台资源“${item.title}”？该操作会同时移除其合并贡献记录。`)) return;
    setDeletingId(item.shareId);
    try {
      await shareService.deleteDonationResource(teacher.id, item.shareId);
      toast.success("平台资源已删除");
      await loadAll();
    } catch (error: any) {
      toast.error("删除失败", error?.message);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSubjectModerator = async (contributor: DonationContributor) => {
    if (!teacher || !platformAdmin) return;
    const subject = moderatorSubject || selectedSubject || subjectOptions[0];
    if (!subject) return;
    const enabled = !contributor.moderatorSubjects.includes(subject);
    setUpdatingModeratorId(contributor.teacherId);
    try {
      const updated = await shareService.setSubjectModerator(teacher.id, subject, contributor.teacherId, enabled);
      setContributors(updated);
      toast.success(enabled ? "已设为学科版主" : "已撤销学科版主", `${contributor.nickname} · ${subject}`);
    } catch (error: any) {
      toast.error("版主管理失败", error?.message);
    } finally {
      setUpdatingModeratorId(null);
    }
  };

  const updateSaveDecision = (updater: (decision: PlatformSaveDecision) => PlatformSaveDecision) => {
    setSaveConflict((current) => current ? { ...current, decision: updater(current.decision) } : current);
  };

  const saveQuestionConflict = saveConflict?.check.conflict;

  const previewResource = useMemo<PlatformPreviewResource | null>(() => {
    if (!previewItem) return null;
    if (previewItem.resourceType === "examPaper") {
      return {
        resourceType: "examPaper",
        title: previewItem.title,
        snapshot: previewItem.snapshot as ExamPaper,
      };
    }
    if (previewItem.resourceType === "lecture") {
      return {
        resourceType: "lecture",
        title: previewItem.title,
        snapshot: previewItem.snapshot as Lecture,
      };
    }
    if (previewItem.resourceType === "courseware") {
      return {
        resourceType: "courseware",
        title: previewItem.title,
        snapshot: previewItem.snapshot as Courseware,
      };
    }
    return null;
  }, [previewItem]);

  const canPreviewItem = (item: PlatformResourceItem) => (
    item.resourceType === "examPaper"
    || item.resourceType === "lecture"
    || (item.resourceType === "courseware" && Boolean(item.donationAlbum))
  );

  const toggleQuestionDetails = (shareId: string) => {
    setExpandedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(shareId)) next.delete(shareId);
      else next.add(shareId);
      return next;
    });
  };

  const togglePlatformAlbum = (key: string) => {
    setExpandedAlbumKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renamePlatformAlbum = async (group: PlatformAlbumGroup) => {
    if (!teacher) return;
    const nextName = window.prompt("新的专辑名称", group.album.name)?.trim();
    if (!nextName || nextName === group.album.name) return;
    setAlbumWorkingKey(group.key);
    try {
      await shareService.renameDonationAlbum(teacher.id, group.subject, group.album.id, nextName);
      toast.success("平台专辑已重命名");
      await loadAll();
    } catch (error: any) {
      toast.error("专辑重命名失败", error?.message);
    } finally {
      setAlbumWorkingKey(null);
    }
  };

  const mergePlatformAlbum = async (group: PlatformAlbumGroup, targetAlbumId: string) => {
    if (!teacher || !targetAlbumId) return;
    const target = platformAlbumGroups.find((candidate) =>
      candidate.subject === group.subject && candidate.album.id === targetAlbumId,
    );
    if (!target || !window.confirm(`确认将“${group.album.name}”合并到“${target.album.name}”？`)) return;
    setAlbumWorkingKey(group.key);
    try {
      await shareService.mergeDonationAlbums(teacher.id, group.subject, group.album.id, targetAlbumId);
      toast.success("平台专辑已合并");
      await loadAll();
    } catch (error: any) {
      toast.error("专辑合并失败", error?.message);
    } finally {
      setAlbumWorkingKey(null);
    }
  };

  const setPlatformItemAlbum = async (group: PlatformAlbumGroup, donationId: string, albumId: string | null) => {
    if (!teacher) return;
    setAlbumWorkingKey(group.key);
    try {
      await shareService.setDonationAlbum(teacher.id, group.subject, donationId, albumId);
      toast.success(albumId ? "文档已加入专辑" : "文档已移出专辑");
      await loadAll();
    } catch (error: any) {
      toast.error("专辑文档管理失败", error?.message);
    } finally {
      setAlbumWorkingKey(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="平台资源"
        description="平台资源按学科独立维护；创建副本后会自动同步章节和知识点目录"
        icon={<Cloud className="w-5 h-5" />}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gold-600" />
            <div>
              <div className="text-sm font-medium text-ink-800">
                {platformAdmin ? "平台超级管理员视图" : `${teacherSubject || "未设置"}学科资源`}
              </div>
              <div className="text-xs text-ink-400">
                {platformAdmin
                  ? "可查看全部学科、管理版主并删除平台资源"
                  : privileges?.moderatedSubjects.length
                    ? `可维护：${privileges.moderatedSubjects.join("、")}`
                    : "仅展示当前学科及获授权管理的学科"}
              </div>
            </div>
          </div>
          {platformAdmin && (
            <label className="ml-auto flex items-center gap-2 text-xs text-ink-500">
              查看学科
              <select
                aria-label="平台学科筛选"
                value={selectedSubject}
                onChange={(event) => setSelectedSubject(event.target.value)}
                className="input-base min-w-36 py-1.5 text-xs"
              >
                <option value="">全部学科</option>
                {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </select>
            </label>
          )}
        </div>
      </Card>

      {platformAdmin && subjectOptions.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-ink-500" />
              <div>
                <div className="text-sm font-medium text-ink-800">捐赠用户与学科版主</div>
                <div className="text-xs text-ink-400">超级管理员可从该学科捐赠者中任命版主</div>
              </div>
            </div>
            <div className="ml-auto w-44">
              <Select
                aria-label="版主管理学科"
                value={moderatorSubject || selectedSubject || subjectOptions[0]}
                onChange={(event) => setModeratorSubject(event.target.value)}
                options={subjectOptions.map((subject) => ({ value: subject, label: subject }))}
              />
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {managedContributors.map((contributor) => {
              const subject = moderatorSubject || selectedSubject || subjectOptions[0];
              const moderator = contributor.moderatorSubjects.includes(subject);
              return (
                <div key={contributor.teacherId} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-mist/30 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-800">{contributor.nickname}</div>
                    <div className="text-xs text-ink-400">累计捐赠 {contributor.donationCount} 项 · 第 {contributor.rank} 名</div>
                  </div>
                  <Button
                    variant={moderator ? "ink" : "outline"}
                    size="sm"
                    loading={updatingModeratorId === contributor.teacherId}
                    onClick={() => toggleSubjectModerator(contributor)}
                  >
                    {moderator ? "撤销版主" : "设为版主"}
                  </Button>
                </div>
              );
            })}
          </div>
          {managedContributors.length === 0 && <div className="py-4 text-center text-xs text-ink-400">该学科暂无捐赠用户</div>}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(210px,240px)_minmax(0,1fr)]">
        <div>
          <Card className="p-3 sticky top-4">
            <div className="flex gap-1 mb-3 p-1 bg-mist rounded-md">
              <button
                onClick={() => setLeftTab("chapter")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "chapter" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                章节目录
              </button>
              <button
                onClick={() => setLeftTab("knowledge")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                  leftTab === "knowledge" ? "bg-paper text-teal-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
                )}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                知识点
              </button>
            </div>
            {leftTab === "chapter" ? (
              chapterTree ? (
                <SearchableTree
                  data={chapterTree}
                  title="平台章节目录"
                  accent="gold"
                  checkable
                  checkedIds={checkedChapters}
                  onCheck={setCheckedChapters}
                  searchPlaceholder="搜索章节..."
                  showLogicSelector
                  logic={chapterLogic}
                  onLogicChange={setChapterLogic}
                />
              ) : <div className="py-10 flex justify-center"><Spinner size={20} /></div>
            ) : knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="平台知识点目录"
                accent="teal"
                checkable
                checkedIds={checkedKnowledge}
                onCheck={setCheckedKnowledge}
                searchPlaceholder="搜索知识点..."
                showLogicSelector
                logic={knowledgeLogic}
                onLogicChange={setKnowledgeLogic}
              />
            ) : <div className="py-10 flex justify-center"><Spinner size={20} /></div>}
          </Card>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索平台资源..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-paper focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-ink-400" />
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSortKey(option.value)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all flex items-center gap-1",
                    sortKey === option.value
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {typeFilterConfig.map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  key={filter.key}
                  onClick={() => handleTypeFilterChange(filter.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5",
                    typeFilter === filter.key
                      ? "bg-ink-900 border-ink-900 text-gold-400"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {filter.label}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-ink-400">
              共 {typeFilter === "album" ? platformAlbumGroups.length : displayedItems.length} 项
            </span>
          </div>

          <div className="mb-4 rounded-lg border border-ink-100 bg-mist/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CompactFilterSelect
                label="年级"
                value={filters.grade}
                options={commonFilterOptions.grade}
                onChange={(value) => updateFilter("grade", value)}
              />
              <CompactFilterSelect
                label="学年"
                value={filters.schoolYear}
                options={commonFilterOptions.schoolYear}
                onChange={(value) => updateFilter("schoolYear", value)}
              />
              <CompactFilterSelect
                label="学期"
                value={filters.semester}
                options={commonFilterOptions.semester}
                onChange={(value) => updateFilter("semester", value)}
              />

              {typeFilter === "question" && (
                <>
                  <CompactFilterSelect label="题型" value={filters.questionType} options={typeSpecificFilterOptions.questionType || []} onChange={(value) => updateFilter("questionType", value)} />
                  <CompactFilterSelect label="难度" value={filters.difficulty} options={typeSpecificFilterOptions.difficulty || []} onChange={(value) => updateFilter("difficulty", value)} />
                  <CompactFilterSelect label="推荐" value={filters.recommendation} options={typeSpecificFilterOptions.recommendation || []} onChange={(value) => updateFilter("recommendation", value)} />
                  <CompactFilterSelect label="题类" value={filters.category} options={typeSpecificFilterOptions.category || []} onChange={(value) => updateFilter("category", value)} />
                  <CompactFilterSelect label="来源" value={filters.sourceType} options={typeSpecificFilterOptions.sourceType || []} onChange={(value) => updateFilter("sourceType", value)} />
                </>
              )}
              {typeFilter === "examPaper" && (
                <>
                  <CompactFilterSelect label="状态" value={filters.status} options={typeSpecificFilterOptions.status || []} onChange={(value) => updateFilter("status", value)} />
                  <CompactFilterSelect label="编排" value={filters.layoutMode} options={typeSpecificFilterOptions.layoutMode || []} onChange={(value) => updateFilter("layoutMode", value)} />
                  <CompactFilterSelect label="原稿" value={filters.originalFileType} options={typeSpecificFilterOptions.originalFileType || []} onChange={(value) => updateFilter("originalFileType", value)} />
                </>
              )}
              {typeFilter === "lecture" && (
                <>
                  <CompactFilterSelect label="状态" value={filters.status} options={typeSpecificFilterOptions.status || []} onChange={(value) => updateFilter("status", value)} />
                  <CompactFilterSelect label="版本" value={filters.versionType} options={typeSpecificFilterOptions.versionType || []} onChange={(value) => updateFilter("versionType", value)} />
                  <CompactFilterSelect label="原稿" value={filters.originalFileType} options={typeSpecificFilterOptions.originalFileType || []} onChange={(value) => updateFilter("originalFileType", value)} />
                </>
              )}
              {typeFilter === "courseware" && (
                <>
                  <CompactFilterSelect label="课件类型" value={filters.coursewareType} options={typeSpecificFilterOptions.coursewareType || []} onChange={(value) => updateFilter("coursewareType", value)} />
                  <CompactFilterSelect label="标签" value={filters.tag} options={typeSpecificFilterOptions.tag || []} onChange={(value) => updateFilter("tag", value)} />
                </>
              )}
              {typeFilter === "material" && (
                <>
                  <CompactFilterSelect label="素材类型" value={filters.materialType} options={typeSpecificFilterOptions.materialType || []} onChange={(value) => updateFilter("materialType", value)} />
                  <CompactFilterSelect label="标签" value={filters.tag} options={typeSpecificFilterOptions.tag || []} onChange={(value) => updateFilter("tag", value)} />
                </>
              )}

              {typeFilter === "all" && (
                <span className="text-xs text-ink-400">选择具体资源类型后可使用对应属性筛选</span>
              )}
              {typeFilter === "album" && (
                <span className="text-xs text-ink-400">专辑默认收拢；展开后可查看文档，学科版主可管理专辑内容</span>
              )}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-auto text-xs text-ink-500 underline decoration-ink-300 underline-offset-2 hover:text-ink-800"
                >
                  清空筛选
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Spinner size={24} /></div>
          ) : typeFilter === "album" ? (
            platformAlbumGroups.length === 0 ? (
              <EmptyState
                icon={<Folder className="w-10 h-10 text-ink-200" />}
                title="暂无平台专辑"
                description="教师捐赠完整专辑后会显示在这里"
              />
            ) : (
              <div className="space-y-3">
                {platformAlbumGroups.map((group) => {
                  const expanded = expandedAlbumKeys.has(group.key);
                  const canManageAlbum = platformAdmin || Boolean(privileges?.moderatedSubjects.includes(group.subject));
                  const targetAlbums = [...new Map(items
                    .filter((item) =>
                      item.subject === group.subject
                      && item.donationAlbum
                      && item.donationAlbum.id !== group.album.id
                      && item.donationAlbum.resourceType === group.album.resourceType,
                    )
                    .map((item) => [item.donationAlbum!.id, item.donationAlbum!] as const))
                    .values()]
                    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
                  const availableDocuments = items
                    .filter((item) =>
                      item.subject === group.subject
                      && item.resourceType === group.album.resourceType
                      && !item.donationAlbum,
                    )
                    .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
                  return (
                    <div
                      key={group.key}
                      role="group"
                      aria-label={`平台专辑：${group.album.name}`}
                      className="overflow-hidden rounded-lg border border-amber-200 bg-paper"
                    >
                      <div className="flex flex-wrap items-center gap-2 bg-amber-50/70 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => togglePlatformAlbum(group.key)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "收拢" : "展开"}专辑：${group.album.name}`}
                          className="rounded p-0.5 text-amber-700 hover:bg-amber-100"
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                        <Folder className="h-4 w-4 text-amber-700" />
                        <button
                          type="button"
                          onClick={() => togglePlatformAlbum(group.key)}
                          className="font-semibold text-ink-800 hover:text-amber-800"
                        >
                          {group.album.name}
                        </button>
                        <span className="text-xs text-ink-500">{group.album.libraryLabel} · {group.items.length} 个文档</span>
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">{group.subject}</span>
                        {canManageAlbum && (
                          <div className="ml-auto flex flex-wrap items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={albumWorkingKey !== null}
                              onClick={() => void renamePlatformAlbum(group)}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              重命名
                            </Button>
                            <select
                              aria-label={`合并专辑：${group.album.name}`}
                              value=""
                              disabled={targetAlbums.length === 0 || albumWorkingKey !== null}
                              onChange={(event) => void mergePlatformAlbum(group, event.target.value)}
                              className="rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 disabled:opacity-50"
                            >
                              <option value="">合并到…</option>
                              {targetAlbums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
                            </select>
                            <select
                              aria-label={`添加文档到专辑：${group.album.name}`}
                              value=""
                              disabled={availableDocuments.length === 0 || albumWorkingKey !== null}
                              onChange={(event) => {
                                if (event.target.value) void setPlatformItemAlbum(group, event.target.value, group.album.id);
                              }}
                              className="rounded-md border border-ink-200 bg-paper px-2 py-1.5 text-xs text-ink-700 disabled:opacity-50"
                            >
                              <option value="">添加文档…</option>
                              {availableDocuments.map((item) => <option key={item.shareId} value={item.shareId}>{item.title}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      {expanded && (
                        <div className="divide-y divide-ink-100">
                          {group.items.map((item) => {
                            const ResourceIcon = resourceTypeIcon[item.resourceType];
                            return (
                              <div key={item.shareId} className="flex items-center gap-2 px-4 py-2.5">
                                <ResourceIcon
                                  aria-label={`${resourceTypeLabel[item.resourceType]}标识`}
                                  className="h-4 w-4 flex-none text-ink-500"
                                />
                                {canPreviewItem(item) ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewItem(item)}
                                    className="min-w-0 flex-1 truncate text-left text-sm text-ink-800 hover:text-gold-700 hover:underline"
                                  >
                                    {item.title}
                                  </button>
                                ) : (
                                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{item.title}</span>
                                )}
                                <span className="text-xs text-ink-400">{timeAgo(item.updatedAt)}</span>
                                {canManageAlbum && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={albumWorkingKey !== null}
                                    onClick={() => void setPlatformItemAlbum(group, item.shareId, null)}
                                  >
                                    移出专辑
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : displayedItems.length === 0 ? (
            <EmptyState
              icon={<Cloud className="w-10 h-10 text-ink-200" />}
              title="暂无平台资源"
              description="教师捐赠的资源将显示在这里"
            />
          ) : (
            <div className="space-y-3">
              {displayedItems.map((item) => {
                const contributor = contributorMap.get(item.fromTeacherId);
                const canManageSubject = platformAdmin || Boolean(privileges?.moderatedSubjects.includes(item.subject));
                const canEdit = item.fromTeacherId === teacher?.id || canManageSubject;
                const subjectItems = items
                  .filter((candidate) => candidate.subject === item.subject)
                  .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt));
                const subjectIndex = subjectItems.findIndex((candidate) => candidate.shareId === item.shareId);
                const chapterNames = resolveNames(chapterTree, item.chapterIds);
                const knowledgeNames = resolveNames(knowledgeTree, item.knowledgePointIds);
                const ResourceIcon = resourceTypeIcon[item.resourceType];
                return (
                  <div key={item.shareId} className="card-base p-4 hover:shadow-cardHover transition-all group">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="tag-gold">{resourceTypeLabel[item.resourceType]}</span>
                      {item.donationAlbum && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          专辑：{item.donationAlbum.name} · {item.donationAlbum.libraryLabel}
                        </span>
                      )}
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-700">{item.subject}</span>
                      <span className="flex items-center gap-1 text-xs text-ink-500">
                        捐赠者：{contributor?.nickname || "匿名用户"}
                        {contributor?.isTopContributor && <Crown className="w-3.5 h-3.5 text-gold-500" aria-label="贡献榜前十" />}
                      </span>
                      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        {canManageSubject && (
                          <div className="flex items-center rounded-md border border-ink-200 bg-paper">
                            <button
                              type="button"
                              aria-label={`上移${item.title}`}
                              title="在本学科平台布局中上移"
                              disabled={subjectIndex <= 0 || reorderingId !== null}
                              onClick={() => movePlatformItem(item, -1)}
                              className="p-1.5 text-ink-500 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`下移${item.title}`}
                              title="在本学科平台布局中下移"
                              disabled={subjectIndex < 0 || subjectIndex >= subjectItems.length - 1 || reorderingId !== null}
                              onClick={() => movePlatformItem(item, 1)}
                              className="border-l border-ink-200 p-1.5 text-ink-500 hover:bg-mist disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        <Button variant="outline" size="sm" onClick={() => openCorrection(item)}>
                          <MessageSquareWarning className="w-3.5 h-3.5" />
                          纠错
                        </Button>
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                            <Edit3 className="w-3.5 h-3.5" />
                            修改属性
                          </Button>
                        )}
                        {platformAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            loading={deletingId === item.shareId}
                            onClick={() => deletePlatformItem(item)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </Button>
                        )}
                        <Button
                          variant="gold"
                          size="sm"
                          loading={addingIds.has(item.shareId)}
                          disabled={ownContributionIds.has(item.shareId) || savedIds.has(item.shareId)}
                          onClick={() => handleAddToMyResources(item)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {ownContributionIds.has(item.shareId)
                            ? "本人捐赠"
                            : savedIds.has(item.shareId)
                              ? "已创建"
                              : "创建副本"}
                        </Button>
                      </div>
                    </div>
                    {item.question ? (
                      <PlatformQuestionContent
                        question={item.question}
                        expanded={expandedQuestionIds.has(item.shareId)}
                        onToggle={() => toggleQuestionDetails(item.shareId)}
                      />
                    ) : (
                      <>
                        <div className="mb-1 flex items-start gap-2 font-medium text-ink-900">
                          <ResourceIcon
                            aria-label={`${resourceTypeLabel[item.resourceType]}标识`}
                            className="mt-0.5 h-4 w-4 flex-none text-ink-500"
                          />
                          {canPreviewItem(item) ? (
                            <button
                              type="button"
                              onClick={() => setPreviewItem(item)}
                              className="line-clamp-2 text-left hover:text-gold-700 hover:underline"
                            >
                              {item.title}
                            </button>
                          ) : (
                            <span className="line-clamp-2">{item.title}</span>
                          )}
                        </div>
                        {item.description && <div className="mb-2 text-xs text-ink-500 line-clamp-2">{item.description}</div>}
                        {item.content && (
                          <div className="mb-2 rounded bg-mist/40 p-2 text-xs leading-relaxed text-ink-600 line-clamp-2">
                            {item.content}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
                      {item.meta.map((meta) => (
                        <span key={meta.label}><span className="text-ink-300">{meta.label}：</span><span className="text-ink-600">{meta.value}</span></span>
                      ))}
                      {chapterNames && <span><span className="text-ink-300">章节：</span><span className="text-ink-600">{chapterNames}</span></span>}
                      {knowledgeNames && <span><span className="text-ink-300">知识点：</span><span className="text-ink-600">{knowledgeNames}</span></span>}
                      {item.originalFileName && <span><span className="text-ink-300">文件名：</span><span className="text-ink-600">{item.originalFileName}</span></span>}
                      <span className="ml-auto text-ink-300">{timeAgo(item.updatedAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <PlatformResourcePreviewModal
        resource={previewResource}
        donorName={previewItem ? contributorMap.get(previewItem.fromTeacherId)?.nickname || "匿名用户" : undefined}
        subject={previewItem?.subject}
        albumName={previewItem?.donationAlbum?.name}
        canSave={Boolean(previewItem && !ownContributionIds.has(previewItem.shareId))}
        saving={Boolean(previewItem && addingIds.has(previewItem.shareId))}
        saved={Boolean(previewItem && savedIds.has(previewItem.shareId))}
        onSave={() => {
          if (previewItem) void handleAddToMyResources(previewItem);
        }}
        onBack={() => setPreviewItem(null)}
      />

      <Modal
        open={Boolean(saveConflict && saveQuestionConflict)}
        onClose={() => setSaveConflict(null)}
        title="创建题目副本查重"
        description="平台题目与我的题目相似度超过 80%。题干只能二选一，答案、解析、总结可复选并保留为第二项。"
        size="full"
        footer={saveConflict ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveConflict(null)}>取消</Button>
            <Button
              variant="gold"
              loading={addingIds.has(saveConflict.item.shareId)}
              onClick={() => saveToMyResources(saveConflict.item, saveConflict.decision)}
            >
              确认创建副本
            </Button>
          </div>
        ) : null}
      >
        {saveConflict && saveQuestionConflict && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <div className="font-medium text-ink-900">相似题目比较</div>
                <div className="text-xs text-ink-500 mt-1">
                  相似度 {(saveQuestionConflict.similarity * 100).toFixed(1)}%
                </div>
              </div>
              <div className="flex rounded-md border border-ink-200 overflow-hidden">
                {([
                  { value: "new", label: "作为新题新增" },
                  { value: "merge", label: "合并到我的题目" },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    onClick={() => updateSaveDecision((current) => ({ ...current, action: option.value }))}
                    className={cn(
                      "px-3 py-1.5 text-xs transition-colors",
                      saveConflict.decision.action === option.value
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
              <div className="font-medium text-ink-600 px-2">平台题目</div>
              <div className="font-medium text-ink-600 px-2">我的题目</div>
              {([
                { key: "stem", label: "题干", source: saveQuestionConflict.sourceQuestion.stem, target: saveQuestionConflict.targetQuestion.stem },
                { key: "answer", label: "答案", source: saveQuestionConflict.sourceQuestion.answer, target: saveQuestionConflict.targetQuestion.answer },
                { key: "analysis", label: "解析", source: saveQuestionConflict.sourceQuestion.analysis, target: saveQuestionConflict.targetQuestion.analysis },
                { key: "summary", label: "总结", source: saveQuestionConflict.sourceQuestion.summary || "（无）", target: saveQuestionConflict.targetQuestion.summary || "（无）" },
              ] as const).map((field) => (
                <div key={field.key} className="contents">
                  <div className="font-medium text-ink-700 py-2">{field.label}</div>
                  <button
                    disabled={saveConflict.decision.action !== "merge"}
                    onClick={() => updateSaveDecision((current) => ({
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
                      saveConflict.decision.action === "merge" && ["source", "both"].includes(saveConflict.decision.fields[field.key])
                        ? "border-gold-400 bg-gold-50"
                        : "border-ink-100 bg-mist/40",
                      saveConflict.decision.action !== "merge" && "opacity-60 cursor-default",
                    )}
                  >
                    {field.source}
                  </button>
                  <button
                    disabled={saveConflict.decision.action !== "merge"}
                    onClick={() => updateSaveDecision((current) => ({
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
                      saveConflict.decision.action === "merge" && ["target", "both"].includes(saveConflict.decision.fields[field.key])
                        ? "border-gold-400 bg-gold-50"
                        : "border-ink-100 bg-mist/40",
                      saveConflict.decision.action !== "merge" && "opacity-60 cursor-default",
                    )}
                  >
                    {field.target}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Modal>

      <Modal
        open={Boolean(editItem)}
        onClose={closeEdit}
        title="修改平台资源属性"
        description="捐赠者、学科版主和平台超级管理员可以维护资源。通过纠错待办进入时，保存后会自动完成该待办。"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeEdit}>取消</Button>
            <Button variant="gold" loading={savingEdit} onClick={saveEdit}>保存修改</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          {pendingEditCorrections.length > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                待处理纠错信息（{pendingEditCorrections.length}）
              </div>
              {pendingEditCorrections.map((correction) => (
                <div
                  key={correction.id}
                  className={cn(
                    "rounded-md border bg-paper p-3 text-sm",
                    correction.id === activeCorrectionId ? "border-amber-400 ring-2 ring-amber-200" : "border-amber-100",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                    <span>{correction.reporterNickname} · {timeAgo(correction.createdAt)}</span>
                    {correction.id === activeCorrectionId && <span className="tag-red">当前待办</span>}
                  </div>
                  {correction.message && (
                    <div className="mt-2 whitespace-pre-wrap leading-6 text-ink-800">{correction.message}</div>
                  )}
                  {correction.attachments.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {correction.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-md border border-ink-100 bg-mist"
                        >
                          <img src={attachment.url} alt={attachment.name} className="h-32 w-full object-contain" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <label className="block text-sm text-ink-700">
            <span className="mb-1 flex items-center justify-between gap-2">
              <span>{editItem?.resourceType === "question" ? "题干" : "标题"}</span>
              {editItem?.resourceType === "question" && (
                <button
                  type="button"
                  onClick={() => setFormulaEditorOpen(true)}
                  className="flex items-center gap-1 text-xs text-gold-700 hover:text-gold-800"
                >
                  <Edit3 className="h-3 w-3" />
                  在线编辑器（支持公式）
                </button>
              )}
            </span>
            <textarea
              value={editForm.title}
              onChange={(event) => setEditForm((form) => ({ ...form, title: event.target.value }))}
              className="input-base min-h-20"
            />
          </label>
          {editItem?.resourceType === "question" && (
            <div className="rounded-md border border-ink-100 bg-mist/40 p-3">
              <div className="mb-2 text-xs text-ink-500">题干渲染预览</div>
              <MathHtml className="text-sm text-ink-900 whitespace-pre-wrap">
                {editForm.title || "（题干为空）"}
              </MathHtml>
            </div>
          )}
          {editItem?.resourceType !== "question" && (
            <>
              <label className="block text-sm text-ink-700">
                <span className="block mb-1">描述</span>
                <textarea
                  value={editForm.description}
                  onChange={(event) => setEditForm((form) => ({ ...form, description: event.target.value }))}
                  className="input-base min-h-20"
                />
              </label>
              {editItem?.originalFileName !== undefined && (
                <label className="block text-sm text-ink-700">
                  <span className="block mb-1">文件名</span>
                  <input value={editForm.originalFileName} onChange={(event) => setEditForm((form) => ({ ...form, originalFileName: event.target.value }))} className="input-base" />
                </label>
              )}
            </>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="年级"
              value={editForm.grade}
              options={includeCurrentOption(gradeOptions, editForm.grade)}
              onChange={(event) => setEditForm((form) => ({ ...form, grade: event.target.value }))}
            />
            <Select
              label="学年"
              value={editForm.schoolYear}
              options={includeCurrentOption(schoolYearOptions, editForm.schoolYear)}
              onChange={(event) => setEditForm((form) => ({ ...form, schoolYear: event.target.value }))}
            />
            <Select
              label="学期"
              value={editForm.semester}
              options={semesterOptions}
              onChange={(event) => setEditForm((form) => ({ ...form, semester: event.target.value as ResourceSemester }))}
            />
          </div>
          {editItem?.resourceType === "question" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-ink-700">
                <span className="block mb-1">难度（1-5）</span>
                <input type="number" min={1} max={5} value={editForm.difficulty} onChange={(event) => setEditForm((form) => ({ ...form, difficulty: event.target.value }))} className="input-base" />
              </label>
              <label className="block text-sm text-ink-700">
                <span className="block mb-1">推荐程度（1-5）</span>
                <input type="number" min={1} max={5} value={editForm.recommendation} onChange={(event) => setEditForm((form) => ({ ...form, recommendation: event.target.value }))} className="input-base" />
              </label>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(correctionItem)}
        onClose={closeCorrection}
        title="提交资源纠错"
        description={correctionItem ? `指出“${correctionItem.title}”中的错误，信息会进入捐赠者的待办事项。` : undefined}
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeCorrection} disabled={submittingCorrection}>取消</Button>
            <Button variant="gold" onClick={submitCorrection} loading={submittingCorrection}>
              <MessageSquareWarning className="h-4 w-4" />
              提交纠错
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <label className="block text-sm text-ink-700">
            <span className="mb-1 block">纠错说明</span>
            <textarea
              value={correctionMessage}
              onChange={(event) => setCorrectionMessage(event.target.value)}
              className="input-base min-h-32"
              maxLength={2000}
              placeholder="请说明错误位置、正确内容或修改建议。可只上传图片。"
            />
            <span className="mt-1 block text-right text-xs text-ink-400">{correctionMessage.length}/2000</span>
          </label>
          <label className="block cursor-pointer rounded-lg border-2 border-dashed border-ink-200 bg-mist/40 p-5 text-center hover:border-gold-300 hover:bg-gold-50/30">
            <input
              type="file"
              className="sr-only"
              accept="image/*"
              multiple
              onChange={(event) => setCorrectionImages(Array.from(event.target.files || []).slice(0, 4))}
            />
            <Images className="mx-auto h-8 w-8 text-ink-300" />
            <div className="mt-2 text-sm font-medium text-ink-800">
              {correctionImages.length > 0 ? `已选择 ${correctionImages.length} 张图片` : "上传纠错图片"}
            </div>
            <div className="mt-1 text-xs text-ink-500">最多 4 张，支持常见图片格式</div>
          </label>
          {correctionImages.length > 0 && (
            <div className="space-y-2">
              {correctionImages.map((file) => (
                <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-2 rounded-md border border-ink-100 px-3 py-2 text-sm">
                  <Images className="h-4 w-4 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate text-ink-700">{file.name}</span>
                  <span className="text-xs text-ink-400">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={formulaEditorOpen && editItem?.resourceType === "question"}
        onClose={() => setFormulaEditorOpen(false)}
        title="在线编辑题干"
        description="支持富文本和 LaTeX 公式，保存后会回填到平台资源修改表单。"
        size="lg"
        footer={null}
      >
        {formulaEditorOpen && editItem?.resourceType === "question" && (
          <WpsFormulaEditor
            initialHtml={editForm.title}
            onSave={(html) => {
              setEditForm((form) => ({ ...form, title: html }));
              setFormulaEditorOpen(false);
              toast.success("题干内容已应用");
            }}
            onCancel={() => setFormulaEditorOpen(false)}
          />
        )}
      </Modal>

    </div>
  );
}
