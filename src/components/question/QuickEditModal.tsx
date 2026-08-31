import { useEffect, useState } from "react";
import {
  X, Save, BookOpen, Lightbulb, FileText,
  Plus, Trash2, Edit3, Clock,
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

type DirectoryTab = "chapter" | "knowledge";

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
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<DirectoryTab>("chapter");
  const [chapterTree, setChapterTree] = useState<TreeNode | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<TreeNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [newRemarkContent, setNewRemarkContent] = useState("");
  const [addingRemark, setAddingRemark] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkContent, setEditingRemarkContent] = useState("");

  useEffect(() => {
    if (!open || !question) return;
    setChapterIds([...question.chapterIds]);
    setKnowledgePointIds([...question.knowledgePointIds]);
    setRemarks([...(question.remarks || [])]);
    setActiveDirectoryTab("chapter");
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
      const latestRemark = remarks[remarks.length - 1]?.content || "";
      const updated = await questionService.updateQuestion(question.id, {
        chapterIds,
        knowledgePointIds,
        remarks,
        remark: latestRemark,
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

  const activeTree = activeDirectoryTab === "chapter" ? chapterTree : knowledgeTree;
  const activeCheckedIds = activeDirectoryTab === "chapter" ? chapterIds : knowledgePointIds;
  const activeSetCheckedIds = activeDirectoryTab === "chapter" ? setChapterIds : setKnowledgePointIds;
  const activeSetTree = activeDirectoryTab === "chapter" ? setChapterTree : setKnowledgeTree;
  const activeTitle = activeDirectoryTab === "chapter" ? "章节课目录" : "知识点目录";
  const activeSearchPlaceholder = activeDirectoryTab === "chapter" ? "搜索章节课目录..." : "搜索知识点目录...";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <DraggableModalSurface className="relative bg-paper rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-fade-in">
        <div
          data-modal-drag-handle
          className="flex items-center justify-between px-5 py-4 border-b border-ink-100 cursor-move touch-none select-none"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold-500" />
            <h3 className="font-serif font-semibold text-ink-900">快速调整属性</h3>
          </div>
          <button data-modal-drag-ignore onClick={onClose} className="p-1.5 rounded-lg hover:bg-mist text-ink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-3 rounded-lg bg-mist/50 border border-ink-100">
            <div className="text-xs font-medium text-ink-500 mb-1">当前题目</div>
            <MathHtml className="block text-sm text-ink-900 line-clamp-3 whitespace-pre-wrap">
              {question.stem}
            </MathHtml>
          </div>

          <div className="overflow-hidden rounded-lg border border-ink-200">
            <div
              role="tablist"
              aria-label="题目目录"
              className="grid grid-cols-2 border-b border-ink-200 bg-mist/30"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeDirectoryTab === "chapter"}
                onClick={() => setActiveDirectoryTab("chapter")}
                className={cn(
                  "flex items-center justify-center gap-2 border-r border-ink-200 px-4 py-3 text-sm font-medium transition-colors",
                  activeDirectoryTab === "chapter"
                    ? "bg-gold-50 text-gold-800 shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-gold-500"
                    : "text-ink-500 hover:bg-paper hover:text-ink-800",
                )}
              >
                <BookOpen className="h-4 w-4" />
                <span>章节课目录</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px]",
                  activeDirectoryTab === "chapter" ? "bg-gold-100 text-gold-700" : "bg-ink-100 text-ink-500",
                )}>
                  已选 {chapterIds.length}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeDirectoryTab === "knowledge"}
                onClick={() => setActiveDirectoryTab("knowledge")}
                className={cn(
                  "flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                  activeDirectoryTab === "knowledge"
                    ? "bg-teal-50 text-teal-800 shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-teal-500"
                    : "text-ink-500 hover:bg-paper hover:text-ink-800",
                )}
              >
                <Lightbulb className="h-4 w-4" />
                <span>知识点目录</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px]",
                  activeDirectoryTab === "knowledge" ? "bg-teal-100 text-teal-700" : "bg-ink-100 text-ink-500",
                )}>
                  已选 {knowledgePointIds.length}
                </span>
              </button>
            </div>

            <div
              role="tabpanel"
              data-testid="quick-edit-directory-panel"
              className="min-h-[390px] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-500">{activeTitle}</span>
                {activeCheckedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => activeSetCheckedIds([])}
                    className={cn(
                      "text-xs transition-colors hover:text-red-600",
                      activeDirectoryTab === "chapter" ? "text-gold-600" : "text-teal-600",
                    )}
                  >
                    清除已选
                  </button>
                )}
              </div>

              {activeTree ? (
                <SearchableTree
                  key={activeDirectoryTab}
                  editable
                  data={activeTree}
                  onDataChange={activeSetTree}
                  title={activeTitle}
                  accent={activeDirectoryTab === "knowledge" ? "teal" : "gold"}
                  checkable
                  checkedIds={activeCheckedIds}
                  onCheck={activeSetCheckedIds}
                  expandLevel={2}
                  searchPlaceholder={activeSearchPlaceholder}
                  showHeader={false}
                  treeMaxHeightClassName="h-[330px] max-h-[330px]"
                />
              ) : (
                <div className="flex h-[330px] items-center justify-center text-xs text-ink-400">加载中...</div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-ink-200">
            <div className="flex items-center justify-between border-b border-ink-200 bg-mist/50 px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-ink-600" />
                <span className="text-sm font-medium text-ink-800">备注</span>
                <span className="text-xs text-ink-500">{remarks.length} 条</span>
              </div>
            </div>

            <div className="space-y-2 p-3">
              {remarks.length === 0 && !addingRemark && (
                <div className="py-4 text-center text-xs text-ink-400">
                  暂无备注
                </div>
              )}
              {remarks.map((r) => (
                <div
                  key={r.id}
                  className="group rounded-md border border-gold-100 bg-gold-50/40 p-2.5"
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
                      <div className="mt-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[11px] text-ink-400">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(r.updatedAt)}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => startEditRemark(r)}
                            className="rounded p-1 text-ink-400 hover:bg-mist hover:text-gold-600"
                            title="编辑"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteRemark(r.id)}
                            className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
                            title="删除"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {addingRemark ? (
                <div className="space-y-2 rounded-md border border-gold-200 bg-paper p-2.5">
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
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gold-200 py-2 text-xs text-gold-600 transition-colors hover:border-gold-300 hover:text-gold-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增备注
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
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
