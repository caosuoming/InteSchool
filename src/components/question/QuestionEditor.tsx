import { useEffect, useState } from "react";
import { Save, BookOpen, Lightbulb, X, Plus, Edit3 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Textarea, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { TreeView } from "@/components/tree/TreeView";
import { WpsFormulaEditor } from "@/components/editor/WpsFormulaEditor";
import type { Question, Chapter, KnowledgePoint, TreeNode } from "@/types";

const typeOptions = [
  { value: "single", label: "单选题" },
  { value: "multiple", label: "多选题" },
  { value: "judge", label: "判断题" },
  { value: "short", label: "填空题" },
  { value: "essay", label: "解答题" },
];

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

const categoryOptions = [
  { value: "practice", label: "练习" },
  { value: "exam", label: "考试" },
  { value: "homework", label: "作业" },
  { value: "review", label: "复习" },
];

const sourceOptions = [
  { value: "imported", label: "导入" },
  { value: "manual", label: "手动" },
  { value: "shared", label: "共享" },
];

const gradeOptions = [
  { value: "", label: "未指定" },
  { value: "高一", label: "高一" },
  { value: "高二", label: "高二" },
  { value: "高三", label: "高三" },
];

const yearOptions = [
  { value: "", label: "未指定" },
  { value: "2025-2026", label: "2025-2026" },
  { value: "2024-2025", label: "2024-2025" },
];

interface QuestionEditorProps {
  question: Question;
  onSaved: (q: Question) => void;
  onCancel: () => void;
}

export function QuestionEditor({ question, onSaved, onCancel }: QuestionEditorProps) {
  const { teacher } = useAuthStore();
  const [form, setForm] = useState({
    type: question.type,
    stem: question.stem,
    options: question.options ?? [],
    answer: question.answer,
    analysis: question.analysis,
    chapterIds: [...question.chapterIds],
    knowledgePointIds: [...question.knowledgePointIds],
    difficulty: question.difficulty,
    recommendation: question.recommendation,
    remark: question.remark,
    sourceType: question.sourceType ?? "manual",
    category: question.category ?? "practice",
    grade: question.grade ?? "",
    schoolYear: question.schoolYear ?? "",
    isShared: question.isShared,
  });
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [points, setPoints] = useState<KnowledgePoint[]>([]);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [saving, setSaving] = useState(false);
  // 公式编辑器目标字段
  const [formulaTarget, setFormulaTarget] = useState<"stem" | "answer" | "analysis" | null>(null);

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

  const handleSave = async () => {
    if (!form.stem.trim()) {
      toast.error("题干不能为空");
      return;
    }
    setSaving(true);
    try {
      const updated = await questionService.updateQuestion(question.id, {
        type: form.type as any,
        stem: form.stem,
        options: form.options.length > 0 ? form.options : undefined,
        answer: form.answer,
        analysis: form.analysis,
        chapterIds: form.chapterIds,
        knowledgePointIds: form.knowledgePointIds,
        difficulty: form.difficulty as any,
        recommendation: form.recommendation as any,
        remark: form.remark,
        sourceType: form.sourceType as any,
        category: form.category as any,
        grade: form.grade,
        schoolYear: form.schoolYear,
        isShared: form.isShared,
      });
      toast.success("题目已更新");
      onSaved(updated);
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 题型与基础属性 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Select
          label="题型"
          value={form.type}
          options={typeOptions}
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
          options={categoryOptions}
          onChange={(e) => update("category", e.target.value as any)}
        />
        <Select
          label="来源"
          value={form.sourceType}
          options={sourceOptions}
          onChange={(e) => update("sourceType", e.target.value as any)}
        />
        <Select
          label="年级"
          value={form.grade}
          options={gradeOptions}
          onChange={(e) => update("grade", e.target.value)}
        />
        <Select
          label="学年"
          value={form.schoolYear}
          options={yearOptions}
          onChange={(e) => update("schoolYear", e.target.value)}
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
      <div>
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
        {containsHtml(form.stem) && (
          <div className="mt-2 p-2 rounded-md bg-mist/40 border border-ink-100">
            <div className="text-[11px] text-ink-500 mb-1">题干预览：</div>
            <div
              className="text-sm text-ink-900 prose-sm"
              dangerouslySetInnerHTML={{ __html: form.stem }}
            />
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
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const next = [...form.options];
                    next[i] = e.target.value;
                    update("options", next);
                  }}
                  className="input-base flex-1"
                />
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

      {/* 答案 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-ink-700">答案</label>
          <button
            onClick={() => setFormulaTarget("answer")}
            className="text-xs text-gold-600 hover:text-gold-700 flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            在线编辑器（支持公式）
          </button>
        </div>
        <Textarea
          value={form.answer}
          onChange={(e) => update("answer", e.target.value)}
          rows={2}
          placeholder="请输入答案（选择题可填选项字母，如 A 或 ABC）"
        />
        {containsHtml(form.answer) && (
          <div className="mt-2 p-2 rounded-md bg-emerald-50/40 border border-emerald-100">
            <div className="text-[11px] text-emerald-700 mb-1">答案预览：</div>
            <div
              className="text-sm text-emerald-800 prose-sm"
              dangerouslySetInnerHTML={{ __html: form.answer }}
            />
          </div>
        )}
      </div>

      {/* 解析 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-ink-700">解析</label>
          <button
            onClick={() => setFormulaTarget("analysis")}
            className="text-xs text-gold-600 hover:text-gold-700 flex items-center gap-1"
          >
            <Edit3 className="w-3 h-3" />
            在线编辑器（支持公式）
          </button>
        </div>
        <Textarea
          value={form.analysis}
          onChange={(e) => update("analysis", e.target.value)}
          rows={3}
          placeholder="请输入解析（也可使用在线编辑器插入公式）"
        />
        {containsHtml(form.analysis) && (
          <div className="mt-2 p-2 rounded-md bg-mist/40 border border-ink-100">
            <div className="text-[11px] text-ink-500 mb-1">解析预览：</div>
            <div
              className="text-sm text-ink-800 prose-sm"
              dangerouslySetInnerHTML={{ __html: form.analysis }}
            />
          </div>
        )}
      </div>

      {/* 章节与知识点选择 */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border border-gold-200 rounded-lg overflow-hidden bg-gold-50/20">
          <div className="px-3 py-2 bg-gold-50 border-b border-gold-200 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-gold-700" />
            <span className="font-serif font-semibold text-sm text-gold-800">章节目录</span>
            <span className="ml-auto text-xs text-gold-700">
              已选 {form.chapterIds.length}
            </span>
            {form.chapterIds.length > 0 && (
              <button
                onClick={() => update("chapterIds", [])}
                className="text-xs text-gold-700 hover:text-red-600"
              >
                清除
              </button>
            )}
          </div>
          <div className="p-2 max-h-[260px] overflow-y-auto">
            {chapterTree && (
              <TreeView
                data={chapterTree}
                checkable
                checkedIds={form.chapterIds}
                onCheck={(ids) => update("chapterIds", ids)}
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
            <span className="ml-auto text-xs text-teal-700">
              已选 {form.knowledgePointIds.length}
            </span>
            {form.knowledgePointIds.length > 0 && (
              <button
                onClick={() => update("knowledgePointIds", [])}
                className="text-xs text-teal-700 hover:text-red-600"
              >
                清除
              </button>
            )}
          </div>
          <div className="p-2 max-h-[260px] overflow-y-auto">
            {knowledgeTree && (
              <TreeView
                data={knowledgeTree}
                checkable
                checkedIds={form.knowledgePointIds}
                onCheck={(ids) => update("knowledgePointIds", ids)}
                expandLevel={2}
                className="text-xs"
              />
            )}
          </div>
        </div>
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
    </div>
  );
}

// 判断字符串是否包含 HTML 标签（用于决定是否显示预览）
function containsHtml(s: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(s);
}

export default QuestionEditor;
