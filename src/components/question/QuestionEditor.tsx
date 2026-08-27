import { useEffect, useState, type ReactNode } from "react";
import {
  Save, BookOpen, Lightbulb, X, Plus, Edit3, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SearchableTree } from "@/components/tree/SearchableTree";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";
import { MathHtml } from "@/components/ui/MathHtml";
import { QuestionSupplementaryDetails } from "@/components/question/QuestionSupplementaryDetails";
import { containsMathDelimiter } from "@/lib/math-html";
import { includeCurrentOption, useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { includeCurrentQuestionType, useQuestionTypeOptions } from "@/hooks/useQuestionTypeOptions";
import {
  includeCurrentMetadataOption,
  useQuestionMetadataOptions,
} from "@/hooks/useQuestionMetadataOptions";
import type {
  Question,
  Chapter,
  KnowledgePoint,
  TreeNode,
  ResourceSemester,
  SimilarQuestionCandidate,
} from "@/types";

const difficultyOptions = [
  { value: "1", label: "1 - 简单" },
  { value: "2", label: "2 - 较易" },
  { value: "3", label: "3 - 中等" },
  { value: "4", label: "4 - 较难" },
  { value: "5", label: "5 - 困难" },
];

const recommendationOptions = [
  { value: "1", label: "1 - 一般" },
  { value: "2", label: "2 - 可选" },
  { value: "3", label: "3 - 适中" },
  { value: "4", label: "4 - 推荐" },
  { value: "5", label: "5 - 强烈推荐" },
];

interface QuestionEditorProps {
  question: Question;
  onSaved: (q: Question) => void;
  onCancel: () => void;
}

type CollapsibleSectionKey = "answer" | "analysis" | "summary" | "board";

interface CollapsibleEditorSectionProps {
  title: string;
  expanded: boolean;
  preview: string;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

function CollapsibleEditorSection({
  title,
  expanded,
  preview,
  onToggle,
  action,
  children,
}: CollapsibleEditorSectionProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink-150 bg-paper">
      <div className="flex items-center gap-2 bg-mist/35 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? "收起" : "展开"}${title}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4 flex-shrink-0 text-ink-400" />
          ) : (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-400" />
          )}
          <span className="flex-shrink-0 text-sm font-medium text-ink-700">{title}</span>
          {!expanded && (
            <span className="min-w-0 truncate text-xs text-ink-400">{preview}</span>
          )}
        </button>
        {expanded && action}
      </div>
      {expanded && <div className="border-t border-ink-100 p-3">{children}</div>}
    </section>
  );
}

export function QuestionEditor({ question, onSaved, onCancel }: QuestionEditorProps) {
  const { teacher } = useAuthStore();
  const { gradeOptions, schoolYearOptions, semesterOptions } = useSchoolResourceOptions(teacher?.schoolId);
  const { options: questionTypeOptions } = useQuestionTypeOptions(teacher?.schoolId);
  const {
    sourceOptions,
    categoryOptions,
    defaultSource,
    defaultCategory,
    getSourceLabel,
    getCategoryLabel,
    ready: metadataReady,
  } = useQuestionMetadataOptions(teacher?.schoolId);
  const [form, setForm] = useState({
    type: question.type,
    stem: question.stem,
    options: question.options ?? [],
    answer: question.answer,
    analysis: question.analysis,
    summary: question.summary ?? "",
    board: question.board ?? "",
    chapterIds: [...question.chapterIds],
    knowledgePointIds: [...question.knowledgePointIds],
    difficulty: question.difficulty,
    recommendation: question.recommendation,
    remark: question.remark,
    sourceType: question.sourceType ?? "",
    category: question.category ?? "",
    grade: question.grade ?? "",
    schoolYear: question.schoolYear ?? "",
    semester: question.semester ?? "上学期",
    isShared: question.isShared,
  });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<SimilarQuestionCandidate | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<CollapsibleSectionKey, boolean>>({
    answer: false,
    analysis: false,
    summary: false,
    board: false,
  });
  // 公式编辑器目标字段
  const [formulaTarget, setFormulaTarget] = useState<"stem" | "answer" | "analysis" | null>(null);

  useEffect(() => {
    if (!metadataReady) return;
    setForm((current) => ({
      ...current,
      sourceType: current.sourceType || defaultSource,
      category: current.category || defaultCategory,
    }));
  }, [defaultCategory, defaultSource, metadataReady]);

  useEffect(() => {
    if (!teacher) return;
    Promise.all([
      knowledgeService.listChapters(teacher.schoolId!),
      knowledgeService.listKnowledgePoints(teacher.schoolId!),
      knowledgeService.getChapterTree(teacher.schoolId!),
      knowledgeService.getKnowledgeTree(teacher.schoolId!),
    ]).then(([chs, kps, cTree, kTree]) => {
      setChapters(chs);
      setPoints(kps);
      setChapterTree(cTree);
      setKnowledgeTree(kTree);
    });
  }, [teacher]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const chapterNames = chapters
    .filter((c) => form.chapterIds.includes(c.id))
    .map((c) => c.name);
  const pointNames = points
    .filter((p) => form.knowledgePointIds.includes(p.id))
    .map((p) => p.name);

  const allDetailsExpanded = Object.values(expandedSections).every(Boolean);
  const toggleSection = (section: CollapsibleSectionKey) => {
    setExpandedSections((current) => ({ ...current, [section]: !current[section] }));
  };
  const toggleAllDetails = () => {
    const expanded = !allDetailsExpanded;
    setExpandedSections({ answer: expanded, analysis: expanded, summary: expanded, board: expanded });
  };

  const persistQuestion = async (duplicateDecision?: "add") => {
    setSaving(true);
    try {
      const updated = await questionService.updateQuestion(question.id, {
        type: form.type as any,
        stem: form.stem,
        options: form.options.length > 0 ? form.options : undefined,
        answer: form.answer,
        analysis: form.analysis,
        summary: form.summary,
        board: form.board,
        chapterIds: form.chapterIds,
        knowledgePointIds: form.knowledgePointIds,
        difficulty: form.difficulty as any,
        recommendation: form.recommendation as any,
        remark: form.remark,
        sourceType: form.sourceType,
        category: form.category,
        grade: form.grade,
        schoolYear: form.schoolYear,
        semester: form.semester as ResourceSemester,
        isShared: form.isShared,
      }, duplicateDecision);
      toast.success("题目已更新");
      setDuplicateConflict(null);
      onSaved(updated);
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!form.stem.trim()) {
      toast.error("题干不能为空");
      return;
    }
    if (teacher?.schoolId && form.stem !== question.stem) {
      setSaving(true);
      try {
        const [candidate] = await questionService.findSimilarQuestions(
          form.stem,
          teacher.schoolId,
          question.id,
        );
        if (candidate) {
          setDuplicateConflict(candidate);
          return;
        }
      } catch (error) {
        toast.error("查重失败", error instanceof Error ? error.message : undefined);
        return;
      } finally {
        setSaving(false);
      }
    }
    await persistQuestion();
  };

  return (
    <div className="space-y-5">
      {/* 题型与基础属性 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Select
          label="题型"
          value={form.type}
          options={includeCurrentQuestionType(questionTypeOptions, form.type)}
          onChange={(e) => update("type", e.target.value as any)}
        />
        <Select
          label="难度"
          value={String(form.difficulty)}
          options={difficultyOptions}
          onChange={(e) => update("difficulty", Number(e.target.value) as any)}
        />
        <Select
          label="推荐程度"
          value={String(form.recommendation)}
          options={recommendationOptions}
          onChange={(e) => update("recommendation", Number(e.target.value) as any)}
        />
        <Select
          label="题类"
          value={form.category}
          options={includeCurrentMetadataOption(
            categoryOptions,
            form.category,
            getCategoryLabel(form.category),
          )}
          onChange={(e) => update("category", e.target.value as any)}
        />
        <Select
          label="来源"
          value={form.sourceType}
          options={includeCurrentMetadataOption(
            sourceOptions,
            form.sourceType,
            getSourceLabel(form.sourceType),
          )}
          onChange={(e) => update("sourceType", e.target.value as any)}
        />
        <Select
          label="年级"
          value={form.grade}
          options={[{ value: "", label: "未指定" }, ...includeCurrentOption(gradeOptions, form.grade)]}
          onChange={(e) => update("grade", e.target.value)}
        />
        <Select
          label="学年"
          value={form.schoolYear}
          options={[{ value: "", label: "未指定" }, ...includeCurrentOption(schoolYearOptions, form.schoolYear)]}
          onChange={(e) => update("schoolYear", e.target.value)}
        />
        <Select
          label="学期"
          value={form.semester}
          options={semesterOptions}
          onChange={(e) => update("semester", e.target.value as ResourceSemester)}
        />
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">是否共享</label>
          <label className="flex items-center gap-2 h-[38px] px-3 rounded-md border border-ink-200 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isShared}
              onChange={(e) => update("isShared", e.target.checked)}
              className="w-4 h-4 rounded border-ink-300 text-gold-500 focus:ring-gold-500"
            />
            <span className="text-sm text-ink-700">{form.isShared ? "校内共享" : "仅自己可见"}</span>
          </label>
        </div>
      </div>

      {/* 题干 */}
      <div
        data-testid="question-stem-section"
        className="sticky top-0 z-20 -mx-2 border-b border-ink-100 bg-paper/95 px-2 py-2 shadow-sm backdrop-blur"
      >
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-ink-700">题干</label>
          <button
            onClick={() => setFormulaTarget("stem")}
            className="text-xs text-gold-600 hover:text-gold-700 flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            在线编辑器（支持公式）
          </button>
        </div>
        <Textarea
          value={form.stem}
          onChange={(e) => update("stem", e.target.value)}
          rows={3}
          placeholder="请输入题干内容（也可使用在线编辑器插入公式）"
        />
        {needsRichPreview(form.stem) && (
          <div className="mt-2 p-2 rounded-md bg-mist/40 border border-ink-100">
            <div className="text-[11px] text-ink-500 mb-1">题干预览：</div>
            <MathHtml className="text-sm text-ink-900 prose-sm whitespace-pre-wrap">
              {form.stem}
            </MathHtml>
          </div>
        )}
      </div>

      {/* 选项（仅选择题） */}
      {(form.type === "single" || form.type === "multiple") && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-ink-700">选项</label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update("options", [...form.options, ""])}
            >
              <Plus className="w-3 h-3" />
              新增选项
            </Button>
          </div>
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono font-semibold text-ink-500 w-6 flex-shrink-0">
                  {String.fromCharCode(65 + i)}.
                </span>
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...form.options];
                      next[i] = e.target.value;
                      update("options", next);
                    }}
                    className="input-base w-full"
                  />
                  {needsRichPreview(opt) && (
                    <MathHtml className="block mt-1 px-2 text-xs text-ink-700 whitespace-pre-wrap">
                      {opt}
                    </MathHtml>
                  )}
                </div>
                <button
                  onClick={() => {
                    const next = form.options.filter((_, idx) => idx !== i);
                    update("options", next);
                  }}
                  className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleAllDetails}
          className="text-xs text-gold-600 hover:text-gold-700"
        >
          {allDetailsExpanded ? "全部收起" : "一键展开答案、解析、总结与板书"}
        </button>
      </div>

      <div className="space-y-2">
        <CollapsibleEditorSection
          title="答案"
          expanded={expandedSections.answer}
          preview={collapsedPreview(form.answer)}
          onToggle={() => toggleSection("answer")}
          action={(
            <button
              type="button"
              onClick={() => setFormulaTarget("answer")}
              className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700"
            >
              <Edit3 className="h-3 w-3" />
              在线编辑器（支持公式）
            </button>
          )}
        >
          <Textarea
            value={form.answer}
            onChange={(e) => update("answer", e.target.value)}
            rows={2}
            placeholder="请输入答案（选择题可填选项字母，如 A 或 ABC）"
          />
          {needsRichPreview(form.answer) && (
            <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50/40 p-2">
              <div className="mb-1 text-[11px] text-emerald-700">答案预览：</div>
              <MathHtml className="question-answer-content prose-sm whitespace-pre-wrap text-sm text-emerald-800">
                {form.answer}
              </MathHtml>
            </div>
          )}
        </CollapsibleEditorSection>

        <CollapsibleEditorSection
          title="解析"
          expanded={expandedSections.analysis}
          preview={collapsedPreview(form.analysis)}
          onToggle={() => toggleSection("analysis")}
          action={(
            <button
              type="button"
              onClick={() => setFormulaTarget("analysis")}
              className="flex items-center gap-1 text-xs text-gold-600 hover:text-gold-700"
            >
              <Edit3 className="h-3 w-3" />
              在线编辑器（支持公式）
            </button>
          )}
        >
          <Textarea
            value={form.analysis}
            onChange={(e) => update("analysis", e.target.value)}
            rows={3}
            placeholder="请输入解析（也可使用在线编辑器插入公式）"
          />
          {needsRichPreview(form.analysis) && (
            <div className="mt-2 rounded-md border border-ink-100 bg-mist/40 p-2">
              <div className="mb-1 text-[11px] text-ink-500">解析预览：</div>
              <MathHtml className="prose-sm whitespace-pre-wrap text-sm text-ink-800">
                {form.analysis}
              </MathHtml>
            </div>
          )}
        </CollapsibleEditorSection>

        <CollapsibleEditorSection
          title="总结"
          expanded={expandedSections.summary}
          preview={collapsedPreview(form.summary)}
          onToggle={() => toggleSection("summary")}
        >
          <Textarea
            value={form.summary}
            onChange={(e) => update("summary", e.target.value)}
            rows={2}
            placeholder="请输入本题总结（如考点、易错点、解题方法等）"
          />
          {needsRichPreview(form.summary) && (
            <div className="mt-2 rounded-md border border-amber-100 bg-amber-50/40 p-2">
              <div className="mb-1 text-[11px] text-amber-700">总结预览：</div>
              <MathHtml className="prose-sm whitespace-pre-wrap text-sm text-amber-800">
                {form.summary}
              </MathHtml>
            </div>
          )}
        </CollapsibleEditorSection>

        <CollapsibleEditorSection
          title="板书"
          expanded={expandedSections.board}
          preview={collapsedPreview(form.board)}
          onToggle={() => toggleSection("board")}
        >
          <Textarea
            value={form.board}
            onChange={(e) => update("board", e.target.value)}
            rows={3}
            placeholder="请输入板书内容；课堂保存的手写板书会自动显示在这里"
          />
          {form.board && (
            <div className="mt-2">
              <QuestionSupplementaryDetails board={form.board} compact />
            </div>
          )}
        </CollapsibleEditorSection>
      </div>

      {/* 章节与知识点选择 */}
      <div className="grid gap-4 md:grid-cols-2">
        {chapterTree ? (
          <SearchableTree
            editable
            data={chapterTree}
            onDataChange={setChapterTree}
            title={(
              <span className="flex items-center gap-1.5 text-gold-800">
                <BookOpen className="h-3.5 w-3.5 text-gold-700" />
                章节目录
              </span>
            )}
            accent="gold"
            checkable
            checkedIds={form.chapterIds}
            onCheck={(ids) => update("chapterIds", ids)}
            expandLevel={2}
            searchPlaceholder="搜索章节目录..."
            showResetButton={false}
            treeMaxHeightClassName="max-h-[260px]"
            className="overflow-hidden rounded-lg border border-gold-200 bg-gold-50/20"
            headerActions={(
              <>
                <span className="text-xs text-gold-700">已选 {form.chapterIds.length}</span>
                {form.chapterIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => update("chapterIds", [])}
                    className="text-xs text-gold-700 hover:text-red-600"
                  >
                    清除
                  </button>
                )}
              </>
            )}
          />
        ) : (
          <div className="rounded-lg border border-gold-200 py-12 text-center text-xs text-ink-400">
            加载中...
          </div>
        )}

        {knowledgeTree ? (
          <SearchableTree
            editable
            data={knowledgeTree}
            onDataChange={setKnowledgeTree}
            title={(
              <span className="flex items-center gap-1.5 text-teal-800">
                <Lightbulb className="h-3.5 w-3.5 text-teal-700" />
                知识点目录
              </span>
            )}
            accent="teal"
            checkable
            checkedIds={form.knowledgePointIds}
            onCheck={(ids) => update("knowledgePointIds", ids)}
            expandLevel={2}
            searchPlaceholder="搜索知识点目录..."
            showResetButton={false}
            treeMaxHeightClassName="max-h-[260px]"
            className="overflow-hidden rounded-lg border border-teal-200 bg-teal-50/20"
            headerActions={(
              <>
                <span className="text-xs text-teal-700">已选 {form.knowledgePointIds.length}</span>
                {form.knowledgePointIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => update("knowledgePointIds", [])}
                    className="text-xs text-teal-700 hover:text-red-600"
                  >
                    清除
                  </button>
                )}
              </>
            )}
          />
        ) : (
          <div className="rounded-lg border border-teal-200 py-12 text-center text-xs text-ink-400">
            加载中...
          </div>
        )}
      </div>

      {/* 已选章节与知识点快速预览 */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="p-3 rounded-md bg-mist border border-ink-100">
          <div className="text-xs font-medium text-ink-500 mb-1.5">已关联章节</div>
          {chapterNames.length ? (
            <div className="flex flex-wrap gap-1">
              {chapterNames.map((n) => (
                <span key={n} className="tag-gold">{n}</span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-400 italic">未关联任何章节</span>
          )}
        </div>
        <div className="p-3 rounded-md bg-mist border border-ink-100">
          <div className="text-xs font-medium text-ink-500 mb-1.5">已关联知识点</div>
          {pointNames.length ? (
            <div className="flex flex-wrap gap-1">
              {pointNames.map((n) => (
                <span key={n} className="tag-teal">{n}</span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-400 italic">未关联任何知识点</span>
          )}
        </div>
      </div>

      {/* 备注 */}
      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1.5">备注</label>
        <Textarea
          value={form.remark}
          onChange={(e) => update("remark", e.target.value)}
          rows={2}
          placeholder="添加备注：例如适用场景、易错点提示、教学建议等"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button variant="gold" size="sm" onClick={handleSave} loading={saving}>
          <Save className="w-3.5 h-3.5" />
          保存修改
        </Button>
      </div>

      {/* 在线公式编辑器弹窗 */}
      <Modal
        open={!!formulaTarget}
        onClose={() => setFormulaTarget(null)}
        title={`在线编辑 - ${
          formulaTarget === "stem" ? "题干"
          : formulaTarget === "answer" ? "答案"
          : "解析"
        }`}
        description="使用 WPS 风格在线编辑器，支持公式插入（KaTeX）"
        size="lg"
        footer={null}
      >
        {formulaTarget && (
          <WpsFormulaEditor
            initialHtml={form[formulaTarget]}
            onSave={(html) => {
              update(formulaTarget, html);
              setFormulaTarget(null);
              toast.success("已应用编辑器内容");
            }}
            onCancel={() => setFormulaTarget(null)}
          />
        )}
      </Modal>

      <Modal
        open={!!duplicateConflict}
        onClose={() => setDuplicateConflict(null)}
        title="发现高度相似题目"
        description="题干修改后必须先完成查重确认。可取消修改，或明确保留为另一道题。"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDuplicateConflict(null)} disabled={saving}>
              返回修改
            </Button>
            <Button variant="gold" onClick={() => persistQuestion("add")} loading={saving}>
              仍然保存
            </Button>
          </div>
        }
      >
        {duplicateConflict && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-amber-800">
                相似度 {(duplicateConflict.similarity * 100).toFixed(1)}%
              </span>
              <code className="rounded bg-mist px-2 py-1 font-mono text-xs text-ink-700">
                ID: {duplicateConflict.question.id}
              </code>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="mb-1 text-xs font-medium text-ink-500">已有题目题干</div>
              <MathHtml className="text-sm text-ink-900 whitespace-pre-wrap">
                {duplicateConflict.question.stem}
              </MathHtml>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// 富文本或 LaTeX 内容需要显示渲染后的预览。
function needsRichPreview(s: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(s)
    || /!\[[^\]]*\]\([^)]+\)/.test(s)
    || containsMathDelimiter(s);
}

function collapsedPreview(value: string): string {
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[图片]")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "未填写";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

export default QuestionEditor;
