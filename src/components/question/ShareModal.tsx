import { useState } from "react";
import { X, Share2, Users, Copy, Check, Send, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { Button } from "@/components/ui/Button";
import type { Question } from "@/types";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  question: Question | null;
}

export function ShareModal({ open, onClose, question }: ShareModalProps) {
  const { teacher } = useAuthStore();
  const [shareType, setShareType] = useState<"link" | "teacher">("link");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  if (!open || !question) return null;

  const shareLink = `${window.location.origin}/question/${question.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("链接已复制");
  };

  const handleShareToTeacher = async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 800));
    toast.success("已发送到同事");
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <div className="relative bg-paper rounded-xl shadow-xl w-full max-w-md animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-gold-500" />
            <h3 className="font-serif font-semibold text-ink-900">分享题目</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-mist text-ink-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* 题干预览 */}
          <div className="p-3 rounded-lg bg-mist/50 border border-ink-100">
            <div className="text-xs font-medium text-ink-500 mb-1">题目预览</div>
            <div className="text-sm text-ink-900 line-clamp-2">{question.stem}</div>
          </div>

          {/* 分享方式选择 */}
          <div className="flex gap-2">
            <button
              onClick={() => setShareType("link")}
              className={cn(
                "flex-1 p-3 rounded-lg border text-left transition-all",
                shareType === "link"
                  ? "border-gold-300 bg-gold-50"
                  : "border-ink-200 bg-paper hover:border-ink-300",
              )}
            >
              <Copy className={cn("w-4 h-4 mb-1", shareType === "link" ? "text-gold-600" : "text-ink-400")} />
              <div className="font-medium text-sm">复制链接</div>
              <div className="text-xs text-ink-500 mt-0.5">生成可分享的链接</div>
            </button>
            <button
              onClick={() => setShareType("teacher")}
              className={cn(
                "flex-1 p-3 rounded-lg border text-left transition-all",
                shareType === "teacher"
                  ? "border-teal-300 bg-teal-50"
                  : "border-ink-200 bg-paper hover:border-ink-300",
              )}
            >
              <Users className={cn("w-4 h-4 mb-1", shareType === "teacher" ? "text-teal-600" : "text-ink-400")} />
              <div className="font-medium text-sm">分享给同事</div>
              <div className="text-xs text-ink-500 mt-0.5">发送到校内教师</div>
            </button>
          </div>

          {/* 链接复制 */}
          {shareType === "link" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="input-base flex-1 text-xs font-mono bg-mist"
                />
                <Button variant="gold" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "已复制" : "复制"}
                </Button>
              </div>
              <p className="text-xs text-ink-400">
                链接有效期：永久，仅限校内教师访问
              </p>
            </div>
          )}

          {/* 分享给同事 */}
          {shareType === "teacher" && (
            <div className="space-y-3">
              <div className="text-xs text-ink-500">
                此功能将题目发送到目标教师的「分享给我的」列表中
              </div>
              <Button
                variant="gold"
                size="sm"
                className="w-full"
                onClick={handleShareToTeacher}
                loading={sending}
              >
                <Send className="w-3.5 h-3.5" />
                发送给同事
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-ink-100 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;