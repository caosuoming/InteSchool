import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText, Plus, Search, FileQuestion, Users, BookOpen,
  Calendar, Edit3, Eye, GraduationCap, Lightbulb,
  ArrowUpDown, Clock, ListFilter,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { lectureService } from "@/services/lecture";
import { knowledgeService } from "@/services/knowledge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { Lecture, TreeNode, Chapter, KnowledgePoint, FilterLogic } from "@/types";
import { timeAgo } from "@/services/_shared";
import { cn } from "@/lib/utils";

type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "sections" | "title";

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "updated", label: "最近更新", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "created", label: "创建时间", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "sections", label: "内容数量", icon: <ListFilter className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

export default function LectureListPage() {
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");

  const [leftTab, setLeftTab] = useState<LeftTab>("chapter");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");

  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!teacher) return;
      const [chTree, kpTree, chs, kps] = await Promise.all([
        knowledgeService.getChapterTree(teacher.schoolId!),
        knowledgeService.getKnowledgeTree(teacher.schoolId!),
        knowledgeService.listChapters(teacher.schoolId!),
        knowledgeService.listKnowledgePoints(teacher.schoolId!),
      ]);
      setChapterTree(chTree);
      setKnowledgeTree(kpTree);
      setChapters(chs);
      setPoints(kps);
    };
    load();
  }, [teacher]);

  useEffect(() => {
    const load = async () => {
      if (!teacher) return;
      setLoading(true);
      const data = await lectureService.listLectures({
        teacherId: teacher.id,
        schoolId: teacher.schoolId!,
        keyword,
        chapterIds: checkedChapters,
        chapterLogic,
        knowledgePointIds: checkedKnowledge,
        knowledgeLogic,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setLectures(data);
      setLoading(false);
    };
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [teacher, keyword, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, statusFilter]);

  const sortedLectures = useMemo(() => {
    const sorted = [...lectures];
    switch (sortKey) {
      case "updated":
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case "created":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "sections":
        sorted.sort((a, b) => b.sections.length - a.sections.length);
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return sorted;
  }, [lectures, sortKey]);

  const getChapterName = (id: string) => chapters.find((c) => c.id === id)?.name || "";
  const getPointName = (id: string) => points.find((p) => p.id === id)?.name || "";

  const displayTree = leftTab === "chapter" ? chapterTree : knowledgeTree;
  const displayCheckedIds = leftTab === "chapter" ? checkedChapters : checkedKnowledge;
  const setDisplayCheckedIds = leftTab === "chapter" ? setCheckedChapters : setCheckedKnowledge;
  const displayLogic = leftTab === "chapter" ? chapterLogic : knowledgeLogic;
  const setDisplayLogic = leftTab === "chapter" ? setChapterLogic : setKnowledgeLogic;

  const hasFilter = checkedChapters.length > 0 || checkedKnowledge.length > 0 || keyword || statusFilter !== "all";

  const clearAllFilters = () => {
    setCheckedChapters([]);
    setCheckedKnowledge([]);
    setKeyword("");
    setStatusFilter("all");
  };

  return (
    <div>
      <PageHeader
        title="讲义库"
        description="管理您的教学讲义，支持按章节、知识点筛选与排序"
        icon={<FileText className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={() => navigate("/lectures/new")}>
            <Plus className="w-4 h-4" />
            新建讲义
          </Button>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {/* 左侧：章节/知识点目录 Tab 切换 */}
        <div className="col-span-12 lg:col-span-3">
          <Card className="p-0 overflow-hidden">
            {/* Tab 头 */}
            <div className="flex border-b border-ink-100">
              <button
                onClick={() => setLeftTab("chapter")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  leftTab === "chapter"
                    ? "bg-gold-50 text-gold-800 border-b-2 border-gold-500"
                    : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  章节目录
                </span>
              </button>
              <button
                onClick={() => setLeftTab("knowledge")}
                className={cn(
                  "flex-1 px-4 py-2.5 text-sm font-medium transition-colors",
                  leftTab === "knowledge"
                    ? "bg-teal-50 text-teal-800 border-b-2 border-teal-500"
                    : "text-ink-500 hover:text-ink-700",
                )}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5" />
                  知识点目录
                </span>
              </button>
            </div>

            {/* 搜索 + 树 */}
            <div className="p-3">
              <SearchableTree
                title=""
                accent={leftTab === "chapter" ? "gold" : "teal"}
                data={displayTree ?? { id: "root", name: "", type: "chapter", count: 0, children: [] }}
                checkable
                checkedIds={displayCheckedIds}
                onCheck={setDisplayCheckedIds}
                expandLevel={1}
                searchPlaceholder={leftTab === "chapter" ? "搜索章节..." : "搜索知识点..."}
                showLogicSelector
                logic={displayLogic}
                onLogicChange={setDisplayLogic}
              />
            </div>

            {/* 已选筛选条件 */}
            {hasFilter && (
              <div className="px-3 pb-3 border-t border-ink-50 pt-3">
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-ink-500 hover:text-gold-600 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  清空所有筛选
                </button>
              </div>
            )}
          </Card>
        </div>

        {/* 右侧：筛选 + 讲义列表 */}
        <div className="col-span-12 lg:col-span-9">
          {/* 顶部筛选栏 */}
          <Card className="mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  placeholder="搜索讲义标题"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="input-base pl-10"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(["all", "draft", "published"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded text-xs border transition-all ${
                      statusFilter === s
                        ? "bg-ink-900 border-ink-900 text-paper"
                        : "bg-paper border-ink-200 text-ink-600 hover:border-ink-300"
                    }`}
                  >
                    {s === "all" ? "全部" : s === "draft" ? "草稿" : "已发布"}
                  </button>
                ))}
              </div>

              {/* 排序 */}
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
          </Card>

          {/* 结果计数 */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-ink-600">
              共 <span className="font-mono font-semibold text-ink-900">{sortedLectures.length}</span> 份讲义
            </div>
          </div>

          {/* 讲义列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : sortedLectures.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileQuestion className="w-7 h-7" />}
                title={hasFilter ? "未找到匹配的讲义" : "您还没有讲义"}
                description={
                  hasFilter
                    ? "尝试调整筛选条件"
                    : "从试题篮或题库中选题，开始创建第一份讲义"
                }
                action={
                  !hasFilter ? (
                    <Button variant="gold" onClick={() => navigate("/lectures/new")}>
                      <Plus className="w-4 h-4" />
                      新建讲义
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
              {sortedLectures.map((lec) => (
                <Card key={lec.id} hoverable className="flex flex-col">
                  <CardHeader
                    title={lec.title}
                    subtitle={lec.description || "无描述"}
                    action={
                      <Badge variant={lec.status === "published" ? "green" : "default"}>
                        {lec.status === "published" ? "已发布" : "草稿"}
                      </Badge>
                    }
                  />

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {lec.chapterIds.slice(0, 2).map((id) => (
                      <Badge key={id} variant="ink">
                        <BookOpen className="w-3 h-3" />
                        {getChapterName(id).slice(0, 12)}
                      </Badge>
                    ))}
                    {lec.knowledgePointIds.slice(0, 1).map((id) => (
                      <Badge key={id} variant="teal">
                        <Lightbulb className="w-3 h-3" />
                        {getPointName(id).slice(0, 10)}
                      </Badge>
                    ))}
                    {(lec.chapterIds.length > 2 || lec.knowledgePointIds.length > 1) && (
                      <Badge variant="default">
                        +{lec.chapterIds.length + lec.knowledgePointIds.length - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1.5 text-xs text-ink-500 mb-3 flex-1">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-3.5 h-3.5" />
                      <span>{lec.grade} · {lec.schoolYear}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" />
                      <span>{lec.sections.length} 个章节/题目</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" />
                      <span className="truncate">
                        {lec.classIds.length > 0 || lec.studentIds.length > 0
                          ? `${lec.classIds.length} 个班级${
                              lec.studentIds.length > 0 ? ` +${lec.studentIds.length} 名学生` : ""
                            }`
                          : "未关联班级"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>更新于 {timeAgo(lec.updatedAt)} · v{lec.version}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-ink-100">
                    <Link to={`/lectures/${lec.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit3 className="w-3.5 h-3.5" />
                        编辑
                      </Button>
                    </Link>
                    <Link to={`/lectures/${lec.id}/edit?preview=1`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
