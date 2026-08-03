import { useMemo, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { prepService } from "@/services/prep";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Input";
import type { PrepResourceComment } from "@/types";

interface ResourceCommentButtonProps {
  taskId: string;
  targetId: string;
  targetLabel: string;
  password?: string;
  comments: PrepResourceComment[];
  onCommentsChange: (comments: PrepResourceComment[]) => void;
}

export function ResourceCommentButton({
  taskId,
  targetId,
  targetLabel,
  password,
  comments,
  onCommentsChange,
}: ResourceCommentButtonProps) {
  const { teacher } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const targetComments = useMemo(
    () => comments.filter((comment) => comment.targetId === targetId),
    [comments, targetId],
  );

  const addComment = async () => {
    if (!content.trim()) {
      toast.warning("请输入批注内容");
      return;
    }
    setSaving(true);
    try {
      const created = await prepService.addResourceComment(
        taskId,
        { targetId, content: content.trim() },
        password,
      );
      onCommentsChange([...comments, created]);
      setContent("");
      toast.success("批注已添加");
    } catch (error) {
      toast.error("批注失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    setDeletingId(commentId);
    try {
      await prepService.deleteResourceComment(taskId, commentId, password);
      onCommentsChange(comments.filter((comment) => comment.id !== commentId));
      toast.success("批注已删除");
    } catch (error) {
      toast.error("删除失败", error instanceof Error ? error.message : undefined);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-ink-500"
        onClick={() => setOpen(true)}
        title={`为${targetLabel}添加批注`}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" />
        批注
        {targetComments.length > 0 && <Badge variant="amber">{targetComments.length}</Badge>}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="段落批注"
        description={targetLabel}
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>关闭</Button>
            <Button variant="gold" loading={saving} onClick={() => void addComment()}>
              添加批注
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Textarea
            label="新批注"
            value={content}
            maxLength={2000}
            rows={4}
            onChange={(event) => setContent(event.target.value)}
            placeholder="记录修改建议、审题意见或需要协作者确认的内容"
          />
          <div className="space-y-2">
            {targetComments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ink-200 px-4 py-7 text-center text-sm text-ink-400">
                暂无批注
              </div>
            ) : targetComments.map((comment) => {
              const canDelete = comment.createdBy === teacher?.id;
              return (
                <div key={comment.id} className="rounded-lg border border-ink-100 bg-mist/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                      {comment.content}
                    </div>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        loading={deletingId === comment.id}
                        onClick={() => void deleteComment(comment.id)}
                        aria-label="删除批注"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-ink-400">
                    {comment.createdBy === teacher?.id ? "我" : "协作教师"} · {new Date(comment.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
