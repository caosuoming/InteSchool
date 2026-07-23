import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Search, BookOpen, Lightbulb, Cloud, Plus,
  ArrowUpDown, Clock, Calendar, FileText,
  FileQuestion, FileSpreadsheet, Presentation, FileBox,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { examPaperService } from "@/services/examPaper";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { lectureService } from "@/services/lecture";
import { shareService } from "@/services/share";
import { knowledgeService } from "@/services/knowledge";
import { schoolService } from "@/services/school";
import { authService } from "@/services/auth";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type {
  TreeNode, FilterLogic, ShareableResourceType, ShareRecord,
  Teacher,
  CoursewareType, MaterialType, QuestionType,
} from "@/types";
import { timeAgo } from "@/services/_shared";
import { cn } from "@/lib/utils";

type ResourceTypeFilter = "all" | ShareableResourceType;
type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "title";

interface PlatformResourceItem {
  shareId: string;
  resourceId: string;
  resourceType: ShareableResourceType;
  title: string;
  description?: string;
  content?: string;
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
  { value: "created", label: "创建时间", icon: <Calendar className="w-3.5 h-3.5" /> },
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

// 根据分享记录拉取对应资源详情（纯函数，不依赖组件状态）
async function enrichShare(share: ShareRecord): Promise<PlatformResourceItem | null> {
  const base = {
    shareId: share.id,
    resourceId: share.resourceId,
    resourceType: share.resourceType,
    title: share.resourceTitle,
    fromTeacherId: share.fromTeacherId,
    fromSchoolId: share.fromSchoolId,
    createdAt: share.createdAt,
    updatedAt: share.createdAt,
    chapterIds: [] as string[],
    knowledgePointIds: [] as string[],
  };
  try {
    switch (share.resourceType) {
      case "question": {
        const q = await questionService.getQuestion(share.resourceId);
        if (!q) return null;
        return {
          ...base,
          title: q.stem,
          chapterIds: q.chapterIds,
          knowledgePointIds: q.knowledgePointIds,
          updatedAt: q.updatedAt,
          meta: [
            { label: "题型", value: questionTypeLabel[q.type] },
            { label: "难度", value: difficultyLabelText[q.difficulty] },
          ],
        };
      }
      case "examPaper": {
        const p = await examPaperService.getPaper(share.resourceId);
        if (!p) return null;
        return {
          ...base,
          title: p.title,
          description: p.description,
          chapterIds: p.chapterIds,
          knowledgePointIds: p.knowledgePointIds,
          updatedAt: p.updatedAt,
          meta: [
            { label: "年级", value: `${p.grade} · ${p.schoolYear}` },
            { label: "题目", value: `${p.questions.length} 题` },
            { label: "总分", value: `${p.totalScore} 分` },
          ],
        };
      }
      case "lecture": {
        const l = await lectureService.getLecture(share.resourceId);
        if (!l) return null;
        return {
          ...base,
          title: l.title,
          description: l.description,
          chapterIds: l.chapterIds,
          knowledgePointIds: l.knowledgePointIds,
          updatedAt: l.updatedAt,
          meta: [
            { label: "年级", value: `${l.grade} · ${l.schoolYear}` },
            { label: "内容", value: `${l.sections.length} 节` },
          ],
        };
      }
      case "courseware": {
        const c = await coursewareService.getCourseware(share.resourceId);
        if (!c) return null;
        return {
          ...base,
          title: c.title,
          description: c.description,
          content: c.content,
          chapterIds: c.chapterIds,
          knowledgePointIds: c.knowledgePointIds,
          updatedAt: c.updatedAt,
          meta: [
            { label: "类型", value: coursewareTypeLabel[c.type] },
            { label: "年级", value: `${c.grade} · ${c.schoolYear}` },
          ],
        };
      }
      case "material": {
        const m = await materialService.getMaterial(share.resourceId);
        if (!m) return null;
        return {
          ...base,
          title: m.title,
          description: m.description,
          content: m.content,
          chapterIds: m.chapterIds,
          knowledgePointIds: m.knowledgePointIds,
          updatedAt: m.updatedAt,
          meta: [
            { label: "类型", value: materialTypeLabel[m.type] },
            { label: "年级", value: `${m.grade} · ${m.schoolYear}` },
          ],
        };
      }
    }
  } catch {
    return null;
  }
  return null;
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
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // 使用登录教师所在学校作为章节目录来源；若无则回退默认学校
  const schoolId = teacher?.schoolId || "sch-1";

  const loadAll = useCallback(async () => {
    if (!teacher) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 通过分享记录获取全平台公开分享的资源
      const incomingShares = await shareService.listIncomingShares(teacher.id);
      const publicShares = incomingShares.filter((s) => s.scope === "public");

      const items: PlatformResourceItem[] = [];
      for (const share of publicShares) {
        const enriched = await enrichShare(share);
        if (enriched) {
          // 应用章节/知识点筛选
          if (checkedChapters.length > 0) {
            const logic = chapterLogic;
            const matches = logic === "and"
              ? checkedChapters.every((c) => enriched.chapterIds.includes(c))
              : checkedChapters.some((c) => enriched.chapterIds.includes(c));
            if (!matches) continue;
          }
          if (checkedKnowledge.length > 0) {
            const logic = knowledgeLogic;
            const matches = logic === "and"
              ? checkedKnowledge.every((k) => enriched.knowledgePointIds.includes(k))
              : checkedKnowledge.some((k) => enriched.knowledgePointIds.includes(k));
            if (!matches) continue;
          }
          items.push(enriched);
        }
      }
      setItems(items);
    } catch (e) {
      console.error("加载平台资源失败", e);
    } finally {
      setLoading(false);
    }
  }, [teacher, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic]);

  useEffect(() => {
    knowledgeService.getChapterTree(schoolId).then(setChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => loadAll(), 300);
    return () => clearTimeout(timer);
  }, [loadAll]);

  // 教师名称映射（学校名称通过异步加载到 schoolNameMap）
  const teacherMap = useMemo(() => {
    const map = new Map<string, Teacher>();
    const allTeachers = authService.listTeachers();
    for (const item of items) {
      if (!map.has(item.fromTeacherId)) {
        const t = allTeachers.find((tt) => tt.id === item.fromTeacherId);
        if (t) map.set(item.fromTeacherId, t);
      }
    }
    return map;
  }, [items]);

  // 异步加载学校名称
  const [schoolNameMap, setSchoolNameMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    const uniqueSchoolIds: string[] = Array.from(new Set(items.map((i) => i.fromSchoolId)));
    Promise.all(
      uniqueSchoolIds.map((id: string) =>
        schoolService.getSchool(id).then((s): [string, string] => [id, s?.name || "未知学校"]),
      ),
    ).then((entries: [string, string][]) => setSchoolNameMap(new Map(entries)));
  }, [items]);

  // 筛选与排序
  const displayedItems = useMemo(() => {
    let list = items;
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
  }, [items, typeFilter, keyword, sortKey]);

  const handleAddToMyResources = async (item: PlatformResourceItem) => {
    if (!teacher) return;
    setAddingIds((prev) => new Set(prev).add(item.shareId));
    try {
      // 接受公开分享，将资源复制到自己的资源库
      await shareService.acceptShare(item.shareId, teacher.id, schoolId);
      toast.success(`已添加「${item.title.slice(0, 20)}${item.title.length > 20 ? "..." : ""}」到我的资源`);
      loadAll();
    } catch (e: any) {
      toast.error("添加失败", e?.message);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.shareId);
        return next;
      });
    }
  };

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

  return (
    <div>
      <PageHeader
        title="平台资源"
        description="浏览全平台共享的优质教学资源"
        icon={<Cloud className="w-5 h-5" />}
      />

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

        {/* 右侧：资源列表 */}
        <div className="col-span-9">
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
            <span className="ml-auto text-xs text-ink-400">共 {displayedItems.length} 项</span>
          </div>

          {/* 资源列表内容 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : displayedItems.length === 0 ? (
            <EmptyState
              icon={<Cloud className="w-10 h-10 text-ink-200" />}
              title="暂无平台资源"
              description="全平台公开分享的资源将显示在这里"
            />
          ) : (
            <div className="space-y-3">
              {displayedItems.map((item) => {
                const provider = teacherMap.get(item.fromTeacherId);
                const schoolName = schoolNameMap.get(item.fromSchoolId) || "未知学校";
                const chapterNames = resolveChapterNames(item.chapterIds);
                const isAdding = addingIds.has(item.shareId);
                return (
                  <div key={`${item.resourceType}-${item.resourceId}`} className="card-base p-4 hover:shadow-cardHover transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="tag-gold">{resourceTypeLabel[item.resourceType]}</span>
                          <span className="text-xs text-ink-400">来源学校：{schoolName}</span>
                          {provider && (
                            <span className="text-xs text-ink-400">提供者：{provider.name}</span>
                          )}
                        </div>
                        <div className="font-medium text-ink-900 mb-1 line-clamp-2">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-ink-500 mb-2 line-clamp-1">{item.description}</div>
                        )}
                        {item.content && (
                          <div className="text-xs text-ink-600 mb-2 line-clamp-2 leading-relaxed bg-mist/40 p-2 rounded">
                            {item.content}
                          </div>
                        )}
                        <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
                          {item.meta.map((m, i) => (
                            <span key={i}>
                              <span className="text-ink-300">{m.label}：</span>
                              <span className="text-ink-600">{m.value}</span>
                            </span>
                          ))}
                          {chapterNames && (
                            <span>
                              <span className="text-ink-300">章节：</span>
                              <span className="text-ink-600">{chapterNames}</span>
                            </span>
                          )}
                          <span className="ml-auto text-ink-300">{timeAgo(item.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <Button
                          variant="gold"
                          size="sm"
                          loading={isAdding}
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
    </div>
  );
}
