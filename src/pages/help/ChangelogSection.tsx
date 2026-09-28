import { useMemo, useState } from "react";
import { Copy, FileClock, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Input, Modal, Textarea } from "@/components/ui";
import { helpService, type HelpChangelogInput } from "@/services/help";
import { formatDate } from "@/lib/service-utils";
import { toast } from "@/stores/ui";
import type { HelpBoardSnapshot, HelpChangelogEntry } from "@/types";

interface ChangelogSectionProps {
  board: HelpBoardSnapshot;
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function ChangelogSection({ board, loading, onRefresh }: ChangelogSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HelpChangelogEntry | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(board.changelogShareToken);
  const [generatingShare, setGeneratingShare] = useState(false);

  const shareUrl = useMemo(() => (
    shareToken ? `${window.location.origin}/changelog/${encodeURIComponent(shareToken)}` : ""
  ), [shareToken]);

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setEditorOpen(true);
  };

  const openEdit = (entry: HelpChangelogEntry) => {
    setEditing(entry);
    setTitle(entry.title);
    setContent(entry.content);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("请填写标题和更新内容");
      return;
    }
    setSaving(true);
    try {
      const input: HelpChangelogInput = { title, content };
      if (editing) {
        await helpService.updateChangelogEntry(editing.id, input);
        toast.success("更新日志已保存");
      } else {
        await helpService.createChangelogEntry(input);
        toast.success("更新日志已发布");
      }
      setEditorOpen(false);
      await onRefresh();
    } catch (error) {
      toast.error("保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (entry: HelpChangelogEntry) => {
    if (!window.confirm(`确定删除“${entry.title}”吗？`)) return;
    setDeletingId(entry.id);
    try {
      await helpService.deleteChangelogEntry(entry.id);
      await onRefresh();
      toast.success("更新日志已删除");
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDeletingId(null);
    }
  };

  const openShare = async () => {
    setShareOpen(true);
    if (shareToken || board.changelogShareToken) {
      setShareToken(shareToken || board.changelogShareToken);
      return;
    }
    setGeneratingShare(true);
    try {
      const token = await helpService.generateChangelogShare();
      setShareToken(token);
      await onRefresh();
    } catch (error) {
      setShareOpen(false);
      toast.error("生成分享链接失败", error instanceof Error ? error.message : undefined);
    } finally {
      setGeneratingShare(false);
    }
  };

  const regenerateShare = async () => {
    setGeneratingShare(true);
    try {
      const token = await helpService.generateChangelogShare();
      setShareToken(token);
      await onRefresh();
      toast.success("新的分享链接已生成", "旧链接已失效");
    } catch (error) {
      toast.error("生成分享链接失败", error instanceof Error ? error.message : undefined);
    } finally {
      setGeneratingShare(false);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("分享链接已复制");
    } catch {
      toast.error("复制失败", "请手动复制分享链接");
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-500">
          记录平台功能与体验更新。所有用户可查看，只有平台管理员可以维护内容。
        </div>
        {board.canManageChangelog && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void openShare()}>
              <Link2 className="h-4 w-4" />
              {board.changelogShareToken || shareToken ? "分享链接" : "生成分享链接"}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              新增日志
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <Card className="py-16 text-center text-sm text-ink-400">正在加载更新日志...</Card>
      ) : board.changelog.length === 0 ? (
        <Card className="py-16 text-center">
          <FileClock className="mx-auto h-9 w-9 text-ink-300" />
          <div className="mt-3 font-medium text-ink-700">暂无更新日志</div>
          <div className="mt-1 text-sm text-ink-400">
            {board.canManageChangelog ? "发布第一条平台更新记录。" : "平台管理员尚未发布更新记录。"}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {board.changelog.map((entry) => (
            <Card key={entry.id} className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
                  <FileClock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-ink-900">{entry.title}</h2>
                    <span className="text-xs text-ink-400">{formatDate(entry.updatedAt, true)}</span>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-ink-600">
                    {entry.content}
                  </div>
                </div>
                {board.canManageChangelog && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="rounded p-1.5 text-ink-400 hover:bg-mist hover:text-ink-700"
                      title="编辑更新日志"
                      onClick={() => openEdit(entry)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      title="删除更新日志"
                      disabled={deletingId !== null}
                      onClick={() => void remove(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editorOpen}
        onClose={() => !saving && setEditorOpen(false)}
        title={editing ? "编辑更新日志" : "新增更新日志"}
        description="更新日志对所有已登录用户可见，也可以通过分享链接公开查看。"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" disabled={saving} onClick={() => setEditorOpen(false)}>取消</Button>
            <Button loading={saving} onClick={() => void save()}>{editing ? "保存修改" : "发布"}</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Input
            label="标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={100}
            placeholder="例如：2026 年 9 月功能更新"
          />
          <Textarea
            label="更新内容"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={20000}
            rows={12}
            placeholder={"逐条写明本次新增、优化和修复内容。\n支持换行和项目符号文本。"}
          />
        </div>
      </Modal>

      <Modal
        open={shareOpen}
        onClose={() => !generatingShare && setShareOpen(false)}
        title="更新日志分享链接"
        description="任何获得链接的人都可以在未登录状态查看当前更新日志。重新生成后旧链接立即失效。"
        size="md"
        footer={(
          <>
            <Button variant="outline" loading={generatingShare} onClick={() => void regenerateShare()}>
              重新生成
            </Button>
            <Button disabled={!shareUrl || generatingShare} onClick={() => void copyShare()}>
              <Copy className="h-4 w-4" />
              复制链接
            </Button>
          </>
        )}
      >
        <Input
          label="分享链接"
          aria-label="更新日志分享链接"
          value={shareUrl}
          readOnly
          placeholder={generatingShare ? "正在生成..." : ""}
        />
      </Modal>
    </>
  );
}
