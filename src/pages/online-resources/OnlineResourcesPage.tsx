import { useState, useEffect, useCallback } from "react";
import {
  Search,
  TrendingUp,
  Sparkles,
  Eye,
  CheckCircle2,
  ExternalLink,
  Flame,
  CheckSquare,
  Square,
  FileQuestion,
  Globe,
  RefreshCw,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { onlineResourceService } from "@/services/onlineResource";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { formatDate, timeAgo } from "@/lib/service-utils";
import { cn } from "@/lib/utils";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { MathHtml } from "@/components/ui/MathHtml";
import { getDefaultQuestionTypeLabel } from "@/lib/question-types";
import type {
  OnlineResource,
  OnlineResourceType,
  OnlineResourceSearchParams,
  OnlineParsedQuestion,
} from "@/types";

// ============ 筛选选项 ============

const SUBJECT_OPTIONS = [
  { value: "数学", label: "数学" },
  { value: "语文", label: "语文" },
  { value: "英语", label: "英语" },
  { value: "物理", label: "物理" },
  { value: "化学", label: "化学" },
  { value: "生物", label: "生物" },
  { value: "政治", label: "政治" },
  { value: "历史", label: "历史" },
  { value: "地理", label: "地理" },
];

const YEAR_OPTIONS = [
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "2023", label: "2023" },
];

const REGION_OPTIONS = [
  { value: "全国", label: "全国" },
  { value: "北京", label: "北京" },
  { value: "上海", label: "上海" },
  { value: "广东", label: "广东" },
  { value: "江苏", label: "江苏" },
  { value: "浙江", label: "浙江" },
];

const TYPE_OPTIONS: { value: OnlineResourceType; label: string }[] = [
  { value: "paper", label: "试卷" },
  { value: "lecture", label: "讲义" },
  { value: "exercise", label: "练习" },
];

// ============ 文本映射 ============

const resourceTypeLabel: Record<OnlineResourceType, string> = {
  paper: "试卷",
  lecture: "讲义",
  exercise: "练习",
};

const difficultyLabel: Record<number, string> = {
  1: "简单",
  2: "较易",
  3: "中等",
  4: "较难",
  5: "困难",
};

// 难度徽章颜色
function difficultyVariant(d: number): "green" | "amber" | "red" {
  if (d <= 2) return "green";
  if (d === 3) return "amber";
  return "red";
}

// 置信度颜色
function confidenceColor(c: number): string {
  if (c >= 0.9) return "text-emerald-600";
  if (c >= 0.8) return "text-amber-600";
  return "text-red-600";
}

// ============ 主页面 ============

export default function OnlineResourcesPage() {
  const { teacher } = useAuthStore();
  const { gradeOptions } = useSchoolResourceOptions(teacher?.schoolId);

  // 筛选条件
  const [keyword, setKeyword] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [year, setYear] = useState("");
  const [region, setRegion] = useState("");
  const [type, setType] = useState("");

  // 结果列表
  const [resources, setResources] = useState<OnlineResource[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // AI 解析进度
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [parseProgress, setParseProgress] = useState(0);

  // 解析结果弹窗
  const [modalResource, setModalResource] = useState<OnlineResource | null>(null);
  const [modalQuestions, setModalQuestions] = useState<OnlineParsedQuestion[]>([]);
  const [importing, setImporting] = useState(false);

  // 初始加载热门资源
  useEffect(() => {
    loadHotResources();
  }, []);

  const loadHotResources = async () => {
    setSearching(true);
    try {
      const list = await onlineResourceService.getHotResources(12);
      setResources(list);
      setHasSearched(false);
    } catch (err) {
      toast.error("加载热门资源失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSearching(false);
    }
  };

  // 执行搜索
  const handleSearch = async () => {
    setSearching(true);
    const params: OnlineResourceSearchParams = {
      keyword: keyword.trim() || undefined,
      subject: subject || undefined,
      grade: grade || undefined,
      year: year || undefined,
      region: region || undefined,
      type: (type as OnlineResourceType) || undefined,
    };
    try {
      const list = await onlineResourceService.search(params);
      setResources(list);
      setHasSearched(true);
    } catch (err) {
      toast.error("搜索失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSearching(false);
    }
  };

  // 重置筛选
  const handleReset = () => {
    setKeyword("");
    setSubject("");
    setGrade("");
    setYear("");
    setRegion("");
    setType("");
    loadHotResources();
  };

  // 局部更新某张卡片状态
  const patchResource = useCallback(
    (id: string, patch: Partial<OnlineResource>) => {
      setResources((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  // AI 解析
  const handleParse = async (resource: OnlineResource) => {
    if (parsingId) return;
    setParsingId(resource.id);
    setParseProgress(0);
    // 乐观更新为「解析中」
    patchResource(resource.id, { status: "parsing" });

    // 远程抓取和 AI 解析期间显示受控的等待进度。
    const timer = setInterval(() => {
      setParseProgress((progress) => Math.min(progress + 3, 90));
    }, 200);

    try {
      const parsedQuestions = await onlineResourceService.parseResource(resource.id);
      setParseProgress(100);
      patchResource(resource.id, {
        status: "parsed",
        parsedQuestions,
        questionCount: parsedQuestions.length,
      });
      toast.success("AI 解析完成", `共解析出 ${parsedQuestions.length} 道题目`);
    } catch (err) {
      patchResource(resource.id, { status: "failed" });
      toast.error("AI 解析失败", err instanceof Error ? err.message : undefined);
    } finally {
      clearInterval(timer);
      setTimeout(() => {
        setParsingId(null);
        setParseProgress(0);
      }, 500);
    }
  };

  // 打开解析结果弹窗
  const handleViewResults = (resource: OnlineResource) => {
    setModalResource(resource);
    setModalQuestions(resource.parsedQuestions ? [...resource.parsedQuestions] : []);
  };

  // 切换单题选中状态
  const handleToggleQuestion = async (questionId: string) => {
    const target = modalQuestions.find((q) => q.id === questionId);
    if (!target || !modalResource) return;
    const nextSelected = !target.selected;
    // 本地立即更新
    setModalQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, selected: nextSelected } : q)),
    );
    // 持久化到服务端（静默）
    try {
      await onlineResourceService.updateQuestionSelection(
        modalResource.id,
        questionId,
        nextSelected,
      );
    } catch {
      // 回滚
      setModalQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, selected: !nextSelected } : q)),
      );
      toast.error("更新选中状态失败");
    }
  };

  // 全选 / 取消全选
  const handleToggleAll = async () => {
    if (!modalResource) return;
    const allSelected = modalQuestions.length > 0 && modalQuestions.every((q) => q.selected);
    const nextSelected = !allSelected;
    const updated = modalQuestions.map((q) => ({ ...q, selected: nextSelected }));
    setModalQuestions(updated);
    // 批量持久化
    try {
      await Promise.all(
        updated
          .filter((q, i) => q.selected !== modalQuestions[i].selected)
          .map((q) =>
            onlineResourceService.updateQuestionSelection(
              modalResource.id,
              q.id,
              q.selected,
            ),
          ),
      );
    } catch {
      toast.error("批量更新选中状态失败");
    }
  };

  // 导入选中题目到题库
  const handleImport = async () => {
    if (!modalResource || !teacher) return;
    if (!teacher.schoolId) {
      toast.error("导入失败", "当前账号未绑定学校，无法导入题库");
      return;
    }
    const selectedIds = modalQuestions.filter((q) => q.selected).map((q) => q.id);
    if (selectedIds.length === 0) {
      toast.warning("请至少选择一道题目");
      return;
    }
    setImporting(true);
    try {
      const created = await onlineResourceService.importQuestions(
        modalResource.id,
        teacher.id,
        teacher.schoolId,
        selectedIds,
      );
      toast.success("导入成功", `共导入 ${created.length} 道题目到题库`);
      // 更新列表中该资源状态
      patchResource(modalResource.id, { status: "imported" });
      setModalResource(null);
      setModalQuestions([]);
    } catch (err) {
      toast.error("导入失败", err instanceof Error ? err.message : undefined);
    } finally {
      setImporting(false);
    }
  };

  const closeModal = () => {
    if (importing) return;
    setModalResource(null);
    setModalQuestions([]);
  };

  // 弹窗内派生状态
  const selectedCount = modalQuestions.filter((q) => q.selected).length;
  const allSelected = modalQuestions.length > 0 && modalQuestions.every((q) => q.selected);

  return (
    <div>
      <PageHeader
        title="网络资源"
        description="搜索当下热门试卷和讲义，AI 自动解析后入库"
        icon={<Globe className="w-5 h-5" />}
      />

      {/* 搜索筛选区 */}
      <Card className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <Input
              placeholder="搜索关键词：标题、描述、标签..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
          </div>
          <Select
            options={SUBJECT_OPTIONS}
            placeholder="学科"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <Select
            options={gradeOptions}
            placeholder="年级"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
          <Select
            options={YEAR_OPTIONS}
            placeholder="年份"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          <Select
            options={REGION_OPTIONS}
            placeholder="地区"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
          <Select
            options={TYPE_OPTIONS}
            placeholder="类型"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="gold" className="flex-1" onClick={handleSearch} loading={searching}>
              <Search className="w-4 h-4" />
              搜索
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={searching}>
              <RefreshCw className="w-4 h-4" />
              重置
            </Button>
          </div>
        </div>
      </Card>

      {/* 结果区标题 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 text-sm text-ink-600">
          {hasSearched ? (
            <>
              <Search className="w-4 h-4 text-gold-500" />
              <span>
                搜索结果 <span className="font-semibold text-ink-900">{resources.length}</span> 条
              </span>
            </>
          ) : (
            <>
              <Flame className="w-4 h-4 text-gold-500" />
              <span>
                热门资源 <span className="font-semibold text-ink-900">{resources.length}</span> 条
              </span>
            </>
          )}
        </div>
        {searching && <Spinner size={14} className="text-ink-400" />}
      </div>

      {/* 结果列表 */}
      {searching && resources.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Spinner size={28} className="text-gold-500" />}
            title="正在搜索资源..."
            description="正在从网络获取最新试卷与讲义"
          />
        </Card>
      ) : resources.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileQuestion className="w-7 h-7" />}
            title={hasSearched ? "未找到匹配的资源" : "暂无热门资源"}
            description={
              hasSearched
                ? "试试调整关键词或筛选条件后重新搜索"
                : "稍后再来看看，或主动搜索感兴趣的资源"
            }
            action={
              hasSearched ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  重置筛选
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              parsing={parsingId === resource.id}
              parseProgress={parseProgress}
              onParse={() => handleParse(resource)}
              onViewResults={() => handleViewResults(resource)}
            />
          ))}
        </div>
      )}

      {/* 解析结果弹窗 */}
      <Modal
        open={!!modalResource}
        onClose={closeModal}
        size="xl"
        title={modalResource?.title}
        description={
          modalResource
            ? `共 ${modalQuestions.length} 道题目 · 已选 ${selectedCount} 道`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={importing}>
              取消
            </Button>
            <Button
              variant="gold"
              onClick={handleImport}
              loading={importing}
              disabled={selectedCount === 0}
            >
              <Upload className="w-4 h-4" />
              导入选中题目到题库 ({selectedCount})
            </Button>
          </>
        }
      >
        {modalResource && (
          <div>
            {/* 全选工具栏 */}
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-ink-100">
              <button
                onClick={handleToggleAll}
                disabled={importing || modalQuestions.length === 0}
                className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-ink-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-gold-500" />
                ) : (
                  <Square className="w-4 h-4 text-ink-400" />
                )}
                {allSelected ? "取消全选" : "全选"}
              </button>
              <div className="text-xs text-ink-500">
                来源：{modalResource.source} · {modalResource.year} · {modalResource.region}
              </div>
            </div>

            {modalQuestions.length === 0 ? (
              <EmptyState
                icon={<FileQuestion className="w-7 h-7" />}
                title="暂无解析题目"
                description="该资源尚未解析出题目"
              />
            ) : (
              <div className="space-y-3">
                {modalQuestions.map((q, idx) => (
                  <ParsedQuestionItem
                    key={q.id}
                    question={q}
                    index={idx}
                    onToggle={() => handleToggleQuestion(q.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ============ 资源卡片 ============

interface ResourceCardProps {
  resource: OnlineResource;
  parsing: boolean;
  parseProgress: number;
  onParse: () => void;
  onViewResults: () => void;
}

function ResourceCard({
  resource,
  parsing,
  parseProgress,
  onParse,
  onViewResults,
}: ResourceCardProps) {
  // 状态徽章
  const renderStatusBadge = () => {
    switch (resource.status) {
      case "pending":
        return <Badge variant="default">待解析</Badge>;
      case "parsing":
        return (
          <Badge variant="teal">
            <Spinner size={11} />
            解析中
          </Badge>
        );
      case "parsed":
        return <Badge variant="green">已解析</Badge>;
      case "imported":
        return <Badge variant="gold">已导入</Badge>;
      case "failed":
        return <Badge variant="red">解析失败</Badge>;
      default:
        return null;
    }
  };

  // 操作按钮
  const renderAction = () => {
    switch (resource.status) {
      case "pending":
      case "failed":
        return (
          <Button variant="gold" size="sm" onClick={onParse} loading={parsing} disabled={parsing}>
            <Sparkles className="w-3.5 h-3.5" />
            AI 解析
          </Button>
        );
      case "parsing":
        return (
          <Button variant="outline" size="sm" disabled>
            <Spinner size={12} />
            解析中
          </Button>
        );
      case "parsed":
        return (
          <Button variant="ink" size="sm" onClick={onViewResults}>
            <Eye className="w-3.5 h-3.5" />
            查看解析结果
          </Button>
        );
      case "imported":
        return (
          <Button variant="outline" size="sm" disabled>
            <CheckCircle2 className="w-3.5 h-3.5" />
            已导入
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Card hoverable className="flex flex-col">
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-semibold text-ink-900 line-clamp-2 leading-snug">
            {resource.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-ink-500 mt-1">
            <span className="truncate">{resource.source}</span>
            <span className="text-ink-300">·</span>
            <span title={formatDate(resource.publishedAt, true)}>{timeAgo(resource.publishedAt)}</span>
          </div>
        </div>
        {renderStatusBadge()}
      </div>

      {/* 元信息徽章 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <Badge variant="ink">{resourceTypeLabel[resource.type]}</Badge>
        {resource.grade && <Badge variant="default">{resource.grade}</Badge>}
        {resource.year && <Badge variant="default">{resource.year}</Badge>}
        {resource.region && <Badge variant="default">{resource.region}</Badge>}
        {resource.subject && <Badge variant="teal">{resource.subject}</Badge>}
      </div>

      {/* 描述 */}
      {resource.description && (
        <p className="text-sm text-ink-600 line-clamp-2 leading-relaxed mb-2.5">
          {resource.description}
        </p>
      )}

      {/* 标签 */}
      {resource.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {resource.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 rounded bg-mist text-ink-500 border border-ink-100"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* 解析进度条 */}
      {parsing && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs text-ink-600 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-gold-500 animate-pulse-soft" />
              AI 正在解析题目与知识点...
            </span>
            <span className="font-mono">{Math.round(parseProgress)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-ink-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-200"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 底部：热度 / 题数 + 操作 */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-ink-100">
        <div className="flex items-center gap-4 text-xs text-ink-500">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-gold-500" />
            热度 <span className="font-mono font-semibold text-ink-700">{resource.hotness}</span>
          </span>
          <span className="flex items-center gap-1">
            <FileQuestion className="w-3.5 h-3.5 text-ink-400" />
            {resource.questionCount > 0 ? (
              <span className="font-mono font-semibold text-ink-700">{resource.questionCount} 题</span>
            ) : (
              <span>未解析</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {resource.sourceUrl && (
            <a
              href={resource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-ink-400 hover:bg-mist hover:text-ink-700 transition-colors"
              title="访问来源"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {renderAction()}
        </div>
      </div>
    </Card>
  );
}

// ============ 解析题目条目 ============

interface ParsedQuestionItemProps {
  question: OnlineParsedQuestion;
  index: number;
  onToggle: () => void;
}

function ParsedQuestionItem({ question: q, index, onToggle }: ParsedQuestionItemProps) {
  return (
    <div
      className={cn(
        "border rounded-lg p-3 transition-all",
        q.selected
          ? "border-gold-300 bg-gold-50/30"
          : "border-ink-100 bg-paper opacity-90",
      )}
    >
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 flex-shrink-0 text-ink-400 hover:text-gold-500 transition-colors"
          title={q.selected ? "取消选择" : "选择"}
        >
          {q.selected ? (
            <CheckSquare className="w-4 h-4 text-gold-500" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* 元信息行 */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="w-6 h-6 rounded-md bg-ink-900 text-gold-400 flex items-center justify-center font-mono text-xs font-bold flex-shrink-0">
              {index + 1}
            </span>
            <Badge variant="ink">{getDefaultQuestionTypeLabel(q.type)}</Badge>
            <Badge variant={difficultyVariant(q.difficulty)}>
              {difficultyLabel[q.difficulty]} · {q.difficulty}星
            </Badge>
            <span className="text-xs text-ink-500">
              AI 置信度{" "}
              <span className={cn("font-mono font-semibold", confidenceColor(q.confidence))}>
                {Math.round(q.confidence * 100)}%
              </span>
            </span>
          </div>

          {/* 题干 */}
          <MathHtml className="text-sm text-ink-900 leading-relaxed mb-2 whitespace-pre-wrap">
            {q.stem}
          </MathHtml>

          {/* 选项 */}
          {q.options && q.options.length > 0 && (
            <div className="space-y-1 mb-2">
              {q.options.map((opt, i) => {
                const isCorrect = q.answer.includes(String.fromCharCode(65 + i));
                return (
                  <div
                    key={i}
                    className={cn(
                      "text-xs p-2 rounded border flex items-start gap-2",
                      isCorrect
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-ink-100 bg-mist/40",
                    )}
                  >
                    <span className="font-mono font-semibold text-ink-700">
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <MathHtml className="min-w-0 text-ink-800">{opt}</MathHtml>
                  </div>
                );
              })}
            </div>
          )}

          {/* 答案 + 解析 */}
          <div className="grid sm:grid-cols-2 gap-2 mb-2">
            <div className="p-2 rounded bg-emerald-50/40 border border-emerald-200">
              <div className="text-emerald-700 font-medium mb-0.5 text-xs">答案</div>
              <MathHtml className="question-answer-content text-ink-900 whitespace-pre-wrap text-xs">{q.answer}</MathHtml>
            </div>
            <div className="p-2 rounded bg-gold-50/30 border border-gold-200">
              <div className="text-gold-700 font-medium mb-0.5 text-xs">解析</div>
              <MathHtml className="text-ink-900 whitespace-pre-wrap text-xs">{q.analysis}</MathHtml>
            </div>
          </div>

          {/* 匹配的章节与知识点 */}
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1">匹配章节</div>
              <div className="flex flex-wrap gap-1.5">
                {q.chapterNames.length > 0 ? (
                  q.chapterNames.map((name, i) => (
                    <Badge key={i} variant="ink">{name}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-ink-400">未匹配</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-600 mb-1">匹配知识点</div>
              <div className="flex flex-wrap gap-1.5">
                {q.knowledgePointNames.length > 0 ? (
                  q.knowledgePointNames.map((name, i) => (
                    <Badge key={i} variant="teal">{name}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-ink-400">未匹配</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
