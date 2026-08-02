import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  Library, FileText, GraduationCap, ShoppingBasket, FileUp, Plus,
  Clock, ArrowRight, TrendingUp, BookOpen, CheckCircle2, FileQuestion,
  Users, Calendar, X, AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { questionService } from "@/services/question";
import { lectureService } from "@/services/lecture";
import { classService } from "@/services/class";
import { basketService } from "@/services/basket";
import { aiService } from "@/services/ai";
import { prepService, taskTypeLabels, taskStatusLabels } from "@/services/prep";
import { shareService } from "@/services/share";
import { toast } from "@/stores/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { timeAgo } from "@/lib/service-utils";
import type {
  Question,
  Lecture,
  Basket,
  DocumentRecord,
  PlatformResourceCorrection,
  PrepTask,
  PrepTaskType,
} from "@/types";
import { cn } from "@/lib/utils";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { canManageSchoolRoster } from "@/lib/roster-permissions";

interface Stats {
  questions: Question[];
  lectures: Lecture[];
  baskets: Basket[];
  documents: DocumentRecord[];
  schoolClassCount: number;
  personalClassCount: number;
}

export default function DashboardPage() {
  const { teacher } = useAuthStore();
  const { gradeOptions } = useSchoolResourceOptions(teacher?.schoolId);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [correctionTodos, setCorrectionTodos] = useState<PlatformResourceCorrection[]>([]);
  const [prepTasks, setPrepTasks] = useState<PrepTask[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    grade: "",
    subject: "",
    workflows: [] as { type: PrepTaskType; name: string; description?: string }[],
  });

  useEffect(() => {
    const load = async () => {
      if (!teacher) return;
      const [questions, lectures, baskets, documents, schoolClasses, personalClasses, corrections] =
        await Promise.all([
          questionService.listQuestions({ teacherId: teacher.id }),
          lectureService.listLectures({ teacherId: teacher.id }),
          basketService.listBaskets(teacher.id),
          aiService.listDocuments(teacher.id),
          classService.listSchoolClasses(teacher.schoolId!),
          classService.listPersonalClasses(teacher.id),
          shareService.listCorrectionTodos(teacher.id),
        ]);
      setStats({
        questions,
        lectures,
        baskets,
        documents,
        schoolClassCount: schoolClasses.length,
        personalClassCount: personalClasses.length,
      });
      setCorrectionTodos(corrections);
      setLoading(false);
    };
    load();
  }, [teacher]);

  useEffect(() => {
    const loadPrepTasks = async () => {
      if (!teacher?.schoolId) return;
      setPrepLoading(true);
      try {
        const tasks = await prepService.listTasks(teacher.schoolId, teacher.id);
        setPrepTasks(tasks);
      } catch {
        toast.error("获取备课任务失败");
      } finally {
        setPrepLoading(false);
      }
    };
    loadPrepTasks();
  }, [teacher]);

  const isGroupLeader = teacher?.roles.includes("prepLeader") || teacher?.roles.includes("subjectLeader");

  const subjectOptions = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治"];
  const workflowTypeOptions: { type: PrepTaskType; label: string }[] = [
    { type: "paper", label: "出试卷" },
    { type: "lecture", label: "编讲义" },
    { type: "exercise", label: "设计练习" },
    { type: "review", label: "复习计划" },
  ];

  const addWorkflow = (type: PrepTaskType) => {
    const existing = formData.workflows.find((w) => w.type === type);
    if (existing) {
      toast.warning("该流程已添加");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      workflows: [...prev.workflows, { type, name: taskTypeLabels[type] }],
    }));
  };

  const removeWorkflow = (type: PrepTaskType) => {
    setFormData((prev) => ({
      ...prev,
      workflows: prev.workflows.filter((w) => w.type !== type),
    }));
  };

  const handleCreateTask = async () => {
    if (!formData.title || !formData.grade || !formData.subject || formData.workflows.length === 0) {
      toast.warning("请填写完整信息");
      return;
    }
    try {
      await prepService.createTask(
        teacher!.schoolId!,
        teacher!.subjectGroupIds[0] || "",
        {
          title: formData.title,
          description: formData.description || undefined,
          grade: formData.grade,
          subject: formData.subject,
          workflows: formData.workflows,
        },
        teacher!.id,
      );
      toast.success("创建备课任务成功");
      setShowCreateModal(false);
      setFormData({ title: "", description: "", grade: "", subject: "", workflows: [] });
      const tasks = await prepService.listTasks(teacher!.schoolId!, teacher!.id);
      setPrepTasks(tasks);
    } catch {
      toast.error("创建备课任务失败");
    }
  };

  if (!teacher) return null;

  const activeAffiliation = teacher.affiliations.find(
    (item) => item.id === teacher.currentAffiliationId,
  ) || teacher.affiliations.find((item) => item.isCurrent);
  const schoolName = activeAffiliation?.schoolName || "未认证学校";
  const canManageRoster = canManageSchoolRoster(teacher, activeAffiliation);
  const weekStart = new Date();
  const daysSinceMonday = (weekStart.getDay() + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  const changedThisWeek = (timestamp?: string) =>
    Boolean(timestamp && new Date(timestamp).getTime() >= weekStart.getTime());
  const weeklyActivity = {
    questions: stats?.questions.filter((item) => changedThisWeek(item.createdAt)).length ?? 0,
    lectures: stats?.lectures.filter((item) => changedThisWeek(item.updatedAt)).length ?? 0,
    documents: stats?.documents.filter((item) => changedThisWeek(item.createdAt)).length ?? 0,
    baskets: stats?.baskets.filter((item) => changedThisWeek(item.updatedAt || item.createdAt)).length ?? 0,
  };
  const pendingDocumentCount = stats?.documents.filter((document) => document.status === "recognized").length ?? 0;
  const draftLectureCount = stats?.lectures.filter((lecture) => lecture.status === "draft").length ?? 0;
  const todoCount = pendingDocumentCount + draftLectureCount + correctionTodos.length;

  const cards = [
    {
      label: "题库总量",
      value: stats?.questions.length ?? 0,
      icon: Library,
      color: "text-gold-600",
      bg: "bg-gold-50",
      link: "/question-bank",
    },
    {
      label: "讲义数量",
      value: stats?.lectures.length ?? 0,
      icon: FileText,
      color: "text-teal-600",
      bg: "bg-teal-50",
      link: "/lectures",
    },
    {
      label: "试题篮",
      value: stats?.baskets.length ?? 0,
      icon: ShoppingBasket,
      color: "text-ink-700",
      bg: "bg-ink-100",
      link: "/baskets",
    },
    {
      label: "班级数量",
      value: (stats?.schoolClassCount ?? 0) + (stats?.personalClassCount ?? 0),
      icon: GraduationCap,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      link: canManageRoster ? "/admin/classes" : "/my-students",
    },
  ];

  const quickActions = [
    { label: "导入文档", desc: "AI 识别题目入库", icon: FileUp, link: "/import" },
    { label: "新建讲义", desc: "组题生成讲义", icon: FileText, link: "/lectures/new" },
    { label: "题库管理", desc: "查看与编辑题目", icon: Library, link: "/question-bank" },
    { label: "新建试题篮", desc: "整理候选题目", icon: ShoppingBasket, link: "/baskets" },
  ];

  return (
    <div>
      <PageHeader
        title={`欢迎回来，${teacher.name}老师`}
        description={`${teacher.subject}学科 · ${schoolName} · 工号 ${teacher.employeeNo || "未填写"}`}
        icon={<BookOpen className="w-5 h-5" />}
        action={
          <Link to="/import">
            <Button variant="gold">
              <FileUp className="w-4 h-4" />
              导入文档
            </Button>
          </Link>
        }
      />

      {loading || !stats ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={24} />
        </div>
      ) : (
        <div className="space-y-6 animate-slide-up">
          {/* 数据卡片 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link key={c.label} to={c.link}>
                  <Card hoverable className="relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs text-ink-500 mb-1">{c.label}</div>
                        <div className="font-serif text-3xl font-bold text-ink-900">{c.value}</div>
                      </div>
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.bg)}>
                        <Icon className={cn("w-5 h-5", c.color)} />
                      </div>
                    </div>
                    <div className="absolute right-0 bottom-0 opacity-5">
                      <Icon className="w-24 h-24" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* 待办与最近讲义 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 待办列表 */}
              <Card>
                <CardHeader
                  title="待办事项"
                  action={
                    <span className="tag-red">
                      {todoCount} 项待处理
                    </span>
                  }
                />
                <div className="space-y-2">
                  {correctionTodos.map((correction) => (
                    <Link
                      key={correction.id}
                      to={`/platform-resources?edit=${encodeURIComponent(correction.donationId)}&correction=${encodeURIComponent(correction.id)}`}
                      className="flex items-center gap-3 p-3 rounded-md hover:bg-mist transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-md bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-900 truncate">{correction.resourceTitle}</div>
                        <div className="text-xs text-ink-500 truncate">
                          平台资源纠错 · {correction.reporterNickname}：{correction.message || `上传了 ${correction.attachments.length} 张图片`}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-gold-600 transition-colors" />
                    </Link>
                  ))}
                  {stats.documents.filter((d) => d.status === "recognized").length > 0 ? (
                    stats.documents
                      .filter((d) => d.status === "recognized")
                      .map((doc) => (
                        <Link
                          key={doc.id}
                          to="/import"
                          className="flex items-center gap-3 p-3 rounded-md hover:bg-mist transition-colors group"
                        >
                          <div className="w-8 h-8 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-ink-900 truncate">{doc.fileName}</div>
                            <div className="text-xs text-ink-500">
                              AI 识别完成，等待您确认入库
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-gold-600 transition-colors" />
                        </Link>
                      ))
                  ) : todoCount === 0 ? (
                    <div className="flex items-center gap-3 p-3 text-sm text-ink-500">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      暂无待办事项，一切就绪
                    </div>
                  ) : null}

                  {/* 草稿讲义提醒 */}
                  {stats.lectures.filter((l) => l.status === "draft").map((lec) => (
                    <Link
                      key={lec.id}
                      to={`/lectures/${lec.id}/edit`}
                      className="flex items-center gap-3 p-3 rounded-md hover:bg-mist transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-md bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-900 truncate">{lec.title}</div>
                        <div className="text-xs text-ink-500">草稿 · {timeAgo(lec.updatedAt)}更新</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-gold-600 transition-colors" />
                    </Link>
                  ))}
                </div>
              </Card>

              {/* 最近讲义 */}
              <Card>
                <CardHeader
                  title="最近讲义"
                  action={
                    <Link to="/lectures">
                      <Button variant="ghost" size="sm">
                        查看全部
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  }
                />
                <div className="space-y-2">
                  {stats.lectures.slice(0, 4).map((lec) => (
                    <Link
                      key={lec.id}
                      to={`/lectures/${lec.id}/edit`}
                      className="flex items-start gap-3 p-3 rounded-md hover:bg-mist transition-colors"
                    >
                      <div className="w-8 h-8 rounded-md bg-ink-100 text-ink-600 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-ink-900 truncate">{lec.title}</span>
                          <span className={cn("tag-base", lec.status === "published" ? "tag-green" : "tag-ink")}>
                            {lec.status === "published" ? "已发布" : "草稿"}
                          </span>
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          {lec.grade} · {lec.schoolYear} · {lec.sections.length} 节 · {timeAgo(lec.updatedAt)}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {stats.lectures.length === 0 && (
                    <div className="text-center py-8 text-sm text-ink-400">
                      <FileQuestion className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                      暂无讲义，从快捷入口开始创建
                    </div>
                  )}
                </div>
              </Card>

              {/* 集体备课 */}
              <Card>
                <CardHeader
                  title="集体备课"
                  action={
                    <>
                      {prepLoading && <Spinner size={16} />}
                      {!prepLoading && isGroupLeader && (
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={() => setShowCreateModal(true)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          创建任务
                        </Button>
                      )}
                    </>
                  }
                />
                <div className="space-y-3">
                  {prepLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Spinner size={20} />
                    </div>
                  ) : prepTasks.length > 0 ? (
                    prepTasks.slice(0, 4).map((task) => {
                      const completedWorkflows = task.workflows.filter(
                        (w) => w.status === "completed",
                      ).length;
                      const totalWorkflows = task.workflows.length;
                      const progress = totalWorkflows > 0 ? (completedWorkflows / totalWorkflows) * 100 : 0;

                      return (
                        <div
                          key={task.id}
                          className="p-4 rounded-lg border border-ink-100 hover:border-gold-300 hover:bg-gold-50/20 transition-all"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ink-900">{task.title}</span>
                              <span
                                className={cn(
                                  "tag-base",
                                  task.status === "completed"
                                    ? "tag-green"
                                    : task.status === "in_progress"
                                    ? "tag-amber"
                                    : "tag-ink",
                                )}
                              >
                                {taskStatusLabels[task.status]}
                              </span>
                            </div>
                            <Link to={`/prep/tasks/${task.id}`}>
                              <Button variant="ghost" size="sm">
                                查看详情
                              </Button>
                            </Link>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-ink-500 mb-3">
                            <span>{task.subject} · {task.grade}</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {timeAgo(task.createdAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 bg-ink-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gold-500 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-ink-500 font-medium">
                              {completedWorkflows}/{totalWorkflows}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-sm text-ink-400">
                      <Users className="w-8 h-8 mx-auto mb-2 text-ink-200" />
                      暂无集体备课任务
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* 右侧快捷入口 */}
            <div className="space-y-6">
              <Card>
                <CardHeader title="快捷入口" />
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Link
                        key={a.label}
                        to={a.link}
                        className="p-3 rounded-md border border-ink-100 hover:border-gold-300 hover:bg-gold-50/30 transition-all group"
                      >
                        <Icon className="w-5 h-5 text-gold-600 mb-2" />
                        <div className="text-sm font-medium text-ink-900">{a.label}</div>
                        <div className="text-xs text-ink-500 mt-0.5">{a.desc}</div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card>
                <CardHeader title="本周动态" action={<TrendingUp className="w-4 h-4 text-emerald-500" />} />
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-ink-600">新增题目</span>
                    <span className="font-mono font-semibold text-ink-900">+{weeklyActivity.questions}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-600">讲义更新</span>
                    <span className="font-mono font-semibold text-ink-900">+{weeklyActivity.lectures}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-600">导入文档</span>
                    <span className="font-mono font-semibold text-ink-900">+{weeklyActivity.documents}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-600">试题篮活动</span>
                    <span className="font-mono font-semibold text-ink-900">+{weeklyActivity.baskets}</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* 创建备课任务模态框 */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setFormData({ title: "", description: "", grade: "", subject: "", workflows: [] });
        }}
        title="创建集体备课任务"
        description="填写任务基本信息，添加备课流程"
        size="lg"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">任务标题 *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-paper text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
              placeholder="请输入任务标题"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-paper text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 resize-none"
              rows={3}
              placeholder="请输入任务描述（可选）"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">年级 *</label>
              <select
                value={formData.grade}
                onChange={(e) => setFormData((prev) => ({ ...prev, grade: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-paper text-ink-900 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
              >
                <option value="">请选择年级</option>
                {gradeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">学科 *</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-ink-200 bg-paper text-ink-900 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
              >
                <option value="">请选择学科</option>
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-2">添加流程 *</label>
            <div className="grid grid-cols-2 gap-2">
              {workflowTypeOptions.map((w) => {
                const isAdded = formData.workflows.some((f) => f.type === w.type);
                return (
                  <button
                    key={w.type}
                    onClick={() => (isAdded ? removeWorkflow(w.type) : addWorkflow(w.type))}
                    className={cn(
                      "flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all",
                      isAdded
                        ? "border-gold-500 bg-gold-50 text-gold-700"
                        : "border-ink-200 hover:border-gold-300 hover:bg-gold-50/50 text-ink-700",
                    )}
                  >
                    {isAdded ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {w.label}
                  </button>
                );
              })}
            </div>
            {formData.workflows.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {formData.workflows.map((w) => (
                  <span
                    key={w.type}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gold-50 text-gold-700 text-xs"
                  >
                    {taskTypeLabels[w.type]}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1.5">分配教师</label>
            <div className="flex items-center gap-2 p-3 rounded-lg border border-ink-200 bg-ink-50/50">
              <Users className="w-4 h-4 text-ink-400" />
              <span className="text-sm text-ink-500">任务创建后可在详情页分配教师</span>
            </div>
          </div>
        </div>
        <div slot="footer">
          <Button
            variant="ghost"
            onClick={() => {
              setShowCreateModal(false);
              setFormData({ title: "", description: "", grade: "", subject: "", workflows: [] });
            }}
          >
            取消
          </Button>
          <Button variant="gold" onClick={handleCreateTask}>
            创建任务
          </Button>
        </div>
      </Modal>
    </div>
  );
}
