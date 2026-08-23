import { useEffect, useState } from "react";
import {
  X, Save, BookOpen, Lightbulb, FileText,
  ChevronUp, ChevronDown, Plus, Trash2, Edit3, Clock,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { knowledgeService } from "@/services/knowledge";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import { DraggableModalSurface } from "@/components/ui/DraggableModalSurface";
import { Textarea } from "@/components/ui/Input";
import { MathHtml } from "@/components/ui/MathHtml";
import { SearchableTree } from "@/components/tree/SearchableTree";
import type { Question, TreeNode, QuestionRemark } from "@/types";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/service-utils";

interface QuickEditModalProps {
  open: boolean;
  onClose: () => void;
  question: Question | null;
  onSaved: (question: Question) => void;
}

type SectionKey = "chapter" | "knowledge" | "remark";

const sectionMeta: Record<SectionKey, { label: string; icon: typeof BookOpen; color: string }> = {
  chapter: { label: "章节目录", icon: BookOpen, color: "gold" },
  knowledge: { label: "知识点目录", icon: Lightbulb, color: "teal" },
  remark: { label: "备注", icon: FileText, color: "ink" },
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function QuickEditModal({ open, onClose, question, onSaved }: QuickEditModalProps) {
  const { teacher } = useAuthStore();
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [knowledgePointIds, setKnowledgePointIds] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<QuestionRemark[]>([]);
  const [sectionOrder, setSectionOrder] = useState<SectionKey[]>(["chapter", "knowledge", "remark"]);
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [saving, setSaving] = useState(false);
  // 新增备注的临时状态
  const [newRemarkContent, setNewRemarkContent] = useState("");
  const [addingRemark, setAddingRemark] = useState(false);
  // 编辑备注的状态
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkContent, setEditingRemarkContent] = useState("");

  useEffect(() => {
    if (!open || !question) return;
    setChapterIds([...question.chapterIds]);
    setKnowledgePointIds([...question.knowledgePointIds]);
    setRemarks([...(question.remarks || [])]);
    setSectionOrder(
      (question.sectionOrder && question.sectionOrder.length === 3
        ? question.sectionOrder
        : ["chapter", "knowledge", "remark"]) as SectionKey[],
    );
    setNewRemarkContent("");
    setAddingRemark(false);
    setEditingRemarkId(null);
  }, [open, question]);

  useEffect(() => {
    if (!teacher || !open) return;
    knowledgeService.getChapterTree(teacher.schoolId!).then(setChapterTree);
    knowledgeService.getKnowledgeTree(teacher.schoolId!).then(setKnowledgeTree);
  }, [teacher, open]);

  const handleSave = async () => {
    if (!question) return;
    setSaving(true);
    try {
      // 同步最新备注到 remark 字段（兼容旧逻辑）
      const latestRemark = remarks[remarks.length - 1]?.content || "";
      const updated = await questionService.updateQuestion(question.id, {
        chapterIds,
        knowledgePointIds,
        remarks,
        remark: latestRemark,
        sectionOrder,
      });
      toast.success("属性已更新");
      onSaved(updated);
      onClose();
    } catch (e: any) {
      toast.error("保存失败", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const moveSection = (key: SectionKey, direction: "up" | "down") => {
    const idx = sectionOrder.indexOf(key);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sectionOrder.length) return;
    const next = [...sectionOrder];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setSectionOrder(next);
  };

  const handleAddRemark = () => {
    if (!newRemarkContent.trim()) {
      toast.warning("备注内容不能为空");
      return;
    }
    const now = new Date().toISOString();
    const newRemark: QuestionRemark = {
      id: genId("rm"),
      content: newRemarkContent.trim(),
      createdAt: now,
      updatedAt: now,
    };
    setRemarks([...remarks, newRemark]);
    setNewRemarkContent("");
    setAddingRemark(false);
  };

  const handleSaveEditRemark = () => {
    if (!editingRemarkId) return;
    if (!editingRemarkContent.trim()) {
      toast.warning("备注内容不能为空");
      return;
    }
    setRemarks(remarks.map((r) =>
      r.id === editingRemarkId
        ? { ...r, content: editingRemarkContent.trim(), updatedAt: new Date().toISOString() }
        : r,
    ));
    setEditingRemarkId(null);
    setEditingRemarkContent("");
  };

  const handleDeleteRemark = (remarkId: string) => {
    if (!confirm("确定要删除这条备注吗？")) return;
    setRemarks(remarks.filter((r) => r.id !== remarkId));
  };

  const startEditRemark = (remark: QuestionRemark) => {
    setEditingRemarkId(remark.id);
    setEditingRemarkContent(remark.content);
  };

  if (!open || !question) return null;

  // 按顺序渲染区块
  const renderSection = (key: SectionKey, index: number) => {
    const meta = sectionMeta[key];
    const Icon = meta.icon;
    const isFirst = index === 0;
    const isLast = index === sectionOrder.length - 1;

    return (
      <div
        key={key}
        className={cn(
          "border rounded-lg overflow-hidden",
          meta.color === "gold" && "border-gold-200",
          meta.color === "teal" && "border-teal-200",
          meta.color === "ink" && "border-ink-200",
        )}
      >
        <div
          className={cn(
            "px-4 py-2.5 border-b flex items-center justify-between",
            meta.color === "gold" && "bg-gold-50 border-gold-200",
            meta.color === "teal" && "bg-teal-50 border-teal-200",
            meta.color === "ink" && "bg-mist/50 border-ink-200",
          )}
        >
          <div className="flex items-center gap-1.5">
            <Icon
              className={cn(
                "w-4 h-4",
                meta.color === "gold" && "text-gold-600",
                meta.color === "teal" && "text-teal-600",
                meta.color === "ink" && "text-ink-600",
              )}
            />
            <span
              className={cn(
                "font-medium text-sm",
                meta.color === "gold" && "text-gold-800",
                meta.color === "teal" && "text-teal-800",
                meta.color === "ink" && "text-ink-800",
              )}
            >
              {meta.label}
            </span>
            {key === "chapter" && (
              <span className="text-xs text-gold-600">已选 {chapterIds.length}</span>
            )}
            {key === "knowledge" && (
              <span className="text-xs text-teal-600">已选 {knowledgePointIds.length}</span>
            )}
            {key === "remark" && (
              <span className="text-xs text-ink-500">{remarks.length} 条</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {key === "chapter" && chapterIds.length > 0 && (
              <button
                onClick={() => setChapterIds([])}
                className="text-xs text-gold-600 hover:text-red-600 mr-2"
              >
                清除
              </button>
            )}
            {key === "knowledge" && knowledgePointIds.length > 0 && (
              <button
                onClick={() => setKnowledgePointIds([])}
                className="text-xs text-teal-600 hover:text-red-600 mr-2"
              >
                清除
              </button>
            )}
            <button
              onClick={() => moveSection(key, "up")}
              disabled={isFirst}
              className="p-1 rounded text-ink-400 hover:text-gold-600 hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="上移"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => moveSection(key, "down")}
              disabled={isLast}
              className="p-1 rounded text-ink-400 hover:text-gold-600 hover:bg-paper disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="下移"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-3">
          {key === "chapter" && (
            chapterTree ? (
              <SearchableTree
                data={chapterTree}
                title="章节目录"
                checkable
                checkedIds={chapterIds}
                onCheck={setChapterIds}
                expandLevel={2}
                searchPlaceholder="搜索章节目录..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[160px]"
              />
            ) : (
              <div className="py-6 text-center text-xs text-ink-400">加载中...</div>
            )
          )}

          {key === "knowledge" && (
            knowledgeTree ? (
              <SearchableTree
                data={knowledgeTree}
                title="知识点目录"
                accent="teal"
                checkable
                checkedIds={knowledgePointIds}
                onCheck={setKnowledgePointIds}
                expandLevel={2}
                searchPlaceholder="搜索知识点目录..."
                showHeader={false}
                treeMaxHeightClassName="max-h-[160px]"
              />
            ) : (
              <div className="py-6 text-center text-xs text-ink-400">加载中...</div>
            )
          )}

          {key === "remark" && (
            <div className="space-y-2">
              {remarks.length === 0 && !addingRemark && (
                <div className="py-4 text-center text-xs text-ink-400">
                  暂无备注
                </div>
              )}
              {remarks.map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-md bg-gold-50/40 border border-gold-100 group"
                >
                  {editingRemarkId === r.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editingRemarkContent}
                        onChange={(e) => setEditingRemarkContent(e.target.value)}
                        rows={2}
                        autoFocus
                        placeholder="输入备注内容..."
                      />
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRemarkId(null);
                            setEditingRemarkContent("");
                          }}
                        >
                          取消
                        </Button>
                        <Button variant="gold" size="sm" onClick={handleSaveEditRemark}>
                          保存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-ink-800 whitespace-pre-wrap">{r.content}</div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-ink-400">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(r.updatedAt)}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEditRemark(r)}
                            className="p-1 rounded text-ink-400 hover:bg-mist hover:text-gold-600"
                            title="编辑"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteRemark(r.id)}
                            className="p-1 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {addingRemark ? (
                <div className="p-2.5 rounded-md border border-gold-200 bg-paper space-y-2">
                  <Textarea
                    value={newRemarkContent}
                    onChange={(e) => setNewRemarkContent(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="输入备注内容..."
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingRemark(false);
                        setNewRemarkContent("");
                      }}
                    >
                      取消
                    </Button>
                    <Button variant="gold" size="sm" onClick={handleAddRemark}>
                      添加
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingRemark(true)}
                  className="w-full py-2 text-xs text-gold-600 hover:text-gold-700 border border-dashed border-gold-200 hover:border-gold-300 rounded-md transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增备注
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <DraggableModalSurface className="relative bg-paper rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div
          data-modal-drag-handle
          className="flex items-center justify-between px-5 py-4 border-b border-ink-100 cursor-move touch-none select-none"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold-500" />
            <h3 className="font-serif font-semibold text-ink-900">快速调整属性</h3>
            <span className="text-xs text-ink-400 ml-2">
              可通过箭头调整区块顺序
            </span>
          </div>
          <button data-modal-drag-ignore onClick={onClose} className="p-1.5 rounded-lg hover:bg-mist text-ink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 题干预览 */}
          <div className="p-3 rounded-lg bg-mist/50 border border-ink-100">
            <div className="text-xs font-medium text-ink-500 mb-1">当前题目</div>
            <MathHtml className="block text-sm text-ink-900 line-clamp-3 whitespace-pre-wrap">
              {question.stem}
            </MathHtml>
          </div>

          {/* 按用户自定义顺序渲染区块 */}
          {sectionOrder.map((key, index) => renderSection(key, index))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button variant="gold" size="sm" onClick={handleSave} loading={saving}>
            <Save className="w-3.5 h-3.5" />
            保存修改
          </Button>
        </div>
      </DraggableModalSurface>
    </div>
  );
}

export default QuickEditModal;
