import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, BookOpen, Lightbulb, Building2,
  ArrowUpDown, Clock, Calendar, FileText,
  FileQuestion, FileSpreadsheet, Presentation, FileBox,
  Lock, Edit3, Trash2, Eye, History, Shield, Copy, Check,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { authService } from "@/services/auth";
import { knowledgeService } from "@/services/knowledge";
import { schoolBackupService, canEditSchoolBackup } from "@/services/schoolBackup";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { TreeView } from "@/components/tree/TreeView";
import type {
  Teacher, TreeNode, FilterLogic,
  SchoolBackupResourceType, SchoolResourceBackup,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";

type ResourceTypeFilter = "all" | SchoolBackupResourceType;
type LeftTab = "chapter" | "knowledge";
type SortKey = "created" | "updated" | "title";

const typeFilterConfig: { key: ResourceTypeFilter; label: string; icon: typeof FileText }[] = [
  { key: "all", label: "全部", icon: FileText },
  { key: "question", label: "题目", icon: FileQuestion },
  { key: "examPaper", label: "试卷", icon: FileSpreadsheet },
  { key: "lecture", label: "讲义", icon: FileText },
  { key: "courseware", label: "课件", icon: Presentation },
  { key: "material", label: "素材", icon: FileBox },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "created", label: "备份时间", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "updated", label: "最近更新", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

const resourceTypeLabel: Record<SchoolBackupResourceType, string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
};

export default function SchoolResourcesPage() {
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
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [backups, setBackups] = useState<SchoolResourceBackup[]>([]);
  // 年级/学年筛选
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [schoolYearFilter, setSchoolYearFilter] = useState<string>("");

  // 详情/编辑弹窗
  const [viewing, setViewing] = useState<SchoolResourceBackup | null>(null);
  const [editing, setEditing] = useState<SchoolResourceBackup | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    chapterIds: string[];
    knowledgePointIds: string[];
    grade: string;
    schoolYear: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  // 另存为状态：记录已"另存为"过的备份ID，避免重复操作
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [schoolTeachers, setSchoolTeachers] = useState<Teacher[]>([]);

  const schoolId = teacher?.schoolId || "sch-1";
  const canEdit = canEditSchoolBackup(teacher);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const list = await schoolBackupService.listBackups(schoolId);
      setBackups(list);
    } catch (e) {
      console.error("加载校本资源失败", e);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    knowledgeService.getChapterTree(schoolId).then(setChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => loadAll(), 200);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    authService.listTeachers().then(setSchoolTeachers).catch(() => setSchoolTeachers([]));
  }, [schoolId]);

  // 教师名称映射
  const teacherMap = useMemo(() => {
    const map = new Map<string, Teacher>();
    for (const item of backups) {
      if (!map.has(item.fromTeacherId)) {
        const t = schoolTeachers.find((tt) => tt.id === item.fromTeacherId);
        if (t) map.set(item.fromTeacherId, t);
      }
    }
    return map;
  }, [backups, schoolTeachers]);

  // 筛选与排序
  const displayedItems = useMemo(() => {
    let list = backups;
    if (typeFilter !== "all") {
      list = list.filter((i) => i.resourceType === typeFilter);
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((i) =>
        i.title.toLowerCase().includes(kw) ||
        (i.description?.toLowerCase().includes(kw) ?? false),
      );
    }
    if (gradeFilter) {
      list = list.filter((i) => i.grade === gradeFilter);
    }
    if (schoolYearFilter) {
      list = list.filter((i) => i.schoolYear === schoolYearFilter);
    }
    if (checkedChapters.length > 0) {
      list = list.filter((i) => {
        if (chapterLogic === "and") {
          return checkedChapters.every((id) => i.chapterIds.includes(id));
        }
        return checkedChapters.some((id) => i.chapterIds.includes(id));
      });
    }
    if (checkedKnowledge.length > 0) {
      list = list.filter((i) => {
        if (knowledgeLogic === "and") {
          return checkedKnowledge.every((id) => i.knowledgePointIds.includes(id));
        }
        return checkedKnowledge.some((id) => i.knowledgePointIds.includes(id));
      });
    }
    const sorted = [...list];
    switch (sortKey) {
      case "updated":
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case "created":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "zh"));
        break;
    }
    return sorted;
  }, [backups, typeFilter, keyword, sortKey, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, gradeFilter, schoolYearFilter]);

  // 从备份数据派生可选年级/学年的下拉选项
  const gradeOptions = useMemo(() => {
    const set = new Set<string>();
    backups.forEach((b) => { if (b.grade) set.add(b.grade); });
    return Array.from(set).sort();
  }, [backups]);

  const schoolYearOptions = useMemo(() => {
    const set = new Set<string>();
    backups.forEach((b) => { if (b.schoolYear) set.add(b.schoolYear); });
    return Array.from(set).sort().reverse();
  }, [backups]);

  const resolveChapterNames = (chapterIds: string[]): string => {
    if (!chapterTree || chapterIds.length === 0) return "";
    const names: string[] = [];
    const walk = (node: TreeNode) => {
      if (chapterIds.includes(node.id) && node.id !== "root") names.push(node.name);
      node.children.forEach(walk);
    };
    walk(chapterTree);
    return names.slice(0, 2).join("、") + (names.length > 2 ? ` 等${names.length}个` : "");
  };

  const resolveKnowledgeNames = (knowledgeIds: string[]): string => {
    if (!knowledgeTree || knowledgeIds.length === 0) return "";
    const names: string[] = [];
    const walk = (node: TreeNode) => {
      if (knowledgeIds.includes(node.id) && node.id !== "root") names.push(node.name);
      node.children.forEach(walk);
    };
    walk(knowledgeTree);
    return names.slice(0, 2).join("、") + (names.length > 2 ? ` 等${names.length}个` : "");
  };

  const handleEdit = (item: SchoolResourceBackup) => {
    if (!canEdit) {
      toast.error("无权限", "仅备课组长及以上可修改校本资源属性");
      return;
    }
    setEditing(item);
    setEditForm({
      title: item.title,
      description: item.description || "",
      chapterIds: [...item.chapterIds],
      knowledgePointIds: [...item.knowledgePointIds],
      grade: item.grade || "",
      schoolYear: item.schoolYear || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editing || !editForm || !teacher) return;
    setSaving(true);
    try {
      const updated = await schoolBackupService.updateBackupProperties(
        editing.id,
        {
          title: editForm.title,
          description: editForm.description,
          chapterIds: editForm.chapterIds,
          knowledgePointIds: editForm.knowledgePointIds,
          grade: editForm.grade,
          schoolYear: editForm.schoolYear,
        },
        teacher,
      );
      toast.success("已更新属性");
      setEditing(null);
      setEditForm(null);
      setBackups((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: SchoolResourceBackup) => {
    if (!teacher) return;
    if (!canEdit) {
      toast.error("无权限", "仅备课组长及以上可删除校本资源");
      return;
    }
    if (!confirm(`确定要删除此备份吗？\n\n${item.title.slice(0, 50)}`)) return;
    try {
      await schoolBackupService.deleteBackup(item.id, teacher);
      toast.success("已删除");
      setBackups((prev) => prev.filter((b) => b.id !== item.id));
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  // 另存为我的资源：所有老师均可调用
  const handleSaveAsOwn = async (item: SchoolResourceBackup) => {
    if (!teacher) return;
    if (savedIds.has(item.id)) {
      toast.info("已添加过", "该备份已添加到您的资源库");
      return;
    }
    setSavingIds((prev) => new Set(prev).add(item.id));
    try {
      const result = await schoolBackupService.saveAsOwnResource(item.id, teacher);
      setSavedIds((prev) => new Set(prev).add(item.id));
      const typeLabel = resourceTypeLabel[result.resourceType];
      toast.success(`已另存为我的${typeLabel}`, "可在「我的资源」中查看");
    } catch (e: any) {
      toast.error("另存为失败", e?.message);
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="校本资源"
        description="本校资源备份库 · 教师发布给非所教班级的资源自动备份至此"
        icon={<Building2 className="w-5 h-5" />}
        action={
          canEdit ? (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gold-100 text-gold-800 text-xs font-medium">
              <Shield className="w-3 h-3" />
              管理权限（备课组长+）
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-ink-100 text-ink-600 text-xs">
              <Lock className="w-3 h-3" />
              只读模式
            </span>
          )
        }
      />

      {/* 说明栏 */}
      <div className="mb-4 p-3 rounded-md bg-teal-50/60 border border-teal-200 text-xs text-teal-800 flex items-start gap-2">
        <History className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-medium mb-0.5">校本资源备份说明</div>
          当您将试卷、讲义、课件等资源发布或分享给<b>非自己所教班级</b>时，系统会自动将资源及其相关题目、素材<b>同步备份</b>到此处。
          备份的目的是保留学校层面的资源沉淀与共享追溯。普通教师仅可查看，<b>备课组长及以上权限</b>可修改资源的属性（章节、知识点、年级等）。
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 左侧：章节/知识点目录 */}
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
                  leftTab === "knowledge" ? "bg-paper text-gold-600 shadow-sm" : "text-ink-500 hover:text-ink-700",
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
                  title="章节目录"
                  accent="gold"
                  checkable
                  checkedIds={checkedChapters}
                  onCheck={setCheckedChapters}
                  searchPlaceholder="搜索章节..."
                  showLogicSelector
                  logic={chapterLogic}
                  onLogicChange={setChapterLogic}
                />
              ) : (
                <div className="py-10 flex items-center justify-center">
                  <Spinner size={20} />
                </div>
              )
            ) : knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="知识点目录"
                accent="teal"
                checkable
                checkedIds={checkedKnowledge}
                onCheck={setCheckedKnowledge}
                searchPlaceholder="搜索知识点..."
                showLogicSelector
                logic={knowledgeLogic}
                onLogicChange={setKnowledgeLogic}
              />
            ) : (
              <div className="py-10 flex items-center justify-center">
                <Spinner size={20} />
              </div>
            )}
          </Card>
        </div>

        {/* 右侧：备份资源列表 */}
        <div className="col-span-9">
          {/* 搜索与排序 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-md min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索备份资源..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-ink-200 rounded-md bg-paper focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
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

          {/* 年级 / 学年筛选 */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-500">年级：</span>
              <button
                onClick={() => setGradeFilter("")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-all",
                  !gradeFilter
                    ? "bg-gold-400 border-gold-400 text-ink-900"
                    : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                全部
              </button>
              {gradeOptions.map((g) => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g === gradeFilter ? "" : g)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    gradeFilter === g
                      ? "bg-gold-400 border-gold-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {g}
                </button>
              ))}
              {gradeOptions.length === 0 && (
                <span className="text-xs text-ink-300 italic">（暂无年级数据）</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-ink-500">学年：</span>
              <button
                onClick={() => setSchoolYearFilter("")}
                className={cn(
                  "px-2.5 py-1 rounded text-xs border transition-all",
                  !schoolYearFilter
                    ? "bg-teal-400 border-teal-400 text-ink-900"
                    : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                )}
              >
                全部
              </button>
              {schoolYearOptions.map((y) => (
                <button
                  key={y}
                  onClick={() => setSchoolYearFilter(y === schoolYearFilter ? "" : y)}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs border transition-all",
                    schoolYearFilter === y
                      ? "bg-teal-400 border-teal-400 text-ink-900"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  {y}
                </button>
              ))}
              {schoolYearOptions.length === 0 && (
                <span className="text-xs text-ink-300 italic">（暂无学年数据）</span>
              )}
            </div>
          </div>

          {/* 资源类型筛选 */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {typeFilterConfig.map((tf) => {
              const Icon = tf.icon;
              const active = typeFilter === tf.key;
              return (
                <button
                  key={tf.key}
                  onClick={() => setTypeFilter(tf.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5",
                    active
                      ? "bg-ink-900 border-ink-900 text-gold-400"
                      : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tf.label}
                </button>
              );
            })}
            <span className="ml-auto text-xs text-ink-400">共 {displayedItems.length} 项备份</span>
          </div>

          {/* 资源列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : displayedItems.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-10 h-10 text-ink-200" />}
              title="暂无校本资源备份"
              description="当教师将资源发布给非自己所教班级时，备份会自动生成并显示在这里"
            />
          ) : (
            <div className="space-y-3">
              {displayedItems.map((item) => {
                const provider = teacherMap.get(item.fromTeacherId);
                const chapterNames = resolveChapterNames(item.chapterIds);
                const knowledgeNames = resolveKnowledgeNames(item.knowledgePointIds);
                return (
                  <div key={item.id} className="card-base p-4 hover:shadow-cardHover transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="tag-teal">{resourceTypeLabel[item.resourceType]}</span>
                          {provider && (
                            <span className="text-xs text-ink-400">提供者：{provider.name}</span>
                          )}
                          <span className="text-xs text-ink-400 flex items-center gap-1">
                            <History className="w-3 h-3" />
                            备份于 {timeAgo(item.createdAt)}
                          </span>
                          {item.updatedAt !== item.createdAt && (
                            <span className="text-xs text-ink-400">
                              · 更新于 {timeAgo(item.updatedAt)}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-ink-900 mb-1 line-clamp-2">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-ink-500 mb-2 line-clamp-1">{item.description}</div>
                        )}
                        {/* 元数据 */}
                        <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400 mb-1">
                          {Object.entries(item.meta).map(([k, v]) => (
                            <span key={k}>
                              <span className="text-ink-300">{k}：</span>
                              <span className="text-ink-600">{v}</span>
                            </span>
                          ))}
                          {item.grade && (
                            <span>
                              <span className="text-ink-300">年级：</span>
                              <span className="text-ink-600">{item.grade}</span>
                            </span>
                          )}
                          {item.schoolYear && (
                            <span>
                              <span className="text-ink-300">学年：</span>
                              <span className="text-ink-600">{item.schoolYear}</span>
                            </span>
                          )}
                        </div>
                        {/* 章节、知识点 */}
                        <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
                          {chapterNames && (
                            <span>
                              <span className="text-ink-300">章节：</span>
                              <span className="text-ink-600">{chapterNames}</span>
                            </span>
                          )}
                          {knowledgeNames && (
                            <span>
                              <span className="text-ink-300">知识点：</span>
                              <span className="text-ink-600">{knowledgeNames}</span>
                            </span>
                          )}
                          {item.targetClassIds.length > 0 && (
                            <span>
                              <span className="text-ink-300">发布到：</span>
                              <span className="text-ink-600">{item.targetClassIds.length} 个班级</span>
                            </span>
                          )}
                        </div>
                        {/* 备份原因 */}
                        <div className="mt-1 text-[11px] text-ink-400 italic">
                          来源：{item.backupReason}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setViewing(item)}
                          className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSaveAsOwn(item)}
                          disabled={savingIds.has(item.id) || savedIds.has(item.id)}
                          className={cn(
                            "p-1.5 rounded transition-colors flex items-center gap-1",
                            savedIds.has(item.id)
                              ? "text-emerald-600 bg-emerald-50"
                              : "text-ink-400 hover:bg-teal-50 hover:text-teal-600",
                          )}
                          title={savedIds.has(item.id) ? "已添加到我的资源" : "另存为我的资源"}
                        >
                          {savedIds.has(item.id) ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 rounded text-ink-400 hover:bg-gold-50 hover:text-gold-600"
                              title="修改属性"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
                              title="删除备份"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 查看详情弹窗 */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.title}
        description={viewing ? resourceTypeLabel[viewing.resourceType] + " · 校本备份" : undefined}
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setViewing(null)}>关闭</Button>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-ink-400">资源类型</div>
                <div>{resourceTypeLabel[viewing.resourceType]}</div>
              </div>
              <div>
                <div className="text-xs text-ink-400">提供者</div>
                <div>{teacherMap.get(viewing.fromTeacherId)?.name || "未知"}</div>
              </div>
              <div>
                <div className="text-xs text-ink-400">备份时间</div>
                <div>{new Date(viewing.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <div>
                <div className="text-xs text-ink-400">最后更新</div>
                <div>{new Date(viewing.updatedAt).toLocaleString("zh-CN")}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-ink-400">备份原因</div>
                <div>{viewing.backupReason}</div>
              </div>
              {viewing.description && (
                <div className="col-span-2">
                  <div className="text-xs text-ink-400">描述</div>
                  <div>{viewing.description}</div>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-ink-400 mb-1">内容快照</div>
              <div className="p-3 rounded-md bg-mist/40 border border-ink-100 text-xs text-ink-700 max-h-[300px] overflow-auto whitespace-pre-wrap break-all">
                {viewing.contentSnapshot}
              </div>
            </div>
            <div>
              <div className="text-xs text-ink-400 mb-1">属性</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(viewing.meta).map(([k, v]) => (
                  <span key={k} className="tag-gold">{k}: {v}</span>
                ))}
                {viewing.grade && <span className="tag-teal">年级: {viewing.grade}</span>}
                {viewing.schoolYear && <span className="tag-teal">学年: {viewing.schoolYear}</span>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 编辑属性弹窗 */}
      <Modal
        open={!!editing}
        onClose={() => { setEditing(null); setEditForm(null); }}
        title="修改校本资源属性"
        description={editing?.title}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setEditing(null); setEditForm(null); }}>取消</Button>
            <Button variant="gold" onClick={handleSaveEdit} loading={saving}>
              保存修改
            </Button>
          </div>
        }
      >
        {editing && editForm && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-md bg-gold-50 border border-gold-200 text-xs text-gold-800 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                您具有备课组长及以上权限，可修改此备份资源的<b>属性</b>（章节、知识点、年级等）。
                修改仅影响校本库中的归属分类，不会改动原始资源。
              </div>
            </div>
            <Input
              label="标题"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            />
            <Textarea
              label="描述"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="年级"
                value={editForm.grade}
                options={[
                  { value: "", label: "未指定" },
                  { value: "高一", label: "高一" },
                  { value: "高二", label: "高二" },
                  { value: "高三", label: "高三" },
                ]}
                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
              />
              <Select
                label="学年"
                value={editForm.schoolYear}
                options={[
                  { value: "", label: "未指定" },
                  { value: "2025-2026", label: "2025-2026" },
                  { value: "2024-2025", label: "2024-2025" },
                ]}
                onChange={(e) => setEditForm({ ...editForm, schoolYear: e.target.value })}
              />
            </div>
            <div className="border border-gold-200 rounded-lg overflow-hidden bg-gold-50/20">
              <div className="px-3 py-2 bg-gold-50 border-b border-gold-200 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-gold-700" />
                <span className="font-serif font-semibold text-sm text-gold-800">章节目录</span>
                <span className="ml-auto text-xs text-gold-700">已选 {editForm.chapterIds.length}</span>
              </div>
              <div className="p-2 max-h-[200px] overflow-y-auto">
                {chapterTree && (
                  <TreeView
                    data={chapterTree}
                    checkable
                    checkedIds={editForm.chapterIds}
                    onCheck={(ids) => setEditForm({ ...editForm, chapterIds: ids })}
                    expandLevel={2}
                    className="text-xs"
                  />
                )}
              </div>
            </div>
            <div className="border border-teal-200 rounded-lg overflow-hidden bg-teal-50/20">
              <div className="px-3 py-2 bg-teal-50 border-b border-teal-200 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-teal-700" />
                <span className="font-serif font-semibold text-sm text-teal-800">知识点目录</span>
                <span className="ml-auto text-xs text-teal-700">已选 {editForm.knowledgePointIds.length}</span>
              </div>
              <div className="p-2 max-h-[200px] overflow-y-auto">
                {knowledgeTree && (
                  <TreeView
                    data={knowledgeTree}
                    checkable
                    checkedIds={editForm.knowledgePointIds}
                    onCheck={(ids) => setEditForm({ ...editForm, knowledgePointIds: ids })}
                    expandLevel={2}
                    className="text-xs"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
