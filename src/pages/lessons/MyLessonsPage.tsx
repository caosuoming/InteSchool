import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Plus, Search, Trash2, Send,
  FileSpreadsheet, FileText, Edit3, Clock,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import { lessonCoursewareService } from "@/services/lessonCourseware";
import type { LessonCourseware } from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";

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
  const { teacher } = useAuthStore();
  const [coursewares, setCoursewares] = useState<LessonCourseware[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const loadData = async () => {
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
  };

  useEffect(() => {
    loadData();
  }, [teacher, keyword, statusFilter, sourceFilter]);

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
    manual: "手动创建",
  };

  const SourceIcon = cw => cw.sourceType === "examPaper" ? FileSpreadsheet : cw.sourceType === "lecture" ? FileText : BookOpen;

  return (
    <div>
      <PageHeader
        title="我的上课"
        description="制作上课课件，支持试卷讲题和讲义授课，一键推送到教室一体机"
        icon={<BookOpen className="w-5 h-5" />}
      />

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
              { value: "manual", label: "手动创建" },
            ]}
            className="w-32"
          />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="gold" onClick={() => {}}>
              <Plus className="w-4 h-4" />
              新建课件
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
            在试卷库或讲义库中点击「添加到上课」即可创建上课课件
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
                      onClick={() => handlePublish(cw)}
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
