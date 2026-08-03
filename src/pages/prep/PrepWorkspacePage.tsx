import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  FilePenLine,
  FileSearch,
  FlaskConical,
  Eye,
  Layers3,
  ListChecks,
  Plus,
  Presentation,
  Sparkles,
  Trash2,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { toast } from "@/stores/ui";
import {
  prepService,
  assignmentStatusLabels,
  taskStatusLabels,
  taskTypeLabels,
} from "@/services/prep";
import { organizationService } from "@/services/organization";
import { useSchoolResourceOptions } from "@/hooks/useSchoolResourceOptions";
import { PageHeader } from "@/components/layout/PageHeader";
import { PrepBoardReviewModal } from "@/pages/prep/PrepBoardReviewModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type {
  AssignmentStatus,
  PrepAssignment,
  PrepTask,
  PrepTaskType,
  PrepWorkflow,
  Teacher,
} from "@/types";

interface TaskTemplate {
  type: PrepTaskType;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface WorkflowDraft {
  id: string;
  type: PrepTaskType;
  name: string;
  description: string;
  assigneeIds: string[];
}

interface BoardForm {
  title: string;
  description: string;
  grade: string;
  subject: string;
  workflows: WorkflowDraft[];
}

interface TodoItem {
  board: PrepTask;
  workflow: PrepWorkflow;
  assignment: PrepAssignment;
}

const taskTemplates: TaskTemplate[] = [
  {
    type: "literatureReview",
    label: "文献综述",
    description: "汇总课程标准、教材研究与教学论文",
    icon: FileSearch,
  },
  {
    type: "examAnalysis",
    label: "试卷分析",
    description: "分析命题结构、得分表现与改进方向",
    icon: FileBarChart,
  },
  {
    type: "research",
    label: "专题研究",
    description: "围绕重点课题开展资料整理与研讨",
    icon: FlaskConical,
  },
  {
    type: "gradeAnalysis",
    label: "学生成绩分析",
    description: "梳理班级与学生层面的成绩变化",
    icon: BarChart3,
  },
  {
    type: "lecture",
    label: "编讲义",
    description: "协作编写课堂讲义、复习材料与学案",
    icon: BookOpen,
  },
  {
    type: "exercise",
    label: "出作业",
    description: "设计分层作业、课后练习与订正任务",
    icon: FilePenLine,
  },
  {
    type: "paper",
    label: "出试卷",
    description: "协同命题、审题并形成正式试卷",
    icon: ClipboardCheck,
  },
  {
    type: "review",
    label: "复习计划",
    description: "制定阶段复习进度与分工安排",
    icon: Presentation,
  },
];

const subjectOptions = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
  "政治",
];

function createEmptyForm(subject = "", grade = ""): BoardForm {
  return {
    title: "",
    description: "",
    grade,
    subject,
    workflows: [],
  };
}

function createDraft(template: TaskTemplate): WorkflowDraft {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: template.type,
    name: template.label,
    description: template.description,
    assigneeIds: [],
  };
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "completed":
      return "green" as const;
    case "in_progress":
      return "gold" as const;
    case "accepted":
      return "teal" as const;
    case "pending":
      return "amber" as const;
    case "rejected":
    case "cancelled":
      return "red" as const;
    default:
      return "ink" as const;
  }
}

function nextAssignmentAction(
  status: AssignmentStatus,
): { label: string; status: AssignmentStatus } | null {
  switch (status) {
    case "pending":
      return { label: "认领", status: "accepted" };
    default:
      return null;
  }
}

export default function PrepWorkspacePage() {
  const { teacher } = useAuthStore();
  const location = useLocation();
  const { gradeOptions } = useSchoolResourceOptions(teacher?.schoolId);
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<"all" | PrepTaskType>("all");
  const [form, setForm] = useState<BoardForm>(() => createEmptyForm());
  const [creating, setCreating] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<
    string | null
  >(null);
  const [reviewTask, setReviewTask] = useState<PrepTask | null>(null);
  const collectiveEntry = new URLSearchParams(location.search).get("entry") === "collective";

  const currentAffiliation = useMemo(() => {
    if (!teacher) return null;
    return (
      teacher.affiliations.find(
        (item) => item.id === teacher.currentAffiliationId,
      ) ||
      teacher.affiliations.find((item) => item.isCurrent) ||
      null
    );
  }, [teacher]);

  const scopedTasks = useMemo(() => {
    if (!collectiveEntry || !teacher) return tasks;
    const prepGroupIds = new Set(
      currentAffiliation?.prepGroupIds?.length
        ? currentAffiliation.prepGroupIds
        : teacher.prepGroupIds,
    );
    const subjectGroupIds = new Set(
      currentAffiliation?.subjectGroupIds?.length
        ? currentAffiliation.subjectGroupIds
        : teacher.subjectGroupIds,
    );
    return tasks.filter((task) => (
      (Boolean(task.prepGroupId) && prepGroupIds.has(task.prepGroupId!))
      || (!task.prepGroupId && subjectGroupIds.has(task.subjectGroupId))
      || task.createdBy === teacher.id
      || task.assignments.some((assignment) => assignment.teacherId === teacher.id)
    ));
  }, [collectiveEntry, currentAffiliation, tasks, teacher]);

  const loadData = useCallback(async () => {
    if (!teacher?.schoolId) return;
    setLoading(true);
    try {
      const [boardList, teacherList] = await Promise.all([
        prepService.listTasks(teacher.schoolId),
        organizationService.listTeachers(teacher.schoolId),
      ]);
      setTasks(boardList);
      setTeachers(teacherList);
    } catch {
      toast.error("加载失败", "集体备课数据暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, [teacher?.schoolId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const teacherNames = useMemo(
    () => new Map(teachers.map((item) => [item.id, item.name])),
    [teachers],
  );

  const myTodos = useMemo<TodoItem[]>(() => {
    if (!teacher) return [];
    const priority: Record<AssignmentStatus, number> = {
      in_progress: 0,
      accepted: 1,
      pending: 2,
      completed: 3,
      rejected: 4,
    };

    return scopedTasks
      .flatMap((board) =>
        board.assignments
          .filter((assignment) => assignment.teacherId === teacher.id)
          .map((assignment) => ({
            board,
            assignment,
            workflow: board.workflows.find(
              (workflow) => workflow.id === assignment.workflowId,
            ),
          })),
      )
      .filter((item): item is TodoItem => Boolean(item.workflow))
      .filter(
        (item) =>
          item.assignment.status !== "completed" &&
          item.assignment.status !== "rejected",
      )
      .sort((a, b) => {
        const statusDifference =
          priority[a.assignment.status] - priority[b.assignment.status];
        if (statusDifference !== 0) return statusDifference;
        return (
          new Date(b.board.updatedAt).getTime() -
          new Date(a.board.updatedAt).getTime()
        );
      });
  }, [scopedTasks, teacher]);

  const visibleTasks = useMemo(() => {
    if (selectedType === "all") return scopedTasks;
    return scopedTasks.filter((task) =>
      task.workflows.some((workflow) => workflow.type === selectedType),
    );
  }, [scopedTasks, selectedType]);

  const activeBoardCount = scopedTasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  ).length;
  const completedWorkflowCount = scopedTasks.reduce(
    (total, task) =>
      total +
      task.workflows.filter((workflow) => workflow.status === "completed")
        .length,
    0,
  );
  const totalWorkflowCount = scopedTasks.reduce(
    (total, task) => total + task.workflows.length,
    0,
  );

  const getTeacherName = (teacherId: string) =>
    teacherNames.get(teacherId) || "未知教师";

  const openCreateModal = (initialType?: PrepTaskType) => {
    const defaultGrade =
      currentAffiliation?.teachingGrades?.[0] ||
      teacher?.teachingGrades?.[0] ||
      "";
    const defaultSubject =
      currentAffiliation?.subject || teacher?.subject || "";
    const nextForm = createEmptyForm(defaultSubject, defaultGrade);
    if (initialType) {
      const template = taskTemplates.find((item) => item.type === initialType);
      if (template) nextForm.workflows = [createDraft(template)];
    }
    setForm(nextForm);
    setShowCreateModal(true);
  };

  const addWorkflowDraft = (type: PrepTaskType) => {
    const template = taskTemplates.find((item) => item.type === type);
    if (!template) return;
    setForm((current) => ({
      ...current,
      workflows: [...current.workflows, createDraft(template)],
    }));
  };

  const updateWorkflowDraft = (
    draftId: string,
    patch: Partial<WorkflowDraft>,
  ) => {
    setForm((current) => ({
      ...current,
      workflows: current.workflows.map((workflow) =>
        workflow.id === draftId ? { ...workflow, ...patch } : workflow,
      ),
    }));
  };

  const removeWorkflowDraft = (draftId: string) => {
    setForm((current) => ({
      ...current,
      workflows: current.workflows.filter(
        (workflow) => workflow.id !== draftId,
      ),
    }));
  };

  const toggleAssignee = (draftId: string, teacherId: string) => {
    const draft = form.workflows.find((workflow) => workflow.id === draftId);
    if (!draft) return;
    const assigneeIds = draft.assigneeIds.includes(teacherId)
      ? draft.assigneeIds.filter((id) => id !== teacherId)
      : [...draft.assigneeIds, teacherId];
    updateWorkflowDraft(draftId, { assigneeIds });
  };

  const handleCreateBoard = async () => {
    if (
      !teacher?.schoolId ||
      !form.title.trim() ||
      !form.grade ||
      !form.subject
    ) {
      toast.warning("请填写看板标题、年级和学科");
      return;
    }
    if (form.workflows.length === 0) {
      toast.warning("请至少添加一项任务");
      return;
    }
    if (
      form.workflows.some(
        (workflow) =>
          !workflow.name.trim() || workflow.assigneeIds.length === 0,
      )
    ) {
      toast.warning("每项任务都需要填写名称并 @ 至少一位教师");
      return;
    }

    setCreating(true);
    try {
      const subjectGroupId =
        currentAffiliation?.subjectGroupIds?.[0] ||
        teacher.subjectGroupIds?.[0] ||
        "";
      const prepGroupId =
        currentAffiliation?.prepGroupIds?.[0] ||
        teacher.prepGroupIds?.[0] ||
        undefined;
      const created = await prepService.createTask(
        teacher.schoolId,
        subjectGroupId,
        {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          grade: form.grade,
          subject: form.subject,
          prepGroupId,
          workflows: form.workflows.map((workflow) => ({
            type: workflow.type,
            name: workflow.name.trim(),
            description: workflow.description.trim() || undefined,
          })),
        },
        teacher.id,
      );

      await Promise.all(
        created.workflows.map((workflow, index) =>
          prepService.assignTask(
            created.id,
            workflow.id,
            form.workflows[index].assigneeIds,
          ),
        ),
      );

      toast.success("看板已创建", "任务已进入被 @ 教师的待办列表");
      setShowCreateModal(false);
      setForm(createEmptyForm());
      await loadData();
    } catch {
      toast.error("创建失败", "请稍后重试");
    } finally {
      setCreating(false);
    }
  };

  const handleAdvanceAssignment = async (assignment: PrepAssignment) => {
    const action = nextAssignmentAction(assignment.status);
    if (!action) return;
    setUpdatingAssignmentId(assignment.id);
    try {
      await prepService.updateAssignment(
        assignment.taskId,
        assignment.id,
        action.status,
      );
      toast.success("状态已更新");
      await loadData();
    } catch {
      toast.error("更新失败", "待办状态暂时无法更新");
    } finally {
      setUpdatingAssignmentId(null);
    }
  };

  if (!teacher) return null;

  return (
    <div>
      <PageHeader
        title={collectiveEntry ? "集体研讨" : "集体备课"}
        description={collectiveEntry
          ? "查看当前备课组的研讨任务、已完成成果与整体进度"
          : "用协作看板拆分教研任务、@ 负责人并跟踪完成进度"}
        icon={<Users className="w-5 h-5" />}
        action={
          <Button variant="gold" onClick={() => openCreateModal()}>
            <Plus className="w-4 h-4" />
            创建看板
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={26} />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px] items-start animate-slide-up">
          <aside className="space-y-4 xl:sticky xl:top-5">
            <Card className="p-4">
              <CardHeader
                title="我的待办"
                subtitle="集体备课计划中 @ 我的任务"
                action={
                  <Badge variant={myTodos.length > 0 ? "amber" : "green"}>
                    {myTodos.length}
                  </Badge>
                }
              />
              <div className="space-y-2.5">
                {myTodos.length > 0 ? (
                  myTodos.map(({ board, workflow, assignment }) => {
                    const action = board.linkedResource
                      ? null
                      : nextAssignmentAction(assignment.status);
                    const linkedEditorPath = board.linkedResource
                      ? board.linkedResource.type === "examPaper"
                        ? `/exam-papers/${board.linkedResource.id}?prepTask=${board.id}`
                        : `/lectures/${board.linkedResource.id}/edit?prepTask=${board.id}`
                      : null;
                    const template = taskTemplates.find(
                      (item) => item.type === workflow.type,
                    );
                    const Icon = template?.icon || ListChecks;
                    return (
                      <div
                        key={assignment.id}
                        className="rounded-lg border border-ink-100 bg-paper p-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink-900 line-clamp-2">
                              {workflow.name}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-ink-500">
                              {board.title}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <Badge
                            variant={statusBadgeVariant(assignment.status)}
                          >
                            {assignmentStatusLabels[assignment.status]}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Link to={`/prep/tasks/${board.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`查看${workflow.name}`}
                              >
                                查看
                              </Button>
                            </Link>
                            {linkedEditorPath && (
                              <Link to={linkedEditorPath}>
                                <Button variant="gold" size="sm">
                                  共同编辑
                                </Button>
                              </Link>
                            )}
                            {action && (
                              <Button
                                variant="gold"
                                size="sm"
                                loading={updatingAssignmentId === assignment.id}
                                onClick={() =>
                                  void handleAdvanceAssignment(assignment)
                                }
                              >
                                {action.label}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                    <div className="text-sm font-medium text-ink-700">
                      当前没有待办
                    </div>
                    <div className="mt-1 text-xs text-ink-400">
                      新的 @ 任务会显示在这里
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </aside>

          <main className="min-w-0 space-y-4">
            <Card className="p-4">
              <CardHeader
                title="协作任务"
                subtitle="选择任务类型，查看相关备课看板"
                action={
                  <span className="text-xs text-ink-500">
                    {visibleTasks.length} 个看板
                  </span>
                }
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {taskTemplates.slice(0, 8).map((template) => {
                  const Icon = template.icon;
                  const active = selectedType === template.type;
                  return (
                    <button
                      key={template.type}
                      type="button"
                      onClick={() =>
                        setSelectedType(active ? "all" : template.type)
                      }
                      className={cn(
                        "rounded-lg border px-3 py-3 text-left transition-all",
                        active
                          ? "border-gold-400 bg-gold-50 shadow-sm"
                          : "border-ink-100 bg-paper hover:border-gold-200 hover:bg-gold-50/30",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mb-2 h-4 w-4",
                          active ? "text-gold-700" : "text-ink-500",
                        )}
                      />
                      <div className="text-sm font-medium text-ink-900">
                        {template.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-400">
                        {
                          scopedTasks.filter((task) =>
                            task.workflows.some(
                              (workflow) => workflow.type === template.type,
                            ),
                          ).length
                        }{" "}
                        项
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>

            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="font-serif text-lg font-semibold text-ink-900">
                  {selectedType === "all"
                    ? collectiveEntry ? "备课组任务列表" : "全部备课看板"
                    : taskTypeLabels[selectedType]}
                </h2>
                <p className="text-xs text-ink-500">
                  按任务进度查看分工和负责人
                </p>
              </div>
              {selectedType !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openCreateModal(selectedType)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建此类任务
                </Button>
              )}
            </div>

            {visibleTasks.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {visibleTasks.map((board) => {
                  const completed = board.workflows.filter(
                    (workflow) => workflow.status === "completed",
                  ).length;
                  const progress =
                    board.workflows.length > 0
                      ? Math.round((completed / board.workflows.length) * 100)
                      : 0;
                  const canPreview = board.assignments.some(
                    (assignment) => assignment.status === "completed" && assignment.submission,
                  );
                  return (
                    <div key={board.id} className="group">
                      <Card hoverable className="h-full p-4 group-hover:border-gold-300">
                        <div className="flex items-start justify-between gap-3">
                          <Link to={`/prep/tasks/${board.id}`} className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-serif text-base font-semibold text-ink-900 line-clamp-1">
                                {board.title}
                              </h3>
                              <Badge variant={statusBadgeVariant(board.status)}>
                                {taskStatusLabels[board.status]}
                              </Badge>
                            </div>
                            <div className="mt-1 text-xs text-ink-500">
                              {board.grade} · {board.subject}
                            </div>
                          </Link>
                          <div className="flex flex-shrink-0 items-center gap-1">
                            {canPreview && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setReviewTask(board)}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                预览成果
                              </Button>
                            )}
                            <Link
                              to={`/prep/tasks/${board.id}`}
                              aria-label={`查看${board.title}详情`}
                              className="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-gold-50 hover:text-gold-600"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </div>
                        </div>

                        {board.description && (
                          <p className="mt-3 line-clamp-2 text-sm leading-5 text-ink-600">
                            {board.description}
                          </p>
                        )}

                        <div className="mt-4 space-y-2">
                          {board.workflows.slice(0, 4).map((workflow) => {
                            const template = taskTemplates.find(
                              (item) => item.type === workflow.type,
                            );
                            const Icon = template?.icon || ListChecks;
                            return (
                              <div
                                key={workflow.id}
                                className="flex items-center gap-2 rounded-md bg-mist/70 px-2.5 py-2"
                              >
                                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-ink-500" />
                                <span className="min-w-0 flex-1 truncate text-xs text-ink-700">
                                  {workflow.name}
                                </span>
                                <div className="flex -space-x-1">
                                  {workflow.assigneeIds
                                    .slice(0, 3)
                                    .map((teacherId) => (
                                      <span
                                        key={teacherId}
                                        title={getTeacherName(teacherId)}
                                        className="flex h-5 w-5 items-center justify-center rounded-full border border-paper bg-ink-800 text-[9px] text-white"
                                      >
                                        {getTeacherName(teacherId).slice(0, 1)}
                                      </span>
                                    ))}
                                </div>
                                <Badge
                                  variant={statusBadgeVariant(workflow.status)}
                                >
                                  {taskStatusLabels[workflow.status]}
                                </Badge>
                              </div>
                            );
                          })}
                          {board.workflows.length > 4 && (
                            <div className="text-center text-xs text-ink-400">
                              另有 {board.workflows.length - 4} 项任务
                            </div>
                          )}
                        </div>

                        <div className="mt-4">
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-ink-500">看板进度</span>
                            <span className="font-medium text-ink-800">
                              {completed}/{board.workflows.length} · {progress}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full bg-gold-500 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed py-14 text-center">
                <Layers3 className="mx-auto mb-3 h-10 w-10 text-ink-200" />
                <div className="text-sm font-medium text-ink-700">
                  暂无相关看板
                </div>
                <div className="mt-1 text-xs text-ink-400">
                  创建看板并添加任务后会显示在这里
                </div>
                <Button
                  className="mt-4"
                  variant="gold"
                  size="sm"
                  onClick={() =>
                    openCreateModal(
                      selectedType === "all" ? undefined : selectedType,
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  创建看板
                </Button>
              </Card>
            )}
          </main>

          <aside className="space-y-4 xl:sticky xl:top-5">
            <Card className="overflow-hidden border-gold-200 bg-gradient-to-br from-gold-50 to-paper p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-gold-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-serif text-lg font-semibold text-ink-900">
                创建看板
              </h2>
              <p className="mt-1 text-sm leading-5 text-ink-600">
                将一次集体备课拆成具体任务，并为每项任务 @ 负责教师。
              </p>
              <Button
                className="mt-4 w-full"
                variant="gold"
                onClick={() => openCreateModal()}
              >
                <Plus className="h-4 w-4" />
                新建备课看板
              </Button>
            </Card>

            <Card className="p-4">
              <CardHeader title="看板概览" subtitle="当前学校的协作进度" />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-mist p-3">
                  <Clock3 className="mb-2 h-4 w-4 text-gold-600" />
                  <div className="font-serif text-2xl font-bold text-ink-900">
                    {activeBoardCount}
                  </div>
                  <div className="text-xs text-ink-500">进行中看板</div>
                </div>
                <div className="rounded-lg bg-mist p-3">
                  <UserRoundCheck className="mb-2 h-4 w-4 text-emerald-600" />
                  <div className="font-serif text-2xl font-bold text-ink-900">
                    {completedWorkflowCount}
                  </div>
                  <div className="text-xs text-ink-500">已完成任务</div>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-ink-100 p-3">
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span>总体任务完成率</span>
                  <span>
                    {totalWorkflowCount > 0
                      ? Math.round(
                          (completedWorkflowCount / totalWorkflowCount) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${totalWorkflowCount > 0 ? (completedWorkflowCount / totalWorkflowCount) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <CardHeader title="协作规则" />
              <div className="space-y-3 text-xs leading-5 text-ink-600">
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] text-white">
                    1
                  </span>
                  <span>创建看板，填写本次备课主题与年级学科。</span>
                </div>
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] text-white">
                    2
                  </span>
                  <span>添加文献综述、试卷分析等任务并 @ 教师。</span>
                </div>
                <div className="flex gap-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-ink-900 text-[10px] text-white">
                    3
                  </span>
                  <span>负责人在“我的待办”中认领、开始并完成任务。</span>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      )}

      {reviewTask && (
        <PrepBoardReviewModal
          open
          onClose={() => setReviewTask(null)}
          task={reviewTask}
          teacher={teacher}
          teacherNames={teacherNames}
          onAnnotationsSaved={loadData}
        />
      )}

      <Modal
        open={showCreateModal}
        onClose={() => {
          if (creating) return;
          setShowCreateModal(false);
        }}
        title="创建集体备课看板"
        description="设置看板信息，添加任务并 @ 具体负责人"
        size="xl"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={creating}
              onClick={() => setShowCreateModal(false)}
            >
              取消
            </Button>
            <Button
              variant="gold"
              loading={creating}
              onClick={() => void handleCreateBoard()}
            >
              创建看板
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
                1
              </span>
              <h3 className="text-sm font-semibold text-ink-900">看板信息</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  看板标题 *
                </span>
                <input
                  aria-label="看板标题"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
                  placeholder="例如：高一数学期中考试集体备课"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  年级 *
                </span>
                <select
                  aria-label="年级"
                  value={form.grade}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      grade: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold-500"
                >
                  <option value="">请选择年级</option>
                  {gradeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  学科 *
                </span>
                <select
                  aria-label="学科"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold-500"
                >
                  <option value="">请选择学科</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  备课说明
                </span>
                <textarea
                  aria-label="备课说明"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
                  placeholder="说明备课目标、范围和交付要求"
                />
              </label>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-900 text-xs text-white">
                2
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink-900">添加任务</h3>
                <p className="text-xs text-ink-500">
                  可重复添加同一类型，每项任务需指定负责人
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {taskTemplates.map((template) => {
                const Icon = template.icon;
                return (
                  <button
                    key={template.type}
                    type="button"
                    onClick={() => addWorkflowDraft(template.type)}
                    className="flex items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:border-gold-300 hover:bg-gold-50"
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 text-gold-600" />
                    <span>{template.label}</span>
                    <Plus className="ml-auto h-3.5 w-3.5 text-ink-400" />
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {form.workflows.length > 0 ? (
                form.workflows.map((workflow, index) => {
                  const template = taskTemplates.find(
                    (item) => item.type === workflow.type,
                  );
                  const Icon = template?.icon || ListChecks;
                  return (
                    <div
                      key={workflow.id}
                      className="rounded-xl border border-ink-100 bg-mist/30 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-paper text-gold-700 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs font-medium text-ink-500">
                              任务 {index + 1} · {taskTypeLabels[workflow.type]}
                            </div>
                            <button
                              type="button"
                              aria-label={`删除任务${index + 1}`}
                              onClick={() => removeWorkflowDraft(workflow.id)}
                              className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <label>
                              <span className="mb-1 block text-xs text-ink-500">
                                任务名称 *
                              </span>
                              <input
                                aria-label={`任务${index + 1}名称`}
                                value={workflow.name}
                                onChange={(event) =>
                                  updateWorkflowDraft(workflow.id, {
                                    name: event.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm outline-none focus:border-gold-500"
                              />
                            </label>
                            <label>
                              <span className="mb-1 block text-xs text-ink-500">
                                任务说明
                              </span>
                              <input
                                aria-label={`任务${index + 1}说明`}
                                value={workflow.description}
                                onChange={(event) =>
                                  updateWorkflowDraft(workflow.id, {
                                    description: event.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-ink-200 bg-paper px-3 py-2 text-sm outline-none focus:border-gold-500"
                              />
                            </label>
                          </div>
                          <div className="mt-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-ink-600">
                                @ 负责人 *
                              </span>
                              <span className="text-xs text-ink-400">
                                已选择 {workflow.assigneeIds.length} 人
                              </span>
                            </div>
                            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
                              {teachers.map((item) => {
                                const checked = workflow.assigneeIds.includes(
                                  item.id,
                                );
                                return (
                                  <label
                                    key={item.id}
                                    className={cn(
                                      "flex cursor-pointer items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs transition-colors",
                                      checked
                                        ? "border-gold-400 bg-gold-50 text-gold-800"
                                        : "border-ink-100 bg-paper text-ink-600 hover:border-gold-200",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      aria-label={`任务${index + 1}指派给${item.name}`}
                                      checked={checked}
                                      onChange={() =>
                                        toggleAssignee(workflow.id, item.id)
                                      }
                                    />
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink-800 text-[9px] text-white">
                                      {item.name.slice(0, 1)}
                                    </span>
                                    <span>{item.name}</span>
                                    {checked && (
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-ink-200 px-4 py-8 text-center">
                  <BookMarked className="mx-auto mb-2 h-8 w-8 text-ink-200" />
                  <div className="text-sm text-ink-500">
                    从上方选择一种任务类型
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </Modal>
    </div>
  );
}
