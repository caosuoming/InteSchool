import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  BookOpen, Plus, Search, Trash2, Send,
  FileSpreadsheet, FileText, Edit3, Clock, Presentation, Users,
  CalendarClock, ChevronDown, ChevronUp, ClipboardCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import { classroomHomeworkService } from "@/services/classroomHomework";
import { classService } from "@/services/class";
import type { ClassroomHomework, LessonCourseware, SchoolClass } from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Textarea } from "@/components/ui/Input";

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateTimeValue(date = new Date(Date.now() + 30 * 60_000)): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
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

export function MyLessonsPage() {
  const navigate = useNavigate();
  const { teacher, getCurrentAffiliation } = useAuthStore();
  const [coursewares, setCoursewares] = useState<LessonCourseware[]>([]);
  const [homeworks, setHomeworks] = useState<ClassroomHomework[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [homeworkLoading, setHomeworkLoading] = useState(true);
  const [publishingHomework, setPublishingHomework] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [homeworkContent, setHomeworkContent] = useState("");
  const [homeworkDate, setHomeworkDate] = useState(localDateValue);
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState(localDateTimeValue);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const classNames = useMemo(
    () => new Map(classes.map((item) => [item.id, `${item.grade} · ${item.name}`])),
    [classes],
  );

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
      const [classItems, homeworkItems] = await Promise.all([
        classService.listSchoolClasses(teacher.schoolId),
        classroomHomeworkService.listHomeworks({
          schoolId: teacher.schoolId,
          teacherId: teacher.id,
        }),
      ]);
      const activeClasses = classItems.filter((item) => item.status !== "graduated");
      setClasses(activeClasses);
      setHomeworks(homeworkItems);
      setSelectedClassIds((current) => {
        const availableIds = new Set(activeClasses.map((item) => item.id));
        const stillAvailable = current.filter((id) => availableIds.has(id));
        if (stillAvailable.length > 0) return stillAvailable;
        const affiliation = getCurrentAffiliation();
        const preferred = [
          ...(affiliation?.teachingClassIds || teacher.teachingClassIds || []),
          ...(affiliation?.homeroomClassIds || teacher.homeroomClassIds || []),
        ].filter((id, index, items) => availableIds.has(id) && items.indexOf(id) === index);
        return preferred.length > 0 ? preferred : activeClasses[0] ? [activeClasses[0].id] : [];
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

  const handlePublishHomework = async () => {
    if (!teacher?.schoolId) return;
    if (!homeworkContent.trim()) {
      toast.warning("请输入作业内容");
      return;
    }
    if (selectedClassIds.length === 0) {
      toast.warning("请选择至少一个发布班级");
      return;
    }
    const publishAt = publishMode === "now" ? new Date() : new Date(scheduledAt);
    if (Number.isNaN(publishAt.getTime())) {
      toast.warning("请选择有效的发布时间");
      return;
    }
    setPublishingHomework(true);
    try {
      await classroomHomeworkService.createHomework(teacher.id, teacher.schoolId, {
        content: homeworkContent,
        classIds: selectedClassIds,
        assignedDate: homeworkDate,
        publishAt: publishAt.toISOString(),
      });
      toast.success(publishMode === "now" ? "作业已发布" : "作业已设置定时发布");
      setHomeworkContent("");
      setPublishMode("now");
      setScheduledAt(localDateTimeValue());
      await loadHomeworkData();
    } catch (err) {
      toast.error("作业发布失败", err instanceof Error ? err.message : undefined);
    } finally {
      setPublishingHomework(false);
    }
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

      <Card className="p-5 mb-4">
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

        <div className="flex justify-end mt-4">
          <Button
            type="button"
            variant="gold"
            loading={publishingHomework}
            disabled={homeworkLoading || classes.length === 0}
            onClick={() => void handlePublishHomework()}
          >
            <Send className="w-4 h-4" />发布作业
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
                        <div className="text-sm text-ink-800 whitespace-pre-wrap mt-2">{homework.content}</div>
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
      </Card>

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
    </div>
  );
}

export default MyLessonsPage;
