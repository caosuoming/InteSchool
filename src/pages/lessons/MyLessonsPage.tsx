import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  BookOpen, Plus, Search, Trash2, Send,
  FileSpreadsheet, FileText, Edit3, Clock, Presentation, Users,
  BellRing, CalendarClock, ChevronDown, ChevronUp, ClipboardCheck, Paperclip, X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classroomNoticeService } from "@/services/classroomNotice";
import { uploadFile } from "@/services/api";
import { classService } from "@/services/class";
import type {
  ClassroomHomework,
  ClassroomHomeworkAttachment,
  ClassroomNotice,
  LessonCourseware,
  SchoolClass,
} from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { HomeworkAttachments } from "@/components/homework/HomeworkAttachments";

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function localDateTimeFromIso(value: string): string {
  return localDateTimeValue(new Date(value));
}

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
  const mo = Math.floor(day / 30);
  return `${mo}个月前`;
}

function fileSizeLabel(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

type LessonTab = "notice" | "homework" | "courseware";

export function MyLessonsPage() {
  const navigate = useNavigate();
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const [coursewares, setCoursewares] = useState<LessonCourseware[]>([]);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [notices, setNotices] = useState<ClassroomNotice[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeworkLoading, setHomeworkLoading] = useState(true);
  const [publishingHomework, setPublishingHomework] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [homeworkContent, setHomeworkContent] = useState("");
  const [homeworkFiles, setHomeworkFiles] = useState<File[]>([]);
  const [homeworkDate, setHomeworkDate] = useState(localDateValue);
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeValue(new Date(Date.now() + 30 * 60_000)));
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [noticeContent, setNoticeContent] = useState("");
  const [noticeStartsAt, setNoticeStartsAt] = useState(localDateTimeValue);
  const [noticeEndsAt, setNoticeEndsAt] = useState(() => localDateTimeValue(new Date(Date.now() + 24 * 60 * 60_000)));
  const [selectedNoticeClassIds, setSelectedNoticeClassIds] = useState<string[]>([]);
  const [publishingNotice, setPublishingNotice] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab>("notice");
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [editingHomeworkId, setEditingHomeworkId] = useState<string | null>(null);
  const [homeworkAttachments, setHomeworkAttachments] = useState<ClassroomHomeworkAttachment[]>([]);

  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.id, `${item.grade} · ${item.name}`])),
    [classes],
  );

  const currentNotice = useMemo(() => [...notices].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ))[0], [notices]);

  const currentHomework = useMemo(() => homeworks[0], [homeworks]);

  const loadData = useCallback(async () => {
    if (!teacher?.schoolId) return;
    setLoading(true);
    try {
      const data = await lessonCoursewareService.listCoursewares({
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        keyword: keyword || undefined,
        status: statusFilter === "all" ? undefined : (statusFilter as "draft" | "published"),
      });
      setCoursewares(data.filter((c) => {
        if (sourceFilter === "all") return true;
        return c.sourceType === sourceFilter;
      }));
    } catch (err) {
      toast.error("加载失败", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [keyword, sourceFilter, statusFilter, teacher]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadHomeworkData = useCallback(async () => {
    if (!teacher?.schoolId) return;
    setHomeworkLoading(true);
    try {
      const [classItems, homeworkItems, noticeItems] = await Promise.all([
        classService.listSchoolClasses(teacher.schoolId),
        classroomHomeworkService.listHomeworks({
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
        }),
        classroomNoticeService.listNotices({
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
          activeOnly: true,
        }),
      ]);
      const affiliation = getCurrentAffiliation();
      const assignedClassIds = new Set([
        ...(affiliation?.teachingClassIds || teacher.teachingClassIds || []),
        ...(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []),
      ]);
      const activeClasses = classItems.filter(
        (item) => item.status !== "graduated" && assignedClassIds.has(item.id),
      );
      const preferred = activeClasses.map((item) => item.id);
      setClasses(activeClasses);
      setHomeworks(homeworkItems);
      setNotices(noticeItems);
      setSelectedClassIds((current) => {
        const availableIds = new Set(activeClasses.map((item) => item.id));
        const stillAvailable = current.filter((id) => availableIds.has(id));
        return stillAvailable.length > 0 ? stillAvailable : preferred;
      });
      setSelectedNoticeClassIds((current) => {
        const availableIds = new Set(activeClasses.map((item) => item.id));
        const stillAvailable = current.filter((id) => availableIds.has(id));
        return stillAvailable.length > 0 ? stillAvailable : preferred;
      });
    } catch (err) {
      toast.error("作业信息加载失败", err instanceof Error ? err.message : undefined);
    } finally {
      setHomeworkLoading(false);
    }
  }, [getCurrentAffiliation, teacher]);

  useEffect(() => {
    void loadHomeworkData();
  }, [loadHomeworkData]);

  const toggleHomeworkClass = (classId: string) => {
    setSelectedClassIds((current) => current.includes(classId)
      ? current.filter((id) => id !== classId)
      : [...current, classId]);
  };

  const toggleNoticeClass = (classId: string) => {
    setSelectedNoticeClassIds((current) => current.includes(classId)
      ? current.filter((id) => id !== classId)
      : [...current, classId]);
  };

  const resetNoticeForm = () => {
    setEditingNoticeId(null);
    setNoticeContent("");
    setNoticeStartsAt(localDateTimeValue());
    setNoticeEndsAt(localDateTimeValue(new Date(Date.now() + 24 * 60 * 60_000)));
    setSelectedNoticeClassIds(classes.map((item) => item.id));
  };

  const resetHomeworkForm = () => {
    setEditingHomeworkId(null);
    setHomeworkContent("");
    setHomeworkFiles([]);
    setHomeworkAttachments([]);
    setHomeworkDate(localDateValue());
    setPublishMode("now");
    setScheduledAt(localDateTimeValue(new Date(Date.now() + 30 * 60_000)));
    setSelectedClassIds(classes.map((item) => item.id));
  };

  const handleEditNotice = (notice: ClassroomNotice) => {
    setEditingNoticeId(notice.id);
    setNoticeContent(notice.content);
    setNoticeStartsAt(localDateTimeFromIso(notice.startsAt));
    setNoticeEndsAt(localDateTimeFromIso(notice.endsAt));
    setSelectedNoticeClassIds(notice.classIds);
    setActiveTab("notice");
  };

  const handleEditHomework = (homework: ClassroomHomework) => {
    const scheduled = new Date(homework.publishAt).getTime() > Date.now();
    setEditingHomeworkId(homework.id);
    setHomeworkContent(homework.content);
    setHomeworkFiles([]);
    setHomeworkAttachments(homework.attachments || []);
    setHomeworkDate(homework.assignedDate);
    setPublishMode(scheduled ? "scheduled" : "now");
    setScheduledAt(localDateTimeFromIso(homework.publishAt));
    setSelectedClassIds(homework.classIds);
    setActiveTab("homework");
  };

  const handlePublishNotice = async () => {
    if (!teacher?.schoolId) return;
    if (!noticeContent.trim()) {
      toast.warning("请输入通知内容");
      return;
    }
    if (selectedNoticeClassIds.length === 0) {
      toast.warning("请选择至少一个通知班级");
      return;
    }
    const startsAt = new Date(noticeStartsAt);
    const endsAt = new Date(noticeEndsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      toast.warning("请选择有效的通知起止时间");
      return;
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      toast.warning("通知结束时间必须晚于开始时间");
      return;
    }

    setPublishingNotice(true);
    try {
      const input = {
        content: noticeContent,
        classIds: selectedNoticeClassIds,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      };
      if (editingNoticeId) {
        await classroomNoticeService.updateNotice(editingNoticeId, teacher.id, teacher.schoolId, input);
        toast.success("通知已更新");
      } else {
        await classroomNoticeService.createNotice(teacher.id, teacher.schoolId, input);
        toast.success("通知已发送");
      }
      resetNoticeForm();
      await loadHomeworkData();
    } catch (err) {
      toast.error("通知发送失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishingNotice(false);
    }
  };

  const handlePublishHomework = async () => {
    if (!teacher?.schoolId) return;
    if (!homeworkContent.trim() && homeworkFiles.length === 0 && homeworkAttachments.length === 0) {
      toast.warning("请输入作业内容或添加附件");
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.warning("请选择至少一个发布班级");
      return;
    }
    const existingHomework = editingHomeworkId
      ? homeworks.find((item) => item.id === editingHomeworkId)
      : undefined;
    const publishAt = publishMode === "now"
      ? new Date(existingHomework?.publishAt || Date.now())
      : new Date(scheduledAt);
    if (Number.isNaN(publishAt.getTime())) {
      toast.warning("请选择有效的发布时间");
      return;
    }
    setPublishingHomework(true);
    try {
      const uploadedFiles = await Promise.all(homeworkFiles.map((file) => uploadFile(file)));
      const input = {
        content: homeworkContent,
        attachments: [...homeworkAttachments, ...uploadedFiles.map((file) => ({
          id: file.id,
          name: file.originalName,
          url: file.url,
          mimeType: file.mimeType,
          size: file.size,
        }))],
        classIds: selectedClassIds,
        assignedDate: homeworkDate,
        publishAt: publishAt.toISOString(),
      };
      if (editingHomeworkId) {
        await classroomHomeworkService.updateHomework(editingHomeworkId, teacher.id, teacher.schoolId, input);
        toast.success("作业已更新");
      } else {
        await classroomHomeworkService.createHomework(teacher.id, teacher.schoolId, input);
        toast.success(publishMode === "now" ? "作业已发布" : "作业已设置定时发布");
      }
      resetHomeworkForm();
      await loadHomeworkData();
    } catch (err) {
      toast.error("作业发布失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishingHomework(false);
    }
  };

  const handleHomeworkFiles = (files: FileList | null) => {
    if (!files) return;
    setHomeworkFiles((current) => {
      const next = [...current];
      for (const file of Array.from(files)) {
        const duplicate = next.some((item) =>
          item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
        if (!duplicate) next.push(file);
      }
      const available = Math.max(0, 8 - homeworkAttachments.length);
      if (next.length > available) toast.warning("作业附件不能超过 8 个");
      return next.slice(0, available);
    });
  };

  const handleDeleteHomework = async (id: string) => {
    if (!confirm("确定删除这条作业？")) return;
    try {
      await classroomHomeworkService.deleteHomework(id);
      toast.success("作业已删除");
      await loadHomeworkData();
    } catch (err) {
      toast.error("删除失败", err instanceof Error ? err.message : undefined);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除此课件？")) return;
    try {
      await lessonCoursewareService.deleteCourseware(id);
      toast.success("已删除");
      loadData();
    } catch (err) {
      toast.error("删除失败", err instanceof Error ? err.message : undefined);
    }
  };

  const handlePublish = async (cw: LessonCourseware) => {
    try {
      await lessonCoursewareService.publishCourseware(cw.id);
      toast.success("已发布", "课件已推送到上课应用");
      loadData();
    } catch (err) {
      toast.error("发布失败", err instanceof Error ? err.message : undefined);
    }
  };

  const handleUnpublish = async (cw: LessonCourseware) => {
    try {
      await lessonCoursewareService.unpublishCourseware(cw.id);
      toast.success("已撤回");
      loadData();
    } catch (err) {
      toast.error("操作失败", err instanceof Error ? err.message : undefined);
    }
  };

  const sourceLabel: Record<string, string> = {
    examPaper: "试卷来源",
    lecture: "讲义来源",
    courseware: "课件库来源",
    manual: "手动创建",
  };

  const SourceIcon = (cw: LessonCourseware) => cw.sourceType === "examPaper"
    ? FileSpreadsheet
    : cw.sourceType === "lecture"
      ? FileText
      : cw.sourceType === "courseware"
        ? Presentation
        : BookOpen;

  return (
    <div>
      <PageHeader
        title="我的上课"
        description="制作上课课件，支持试卷讲题和讲义授课，一键推送到教室一体机"
        icon={<BookOpen className="w-5 h-5" />}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex min-h-52 flex-col p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-ink-900">当前班级通知</div>
              <div className="text-xs text-ink-400">当前正在班级上课页展示</div>
            </div>
          </div>
          {currentNotice ? (
            <>
              <div className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-6 text-ink-800">
                {currentNotice.content}
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-4">
                <div className="text-xs text-ink-500">
                  <div>{currentNotice.classIds.map((id) => classNames.get(id) || id).join("、")}</div>
                  <div className="mt-1">展示至 {new Date(currentNotice.endsAt).toLocaleString("zh-CN", { hour12: false })}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleEditNotice(currentNotice)}>
                  <Edit3 className="h-3.5 w-3.5" />编辑通知
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <div className="text-sm text-ink-500">当前没有正在展示的班级通知</div>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setActiveTab("notice")}>
                <Plus className="h-3.5 w-3.5" />发布通知
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex min-h-52 flex-col p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-ink-900">当前班级作业</div>
              <div className="text-xs text-ink-400">最近一次发布或安排的作业</div>
            </div>
          </div>
          {currentHomework ? (
            <>
              <div className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-6 text-ink-800">
                {currentHomework.content || `包含 ${currentHomework.attachments?.length || 0} 个附件`}
              </div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-4">
                <div className="text-xs text-ink-500">
                  <div>{currentHomework.classIds.map((id) => classNames.get(id) || id).join("、")}</div>
                  <div className="mt-1">作业日期 {currentHomework.assignedDate}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleEditHomework(currentHomework)}>
                  <Edit3 className="h-3.5 w-3.5" />编辑作业
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <div className="text-sm text-ink-500">尚未发布班级作业</div>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setActiveTab("homework")}>
                <Plus className="h-3.5 w-3.5" />布置作业
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-4 p-2">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="我的上课内容">
          {([
            ["notice", "班级通知", BellRing],
            ["homework", "布置作业", ClipboardCheck],
            ["courseware", "我的课件", Presentation],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === value
                  ? "bg-ink-900 text-white shadow-sm"
                  : "text-ink-600 hover:bg-mist hover:text-ink-900"
              }`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </Card>

      {activeTab === "notice" && <Card className="p-5 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-700">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-ink-900">班级通知</div>
            <p className="mt-1 text-xs text-ink-500">通知将在设定时间内显示于所选班级“我要上课”页面顶部。</p>
          </div>
        </div>

        <Textarea
          label="通知内容"
          value={noticeContent}
          onChange={(event) => setNoticeContent(event.target.value)}
          placeholder="例如：今天第八节课后进行教室卫生检查，请各组提前完成整理。"
          maxLength={500}
          className="min-h-24"
        />

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_0.7fr_0.7fr]">
          <div>
            <div className="mb-1.5 text-sm font-medium text-ink-700">通知班级</div>
            <div className="flex min-h-11 flex-wrap gap-2 rounded-lg border border-ink-200 bg-mist/60 p-2">
              {homeworkLoading ? (
                <span className="px-1 py-1 text-xs text-ink-400">班级加载中...</span>
              ) : classes.length === 0 ? (
                <span className="px-1 py-1 text-xs text-ink-400">暂无任教班级</span>
              ) : classes.map((item) => (
                <label
                  key={item.id}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-ink-150 bg-paper px-2.5 py-1.5 text-xs text-ink-700 hover:border-gold-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedNoticeClassIds.includes(item.id)}
                    onChange={() => toggleNoticeClass(item.id)}
                    className="accent-amber-500"
                  />
                  {item.grade} · {item.name}
                </label>
              ))}
            </div>
          </div>
          <Input
            label="开始时间"
            type="datetime-local"
            value={noticeStartsAt}
            onChange={(event) => setNoticeStartsAt(event.target.value)}
          />
          <Input
            label="结束时间"
            type="datetime-local"
            value={noticeEndsAt}
            onChange={(event) => setNoticeEndsAt(event.target.value)}
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editingNoticeId && (
            <Button type="button" variant="outline" onClick={resetNoticeForm}>
              取消编辑
            </Button>
          )}
          <Button
            type="button"
            variant="gold"
            loading={publishingNotice}
            disabled={homeworkLoading || classes.length === 0}
            onClick={() => void handlePublishNotice()}
          >
            <Send className="h-4 w-4" />{editingNoticeId ? "保存通知修改" : "发送通知"}
          </Button>
        </div>

        <div className="mt-5 border-t border-ink-100 pt-5">
          <div className="mb-3 text-sm font-medium text-ink-800">当前各班显示内容</div>
          {homeworkLoading ? (
            <div className="py-3 text-xs text-ink-400">加载中...</div>
          ) : classes.length === 0 ? (
            <div className="py-3 text-xs text-ink-400">暂无任教班级。</div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {classes.map((schoolClass) => {
                const classNotices = notices.filter((notice) => notice.classIds.includes(schoolClass.id));
                return (
                  <div key={schoolClass.id} className="rounded-lg border border-ink-100 bg-mist/50 px-3 py-3">
                    <div className="text-xs font-medium text-ink-700">{schoolClass.grade} · {schoolClass.name}</div>
                    {classNotices.length === 0 ? (
                      <div className="mt-2 text-xs text-ink-400">当前无通知</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {classNotices.map((notice) => (
                          <div key={notice.id} className="rounded-md bg-paper px-2.5 py-2 text-sm text-ink-800 shadow-sm">
                            <div className="whitespace-pre-wrap">{notice.content}</div>
                            <div className="mt-1 text-[10px] text-ink-400">
                              至 {new Date(notice.endsAt).toLocaleString("zh-CN", { hour12: false })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>}

      {activeTab === "homework" && <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 text-ink-900 font-semibold">
              <ClipboardCheck className="w-5 h-5 text-gold-600" />
              布置今天的作业
            </div>
            <p className="text-xs text-ink-500 mt-1">发布后，所选班级可从登录页进入“我要上课”查看。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setHistoryOpen((open) => !open)}>
            <CalendarClock className="w-4 h-4" />
            往期作业
            {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
        </div>

        <Textarea
          label="作业内容"
          value={homeworkContent}
          onChange={(event) => setHomeworkContent(event.target.value)}
          placeholder="例如：完成课本第 42 页第 1—6 题，订正今日课堂练习。"
          maxLength={4000}
          className="min-h-28"
        />

        <div className="mt-3 rounded-lg border border-dashed border-ink-200 bg-mist/40 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-700 hover:border-gold-400 hover:text-ink-900">
              <Paperclip className="h-4 w-4" />
              添加图片或文档
              <input
                type="file"
                multiple
                aria-label="选择作业附件"
                accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.docx,.txt,.md"
                className="sr-only"
                disabled={publishingHomework}
                onChange={(event) => {
                  handleHomeworkFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <span className="text-xs text-ink-400">最多 8 个，支持图片、PDF、DOCX、TXT 和 Markdown</span>
          </div>
          {homeworkAttachments.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {homeworkAttachments.map((attachment) => (
                <div key={attachment.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-ink-100 bg-paper px-3 py-2">
                  <FileText className="h-4 w-4 flex-shrink-0 text-gold-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-ink-800">{attachment.name}</div>
                    <div className="text-[10px] text-ink-400">{fileSizeLabel(attachment.size)}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`移除附件 ${attachment.name}`}
                    disabled={publishingHomework}
                    onClick={() => setHomeworkAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                    className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {homeworkFiles.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {homeworkFiles.map((file) => (
                <div
                  key={`${file.name}:${file.size}:${file.lastModified}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-ink-100 bg-paper px-3 py-2"
                >
                  <FileText className="h-4 w-4 flex-shrink-0 text-gold-600" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-ink-800">{file.name}</div>
                    <div className="text-[10px] text-ink-400">{fileSizeLabel(file.size)}</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`移除附件 ${file.name}`}
                    disabled={publishingHomework}
                    onClick={() => setHomeworkFiles((items) => items.filter((item) => item !== file))}
                    className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid xl:grid-cols-[1.4fr_0.6fr_0.7fr] gap-4 mt-4">
          <div>
            <div className="text-sm font-medium text-ink-700 mb-1.5">发布班级</div>
            <div className="min-h-11 rounded-lg border border-ink-200 bg-mist/60 p-2 flex flex-wrap gap-2">
              {homeworkLoading ? (
                <span className="text-xs text-ink-400 px-1 py-1">班级加载中...</span>
              ) : classes.length === 0 ? (
                <span className="text-xs text-ink-400 px-1 py-1">暂无可用班级</span>
              ) : classes.map((item) => (
                <label
                  key={item.id}
                  className="inline-flex items-center gap-2 rounded-md bg-paper border border-ink-150 px-2.5 py-1.5 text-xs text-ink-700 cursor-pointer hover:border-gold-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(item.id)}
                    onChange={() => toggleHomeworkClass(item.id)}
                    className="accent-amber-500"
                  />
                  {item.grade} · {item.name}
                </label>
              ))}
            </div>
          </div>
          <Input
            label="作业日期"
            type="date"
            value={homeworkDate}
            onChange={(event) => setHomeworkDate(event.target.value)}
          />
          <div className="space-y-2">
            <Select
              label="发布时间"
              value={publishMode}
              onChange={(event) => setPublishMode(event.target.value as "now" | "scheduled")}
              options={[
                { value: "now", label: "立刻发布" },
                { value: "scheduled", label: "定时发布" },
              ]}
            />
            {publishMode === "scheduled" && (
              <Input
                aria-label="定时发布时间"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          {editingHomeworkId && (
            <Button type="button" variant="outline" onClick={resetHomeworkForm}>
              取消编辑
            </Button>
          )}
          <Button
            type="button"
            variant="gold"
            loading={publishingHomework}
            disabled={homeworkLoading || classes.length === 0}
            onClick={() => void handlePublishHomework()}
          >
            <Send className="w-4 h-4" />{editingHomeworkId ? "保存作业修改" : "发布作业"}
          </Button>
        </div>

        {historyOpen && (
          <div className="mt-5 pt-5 border-t border-ink-100">
            <div className="text-sm font-medium text-ink-800 mb-3">往期作业</div>
            {homeworkLoading ? (
              <div className="text-xs text-ink-400 py-4">加载中...</div>
            ) : homeworks.length === 0 ? (
              <div className="text-xs text-ink-400 py-4">尚未发布过作业。</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {homeworks.map((homework) => {
                  const scheduled = new Date(homework.publishAt).getTime() > Date.now();
                  return (
                    <div key={homework.id} className="rounded-lg border border-ink-100 bg-mist/50 px-3 py-3 flex gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-ink-500">
                          <Badge variant={scheduled ? "amber" : "green"}>{scheduled ? "待发布" : "已发布"}</Badge>
                          <span>{homework.assignedDate}</span>
                          <span>{homework.classIds.map((id) => classNames.get(id) || id).join("、")}</span>
                          <span>{new Date(homework.publishAt).toLocaleString("zh-CN", { hour12: false })}</span>
                        </div>
                        {homework.content && (
                          <div className="text-sm text-ink-800 whitespace-pre-wrap mt-2">{homework.content}</div>
                        )}
                        <HomeworkAttachments attachments={homework.attachments} className="mt-3" />
                      </div>
                      <button
                        type="button"
                        className="self-start p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600"
                        title="删除作业"
                        onClick={() => void handleDeleteHomework(homework.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>}

      {activeTab === "courseware" && <>
      {/* 筛选栏 */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索课件标题..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-ink-200 bg-paper text-sm focus:outline-none focus:border-gold-400"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "全部状态" },
              { value: "draft", label: "草稿" },
              { value: "published", label: "已发布" },
            ]}
            className="w-32"
          />
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            options={[
              { value: "all", label: "全部来源" },
              { value: "examPaper", label: "试卷来源" },
              { value: "lecture", label: "讲义来源" },
              { value: "courseware", label: "课件库来源" },
              { value: "manual", label: "手动创建" },
            ]}
            className="w-32"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="gold" onClick={() => navigate("/my-resources/coursewares")}>
              <Plus className="w-4 h-4" />
              从课件库添加
            </Button>
          </div>
        </div>
      </Card>

      {/* 课件列表 */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-ink-500 mt-3">加载中...</div>
        </div>
      ) : coursewares.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="w-12 h-12 mx-auto text-ink-300 mb-3" />
          <div className="text-sm text-ink-500 mb-2">暂无上课课件</div>
          <div className="text-xs text-ink-400 mb-4">
            在课件库、试卷库或讲义库中点击「添加到上课」即可创建上课课件
          </div>
          <Button variant="outline" onClick={() => navigate("/my-resources/exam-papers")}>
            去试卷库看看
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coursewares.map((cw) => {
            const Icon = SourceIcon(cw);
            return (
              <Card key={cw.id} className="p-4 hover:shadow-cardHover transition-all group">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gold-50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-gold-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium text-ink-900 truncate cursor-pointer hover:text-gold-700"
                      onClick={() => navigate(`/my-lessons/${cw.id}/edit`)}
                    >
                      {cw.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="ink">{sourceLabel[cw.sourceType]}</Badge>
                      <Badge
                        variant={cw.status === "published" ? "green" : "amber"}
                      >
                        {cw.status === "published" ? "已发布" : "草稿"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-ink-500 space-y-1 mb-3">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {cw.slides.length} 页 · 上次更新 {timeAgo(cw.updatedAt)}
                  </div>
                  {cw.sourceTitle && (
                    <div className="truncate">
                      来源：{cw.sourceTitle}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    {cw.classIds.length > 0 ? `已选择 ${cw.classIds.length} 个班级` : "尚未选择授课班级"}
                  </div>
                </div>

                <div className="flex items-center gap-1 pt-3 border-t border-ink-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/my-lessons/${cw.id}/edit`)}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    编辑课件
                  </Button>
                  {cw.status === "draft" ? (
                    <Button
                      variant="gold"
                      size="sm"
                      onClick={() => cw.classIds.length > 0
                        ? handlePublish(cw)
                        : navigate(`/my-lessons/${cw.id}/edit`)}
                    >
                      <Send className="w-3.5 h-3.5" />
                      发布
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnpublish(cw)}
                    >
                      撤回
                    </Button>
                  )}
                  <button
                    onClick={() => handleDelete(cw.id)}
                    className="p-1.5 rounded text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}

export default MyLessonsPage;
