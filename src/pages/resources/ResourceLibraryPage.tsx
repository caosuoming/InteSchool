import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  FileText, Plus, Search, BookOpen, Lightbulb,
  Calendar, Eye, Presentation, FileBox,
  ArrowUpDown, Clock, Library,
  FileSpreadsheet, Sparkles, Trash2, Upload,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { lectureService } from "@/services/lecture";
import { examPaperService } from "@/services/examPaper";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type {
  Lecture, ExamPaper, Courseware, Material,
  TreeNode, FilterLogic,
  CoursewareType, MaterialType, ResourceSemester,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";

type ResourceTab = "lecture" | "examPaper" | "courseware" | "material";
type LeftTab = "chapter" | "knowledge";
type SortKey = "updated" | "created" | "title";

const tabConfig: { key: ResourceTab; label: string; icon: typeof FileText; description: string }[] = [
  { key: "lecture", label: "讲义库", icon: FileText, description: "管理和创建教学讲义" },
  { key: "examPaper", label: "试卷库", icon: FileSpreadsheet, description: "管理试卷，支持拆解入题库" },
  { key: "courseware", label: "课件库", icon: Presentation, description: "管理课件资源，可在生成讲义时引用" },
  { key: "material", label: "素材库", icon: FileBox, description: "管理教学素材，可在生成讲义时引用" },
];

const sortOptions: { value: SortKey; label: string; icon: React.ReactNode }[] = [
  { value: "updated", label: "最近更新", icon: <Clock className="w-3.5 h-3.5" /> },
  { value: "created", label: "创建时间", icon: <Calendar className="w-3.5 h-3.5" /> },
  { value: "title", label: "标题排序", icon: <FileText className="w-3.5 h-3.5" /> },
];

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

export default function ResourceLibraryPage() {
  const navigate = useNavigate();
  const { teacher } = useAuthStore();
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear, defaultSemester } = useSchoolResourceOptions(teacher?.schoolId);
  const [activeTab, setActiveTab] = useState<ResourceTab>("lecture");
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

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [examPapers, setExamPapers] = useState<ExamPaper[]>([]);
  const [coursewares, setCoursewares] = useState<Courseware[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // 入库弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    content: "",
    type: "" as string,
    grade: "",
    schoolYear: "",
    semester: "上学期" as ResourceSemester,
  });
  const [creating, setCreating] = useState(false);

  // 拆解入题库
  const [extractTarget, setExtractTarget] = useState<{ id: string; type: "examPaper" | "lecture" } | null>(null);
  const [extracting, setExtracting] = useState(false);

  const schoolId = teacher?.schoolId || "sch-1";

  const loadAll = useCallback(async () => {
    setLoading(true);
    const filter = {
      keyword,
      chapterIds: checkedChapters,
      chapterLogic,
      knowledgePointIds: checkedKnowledge,
      knowledgeLogic,
      schoolId,
    };
    try {
      const [lecData, examData, cwData, matData] = await Promise.all([
        lectureService.listLectures({ ...filter, teacherId: teacher?.id }),
        examPaperService.listPapers(filter),
        coursewareService.listCoursewares(filter),
        materialService.listMaterials(filter),
      ]);
      setLectures(lecData);
      setExamPapers(examData);
      setCoursewares(cwData);
      setMaterials(matData);
    } catch (e) {
      console.error("加载资源失败", e);
    } finally {
      setLoading(false);
    }
  }, [keyword, checkedChapters, checkedKnowledge, chapterLogic, knowledgeLogic, schoolId, teacher?.id]);

  useEffect(() => {
    knowledgeService.getChapterTree(schoolId).then(setChapterTree);
    knowledgeService.getKnowledgeTree(schoolId).then(setKnowledgeTree);
  }, [schoolId]);

  useEffect(() => {
    const timer = setTimeout(() => loadAll(), 300);
    return () => clearTimeout(timer);
  }, [loadAll]);

  // 排序
  const sortedData = useMemo(() => {
    const sortByKey = <T extends { updatedAt: string; createdAt: string; title: string }>(arr: T[]) => {
      const sorted = [...arr];
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
    };
    switch (activeTab) {
      case "lecture": return sortByKey(lectures);
      case "examPaper": return sortByKey(examPapers);
      case "courseware": return sortByKey(coursewares);
      case "material": return sortByKey(materials);
    }
  }, [activeTab, lectures, examPapers, coursewares, materials, sortKey]);

  const currentTab = tabConfig.find((t) => t.key === activeTab)!;

  const handleOpenCreate = () => {
    setCreateForm({
      title: "",
      description: "",
      content: "",
      type: activeTab === "courseware" ? "ppt" : activeTab === "material" ? "text" : "",
      grade: defaultGrade,
      schoolYear: defaultSchoolYear,
      semester: defaultSemester,
    });
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.title.trim()) {
      toast.error("请输入标题");
      return;
    }
    if (!teacher) return;
    setCreating(true);
    try {
      const baseData = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        chapterIds: checkedChapters,
        knowledgePointIds: checkedKnowledge,
        grade: createForm.grade,
        schoolYear: createForm.schoolYear,
        semester: createForm.semester,
      };
      if (activeTab === "courseware") {
        await coursewareService.createCourseware(teacher.id, schoolId, {
          ...baseData,
          type: createForm.type as CoursewareType,
          content: createForm.content,
          tags: [],
        });
      } else if (activeTab === "material") {
        await materialService.createMaterial(teacher.id, schoolId, {
          ...baseData,
          type: createForm.type as MaterialType,
          content: createForm.content,
          tags: [],
        });
      } else if (activeTab === "examPaper") {
        await examPaperService.createPaper(teacher.id, schoolId, {
          ...baseData,
          duration: 90,
          totalScore: 100,
          questions: [],
        });
      }
      toast.success("入库成功");
      setCreateModalOpen(false);
      loadAll();
    } catch (e: any) {
      toast.error("入库失败", e?.message);
    } finally {
      setCreating(false);
    }
  };

  const handleExtractToQuestionBank = async () => {
    if (!extractTarget) return;
    setExtracting(true);
    try {
      if (extractTarget.type === "examPaper") {
        const ids = await examPaperService.extractToQuestionBank(extractTarget.id);
        toast.success(`已拆解 ${ids.length} 道题目入题库`);
      } else if (extractTarget.type === "lecture") {
        const lecture = await lectureService.getLecture(extractTarget.id);
        const questionSections = lecture.sections.filter((s) => s.type === "question" && s.questionId);
        let count = 0;
        for (const sec of questionSections) {
          if (sec.questionId) {
            const q = await questionService.getQuestion(sec.questionId);
            if (q) {
              count++;
            }
          }
        }
        toast.success(`讲义中包含 ${count} 道关联题目（已在题库中）`);
      }
      setExtractTarget(null);
      loadAll();
    } catch (e: any) {
      toast.error("拆解失败", e?.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个资源吗？")) return;
    try {
      if (activeTab === "courseware") await coursewareService.deleteCourseware(id);
      else if (activeTab === "material") await materialService.deleteMaterial(id);
      else if (activeTab === "examPaper") await examPaperService.deletePaper(id);
      toast.success("已删除");
      loadAll();
    } catch (e: any) {
      toast.error("删除失败", e?.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="资源库"
        description="统一管理讲义、试卷、课件、素材，共享章节目录和知识点目录"
        icon={<Library className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={handleOpenCreate}>
            <Plus className="w-4 h-4" />
            入库
          </Button>
        }
      />

      {/* Tab 切换 */}
      <div className="mb-4 border-b border-ink-200">
        <div className="flex gap-1">
          {tabConfig.map((tab) => {
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
      </div>

      <div className="mb-3 text-sm text-ink-500">{currentTab.description}</div>

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
              <SearchableTree
                data={chapterTree!}
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
              <SearchableTree
                data={knowledgeTree!}
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
            )}
          </Card>
        </div>

        {/* 右侧：资源列表 */}
        <div className="col-span-9">
          {/* 搜索与排序 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
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
                  <Button variant="gold" size="sm" onClick={handleOpenCreate}>
                    <Plus className="w-3.5 h-3.5" />
                    新建试卷
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=examPaper")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传试卷
                  </Button>
                </>
              )}
              {activeTab === "lecture" && (
                <>
                  <Button variant="gold" size="sm" onClick={handleOpenCreate}>
                    <Plus className="w-3.5 h-3.5" />
                    新建讲义
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=lecture")}>
                    <Upload className="w-3.5 h-3.5" />
                    上传讲义
                  </Button>
                </>
              )}
              {activeTab === "courseware" && (
                <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=courseware")}>
                  <Upload className="w-3.5 h-3.5" />
                  上传课件
                </Button>
              )}
              {activeTab === "material" && (
                <Button variant="outline" size="sm" onClick={() => navigate("/upload?type=material")}>
                  <Upload className="w-3.5 h-3.5" />
                  上传素材
                </Button>
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

          {/* 资源列表内容 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={24} />
            </div>
          ) : sortedData.length === 0 ? (
            <EmptyState
              icon={<currentTab.icon className="w-10 h-10 text-ink-200" />}
              title={`暂无${currentTab.label}资源`}
              description={`点击右上角「入库」按钮添加资源`}
            />
          ) : (
            <div className="space-y-3">
              {activeTab === "lecture" && (sortedData as Lecture[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                    { label: "内容", value: `${item.sections.length} 节` },
                    { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                  ]}
                  updatedAt={item.updatedAt}
                  onClick={() => navigate(`/lectures/${item.id}/edit`)}
                  onExtract={item.sections.some((s) => s.type === "question") ? () => setExtractTarget({ id: item.id, type: "lecture" }) : undefined}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}

              {activeTab === "examPaper" && (sortedData as ExamPaper[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                    { label: "题目", value: `${item.questions.length} 题` },
                    { label: "总分", value: `${item.totalScore} 分` },
                    { label: "时长", value: `${item.duration} 分钟` },
                    { label: "状态", value: item.status === "published" ? "已发布" : "草稿" },
                  ]}
                  updatedAt={item.updatedAt}
                  onExtract={() => setExtractTarget({ id: item.id, type: "examPaper" })}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}

              {activeTab === "courseware" && (sortedData as Courseware[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: coursewareTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}

              {activeTab === "material" && (sortedData as Material[]).map((item) => (
                <ResourceCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  meta={[
                    { label: "类型", value: materialTypeLabel[item.type] },
                    { label: "年级", value: `${item.grade} · ${item.schoolYear}` },
                    { label: "标签", value: item.tags.join("、") || "无" },
                  ]}
                  content={item.content}
                  updatedAt={item.updatedAt}
                  onDelete={() => handleDelete(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 入库弹窗 */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={`入库 · ${currentTab.label}`}
        description={`将新的${currentTab.label}资源入库，关联选中的章节和知识点`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>取消</Button>
            <Button variant="gold" onClick={handleCreate} loading={creating}>确认入库</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="标题"
            placeholder={`请输入${currentTab.label}标题`}
            value={createForm.title}
            onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
          />
          <Input
            label="描述"
            placeholder="简要描述（可选）"
            value={createForm.description}
            onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
          />
          {(activeTab === "courseware" || activeTab === "material") && (
            <>
              <Select
                label="类型"
                value={createForm.type}
                onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
                options={
                  activeTab === "courseware"
                    ? [
                        { value: "ppt", label: "PPT" },
                        { value: "pdf", label: "PDF" },
                        { value: "video", label: "视频" },
                        { value: "image", label: "图片" },
                        { value: "other", label: "其他" },
                      ]
                    : [
                        { value: "text", label: "文本" },
                        { value: "image", label: "图片" },
                        { value: "audio", label: "音频" },
                        { value: "video", label: "视频" },
                        { value: "link", label: "链接" },
                        { value: "file", label: "文件" },
                      ]
                }
              />
              <Textarea
                label="内容"
                placeholder="输入内容摘要或文本内容..."
                value={createForm.content}
                onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                rows={5}
              />
            </>
          )}
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="年级"
              value={createForm.grade}
              options={gradeOptions}
              onChange={(e) => setCreateForm({ ...createForm, grade: e.target.value })}
            />
            <Select
              label="学年"
              value={createForm.schoolYear}
              options={schoolYearOptions}
              onChange={(e) => setCreateForm({ ...createForm, schoolYear: e.target.value })}
            />
            <Select
              label="学期"
              value={createForm.semester}
              options={semesterOptions}
              onChange={(e) => setCreateForm({ ...createForm, semester: e.target.value as ResourceSemester })}
            />
          </div>
          {(checkedChapters.length > 0 || checkedKnowledge.length > 0) && (
            <div className="text-xs text-ink-500 bg-mist/50 p-2 rounded">
              已关联：{checkedChapters.length} 个章节，{checkedKnowledge.length} 个知识点
            </div>
          )}
        </div>
      </Modal>

      {/* 拆解入题库确认 */}
      <Modal
        open={!!extractTarget}
        onClose={() => setExtractTarget(null)}
        title="拆解入题库"
        description="将该资源中的题目、答案、解析、知识点拆解到题库中"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExtractTarget(null)}>取消</Button>
            <Button variant="gold" onClick={handleExtractToQuestionBank} loading={extracting}>
              <Sparkles className="w-4 h-4" />
              确认拆解
            </Button>
          </div>
        }
      >
        <div className="text-sm text-ink-600 space-y-2">
          <p>拆解操作将：</p>
          <ul className="list-disc list-inside text-xs text-ink-500 space-y-1 ml-2">
            <li>提取资源中所有题目到题库</li>
            <li>保留题目的题干、选项、答案、解析</li>
            <li>自动关联资源的章节和知识点</li>
            <li>已关联题库的题目将跳过，避免重复</li>
          </ul>
        </div>
      </Modal>
    </div>
  );
}

// ============ 资源卡片组件 ============
interface ResourceCardProps {
  title: string;
  description?: string;
  meta: { label: string; value: string }[];
  content?: string;
  updatedAt: string;
  onClick?: () => void;
  onExtract?: () => void;
  onDelete?: () => void;
}

function ResourceCard({ title, description, meta, content, updatedAt, onClick, onExtract, onDelete }: ResourceCardProps) {
  return (
    <div className="card-base p-4 hover:shadow-cardHover transition-all group">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div
            className={cn("font-medium text-ink-900 mb-1", onClick && "cursor-pointer hover:text-gold-700")}
            onClick={onClick}
          >
            {title}
          </div>
          {description && (
            <div className="text-xs text-ink-500 mb-2 line-clamp-1">{description}</div>
          )}
          {content && (
            <div className="text-xs text-ink-600 mb-2 line-clamp-2 leading-relaxed bg-mist/40 p-2 rounded">
              {content}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
            {meta.map((m, i) => (
              <span key={i}>
                <span className="text-ink-300">{m.label}：</span>
                <span className="text-ink-600">{m.value}</span>
              </span>
            ))}
            <span className="ml-auto text-ink-300">{timeAgo(updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onClick && (
            <button
              onClick={onClick}
              className="p-1.5 rounded text-ink-400 hover:bg-mist hover:text-ink-700"
              title="查看/编辑"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {onExtract && (
            <button
              onClick={onExtract}
              className="p-1.5 rounded text-ink-400 hover:bg-gold-100 hover:text-gold-700"
              title="拆解入题库"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
