import { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  Lightbulb,
  Plus,
  Presentation,
  Search,
  Settings2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { shareService } from "@/services/share";
import { schoolService } from "@/services/school";
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
  DonationContributor,
  DonationPrivileges,
  ExamPaper,
  FilterLogic,
  Lecture,
  Material,
  MaterialType,
  PlatformResourceSetting,
  PlatformResourceSettingType,
  Question,
  QuestionType,
  ShareRecord,
  ShareableResourceType,
  TreeNode,
  ResourceSemester,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";

type ResourceTypeFilter = "all" | ShareableResourceType;
type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "title";
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
  chapterIds: string[];
  knowledgePointIds: string[];
  createdAt: string;
  updatedAt: string;
  meta: { label: string; value: string }[];
}

const typeFilterConfig: { key: ResourceTypeFilter; label: string; icon: typeof FileText }[] = [
  { key: "all", label: "全部", icon: FileText },
  { key: "question", label: "题库", icon: FileQuestion },
  { key: "examPaper", label: "试卷", icon: FileSpreadsheet },
  { key: "lecture", label: "讲义", icon: FileText },
  { key: "courseware", label: "课件", icon: Presentation },
  { key: "material", label: "素材", icon: FileBox },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
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

const coursewareTypeLabel: Record<CoursewareType, string> = {
  ppt: "PPT", pdf: "PDF", video: "视频", image: "图片", other: "其他",
};

const materialTypeLabel: Record<MaterialType, string> = {
  text: "文本", image: "图片", audio: "音频", video: "视频", link: "链接", file: "文件", knowledgeBlock: "知识块",
};

const questionTypeLabel: Record<QuestionType, string> = {
  single: "单选", multiple: "多选", judge: "判断", short: "填空", essay: "解答",
};

const difficultyLabelText = ["", "简单", "较易", "中等", "较难", "困难"];

const settingLabels: Record<PlatformResourceSettingType, string> = {
  grade: "年级",
  schoolYear: "学年",
  source: "来源",
  questionType: "题型",
  category: "题类",
};

function snapshotToItem(share: ShareRecord): PlatformResourceItem | null {
  const snapshot = share.resourceSnapshot as ShareableResource | undefined;
  if (!snapshot) return null;
  const base = {
    shareId: share.id,
    resourceType: share.resourceType,
    fromTeacherId: share.fromTeacherId,
    fromSchoolId: share.fromSchoolId,
    createdAt: share.createdAt,
    updatedAt: snapshot.updatedAt || share.createdAt,
    grade: snapshot.grade,
    schoolYear: snapshot.schoolYear,
    semester: snapshot.semester || "上学期",
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
        meta: [
          { label: "题型", value: questionTypeLabel[question.type] },
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
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [items, setItems] = useState<PlatformResourceItem[]>([]);
  const [contributors, setContributors] = useState<DonationContributor[]>([]);
  const [privileges, setPrivileges] = useState<DonationPrivileges | null>(null);
  const [settings, setSettings] = useState<PlatformResourceSetting[]>([]);
  const [schoolNameMap, setSchoolNameMap] = useState<Map<string, string>>(new Map());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<PlatformResourceItem | null>(null);
  const [editForm, setEditForm] = useState({
    title: "", description: "", grade: "", schoolYear: "", semester: "上学期" as ResourceSemester, originalFileName: "", difficulty: "", recommendation: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const schoolId = teacher?.schoolId || "sch-1";
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(schoolId);

  const loadAll = useCallback(async () => {
    if (!teacher) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [donations, contributorList, myPrivileges, chapterData, knowledgeData, settingList] = await Promise.all([
        shareService.listPublicDonations(),
        shareService.listDonationContributors(),
        shareService.getDonationPrivileges(teacher.id),
        shareService.getPlatformDirectoryTree("chapter"),
        shareService.getPlatformDirectoryTree("knowledge"),
        shareService.listPlatformResourceSettings(),
      ]);
      const nextItems = donations.map(snapshotToItem).filter((item): item is PlatformResourceItem => Boolean(item));
      setItems(nextItems);
      setContributors(contributorList);
      setPrivileges(myPrivileges);
      setChapterTree(chapterData);
      setKnowledgeTree(knowledgeData);
      setSettings(settingList);
      const schoolIds = [...new Set(nextItems.map((item) => item.fromSchoolId))];
      const names = await Promise.all(schoolIds.map(async (id) => {
        const school = await schoolService.getSchool(id);
        return [id, school?.name || "未知学校"] as const;
      }));
      setSchoolNameMap(new Map(names));
    } catch (error) {
      console.error("加载平台资源失败", error);
      toast.error("加载平台资源失败");
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const contributorMap = useMemo(
    () => new Map(contributors.map((item) => [item.teacherId, item])),
    [contributors],
  );

  const displayedItems = useMemo(() => {
    let list = items;
    if (typeFilter !== "all") list = list.filter((item) => item.resourceType === typeFilter);
    if (keyword.trim()) {
      const term = keyword.trim().toLowerCase();
      list = list.filter((item) =>
        item.title.toLowerCase().includes(term)
        || item.description?.toLowerCase().includes(term)
        || item.content?.toLowerCase().includes(term),
      );
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
    if (sortKey === "updated") sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (sortKey === "created") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sortKey === "title") sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    return sorted;
  }, [items, typeFilter, keyword, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, sortKey]);

  const handleAddToMyResources = async (item: PlatformResourceItem) => {
    if (!teacher) return;
    setAddingIds((current) => new Set(current).add(item.shareId));
    try {
      await shareService.acceptShare(item.shareId, teacher.id, schoolId);
      toast.success("已添加到我的资源", item.title);
    } catch (error: any) {
      toast.error("添加失败", error?.message);
    } finally {
      setAddingIds((current) => {
        const next = new Set(current);
        next.delete(item.shareId);
        return next;
      });
    }
  };

  const openEdit = (item: PlatformResourceItem) => {
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
    setEditItem(item);
  };

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
      toast.success("平台资源已更新");
      setEditItem(null);
      await loadAll();
    } catch (error: any) {
      toast.error("更新失败", error?.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const openSettings = () => {
    setSettingsDraft(Object.fromEntries(settings.map((item) => [item.type, item.values.join("、")])));
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    if (!teacher) return;
    setSavingSettings(true);
    try {
      await shareService.updatePlatformResourceSettings(
        teacher.id,
        settings.map((item) => ({
          type: item.type,
          values: (settingsDraft[item.type] || "").split(/[、,，\n]/).map((value) => value.trim()).filter(Boolean),
        })),
      );
      toast.success("平台资源属性选项已更新");
      setSettingsOpen(false);
      await loadAll();
    } catch (error: any) {
      toast.error("保存失败", error?.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="平台资源"
        description="浏览教师捐赠的资源；接受后会自动同步章节和知识点目录"
        icon={<Cloud className="w-5 h-5" />}
        action={privileges?.canManagePlatformSettings ? (
          <Button variant="outline" onClick={openSettings}>
            <Settings2 className="w-4 h-4" />
            属性选项设置
          </Button>
        ) : undefined}
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
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

        <div className="col-span-9">
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
                  onClick={() => setTypeFilter(filter.key)}
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
            <span className="ml-auto text-xs text-ink-400">共 {displayedItems.length} 项</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Spinner size={24} /></div>
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
                const canEdit = item.fromTeacherId === teacher?.id || Boolean(privileges?.isTopContributor);
                const chapterNames = resolveNames(chapterTree, item.chapterIds);
                const knowledgeNames = resolveNames(knowledgeTree, item.knowledgePointIds);
                return (
                  <div key={item.shareId} className="card-base p-4 hover:shadow-cardHover transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="tag-gold">{resourceTypeLabel[item.resourceType]}</span>
                          <span className="text-xs text-ink-400">来源学校：{schoolNameMap.get(item.fromSchoolId) || "未知学校"}</span>
                          <span className="text-xs text-ink-500 flex items-center gap-1">
                            提供者：{contributor?.teacherName || "未知教师"}
                            {contributor?.isTopContributor && <Crown className="w-3.5 h-3.5 text-gold-500" aria-label="贡献榜前十" />}
                          </span>
                        </div>
                        <div className="font-medium text-ink-900 mb-1 line-clamp-2">{item.title}</div>
                        {item.description && <div className="text-xs text-ink-500 mb-2 line-clamp-2">{item.description}</div>}
                        {item.content && (
                          <div className="text-xs text-ink-600 mb-2 line-clamp-2 leading-relaxed bg-mist/40 p-2 rounded">
                            {item.content}
                          </div>
                        )}
                        <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
                          {item.meta.map((meta) => (
                            <span key={meta.label}><span className="text-ink-300">{meta.label}：</span><span className="text-ink-600">{meta.value}</span></span>
                          ))}
                          {chapterNames && <span><span className="text-ink-300">章节：</span><span className="text-ink-600">{chapterNames}</span></span>}
                          {knowledgeNames && <span><span className="text-ink-300">知识点：</span><span className="text-ink-600">{knowledgeNames}</span></span>}
                          {item.originalFileName && <span><span className="text-ink-300">文件名：</span><span className="text-ink-600">{item.originalFileName}</span></span>}
                          <span className="ml-auto text-ink-300">{timeAgo(item.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {canEdit && (
                          <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                            <Edit3 className="w-3.5 h-3.5" />
                            修改属性
                          </Button>
                        )}
                        <Button
                          variant="gold"
                          size="sm"
                          loading={addingIds.has(item.shareId)}
                          onClick={() => handleAddToMyResources(item)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          添加到我的资源
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        title="修改平台资源属性"
        description="捐赠者可以修改自己的资源；贡献榜前十名可以协助维护其他资源。平台资源不可删除。"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditItem(null)}>取消</Button>
            <Button variant="gold" loading={savingEdit} onClick={saveEdit}>保存修改</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <label className="block text-sm text-ink-700">
            <span className="block mb-1">{editItem?.resourceType === "question" ? "题干" : "标题"}</span>
            <textarea
              value={editForm.title}
              onChange={(event) => setEditForm((form) => ({ ...form, title: event.target.value }))}
              className="input-base min-h-20"
            />
          </label>
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
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="平台资源属性选项"
        description="贡献榜前十名可维护平台资源后台使用的可选项。使用顿号、逗号或换行分隔。"
        size="md"
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>取消</Button>
            <Button variant="gold" loading={savingSettings} onClick={saveSettings}>保存设置</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          {settings.map((setting) => (
            <label key={setting.type} className="block text-sm text-ink-700">
              <span className="block mb-1">{settingLabels[setting.type]}</span>
              <textarea
                value={settingsDraft[setting.type] || ""}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, [setting.type]: event.target.value }))}
                className="input-base min-h-16"
              />
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
