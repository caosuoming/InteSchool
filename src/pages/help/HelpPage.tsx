import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CircleHelp,
  ImagePlus,
  Lightbulb,
  MessageCircleQuestion,
  MessageSquarePlus,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, Modal, Select, Spinner, Textarea, Input } from "@/components/ui";
import { toast } from "@/stores/ui";
import { helpService, type HelpReplyInput, type HelpTopicInput } from "@/services/help";
import { uploadFile } from "@/services/api";
import type {
  HelpAttachment,
  HelpBoardSnapshot,
  HelpReplyType,
  HelpTopicType,
  HelpTopicView,
} from "@/types";
import { cn } from "@/lib/utils";

const EMPTY_BOARD: HelpBoardSnapshot = { topics: [], categories: [], canManage: false };

const topicMeta: Record<HelpTopicType, {
  label: string;
  icon: typeof MessageCircleQuestion;
  className: string;
}> = {
  question: { label: "询问用法", icon: MessageCircleQuestion, className: "bg-blue-50 text-blue-700 border-blue-100" },
  suggestion: { label: "提出建议", icon: Lightbulb, className: "bg-amber-50 text-amber-700 border-amber-100" },
  wish: { label: "许个愿望", icon: Sparkles, className: "bg-violet-50 text-violet-700 border-violet-100" },
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function attachmentFromUpload(file: Awaited<ReturnType<typeof uploadFile>>): HelpAttachment {
  return {
    id: file.id,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: file.url,
  };
}

function ImageAttachments({ attachments }: { attachments: HelpAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-lg border border-ink-100 bg-mist"
          title={attachment.name}
        >
          <img
            src={attachment.url}
            alt={attachment.name}
            className="h-28 w-36 object-cover transition-transform hover:scale-[1.02]"
          />
        </a>
      ))}
    </div>
  );
}

function AttachmentPicker({
  attachments,
  onChange,
  disabled,
}: {
  attachments: HelpAttachment[];
  onChange: (attachments: HelpAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = [...files];
    if (attachments.length + selected.length > 6) {
      toast.error("每次最多上传 6 张图片");
      return;
    }
    if (selected.some((file) => !file.type.startsWith("image/"))) {
      toast.error("这里只支持上传图片");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await Promise.all(selected.map(uploadFile));
      onChange([...attachments, ...uploaded.map(attachmentFromUpload)]);
    } catch (error) {
      toast.error("图片上传失败", error instanceof Error ? error.message : undefined);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading || attachments.length >= 6}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          上传图片
        </Button>
        <span className="text-xs text-ink-400">{attachments.length}/6</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="group relative overflow-hidden rounded-md border border-ink-100">
              <img src={attachment.url} alt={attachment.name} className="h-16 w-20 object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-ink-950/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}
                aria-label={`移除 ${attachment.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyComposer({
  topic,
  onSubmitted,
}: {
  topic: HelpTopicView;
  onSubmitted: () => Promise<void>;
}) {
  const [type, setType] = useState<HelpReplyType>(topic.type === "question" ? "answer" : "follow_up");
  const [content, setContent] = useState("");
  const [attachments, setAttachments] = useState<HelpAttachment[]>([]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      toast.error("请输入回复内容");
      return;
    }
    setSaving(true);
    try {
      const input: HelpReplyInput = { type, content, attachments };
      await helpService.addReply(topic.id, input);
      setContent("");
      setAttachments([]);
      await onSubmitted();
      toast.success(type === "answer" ? "回答已发布" : "补充已发布");
    } catch (error) {
      toast.error("发布失败", error instanceof Error ? error.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-ink-100 bg-paper p-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            type === "answer" ? "bg-teal-50 text-teal-700" : "bg-mist text-ink-500 hover:text-ink-700",
          )}
          onClick={() => setType("answer")}
        >
          回答
        </button>
        <button
          type="button"
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            type === "follow_up" ? "bg-blue-50 text-blue-700" : "bg-mist text-ink-500 hover:text-ink-700",
          )}
          onClick={() => setType("follow_up")}
        >
          补充问题/信息
        </button>
      </div>
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={type === "answer" ? "写下你的解答或回应..." : "补充问题、场景或更多信息..."}
        rows={3}
        maxLength={5000}
      />
      <div className="mt-2 flex items-end justify-between gap-3">
        <AttachmentPicker attachments={attachments} onChange={setAttachments} disabled={saving} />
        <Button size="sm" loading={saving} onClick={() => void submit()}>
          发布
        </Button>
      </div>
    </div>
  );
}

export default function HelpPage() {
  const [board, setBoard] = useState<HelpBoardSnapshot>(EMPTY_BOARD);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [topicType, setTopicType] = useState<HelpTopicType>("question");
  const [topicTitle, setTopicTitle] = useState("");
  const [topicContent, setTopicContent] = useState("");
  const [topicCategoryId, setTopicCategoryId] = useState("");
  const [topicAttachments, setTopicAttachments] = useState<HelpAttachment[]>([]);
  const [topicSaving, setTopicSaving] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await helpService.getBoard();
      setBoard(snapshot);
    } catch (error) {
      toast.error("加载帮助与许愿失败", error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (filter !== "all" && !board.categories.some((category) => category.id === filter)) {
      setFilter("all");
    }
  }, [board.categories, filter]);

  const visibleTopics = useMemo(() => (
    filter === "all" ? board.topics : board.topics.filter((topic) => topic.categoryId === filter)
  ), [board.topics, filter]);

  const createTopic = async () => {
    if (!topicTitle.trim() || !topicContent.trim()) {
      toast.error("请填写标题和内容");
      return;
    }
    setTopicSaving(true);
    try {
      const input: HelpTopicInput = {
        type: topicType,
        title: topicTitle,
        content: topicContent,
        categoryId: topicCategoryId || null,
        attachments: topicAttachments,
      };
      const created = await helpService.createTopic(input);
      setTopicModalOpen(false);
      setTopicTitle("");
      setTopicContent("");
      setTopicCategoryId("");
      setTopicAttachments([]);
      setExpanded((current) => new Set(current).add(created.id));
      await refresh();
      toast.success("话题已发布");
    } catch (error) {
      toast.error("发布失败", error instanceof Error ? error.message : undefined);
    } finally {
      setTopicSaving(false);
    }
  };

  const mutate = async (key: string, action: () => Promise<void>, success?: string) => {
    setMutatingId(key);
    try {
      await action();
      await refresh();
      if (success) toast.success(success);
    } catch (error) {
      toast.error("操作失败", error instanceof Error ? error.message : undefined);
    } finally {
      setMutatingId(null);
    }
  };

  const createCategory = async () => {
    if (!categoryName.trim()) return;
    setCategorySaving(true);
    try {
      await helpService.createCategory(categoryName);
      setCategoryName("");
      await refresh();
      toast.success("分类已创建");
    } catch (error) {
      toast.error("创建分类失败", error instanceof Error ? error.message : undefined);
    } finally {
      setCategorySaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="帮助与许愿"
        description="询问平台用法、补充解答、提出建议，或者许下你希望智题云校实现的愿望。"
        icon={<CircleHelp className="h-5 w-5" />}
        action={(
          <div className="flex gap-2">
            {board.canManage && (
              <Button variant="outline" onClick={() => setCategoryModalOpen(true)}>
                <Settings2 className="h-4 w-4" />
                分类管理
              </Button>
            )}
            <Button onClick={() => setTopicModalOpen(true)}>
              <Plus className="h-4 w-4" />
              发表话题
            </Button>
          </div>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm transition-colors",
            filter === "all" ? "border-ink-900 bg-ink-900 text-white" : "border-ink-150 bg-paper text-ink-600 hover:border-ink-300",
          )}
        >
          全部
        </button>
        {board.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setFilter(category.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              filter === category.id ? "border-ink-900 bg-ink-900 text-white" : "border-ink-150 bg-paper text-ink-600 hover:border-ink-300",
            )}
          >
            {category.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Spinner /></div>
      ) : visibleTopics.length === 0 ? (
        <Card className="py-16 text-center">
          <CircleHelp className="mx-auto h-9 w-9 text-ink-300" />
          <div className="mt-3 font-medium text-ink-700">这里还没有话题</div>
          <div className="mt-1 text-sm text-ink-400">可以发表第一个问题、建议或愿望。</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleTopics.map((topic, index) => {
            const meta = topicMeta[topic.type];
            const TypeIcon = meta.icon;
            const isExpanded = expanded.has(topic.id);
            const category = board.categories.find((item) => item.id === topic.categoryId);
            return (
              <Card key={topic.id} className="overflow-hidden p-0">
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border", meta.className)}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("rounded border px-2 py-0.5 text-[11px] font-medium", meta.className)}>{meta.label}</span>
                        {category && <span className="rounded bg-mist px-2 py-0.5 text-[11px] text-ink-500">{category.name}</span>}
                        <span className="text-xs text-ink-400">{topic.authorName} · {formatTime(topic.createdAt)}</span>
                      </div>
                      <h2 className="mt-2 text-base font-semibold text-ink-900">{topic.title}</h2>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-ink-600">{topic.content}</p>
                      <ImageAttachments attachments={topic.attachments} />
                    </div>

                    {board.canManage && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {filter === "all" && (
                          <>
                            <button
                              type="button"
                              className="rounded p-1.5 text-ink-400 hover:bg-mist hover:text-ink-700 disabled:opacity-30"
                              title="上移"
                              disabled={index === 0 || mutatingId !== null}
                              onClick={() => void mutate(`move-${topic.id}`, () => helpService.moveTopic(topic.id, "up"))}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1.5 text-ink-400 hover:bg-mist hover:text-ink-700 disabled:opacity-30"
                              title="下移"
                              disabled={index === visibleTopics.length - 1 || mutatingId !== null}
                              onClick={() => void mutate(`move-${topic.id}`, () => helpService.moveTopic(topic.id, "down"))}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="rounded p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          title="删除话题"
                          disabled={mutatingId !== null}
                          onClick={() => {
                            if (window.confirm("确定删除这个话题及其全部回复吗？")) {
                              void mutate(`delete-${topic.id}`, () => helpService.deleteTopic(topic.id), "话题已删除");
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(topic.id)) next.delete(topic.id);
                        else next.add(topic.id);
                        return next;
                      })}
                      className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
                    >
                      <MessageSquarePlus className="h-4 w-4" />
                      {topic.replies.length > 0 ? `${topic.replies.length} 条讨论` : "补充或回答"}
                      <span className="text-xs text-ink-300">{isExpanded ? "收起" : "展开"}</span>
                    </button>

                    {board.canManage && (
                      <select
                        value={topic.categoryId || ""}
                        className="rounded-md border border-ink-150 bg-paper px-2 py-1.5 text-xs text-ink-600 outline-none focus:border-gold-400"
                        disabled={mutatingId !== null}
                        onChange={(event) => void mutate(
                          `category-${topic.id}`,
                          () => helpService.setTopicCategory(topic.id, event.target.value || null),
                          "分类已更新",
                        )}
                      >
                        <option value="">未分类</option>
                        {board.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-ink-100 bg-mist/40 px-5 py-4">
                    {topic.replies.length > 0 && (
                      <div className="mb-4 space-y-3">
                        {topic.replies.map((reply) => (
                          <div key={reply.id} className="rounded-lg border border-ink-100 bg-paper p-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className={cn(
                                    "rounded px-1.5 py-0.5 font-medium",
                                    reply.type === "answer" ? "bg-teal-50 text-teal-700" : "bg-blue-50 text-blue-700",
                                  )}>
                                    {reply.type === "answer" ? "回答" : "补充"}
                                  </span>
                                  <span className="text-ink-500">{reply.authorName}</span>
                                  <span className="text-ink-300">{formatTime(reply.createdAt)}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink-600">{reply.content}</p>
                                <ImageAttachments attachments={reply.attachments} />
                              </div>
                              {board.canManage && (
                                <button
                                  type="button"
                                  className="rounded p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
                                  title="删除这条回复"
                                  disabled={mutatingId !== null}
                                  onClick={() => {
                                    if (window.confirm("确定删除这条回复吗？")) {
                                      void mutate(`reply-${reply.id}`, () => helpService.deleteReply(reply.id), "回复已删除");
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <ReplyComposer topic={topic} onSubmitted={refresh} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={topicModalOpen}
        onClose={() => !topicSaving && setTopicModalOpen(false)}
        title="发表话题"
        description="可以询问用法、提出建议或许下愿望；正文和回复都支持上传图片。"
        size="lg"
        footer={(
          <>
            <Button variant="ghost" disabled={topicSaving} onClick={() => setTopicModalOpen(false)}>取消</Button>
            <Button loading={topicSaving} onClick={() => void createTopic()}>发布话题</Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Select
            label="话题类型"
            value={topicType}
            onChange={(event) => setTopicType(event.target.value as HelpTopicType)}
            options={Object.entries(topicMeta).map(([value, meta]) => ({ value, label: meta.label }))}
          />
          {board.categories.length > 0 && (
            <Select
              label="分类"
              value={topicCategoryId}
              onChange={(event) => setTopicCategoryId(event.target.value)}
              placeholder="暂不分类"
              options={board.categories.map((category) => ({ value: category.id, label: category.name }))}
            />
          )}
          <Input
            label="标题"
            value={topicTitle}
            onChange={(event) => setTopicTitle(event.target.value)}
            maxLength={100}
            placeholder="用一句话说明你的问题或想法"
          />
          <Textarea
            label="内容"
            value={topicContent}
            onChange={(event) => setTopicContent(event.target.value)}
            maxLength={5000}
            rows={7}
            placeholder="补充背景、具体操作步骤、期待的效果等..."
          />
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-700">图片</div>
            <AttachmentPicker attachments={topicAttachments} onChange={setTopicAttachments} disabled={topicSaving} />
          </div>
        </div>
      </Modal>

      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="分类管理"
        description="学校管理员可以创建分类，并在话题列表中为话题归类。"
        size="sm"
      >
        <div className="flex gap-2">
          <Input
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            maxLength={30}
            placeholder="新分类名称"
            onKeyDown={(event) => {
              if (event.key === "Enter") void createCategory();
            }}
          />
          <Button loading={categorySaving} onClick={() => void createCategory()}>创建</Button>
        </div>
        <div className="mt-4 space-y-2">
          {board.categories.length === 0 ? (
            <div className="py-6 text-center text-sm text-ink-400">还没有分类</div>
          ) : board.categories.map((category) => (
            <div key={category.id} className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2.5">
              <span className="text-sm text-ink-700">{category.name}</span>
              <button
                type="button"
                className="rounded p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"
                onClick={() => {
                  if (window.confirm(`删除分类“${category.name}”？该分类下的话题会变为未分类。`)) {
                    void mutate(`category-delete-${category.id}`, () => helpService.deleteCategory(category.id), "分类已删除");
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
