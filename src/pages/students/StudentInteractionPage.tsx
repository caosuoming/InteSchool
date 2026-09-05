import { useCallback, useEffect, useState, useMemo, type ClipboardEvent } from "react";
import {
  MessagesSquare, Search, Trash2,
  Smile, Meh, Frown, Star, Plus,
  Clock, MessageCircle, TrendingUp,
  GraduationCap, ChevronDown, ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { classService } from "@/services/class";
import { studentInteractionService } from "@/services/studentInteraction";
import { uploadFile } from "@/services/api";
import type { Student, StudentInteractionAttachment, StudentInteractionView, AnyClass } from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResizableSplitPane } from "@/components/layout/ResizableSplitPane";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea, Select } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(dateStr).toLocaleDateString("zh-CN");
}

const attitudeOptions = [
  { value: "5", label: "积极认真", icon: Smile, color: "text-emerald-600" },
  { value: "4", label: "较为认真", icon: Smile, color: "text-teal-600" },
  { value: "3", label: "一般", icon: Meh, color: "text-amber-600" },
  { value: "2", label: "稍显懈怠", icon: Frown, color: "text-orange-600" },
  { value: "1", label: "消极", icon: Frown, color: "text-red-600" },
];

const statusTagOptions = [
  "听课专注",
  "主动提问",
  "作业完成好",
  "基础薄弱",
  "需要鼓励",
  "注意力不集中",
  "进步明显",
  "需要关注",
];

export function StudentInteractionPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { teacher } = useAuthStore();
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [myClasses, setMyClasses] = useState<AnyClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<StudentInteractionView[]>([]);
  const [keyword, setKeyword] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [followedStudentIds, setFollowedStudentIds] = useState<Set<string>>(() => new Set());
  const [followPendingStudentIds, setFollowPendingStudentIds] = useState<Set<string>>(() => new Set());
  // 每个学生的最近互动时间
  const [lastInteractionMap, setLastInteractionMap] = useState<Record<string, string>>({});

  // 新建记录
  const [newType, setNewType] = useState<"chat" | "attitude" | "status">("chat");
  const [newContent, setNewContent] = useState("");
  const [newAttitude, setNewAttitude] = useState("3");
  const [newStatusTag, setNewStatusTag] = useState(statusTagOptions[0]);
  const [shareWithHomeroom, setShareWithHomeroom] = useState(false);
  const [newAttachments, setNewAttachments] = useState<StudentInteractionAttachment[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadStudents = useCallback(async () => {
    if (!teacher?.schoolId || !teacher?.id) return;
    setLoading(true);
    try {
      const [all, classes, followed] = await Promise.all([
        classService.listMyStudents(teacher.schoolId, teacher.id),
        classService.listMyClasses(teacher.schoolId, teacher.id),
        studentInteractionService.listFollowedStudentIds(),
      ]);
      setAllStudents(all);
      setMyClasses(classes);
      setFollowedStudentIds(new Set(followed));
      // 加载所有学生的最近互动时间
      const teacherInteractions = await studentInteractionService.listByTeacher(teacher.id);
      const lastMap: Record<string, string> = {};
      teacherInteractions.forEach((it) => {
        const existing = lastMap[it.studentId];
        if (!existing || new Date(it.createdAt) > new Date(existing)) {
          lastMap[it.studentId] = it.createdAt;
        }
      });
      setLastInteractionMap(lastMap);
      // 默认选中排序后第一名
      setSelectedStudentId((current) => (
        current && all.some((student) => student.id === current)
          ? current
          : all[0]?.id ?? null
      ));
    } catch (err) {
      toast.error("加载学生列表失败");
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => {
    if (teacher?.schoolId && teacher?.id) {
      loadStudents();
    }
  }, [loadStudents, teacher]);

  const loadInteractions = useCallback(async () => {
    if (!selectedStudentId) return;
    try {
      const list = await studentInteractionService.listByStudent(selectedStudentId);
      setInteractions(list);
      // 更新该学生最近互动时间缓存
      if (list.length > 0) {
        setLastInteractionMap((prev) => {
          const latest = list[0].createdAt;
          const existing = prev[selectedStudentId];
          if (!existing || new Date(latest) > new Date(existing)) {
            return { ...prev, [selectedStudentId]: latest };
          }
          return prev;
        });
      }
    } catch (err) {
      toast.error("加载互动记录失败");
    }
  }, [selectedStudentId]);

  useEffect(() => {
    if (selectedStudentId) {
      loadInteractions();
    }
  }, [loadInteractions, selectedStudentId]);

  // 按最近互动时间排序：越久远（或从未互动）的越靠前
  const sortStudentsByInteraction = useCallback((list: Student[]): Student[] => {
    return [...list].sort((a, b) => {
      const aFollowed = followedStudentIds.has(a.id);
      const bFollowed = followedStudentIds.has(b.id);
      if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
      const ta = lastInteractionMap[a.id] ? new Date(lastInteractionMap[a.id]).getTime() : 0;
      const tb = lastInteractionMap[b.id] ? new Date(lastInteractionMap[b.id]).getTime() : 0;
      // 升序：越小（越久远或从未互动）越靠前
      return ta - tb;
    });
  }, [followedStudentIds, lastInteractionMap]);

  const filteredStudents = useMemo(() => {
    return keyword.trim()
      ? allStudents.filter((s) => {
          const kw = keyword.toLowerCase();
          return s.name.toLowerCase().includes(kw) || (s.studentNo || "").toLowerCase().includes(kw);
        })
      : allStudents;
  }, [allStudents, keyword]);

  const studentGroups = useMemo(() => {
    const groupedStudentIds = new Set<string>();
    const groups = myClasses.flatMap((classInfo) => {
      const members = filteredStudents.filter((student) => {
        if (classInfo.type === "school") return student.classId === classInfo.id;
        return classInfo.studentIds.includes(student.id);
      });
      members.forEach((student) => groupedStudentIds.add(student.id));
      const sortedMembers = sortStudentsByInteraction(members);
      return sortedMembers.length > 0
        ? [{ id: classInfo.id, name: classInfo.name, students: sortedMembers }]
        : [];
    });
    const ungrouped = sortStudentsByInteraction(
      filteredStudents.filter((student) => !groupedStudentIds.has(student.id)),
    );
    if (ungrouped.length > 0) {
      groups.push({ id: "ungrouped", name: "其他学生", students: ungrouped });
    }
    return groups;
  }, [filteredStudents, myClasses, sortStudentsByInteraction]);

  const toggleStudentGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const classMap = useMemo(() => {
    const map: Record<string, AnyClass> = {};
    myClasses.forEach((classInfo) => { map[classInfo.id] = classInfo; });
    return map;
  }, [myClasses]);

  const selectedStudent = allStudents.find((s) => s.id === selectedStudentId);

  const handleToggleFollow = useCallback(async (studentId: string) => {
    if (followPendingStudentIds.has(studentId)) return;
    const nextFollowed = !followedStudentIds.has(studentId);
    setFollowPendingStudentIds((current) => new Set(current).add(studentId));
    setFollowedStudentIds((current) => {
      const next = new Set(current);
      if (nextFollowed) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
    try {
      await studentInteractionService.setStudentFollowed(studentId, nextFollowed);
    } catch (err) {
      setFollowedStudentIds((current) => {
        const next = new Set(current);
        if (nextFollowed) next.delete(studentId);
        else next.add(studentId);
        return next;
      });
      toast.error("更新关注状态失败", err instanceof Error ? err.message : undefined);
    } finally {
      setFollowPendingStudentIds((current) => {
        const next = new Set(current);
        next.delete(studentId);
        return next;
      });
    }
  }, [followPendingStudentIds, followedStudentIds]);

  const handlePasteImages = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (newType !== "chat") return;
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length === 0) return;
    event.preventDefault();
    if (newAttachments.length + imageFiles.length > 6) {
      toast.error("每条聊天记录最多上传 6 张图片");
      return;
    }
    setUploadingImages(true);
    try {
      const uploaded = await Promise.all(imageFiles.map(uploadFile));
      setNewAttachments((current) => [
        ...current,
        ...uploaded.map((file) => ({
          id: file.id,
          name: file.originalName,
          url: file.url,
          mimeType: file.mimeType,
          size: file.size,
        })),
      ]);
    } catch (err) {
      toast.error("图片上传失败", err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingImages(false);
    }
  };

  // 最近态度
  const latestAttitude = useMemo(() => {
    const attitudes = interactions.filter((i) => i.type === "attitude");
    return attitudes.length > 0 ? attitudes[0] : null;
  }, [interactions]);

  // 最近状态
  const latestStatus = useMemo(() => {
    const statuses = interactions.filter((i) => i.type === "status");
    return statuses.length > 0 ? statuses[0] : null;
  }, [interactions]);

  // 聊天记录
  const chats = useMemo(() => {
    return interactions.filter((i) => i.type === "chat");
  }, [interactions]);

  const handleSubmit = async () => {
    if (!teacher || !selectedStudentId) return;
    if (!newContent.trim() && (newType !== "chat" || newAttachments.length === 0)) {
      toast.error(newType === "chat" ? "请输入内容或粘贴图片" : "请输入内容");
      return;
    }
    if (uploadingImages) {
      toast.error("图片仍在上传，请稍后提交");
      return;
    }
    setSubmitting(true);
    try {
      await studentInteractionService.createInteraction(
        teacher.id,
        teacher.schoolId!,
        {
          studentId: selectedStudentId,
          type: newType,
          content: newContent.trim(),
          attachments: newType === "chat" ? newAttachments : undefined,
          attitude: newType === "attitude" ? parseInt(newAttitude) : undefined,
          statusTag: newType === "status" ? newStatusTag : undefined,
          shareWithHomeroom,
        },
      );
      setNewContent("");
      setNewAttachments([]);
      setShareWithHomeroom(false);
      toast.success("记录已添加");
      loadInteractions();
    } catch (err) {
      toast.error("添加失败", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await studentInteractionService.deleteInteraction(id);
      toast.success("已删除");
      loadInteractions();
    } catch (err) {
      toast.error("删除失败");
    }
  };

  const getAttitudeOption = (value?: number) => {
    return attitudeOptions.find((a) => parseInt(a.value) === value);
  };

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="师生互动"
          description="记录学生学习态度、状态和互动情况，关注每位学生成长"
          icon={<MessagesSquare className="w-5 h-5" />}
        />
      )}

      <ResizableSplitPane
        storageKey="inteschool:my-students-sidebar-width"
        className="h-[calc(100vh-12rem)]"
        sidebarClassName="h-full"
        contentClassName="h-full"
        sidebar={
          <Card className="h-full flex flex-col">
            <div className="p-3 border-b border-ink-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索学生..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-paper text-sm focus:outline-none focus:border-gold-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 text-center text-xs text-ink-400">
                  <div className="inline-block w-6 h-6 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mb-2" />
                  <div>加载中...</div>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-400">暂无学生</div>
              ) : (
                <div className="px-3 py-2 space-y-3">
                  {studentGroups.map((group) => {
                    const expanded = expandedGroupIds.has(group.id);
                    const groupContentId = `student-group-${group.id}`;
                    return (
                      <section key={group.id}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={groupContentId}
                          onClick={() => toggleStudentGroup(group.id)}
                          className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[11px] font-semibold text-gold-700 tracking-wide transition-colors hover:bg-gold-400/10"
                        >
                          {expanded
                            ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                          <GraduationCap className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{group.name}</span>
                          <span className="text-ink-400 font-normal">（{group.students.length}）</span>
                        </button>
                        {expanded && (
                          <div id={groupContentId} className="mt-1 space-y-0.5">
                            {group.students.map((student) => (
                              <StudentListItem
                                key={`${group.id}-${student.id}`}
                                student={student}
                                isSelected={selectedStudentId === student.id}
                                isFollowed={followedStudentIds.has(student.id)}
                                followPending={followPendingStudentIds.has(student.id)}
                                lastInteraction={lastInteractionMap[student.id]}
                                onClick={() => setSelectedStudentId(student.id)}
                                onToggleFollow={() => void handleToggleFollow(student.id)}
                              />
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        }
      >
          {selectedStudent ? (
            <div className="h-full flex flex-col gap-4">
              {/* 学生信息卡片 */}
              <Card className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 flex items-center justify-center text-xl font-medium text-ink-900">
                    {selectedStudent.name.slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <div className="text-lg font-serif font-semibold text-ink-900">
                      {selectedStudent.name}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      学号：{selectedStudent.studentNo || "未设置"} · 班级：{selectedStudent.classId ? (classMap[selectedStudent.classId]?.name || "未知") : "未分班"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {latestAttitude && (
                      <div className="text-center">
                        <div className="text-[11px] text-ink-400 mb-1">最近态度</div>
                        <Badge variant="gold">
                          {getAttitudeOption(latestAttitude.attitude)?.label || "未知"}
                        </Badge>
                      </div>
                    )}
                    {latestStatus && (
                      <div className="text-center">
                        <div className="text-[11px] text-ink-400 mb-1">最近状态</div>
                        <Badge variant="teal">{latestStatus.statusTag}</Badge>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* 新增记录 */}
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-ink-200 p-0.5">
                      <button
                        onClick={() => setNewType("chat")}
                        className={cn(
                          "px-3 py-1 text-xs rounded transition-colors flex items-center gap-1",
                          newType === "chat" ? "bg-ink-900 text-paper" : "text-ink-600",
                        )}
                      >
                        <MessageCircle className="w-3 h-3" />
                        聊天记录
                      </button>
                      <button
                        onClick={() => {
                          setNewType("attitude");
                          setNewAttachments([]);
                        }}
                        className={cn(
                          "px-3 py-1 text-xs rounded transition-colors flex items-center gap-1",
                          newType === "attitude" ? "bg-ink-900 text-paper" : "text-ink-600",
                        )}
                      >
                        <Star className="w-3 h-3" />
                        学习态度
                      </button>
                      <button
                        onClick={() => {
                          setNewType("status");
                          setNewAttachments([]);
                        }}
                        className={cn(
                          "px-3 py-1 text-xs rounded transition-colors flex items-center gap-1",
                          newType === "status" ? "bg-ink-900 text-paper" : "text-ink-600",
                        )}
                      >
                        <TrendingUp className="w-3 h-3" />
                        学习状态
                      </button>
                    </div>
                  </div>

                  {newType === "attitude" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-600">态度评分：</span>
                      {attitudeOptions.map((opt) => {
                        const Icon = opt.icon;
                        const selected = newAttitude === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setNewAttitude(opt.value)}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors",
                              selected
                                ? "border-gold-400 bg-gold-50"
                                : "border-ink-200 hover:border-ink-300",
                            )}
                          >
                            <Icon className={cn("w-3.5 h-3.5", opt.color)} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {newType === "status" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-600">状态标签：</span>
                      <Select
                        value={newStatusTag}
                        onChange={(e) => setNewStatusTag(e.target.value)}
                        options={statusTagOptions.map((s) => ({ value: s, label: s }))}
                        className="w-40"
                      />
                    </div>
                  )}

                  <Textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    onPaste={(event) => void handlePasteImages(event)}
                    placeholder={
                      newType === "chat"
                        ? "记录本次与学生交流的内容..."
                        : newType === "attitude"
                          ? "记录学生学习态度的具体表现..."
                          : "记录学生学习状态的观察..."
                    }
                    rows={3}
                  />

                  {newType === "chat" && (
                    <div className="space-y-2">
                      <div className="text-[11px] text-ink-400">
                        可直接在输入框粘贴截图或图片，最多 6 张
                        {uploadingImages ? " · 正在上传..." : ""}
                      </div>
                      {newAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {newAttachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="group relative overflow-hidden rounded-md border border-ink-100 bg-mist"
                            >
                              <img
                                src={attachment.url}
                                alt={attachment.name}
                                className="h-20 w-24 object-cover"
                              />
                              <button
                                type="button"
                                className="absolute right-1 top-1 rounded bg-ink-950/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                                onClick={() => setNewAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                                aria-label={`移除 ${attachment.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-4">
                    <label className="inline-flex items-start gap-2 text-xs text-ink-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={shareWithHomeroom}
                        onChange={(event) => setShareWithHomeroom(event.target.checked)}
                        className="mt-0.5 rounded border-ink-300 text-gold-600 focus:ring-gold-400"
                      />
                      <span>
                        <span className="font-medium text-ink-700">分享记录</span>
                        <span className="block text-[11px] text-ink-400 mt-0.5">
                          勾选后匿名同步给该学生的班主任
                        </span>
                      </span>
                    </label>
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={handleSubmit}
                      loading={submitting}
                      disabled={uploadingImages || (!newContent.trim() && (newType !== "chat" || newAttachments.length === 0))}
                    >
                      <Plus className="w-4 h-4" />
                      添加记录
                    </Button>
                  </div>
                </div>
              </Card>

              {/* 互动时间线 */}
              <Card className="flex-1 p-4 overflow-auto">
                <div className="text-sm font-medium text-ink-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-ink-400" />
                  互动记录时间线（{interactions.length} 条）
                </div>

                {interactions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-ink-400">
                    暂无互动记录，开始添加第一条吧
                  </div>
                ) : (
                  <div className="space-y-3">
                    {interactions.map((it) => {
                      const opt = getAttitudeOption(it.attitude);
                      const AttIcon = opt?.icon;
                      return (
                        <div
                          key={it.id}
                          className="relative pl-6 pb-3 border-l-2 border-ink-100 last:border-l-transparent"
                        >
                          <div className={cn(
                            "absolute -left-2 top-0 w-3 h-3 rounded-full border-2 border-paper",
                            it.type === "chat" ? "bg-gold-400"
                              : it.type === "attitude" ? "bg-teal-400"
                                : "bg-emerald-400",
                          )} />
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={
                              it.type === "chat" ? "gold"
                                : it.type === "attitude" ? "teal"
                                  : "green"
                            }>
                              {it.type === "chat" ? "聊天" : it.type === "attitude" ? "态度" : "状态"}
                            </Badge>
                            {it.type === "attitude" && opt && AttIcon && (
                              <span className={cn("flex items-center gap-1 text-xs", opt.color)}>
                                <AttIcon className="w-3 h-3" />
                                {opt.label}
                              </span>
                            )}
                            {it.type === "status" && it.statusTag && (
                              <span className="text-xs text-emerald-600">{it.statusTag}</span>
                            )}
                            {it.isAnonymous ? (
                              <Badge variant="ink">匿名分享</Badge>
                            ) : it.sharedWithHomeroom ? (
                              <Badge variant="amber">已分享给班主任</Badge>
                            ) : null}
                            <span className="text-[11px] text-ink-400 ml-auto">{timeAgo(it.createdAt)}</span>
                            {it.canDelete && (
                              <button
                                onClick={() => handleDelete(it.id)}
                                className="p-1 rounded text-ink-300 hover:text-red-500"
                                title="删除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                          {(it.content || (it.attachments?.length || 0) > 0) && (
                            <div className="text-sm text-ink-700 leading-relaxed bg-mist/40 p-2 rounded">
                              {it.content && <div>{it.content}</div>}
                              {(it.attachments?.length || 0) > 0 && (
                                <div className={cn("flex flex-wrap gap-2", it.content && "mt-2")}>
                                  {it.attachments?.map((attachment) => (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded-md border border-ink-100 bg-paper"
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
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center">
                <MessagesSquare className="w-12 h-12 mx-auto text-ink-300 mb-3" />
                <div className="text-sm text-ink-500">请从左侧选择一位学生</div>
              </div>
            </Card>
          )}
      </ResizableSplitPane>
    </div>
  );
}

// 学生列表项
function StudentListItem({
  student,
  isSelected,
  isFollowed,
  followPending,
  lastInteraction,
  onClick,
  onToggleFollow,
}: {
  student: Student;
  isSelected: boolean;
  isFollowed: boolean;
  followPending: boolean;
  lastInteraction?: string;
  onClick: () => void;
  onToggleFollow: () => void;
}) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors",
        isSelected
          ? "bg-gold-50 ring-1 ring-gold-300"
          : "hover:bg-mist",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={student.name}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0",
          isSelected ? "bg-gold-200 text-gold-800" : "bg-mist text-ink-600",
        )}>
          {student.name.slice(0, 1)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-ink-900 truncate">{student.name}</span>
          </div>
          <div className="text-[10px] text-ink-400 flex items-center gap-1">
            {lastInteraction ? (
              <>
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(lastInteraction)}
              </>
            ) : (
              <span className="text-amber-500">未互动</span>
            )}
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleFollow}
        disabled={followPending}
        aria-label={isFollowed ? `取消关注${student.name}` : `关注${student.name}`}
        title={isFollowed ? "取消关注" : "关注"}
        className={cn(
          "flex-shrink-0 rounded p-1 transition-colors disabled:opacity-50",
          isFollowed ? "text-gold-600" : "text-ink-300 hover:text-gold-500",
        )}
      >
        <Star className={cn("h-4 w-4", isFollowed && "fill-current")} />
      </button>
    </div>
  );
}

export default StudentInteractionPage;
