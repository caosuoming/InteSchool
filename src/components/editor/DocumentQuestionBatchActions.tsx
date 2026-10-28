import { useState, type ReactNode } from "react";
import { BookOpen, Lightbulb, ListChecks } from "lucide-react";
import { knowledgeService } from "@/services/knowledge";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { Question, TreeNode } from "@/types";
import { batchQuestionCatalogPatch, type DirectoryBatchMode } from "./document-question-batch";

type Mode = DirectoryBatchMode;

const modes = [
  { key: "chapter" as const, label: "修改章节课", title: "统一修改章节课", icon: BookOpen },
  { key: "knowledge" as const, label: "新增知识点", title: "新增统一知识点", icon: ListChecks },
  { key: "method" as const, label: "新增思想方法", title: "新增统一思想方法", icon: Lightbulb },
];

interface Props {
  schoolId?: string;
  questionIds: string[];
  onUpdated: (questions: Question[]) => void;
  disabled?: boolean;
  markAllButton?: ReactNode;
}

export function DocumentQuestionBatchActions({ schoolId, questionIds, onUpdated, disabled, markAllButton }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const uniqueIds = [...new Set(questionIds.filter(Boolean))];
  const selectedMode = modes.find((item) => item.key === mode);

  const openPicker = async (nextMode: Mode) => {
    if (!schoolId || disabled || uniqueIds.length === 0) return;
    setMode(nextMode);
    setSelectedIds([]);
    setTree(null);
    setLoading(true);
    try {
      const loaded = nextMode === "chapter"
        ? await knowledgeService.getChapterTree(schoolId)
        : nextMode === "knowledge"
          ? await knowledgeService.getKnowledgeTree(schoolId)
          : await knowledgeService.getMethodTree(schoolId);
      setTree(loaded);
    } catch (error) {
      toast.error("加载目录失败", error instanceof Error ? error.message : undefined);
      setMode(null);
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!mode || !selectedIds.length || working || disabled) return;
    setWorking(true);
    try {
      const results = await Promise.allSettled(uniqueIds.map(async (id) => {
        // Read the latest associations so additions preserve concurrent changes.
        const question = await questionService.getQuestion(id);
        if (!question) throw new Error(`题目 ${id} 不存在`);
        return questionService.updateQuestion(id, batchQuestionCatalogPatch(question, mode, selectedIds));
      }));
      const updated = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const failed = results.length - updated.length;
      if (updated.length) {
        onUpdated(updated);
        toast.success("批量操作完成", `成功更新 ${updated.length} 道题目`);
      }
      if (failed) toast.error("部分题目更新失败", `${failed} 道题目未更新，请检查权限或稍后重试`);
      if (!failed) {
        setMode(null);
        setSelectedIds([]);
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="document-question-batch-actions">
      <div className="text-[11px] font-medium text-ink-500">批量操作（{uniqueIds.length} 题）</div>
      <div className="flex flex-wrap gap-1.5">
        {markAllButton}
        {modes.map(({ key, label, icon: Icon }) => (
          <Button key={key} variant="outline" size="sm" onClick={() => void openPicker(key)}
            disabled={disabled || !schoolId || uniqueIds.length === 0}>
            <Icon className="h-3.5 w-3.5" />{label}
          </Button>
        ))}
      </div>
      <Modal open={mode !== null} onClose={() => { if (!working) setMode(null); }}
        title={selectedMode?.title || "批量修改"}
        description={mode === "chapter"
          ? `选中的章节课将替换文档内 ${uniqueIds.length} 道题目原有的章节课关联。`
          : `所选目录将追加到文档内 ${uniqueIds.length} 道题目，保留原有关联。`}
        size="md" footer={<div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={working} onClick={() => setMode(null)}>取消</Button>
          <Button variant="gold" loading={working} disabled={selectedIds.length === 0 || loading || disabled}
            onClick={() => void apply()}>{mode === "chapter" ? "确认修改" : "确认新增"}</Button>
        </div>}>
        {loading ? <div className="flex justify-center py-10"><Spinner size={20} /></div> : tree ? (
          <div className="max-h-[55vh] overflow-y-auto">
            <SearchableTree editable data={tree} onDataChange={setTree} title={selectedMode?.label}
              accent={mode === "chapter" ? "gold" : "teal"} checkable
              checkedIds={selectedIds} onCheck={setSelectedIds} searchPlaceholder="搜索目录..." />
          </div>
        ) : <div className="py-6 text-center text-sm text-ink-400">暂无可选目录</div>}
      </Modal>
    </div>
  );
}
