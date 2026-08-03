import { useEffect, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { questionService } from "@/services/question";
import { toast } from "@/stores/ui";
import type { Question, QuestionLink } from "@/types";

interface QuestionLinksModalProps {
  open: boolean;
  question: Question | null;
  onClose: () => void;
  onSaved: (question: Question) => void;
}

function createLink(): QuestionLink {
  return {
    id: `qlink-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    url: "",
  };
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function QuestionLinksModal({
  open,
  question,
  onClose,
  onSaved,
}: QuestionLinksModalProps) {
  const [links, setLinks] = useState<QuestionLink[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !question) return;
    setLinks(question.links?.length ? question.links.map((link) => ({ ...link })) : [createLink()]);
  }, [open, question]);

  const updateLink = (id: string, patch: Partial<QuestionLink>) => {
    setLinks((current) => current.map((link) => link.id === id ? { ...link, ...patch } : link));
  };

  const handleSave = async () => {
    if (!question) return;
    const nonEmpty = links.filter((link) => link.name.trim() || link.url.trim());
    const incomplete = nonEmpty.find((link) => !link.name.trim() || !link.url.trim());
    if (incomplete) {
      toast.error("链接名称和网址需要同时填写");
      return;
    }
    const invalid = nonEmpty.find((link) => !validHttpUrl(link.url.trim()));
    if (invalid) {
      toast.error("请输入有效的 http 或 https 链接");
      return;
    }

    setSaving(true);
    try {
      const updated = await questionService.updateQuestion(question.id, {
        links: nonEmpty.map((link) => ({
          ...link,
          name: link.name.trim(),
          url: link.url.trim(),
        })),
      });
      toast.success("题目链接已保存");
      onSaved(updated);
    } catch (error) {
      toast.error("链接保存失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="插入链接"
      description="添加课堂中可直接调用的链接名称和网址，可插入多个链接。"
      footer={(
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="gold" onClick={handleSave} loading={saving}>
            <Link2 className="h-4 w-4" />
            保存链接
          </Button>
        </div>
      )}
    >
      <div className="space-y-3">
        {links.map((link, index) => (
          <div key={link.id} className="grid gap-2 rounded-lg border border-ink-100 bg-mist/30 p-3 md:grid-cols-[1fr_1.6fr_auto]">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-600">链接名称</label>
              <input
                value={link.name}
                onChange={(event) => updateLink(link.id, { name: event.target.value })}
                className="input-base w-full"
                placeholder={`链接 ${index + 1} 名称`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-600">链接网址</label>
              <input
                value={link.url}
                onChange={(event) => updateLink(link.id, { url: event.target.value })}
                className="input-base w-full"
                placeholder="https://example.com"
                inputMode="url"
              />
            </div>
            <button
              type="button"
              onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))}
              className="self-end rounded-md p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"
              title="删除链接"
              aria-label={`删除链接 ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={() => setLinks((current) => [...current, createLink()])}>
          <Plus className="h-3.5 w-3.5" />
          添加链接
        </Button>
      </div>
    </Modal>
  );
}

export default QuestionLinksModal;
