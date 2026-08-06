import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  FileSpreadsheet, FileText, Presentation, FileBox,
  Upload, CheckCircle2, AlertCircle, FileUp, Loader2, X,
  Download, Wand2, Share2,
  FileQuestion, Blocks, ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { examPaperService } from "@/services/examPaper";
import { coursewareService } from "@/services/courseware";
import { materialService } from "@/services/material";
import { lectureService } from "@/services/lecture";
import { knowledgeService } from "@/services/knowledge";
import { aiService } from "@/services/ai";
import { uploadFile as uploadStoredFile } from "@/services/api";
import { shareService } from "@/services/share";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import { useDocumentTypeOptions } from "@/hooks/useDocumentTypeOptions";
import { useQuestionMetadataOptions } from "@/hooks/useQuestionMetadataOptions";
import type {
  TreeNode, FilterLogic, CoursewareType, MaterialType,
  ShareRecord, ResourceSemester,
} from "@/types";
import { timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { inferMaterialTypeFromFile } from "@/lib/material-media";
import { countPptxSlides } from "@/lib/pptx";

type TabKey = "upload" | "share" | "ai";

// ============ 类型定义 ============

type ResourceType = "examPaper" | "lecture" | "courseware" | "material";

interface BatchFileItem {
  id: string; // 临时ID
  file: File;
  title: string;
  description: string;
  // 单独覆盖属性（为空时使用公共属性）
  grade?: string;
  schoolYear?: string;
  semester?: ResourceSemester;
  chapterIds?: string[];
  knowledgePointIds?: string[];
  // 资源类型特定属性
  coursewareType?: string;
  materialType?: string;
  // 上传状态
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  createdResourceId?: string;
}

// ============ 常量 ============

const resourceTypes: {
  key: ResourceType;
  label: string;
  icon: typeof FileSpreadsheet;
  description: string;
  supportsAIExtract: boolean;
  formats: string;
}[] = [
  { key: "examPaper", label: "试卷", icon: FileSpreadsheet, description: "Word/PDF版试卷，上传后可在资源库中进行文档拆解", supportsAIExtract: true, formats: ".doc,.docx,.pdf" },
  { key: "lecture", label: "讲义", icon: FileText, description: "Word/PDF版讲义，上传后可在资源库中进行文档拆解", supportsAIExtract: true, formats: ".doc,.docx,.pdf" },
  { key: "courseware", label: "课件", icon: Presentation, description: "PPT、几何画板、视频等课件", supportsAIExtract: false, formats: ".ppt,.pptx,.ggb,.pdf,.mp4,.jpg,.png" },
  { key: "material", label: "素材", icon: FileBox, description: "文本、图片、音视频等素材", supportsAIExtract: false, formats: ".txt,.jpg,.png,.mp3,.mp4,.pdf" },
];

const coursewareTypeOptions = [
  { value: "ppt", label: "PPT" },
  { value: "ggb", label: "GeoGebra" },
  { value: "pdf", label: "PDF" },
  { value: "video", label: "视频" },
  { value: "image", label: "图片" },
  { value: "other", label: "其他" },
];

const materialTypeOptions = [
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "link", label: "链接" },
  { value: "file", label: "文件" },
];

const aiGenTypes = [
  { key: "question", label: "题目", icon: FileQuestion, desc: "生成选择题、填空题、解答题等" },
  { key: "knowledge", label: "知识块", icon: Blocks, desc: "生成知识点总结、概念解析" },
];

// ============ 辅助函数 ============

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function detectOriginalFileType(fileName: string): "word" | "pdf" | undefined {
  if (/\.docx?$/i.test(fileName)) return "word";
  if (/\.pdf$/i.test(fileName)) return "pdf";
  return undefined;
}

const shareTypeLabels: Record<ShareRecord["resourceType"], string> = {
  question: "题目",
  examPaper: "试卷",
  lecture: "讲义",
  courseware: "课件",
  material: "素材",
};

const shareScopeLabels: Record<ShareRecord["scope"], string> = {
  friends: "指定教师",
  school: "本校",
  public: "平台公开",
};

let batchFileIdCounter = 0;
function genBatchFileId(): string {
  batchFileIdCounter += 1;
  return `bf-${Date.now()}-${batchFileIdCounter}`;
}

// ============ 主组件 ============

export function UploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { teacher } = useAuthStore();
  const { getLabel: getQuestionTypeLabel } = useQuestionTypeOptions(teacher?.schoolId);
  const { gradeOptions, schoolYearOptions, semesterOptions, defaultGrade, defaultSchoolYear, defaultSemester } = useSchoolResourceOptions(teacher?.schoolId);
  const {
    examPaperTypeOptions,
    lectureTypeOptions,
    defaultExamPaperTypeId,
    defaultLectureTypeId,
    ready: documentTypesReady,
  } = useDocumentTypeOptions(teacher?.schoolId);
  const {
    sourceOptions,
    categoryOptions,
    defaultSource,
    defaultCategory,
    ready: metadataReady,
  } = useQuestionMetadataOptions(teacher?.schoolId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("upload");

  // 上传相关状态
  const typeFromUrl = searchParams.get("type") as ResourceType | null;
  const [selectedType, setSelectedType] = useState<ResourceType>(typeFromUrl || "lecture");
  const [batchFiles, setBatchFiles] = useState<BatchFileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // 公共属性
  const [grade, setGrade] = useState("");
  const [schoolYear, setSchoolYear] = useState("");
  const [semester, setSemester] = useState<ResourceSemester>("上学期");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [checkedChapters, setCheckedChapters] = useState<string[]>([]);
  const [checkedKnowledge, setCheckedKnowledge] = useState<string[]>([]);
  const [chapterLogic, setChapterLogic] = useState<FilterLogic>("or");
  const [knowledgeLogic, setKnowledgeLogic] = useState<FilterLogic>("or");
  const [coursewareType, setCoursewareType] = useState<string>("ppt");
  const [materialType, setMaterialType] = useState<string>("text");
  const [examPaperTypeId, setExamPaperTypeId] = useState("");
  const [lectureTypeId, setLectureTypeId] = useState("");
  const [questionSourceType, setQuestionSourceType] = useState("");
  const [questionCategory, setQuestionCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedFileIds, setExpandedFileIds] = useState<Set<string>>(new Set());

  // AI生成相关状态
  const [aiGenType, setAiGenType] = useState<string>("question");
  const [aiKeyword, setAiKeyword] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState("3");
  const [aiCount, setAiCount] = useState("5");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // 接受分享相关状态
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [incomingShares, setIncomingShares] = useState<ShareRecord[]>([]);

  useEffect(() => {
    if (!grade && defaultGrade) setGrade(defaultGrade);
    if (!schoolYear && defaultSchoolYear) setSchoolYear(defaultSchoolYear);
    if (!semester) setSemester(defaultSemester);
  }, [grade, schoolYear, semester, defaultGrade, defaultSchoolYear, defaultSemester]);

  useEffect(() => {
    if (!documentTypesReady) return;
    setExamPaperTypeId((current) =>
      examPaperTypeOptions.some((option) => option.value === current)
        ? current
        : defaultExamPaperTypeId,
    );
    setLectureTypeId((current) =>
      lectureTypeOptions.some((option) => option.value === current)
        ? current
        : defaultLectureTypeId,
    );
  }, [
    documentTypesReady,
    examPaperTypeOptions,
    lectureTypeOptions,
    defaultExamPaperTypeId,
    defaultLectureTypeId,
  ]);

  useEffect(() => {
    if (!metadataReady) return;
    setQuestionSourceType((current) =>
      sourceOptions.some((option) => option.value === current) ? current : defaultSource,
    );
    setQuestionCategory((current) =>
      categoryOptions.some((option) => option.value === current) ? current : defaultCategory,
    );
  }, [
    metadataReady,
    sourceOptions,
    categoryOptions,
    defaultSource,
    defaultCategory,
  ]);

  useEffect(() => {
    if (teacher?.schoolId) {
      knowledgeService.getChapterTree(teacher.schoolId).then(setChapterTree);
      knowledgeService.getKnowledgeTree(teacher.schoolId).then(setKnowledgeTree);
    }
  }, [teacher]);

  useEffect(() => {
    if (!teacher) return;
    shareService.listIncomingShares(teacher.id)
      .then(setIncomingShares)
      .catch((error) => toast.error("分享列表加载失败", error instanceof Error ? error.message : undefined));
  }, [teacher]);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const newItems: BatchFileItem[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error("文件过大", `${file.name} 超过 50MB 限制`);
        continue;
      }
      const title = file.name.replace(/\.[^.]+$/, "");
      newItems.push({
        id: genBatchFileId(),
        file,
        title,
        description: "",
        materialType: inferMaterialTypeFromFile(file),
        status: "pending",
      });
    }
    setBatchFiles((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
    }
    // 允许重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const updateBatchItem = useCallback((id: string, patch: Partial<BatchFileItem>) => {
    setBatchFiles((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const removeBatchItem = useCallback((id: string) => {
    setBatchFiles((prev) => prev.filter((it) => it.id !== id));
    setExpandedFileIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const resetBatch = () => {
    setBatchFiles([]);
    setExpandedFileIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleBatchSubmit = async () => {
    if (!teacher || !teacher.schoolId) {
      toast.error("请先登录", "未获取到教师信息");
      return;
    }
    if (!selectedType) {
      toast.error("请选择资源类型");
      return;
    }
    const pendingItems = batchFiles.filter((f) => f.status !== "done");
    if (pendingItems.length === 0) {
      toast.info("没有需要上传的文件");
      return;
    }
    for (const item of pendingItems) {
      if (!item.title.trim()) {
        toast.error("请填写标题", `文件 ${item.file.name} 缺少标题`);
        return;
      }
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;
    const currentType = selectedType;

    for (const item of pendingItems) {
      updateBatchItem(item.id, { status: "uploading", error: undefined });
      try {
        const finalGrade = item.grade || grade;
        const finalSchoolYear = item.schoolYear || schoolYear;
        const finalSemester = item.semester || semester;
        const finalChapterIds = item.chapterIds ?? checkedChapters;
        const finalKnowledgeIds = item.knowledgePointIds ?? checkedKnowledge;
        const baseInput = {
          title: item.title.trim(),
          description: item.description.trim() || undefined,
          chapterIds: finalChapterIds,
          knowledgePointIds: finalKnowledgeIds,
          grade: finalGrade,
          schoolYear: finalSchoolYear,
          semester: finalSemester,
        };

        let resourceId: string | null = null;
        const uploaded = await uploadStoredFile(item.file);

        if (currentType === "examPaper") {
          const originalFileType = detectOriginalFileType(item.file.name);
          const paper = await examPaperService.createPaper(
            teacher.id, teacher.schoolId, {
              ...baseInput,
              duration: 90,
              totalScore: 100,
              questions: [],
              typeId: examPaperTypeId || undefined,
              questionSourceType: questionSourceType || undefined,
              questionCategory: questionCategory || undefined,
              status: "draft",
              originalFileUrl: uploaded.url,
              originalFileName: item.file.name,
              originalFileType,
              originalFileSize: item.file.size,
            },
          );
          resourceId = paper.id;
        } else if (currentType === "lecture") {
          const originalFileType = detectOriginalFileType(item.file.name);
          const lecture = await lectureService.createLecture(
            teacher.id, teacher.schoolId, {
              ...baseInput,
              classIds: [],
              studentIds: [],
              typeId: lectureTypeId || undefined,
              questionSourceType: questionSourceType || undefined,
              questionCategory: questionCategory || undefined,
              sections: [{
                id: `sec-${Date.now()}-${item.id}`,
                title: item.title.trim(),
                type: "text" as const,
                content: item.description.trim() || "上传讲义内容",
                children: [],
              }],
              originalFileUrl: uploaded.url,
              originalFileName: item.file.name,
              originalFileType,
              originalFileSize: item.file.size,
            },
          );
          resourceId = lecture.id;
        } else if (currentType === "courseware") {
          const resolvedCoursewareType = (item.coursewareType || coursewareType) as CoursewareType;
          const pageCount = resolvedCoursewareType === "ppt"
            ? await countPptxSlides(item.file)
            : undefined;
          const cw = await coursewareService.createCourseware(
            teacher.id, teacher.schoolId, {
              ...baseInput,
              type: resolvedCoursewareType,
              content: item.description.trim() || item.file.name,
              fileUrl: uploaded.url,
              fileName: item.file.name,
              fileSize: item.file.size,
              pageCount,
              tags: [],
            },
          );
          resourceId = cw.id;
        } else if (currentType === "material") {
          const mat = await materialService.createMaterial(
            teacher.id, teacher.schoolId, {
              ...baseInput,
              type: (item.materialType || materialType) as MaterialType,
              content: item.description.trim() || item.file.name,
              fileUrl: uploaded.url,
              fileSize: item.file.size,
              tags: [],
            },
          );
          resourceId = mat.id;
        }

        updateBatchItem(item.id, {
          status: "done",
          createdResourceId: resourceId || undefined,
        });
        successCount += 1;
      } catch (err) {
        updateBatchItem(item.id, {
          status: "error",
          error: err instanceof Error ? err.message : "上传失败",
        });
        failCount += 1;
      }
    }

    setSubmitting(false);
    if (failCount === 0) {
      toast.success("批量上传完成", `共上传 ${successCount} 个文件`);
    } else {
      toast.warning(
        "批量上传完成",
        `成功 ${successCount} 个，失败 ${failCount} 个`,
      );
    }
  };

  const handleAIGenerate = async () => {
    if (!aiKeyword.trim()) {
      toast.error("请输入关键词");
      return;
    }
    setAiGenerating(true);
    setAiResult(null);
    try {
      const result = await aiService.generateTeachingResources(
        aiGenType as "question" | "knowledge",
        aiKeyword.trim(),
        Number(aiDifficulty),
        Number(aiCount),
      );
      setAiResult({
        ...result,
        items: result.items.map((item, index) => ({
          ...item,
          id: `ai-${index}`,
          accepted: false,
        })),
      });
      toast.success("AI生成完成", `共生成 ${result.items.length} 项内容`);
    } catch (error) {
      toast.error("AI生成失败", error instanceof Error ? error.message : undefined);
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAcceptShare = async (id: string) => {
    if (!teacher?.schoolId) return;
    try {
      await shareService.acceptShare(id, teacher.id, teacher.schoolId);
      setAcceptedIds((prev) => new Set(prev).add(id));
      setIncomingShares((prev) => prev.filter((item) => item.id !== id));
      toast.success("已保存到我的资源");
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "upload", label: "上传资源", icon: Upload },
    { key: "share", label: "接受分享", icon: Share2 },
    { key: "ai", label: "AI生成", icon: Wand2 },
  ];

  // 派生状态
  const doneCount = batchFiles.filter((f) => f.status === "done").length;
  const errorCount = batchFiles.filter((f) => f.status === "error").length;
  const allDone = batchFiles.length > 0 && doneCount === batchFiles.length;

  return (
    <div>
      <PageHeader
        title="获取资源"
        description="上传本地资源、接收他人分享、AI智能生成，多渠道获取教学资源"
        icon={<Download className="w-5 h-5" />}
      />

      {/* Tab切换 */}
      <div className="inline-flex rounded-lg border border-ink-200 bg-paper p-1 mb-6">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                isActive
                  ? "bg-ink-900 text-paper shadow"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 上传资源 Tab */}
      {activeTab === "upload" && (
        <div>
          {/* 资源类型选择 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {resourceTypes.map((rt) => {
              const Icon = rt.icon;
              const isActive = selectedType === rt.key;
              return (
                <button
                  key={rt.key}
                  onClick={() => {
                    setSelectedType(rt.key);
                    setBatchFiles([]);
                    setExpandedFileIds(new Set());
                    if (rt.key === "courseware") setCoursewareType("ppt");
                    if (rt.key === "material") setMaterialType("text");
                  }}
                  className={cn(
                    "text-left p-5 rounded-xl border-2 transition-all",
                    isActive
                      ? "border-gold-400 bg-gold-50/40 shadow-md"
                      : "border-ink-100 bg-paper hover:border-gold-200 hover:bg-mist",
                  )}
                >
                  <div className={cn(
                    "w-11 h-11 rounded-lg flex items-center justify-center mb-3 transition-colors",
                    isActive ? "bg-ink-900 text-gold-400" : "bg-ink-100 text-ink-600",
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-serif font-semibold text-base text-ink-900">{rt.label}</div>
                  <div className="text-xs text-ink-500 mt-1 leading-relaxed">{rt.description}</div>
                </button>
              );
            })}
          </div>

          {/* 批量上传表单 */}
          {selectedType && (
            <div className="space-y-5">
              {/* 公共属性 + 文件选择 */}
              <Card>
                <div className="space-y-5">
                  <div>
                    <div className="font-serif text-base font-semibold text-ink-900">公共属性</div>
                    <p className="text-xs text-ink-500 mt-1">
                      为批量上传的文件统一设置属性，单个文件可在文件列表中展开「高级设置」覆盖
                    </p>
                  </div>

                  <div
                    role="group"
                    aria-label="公共属性"
                    className={cn(
                      "grid gap-4",
                      selectedType === "examPaper" || selectedType === "lecture"
                        ? "md:grid-cols-3 xl:grid-cols-6"
                        : "md:grid-cols-2 lg:grid-cols-4",
                    )}
                  >
                    <Select
                      label="年级"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      options={gradeOptions}
                    />
                    <Select
                      label="学年"
                      value={schoolYear}
                      onChange={(e) => setSchoolYear(e.target.value)}
                      options={schoolYearOptions}
                    />
                    <Select
                      label="学期"
                      value={semester}
                      onChange={(e) => setSemester(e.target.value as ResourceSemester)}
                      options={semesterOptions}
                    />
                    {(selectedType === "examPaper" || selectedType === "lecture") && (
                      <>
                        {selectedType === "examPaper" ? (
                          <Select
                            label="试卷类型"
                            value={examPaperTypeId}
                            onChange={(e) => setExamPaperTypeId(e.target.value)}
                            options={examPaperTypeOptions}
                          />
                        ) : (
                          <Select
                            label="讲义类型"
                            value={lectureTypeId}
                            onChange={(e) => setLectureTypeId(e.target.value)}
                            options={lectureTypeOptions}
                          />
                        )}
                        <Select
                          label="来源"
                          value={questionSourceType}
                          onChange={(e) => setQuestionSourceType(e.target.value)}
                          options={sourceOptions}
                        />
                        <Select
                          label="题类"
                          value={questionCategory}
                          onChange={(e) => setQuestionCategory(e.target.value)}
                          options={categoryOptions}
                        />
                      </>
                    )}
                    {selectedType === "courseware" && (
                      <Select
                        label="课件类型（默认）"
                        value={coursewareType}
                        onChange={(e) => setCoursewareType(e.target.value)}
                        options={coursewareTypeOptions}
                      />
                    )}
                    {selectedType === "material" && (
                      <Select
                        label="素材类型（默认）"
                        value={materialType}
                        onChange={(e) => setMaterialType(e.target.value)}
                        options={materialTypeOptions}
                      />
                    )}
                  </div>

                  {/* 章节目录 + 知识点目录 */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-ink-100 overflow-hidden">
                      {chapterTree ? (
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
                        <div className="p-6 text-center text-xs text-ink-400">
                          <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                          加载章节目录...
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-ink-100 overflow-hidden">
                      {knowledgeTree ? (
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
                        <div className="p-6 text-center text-xs text-ink-400">
                          <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                          加载知识点目录...
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-ink-400 -mt-2">
                    提示：也可以暂时不选择，自动进入「未分类」
                  </p>

                  {/* 文件选择区域 */}
                  <div>
                    <div className="block text-sm font-medium text-ink-700 mb-1.5">选择文件（支持多选）</div>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                          fileInputRef.current.click();
                        }
                      }}
                      className={cn(
                        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all select-none",
                        dragOver
                          ? "border-gold-400 bg-gold-50/40"
                          : "border-ink-200 hover:border-gold-300 hover:bg-mist",
                      )}
                    >
                      {batchFiles.length > 0 ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileUp className="w-6 h-6 text-gold-500" />
                          <div className="text-left">
                            <div className="text-sm font-medium text-ink-900">
                              已选择 {batchFiles.length} 个文件
                            </div>
                            <div className="text-xs text-ink-500">点击继续添加，或拖拽文件到此处</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mx-auto text-ink-300 mb-2" />
                          <div className="text-sm text-ink-700">拖拽文件到此处，或点击选择多个文件</div>
                          <div className="text-xs text-ink-400 mt-1">
                            支持格式：{resourceTypes.find((r) => r.key === selectedType)?.formats}
                          </div>
                        </>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={resourceTypes.find((r) => r.key === selectedType)?.formats}
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                </div>
              </Card>

              {/* 文件列表 */}
              {batchFiles.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="font-serif text-base font-semibold text-ink-900">
                      文件列表（{batchFiles.length}）
                    </div>
                    <div className="flex items-center gap-2">
                      {doneCount > 0 && (
                        <Badge variant="green">已完成 {doneCount}</Badge>
                      )}
                      {errorCount > 0 && (
                        <Badge variant="red">失败 {errorCount}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetBatch}
                        disabled={submitting}
                      >
                        <X className="w-3.5 h-3.5" />
                        清空
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {batchFiles.map((item, idx) => {
                      const expanded = expandedFileIds.has(item.id);
                      const itemChapterIds = item.chapterIds ?? [];
                      const itemKnowledgeIds = item.knowledgePointIds ?? [];
                      const hasOverride = Boolean(
                        item.grade || item.schoolYear || item.semester
                          || item.chapterIds?.length
                          || item.knowledgePointIds?.length,
                      );
                      const isLocked = item.status === "uploading" || item.status === "done";
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-lg border bg-paper p-4 transition-all",
                            item.status === "done"
                              ? "border-emerald-200"
                              : item.status === "error"
                                ? "border-red-200"
                                : item.status === "uploading"
                                  ? "border-gold-300"
                                  : "border-ink-100",
                          )}
                        >
                          {/* 文件头部 */}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="text-xs font-mono text-ink-500 flex-shrink-0">#{idx + 1}</span>
                              <FileText className="w-4 h-4 text-ink-500 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-ink-900 truncate">{item.file.name}</div>
                                <div className="text-xs text-ink-500">{formatFileSize(item.file.size)}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {item.status === "pending" && <Badge variant="default">待上传</Badge>}
                              {item.status === "uploading" && (
                                <Badge variant="gold">
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  上传中
                                </Badge>
                              )}
                              {item.status === "done" && (
                                <Badge variant="green">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  已上传
                                </Badge>
                              )}
                              {item.status === "error" && (
                                <Badge variant="red">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  失败
                                </Badge>
                              )}
                              {item.status !== "uploading" && (
                                <button
                                  onClick={() => removeBatchItem(item.id)}
                                  className="p-1 rounded text-ink-400 hover:bg-mist hover:text-red-500"
                                  title="移除"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 错误信息 */}
                          {item.status === "error" && item.error && (
                            <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                              {item.error}
                            </div>
                          )}

                          {/* 标题 + 类型 */}
                          <div className="grid md:grid-cols-2 gap-3">
                            <Input
                              label="标题"
                              value={item.title}
                              onChange={(e) => updateBatchItem(item.id, { title: e.target.value })}
                              placeholder="资源标题"
                              disabled={isLocked}
                            />
                            {selectedType === "courseware" && (
                              <Select
                                label="课件类型"
                                value={item.coursewareType || coursewareType}
                                onChange={(e) => updateBatchItem(item.id, { coursewareType: e.target.value })}
                                options={coursewareTypeOptions}
                                disabled={isLocked}
                              />
                            )}
                            {selectedType === "material" && (
                              <Select
                                label="素材类型"
                                value={item.materialType || materialType}
                                onChange={(e) => updateBatchItem(item.id, { materialType: e.target.value })}
                                options={materialTypeOptions}
                                disabled={isLocked}
                              />
                            )}
                          </div>

                          {/* 描述 */}
                          <div className="mt-3">
                            <Textarea
                              label="描述"
                              value={item.description}
                              onChange={(e) => updateBatchItem(item.id, { description: e.target.value })}
                              placeholder="简要描述资源内容（可选）"
                              rows={2}
                              disabled={isLocked}
                            />
                          </div>

                          {/* 高级设置（覆盖公共属性） */}
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center gap-1 text-xs text-ink-600 hover:text-ink-900"
                              disabled={item.status === "uploading"}
                            >
                              {expanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                              高级设置（覆盖公共属性）
                              {hasOverride && <Badge variant="gold">已覆盖</Badge>}
                            </button>
                            {expanded && (
                              <div className="mt-3 space-y-3 p-3 rounded-lg bg-mist/40 border border-ink-100">
                                <div className="grid md:grid-cols-3 gap-3">
                                  <Select
                                    label="年级（覆盖）"
                                    value={item.grade || ""}
                                    onChange={(e) => updateBatchItem(item.id, {
                                      grade: e.target.value || undefined,
                                    })}
                                    options={[{ value: "", label: "使用公共属性" }, ...gradeOptions]}
                                    disabled={item.status === "uploading"}
                                  />
                                  <Select
                                    label="学年（覆盖）"
                                    value={item.schoolYear || ""}
                                    onChange={(e) => updateBatchItem(item.id, {
                                      schoolYear: e.target.value || undefined,
                                    })}
                                    options={[{ value: "", label: "使用公共属性" }, ...schoolYearOptions]}
                                    disabled={item.status === "uploading"}
                                  />
                                  <Select
                                    label="学期（覆盖）"
                                    value={item.semester || ""}
                                    onChange={(e) => updateBatchItem(item.id, {
                                      semester: (e.target.value || undefined) as ResourceSemester | undefined,
                                    })}
                                    options={[{ value: "", label: "使用公共属性" }, ...semesterOptions]}
                                    disabled={item.status === "uploading"}
                                  />
                                </div>
                                <div className="grid md:grid-cols-2 gap-3">
                                  <div className="rounded-lg border border-ink-100 overflow-hidden max-h-64 overflow-y-auto">
                                    {chapterTree ? (
                                      <SearchableTree
                                        data={chapterTree}
                                        title="章节目录（覆盖）"
                                        accent="gold"
                                        checkable
                                        checkedIds={itemChapterIds}
                                        onCheck={(ids) => updateBatchItem(item.id, { chapterIds: ids })}
                                        searchPlaceholder="搜索章节..."
                                      />
                                    ) : (
                                      <div className="p-4 text-center text-xs text-ink-400">
                                        <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                                        加载中...
                                      </div>
                                    )}
                                  </div>
                                  <div className="rounded-lg border border-ink-100 overflow-hidden max-h-64 overflow-y-auto">
                                    {knowledgeTree ? (
                                      <SearchableTree
                                        data={knowledgeTree}
                                        title="知识点目录（覆盖）"
                                        accent="teal"
                                        checkable
                                        checkedIds={itemKnowledgeIds}
                                        onCheck={(ids) => updateBatchItem(item.id, { knowledgePointIds: ids })}
                                        searchPlaceholder="搜索知识点..."
                                      />
                                    ) : (
                                      <div className="p-4 text-center text-xs text-ink-400">
                                        <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                                        加载中...
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-end">
                                  <button
                                    type="button"
                                    onClick={() => updateBatchItem(item.id, {
                                      grade: undefined,
                                      schoolYear: undefined,
                                      semester: undefined,
                                      chapterIds: undefined,
                                      knowledgePointIds: undefined,
                                    })}
                                    className="text-xs text-ink-500 hover:text-ink-900"
                                    disabled={item.status === "uploading"}
                                  >
                                    清除覆盖
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>

                  {/* 整体进度 */}
                  {submitting && (
                    <div className="mt-4 p-3 rounded-lg border border-gold-200 bg-gold-50/40">
                      <div className="flex items-center justify-between text-sm text-ink-700 mb-2">
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-gold-500 animate-spin" />
                          正在上传...
                        </span>
                        <span className="font-mono text-xs">
                          {doneCount}/{batchFiles.length}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-300"
                          style={{ width: `${batchFiles.length === 0 ? 0 : (doneCount / batchFiles.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 底部提交按钮 */}
                  <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-ink-100 flex-wrap">
                    <div className="text-sm text-ink-500">
                      共 {batchFiles.length} 个文件
                      {doneCount > 0 && !submitting && (
                        <span className="ml-2 text-emerald-600">· 已完成 {doneCount}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="gold"
                        onClick={handleBatchSubmit}
                        loading={submitting}
                        disabled={submitting || batchFiles.every((f) => f.status === "done")}
                      >
                        <Upload className="w-4 h-4" />
                        上传 {batchFiles.length} 个文件
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* 全部完成提示 */}
              {allDone && !submitting && (
                <Card>
                  <div className="text-center py-6">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
                    <div className="font-serif text-base font-semibold text-ink-900 mb-1">
                      全部上传完成
                    </div>
                    <div className="text-sm text-ink-500 mb-4">
                      共成功上传 {doneCount} 个文件
                    </div>
                    <Button variant="gold" onClick={() => navigate("/resources")}>
                      查看资源库
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* 接受分享 Tab */}
      {activeTab === "share" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm text-ink-600">
              他人分享给您的资源，确认后可保存到我的资源库
            </div>
          </Card>

          {incomingShares.length === 0 && (
            <Card className="p-8 text-center text-sm text-ink-400">暂无待接收的分享</Card>
          )}
          {incomingShares.map((item) => {
            const accepted = acceptedIds.has(item.id);
            return (
              <Card key={item.id} className="p-4 hover:shadow-cardHover transition-all">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900 mb-1">{item.resourceTitle}</div>
                    <div className="flex items-center gap-3 flex-wrap text-xs text-ink-400">
                      <Badge variant="ink">{shareTypeLabels[item.resourceType]}</Badge>
                      <span>来自教师：{item.fromTeacherId}</span>
                      <span>分享范围：{shareScopeLabels[item.scope]}</span>
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {accepted ? (
                      <Badge variant="green">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        已保存
                      </Badge>
                    ) : (
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => void handleAcceptShare(item.id)}
                      >
                        <Download className="w-3.5 h-3.5" />
                        保存到我的资源
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* AI生成 Tab */}
      {activeTab === "ai" && (
        <div className="grid grid-cols-12 gap-4">
          {/* 左侧配置 */}
          <div className="col-span-4">
            <Card>
              <div className="space-y-5">
                {/* 生成类型 */}
                <div>
                  <label className="block text-sm font-medium text-ink-700 mb-2">生成类型</label>
                  <div className="space-y-2">
                    {aiGenTypes.map((gt) => {
                      const Icon = gt.icon;
                      const isActive = aiGenType === gt.key;
                      return (
                        <button
                          key={gt.key}
                          onClick={() => setAiGenType(gt.key)}
                          className={cn(
                            "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                            isActive
                              ? "border-gold-400 bg-gold-50/40"
                              : "border-ink-200 hover:border-ink-300",
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0",
                            isActive ? "bg-ink-900 text-gold-400" : "bg-mist text-ink-500",
                          )}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-ink-900">{gt.label}</div>
                            <div className="text-xs text-ink-500 mt-0.5">{gt.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 关键词 */}
                <Textarea
                  label="关键词/主题"
                  value={aiKeyword}
                  onChange={(e) => setAiKeyword(e.target.value)}
                  placeholder="请输入关键词，如：集合、三角函数、立体几何..."
                  rows={3}
                />

                {/* 难度/数量 */}
                {aiGenType === "question" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="难度"
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value)}
                      options={[
                        { value: "1", label: "简单" },
                        { value: "2", label: "较易" },
                        { value: "3", label: "中等" },
                        { value: "4", label: "较难" },
                        { value: "5", label: "困难" },
                      ]}
                    />
                    <Select
                      label="数量"
                      value={aiCount}
                      onChange={(e) => setAiCount(e.target.value)}
                      options={[
                        { value: "3", label: "3道" },
                        { value: "5", label: "5道" },
                        { value: "10", label: "10道" },
                        { value: "20", label: "20道" },
                      ]}
                    />
                  </div>
                )}

                {/* 章节目录 */}
                <div className="rounded-lg border border-ink-100 overflow-hidden max-h-52">
                  {chapterTree ? (
                    <SearchableTree
                      data={chapterTree}
                      title="关联章节"
                      accent="gold"
                      checkable
                      checkedIds={checkedChapters}
                      onCheck={setCheckedChapters}
                      searchPlaceholder="搜索章节..."
                    />
                  ) : (
                    <div className="p-6 text-center text-xs text-ink-400">
                      <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                      加载章节目录...
                    </div>
                  )}
                </div>

                {/* 知识点 */}
                <div className="rounded-lg border border-ink-100 overflow-hidden max-h-52">
                  {knowledgeTree ? (
                    <SearchableTree
                      data={knowledgeTree}
                      title="关联知识点"
                      accent="teal"
                      checkable
                      checkedIds={checkedKnowledge}
                      onCheck={setCheckedKnowledge}
                      searchPlaceholder="搜索知识点..."
                    />
                  ) : (
                    <div className="p-6 text-center text-xs text-ink-400">
                      <Loader2 className="w-4 h-4 mx-auto mb-1 animate-spin" />
                      加载知识点目录...
                    </div>
                  )}
                </div>

                <Button
                  variant="gold"
                  className="w-full"
                  onClick={handleAIGenerate}
                  loading={aiGenerating}
                >
                  <Wand2 className="w-4 h-4" />
                  开始生成
                </Button>
              </div>
            </Card>
          </div>

          {/* 右侧结果 */}
          <div className="col-span-8">
            {aiGenerating ? (
              <Card>
                <div className="py-16 text-center">
                  <Loader2 className="w-10 h-10 mx-auto text-gold-500 animate-spin mb-4" />
                  <div className="text-sm text-ink-700 mb-1">AI正在生成中...</div>
                  <div className="text-xs text-ink-400">请稍候，正在为您生成优质{aiGenTypes.find((t) => t.key === aiGenType)?.label}</div>
                </div>
              </Card>
            ) : aiResult ? (
              <div className="space-y-4">
                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <div className="font-serif text-base font-semibold text-ink-900">
                      生成结果（{aiResult.items.length}）
                    </div>
                    <Button variant="gold" size="sm">
                      <Download className="w-3.5 h-3.5" />
                      全部入库
                    </Button>
                  </div>

                  {aiResult.type === "question" && (
                    <div className="space-y-3">
                      {aiResult.items.map((q: any, i: number) => (
                        <div
                          key={q.id}
                          className="p-3 rounded-lg border border-ink-100 hover:border-gold-200 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              defaultChecked
                              className="mt-1 w-4 h-4 accent-gold-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-ink-500">#{i + 1}</span>
                                <Badge variant="ink">{getQuestionTypeLabel(q.type)}</Badge>
                              </div>
                              <div className="text-sm text-ink-900 mb-2">{q.stem}</div>
                              {q.options && (
                                <div className="text-xs text-ink-600 space-y-1 mb-2 ml-2">
                                  {q.options.map((opt: string, idx: number) => (
                                    <div key={idx}>
                                      {String.fromCharCode(65 + idx)}. {opt}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="text-xs text-ink-500">
                                <span className="text-emerald-600 font-medium">答案：</span>{q.answer}
                              </div>
                              <div className="text-xs text-ink-500 mt-1">
                                <span className="text-gold-600 font-medium">解析：</span>{q.analysis}
                              </div>
                            </div>
                            <Button variant="outline" size="sm">编辑</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiResult.type === "knowledge" && (
                    <div className="space-y-3">
                      {aiResult.items.map((k: any, i: number) => (
                        <div
                          key={k.id}
                          className="p-3 rounded-lg border border-ink-100 hover:border-gold-200 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              defaultChecked
                              className="mt-1 w-4 h-4 accent-gold-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono text-ink-500">#{i + 1}</span>
                                <Badge variant="teal">知识块</Badge>
                              </div>
                              <div className="text-sm font-medium text-ink-900 mb-1">{k.title}</div>
                              <div className="text-xs text-ink-600 leading-relaxed">{k.content}</div>
                            </div>
                            <Button variant="outline" size="sm">编辑</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </Card>
              </div>
            ) : (
              <Card>
                <div className="py-16 text-center">
                  <Wand2 className="w-12 h-12 mx-auto text-ink-300 mb-3" />
                  <div className="text-sm text-ink-500 mb-1">选择生成类型并填写关键词</div>
                  <div className="text-xs text-ink-400">AI将为您智能生成高质量教学资源</div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadPage;
